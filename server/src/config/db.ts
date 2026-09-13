import mongoose from 'mongoose';
import type { ConnectOptions } from 'mongoose';

import env from './env.ts';

const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

/**
 * `ConnectOptions` plus the one Mongoose-specific connect option it omits.
 *
 * `bufferTimeoutMS` is genuinely supported at runtime — Mongoose reads it off
 * the connect options itself and deletes it before handing the rest to the
 * MongoDB driver (`mongoose/lib/drivers/node-mongodb-native/connection.js`), and
 * its own `connect()` JSDoc documents it. Mongoose 9.9.5 declares the option in
 * its global and schema option types but not in `ConnectOptions`, so the shape
 * below names what we actually pass instead of asserting the mismatch away.
 * Type-only: the object handed to `mongoose.connect` is unchanged.
 */
type MongooseConnectOptions = ConnectOptions & { bufferTimeoutMS?: number };

/**
 * The error shape these helpers read. Structural and fully optional, because
 * every one of these functions is handed a caught value (`unknown`) — a driver
 * error, a Mongoose error, or something else entirely — and must narrow it
 * rather than assume it.
 */
type ErrorLike = { name?: unknown; message?: unknown };

/**
 * `${err.name || 'Error'}`, narrowed. The original interpolated the result into
 * a template, which stringifies whichever branch it took, so `String()` here
 * produces the same text for every value — including a thrown non-Error with a
 * truthy non-string `name`. Destructuring reproduces the original's unguarded
 * `err.name`, so a thrown `null`/`undefined` still raises a TypeError here
 * rather than being silently absorbed.
 */
function errorName(err: unknown): string {
  const { name } = err as ErrorLike;
  return name ? String(name) : 'Error';
}

/**
 * Phase 07D / H8: how long an operation may wait on the driver while the
 * connection is not ready before Mongoose rejects it with a buffering-timeout
 * error. The default is 10s — far too long for a request whose database is
 * down, and it would let a dropped connection make clients hang for ages. 1.5s
 * keeps the window for a transient reconnect while ensuring a DB-down request
 * fails fast and is answered centrally with a clean 503 (see errorHandler).
 */
mongoose.set('bufferTimeoutMS', 1500);

/** Sanitize an error message so a connection string / credentials can never leak into logs. */
function safeErrorDetail(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/mongodb(\+srv)?:\/\/[^\s"']*/gi, 'mongodb://***');
}

/** Sanitized, log-safe rendering of a database error (no URI, no credentials). */
export function sanitizeMongoMessage(err: unknown): string {
  return safeErrorDetail(err);
}

/**
 * Driver / Mongoose error classes that mean "the database could not be reached"
 * — the centralized error handler answers those with a fixed 503 (never the raw
 * driver message, which can carry a connection string or topology internals).
 *
 * Deterministic by error shape alone (not by current connection state) so the
 * mapping is stable whether MongoDB is up or down when a test runs.
 */
const DB_UNAVAILABLE_ERROR_NAMES = new Set([
  'MongoServerSelectionError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoNotConnectedError',
  'MongoTopologyClosedError',
  'MongooseServerSelectionError',
]);

export function isDatabaseDownError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { name, message } = err as ErrorLike;
  if (typeof name === 'string' && DB_UNAVAILABLE_ERROR_NAMES.has(name)) return true;
  if (name === 'MongooseError' && typeof message === 'string') {
    // Buffering errors surface on the connection's Promise as MongooseError
    // ("Operation `x.findOne()` buffering timed out after 1500ms") or, when
    // buffering is unavailable, as a "before initial connection is complete"
    // / "bufferCommands = false" rejection.
    return /buffering timed out|before initial connection is complete|bufferCommands/.test(message);
  }
  return false;
}

/**
 * Connection-state + error monitoring (Phase 07D / H8 + M2).
 *
 * Registered once at module load so the driver can never crash the process with
 * an unhandled 'error' event, and so operators see safe, low-noise transitions
 * (lost -> reconnected). Initial connect success is logged by connectDatabase();
 * transitions are logged here. Nothing sensitive is ever logged.
 */
let monitoringAttached = false;
let intentionalClose = false;

function attachConnectionMonitoring() {
  if (monitoringAttached) return;
  monitoringAttached = true;

  const conn = mongoose.connection;

  conn.on('disconnected', () => {
    // A graceful disconnect() logs its own message in disconnectDatabase();
    // anything else means the connection was dropped unexpectedly.
    if (!intentionalClose) {
      console.log(
        '[db] MongoDB connection lost — requests that need the database will return 503 until it reconnects'
      );
    }
  });

  conn.on('reconnected', () => {
    console.log('[db] reconnected to MongoDB');
  });

  conn.on('error', (err: unknown) => {
    console.error(`[db] connection error (${errorName(err)}): ${safeErrorDetail(err)}`);
  });
}

attachConnectionMonitoring();

/**
 * Connects to MongoDB using MONGODB_URI from the environment.
 *
 * - Returns `true` when connected.
 * - Returns `false` when no URI is configured (skips the connection, e.g. for tests).
 * - Rethrows connection errors (already logged in sanitized form) so the caller
 *   can decide how to handle a failed startup.
 */
export async function connectDatabase(): Promise<boolean> {
  if (!env.mongodbUri) {
    console.warn(
      '[db] MONGODB_URI is not set — skipping database connection. ' +
        'Add it to server/.env to connect to MongoDB.'
    );
    return false;
  }

  try {
    // Cast rather than `satisfies`: `satisfies` leaves the expression's type as
    // the object literal, which is then freshly excess-property-checked against
    // `ConnectOptions` at the call and fails for the same missing key.
    await mongoose.connect(env.mongodbUri, {
      serverSelectionTimeoutMS: 5000,
      bufferTimeoutMS: 1500,
    } as MongooseConnectOptions);
    console.log('[db] connected to MongoDB');
    return true;
  } catch (err) {
    console.error(
      `[db] connection failed (${errorName(err)}): ${safeErrorDetail(err)}`
    );
    throw err;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    // Mark this as intentional so the 'disconnected' handler stays quiet (this
    // function logs the disconnect itself) instead of reporting a lost connection.
    intentionalClose = true;
    await mongoose.disconnect();
    intentionalClose = false;
    console.log('[db] disconnected from MongoDB');
  }
}

/** Human-readable current connection state for observability (health endpoint). */
export function getDatabaseState(): string {
  return DB_STATES[mongoose.connection.readyState] || 'unknown';
}

/** True when MongoDB is reachable right now (readiness endpoint). Cheap: reads the driver state, no round-trip. */
export function isDatabaseReady(): boolean {
  return mongoose.connection.readyState === 1;
}

export default mongoose;
