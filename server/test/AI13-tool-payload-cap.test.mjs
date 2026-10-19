// AI-13 — the tool result the model reads is valid JSON or it is not a tool result.
//
// THE DEFECT. `runAiChat` capped a tool payload with `truncate(JSON.stringify(output), max)`
// — a slice of a JSON document plus an ellipsis. Probed against the 50 000-product perf
// tenant on 2026-10-18 at each tool's own MAXIMUM legal `limit`, FIVE of the nine tools
// exceed the 12 000-character cap:
//
//   getInventoryHistory        24 834 chars   (cut 12 834 characters deep)
//   getReorderNeededProducts   15 550
//   getProductsByLocation      14 207
//   getLowStockProducts        14 109
//   getOutOfStockProducts      14 082
//
// Those arguments are the limits the tool schemas themselves advertise, so "show me the
// last 50 movements" reached the defect with no misbehaviour anywhere. `JSON.parse` of the
// cut text throws — measured, not argued: the probe ran the same slice the service ran.
// A model handed half a document has to guess at the other half, which is the worst input
// for an assistant whose one job is reporting exact numbers.
//
// WHAT THIS SUITE PINS. The cap is applied to the DATA: rows are dropped from the end of
// the longest array until the serialized result fits, the result stays valid JSON, and it
// says what happened. A result that fits is returned BYTE-IDENTICAL to
// `JSON.stringify(output)`, because this module must be invisible on an ordinary turn.
//
// Numbers here are measured sizes from that probe, not invented ones, and the row shapes
// mirror the real tools (a page of rows, a `total`, a `page`).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { capToolResult } from '../src/services/ai/toolPayload.ts';

const CAP = 12000;

/** A row shaped like a transaction the history tool returns, padded to a realistic width. */
function row(i, width = 300) {
  const head = `2026-10-1${i % 10} 0${i % 10}:33 STOCK_OUT Demo Product ${10000 + i} DEMOSKU-${i} Main Warehouse `;
  return { id: `65f${i}`, description: `${head}${'x'.repeat(Math.max(0, width - head.length))}` };
}

/** The history payload that measured 24 834 characters at `limit: 50`. */
const history = {
  rows: Array.from({ length: 50 }, (_, i) => row(i)),
  total: 100096,
  page: 1,
};

describe('a payload that fits is untouched', () => {
  it('★ the serialized result is byte-identical to JSON.stringify — no envelope, no marker', () => {
    const small = { rows: [row(1), row(2)], total: 2, page: 1 };
    assert.equal(capToolResult(small, CAP), JSON.stringify(small));
    assert.equal(capToolResult(small, JSON.stringify(small).length), JSON.stringify(small));
    // The boundary is inclusive: exactly at the cap is not "over" it.
    assert.equal(JSON.parse(capToolResult(small, CAP)).truncated, undefined);
  });
});

describe('a payload over the cap stays parseable and says so', () => {
  it('★ the measured history payload becomes valid JSON instead of a cut document', () => {
    const full = JSON.stringify(history);
    assert.ok(full.length > CAP, 'the fixture itself is over the cap');

    // What the service used to hand the model — the shape of the defect, asserted here so
    // the reason this module exists cannot quietly stop being true.
    const cut = `${full.slice(0, CAP - 1)}…`;
    assert.throws(() => JSON.parse(cut), 'the old payload was unparseable');

    const capped = capToolResult(history, CAP);
    assert.ok(capped.length <= CAP, `capped length ${capped.length} must fit ${CAP}`);
    const parsed = JSON.parse(capped);
    assert.equal(parsed.truncated, true);
    assert.match(parsed.note, /Only \d+ of 50 rows/);
    assert.ok(Array.isArray(parsed.rows));
    assert.ok(parsed.rows.length > 0 && parsed.rows.length < 50);
  });

  it('keeps a PREFIX — the rows the question was about — and never a partial row', () => {
    const capped = capToolResult(history, CAP);
    const parsed = JSON.parse(capped);
    parsed.rows.forEach((kept, i) => {
      assert.deepEqual(kept, history.rows[i], `row ${i} is whole and in order`);
    });
  });

  it('the non-row fields survive, so the model still learns the true total', () => {
    const parsed = JSON.parse(capToolResult(history, CAP));
    assert.equal(parsed.total, 100096);
    assert.equal(parsed.page, 1);
  });

  it('★ the largest prefix is kept, not an arbitrary cut', () => {
    const capped = capToolResult(history, CAP);
    const parsed = JSON.parse(capped);
    const withOneMore = {
      ...history,
      rows: history.rows.slice(0, parsed.rows.length + 1),
      truncated: true,
      note: parsed.note,
    };
    // Adding the next row would not fit — otherwise the search left data on the table.
    assert.ok(JSON.stringify(withOneMore).length > CAP);
  });

  it('shortens the LONGEST array when a result carries more than one', () => {
    const output = {
      rows: Array.from({ length: 3 }, (_, i) => row(i)),
      locations: Array.from({ length: 40 }, (_, i) => row(i)),
    };
    const parsed = JSON.parse(capToolResult(output, 6000));
    assert.equal(parsed.rows.length, 3, 'the small array is untouched');
    assert.ok(parsed.locations.length < 40);
  });
});

describe('a payload that cannot be shortened row by row is still valid JSON', () => {
  it('★ one enormous row becomes a labeled preview, never a cut document', () => {
    const oneHugeRow = { rows: [{ description: 'y'.repeat(30000) }], total: 1 };
    const capped = capToolResult(oneHugeRow, CAP);
    assert.ok(capped.length <= CAP);
    const parsed = JSON.parse(capped);
    assert.equal(parsed.truncated, true);
    assert.equal(typeof parsed.preview, 'string');
    assert.ok(parsed.preview.length > 0);
    assert.match(parsed.note, /too large/);
  });

  it('a bare array and a bare string are handled the same way', () => {
    for (const output of [Array.from({ length: 200 }, (_, i) => row(i)), 'z'.repeat(20000)]) {
      const capped = capToolResult(output, CAP);
      assert.ok(capped.length <= CAP, `length ${capped.length}`);
      const parsed = JSON.parse(capped);
      assert.equal(parsed.truncated, true);
    }
    // A scalar that fits is not an envelope — the same rule as an object that fits.
    assert.equal(capToolResult(42, CAP), '42');
  });

  it('a cap smaller than the envelope still yields JSON rather than a broken document', () => {
    const parsed = JSON.parse(capToolResult(history, 20));
    assert.equal(parsed.truncated, true);
  });
});

describe('the service uses it, and the cut-document path is gone', () => {
  it('★ runAiChat caps through capToolResult rather than truncating the JSON text', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('../src/services/ai/ai.service.ts', import.meta.url), 'utf8');

    assert.match(source, /capToolResult\(output, cfg\.maxToolResultChars\)/);
    assert.doesNotMatch(source, /truncate\(JSON\.stringify\(output\)/);
    // A positive control: the same scan DOES find the old shape when it is put back.
    const mutated = source.replace(
      'capToolResult(output, cfg.maxToolResultChars)',
      'truncate(JSON.stringify(output), cfg.maxToolResultChars)',
    );
    assert.notEqual(mutated, source, 'the replacement landed');
    assert.match(mutated, /truncate\(JSON\.stringify\(output\)/);
  });
});
