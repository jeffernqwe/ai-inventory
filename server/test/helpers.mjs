// Shared Phase 03 test helpers. Imported by test files; defines no tests itself.
import 'dotenv/config';

import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/db.js';
import { models } from '../src/models/index.ts';

let _dbOk = false;
let _attempted = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** TEST_MODE=unit means a DB-independent run: never touch MongoDB. */
function isUnitRun() {
  return String(process.env.TEST_MODE || 'full').trim().toLowerCase() === 'unit';
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
