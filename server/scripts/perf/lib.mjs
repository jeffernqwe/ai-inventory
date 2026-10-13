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

import mongoose from 'mongoose';

import { DATABASE_NAMES } from '../../src/config/env.ts';
import Business from '../../src/models/business.model.ts';
import Category from '../../src/models/category.model.ts';
import Inventory from '../../src/models/inventory.model.ts';
import InventoryTransaction from '../../src/models/inventoryTransaction.model.ts';
import Location from '../../src/models/location.model.ts';
import Product from '../../src/models/product.model.ts';
import User from '../../src/models/user.model.ts';

/** The confirmation phrase both commands require in the environment. */
export const SEED_CONFIRM_PHRASE = 'seed-perf-ai';

/** The seed tenant's fingerprint. Every lookup and every delete is anchored here. */
export const SEED_BUSINESS_NAME = 'PERF SEED — AI assistant stress test (do not use)';
export const SEED_OWNER_EMAIL = 'perf-seed-ai@example.invalid';

export class SeedSafetyError extends Error {}

/**
 * Fail-closed target check, before any connection and any write.
 *
 * The database is the one `config/env.ts` RESOLVES, not the ambient variable, so
 * this cannot be satisfied by editing an env var that the connection ignores. The
 * test database is refused as firmly as production: `npm test` and
 * `npm run cleanup:test-mongodb` clear it, so seeded rows there would vanish
 * mid-experiment and the measurement would be of an empty tenant.
 */
export function assertSafeTarget(env, command) {
  if (process.env.NODE_ENV === 'production') {
    throw new SeedSafetyError('NODE_ENV=production. Refusing. Nothing was written or deleted.');
  }
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
  if (process.env.SEED_CONFIRM !== SEED_CONFIRM_PHRASE) {
    throw new SeedSafetyError(`set SEED_CONFIRM=${SEED_CONFIRM_PHRASE} to proceed. [${command}]`);
  }
}

/** Every businessId that belongs to the seed tenant, by BOTH fingerprints. */
export async function findSeedTenantIds() {
  const byName = await Business.find({ name: SEED_BUSINESS_NAME }).select('_id').lean();
  const byOwner = await User.find({ email: SEED_OWNER_EMAIL }).select('businessId').lean();
  const ids = new Set();
  for (const b of byName) ids.add(String(b._id));
  for (const u of byOwner) if (u.businessId) ids.add(String(u.businessId));
  return [...ids];
}

/**
 * Delete every document belonging to the given tenants, and NOTHING else.
 *
 * Every filter is `{ businessId: { $in: ids } }` (plus the business rows by `_id`),
 * so no other tenant's data can be reached from here even if this is called with a
 * wrong id — a wrong id simply matches nothing. Returns per-collection counts so a
 * caller can prove the tenant is gone rather than assume it.
 */
export async function removeTenant(businessIds) {
  const ids = businessIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const filter = { businessId: { $in: ids } };
  const counts = {};
  let removed = 0;
  for (const [name, model] of [
    ['inventory', Inventory],
    ['inventory_transactions', InventoryTransaction],
    ['products', Product],
    ['categories', Category],
    ['locations', Location],
    ['users', User],
  ]) {
    const res = await model.deleteMany(filter);
    counts[name] = res.deletedCount ?? 0;
    removed += counts[name];
  }
  const businesses = await Business.deleteMany({ _id: { $in: ids } });
  counts.businesses = businesses.deletedCount ?? 0;
  removed += counts.businesses;
  return { removed, counts };
}
