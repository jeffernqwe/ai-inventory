// Shared Phase 03 test helpers. Imported by test files; defines no tests itself.
import 'dotenv/config';

import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/db.ts';
import { DATABASE_NAMES } from '../src/config/env.ts';
import { models } from '../src/models/index.ts';

let _dbOk = false;
let _attempted = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** TEST_MODE=unit means a DB-independent run: never touch MongoDB. */
function isUnitRun() {
  return String(process.env.TEST_MODE || 'full').trim().toLowerCase() === 'unit';
}

/**
 * True when this process is a test run. `scripts/run-tests.mjs` sets TEST_MODE for
 * every mode it runs, and NODE_ENV=test marks one too. Deliberately any non-empty
 * TEST_MODE rather than a list of known modes: an unrecognised value must still
 * mean "this is a test run", because the opposite reading is what would point a
 * suite at the development database.
 */
function isTestRun() {
  return (
    String(process.env.TEST_MODE || '').trim() !== '' ||
    String(process.env.NODE_ENV || '').trim().toLowerCase() === 'test'
  );
}

/** Optional overrides so a controlled DB-down run retries fast instead of ~37s. */
function intEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * Connect to MongoDB with retries. Atlas connectivity from this machine is
 * intermittent (rotating CGNAT egress IP) — see memory note. Returns true only
 * when mongoose is actually connected.
 *
 * In a TEST_MODE=unit (DB-independent) run this short-circuits to false without
 * attempting a connection, so mixed files never stall on Atlas retries.
 * TEST_DB_MAX_ATTEMPTS / TEST_DB_RETRY_MS shrink the retry window for tests that
 * deliberately exercise the MongoDB-unavailable path.
 */
export async function ensureDb({
  maxAttempts = intEnv('TEST_DB_MAX_ATTEMPTS', 15),
  retryDelayMs = intEnv('TEST_DB_RETRY_MS', 2500),
} = {}) {
  if (_attempted) return _dbOk;
  _attempted = true;

  if (isUnitRun()) {
    _dbOk = false;
    return false;
  }

  // Environment separation, fail-closed — checked BEFORE any connection is
  // attempted. config/env.ts already resolves every test run to the test
  // database, so this is not a second copy of that rule; it is what stops a suite
  // that was never launched through the project runner from reaching a real
  // database at all. Running a test file directly (`node --test test/foo.test.mjs`)
  // sets no TEST_MODE, so without this the process would connect to the
  // development database — and merely connecting is not inert: the driver's
  // autoCreate pass creates the models' collections there. Throwing before the
  // connect means nothing is opened and nothing can be created.
  if (!isTestRun()) {
    throw new Error(
      '[test-db] refusing to run DB-backed tests: TEST_MODE is not set, so this process is not ' +
        'a test run and may not touch a database. Run the suite through the project runner ' +
        '(`npm test`, `npm run test:unit`, or `npm run test:db`) rather than invoking a test ' +
        'file directly.'
    );
  }

  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await connectDatabase();
      break;
    } catch {
      if (i === maxAttempts) return false;
      await sleep(retryDelayMs);
    }
  }

  if (mongoose.connection.readyState !== 1) return false;

  // The second, independent half of the fail-closed rule. The pre-connect check
  // above proves this process IS a test run; this one proves the connection
  // actually landed where it claims to. It is not redundant with the resolver: it
  // is what would catch a regression in config/env.ts or a future change that
  // makes the URI's path segment win over `dbName` again — the exact mistake that
  // let development and production share one database. Throwing is deliberate; a
  // skipped suite would be a false green, and silently testing real data would be
  // worse.
  const effectiveDatabase = mongoose.connection.name;
  if (effectiveDatabase !== DATABASE_NAMES.test) {
    throw new Error(
      `[test-db] refusing to run DB-backed tests: this process is connected to database ` +
        `"${effectiveDatabase}", but tests may only use "${DATABASE_NAMES.test}". ` +
        'Run the suite through the project runner (`npm test`, `npm run test:unit`, or ' +
        '`npm run test:db`), which sets TEST_MODE, rather than invoking a test file directly.'
    );
  }

  // Make sure the unique email index (etc.) exists for the tests that rely on it.
  for (const m of models) {
    await m.createIndexes();
  }
  _dbOk = true;
  return true;
}

export async function disconnectDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export default { ensureDb, disconnectDb };
