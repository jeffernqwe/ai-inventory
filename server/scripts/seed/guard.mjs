// The ONE target guard every data seeder in the unified workflow calls.
//
// WHY THIS EXISTS. Before 2026-10-26 each seeder checked its own target with
// `assertSafeTarget`, which required ONE phrase and — with `--database=` — allowed
// production. So the phrase count was the same for a throwaway development tenant
// and a real business, and the only thing distinguishing them was which database
// the shell happened to resolve. A seeder that writes real data should cost more
// than a seeder that writes test data, by construction rather than by convention.
//
// THE RULE, and it is deliberately the same rule for every plan:
//
//   1. `--database=<name>` is required, and must equal the database
//      `config/env.ts` RESOLVED for this process. Naming the target is what makes
//      it deliberate; requiring equality is what makes the name honest, since the
//      connection uses the resolved value and never the flag.
//   2. The target must be a KNOWN database — development or production. The test
//      database is refused with its own message, because `npm test` clears it.
//   3. Development needs TWO phrases:
//        SEED_CONFIRM=<the plan's phrase>   — which dataset
//        SEED_DB_CONFIRM=<the database name> — where, typed out
//   4. Production needs THREE: both of the above, plus
//        SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA — that this data is real.
//
// The phrases answer three different questions (what / where / real), so no single
// exported variable can satisfy a production run by habit. A missing phrase is
// reported together with every other missing one, and the count is stated, because
// "you need three" is the part an operator forgets.
//
// Pure and value-driven: `values` defaults to `process.env` but a test passes a bag,
// so the whole rule is asserted without a database, a connection or a write.

import { DATABASE_NAMES } from '../../src/config/env.ts';
import { databaseNameInUri } from '../lib/mongo-uri.mjs';
import { SeedSafetyError } from '../perf/lib.mjs';
// The approved project id is a fact about the project, not about a command, so it is read from the
// cleanup guard that owns it rather than restated here. Two literals would be two opinions.
import { APPROVED_TEST_FIREBASE_PROJECT_ID } from '../cleanup/lib.mjs';

/** The one Firebase project a seeding run may create identities in. */
export const APPROVED_FIREBASE_PROJECT_ID = APPROVED_TEST_FIREBASE_PROJECT_ID;

/** The phrase naming WHAT is seeded. Unchanged: each plan keeps its own. */
export const SEED_CONFIRM_ENV = 'SEED_CONFIRM';

/** The phrase naming WHERE it goes — the resolved database name, typed out. */
export const SEED_DB_CONFIRM_ENV = 'SEED_DB_CONFIRM';

/** The phrase acknowledging that the target holds real data. Production only. */
export const SEED_PROD_CONFIRM_ENV = 'SEED_PROD_CONFIRM';
export const SEED_PROD_CONFIRM_PHRASE = 'SEED-PRODUCTION-DATA';

/**
 * Guard — the identity authority is the OTHER store a seed writes to, and nothing named it.
 *
 * WHY THIS EXISTS. Every guard above names WHERE the data goes (a database, resolved and matched).
 * The Firebase project was left to the shell's credentials, so a shell configured for a different
 * project would create the login THERE while the tenant landed here — and the application joins the
 * two by `firebaseUid` only, so nothing would ever match them up. The result reads as an account
 * that exists and cannot sign in.
 *
 * Exact match, no wildcard, and it runs before the first read of Firebase, so a refused run has
 * touched neither store.
 */
export function assertSeedFirebaseProject(projectId, expected = APPROVED_FIREBASE_PROJECT_ID) {
  const value = String(projectId ?? '').trim();
  if (!value) {
    throw new SeedSafetyError(
      'the Firebase project id is empty, so the identity authority cannot be verified ' +
        '[seed]. Nothing was written.',
    );
  }
  if (value !== expected) {
    throw new SeedSafetyError(
      `this shell is configured for Firebase project "${value}", but a seed creates identities ` +
        `only in "${expected}", which is the project the application verifies tokens against ` +
        '[seed]. Point FIREBASE_PROJECT_ID (and the service account) at the approved project. ' +
        'Nothing was written.',
    );
  }
  return value;
}

/**
 * The plans, and the script each one is. `npm run seed --plan=<key>` dispatches on
 * this map and nothing else, so a plan that is not listed here cannot be reached,
 * and a seeder cannot be added to the workflow without appearing in it.
 *
 * `phrase` is the SAME value the plan's own CLI requires, which is why the two
 * entry points (`npm run seed`, `npm run seed:demo`) accept identical commands: a
 * phrase names the dataset, not the wrapper that launched it.
 */
export const SEED_PLANS = Object.freeze({
  demo: {
    script: 'seed-demo-account.mjs',
    phrase: 'seed-demo-account',
    description: "one account's inventory dataset (the phone's own login, by default)",
  },
  accounts: {
    script: 'seed-accounts.mjs',
    phrase: 'seed-accounts',
    description: 'several accounts at different sizes, for comparing the assistant across tenants',
  },
  roles: {
    script: 'seed-role-accounts.mjs',
    phrase: 'seed-roles',
    description: 'one isolated tenant with a working login per role (OWNER/ADMIN/MANAGER/STAFF)',
  },
});

/** The databases a seeder may ever write to. `test` is named only to refuse it. */
const SEEDABLE_DATABASES = [DATABASE_NAMES.development, DATABASE_NAMES.production];

/**
 * Resolve `--plan=<key>` (or `--plan <key>`) to a plan and the argv without it.
 *
 * Accepts both spellings because `npm run seed -- --plan demo` is what most people
 * type, and refusing it would teach nothing. Anything unrecognised is refused
 * rather than defaulted: a default plan chosen by a forgotten flag is exactly how
 * the wrong dataset lands in the wrong tenant.
 */
export function extractSeedPlanArg(argv = []) {
  const args = [...argv];
  const eq = args.find((a) => a.startsWith('--plan='));
  if (eq) {
    const rest = args.filter((a) => a !== eq);
    return { plan: eq.slice('--plan='.length), rest };
  }
  const at = args.indexOf('--plan');
  if (at !== -1) {
    const value = args[at + 1];
    if (value && !value.startsWith('--')) {
      const rest = [...args];
      rest.splice(at, 2);
      return { plan: value, rest };
    }
    // `--plan` with nothing usable after it: reported as a missing plan below.
    const rest = [...args];
    rest.splice(at, 1);
    return { plan: undefined, rest };
  }
  return { plan: undefined, rest: args };
}

/** The plan record for `plan`, or a refusal naming the ones that exist. */
export function resolveSeedPlan(plan) {
  const key = String(plan ?? '').trim().toLowerCase();
  if (!key) {
    throw new SeedSafetyError(
      '--plan=<demo|accounts|roles> is required, so the run says which dataset it writes. ' +
        'Nothing was written.',
    );
  }
  if (!Object.prototype.hasOwnProperty.call(SEED_PLANS, key)) {
    throw new SeedSafetyError(
      `unknown --plan "${String(plan)}" — expected one of ${Object.keys(SEED_PLANS).join(', ')}. ` +
        'Nothing was written.',
    );
  }
  return { plan: key, ...SEED_PLANS[key] };
}

/** How many phrases this target class requires. Used in messages and in tests. */
export function requiredPhraseCount(database) {
  return String(database ?? '').trim() === DATABASE_NAMES.production ? 3 : 2;
}

/**
 * The fail-closed target check. Called by every seeder BEFORE any connection, any
 * identity lookup and any write — dry runs included, so a dry run proves the
 * destination and the phrases rather than only the shape of the plan.
 *
 * @returns {{ database: string, production: boolean, phrases: number }}
 */
export function assertSeedTarget({
  env,
  command,
  database,
  confirmPhrase,
  values = process.env,
} = {}) {
  const resolved = String(env?.mongodbDbName ?? '').trim();
  const requested = String(database ?? '').trim();
  const production = resolved === DATABASE_NAMES.production;

  if (!env?.mongodbUri) {
    throw new SeedSafetyError(`MONGODB_URI is not set [${command}]. Nothing was written.`);
  }
  if (!resolved) {
    throw new SeedSafetyError(
      `the resolved database name is empty [${command}]. Nothing was written.`,
    );
  }
  if (!requested) {
    throw new SeedSafetyError(
      `--database=<name> is required and must name the database this run targets ` +
        `("${resolved}"), which comes from MONGODB_DB_NAME [${command}]. Nothing was written.`,
    );
  }
  if (requested !== resolved) {
    throw new SeedSafetyError(
      `--database is "${requested}" but this process resolved "${resolved}" [${command}]. ` +
        'Refusing to seed a database the run is not connected to. Nothing was written.',
    );
  }

  // The flag and the resolved name can agree while the shell disagrees with both: a
  // `MONGODB_URI` ending `/inventoryai_prod_db` beside a resolved `inventoryai_dev_db` is a
  // shell configured for the other environment. The connection obeys the resolved name, so
  // this run would be correct — and that is exactly why it stops instead.
  const uriDatabase = databaseNameInUri(env?.mongodbUri);
  if (uriDatabase && uriDatabase !== resolved) {
    throw new SeedSafetyError(
      `MONGODB_URI names the database "${uriDatabase}", but this run resolved "${resolved}" ` +
        `[${command}]. The connection string and the environment were configured for different ` +
        'databases; fix one of them. Nothing was written.',
    );
  }
  if (resolved === DATABASE_NAMES.test) {
    throw new SeedSafetyError(
      `the resolved database is the test database "${resolved}", which "npm test" clears ` +
        `[${command}]. Nothing was written.`,
    );
  }
  if (!SEEDABLE_DATABASES.includes(resolved)) {
    throw new SeedSafetyError(
      `the resolved database is "${resolved}", which is not a seeding target [${command}]. ` +
        `Allowed: ${SEEDABLE_DATABASES.join(', ')}. Nothing was written.`,
    );
  }

  const missing = [];
  if (String(values?.[SEED_CONFIRM_ENV] ?? '').trim() !== confirmPhrase) {
    missing.push(`${SEED_CONFIRM_ENV}=${confirmPhrase}`);
  }
  if (String(values?.[SEED_DB_CONFIRM_ENV] ?? '').trim() !== resolved) {
    missing.push(`${SEED_DB_CONFIRM_ENV}=${resolved}`);
  }
  if (production && String(values?.[SEED_PROD_CONFIRM_ENV] ?? '').trim() !== SEED_PROD_CONFIRM_PHRASE) {
    missing.push(`${SEED_PROD_CONFIRM_ENV}=${SEED_PROD_CONFIRM_PHRASE}`);
  }

  if (missing.length > 0) {
    const need = production ? 'three' : 'two';
    throw new SeedSafetyError(
      `${need} confirmation phrase(s) are required to seed ${resolved}` +
        `${production ? ' (PRODUCTION)' : ''} [${command}], and ${missing.length} ` +
        `${missing.length === 1 ? 'is' : 'are'} missing or wrong: ${missing.join(' AND ')}. ` +
        'Nothing was written.',
    );
  }

  return { database: resolved, production, phrases: production ? 3 : 2 };
}

export default {
  SEED_CONFIRM_ENV,
  SEED_DB_CONFIRM_ENV,
  SEED_PROD_CONFIRM_ENV,
  SEED_PROD_CONFIRM_PHRASE,
  SEED_PLANS,
  extractSeedPlanArg,
  resolveSeedPlan,
  requiredPhraseCount,
  assertSeedTarget,
};
