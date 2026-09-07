import mongoose from 'mongoose';

import env from './env.js';

const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

/** Sanitize an error message so a connection string / credentials can never leak into logs. */
function safeErrorDetail(err) {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/mongodb(\+srv)?:\/\/[^\s"']*/gi, 'mongodb://***');
}

/**
 * Connects to MongoDB using MONGODB_URI from the environment.
 *
 * - Returns `true` when connected.
 * - Returns `false` when no URI is configured (skips the connection, e.g. for tests).
 * - Rethrows connection errors (already logged in sanitized form) so the caller
 *   can decide how to handle a failed startup.
 */
export async function connectDatabase() {
  if (!env.mongodbUri) {
    console.warn(
      '[db] MONGODB_URI is not set — skipping database connection. ' +
        'Add it to server/.env to connect to MongoDB.'
    );
    return false;
  }

  try {
    await mongoose.connect(env.mongodbUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('[db] connected to MongoDB');
    return true;
  } catch (err) {
    console.error(
      `[db] connection failed (${err.name || 'Error'}): ${safeErrorDetail(err)}`
    );
    throw err;
  }
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[db] disconnected from MongoDB');
  }
}

/** Human-readable current connection state for observability (health endpoint). */
export function getDatabaseState() {
  return DB_STATES[mongoose.connection.readyState] || 'unknown';
}

export default mongoose;
