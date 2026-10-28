// Shared pieces of the performance-seed tooling (`seed:perf` / `cleanup:perf`).
//
// Split out for the same reason `scripts/cleanup/lib.mjs` exists: the destructive
// half and the creative half must agree on what the seed tenant IS, and a second
// copy of that knowledge is how a cleanup script eventually deletes something the
// seed never created. There is exactly one definition of the marker and one
// function that removes a tenant, and both scripts import it.
//
// Nothing here runs on import: no `main()`, no connection, no write. A library
// that acts when you read it is how a "cleanup" script seeds a database by
// accident.


import { DATABASE_NAMES, classifyNodeEnv, isRecognisedNodeEnv } from '../../src/config/env.ts';
import Business from '../../src/models/business.model.ts';
import User from '../../src/models/user.model.ts';

/** The confirmation phrase both commands require in the environment. */
export const SEED_CONFIRM_PHRASE = 'seed-perf-ai';

/** The seed tenant's fingerprint. Every lookup and every delete is anchored here. */
export const SEED_BUSINESS_NAME = 'PERF SEED — AI assistant stress test (do not use)';
export const SEED_OWNER_EMAIL = 'perf-seed-ai@example.invalid';

export class SeedSafetyError extends Error {}

/**
 * The environment, as these tools are allowed to see it.
 *
 * `assertSafeTarget` used to compare `NODE_ENV` to the string `production`, which answers
 * "safe" to an unset value, to `Production`, and to `prod` — and `prod` then resolved to the
 * DEVELOPMENT database, so a seeder ran against a database the operator had not named while
 * believing the guard had considered the question. The server refused that class of value on
 * 2026-10-22 (`config/startup.ts`); a script that writes or deletes data must not be the last
 * place that guesses.
 *
 * One classifier, three outcomes: `production` refuses because these tools never touch it, a
 * RECOGNISED non-production value proceeds to the database check, and anything the classifier
 * cannot name (`missing`, `unrecognised` — including `prod`, `Production`, `staging`) refuses as
 * AMBIGUOUS, because it cannot prove which posture it would be writing under.
 */
function assertNamedEnvironment(command, { what = 'written or deleted' } = {}) {
  const kind = classifyNodeEnv(process.env.NODE_ENV);

  if (kind === 'production') {
    throw new SeedSafetyError(
      `NODE_ENV=production. Refusing [${command}]: these tools must never run against production. ` +
        `Nothing was ${what}.`,
    );
  }
  if (!isRecognisedNodeEnv(kind)) {
    // The VALUE is deliberately not echoed: a typo is an arbitrary string.
    const which = kind === 'missing' ? 'NODE_ENV is not set' : 'NODE_ENV is not one of development, test, production';
    throw new SeedSafetyError(
      `${which}, so the environment is ambiguous [${command}]: set NODE_ENV=development so this ` +
        `tool can prove which database it would use. Nothing was ${what}.`,
    );
  }
  return kind;
}

/**
 * Fail-closed target check, before any connection and any write.
 *
 * The database is the one `config/env.ts` RESOLVES, not the ambient variable, so
 * this cannot be satisfied by editing an env var that the connection ignores. The
 * test database is refused as firmly as production: `npm test` clears it, so seeded
 * rows there would vanish
 * mid-experiment and the measurement would be of an empty tenant.
 *
 * PRODUCTION IS REACHABLE ONLY BY NAMING IT (2026-10-25). Called without `database`, this is
 * still the development-only guard every caller has always had. Called with `database` — the
 * value of `--database=` — the rules become `assertNamedDatabaseTarget`'s: the name must equal
 * the database this process resolved, the test database is refused, and the command's own
 * phrase is required. One guard serves both postures, so a shell that forgets the flag cannot
 * reach production, and the account seeders did not need a second, weaker copy of the rule.
 *
 * `confirmEnvVar` defaults to `SEED_CONFIRM`, the variable every seeder already exports. A
 * cleanup passes `CLEANUP_CONFIRM` so a destructive command reads its phrase from the variable
 * its own name implies — and so the two families cannot be satisfied by one habitual export.
 */
export function assertSafeTarget(
  env,
  command,
  {
    confirmPhrase = SEED_CONFIRM_PHRASE,
    database,
    what = 'written or deleted',
    confirmEnvVar = 'SEED_CONFIRM',
  } = {},
) {
  const requestedDatabase = String(database ?? '').trim();
  if (requestedDatabase) {
    // The named form. `assertNamedDatabaseTarget` also refuses the test database, an empty
    // name, a name the run is not connected to, and a missing phrase — so this branch cannot
    // be weaker than the one below; it is the same rule with production permitted.
    return assertNamedDatabaseTarget({
      mongodbUri: env.mongodbUri,
      resolvedDbName: env.mongodbDbName,
      requestedDatabase,
      confirm: process.env[confirmEnvVar],
      confirmPhrase,
      confirmEnvVar,
      command,
      what,
    });
  }

  assertNamedEnvironment(command);
  if (!env.mongodbUri) {
    throw new SeedSafetyError('MONGODB_URI is not set. Nothing was written or deleted.');
  }
  if (env.mongodbDbName !== DATABASE_NAMES.development) {
    throw new SeedSafetyError(
      `the resolved database is "${env.mongodbDbName}", not the development database ` +
        `"${DATABASE_NAMES.development}". Refusing (the test database is cleared by ` +
        '`npm test`). Nothing was written or deleted.',
    );
  }
  // The phrase is passed in so a second seeder (the demo-account one) can share this
  // single target guard instead of copying it — the copy is how two seeders drift
  // apart on what "safe" means.
  if (process.env[confirmEnvVar] !== confirmPhrase) {
    throw new SeedSafetyError(`set ${confirmEnvVar}=${confirmPhrase} to proceed. [${command}]`);
  }
}

/**
 * The same environment rule for MEASUREMENT tools, which read (and sometimes write AI conversation
 * rows) but never seed a tenant.
 *
 * They do not need a confirmation phrase — measuring is not destructive — but they do need to know
 * which database they are about to read and spend AI quota against. A measurement run on the wrong
 * database is not merely useless: `perf:turns` writes conversation rows and spends the shared free
 * allowance, so "which database did that go to?" has to be answerable before it starts.
 *
 * Allowed: the development or test database, under a recognised non-production environment. The
 * production database is refused by name as well as by posture, so a `NODE_ENV=development` shell
 * pointed at `inventoryai_prod_db` is still refused.
 */
export function assertReadableTarget(
  env,
  command,
  { allowed = [DATABASE_NAMES.development, DATABASE_NAMES.test] } = {},
) {
  assertNamedEnvironment(command, { what: 'read or spent' });
  if (!env.mongodbUri) {
    throw new SeedSafetyError(`MONGODB_URI is not set [${command}]. Nothing was read or spent.`);
  }
  if (!allowed.includes(env.mongodbDbName)) {
    throw new SeedSafetyError(
      `the resolved database is "${env.mongodbDbName}", which is not one of ` +
        `${allowed.join(', ')} [${command}]. Nothing was read or spent.`,
    );
  }
}

/**
 * The confirmation phrases for the PRODUCTION-CAPABLE performance tenant.
 *
 * Distinct from `seed:perf`'s `seed-perf-ai` on purpose: that phrase belongs to a tool that refuses
 * production, and reusing it here would let a shell history entry reach the wrong database.
 */
export const PERF_TENANT_SEED_CONFIRM = 'seed:perf-tenant';
export const PERF_TENANT_CLEANUP_CONFIRM = 'cleanup:perf-tenant';

/**
 * The phrase `perf:turns` requires before it measures against a database that is not development
 * or test — production above all. A measurement spends the shared AI allowance and reads real
 * rows, so the target is named and confirmed rather than inferred from `--base`.
 */
export const PERF_TURNS_PROD_CONFIRM = 'perf-turns:production';

/**
 * The named-database primitive behind `assertSafeTarget`'s named form.
 *
 * It was written for `seed:perf-tenant` / `cleanup:perf-tenant` and is no longer called by
 * them: since 2026-10-27 they use the unified `assertSeedTarget` / `assertScopedCleanupTarget`
 * (two phrases in development, three in production). The function remains because
 * `assertSafeTarget`'s named form delegates here, and it is the one place a production-capable
 * command's target rule is stated rather than copied.
 *
 * WHY PRODUCTION IS ALLOWED HERE AT ALL. `assertSafeTarget` refuses it deliberately, because
 * `seed:perf` writes tens of thousands of documents for query measurement on a developer's
 * machine. But the only database a store build can reach is the production one, so a large
 * dataset the phone can actually be signed into has to be seedable there. Rather than weaken
 * that guard for its existing callers, this one states its own terms, and every term is about
 * making the target DELIBERATE rather than merely permitted:
 *
 *   * `--database=<name>` is required and must equal the database `config/env.ts` resolved;
 *     the connection's `dbName` comes from config, never from the URI's path segment, so this
 *     is the only way to name what will actually be touched.
 *   * the test database is refused outright, because `npm test` clears it.
 *   * a phrase unique to these two commands is required.
 *   * nothing is removed outside the tenant the fingerprints identify — see `findSeedTenantIds`.
 */
export function assertNamedDatabaseTarget({
  mongodbUri,
  resolvedDbName,
  requestedDatabase,
  confirm,
  confirmPhrase,
  confirmEnvVar = 'SEED_CONFIRM',
  command,
  what = 'written or deleted',
}) {
  const resolved = String(resolvedDbName ?? '').trim();
  const requested = String(requestedDatabase ?? '').trim();

  if (!mongodbUri) {
    throw new SeedSafetyError(`MONGODB_URI is not set [${command}]. Nothing was ${what}.`);
  }
  if (!resolved) {
    throw new SeedSafetyError(`the resolved database name is empty [${command}]. Nothing was ${what}.`);
  }
  if (!requested) {
    throw new SeedSafetyError(
      `--database=<name> is required and must name the database this run targets ("${resolved}") ` +
        `[${command}]. Naming it is what makes the target deliberate. Nothing was ${what}.`,
    );
  }
  if (requested !== resolved) {
    throw new SeedSafetyError(
      `--database is "${requested}" but the resolved database is "${resolved}" [${command}]. ` +
        `Refusing to touch a database the run is not connected to. Nothing was ${what}.`,
    );
  }
  if (resolved === DATABASE_NAMES.test) {
    throw new SeedSafetyError(
      `the resolved database is the test database "${DATABASE_NAMES.test}", which "npm test" ` +
        `clears [${command}]. Nothing was ${what}.`,
    );
  }
  if (String(confirm ?? '').trim() !== confirmPhrase) {
    throw new SeedSafetyError(
      `set ${confirmEnvVar}='${confirmPhrase}' to proceed [${command}]. Nothing was ${what}.`,
    );
  }
  return resolved;
}

/**
 * Target check for a MEASUREMENT that may point at production (`perf:turns`).
 *
 * A measurement against production reads real rows and spends the shared AI allowance, so the
 * question "which database is this?" must be answerable before the first request. Development and
 * the test database are allowed as before. Anything else — production included — must be NAMED on
 * the command line and confirmed with a phrase, because `--base=https://…` alone does not say which
 * database the ground truth in this process is being read from.
 */
export function assertMeasurementTarget({
  mongodbUri,
  resolvedDbName,
  requestedDatabase,
  confirm,
  confirmPhrase,
  confirmEnvVar = 'PERF_TURNS_CONFIRM',
  command,
  allowed = [DATABASE_NAMES.development, DATABASE_NAMES.test],
}) {
  const resolved = String(resolvedDbName ?? '').trim();
  const requested = String(requestedDatabase ?? '').trim();

  if (!mongodbUri) {
    throw new SeedSafetyError(`MONGODB_URI is not set [${command}]. Nothing was read or spent.`);
  }
  if (!resolved) {
    throw new SeedSafetyError(
      `the resolved database name is empty [${command}]. Nothing was read or spent.`,
    );
  }
  if (allowed.includes(resolved)) {
    if (requested && requested !== resolved) {
      throw new SeedSafetyError(
        `--database is "${requested}" but the resolved database is "${resolved}" [${command}]. ` +
          'Nothing was read or spent.',
      );
    }
    return { database: resolved, production: false };
  }
  if (requested !== resolved) {
    throw new SeedSafetyError(
      `the resolved database is "${resolved}", which these measurements do not use by default ` +
        `[${command}]. Name it with --database=${resolved} to proceed. Nothing was read or spent.`,
    );
  }
  if (String(confirm ?? '').trim() !== confirmPhrase) {
    throw new SeedSafetyError(
      `measuring against "${resolved}" needs ${confirmEnvVar}='${confirmPhrase}' [${command}]. ` +
        'Nothing was read or spent.',
    );
  }
  return { database: resolved, production: resolved === DATABASE_NAMES.production };
}

/**
 * The tenant teardown lives in application code, not only in this library.
 *
 * `clearTenantData` / `removeTenant` / `countTenantRemoval` / `countTenantDataRemoval`
 * / `countTenantLeftovers` and the teardown plan moved to
 * `src/services/tenantTeardown.service.ts` when account deletion needed the same
 * definition: a business whose last member closes their account is removed with exactly
 * the rows this tooling removes. They are re-exported here so every script keeps ONE
 * import site and the project keeps ONE plan — a second copy in the service is how a
 * teardown eventually deletes less than a seed created.
 *
 * `countTenantRemoval` and `countTenantDataRemoval` are the counting half of that same
 * plan, added for the cleanup dry runs: they walk the same steps, in the same order, and
 * delete nothing.
 */
export {
  TENANT_DATA_COLLECTIONS,
  TENANT_TEARDOWN_PLAN,
  clearTenantData,
  countTenantRemoval,
  countTenantDataRemoval,
  countTenantLeftovers,
  removeTenant,
} from '../../src/services/tenantTeardown.service.ts';

/**
 * Target check for a READ-ONLY script that may inspect production (`verify:demo`).
 *
 * Development and the test database need no naming, exactly as before. Anything else —
 * production included — must be NAMED on the command line, because "which database did these
 * numbers come from?" has to be answerable before the first query. There is deliberately no
 * confirmation phrase: nothing is written, deleted or spent, so a phrase would protect nothing
 * that the database name does not already make deliberate.
 */
export function assertNamedReadTarget({
  mongodbUri,
  resolvedDbName,
  requestedDatabase,
  command,
  allowed = [DATABASE_NAMES.development, DATABASE_NAMES.test],
}) {
  const resolved = String(resolvedDbName ?? '').trim();
  const requested = String(requestedDatabase ?? '').trim();

  if (!mongodbUri) {
    throw new SeedSafetyError(`MONGODB_URI is not set [${command}]. Nothing was read.`);
  }
  if (!resolved) {
    throw new SeedSafetyError(`the resolved database name is empty [${command}]. Nothing was read.`);
  }
  if (allowed.includes(resolved)) {
    if (requested && requested !== resolved) {
      throw new SeedSafetyError(
        `--database is "${requested}" but the resolved database is "${resolved}" [${command}]. ` +
          'Nothing was read.',
      );
    }
    return resolved;
  }
  if (requested && requested !== resolved) {
    throw new SeedSafetyError(
      `--database is "${requested}" but the resolved database is "${resolved}" [${command}]. ` +
        'Nothing was read.',
    );
  }
  if (!requested) {
    throw new SeedSafetyError(
      `the resolved database is "${resolved}", which is not read by default [${command}]. ` +
        `Name it with --database=${resolved} to proceed. Nothing was read.`,
    );
  }
  return resolved;
}

/**
 * Every businessId that matches BOTH fingerprints, not either one.
 *
 * WHY THE INTERSECTION (measured 2026-10-28). The old implementation UNIONED the
 * businesses whose marker name matched with those whose owner address matched. A real
 * business that happened to carry the marker name was therefore returned by a cleanup
 * whose owner had nothing to do with it, and the production-capable cleanup would have
 * deleted it. Two independent fingerprints only identify one tenant when they AGREE.
 * This pure function returns nothing for a half-state; `findSeedTenantIds` below turns that
 * state into a refusal, so a cleanup cannot report "nothing to clean" while one half exists and
 * a seed cannot create a second business it would then fail to own.
 */
export function seedTenantIdsFrom({ nameBusinessIds = [], ownerBusinessIds = [] } = {}) {
  const owned = new Set(ownerBusinessIds.filter(Boolean).map(String));
  return [...new Set(nameBusinessIds.filter(Boolean).map(String))].filter((id) => owned.has(id));
}

/**
 * The refusal for a fingerprint state that names no single tenant.
 *
 * A HALF-STATE is the dangerous one: the marker business exists but the owner row is gone, or
 * the owner row points at a business that is not named. `seedTenantIdsFrom` returns no id, which
 * is safe for a delete but would let a seed create a SECOND business and then die on the unique
 * email index, leaving an empty tenant. Naming the state is what turns that into a stop.
 */
export function seedTenantFingerprintProblem({ nameBusinessIds = [], ownerBusinessIds = [] } = {}) {
  const names = [...new Set((nameBusinessIds ?? []).filter(Boolean).map(String))];
  const owners = [...new Set((ownerBusinessIds ?? []).filter(Boolean).map(String))];
  const matched = seedTenantIdsFrom({ nameBusinessIds: names, ownerBusinessIds: owners });

  if (matched.length > 1) {
    return (
      `${matched.length} businesses match both seed fingerprints (${matched.join(', ')}). Refusing ` +
      'to guess which is the test tenant. Nothing was changed.'
    );
  }
  if (!matched.length && (names.length || owners.length)) {
    return (
      'the seed tenant is in a half-state: the marker name and the owner address point at ' +
      `different businesses (name: ${names.join(', ') || '(none)'}; owner: ` +
      `${owners.join(', ') || '(none)'}). Refusing to guess at a repair. Nothing was changed.`
    );
  }
  return null;
}

/** Every businessId that matches BOTH fingerprints, and the two halves when they do not. */
export async function findSeedTenantFingerprints() {
  const byName = await Business.find({ name: SEED_BUSINESS_NAME }).select('_id').lean();
  const byOwner = await User.find({ email: SEED_OWNER_EMAIL }).select('businessId').lean();
  return {
    nameBusinessIds: byName.map((b) => b._id),
    ownerBusinessIds: byOwner.map((u) => u.businessId),
    matched: seedTenantIdsFrom({
      nameBusinessIds: byName.map((b) => b._id),
      ownerBusinessIds: byOwner.map((u) => u.businessId),
    }),
  };
}

/** The database half of the rule above; a half-state is refused, never returned as "nothing". */
export async function findSeedTenantIds() {
  const fingerprints = await findSeedTenantFingerprints();
  const problem = seedTenantFingerprintProblem(fingerprints);
  if (problem) throw new SeedSafetyError(problem);
  return fingerprints.matched;
}

