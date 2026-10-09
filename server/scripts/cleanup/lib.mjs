// Development/test cleanup utilities — shared, FAIL-CLOSED safety core.
//
// This module is the single place the destructive cleanup commands decide
// whether they are allowed to run. It is deliberately pure and side-effect
// free: every guard is a function of values passed in, so each rule can be
// tested without a database, a network call, or a deletion. The CLI scripts
// (scripts/cleanup-mongodb.mjs, scripts/cleanup-test-firebase.mjs) are the
// only callers and they do the I/O; they perform no guard logic of their own.
//
// THE RULE IS: WHEN ANYTHING IS UNCERTAIN, REFUSE. There is no "guess whether
// this is safe" path, no default that proceeds, and no override flag that skips
// a guard. A guard that cannot prove the target is the approved development/test
// resource throws CleanupSafetyError, and the CLI exits non-zero without
// deleting anything.

/** The one approved development/test MongoDB database these tools may clear. */
export const APPROVED_TEST_DATABASE = 'inventoryai_test_db';

/**
 * The EXPLICIT, HARD-CODED allowlist of MongoDB databases the multi-target
 * cleanup commands may ever clear. The cleanup target is always selected by the
 * command itself — it is NEVER derived from the ambient `MONGODB_DB_NAME` (or any
 * other environment value), so a misconfigured shell cannot silently redirect a
 * cleanup at an unintended database. `all` is not a database; it expands to the
 * three entries below.
 */
export const MONGODB_CLEANUP_TARGETS = Object.freeze({
  test: 'inventoryai_test_db',
  dev: 'inventoryai_dev_db',
  prod: 'inventoryai_prod_db',
});

/** Every approved target, in the order the `all` command clears them. */
export const ALL_MONGODB_CLEANUP_TARGETS = Object.freeze(Object.values(MONGODB_CLEANUP_TARGETS));

/**
 * The extra phrase required before any command that deletes PRODUCTION data
 * (`cleanup:prod-mongodb` and `cleanup:all-mongodb`). Deliberately louder than the
 * per-command phrase so the production step cannot be confirmed by muscle memory.
 * Supplied through the `CLEANUP_PROD_CONFIRM` environment variable.
 */
export const PRODUCTION_CONFIRM_PHRASE = 'DELETE-PRODUCTION-DATA';

/** The one approved development/test Firebase project these tools may clear. */
export const APPROVED_TEST_FIREBASE_PROJECT_ID = 'inventoryai-d0d20';

/**
 * Raised by every guard below when it cannot prove the target is safe. The CLI
 * scripts catch it, print `message`, and exit non-zero. It carries no secret —
 * only database names, project ids and environment names, all non-secret.
 */
export class CleanupSafetyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CleanupSafetyError';
  }
}

/**
 * Names that must never be treated as a non-production environment. Compared
 * case-insensitively after trimming, because NODE_ENV is compared that way
 * everywhere else in the project (config/env.ts).
 */
const PRODUCTION_ENV_NAMES = ['production', 'prod'];

/**
 * Substrings that mark a resource as production-looking. Used as a defensive
 * second signal on top of exact-name matching, so a database or project that is
 * obviously production-flavoured can never be cleared even if a future edit
 * pointed the approved name at it by mistake.
 */
const PRODUCTION_MARKERS = ['prod', 'production', 'live'];

/**
 * True when `nodeEnv` is explicitly a production environment.
 *
 * An UNSET or empty NODE_ENV is deliberately NOT production here — it is handled
 * by `assertNonProductionEnv` below, which refuses it for a different reason
 * (ambiguity). Keeping the two questions separate is what lets the tests pin
 * "production is refused" and "uncertain is refused" independently.
 */
export function isProductionEnv(nodeEnv) {
  return PRODUCTION_ENV_NAMES.includes(String(nodeEnv ?? '').trim().toLowerCase());
}

/**
 * True when `name` looks production-flavoured. Exact-case, substring-based
 * defensive check; never the primary guard.
 */
export function looksProduction(name) {
  const value = String(name ?? '').trim().toLowerCase();
  if (!value) return false;
  return PRODUCTION_MARKERS.some((marker) => value.includes(marker));
}

/**
 * Guard 1 — the process environment must be EXPLICITLY non-production.
 *
 * Refuses production outright, and refuses an unset/blank NODE_ENV too: "we
 * could not tell" is not the same as "it is safe", and this utility is only ever
 * invoked from a development shell where NODE_ENV is set. `approvedEnvValues`
 * names the values that are accepted (default `development`); anything else —
 * including an unrecognised value — is refused rather than assumed.
 *
 * @returns the accepted, trimmed environment value.
 */
export function assertNonProductionEnv(nodeEnv, { approvedEnvValues = ['development'] } = {}) {
  const raw = String(nodeEnv ?? '').trim();
  const value = raw.toLowerCase();

  if (isProductionEnv(raw)) {
    throw new CleanupSafetyError(
      `Refusing to clean: NODE_ENV is "${raw}". These utilities must never run against production.`
    );
  }
  if (!value) {
    throw new CleanupSafetyError(
      'Refusing to clean: NODE_ENV is not set. Set NODE_ENV explicitly to a development/test value ' +
        'so this utility can prove it is not production.'
    );
  }
  if (!approvedEnvValues.includes(value)) {
    throw new CleanupSafetyError(
      `Refusing to clean: NODE_ENV is "${raw}", which is not an approved cleanup environment ` +
        `(${approvedEnvValues.join(', ')}).`
    );
  }
  return value;
}

/**
 * Guard 2 — the MongoDB target must be EXACTLY the approved database, proved
 * twice and independently:
 *
 *   * `configuredName` — what config/env.ts resolved the runtime database to be;
 *   * `liveName`       — the name mongoose actually connected to (`connection.name`).
 *
 * Both are required to equal `expected`. Requiring BOTH is the point: a
 * regression that made the URI's path segment win over `dbName` would leave the
 * configured name correct while the live name pointed somewhere else, and this
 * guard is what catches that. A mismatch on either — or a blank value on either,
 * which means the connection has not happened yet — refuses.
 *
 * Database names are compared EXACTLY (MongoDB names are case-sensitive), so a
 * near-miss is never treated as a match.
 */
export function assertTargetDatabase(
  { configuredName, liveName },
  expected = APPROVED_TEST_DATABASE
) {
  const configured = String(configuredName ?? '').trim();
  const live = String(liveName ?? '').trim();

  if (!configured) {
    throw new CleanupSafetyError('Refusing to clean: the runtime database name could not be resolved.');
  }
  if (!live) {
    throw new CleanupSafetyError(
      'Refusing to clean: the live MongoDB connection database name is empty — the connection ' +
        'has not been established, so the target cannot be verified.'
    );
  }
  if (configured !== expected || live !== expected) {
    throw new CleanupSafetyError(
      `Refusing to clean: target database must be exactly "${expected}" — resolved config says ` +
        `"${configured}", live connection says "${live}". Nothing was deleted.`
    );
  }
  return expected;
}

/**
 * Expand a command selector into the explicit database names to clear.
 *
 * `all` expands to the whole allowlist; `test`/`dev`/`prod` map to one database
 * each. Anything else — including a raw database name, an empty string, or a
 * value read from the environment — is refused, because the ONLY values this
 * accepts are the four the operator can see in `package.json`.
 */
export function resolveMongodbTarget(selector, targets = MONGODB_CLEANUP_TARGETS) {
  const key = String(selector ?? '').trim().toLowerCase();
  if (key === 'all') return [...Object.values(targets)];
  if (!Object.prototype.hasOwnProperty.call(targets, key)) {
    throw new CleanupSafetyError(
      `Refusing to clean: unknown target selector "${String(selector ?? '')}". ` +
        'Allowed selectors: test, dev, prod, all.'
    );
  }
  return [targets[key]];
}

/**
 * Guard — every requested database must be in the explicit allowlist. A name that
 * merely resembles an approved one (case difference, extra character) is refused.
 */
export function assertTargetAllowed(name, targets = MONGODB_CLEANUP_TARGETS) {
  const value = String(name ?? '').trim();
  const allowed = Object.values(targets);
  if (!allowed.includes(value)) {
    throw new CleanupSafetyError(
      `Refusing to clean: "${value}" is not an approved cleanup target. ` +
        `Allowed: ${allowed.join(', ')}.`
    );
  }
  return value;
}

/** True when `name` is the approved production database. */
export function isProductionTarget(name, targets = MONGODB_CLEANUP_TARGETS) {
  return String(name ?? '').trim() === targets.prod;
}

/**
 * Guard — the LIVE connection database must equal the explicitly requested
 * target. This is the fail-closed check that the connection landed where the
 * command said it would; the target is never inferred from the environment.
 */
export function assertLiveTarget({ requested, liveName }) {
  const want = String(requested ?? '').trim();
  const live = String(liveName ?? '').trim();

  if (!want) {
    throw new CleanupSafetyError('Refusing to clean: no target database was requested.');
  }
  if (!live) {
    throw new CleanupSafetyError(
      'Refusing to clean: the live MongoDB connection database name is empty — the connection ' +
        'has not been established, so the target cannot be verified.'
    );
  }
  if (want !== live) {
    throw new CleanupSafetyError(
      `Refusing to clean: requested target "${want}" but the live connection is "${live}". ` +
        'Nothing was deleted.'
    );
  }
  return want;
}

/**
 * Guard — the production confirmation phrase must match EXACTLY. Required in
 * addition to the per-command phrase by every command that deletes production
 * data. Runs only after the environment and target guards have passed.
 */
export function assertProductionConfirmation(provided, phrase = PRODUCTION_CONFIRM_PHRASE) {
  if (String(provided ?? '').trim() !== phrase) {
    throw new CleanupSafetyError(
      'Refusing to clean PRODUCTION data: the production confirmation phrase did not match. ' +
        `Re-run with CLEANUP_PROD_CONFIRM=${phrase} once you have verified the target.`
    );
  }
  return true;
}

/**
 * Guard 3 — the Firebase project must be known, match the approved development/
 * test project, and not look production-flavoured.
 *
 * A missing project id is refused (unknown project), a production-looking id is
 * refused (defensive), and any id other than the approved one is refused. This
 * is exact-match plus a defensive marker check; there is no wildcard.
 */
export function assertFirebaseProject(
  projectId,
  expected = APPROVED_TEST_FIREBASE_PROJECT_ID
) {
  const value = String(projectId ?? '').trim();

  if (!value) {
    throw new CleanupSafetyError(
      'Refusing to clean: the Firebase project id is missing or empty — the target project ' +
        'cannot be verified.'
    );
  }
  if (looksProduction(value)) {
    throw new CleanupSafetyError(
      `Refusing to clean: Firebase project "${value}" looks like a production project.`
    );
  }
  if (value !== expected) {
    throw new CleanupSafetyError(
      `Refusing to clean: Firebase project must be exactly "${expected}", got "${value}". ` +
        'Nothing was deleted.'
    );
  }
  return value;
}

/**
 * Guard 4 — the operator confirmation phrase must match EXACTLY.
 *
 * The phrase is the utility's name for the target, e.g. `cleanup:test-mongodb`.
 * This runs only AFTER the safety guards above have passed, so a wrong phrase
 * can never reach a destructive call, and the phrase check can never be the only
 * thing standing between a mistake and production.
 */
export function assertConfirmation(provided, expectedPhrase) {
  if (String(provided ?? '').trim() !== expectedPhrase) {
    throw new CleanupSafetyError(
      `Refusing to clean: confirmation phrase did not match. Re-run with ` +
        `CLEANUP_CONFIRM=${expectedPhrase} once you have verified the target.`
    );
  }
  return true;
}

/**
 * The confirmation phrase for a given command name. Kept in one place so the CLI
 * scripts, their `--help` text and the tests cannot drift apart.
 */
export function confirmationPhraseFor(commandName) {
  return String(commandName ?? '').trim();
}

export default {
  APPROVED_TEST_DATABASE,
  APPROVED_TEST_FIREBASE_PROJECT_ID,
  MONGODB_CLEANUP_TARGETS,
  ALL_MONGODB_CLEANUP_TARGETS,
  PRODUCTION_CONFIRM_PHRASE,
  CleanupSafetyError,
  isProductionEnv,
  looksProduction,
  assertNonProductionEnv,
  assertTargetDatabase,
  resolveMongodbTarget,
  assertTargetAllowed,
  isProductionTarget,
  assertLiveTarget,
  assertProductionConfirmation,
  assertFirebaseProject,
  assertConfirmation,
  confirmationPhraseFor,
};
