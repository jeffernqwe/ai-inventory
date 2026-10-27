// `npm run seed:perf-tenant -- --database=<name> --size=<documents>` — put ONE large,
// clearly-marked, sign-in-able inventory tenant into the database this process resolved,
// including production.
//
// WHY THIS EXISTS BESIDE `seed:perf`. `seed:perf` is the query-measurement tool: it refuses
// production by design (`assertSafeTarget`), writes products and movements and no suppliers or
// purchase orders, and creates no Firebase identity — so it cannot be signed into from a phone.
// The only database a store build can reach is the production one, and the owner asked to test
// the assistant there against a large catalogue. Rather than weaken a guard its callers rely on,
// this command uses the SAME rule as every other seeder (`assertSeedTarget`): the database must be
// NAMED on the command line (`--database=`) and must equal the one this process resolved, the test
// database is refused, and the run costs TWO phrases in development or THREE in production:
//
//   SEED_CONFIRM      = seed:perf-tenant
//   SEED_DB_CONFIRM   = <the resolved database name>
//   SEED_PROD_CONFIRM = SEED-PRODUCTION-DATA        (production only)
//
// Production is allowed — deliberately — and the target is made deliberate instead. Before
// 2026-10-27 this command used its own one-phrase guard (`assertNamedDatabaseTarget`), which made
// the disposable production tenant the cheapest way to write production rows.
//
// WHY THE IDENTITY IS CREATED HERE. The application joins Firebase to MongoDB on `firebaseUid`
// ONLY, never email (`services/firebaseAuth.service.ts`), so an account that can sign in from the
// app has to be an identity Firebase knows plus a MongoDB user carrying that uid. `resolveIdentity`
// is the same helper `seed:demo` and `seed:demo-tenant` use, which is why a re-run REFRESHES the
// password from `DEMO_ACCOUNT_PASSWORD` instead of silently keeping the first run's.
//
// WHAT IT WRITES: the same `seedTenant` core as `seed:demo` — categories, locations, suppliers,
// products, inventory, purchase orders with real receipt movements, and a ledger whose arithmetic
// holds per row. The dataset is deterministic (`--seed`, default 1), so two measurements describe
// the same tenant. SKUs are `SEEDSKU-…`, which is what `perf:turns` asks its product question
// about.
//
// WHAT IT NEVER DOES: touch another tenant (every write and every delete is scoped to the
// businessId the fingerprints identify), delete a Firebase identity (F-50: a MongoDB user whose
// identity is gone can neither sign in nor register, and nothing can repair it), or print a
// credential.
//
// Usage:
//   DEMO_ACCOUNT_PASSWORD='…' SEED_CONFIRM=seed:perf-tenant \
//     SEED_DB_CONFIRM=inventoryai_prod_db SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
//     npm run seed:perf-tenant -- --database=inventoryai_prod_db --size=4000
//
// Teardown (removes the tenant and keeps the identity). Preview it first, then delete:
//   CLEANUP_CONFIRM=cleanup:perf-tenant CLEANUP_DB_CONFIRM=inventoryai_prod_db \
//     CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
//     npm run cleanup:perf-tenant -- --database=inventoryai_prod_db --dry-run
//
//   …and the same line without `--dry-run` to remove the tenant.

import 'dotenv/config';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import Business from '../src/models/business.model.ts';
import Category from '../src/models/category.model.ts';
import Inventory from '../src/models/inventory.model.ts';
import InventoryTransaction from '../src/models/inventoryTransaction.model.ts';
import Location from '../src/models/location.model.ts';
import Product from '../src/models/product.model.ts';
import PurchaseOrder from '../src/models/purchaseOrder.model.ts';
import Supplier from '../src/models/supplier.model.ts';
import User from '../src/models/user.model.ts';
import {
  PERF_TENANT_SEED_CONFIRM,
  SEED_BUSINESS_NAME,
  SEED_OWNER_EMAIL,
  SeedSafetyError,
  findSeedTenantIds,
} from './perf/lib.mjs';
import { assertSeedTarget } from './seed/guard.mjs';
import { clearTenantData, countTenantDataRemoval } from '../src/services/tenantTeardown.service.ts';
import { makeRandom, resolveIdentity, seedTenant } from './seed/lib.mjs';

const COMMAND = 'seed:perf-tenant';

/** Documents to write, across every collection. Products are ~22.5 % of this. */
const DEFAULT_SIZE = 4000;
const MIN_SIZE = 50;
// The same ceiling as `seed:demo`: 400 000 documents (~90 000 products). The earlier
// 60 000 cap was arbitrary; production testing on 2026-10-25 seeded 80 000 documents in
// 171 s, so the larger ceiling is what a realistic scale test needs.
const MAX_SIZE = 400000;

function argValue(flag, argv = process.argv) {
  const prefix = `${flag}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function fail(message) {
  console.error(`[${COMMAND}] ${message}`);
  process.exit(1);
}

/**
 * Resolve — or create — the ONE tenant these tools own, and prove the identity linkage.
 *
 * Every refusal here is about a state that a blind write would make worse: two business ids
 * matching the fingerprints means the marker and the owner disagree; a user pointing at another
 * business is a real account's linkage; a different uid on the user means the Firebase identity
 * was deleted and recreated, which the application cannot repair by itself.
 */
async function resolveTenant(identity) {
  const ids = await findSeedTenantIds();
  if (ids.length > 1) {
    throw new SeedSafetyError(
      `${ids.length} businesses match the seed fingerprints (${ids.join(', ')}). Refusing to ` +
        'guess which is the test tenant. Nothing was written.',
    );
  }

  const holder = await User.findOne({ firebaseUid: identity.uid }).select('_id email businessId').lean();
  let businessId = ids[0] ? new mongoose.Types.ObjectId(ids[0]) : null;
  let businessCreated = false;

  if (holder && businessId && String(holder.businessId) !== String(businessId)) {
    throw new SeedSafetyError(
      `the Firebase identity for ${SEED_OWNER_EMAIL} is already linked to business ` +
        `${String(holder.businessId)}, not the seed tenant ${String(businessId)}. Refusing to ` +
        'move an existing account between tenants. Nothing was written.',
    );
  }

  if (!businessId && holder?.businessId) {
    // The identity is linked in this database already — reuse the tenant it owns rather than
    // creating a second business for the same account.
    businessId = new mongoose.Types.ObjectId(String(holder.businessId));
  }

  if (!businessId) {
    const business = await Business.create({ name: SEED_BUSINESS_NAME, status: 'ACTIVE' });
    businessId = business._id;
    businessCreated = true;
  }

  let user = await User.findOne({ email: SEED_OWNER_EMAIL }).select('_id businessId firebaseUid').lean();
  if (user && String(user.businessId) !== String(businessId)) {
    throw new SeedSafetyError(
      `${SEED_OWNER_EMAIL} belongs to a DIFFERENT business (${String(user.businessId)}), not the ` +
        `seed tenant (${String(businessId)}). Refusing to write into a real account's tenant. ` +
        'Nothing was written.',
    );
  }
  if (user?.firebaseUid && user.firebaseUid !== identity.uid) {
    throw new SeedSafetyError(
      `${SEED_OWNER_EMAIL} carries a different firebaseUid in this database. The Firebase ` +
        'identity was deleted or recreated at some point, and the application cannot repair that ' +
        'linkage by itself — fix it deliberately. Nothing was written.',
    );
  }

  let userCreated = false;
  let linkageUpdated = false;
  if (!user) {
    await User.create({
      businessId,
      name: 'Perf Seed Owner',
      email: SEED_OWNER_EMAIL,
      role: 'OWNER',
      status: 'ACTIVE',
      firebaseUid: identity.uid,
      emailVerified: true,
    });
    userCreated = true;
  } else if (!user.firebaseUid) {
    // The dev fast-path (`seed:perf`) creates this user without an identity. Attaching the uid is
    // the whole difference between a data-only tenant and one that can be signed into.
    await User.updateOne({ _id: user._id }, { $set: { firebaseUid: identity.uid, emailVerified: true } });
    linkageUpdated = true;
  }

  return { businessId, businessCreated, userCreated, linkageUpdated };
}

/** Read the tenant back and refuse to call the run successful if it disagrees with itself. */
async function verifyTenant(businessId, expected) {
  const oid = new mongoose.Types.ObjectId(String(businessId));
  const counts = {
    categories: await Category.countDocuments({ businessId: oid }),
    locations: await Location.countDocuments({ businessId: oid }),
    suppliers: await Supplier.countDocuments({ businessId: oid }),
    products: await Product.countDocuments({ businessId: oid, status: 'ACTIVE' }),
    inventory: await Inventory.countDocuments({ businessId: oid }),
    inventory_transactions: await InventoryTransaction.countDocuments({ businessId: oid }),
    purchase_orders: await PurchaseOrder.countDocuments({ businessId: oid }),
  };

  const problems = [];
  for (const [name, actual] of Object.entries(counts)) {
    if (actual !== expected[name]) {
      problems.push(`${name}: wrote ${expected[name]}, read back ${actual}`);
    }
  }

  // The ledger invariant, over the rows that were actually written — the same arithmetic the
  // services enforce. `seed:perf`'s first version always ADDED and made 6 615 of 6 616 STOCK_OUT
  // rows claim stock went up; the assistant then reported that faithfully. A fixture that
  // contradicts itself reads exactly like a wrong answer.
  const movements = await InventoryTransaction.find({ businessId: oid })
    .select('type quantity previousQuantity newQuantity')
    .lean();
  let inconsistent = 0;
  for (const row of movements) {
    if (row.type === 'STOCK_IN' && row.newQuantity !== row.previousQuantity + row.quantity) inconsistent += 1;
    else if (row.type === 'STOCK_OUT' && row.newQuantity !== row.previousQuantity - row.quantity) inconsistent += 1;
    else if (
      row.type === 'ADJUSTMENT' &&
      row.quantity !== Math.abs(row.newQuantity - row.previousQuantity)
    ) {
      inconsistent += 1;
    }
  }
  if (inconsistent > 0) {
    problems.push(`${inconsistent} of ${movements.length} movement(s) break the ledger arithmetic`);
  }

  // `perf:turns` asks about this exact SKU (the fleet's convention), so a tenant without it
  // would fail a question for a reason that has nothing to do with the assistant.
  const anchor = await Product.exists({ businessId: oid, sku: 'SEEDSKU-0' });
  if (!anchor) problems.push('the tenant has no SEEDSKU-0 product for the measurement to ask about');

  return { counts, movements: movements.length, problems };
}

async function main() {
  const size = Number.parseInt(argValue('--size') ?? String(DEFAULT_SIZE), 10);
  const seed = Number.parseInt(argValue('--seed') ?? '1', 10);
  const dryRun = process.argv.includes('--dry-run');

  let database;
  try {
    database = assertSeedTarget({
      env,
      command: COMMAND,
      database: argValue('--database'),
      confirmPhrase: PERF_TENANT_SEED_CONFIRM,
    }).database;
  } catch (err) {
    if (err instanceof SeedSafetyError) fail(err.message);
    throw err;
  }

  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
    fail(`--size must be an integer between ${MIN_SIZE} and ${MAX_SIZE} documents. Nothing was written.`);
  }
  if (!Number.isInteger(seed) || seed < 0) {
    fail('--seed must be a non-negative integer. Nothing was written.');
  }
  // Only a real run needs the credential: it is what `resolveIdentity` sets on the login. A preview
  // creates no identity, so demanding it there would block the preview for no reason.
  if (!dryRun && !process.env.DEMO_ACCOUNT_PASSWORD) {
    fail(
      'set DEMO_ACCOUNT_PASSWORD to the credential this tenant should be signable with. It is ' +
        'refreshed on every run, never written to a file and never printed. Nothing was written.',
    );
  }

  const production = database === 'inventoryai_prod_db';
  console.log(`[${COMMAND}] database : ${database}${production ? '   (PRODUCTION)' : ''}`);
  console.log(`[${COMMAND}] tenant   : "${SEED_BUSINESS_NAME}" / ${SEED_OWNER_EMAIL}`);
  console.log(`[${COMMAND}] size     : ${size} document(s), PRNG seed ${seed} (reproducible)`);
  if (dryRun) console.log(`[${COMMAND}] mode     : DRY RUN — counting only, nothing will be written`);

  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });

  if (dryRun) {
    // The preview stops BEFORE `resolveIdentity`: that call creates the Firebase identity when it is
    // absent and refreshes its password when DEMO_ACCOUNT_PASSWORD is set, so it is a write even
    // though nothing in MongoDB changes. A preview may not touch either store.
    const ids = await findSeedTenantIds();
    if (ids.length > 1) {
      fail(
        `${ids.length} businesses match the seed fingerprints (${ids.join(', ')}). Refusing to ` +
          'guess which is the test tenant. Nothing was written.',
      );
    }
    if (!ids.length) {
      console.log(`[${COMMAND}] tenant   : would be CREATED (no seed tenant exists yet)`);
    } else {
      const { total, counts } = await countTenantDataRemoval(ids);
      console.log(`[${COMMAND}] tenant   : ${ids[0]} would be REPLACED`);
      for (const [collection, count] of Object.entries(counts)) {
        if (count > 0) console.log(`[${COMMAND}]   ${collection.padEnd(24)} ${count}`);
      }
      console.log(`[${COMMAND}] would clear ${total} document(s), then write the new dataset.`);
    }
    console.log(
      `[${COMMAND}] firebase : not touched by this preview; a real run creates or refreshes ` +
        `${SEED_OWNER_EMAIL}`,
    );
    console.log(`[${COMMAND}] DRY RUN complete — nothing was written.`);
    await mongoose.disconnect();
    return;
  }

  const started = Date.now();

  const identity = await resolveIdentity(SEED_OWNER_EMAIL);
  const tenant = await resolveTenant(identity);

  const cleared = await clearTenantData([tenant.businessId]);
  const result = await seedTenant({
    businessId: tenant.businessId,
    userId: (await User.findOne({ email: SEED_OWNER_EMAIL }).select('_id').lean())._id,
    total: size,
    rand: makeRandom(seed),
    includeSkuBarcode: true,
    label: 'SEED',
  });

  const verification = await verifyTenant(tenant.businessId, result.counts);

  console.log(
    `[${COMMAND}] identity : uid ${String(identity.uid).slice(0, 10)}… ` +
      `(${identity.created ? 'CREATED now' : 'already existed'}${identity.passwordRefreshed ? ', password refreshed' : ''})`,
  );
  console.log(
    `[${COMMAND}] tenant   : ${tenant.businessCreated ? 'CREATED' : 'reused'} ${String(tenant.businessId)}` +
      `${tenant.userCreated ? ', user CREATED' : ''}${tenant.linkageUpdated ? ', identity linkage attached' : ''}`,
  );
  if (cleared.removed > 0) {
    console.log(`[${COMMAND}] reset    : removed ${cleared.removed} previous document(s) of this tenant`);
  }
  for (const [name, count] of Object.entries(verification.counts)) {
    console.log(`[${COMMAND}]   ${name.padEnd(24)} ${count}`);
  }
  console.log(`[${COMMAND}] ledger   : ${verification.movements} movement(s) checked`);

  if (verification.problems.length > 0) {
    await mongoose.disconnect();
    fail(
      `${verification.problems.length} verification problem(s): ${verification.problems.join('; ')}. ` +
        'The tenant was written but does NOT hold a consistent dataset — do not measure against it.',
    );
  }

  console.log(`[${COMMAND}] OK — verification found no problems`);
  console.log(`[${COMMAND}] businessId : ${String(tenant.businessId)}`);
  console.log(`[${COMMAND}] sign in as : ${SEED_OWNER_EMAIL} (password from DEMO_ACCOUNT_PASSWORD)`);
  console.log(`[${COMMAND}] elapsed    : ${Date.now() - started} ms`);
  console.log('');
  console.log(`[${COMMAND}] measure it (real assistant turns, ground truth checked):`);
  // The phrase is only required when the measurement targets a database that is not development
  // or test; printing it unconditionally would teach an operator to set it habitually, which is
  // the opposite of what a confirmation phrase is for.
  //
  // THE ENVIRONMENT PREFIX IS PART OF THE COMMAND. `server/.env` names the DEVELOPMENT database,
  // and both commands below refuse a `--database=` that differs from what the process resolved —
  // so a printed line without `NODE_ENV`/`MONGODB_DB_NAME` would be refused by the guard it is
  // meant to satisfy. A command an operator cannot paste is not a next step.
  const envPrefix = production ? `NODE_ENV=production MONGODB_DB_NAME=${database} ` : '';
  if (production) {
    // The deployed server cannot be reached with a locally minted token, so the probe signs in
    // over Firebase's REST endpoint: it needs the seeded password and the project's PUBLIC web
    // key. That key already sits in `mobile/.env`, and `--env-file` loads it without printing it —
    // the reason this line names the script rather than `npm run`, which Node's flag cannot reach.
    console.log(
      `[${COMMAND}]   (export PERF_ACCOUNT_PASSWORD — the one you just set. The Firebase web key is ` +
        'in ../mobile/.env, which --env-file loads without printing it.)',
    );
    console.log(`[${COMMAND}]   ${envPrefix}PERF_TURNS_CONFIRM=perf-turns:production \\`);
    console.log(
      `[${COMMAND}]     node --env-file=../mobile/.env scripts/measure-ai-turns.mjs \\`,
    );
    console.log(
      `[${COMMAND}]       --base=https://ai-inventory-l1mi.onrender.com --database=${database} ` +
        `--business=${String(tenant.businessId)} --login --only=1,2`,
    );
  } else {
    console.log(
      `[${COMMAND}]   ${envPrefix}npm run perf:turns -- --database=${database} ` +
        `--business=${String(tenant.businessId)} --login --only=1,2`,
    );
  }
  console.log(`[${COMMAND}] remove it (preview the count, then delete):`);
  const cleanupPhrases =
    `CLEANUP_CONFIRM=cleanup:perf-tenant CLEANUP_DB_CONFIRM=${database} ` +
    `${production ? 'CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA ' : ''}`;
  console.log(
    `[${COMMAND}]   ${envPrefix}${cleanupPhrases}npm run cleanup:perf-tenant -- --database=${database} --dry-run`,
  );
  console.log(
    `[${COMMAND}]   ${envPrefix}${cleanupPhrases}npm run cleanup:perf-tenant -- --database=${database}`,
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof SeedSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
