// Shared Phase 03 test helpers. Imported by test files; defines no tests itself.
import 'dotenv/config';

import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/db.js';
import { models } from '../src/models/index.js';

let _dbOk = false;
let _attempted = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Connect to MongoDB with retries. Atlas connectivity from this machine is
 * intermittent (rotating CGNAT egress IP) — see memory note. Returns true only
 * when mongoose is actually connected.
 */
export async function ensureDb({ maxAttempts = 15, retryDelayMs = 2500 } = {}) {
  if (_attempted) return _dbOk;
  _attempted = true;

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
