// `npm run cleanup:perf` — remove the performance-seed tenant, and only it.
//
// The counterpart to `seed:perf`. It deletes every document whose businessId is
// the seed tenant's, then the tenant's user and business row, and then VERIFIES by
// re-querying that nothing is left — a cleanup that reports success without
// checking is how a "temporary" tenant survives forever.
//
// It is NOT `cleanup:mongodb` and must never be confused with it: that command
// clears whole databases by design, whereas this one is scoped by businessId and
// cannot reach another tenant even if it is handed the wrong id (a wrong id simply
// matches nothing, and the verification step would then report 0 rows found).
//
// Usage:
//   SEED_CONFIRM=seed-perf-ai npm run cleanup:perf -- --dry-run
//   SEED_CONFIRM=seed-perf-ai npm run cleanup:perf
//
// `--dry-run` counts the same teardown plan `removeTenant` executes and stops, which is what every
// other cleanup in this project offers. It was the last one without a preview: development-only and
// scoped, so the omission was safe, but an operator who learnt the rule everywhere else had no way to
// count this tenant before removing it.
//
// Safe to run when nothing was ever seeded: it reports that and exits 0.

import 'dotenv/config';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import {
  SeedSafetyError,
  assertSafeTarget,
  countTenantLeftovers,
  countTenantRemoval,
  findSeedTenantIds,
  removeTenant,
} from './perf/lib.mjs';

const COMMAND = 'cleanup:perf';

function fail(message) {
  console.error(`[${COMMAND}] ${message}`);
  process.exit(1);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  assertSafeTarget(env, COMMAND);

  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });

  const ids = await findSeedTenantIds();
  if (!ids.length) {
    console.log(`[${COMMAND}] nothing to clean — no seed tenant exists in ${env.mongodbDbName}.`);
    await mongoose.disconnect();
    return;
  }

  console.log(`[${COMMAND}] database  : ${env.mongodbDbName}`);
  console.log(`[${COMMAND}] tenant(s) : ${ids.join(', ')}`);
  if (dryRun) console.log(`[${COMMAND}] mode      : DRY RUN — counting only, nothing will be deleted`);

  if (dryRun) {
    // The same teardown plan `removeTenant` walks, counted rather than executed. One plan means the
    // preview and the delete cannot disagree about what "this tenant" is.
    const { total, counts } = await countTenantRemoval(ids);
    for (const [collection, count] of Object.entries(counts)) {
      if (count > 0) console.log(`[${COMMAND}]   ${collection.padEnd(24)} ${count}`);
    }
    console.log(`[${COMMAND}] DRY RUN — would remove ${total} document(s); nothing was deleted.`);
    console.log(`[${COMMAND}] identity  : seed:perf creates no Firebase login, so none is involved`);
    await mongoose.disconnect();
    return;
  }

  const { removed, counts } = await removeTenant(ids);
  for (const [collection, count] of Object.entries(counts)) {
    console.log(`[${COMMAND}]   ${collection.padEnd(24)} ${count}`);
  }

  // Prove it, do not assert it: re-count anything still carrying those ids — over
  // the SAME collection list the removal used, so a collection that was deleted is
  // necessarily also verified. (Before this, both halves named six collections by
  // hand and `suppliers`/`purchase_orders` appeared in neither.)
  const leftovers = await countTenantLeftovers(ids);

  if (leftovers !== 0) {
    fail(`verification failed: ${leftovers} document(s) still reference the seed tenant.`);
  }

  console.log(`[${COMMAND}] OK — removed ${removed} document(s); verification found 0 remaining.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof SeedSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
