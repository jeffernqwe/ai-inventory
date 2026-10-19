/**
 * The renderer, held against answers the assistant actually wrote (§27DB).
 *
 * AI-4 pinned `parseAssistantMarkdown` with **six realistic inputs written by hand**, and that was the right
 * thing to do at the time. It is not the same as replaying what the model produced: hand-written samples
 * contain the markers their author thought of. So before this increment the whole stored corpus was replayed
 * through the parser — all **50** assistant answers in the database on 2026-10-18 — and the census is the
 * evidence for what was and was not worth fixing:
 *
 *  * **`[` … and therefore every link or image: ZERO occurrences in 50 answers.** The `[Product A](url)` leak
 *    the previous increment left open is real in principle and does not happen in practice, so no link rule
 *    was built. If the model ever starts writing links, this fixture is where it will show up first.
 *  * **Blockquotes, HTML tags, fenced code, `---` rules, checkboxes, `$$`: zero.** Not built, not needed.
 *  * **Tables (13), bold (23), bullets (11), numbered lists (6), a heading, one `\(…\)`: all present**, and
 *    all already rendered. The table answers are the reason AI-4's card layout exists.
 *  * **Exactly one leak class: a truncated answer's dangling opener**, in the two turns that hit their output
 *    budget mid-marker. Fixed in the same increment (`stripMarkdown`'s `DANGLING_MARKER`), which is why the
 *    two of those answers are in this fixture.
 *
 * The eight answers below are copied verbatim from the database — a wide table, a numbered list, a truncated
 * table answer, a heading, a LaTeX percentage, bullets with bold, the longest prose answer, and a short
 * non-English one. Identifiers and product names are the seeded demo tenant's, not a customer's.
 *
 * The assertion is deliberately a **property over all of them** rather than a snapshot: a snapshot would fail
 * on a Markdown change that is an improvement, while this fails only when a marker reaches the screen or a
 * value is lost — which is the failure the module exists to prevent.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAssistantMarkdown } from '../lib/assistantMarkdown';
import type { Block } from '../lib/assistantMarkdown';

interface Fixture {
  /** What this answer is here to cover. */
  reason: string;
  text: string;
}

const answers: Fixture[] = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'assistant-answers.json'), 'utf8'),
);

/** Every piece of text the renderer would draw, in reading order. */
function renderedText(blocks: Block[]): string[] {
  const lines: string[] = [];
  const cells = (row: { text: string }[]): string => row.map((span) => span.text).join('');
  for (const block of blocks) {
    switch (block.kind) {
      case 'heading':
      case 'paragraph':
        lines.push(block.spans.map((span) => span.text).join(''));
        break;
      case 'code':
        lines.push(block.text);
        break;
      case 'list':
        for (const item of block.items) lines.push(`${item.marker}${item.spans.map((s) => s.text).join('')}`);
        break;
      case 'table':
        lines.push(block.header.map(cells).join('\t'));
        for (const row of block.rows) lines.push(row.map(cells).join('\t'));
        break;
      case 'rule':
        break;
    }
  }
  return lines;
}

const find = (reason: string): Fixture => {
  const hit = answers.find((a) => a.reason === reason);
  if (!hit) throw new Error(`fixture is missing the "${reason}" answer`);
  return hit;
};

const MARKERS: [string, RegExp][] = [
  ['bold', /\*\*/],
  ['underscore emphasis', /__/],
  ['strikethrough', /~~/],
  ['inline code', /`/],
  ['table pipe', /\|/],
  ['heading hash', /(^|\n)#{1,6}\s/],
  ['rule', /(^|\n)---/],
  ['latex delimiter', /\\\(|\\\)|\\\[|\$\$/],
  ['latex command', /\\[a-zA-Z]+/],
  ['link target', /\]\(/],
];

describe('the marker property holds on every real answer', () => {
  it('★ no marker of any kind reaches the rendered text', () => {
    const offenders: string[] = [];
    for (const { reason, text } of answers) {
      const rendered = renderedText(parseAssistantMarkdown(text)).join('\n');
      for (const [name, pattern] of MARKERS) {
        const match = pattern.exec(rendered);
        if (match) {
          const at = match.index;
          offenders.push(`${reason} — ${name}: ${JSON.stringify(rendered.slice(Math.max(0, at - 60), at + 80))}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the fixture still covers the shapes it was chosen for', () => {
    // A guard on the guard: if somebody trims the fixture, this says so rather than
    // letting the property above pass over an empty corpus.
    expect(answers.map((a) => a.reason)).toEqual([
      'wide table',
      'numbered list',
      'truncated at the output budget',
      'heading',
      'latex',
      'bullets + bold',
      'longest prose',
      'unicode',
    ]);
  });
});

describe('the shapes that were measured in the corpus', () => {
  it('a wide table is a table, with every column kept', () => {
    const blocks = parseAssistantMarkdown(find('wide table').text);
    const table = blocks.find((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table');
    expect(table).toBeDefined();
    expect(table!.header.length).toBeGreaterThanOrEqual(6);
    expect(table!.rows.length).toBeGreaterThan(0);
    // Every row has as many cells as the header: the escaping rule exists because this
    // can silently stop being true.
    for (const row of table!.rows) expect(row.length).toBe(table!.header.length);
  });

  it('a numbered list keeps its own numbers and its order', () => {
    const blocks = parseAssistantMarkdown(find('numbered list').text);
    const list = blocks.find((b): b is Extract<Block, { kind: 'list' }> => b.kind === 'list');
    expect(list).toBeDefined();
    expect(list!.ordered).toBe(true);
    expect(list!.items.length).toBeGreaterThanOrEqual(10);
    expect(list!.items[0].marker).toContain('1');
  });

  it('★ a truncated answer ends with the value it reached, not with an opener', () => {
    const rendered = renderedText(parseAssistantMarkdown(find('truncated at the output budget').text)).join('\n');
    expect(rendered.trimEnd().endsWith('71,07')).toBe(true);
    expect(rendered).not.toContain('**');
  });

  it('LaTeX is decoded to a readable figure rather than typesetting source', () => {
    const rendered = renderedText(parseAssistantMarkdown(find('latex').text)).join('\n');
    expect(rendered).not.toMatch(/\\[a-zA-Z]+/);
    expect(rendered).toMatch(/%/);
  });
});
