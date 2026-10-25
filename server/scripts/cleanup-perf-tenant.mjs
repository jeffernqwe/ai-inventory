// `npm run cleanup:perf-tenant -- --database=<name>` — remove the tenant `seed:perf-tenant`
// created, in whatever database this process resolved, and nothing else.
//
// WHY A DIFFERENT COMMAND FROM `cleanup:perf`. `cleanup:perf` shares `assertSafeTarget`, which
// refuses production — correctly, for the tenant `seed:perf` writes on a developer's machine.
// This one is the counterpart of the production-capable seeder, so it uses the same guard
// (`assertNamedDatabaseTarget`): the database must be named on the command line, the test database
// is refused, and `CLEANUP_CONFIRM=cleanup:perf-tenant` is required. A wrong `--database=` value
// is a refusal, not a no-op that looks like success.
//
// IT IS NOT `cleanup:prod-mongodb` AND MUST NEVER BE CONFUSED WITH IT. That command clears whole
// databases by design. This one is scoped by the seed tenant's businessId and refuses to run at all
// if the two fingerprints disagree, so it cannot reach another business even when pointed at the
// production database.
//
// WHAT IT LEAVES BEHIND: the Firebase identity, deliberately. F-50 (`docs/DEVELOPMENT_ROADMAP.md`
// §27BB): a MongoDB user whose Firebase identity is gone can neither sign in nor register, and
// nothing in the application can repair it. The reverse is harmless, so the identity survives for
// the next seeding run — which refreshes its password — and the console says so rather than leaving
// an operator to wonder.
//
// Usage:
//   CLEANUP_CONFIRM=cleanup:perf-tenant \
//     npm run cleanup:perf-tenant -- --database=inventoryai_prod_db
//
// Safe to run when nothing was ever seeded: it reports that and exits 0.

import 'dotenv/config';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import {
  PERF_TENANT_CLEANUP_CONFIRM,
  SEED_OWNER_EMAIL,
  SeedSafetyError,
  assertNamedDatabaseTarget,
  countTenantLeftovers,
  findSeedTenantIds,
  removeTenant,
} from './perf/lib.mjs';

const COMMAND = 'cleanup:perf-tenant';

function argValue(flag, argv = process.argv) {
  const prefix = `${flag}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function fail(message) {
  console.error(`[${COMMAND}] ${message}`);
  process.exit(1);
}

async function main() {
  let database;
  try {
    database = assertNamedDatabaseTarget({
      mongodbUri: env.mongodbUri,
      resolvedDbName: env.mongodbDbName,
      requestedDatabase: argValue('--database'),
      confirm: process.env.CLEANUP_CONFIRM,
      confirmPhrase: PERF_TENANT_CLEANUP_CONFIRM,
      confirmEnvVar: 'CLEANUP_CONFIRM',
      command: COMMAND,
    });
  } catch (err) {
    if (err instanceof SeedSafetyError) fail(err.message);
    throw err;
  }

  console.log(`[${COMMAND}] database : ${database}${database === 'inventoryai_prod_db' ? '   (PRODUCTION)' : ''}`);

  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });

  const ids = await findSeedTenantIds();
  if (ids.length === 0) {
    console.log(`[${COMMAND}] nothing to clean — no seed tenant exists in ${database}.`);
    await mongoose.disconnect();
    return;
  }
  if (ids.length > 1) {
    // Two ids means the business name and the owner email point at different tenants. Deleting
    // either one would be a guess, and the guess could be a real account's business.
    fail(
      `the seed fingerprints disagree: ${ids.join(', ')}. Refusing to guess which to remove — ` +
        'inspect both before deleting anything. Nothing was removed.',
    );
  }

  console.log(`[${COMMAND}] tenant    : ${ids[0]}`);
  const { removed, counts } = await removeTenant(ids);
  for (const [collection, count] of Object.entries(counts)) {
    if (count > 0) console.log(`[${COMMAND}]   ${collection.padEnd(24)} ${count}`);
  }

  // Prove it rather than assert it, over the same collection list the removal used.
  const leftovers = await countTenantLeftovers(ids);
  if (leftovers !== 0) {
    fail(
      `verification failed: ${leftovers} document(s) still reference ${ids[0]}. The teardown is ` +
        'incomplete — inspect before re-running anything.',
    );
  }

  console.log(`[${COMMAND}] OK — removed ${removed} document(s); verification found 0 remaining.`);
  console.log(
    `[${COMMAND}] kept      : the Firebase identity for ${SEED_OWNER_EMAIL} (F-50) — the next ` +
      'seed reuses it and refreshes its password',
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof SeedSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
