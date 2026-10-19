// AI-27 — the allowance is read BEFORE it is spent.
//
// THE DEFECT THIS CLOSES. `perf:turns` is the only instrument that measures a real
// assistant turn, and it is metered by a free tier with a hard daily cap. On
// 2026-10-19 two of its questions answered `429 AI_QUOTA_EXCEEDED` — the run spent
// requests to learn that there were none left. The provider reports the counter
// itself (`free_model_daily_requests` on `GET /v1/key`), so the fact was available
// for free; nothing read it before spending.
//
// WHY THIS SUITE IS PURE. The judgement ("is there enough left for these questions?")
// is a function of a reading and a count, so it is asserted exactly, including the
// boundary where exactly enough is NOT a shortfall. The reading itself is exercised
// against a stubbed fetch — including a hang, which is what an unanswered socket
// looks like and what the new bound exists for. Nothing here needs a database, a
// provider, a key or a log.
//
// The wiring is checked by reading the probe's own source, which is the only place
// the ORDER matters: a refusal must happen before a session is minted, or a refused
// run leaves a row behind. That ordering is asserted, not assumed.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { readProviderUsage, shortfall } from '../scripts/ai-usage.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(HERE, '..');
const PROBE_SOURCE = fs.readFileSync(path.join(SERVER_ROOT, 'scripts', 'measure-ai-turns.mjs'), 'utf8');

/** The reading the deployed free tier actually returned on 2026-10-19. */
const SPENT = Object.freeze({
  status: 'OK',
  isFreeTier: true,
  daily: { used: 50, limit: 50, remaining: 0 },
  paidUsage: 0,
  paidUsageDaily: 0,
  paidUsageMonthly: 0,
  creditLimit: null,
  creditRemaining: null,
});

describe('AI-27 — the provider allowance, read before a measurement spends it', () => {
  it('a spent day is a shortfall, and the numbers are carried through', () => {
    assert.deepEqual(shortfall(SPENT, 2), { remaining: 0, limit: 50, used: 50, needed: 2 });
  });

  it('a day with fewer requests left than questions is a shortfall', () => {
    const almost = { ...SPENT, daily: { used: 49, limit: 50, remaining: 1 } };
    assert.deepEqual(shortfall(almost, 3), { remaining: 1, limit: 50, used: 49, needed: 3 });
  });

  it('EXACTLY enough is not a shortfall — the boundary is `<`, not `<=`', () => {
    const exact = { ...SPENT, daily: { used: 48, limit: 50, remaining: 2 } };
    assert.equal(shortfall(exact, 2), null, 'two questions against two requests must be allowed');
    assert.deepEqual(shortfall(exact, 3), { remaining: 2, limit: 50, used: 48, needed: 3 });
  });

  it('a reading that FAILED never refuses work — it reported nothing to refuse on', () => {
    for (const status of ['NOT_CONFIGURED', 'UNREADABLE', 'SKIPPED']) {
      assert.equal(shortfall({ status, detail: 'whatever' }, 5), null, status);
    }
    assert.equal(shortfall(null, 5), null);
    assert.equal(shortfall(undefined, 5), null);
  });

  it('a key with no free-model counter (a paid key) never refuses work', () => {
    const paid = { status: 'OK', isFreeTier: false, daily: null };
    assert.equal(shortfall(paid, 5), null);
  });

  it('a counter the provider left partly empty refuses nothing', () => {
    const partial = { ...SPENT, daily: { used: 4, limit: null, remaining: null } };
    assert.equal(shortfall(partial, 2), null, 'remaining must be a number before anything can be short');
  });

  it('asking for no questions is never a shortfall', () => {
    assert.equal(shortfall(SPENT, 0), null);
    assert.equal(shortfall(SPENT, Number.NaN), null);
  });

  it('the reading is the one the report prints: the real body maps to used/limit/remaining', async () => {
    const fakeFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          is_free_tier: true,
          free_model_daily_requests: { used: 50, limit: 50, remaining: 0 },
          label: 'sk-or-v1-1fe…db3',
        },
      }),
    });
    const usage = await readProviderUsage({ apiKey: 'test-key', fetchImpl: fakeFetch });
    assert.equal(usage.status, 'OK');
    assert.deepEqual(usage.daily, { used: 50, limit: 50, remaining: 0 });
    assert.equal(JSON.stringify(usage).includes('sk-or-v1'), false, 'the masked label never becomes a value');
  });

  it('an unanswered socket is bounded and reported, never waited on forever', async () => {
    // The stub rejects ONLY when the request is aborted, which is the shape of a hang:
    // a fetch that never resolves on its own. Without the AbortController wiring the
    // read would not settle and this case would time the suite out instead of passing.
    const hangingFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    const started = Date.now();
    const usage = await readProviderUsage({ apiKey: 'test-key', fetchImpl: hangingFetch, timeoutMs: 40 });
    const elapsed = Date.now() - started;
    assert.equal(usage.status, 'UNREADABLE');
    assert.match(usage.detail, /no answer within 40 ms/);
    assert.ok(elapsed < 2000, `the read must give up at its bound (took ${elapsed} ms)`);
  });

  it('the probe reads the allowance BEFORE it mints a session, and only refuses on a KNOWN shortfall', () => {
    assert.match(
      PROBE_SOURCE,
      /import \{ DEFAULT_BASE_URL, readProviderUsage, shortfall \} from '\.\/ai-usage\.mjs';/,
      'the probe must reuse the report\'s reader, not a second copy of the provider contract',
    );
    const readAt = PROBE_SOURCE.indexOf('await readProviderUsage(');
    const mintAt = PROBE_SOURCE.indexOf('createSessionForToken({');
    assert.ok(readAt > 0, 'the allowance is read');
    assert.ok(mintAt > 0, 'the session is minted');
    assert.ok(readAt < mintAt, 'the refusal must precede the session mint, so a refused run leaves no row behind');

    const preflight = PROBE_SOURCE.slice(readAt, mintAt);
    assert.match(preflight, /if \(short && !process\.argv\.includes\('--force'\)\)/, 'refuse only on a shortfall, with --force as the override');
    assert.match(preflight, /process\.exit\(2\)/, 'a refusal is NOT VERIFIED, never a silent success');
    assert.match(preflight, /Nothing was sent to the provider/, 'the refusal must say that nothing was spent');
    assert.match(preflight, /00:00 UTC/, 'the refusal must say when the window rolls over');
    assert.match(preflight, /picked\.length/, 'the shortfall is judged against the questions actually selected');
  });

  it('`ai:usage --provider-only` answers the allowance question with no log and no database', () => {
    // A CHILD PROCESS, because what is under test is the CLI surface: the flag has to
    // exist, and it has to bypass the log requirement that used to make the cheapest
    // question the hardest one to ask. The key is passed as an empty string, which
    // dotenv will not overwrite, so this reads no network and no secret.
    const child = spawnSync(process.execPath, ['scripts/ai-usage.mjs', '--provider-only', '--json'], {
      cwd: SERVER_ROOT,
      env: { ...process.env, OPENROUTER_API_KEY: '', OPENROUTER_BASE_URL: '' },
      encoding: 'utf8',
      timeout: 60000,
    });
    assert.equal(child.status, 0, `expected exit 0, got ${child.status}: ${child.stderr}`);
    const payload = JSON.parse(child.stdout);
    assert.equal(payload.source, 'not requested (--provider-only)');
    assert.equal(payload.provider.status, 'NOT_CONFIGURED', 'no key in the child, so the reading says exactly that');
    assert.equal(payload.turns, undefined, 'the provider-only report measures no turns');
  });
});
