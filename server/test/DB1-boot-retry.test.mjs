// DB-1 — a boot must survive a slow cluster, and production must still fail fast.
//
// THE DEFECT THIS CLOSES. `connectDatabase` made ONE attempt with a 5 s server-selection
// bound, and mongoose does not retry a REJECTED initial connect. On 2026-10-19 the same
// Atlas cluster took 15.8 s to select (the figure `scripts/ai-usage.mjs` already relies on),
// and **three separate `npm start` runs** died on that bound while a raw connect seconds
// earlier had succeeded — leaving an API that answered 503 to every database request until
// somebody restarted it. The log said "Restart once MongoDB is reachable", which is an
// instruction to the operator rather than behaviour of the process.
//
// WHAT IS ASSERTED HERE, AND WHAT DELIBERATELY IS NOT. The retry policy, its backoff, the
// error it finally throws, and the budget each environment gets — all against an injected
// connect, so no socket and no database are involved. Production's fail-fast is the part
// that must not drift: it is asserted as DATA (one attempt, 5 s) for every environment
// string that is not `development`, because a future edit that quietly gives production a
// retry loop would change how long a broken deploy stays broken.

import 'dotenv/config';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import env from '../src/config/env.ts';
import {
  DEVELOPMENT_CONNECT_ATTEMPTS,
  DEVELOPMENT_CONNECT_TIMEOUT_MS,
  PRODUCTION_CONNECT_TIMEOUT_MS,
  connectBudget,
  connectDatabase,
} from '../src/config/db.ts';

/**
 * `connectDatabase` returns `false` (skip) when no URI is configured, so the connect-behaviour
 * cases need one. CI sets MONGODB_URI and a developer's `server/.env` supplies it; where
 * neither does, those cases say they were skipped rather than pretending to pass.
 */
const NO_URI = env.mongodbUri ? false : 'MONGODB_URI is not configured in this environment';

/** The budget the running process actually gets, read the way `connectDatabase` reads it. */
const budget = connectBudget({ nodeEnv: env.nodeEnv, testMode: process.env.TEST_MODE });

/**
 * True only in a bare `node --test` on this file: no TEST_MODE and no NODE_ENV, which is a
 * real development process and therefore correctly takes the retrying budget.
 */
const IS_DEVELOPMENT = budget.attempts > 1;

/** Run `fn` with `console.error`/`console.log` captured, so a failure case stays quiet. */
async function quietly(fn) {
  const lines = [];
  const originalError = console.error;
  const originalLog = console.log;
  console.error = (...args) => lines.push(args.join(' '));
  console.log = (...args) => lines.push(args.join(' '));
  try {
    return { result: await fn(), lines };
  } finally {
    console.error = originalError;
    console.log = originalLog;
  }
}

/** A connect that fails `failures` times and then succeeds, recording its calls. */
function flakyConnect(failures) {
  const calls = [];
  const connect = async (uri, options) => {
    calls.push({ uri, options });
    if (calls.length <= failures) {
      const error = new Error('Server selection timed out');
      error.name = 'MongooseServerSelectionError';
      throw error;
    }
    return { ok: 1 };
  };
  return { connect, calls };
}

describe('DB-1 — the boot connect budget, and the retry a slow cluster needs', () => {
  it('development waits and retries; production, test and an unset NODE_ENV do not', () => {
    for (const notDevelopment of ['production', 'test', '', undefined, 'staging', 'prod']) {
      assert.deepEqual(
        connectBudget({ nodeEnv: notDevelopment }),
        { attempts: 1, selectionTimeoutMs: PRODUCTION_CONNECT_TIMEOUT_MS, retryDelayMs: 3000 },
        `NODE_ENV=${String(notDevelopment)} must stay fail-fast`,
      );
    }
    for (const development of ['development', 'Development', ' DEVELOPMENT ']) {
      assert.deepEqual(
        connectBudget({ nodeEnv: development }),
        {
          attempts: DEVELOPMENT_CONNECT_ATTEMPTS,
          selectionTimeoutMs: DEVELOPMENT_CONNECT_TIMEOUT_MS,
          retryDelayMs: 3000,
        },
        `NODE_ENV=${JSON.stringify(development)} is the one environment that retries`,
      );
    }
    // THE RUNNER'S OWN PROCESS: TEST_MODE is set and NODE_ENV is not, so this is the case that
    // would otherwise have silently given every suite a 3 x 30 s wait inside its own retry loop.
    assert.deepEqual(
      connectBudget({ nodeEnv: 'development', testMode: 'full' }),
      { attempts: 1, selectionTimeoutMs: PRODUCTION_CONNECT_TIMEOUT_MS, retryDelayMs: 3000 },
      'a test process must not take the development budget',
    );
    assert.deepEqual(
      connectBudget({ nodeEnv: undefined, testMode: 'unit' }),
      { attempts: 1, selectionTimeoutMs: PRODUCTION_CONNECT_TIMEOUT_MS, retryDelayMs: 3000 },
    );
    assert.equal(DEVELOPMENT_CONNECT_ATTEMPTS, 3, 'three attempts is the shipped budget');
    assert.equal(
      DEVELOPMENT_CONNECT_TIMEOUT_MS,
      30000,
      'the dev bound must exceed the 15.8 s selection this cluster was measured taking',
    );
    assert.equal(PRODUCTION_CONNECT_TIMEOUT_MS, 5000, 'production keeps its fast failure');
  });

  it('a cluster that answers on the second attempt is a successful boot, not a dead API', { skip: NO_URI }, async () => {
    const { connect, calls } = flakyConnect(1);
    const { result } = await quietly(() =>
      connectDatabase({ attempts: 3, retryDelayMs: 1, connect }),
    );
    assert.equal(result, true);
    assert.equal(calls.length, 2, 'one failure, then a success');
    // The default bound comes from the environment's budget; the constants themselves are
    // pinned in the first case, so this asserts the wiring rather than the number twice.
    assert.equal(calls[0].options.serverSelectionTimeoutMS, budget.selectionTimeoutMs);
  });

  it('every attempt names itself, so a boot log distinguishes a slow socket from a dead cluster', { skip: NO_URI }, async () => {
    const { connect } = flakyConnect(99);
    const { lines } = await quietly(async () => {
      await assert.rejects(() => connectDatabase({ attempts: 3, retryDelayMs: 1, connect }));
    });
    const attempts = lines.filter((line) => line.includes('connection attempt'));
    assert.equal(attempts.length, 3, 'three attempts are reported');
    assert.match(attempts[0], /connection attempt 1\/3/);
    assert.match(attempts[1], /connection attempt 2\/3/);
    assert.match(attempts[2], /connection attempt 3\/3/);
    assert.ok(
      lines.every((line) => !line.includes(env.mongodbUri ?? '---')),
      'no attempt ever logs the connection string',
    );
  });

  it('when every attempt fails, the LAST error is what the caller sees', { skip: NO_URI }, async () => {
    const seen = [];
    let n = 0;
    const connect = async () => {
      n += 1;
      const error = new Error(`failure ${n}`);
      error.name = 'MongooseServerSelectionError';
      seen.push(error);
      throw error;
    };
    await quietly(async () => {
      await assert.rejects(
        () => connectDatabase({ attempts: 3, retryDelayMs: 1, connect }),
        (err) => err === seen.at(-1),
        'the caller must receive the final error object, not the first',
      );
    });
    assert.equal(n, 3);
  });

  it('the pause between attempts is real', { skip: NO_URI }, async () => {
    const { connect, calls } = flakyConnect(99);
    const started = Date.now();
    await quietly(async () => {
      await assert.rejects(() => connectDatabase({ attempts: 2, retryDelayMs: 40, connect }));
    });
    const elapsed = Date.now() - started;
    assert.equal(calls.length, 2);
    assert.ok(elapsed >= 35, `expected a ~40 ms pause between attempts, waited ${elapsed} ms`);
  });

  it('outside development the default budget is still ONE attempt', { skip: NO_URI || IS_DEVELOPMENT }, async () => {
    // The suites own their retry loop (TEST_DB_MAX_ATTEMPTS); a nested 3 x 30 s wait inside it
    // would turn a transient blip into a very long run. Pinned so a future "make it retry
    // everywhere" edit has to argue with a test rather than slip through. The runner sets
    // NODE_ENV=test, so this runs there; a bare `node --test` on this file is a development
    // process and correctly takes the development budget, so the case says it was skipped
    // instead of asserting a value its own invocation contradicts.
    const { connect, calls } = flakyConnect(99);
    await quietly(async () => {
      await assert.rejects(() => connectDatabase({ retryDelayMs: 1, connect }));
    });
    assert.equal(calls.length, 1, 'no hidden retry in the test environment');
  });

  it('the connection is opened against the database config/env.ts resolved, never the URI path', { skip: NO_URI }, async () => {
    const { connect, calls } = flakyConnect(0);
    const { result } = await quietly(() => connectDatabase({ attempts: 1, connect }));
    assert.equal(result, true);
    assert.equal(calls[0].uri, env.mongodbUri);
    assert.equal(calls[0].options.dbName, env.mongodbDbName, 'readiness must be able to name the database');
    assert.equal(calls[0].options.bufferTimeoutMS, 1500, 'a DB-down request still fails fast');
  });
});
