// The AI usage report — read-only, and the instrument the provider decision needs.
//
// WHY THIS EXISTS. `perf:turns` measures real turns and **spends** provider quota (~50 free
// requests a day IN TOTAL, §27BF); the per-turn cost line (`[ai] turn …`, AI-5) records what
// every real turn actually cost, but nothing read those lines back, so "how much of the
// allowance are we using, and what is failing?" could only be answered by spending more of
// it. That is the question ISS-22 is waiting on, and it is the opposite of a measurement
// instrument: the thing being measured is consumed by measuring it.
//
// THIS SUITE PINS THE TOOL, NOT A READING OF THE PROVIDER. The live numbers depend on the
// day and on the account, so nothing here asserts them; what it pins is that the report is
// ARITHMETICALLY RIGHT on a known log, that a line which is not a turn cannot inflate the
// count, that a truncated turn line is reported as malformed rather than dropped, that a
// missing log is a refusal (exit 2, "nothing was measured") rather than an empty report,
// and — the one that matters most — that no credential-shaped string can reach the output
// even when the log it read contains one.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(SERVER_ROOT, 'scripts', 'ai-usage.mjs');

/** A line that only LOOKS like a credential, so the leak control has something to catch. */
const PLANTED_KEY = 'sk-or-v1-PLANTED-0000000000000000000000000000000000000000';

/**
 * A log fragment shaped like the server's real output: one access-log line (the JSON the
 * http logger writes), one AI-2 degraded warning, three real turns, and one turn line that
 * was cut short by a restart. Exactly one field of each is chosen so the arithmetic is
 * checkable by hand: calls 3 + 1 + 1 = 5 requests, empty 1 + 0 + 0 = 1, toolRuns 1.
 */
const FIXTURE = [
  `{"ts":"2026-10-17T02:39:29.638Z","level":"info","type":"http","method":"POST","path":"/api/ai/chat","status":201}`,
  `OPENROUTER_API_KEY=${PLANTED_KEY}`,
  `[ai] degraded turn reason=EMPTY_COMPLETION attempts=3 empty=2 model=stub/model calls=3`,
  `[ai] turn outcome=ok total=12598ms providerMs=11973ms calls=3 toolMs=625ms toolRuns=1 tools=getInventorySummary empty=1 in=3399 out=499 model=stub/model iterations=3`,
  `[ai] turn outcome=AI_ABANDONED total=12794ms providerMs=12794ms calls=1 toolMs=0ms toolRuns=0 tools=none empty=0 in=0 out=0 model=unknown iterations=1`,
  `[ai] turn outcome=AI_OUTPUT_LIMIT total=213ms providerMs=213ms calls=1 toolMs=0ms toolRuns=0 tools=none empty=0 in=1200 out=800 model=stub/model iterations=1`,
  `[ai] turn outcome=ok total=905ms providerMs=900ms calls=2 toolMs=5ms toolRuns=1 tools=`,
].join('\n');

let dir = '';
let logPath = '';

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-usage-'));
  logPath = path.join(dir, 'server.log');
  fs.writeFileSync(logPath, `${FIXTURE}\n`, 'utf8');
});

after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

async function cli(args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [SCRIPT, ...args], { cwd: SERVER_ROOT });
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

describe('the AI usage report reads the log it is given, and nothing else', () => {
  it('★ counts turns, outcomes, requests and empty completions from the cost lines alone', async () => {
    const res = await cli([`--log=${logPath}`, '--no-provider', '--json']);
    assert.equal(res.code, 0, res.stderr);

    const report = JSON.parse(res.stdout);
    // The degraded warning and the access-log line are not turns. A count that included
    // either would overstate usage on exactly the turns that had trouble.
    assert.equal(report.turns, 4, 'only the four `[ai] turn` lines are turns');
    assert.deepEqual(report.outcomes, { ok: 2, AI_ABANDONED: 1, AI_OUTPUT_LIMIT: 1 });
    assert.equal(report.providerRequests, 7, '3 + 1 + 1 + 2 provider calls');
    assert.equal(report.toolRuns, 2);
    assert.equal(report.emptyResponses, 1);
    assert.equal(report.tokens.input, 3399 + 0 + 1200 + 0);
    assert.equal(report.tokens.output, 499 + 0 + 800 + 0);
    assert.equal(report.malformed, 1, 'the truncated line is reported, never silently dropped');
    assert.equal(report.degradedWarnings, 1, 'the AI-2 warning IS recognised — it is counted as a warning and not as a turn');
    // Named once, and `unknown` (a model the line could not name) is not a model.
    assert.deepEqual(report.models, ['stub/model']);
  });

  it('★ divides the allowance by what a turn actually costs, measured rather than assumed', async () => {
    const res = await cli([`--log=${logPath}`, '--no-provider', '--json']);
    const report = JSON.parse(res.stdout);

    // 7 requests across 4 turns. This ratio is the whole reason the tool exists: a
    // 50-request day is ~28 turns at the cheap end and ~11 at this end, and only the log
    // can say which one a member is having.
    assert.equal(report.requestsPerTurn, 1.75);
    assert.equal(report.providerMs, 11973 + 12794 + 213 + 900);
    assert.equal(report.totalMs, 12598 + 12794 + 213 + 905);
    // A literal, not the same arithmetic re-run: the share is the ratio of the two SUMS
    // (what a member waits for), not the average of per-turn shares (which a fast turn
    // would drag down out of proportion).
    assert.equal(report.providerShare, 0.9762);
    assert.equal(
      report.tokens.input + report.tokens.output,
      4599 + 1299,
      'the truncated line contributed no tokens: an absent field is absent, never a zero',
    );
  });

  it('★ cannot print a credential, even when the log it read contained one', async () => {
    const text = await cli([`--log=${logPath}`, '--no-provider']);
    // A leak control that passes when the tool CRASHES is decoration, so the run itself is
    // asserted first: the planted key is only "not printed" if something was printed.
    assert.equal(text.code, 0, text.stderr);
    assert.match(text.stdout, /turns: 4/, 'positive control: the report really was produced');
    const all = `${text.stdout}\n${text.stderr}`;
    assert.ok(!all.includes(PLANTED_KEY), 'the report never echoes the log verbatim');
    assert.ok(!/sk-or-v1-[A-Za-z0-9-]{10,}/.test(all), 'no key-shaped string reaches stdout or stderr');
  });

  it('★ a missing log is a refusal, not an empty report', async () => {
    const res = await cli([`--log=${path.join(dir, 'nope.log')}`, '--no-provider']);
    // Exit 2 is the project's "NOT VERIFIED — nothing was checked" code (§27BP): reporting
    // zero turns here would read as "the assistant was never used".
    assert.equal(res.code, 2);
    assert.match(res.stderr, /could not read|not verified/i);
  });

  it('reads stdin when no log is named, so it can sit on the end of a pipe', () => {
    // spawnSync rather than execFile: only the sync form takes `input`. (The first version
    // of this case used execFile and would have passed an option the API ignores, testing
    // nothing.)
    const res = spawnSync(process.execPath, [SCRIPT, '--no-provider', '--json'], {
      cwd: SERVER_ROOT,
      input: FIXTURE,
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(JSON.parse(res.stdout).turns, 4);
  });

  it('★ its own controls pass, and a control that cannot fail is not a control', async () => {
    const res = await cli(['--self-test']);
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /control\(s\) passed/i);
    assert.match(res.stdout, /must-fire/i, 'the controls are labelled by what they assert');
  });
});
