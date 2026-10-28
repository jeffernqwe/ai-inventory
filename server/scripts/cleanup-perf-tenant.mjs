// `npm run cleanup:perf-tenant -- --database=<name> [--dry-run]` — remove the tenant
// `seed:perf-tenant` created, in whatever database this process resolved, and nothing else.
//
// WHY A DIFFERENT COMMAND FROM `cleanup:perf`. `cleanup:perf` shares `assertSafeTarget`, which
// is the development-only guard: it refuses production, correctly, for the tenant `seed:perf`
// writes on a developer's machine. This one is the production-capable counterpart, so it uses
// `assertScopedCleanupTarget` — the same rule every other scoped cleanup uses. The database must
// be named on the command line and must equal the one `config/env.ts` resolved; the test database
// is refused; and the run costs TWO phrases in development or THREE in production:
//
//   CLEANUP_CONFIRM      = cleanup:perf-tenant
//   CLEANUP_DB_CONFIRM   = <the resolved database name>
//   CLEANUP_PROD_CONFIRM = DELETE-PRODUCTION-DATA        (production only)
//
// Before 2026-10-27 this command used its own one-phrase guard (`assertNamedDatabaseTarget`),
// which made it the cheapest way to delete production rows — exactly the asymmetry the unified
// rule exists to remove. A wrong `--database=` value is now a refusal, not a no-op that looks
// like success.
//
// --dry-run COUNTS AND STOPS. It runs the same guard as a real run, resolves the same tenant, and
// asks `countTenantRemoval` — the counting mirror of `removeTenant` — what a real run would delete.
// It deletes nothing, touches no Firebase identity and is the honest way to inspect a production
// tenant first. A dry run is not a weaker run: it costs the same phrases.
//
// IT IS NOT `npm run cleanup --target=database` AND MUST NEVER BE CONFUSED WITH IT. That command
// clears whole databases by design. This one is scoped by the seed tenant's businessId and refuses
// to run at all if the two fingerprints disagree, so it cannot reach another business even when
// pointed at the production database.
//
// WHAT IT LEAVES BEHIND: the Firebase identity, deliberately. F-50 (`docs/DEVELOPMENT_ROADMAP.md`
// §27BB): a MongoDB user whose Firebase identity is gone can neither sign in nor register, and
// nothing in the application can repair it. The reverse is harmless, so the identity survives for
// the next seeding run — which refreshes its password — and the console says so rather than leaving
// an operator to wonder.
//
// Usage:
//   CLEANUP_CONFIRM=cleanup:perf-tenant CLEANUP_DB_CONFIRM=inventoryai_prod_db \
//     CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
//     npm run cleanup:perf-tenant -- --database=inventoryai_prod_db --dry-run
//
// Then, only after reading that count, drop `--dry-run` to delete.
//
// Safe to run when nothing was ever seeded: it reports that and exits 0.

import 'dotenv/config';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import {
  PERF_TENANT_CLEANUP_CONFIRM,
  SEED_OWNER_EMAIL,
  SeedSafetyError,
  countTenantLeftovers,
  countTenantRemoval,
  findSeedTenantIds,
  removeTenant,
} from './perf/lib.mjs';
import { assertScopedCleanupTarget } from './cleanup/guard.mjs';

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

function printCounts(counts) {
  for (const [collection, count] of Object.entries(counts)) {
    if (count > 0) console.log(`[${COMMAND}]   ${collection.padEnd(24)} ${count}`);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  let database;
  try {
    database = assertScopedCleanupTarget({
      env,
      command: COMMAND,
      confirmPhrase: PERF_TENANT_CLEANUP_CONFIRM,
      database: argValue('--database'),
    }).database;
  } catch (err) {
    if (err instanceof SeedSafetyError) fail(err.message);
    fail(err && err.message ? err.message : String(err));
  }

  console.log(
    `[${COMMAND}] database : ${database}${database === 'inventoryai_prod_db' ? '   (PRODUCTION)' : ''}`,
  );
  if (dryRun) console.log(`[${COMMAND}] mode     : DRY RUN — counting only, nothing will be deleted`);

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
      `${ids.length} businesses match both seed fingerprints (${ids.join(', ')}). Refusing to ` +
        'guess which to remove — inspect both before deleting anything. Nothing was removed.',
    );
  }

  console.log(`[${COMMAND}] tenant    : ${ids[0]}`);

  if (dryRun) {
    const { total, counts } = await countTenantRemoval(ids);
    printCounts(counts);
    console.log(
      `[${COMMAND}] DRY RUN — would remove ${total} document(s); verification after a real run ` +
        'would re-count the tenant. Nothing was deleted.',
    );
    await mongoose.disconnect();
    return;
  }

  const { removed, counts } = await removeTenant(ids);
  printCounts(counts);

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
