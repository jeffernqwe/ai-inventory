/**
 * Number of trusted reverse-proxy hops in front of this server (Phase 07B).
 * `0` (default) means no proxy: Express uses the direct socket address, which
 * is the safe default — forwarding headers are ignored entirely.
 *
 * Set to the exact hop count (e.g. 1 behind Render/Railway/a single load
 * balancer) so req.ip — and therefore IP-based rate limiting — sees the real
 * client IP. Never `true`: trusting an unbounded chain lets anyone spoof
 * X-Forwarded-For and bypass rate limits.
 */
function parseTrustProxy() {
  const raw = (process.env.TRUST_PROXY || '').trim().toLowerCase();
  if (!raw || raw === 'false' || raw === '0') return 0;
  if (raw === 'true') return 1;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 0;
}

/**
 * CORS allow-list (Phase 07C / M3): comma-separated exact origins
 * (e.g. "https://admin.example.com,https://example.com"). Trailing slashes are
 * ignored; empty segments dropped. If empty (default), NO browser origin is
 * allowed — native mobile clients send no Origin header and are unaffected, and
 * nothing ever receives an `Access-Control-Allow-Origin: *`.
 */
function parseCorsOrigins() {
  return (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * JSON request-body size cap (Phase 07C / L2). Global, intentionally small —
 * every V1 endpoint (product, category, inventory, AI chat) has validated
 * fields well under 100kb. Oversized bodies are rejected cleanly (413) before
 * any route logic runs. No endpoint accepts file uploads in V1.
 */
function parseJsonBodyLimit() {
  const raw = (process.env.JSON_BODY_LIMIT || '').trim();
  return raw || '100kb';
}

/**
 * Graceful-shutdown grace period (Phase 07D / M2): how long the process waits
 * for in-flight requests to finish after a SIGTERM/SIGINT before it force-exits.
 * Bounded and configurable; the default is short on purpose so a stuck request
 * can never hold a deploy/restart hostage for long.
 */
function parseShutdownTimeoutMs() {
  const n = Number(process.env.SHUTDOWN_TIMEOUT_MS || '');
  return Number.isFinite(n) && n > 0 ? n : 10000;
}

/**
 * MongoDB database names — one per environment (environment separation).
 *
 * Every connection passes an explicit `dbName` (see config/db.ts), so the
 * database a process talks to is decided here rather than by whatever path
 * segment happens to sit in MONGODB_URI. That is what makes the environments
 * separable while sharing one cluster and one connection string: the URI
 * supplies the cluster and the credentials, this supplies the database.
 *
 * The legacy shared database is deliberately NOT named here. `inventory_ai`
 * held the pre-separation development and production data in one place, and no
 * configuration may silently resolve back to it.
 */
export const DATABASE_NAMES = {
  development: 'inventoryai_dev_db',
  test: 'inventoryai_test_db',
  production: 'inventoryai_prod_db',
} as const;

/** Optional explicit override of the resolved database name. */
export const MONGODB_DB_NAME_ENV = 'MONGODB_DB_NAME';

/**
 * The inputs `resolveDatabaseName` decides from. Named so the resolver can be
 * driven with an explicit bag — another environment, a test — as easily as with
 * the live process values.
 */
export interface DatabaseNameInputs {
  nodeEnv?: string;
  explicitName?: string;
  testMode?: string;
}

/**
 * Resolves the MongoDB database name for this process, in this order:
 *
 *   1. A TEST run always uses DATABASE_NAMES.test. TEST_MODE is set by
 *      scripts/run-tests.mjs, and NODE_ENV=test is honoured as well, so this is
 *      fail-closed by construction: a test process cannot reach the development
 *      or production database even when MONGODB_DB_NAME names one, and a test
 *      run cannot accidentally touch real data at all.
 *   2. Otherwise MONGODB_DB_NAME, when set, wins — the operator escape hatch for
 *      a staging deployment or a renamed database.
 *   3. Otherwise NODE_ENV=production selects the production database and
 *      anything else selects the development database.
 *
 * Two combinations are refused outright rather than resolved, because both would
 * put data somewhere the environment cannot legitimately reach:
 *
 *   - a test run inside a production-flagged process (NODE_ENV=production with
 *     TEST_MODE set) — tests must never execute as production; and
 *   - production naming the development or test database, or a non-production
 *     environment naming the production database.
 *
 * Pure and argument-driven — it reads nothing from process.env itself, so every
 * environment can be exercised without touching the live process, and a caller's
 * outcome depends only on what it passes. The module's own resolution supplies
 * the live values through `databaseNameInputs()` below. The environment is
 * compared case-insensitively, the database name exactly — MongoDB database names
 * are case-sensitive, so a near-miss must not be treated as a match.
 */
export function resolveDatabaseName({ nodeEnv, explicitName, testMode }: DatabaseNameInputs = {}): string {
  const environment = (nodeEnv || 'development').trim().toLowerCase();
  const explicit = typeof explicitName === 'string' ? explicitName.trim() : '';
  const isTestRun = environment === 'test' || (testMode || '').trim() !== '';

  if (isTestRun) {
    if (environment === 'production') {
      throw new Error(
        'Refusing to configure the database: TEST_MODE is set in a production-flagged process ' +
          '(NODE_ENV=production). Tests must never run as production.'
      );
    }
    return DATABASE_NAMES.test;
  }

  if (explicit) {
    if (environment === 'production') {
      if (explicit === DATABASE_NAMES.development || explicit === DATABASE_NAMES.test) {
        throw new Error(
          `Refusing to configure the database: ${MONGODB_DB_NAME_ENV} selects "${explicit}" while ` +
            'NODE_ENV=production. Production must not use the development or test database.'
        );
      }
    } else if (explicit === DATABASE_NAMES.production) {
      throw new Error(
        `Refusing to configure the database: ${MONGODB_DB_NAME_ENV} selects the production ` +
          `database "${explicit}" while NODE_ENV=${environment}. Only a production process may use it.`
      );
    }
    return explicit;
  }

  return environment === 'production' ? DATABASE_NAMES.production : DATABASE_NAMES.development;
}

/**
 * The live environment values `resolveDatabaseName` is applied to. Split out so
 * the resolution is a pure function of a value bag while the process still reads
 * the real environment exactly once, at module load.
 */
export function databaseNameInputs(): DatabaseNameInputs {
  return {
    nodeEnv: process.env.NODE_ENV,
    explicitName: process.env[MONGODB_DB_NAME_ENV],
    testMode: process.env.TEST_MODE,
  };
}

/**
 * The NODE_ENV values this server actually recognises.
 *
 * Anything else — including `prod`, `Production`, `staging`, or nothing at all — is treated as
 * development everywhere in this codebase (`env.nodeEnv` defaults to it, and the production
 * checks are keyed on the exact string). That fallback is convenient locally and dangerous on a
 * hosted deployment, which is why it is named here and reported at boot rather than left to be
 * inferred from three unrelated behaviours.
 */
export const KNOWN_NODE_ENVS: readonly string[] = ['development', 'test', 'production'];

/**
 * What `NODE_ENV` actually says, including the two ways it can say nothing.
 *
 * `missing` and `unrecognised` are deliberately separate answers rather than one "invalid":
 * a variable nobody set on a host is a deployment omission, while a value somebody typed
 * (`prod`, `Production`, `staging`) is a mistake with a visible cause, and an operator fixes
 * them by looking in different places. The value itself is never echoed into a report — the
 * classification is the diagnostic, and a mistyped variable could be any string at all.
 */
export type NodeEnvKind = 'production' | 'development' | 'test' | 'missing' | 'unrecognised';

/** The classification above, as a pure function of the raw value. */
export function classifyNodeEnv(raw: string | undefined = process.env.NODE_ENV): NodeEnvKind {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return 'missing';
  if (value === 'production' || value === 'development' || value === 'test') return value;
  return 'unrecognised';
}

/** Is this one of the three postures the server knows how to serve? */
export function isRecognisedNodeEnv(kind: NodeEnvKind): kind is 'production' | 'development' | 'test' {
  return kind === 'production' || kind === 'development' || kind === 'test';
}

/**
 * Is this a test process?
 *
 * `TEST_MODE` is set by `scripts/run-tests.mjs` and is accepted at boot as a declaration in its
 * own right — but it is NOT a way around naming an environment, because `resolveDatabaseName`
 * pins a test process to `inventoryai_test_db` and refuses outright when `NODE_ENV=production`
 * is also set. A process that only has `TEST_MODE` therefore cannot reach development or
 * production data, which is why it is allowed to start without `NODE_ENV`.
 */
export function isTestProcess(values: Record<string, string | undefined> = process.env): boolean {
  const raw = values?.TEST_MODE;
  return typeof raw === 'string' && raw.trim() !== '';
}

/**
 * May this process include DEBUG DETAIL (an error stack trace) in a response?
 *
 * ★ FAIL-CLOSED, AND THAT IS THE WHOLE POINT. The previous rule was `NODE_ENV !== 'production'`,
 * which answers YES to an unset, empty or misspelled value: `NODE_ENV=Production` on a host that
 * capitalised it would have returned absolute local file paths, internal module names and line
 * numbers to any caller who provoked a 4xx — measured on the local server on 2026-10-22, where a
 * failed login answered `… at loginWithPassword (file:///C:/Users/…/auth.service.ts:322:11)`.
 * Requiring an EXPLICIT development or test environment inverts that: a value nobody thought about
 * hides the detail instead of publishing it.
 *
 * Deliberately narrower than "not production": a staging box running with `NODE_ENV=staging` also
 * gets no stacks, which is the correct default for anything that is not a developer's machine —
 * and since 2026-10-22 a server cannot boot in that state at all, so a developer is never left
 * wondering why a stack disappeared (`startup.ts` refuses and says what to set).
 */
export function isDebugNodeEnv(raw: string | undefined = process.env.NODE_ENV): boolean {
  const kind = classifyNodeEnv(raw);
  return kind === 'development' || kind === 'test';
}

const env = {
  // The CLASSIFIED value, not the raw one: a value with surrounding whitespace is recognised and
  // must then select the posture it named. Reading the raw string here was the last way a
  // recognised environment could still skip the production checks (`NODE_ENV=" production "`).
  // Anything unrecognised stays on the development fallback — and a server cannot boot in that
  // state at all (see `startServer`), so this branch only serves scripts and test processes.
  nodeEnv: (() => {
    const kind = classifyNodeEnv();
    return isRecognisedNodeEnv(kind) ? kind : 'development';
  })(),
  port: Number(process.env.PORT) || 4000,
  // MongoDB connection string. Never log or expose this value.
  mongodbUri: process.env.MONGODB_URI || '',
  // Database this process uses (environment separation). Resolved by
  // resolveDatabaseName above and passed to mongoose.connect as `dbName`, so it
  // — not the URI's path segment — decides where data is read and written. The
  // name itself is not a secret; the connection string is.
  mongodbDbName: resolveDatabaseName(databaseNameInputs()),
  // JWT signing secret. Never log, commit, or expose this value.
  jwtSecret: process.env.JWT_SECRET || '',
  // Access-token lifetime (jsonwebtoken format, e.g. "1h", "15m").
  // AUTH-02: the Inventory AI access token is short-lived (~1 hour). Session
  // longevity is bounded SEPARATELY by the 14-day absolute session cap — never
  // by this value — so lowering it cannot shorten a session's usable life.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  // AUTH-02: application access-token issuer/audience. Stable, non-secret labels
  // that jsonwebtoken both mints and validates. They are deliberately NOT
  // environment-specific (no host, port, NODE_ENV or project id). The defaults
  // match the app's existing 'inventory-ai' identity (FIREBASE_APP_NAME).
  jwtIssuer: process.env.JWT_ISSUER || 'inventory-ai',
  jwtAudience: process.env.JWT_AUDIENCE || 'inventory-ai-api',
  // Reverse-proxy hops in front of this server (0 = none). See parseTrustProxy.
  trustProxy: parseTrustProxy(),
  // Explicit browser CORS allow-list. See parseCorsOrigins.
  corsOrigins: parseCorsOrigins(),
  // express.json() body limit. See parseJsonBodyLimit.
  jsonBodyLimit: parseJsonBodyLimit(),
  // Graceful-shutdown grace period (ms). See parseShutdownTimeoutMs.
  shutdownTimeoutMs: parseShutdownTimeoutMs(),
};

export default env;
