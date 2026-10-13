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
//   SEED_CONFIRM=seed-perf-ai npm run cleanup:perf
//
// Safe to run when nothing was ever seeded: it reports that and exits 0.

import 'dotenv/config';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import Category from '../src/models/category.model.ts';
import Inventory from '../src/models/inventory.model.ts';
import InventoryTransaction from '../src/models/inventoryTransaction.model.ts';
import Location from '../src/models/location.model.ts';
import Product from '../src/models/product.model.ts';
import User from '../src/models/user.model.ts';
import { SeedSafetyError, assertSafeTarget, findSeedTenantIds, removeTenant } from './perf/lib.mjs';

const COMMAND = 'cleanup:perf';

function fail(message) {
  console.error(`[${COMMAND}] ${message}`);
  process.exit(1);
}

async function main() {
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

  const { removed, counts } = await removeTenant(ids);
  for (const [collection, count] of Object.entries(counts)) {
    console.log(`[${COMMAND}]   ${collection.padEnd(24)} ${count}`);
  }

  // Prove it, do not assert it: re-count anything still carrying those ids.
  const filter = { businessId: { $in: ids.map((id) => new mongoose.Types.ObjectId(String(id))) } };
  const leftovers = [
    await Inventory.countDocuments(filter),
    await InventoryTransaction.countDocuments(filter),
    await Product.countDocuments(filter),
    await Category.countDocuments(filter),
    await Location.countDocuments(filter),
    await User.countDocuments(filter),
  ].reduce((a, b) => a + b, 0);

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
