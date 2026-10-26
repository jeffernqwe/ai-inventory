// The ONE target guard every destructive cleanup command calls.
//
// WHY THIS EXISTS. The seeding workflow (`scripts/seed/guard.mjs`) settled a rule on
// 2026-10-26: name the target, prove the name matches what the process resolved, and
// demand one phrase per question the run answers — what, where, and (for production)
// is this real. Cleanup kept a different rule: `NODE_ENV` had to say `development`,
// production was selected by a `--target=prod` alias, and the phrase named the
// wrapper script rather than the thing being deleted. Two rules for the same
// question is how an operator learns the wrong one.
//
// THE RULE, deliberately identical in shape to the seeder's:
//
//   1. `--database=<name>` is required, and must equal the database `config/env.ts`
//      RESOLVED for this process. The connection uses the resolved value, never the
//      flag, so requiring equality is what makes the name honest.
//   2. The target must be a KNOWN database — development or production. The test
//      database is refused with its own message, because `npm test` owns it.
//   3. Development needs TWO phrases:
//        CLEANUP_CONFIRM=<cleanup:database|cleanup:firebase> — which command
//        CLEANUP_DB_CONFIRM=<the database name>            — where, typed out
//   4. Production needs THREE: both of the above, plus
//        CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA       — that this data is real.
//
// A missing phrase is reported together with every other missing one, and the count
// is stated, because "you need three" is the part an operator forgets.
//
// Pure and value-driven: `values` defaults to `process.env`, so the whole rule is
// asserted in tests without a database, a connection or a deletion.

import { DATABASE_NAMES } from '../../src/config/env.ts';
import { databaseNameInUri } from '../lib/mongo-uri.mjs';
import { CleanupSafetyError, PRODUCTION_CONFIRM_PHRASE } from './lib.mjs';

/** The phrase naming WHICH destructive command is running. */
export const CLEANUP_CONFIRM_ENV = 'CLEANUP_CONFIRM';

/** The phrase naming WHERE it acts — the resolved database name, typed out. */
export const CLEANUP_DB_CONFIRM_ENV = 'CLEANUP_DB_CONFIRM';

/** The phrase acknowledging that the target holds real data. Production only. */
export const CLEANUP_PROD_CONFIRM_ENV = 'CLEANUP_PROD_CONFIRM';
export const CLEANUP_PROD_CONFIRM_PHRASE = PRODUCTION_CONFIRM_PHRASE;

/**
 * The two things `npm run cleanup` can destroy, and the script that does it.
 *
 * `phrase` is what `CLEANUP_CONFIRM` must equal. Because it is derived from the
 * target rather than typed by the caller, a run cannot be confirmed by the phrase
 * that belongs to a different command: naming `cleanup:database` while asking for
 * `--target=firebase` is refused before anything is opened.
 */
export const CLEANUP_TARGETS = Object.freeze({
  database: {
    script: 'cleanup-mongodb.mjs',
    phrase: 'cleanup:database',
    description: 'every document in one named database (structure and indexes preserved)',
  },
  firebase: {
    script: 'cleanup-firebase-accounts.mjs',
    phrase: 'cleanup:firebase',
    description: 'the Firebase Authentication identities you name, and nothing else',
  },
});

/** The databases a cleanup may ever clear. `test` is named below only to refuse it. */
export const CLEANABLE_DATABASES = [DATABASE_NAMES.development, DATABASE_NAMES.production];

/**
 * Resolve `--target=<key>` (or `--target <key>`) to a target record and the argv
 * without it, so the engine scripts still see their own flags unchanged.
 *
 * Both spellings are accepted because `npm run cleanup -- --target database` is what
 * most people type. Anything unrecognised is refused rather than defaulted — a
 * default target chosen by a forgotten flag is exactly how the wrong resource goes.
 */
export function extractCleanupTargetArg(argv = []) {
  const args = [...argv];
  const eq = args.find((a) => a.startsWith('--target='));
  if (eq) {
    return { target: eq.slice('--target='.length), rest: args.filter((a) => a !== eq) };
  }
  const at = args.indexOf('--target');
  if (at !== -1) {
    const value = args[at + 1];
    const rest = [...args];
    if (value && !value.startsWith('--')) {
      rest.splice(at, 2);
      return { target: value, rest };
    }
    rest.splice(at, 1);
    return { target: undefined, rest };
  }
  return { target: undefined, rest: args };
}

/** The target record for `target`, or a refusal naming the ones that exist. */
export function resolveCleanupTarget(target) {
  const key = String(target ?? '').trim().toLowerCase();
  if (!key) {
    throw new CleanupSafetyError(
      '--target=<database|firebase> is required, so the run says what it deletes. Nothing was deleted.',
    );
  }
  if (!Object.prototype.hasOwnProperty.call(CLEANUP_TARGETS, key)) {
    throw new CleanupSafetyError(
      `unknown --target "${String(target)}" — expected one of ${Object.keys(CLEANUP_TARGETS).join(', ')}. ` +
        'Nothing was deleted.',
    );
  }
  return { target: key, ...CLEANUP_TARGETS[key] };
}

/** How many phrases this target class requires. Used in messages and in tests. */
export function requiredCleanupPhraseCount(database) {
  return String(database ?? '').trim() === DATABASE_NAMES.production ? 3 : 2;
}

/**
 * The fail-closed target check. Called by every cleanup engine BEFORE it opens a
 * connection, resolves an identity or deletes anything — dry runs included, so a dry
 * run proves the destination and the phrases rather than only the shape of the plan.
 *
 * @returns {{ target: string, database: string, production: boolean, phrases: number }}
 */
export function assertCleanupTarget({ env, target, database, values = process.env } = {}) {
  const record = resolveCleanupTarget(target);
  const command = `cleanup:${record.target}`;
  const resolved = String(env?.mongodbDbName ?? '').trim();
  const requested = String(database ?? '').trim();
  const production = resolved === DATABASE_NAMES.production;

  if (!env?.mongodbUri) {
    throw new CleanupSafetyError(`MONGODB_URI is not set [${command}]. Nothing was deleted.`);
  }
  if (!resolved) {
    throw new CleanupSafetyError(
      `the resolved database name is empty [${command}]. Nothing was deleted.`,
    );
  }
  if (!requested) {
    throw new CleanupSafetyError(
      `--database=<name> is required and must name the database this run targets ` +
        `("${resolved}"), which comes from MONGODB_DB_NAME [${command}]. Nothing was deleted.`,
    );
  }
  if (requested !== resolved) {
    throw new CleanupSafetyError(
      `--database is "${requested}" but this process resolved "${resolved}" [${command}]. ` +
        'Refusing to clean a database the run is not connected to. Nothing was deleted.',
    );
  }

  // The phrases and the flag can agree with each other and still disagree with the shell: a
  // `MONGODB_URI` ending `/inventoryai_prod_db` beside a resolved `inventoryai_dev_db` means the
  // operator's environment was written for a different database. The connection obeys the
  // resolved name (so this run would be correct) but the shell is not, and a destructive command
  // stops on that rather than deleting the right database unexpectedly.
  const uriDatabase = databaseNameInUri(env?.mongodbUri);
  if (uriDatabase && uriDatabase !== resolved) {
    throw new CleanupSafetyError(
      `MONGODB_URI names the database "${uriDatabase}", but this run resolved "${resolved}" ` +
        `[${command}]. The connection string and the environment were configured for different ` +
        'databases; fix one of them. Nothing was deleted.',
    );
  }
  if (resolved === DATABASE_NAMES.test) {
    throw new CleanupSafetyError(
      `the resolved database is the test database "${resolved}", which "npm test" owns ` +
        `[${command}]. Nothing was deleted.`,
    );
  }
  if (!CLEANABLE_DATABASES.includes(resolved)) {
    throw new CleanupSafetyError(
      `the resolved database is "${resolved}", which is not a cleanup target [${command}]. ` +
        `Allowed: ${CLEANABLE_DATABASES.join(', ')}. Nothing was deleted.`,
    );
  }

  const providedConfirm = String(values?.[CLEANUP_CONFIRM_ENV] ?? '').trim();
  const otherPhrase = Object.values(CLEANUP_TARGETS).find((t) => t.phrase === providedConfirm);
  if (otherPhrase && providedConfirm !== record.phrase) {
    throw new CleanupSafetyError(
      `${CLEANUP_CONFIRM_ENV} names "${providedConfirm}", but this run is [${command}], which ` +
        `needs ${CLEANUP_CONFIRM_ENV}=${record.phrase}. Nothing was deleted.`,
    );
  }

  const missing = [];
  if (providedConfirm !== record.phrase) {
    missing.push(`${CLEANUP_CONFIRM_ENV}=${record.phrase}`);
  }
  if (String(values?.[CLEANUP_DB_CONFIRM_ENV] ?? '').trim() !== resolved) {
    missing.push(`${CLEANUP_DB_CONFIRM_ENV}=${resolved}`);
  }
  if (production && String(values?.[CLEANUP_PROD_CONFIRM_ENV] ?? '').trim() !== CLEANUP_PROD_CONFIRM_PHRASE) {
    missing.push(`${CLEANUP_PROD_CONFIRM_ENV}=${CLEANUP_PROD_CONFIRM_PHRASE}`);
  }

  if (missing.length > 0) {
    const need = production ? 'three' : 'two';
    throw new CleanupSafetyError(
      `${need} confirmation phrase(s) are required to clean ${resolved}` +
        `${production ? ' (PRODUCTION)' : ''} [${command}], and ${missing.length} ` +
        `${missing.length === 1 ? 'is' : 'are'} missing or wrong: ${missing.join(' AND ')}. ` +
        'Nothing was deleted.',
    );
  }

  return { target: record.target, database: resolved, production, phrases: production ? 3 : 2 };
}

export default {
  CLEANUP_CONFIRM_ENV,
  CLEANUP_DB_CONFIRM_ENV,
  CLEANUP_PROD_CONFIRM_ENV,
  CLEANUP_PROD_CONFIRM_PHRASE,
  CLEANUP_TARGETS,
  CLEANABLE_DATABASES,
  extractCleanupTargetArg,
  resolveCleanupTarget,
  requiredCleanupPhraseCount,
  assertCleanupTarget,
};
