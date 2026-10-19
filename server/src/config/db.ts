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
 * The database this process is actually using (environment separation).
 *
 * Read from the live connection first, so it reports what MongoDB confirmed
 * rather than what was requested — the only way to verify separation from the
 * running process itself. Before the connection is ready it falls back to the
 * configured target. Never returns the connection string or credentials.
 */
export function getDatabaseName(): string {
  return mongoose.connection.name || env.mongodbDbName;
}

/**
 * The boot connect budget, and why it differs by environment.
 *
 * PRODUCTION IS FAIL-FAST BY CONTRACT: one attempt, a 5 s bound, then the caller exits and
 * Render restarts the service. A longer wait would only delay that restart.
 *
 * DEVELOPMENT IS NOT, and 5 s turned out to be a bound this host genuinely exceeds. Measured
 * on 2026-10-19: the same cluster took 15.8 s to select (the figure `scripts/ai-usage.mjs`
 * already relies on), and **three separate `npm start` runs** died on the 5 s bound while a
 * raw connect seconds earlier had succeeded. Mongoose does not retry a REJECTED initial
 * connect, so the result was an API that stayed `not ready` — answering 503 to every
 * database request — until somebody restarted it, which is the failure this budget removes.
 * Three attempts with a 30 s selection bound covers the measured outage without turning a
 * genuine misconfiguration into a 90 s hang: a wrong URI still fails on its first attempt.
 *
 * TEST IS DELIBERATELY UNCHANGED (one attempt, 5 s): the suites already own their retry loop
 * (`TEST_DB_MAX_ATTEMPTS`), and a nested 3 × 30 s wait inside it would turn a transient blip
 * into a very long green run.
 */
export const PRODUCTION_CONNECT_TIMEOUT_MS = 5000;
export const DEVELOPMENT_CONNECT_TIMEOUT_MS = 30000;
export const DEVELOPMENT_CONNECT_ATTEMPTS = 3;
export const DEVELOPMENT_CONNECT_RETRY_MS = 3000;

/**
 * The boot budget for one environment, as data.
 *
 * Split out as a pure function so every environment string can be asserted (including
 * `undefined`, mixed case and the test runner's own value) without mutating the loaded
 * `env` object — the branch that keeps production fail-fast is exactly the branch a
 * mutation-style test would be least able to prove.
 *
 * `testMode` is `process.env.TEST_MODE`, and it is NOT optional detail: the suite runner sets
 * TEST_MODE and leaves NODE_ENV unset, so a test process reports `nodeEnv === 'development'`
 * and would otherwise take the three-attempt development budget — inside the suites' own
 * `TEST_DB_MAX_ATTEMPTS` loop, turning a transient blip into minutes of waiting. Reading it
 * here is what makes "TEST IS DELIBERATELY UNCHANGED" true rather than aspirational.
 */
export function connectBudget({
  nodeEnv,
  testMode,
}: {
  nodeEnv?: string | undefined;
  testMode?: string | undefined;
} = {}): {
  attempts: number;
  selectionTimeoutMs: number;
  retryDelayMs: number;
} {
  const environment = String(nodeEnv ?? '').trim().toLowerCase();
  const isTest = environment === 'test' || Boolean(String(testMode ?? '').trim());
  const isDevelopment = environment === 'development' && !isTest;
  return {
    attempts: isDevelopment ? DEVELOPMENT_CONNECT_ATTEMPTS : 1,
    selectionTimeoutMs: isDevelopment ? DEVELOPMENT_CONNECT_TIMEOUT_MS : PRODUCTION_CONNECT_TIMEOUT_MS,
    retryDelayMs: DEVELOPMENT_CONNECT_RETRY_MS,
  };
}

export type ConnectDatabaseOptions = {
  /** Overrides the environment's attempt budget (tests pass 1 or an explicit count). */
  attempts?: number;
  /** Overrides the driver's server-selection bound for each attempt. */
  selectionTimeoutMs?: number;
  /** Pause between attempts. */
  retryDelayMs?: number;
  /** The connect itself, injectable so the retry policy is testable without a database. */
  connect?: (uri: string, options: MongooseConnectOptions) => Promise<unknown>;
};

/**
 * Connects to MongoDB using MONGODB_URI from the environment.
 *
 * - Returns `true` when connected.
 * - Returns `false` when no URI is configured (skips the connection, e.g. for tests).
 * - Rethrows the LAST connection error (each attempt logged in sanitized form) so the
 *   caller can decide how to handle a failed startup.
 *
 * The attempt budget comes from the environment (see above) unless the caller states one.
 */
export async function connectDatabase({
  attempts,
  selectionTimeoutMs,
  retryDelayMs,
  connect,
}: ConnectDatabaseOptions = {}): Promise<boolean> {
  if (!env.mongodbUri) {
    console.warn(
      '[db] MONGODB_URI is not set — skipping database connection. ' +
        `Add it to server/.env to connect to MongoDB (target database: ${getDatabaseName()}).`
    );
    return false;
  }

  const defaults = connectBudget({ nodeEnv: env.nodeEnv, testMode: process.env.TEST_MODE });
  const budget = Math.max(1, attempts ?? defaults.attempts);
  const selection = selectionTimeoutMs ?? defaults.selectionTimeoutMs;
  const pause = retryDelayMs ?? defaults.retryDelayMs;
  const connectImpl = connect ?? ((uri, options) => mongoose.connect(uri, options));

  for (let attempt = 1; attempt <= budget; attempt += 1) {
    try {
      // Cast rather than `satisfies`: `satisfies` leaves the expression's type as
      // the object literal, which is then freshly excess-property-checked against
      // `ConnectOptions` at the call and fails for the same missing key.
      await connectImpl(env.mongodbUri, {
        // Environment separation: the database is chosen by config/env.ts, never by
        // the path segment of MONGODB_URI, so one cluster and one connection string
        // serve development, test and production without any of them sharing data.
        dbName: env.mongodbDbName,
        serverSelectionTimeoutMS: selection,
        bufferTimeoutMS: 1500,
      } as MongooseConnectOptions);
      // The database name is one of three fixed, non-secret values — and it is the
      // single most useful line an operator can see in a deploy log, since it is
      // what proves which database this process actually reached.
      console.log(`[db] connected to MongoDB (database: ${getDatabaseName()})`);
      return true;
    } catch (err) {
      // Every attempt is logged, with its number: an operator reading a boot log has to be
      // able to tell "the cluster is down" from "one socket was slow" and see whether the
      // process gave up or recovered.
      console.error(
        `[db] connection attempt ${attempt}/${budget} failed (${errorName(err)}): ${safeErrorDetail(err)}`
      );
      if (attempt === budget) throw err;
      await new Promise((resolve) => setTimeout(resolve, pause));
    }
  }

  // Unreachable: the loop either returns or throws. Kept for totality so the return type
  // cannot silently become `undefined` if the loop is ever restructured.
  throw new Error('[db] connectDatabase exhausted its attempts without an outcome');
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
