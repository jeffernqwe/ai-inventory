// `npm run seed:demo -- --email=<you@example.com> [--total=80000] [--seed=1]`
//
// Give ONE real account a large, realistic inventory dataset so the AI assistant
// can be asked questions at a scale a test fixture never reaches, and so the phone
// the owner already signs in with lands directly in that dataset.
//
// WHY IT ATTACHES TO AN EXISTING IDENTITY RATHER THAN INVENTING ONE. The application
// joins Firebase to MongoDB on `firebaseUid` ONLY (never email), and the exchange
// resolves a user by that uid. So the honest way to hand an existing login a seeded
// tenant is: resolve the uid from FIREBASE (the identity authority), then create or
// reuse the MongoDB User that carries it — exactly the linkage the registration flow
// writes. Nothing here reads a user by email in MongoDB.
//
// WHY IT DOES NOT DELETE FIREBASE IDENTITIES. `docs/DEVELOPMENT_ROADMAP.md` §27BB
// (F-50) records what happens when the two stores are cleaned in the wrong
// relationship: a MongoDB user whose Firebase identity was deleted can neither sign
// in nor register (`409 EMAIL_IN_USE`), and **nothing in the application can repair
// it**. Clearing MongoDB alone is the safe direction — it frees every address and
// orphans nothing. This script therefore never deletes a Firebase user, and it only
// ever creates one when the requested identity does not exist.
//
// SAFETY: `assertSafeTarget` refuses production, refuses the test database, and
// requires a confirmation phrase — all before a connection is opened. A re-run
// resets ONLY the data of the one tenant the resolved account owns (never the
// account rows), by businessId, so another tenant cannot be reached even if the
// wrong id were supplied.
//
// DETERMINISTIC: a seeded PRNG (`--seed`, default 1) means the same dataset every
// run, so two measurements describe the same tenant.
//
// Teardown: `npm run cleanup:perf`-style tooling covers the performance tenant; for
// this one, re-running the script resets it, and `clearTenantData` is exported for
// a targeted removal.
//
// Usage:
//   SEED_CONFIRM=seed-demo-account npm run seed:demo -- --email=you@example.com --total=80000
//   SEED_CONFIRM=seed-demo-account npm run seed:demo -- --email=you@example.com --total=200 --seed=7
//
// If the Firebase identity does not exist yet, supply its initial password through
// the environment (never on the command line, never in this file):
//   DEMO_ACCOUNT_PASSWORD='…' SEED_CONFIRM=seed-demo-account npm run seed:demo -- --email=new@example.com

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
import { SeedSafetyError, assertSafeTarget, clearTenantData } from './perf/lib.mjs';

const COMMAND = 'seed:demo';
const CONFIRM_PHRASE = 'seed-demo-account';

/** The tenant this seeder owns once it is done. Named so it is obvious in the app. */
const DEMO_BUSINESS_NAME = 'AI SCALE TEST — 80k seeded dataset';

const LOCATION_NAMES = [
  'Main Warehouse',
  'Shop Front',
  'Overflow Store',
  'Cold Room',
  'Returns Bay',
  'Transit Hub',
];
const CATEGORY_NAMES = [
  'Beverages', 'Snacks', 'Household', 'Personal Care', 'Stationery', 'Hardware',
  'Electrical', 'Kitchen', 'Pet Supplies', 'Toys', 'Clothing', 'Garden',
  'Automotive', 'Baby', 'Sports', 'Office', 'Cleaning', 'Seasonal',
  'Bakery', 'Frozen', 'Dairy', 'Produce', 'Butcher', 'Deli',
];
const UNITS = ['pcs', 'box', 'pack', 'kg', 'L'];
const ADJECTIVES = [
  'Premium', 'Classic', 'Compact', 'Heavy Duty', 'Everyday', 'Deluxe', 'Eco',
  'Professional', 'Mini', 'Ultra', 'Value', 'Pro',
];
const NOUNS = [
  'Kettle', 'Notebook', 'Detergent', 'Torch', 'Cable', 'Mug', 'Tape', 'Battery',
  'Brush', 'Gloves', 'Lamp', 'Bottle', 'Padlock', 'Sponge', 'Clips', 'Towel',
];
const SUPPLIER_SUFFIX = ['Supplies', 'Trading', 'Distributors', 'Wholesale', 'Industries'];

function argValue(flag, argv = process.argv) {
  const prefix = `${flag}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function fail(message) {
  console.error(`[${COMMAND}] ${message}`);
  process.exit(1);
}

/** Small deterministic PRNG (mulberry32) — same seed, same dataset, everywhere. */
function makeRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const intBetween = (rand, min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (rand, list) => list[Math.floor(rand() * list.length)];

/**
 * Insert in bounded chunks: one 30 000-document batch would approach the 16 MB
 * command limit.
 *
 * Returns the INSERTED DOCUMENTS, not a count — the callers need the `_id` of every
 * row they just wrote to build the rows that reference it. The first draft returned
 * a number and the next collection's rows were built from `undefined._id`, which is
 * how this script failed on its very first real run: a count is only ever useful to a
 * caller that does not have to point anything at what it wrote, so callers here take
 * `.length` where they want the number.
 */
async function insertChunked(model, docs, chunkSize = 2000) {
  const inserted = [];
  for (let i = 0; i < docs.length; i += chunkSize) {
    const result = await model.insertMany(docs.slice(i, i + chunkSize), { ordered: false });
    inserted.push(...result);
  }
  return inserted;
}

/** Resolve the Firebase identity for an email, creating it only if it is absent. */
async function resolveIdentity(email) {
  const { getFirebaseAdminApp } = await import('../src/services/firebase/adminApp.ts');
  const { getAuth } = await import('firebase-admin/auth');
  const auth = getAuth(getFirebaseAdminApp());

  try {
    const existing = await auth.getUserByEmail(email);
    return { uid: existing.uid, created: false, emailVerified: existing.emailVerified };
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
  }

  const password = process.env.DEMO_ACCOUNT_PASSWORD;
  if (!password) {
    throw new SeedSafetyError(
      `no Firebase identity exists for ${email}, and DEMO_ACCOUNT_PASSWORD is not set. ` +
        'Set it in the environment to create the identity (it is never written to a file or printed).',
    );
  }
  const created = await auth.createUser({ email, password, emailVerified: true });
  return { uid: created.uid, created: true, emailVerified: true };
}

async function main() {
  const email = argValue('--email');
  const total = Number.parseInt(argValue('--total') ?? '80000', 10);
  const seed = Number.parseInt(argValue('--seed') ?? '1', 10);

  assertSafeTarget(env, COMMAND, { confirmPhrase: CONFIRM_PHRASE });

  if (!email || !email.includes('@')) {
    fail('--email=<address> is required. Nothing was written.');
  }
  if (!Number.isInteger(total) || total < 100 || total > 400000) {
    fail('--total must be an integer between 100 and 400000. Nothing was written.');
  }
  if (!Number.isInteger(seed) || seed < 0) {
    fail('--seed must be a non-negative integer. Nothing was written.');
  }

  console.log(`[${COMMAND}] database : ${env.mongodbDbName}`);
  console.log(`[${COMMAND}] account  : ${email}`);
  console.log(`[${COMMAND}] target   : ~${total.toLocaleString()} documents across 7 collections`);
  console.log(`[${COMMAND}] PRNG seed: ${seed} (the dataset is reproducible)`);

  const identity = await resolveIdentity(email);
  console.log(
    `[${COMMAND}] identity : uid ${String(identity.uid).slice(0, 10)}… ` +
      `(${identity.created ? 'CREATED now' : 'already existed'}${identity.emailVerified ? ', verified' : ', NOT verified'})`,
  );

  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });
  const started = Date.now();
  const rand = makeRandom(seed);

  // ---- the tenant: reuse the account's own business, or create one the same shape
  // ---- the registration flow writes (OWNER, ACTIVE, linked by firebaseUid only).
  const user = await User.findOne({ firebaseUid: identity.uid }).select('_id businessId email').lean();
  let businessId;
  let accountCreated = false;

  if (user && user.businessId) {
    businessId = user.businessId;
    const business = await Business.findById(businessId).select('name status').lean();
    if (!business) {
      fail(
        `the account's business ${String(businessId)} does not exist. Refusing to guess at a ` +
          'repair — fix the linkage deliberately. Nothing was written.',
      );
    }
    if (business.status !== 'ACTIVE') {
      fail(`the account's business status is ${business.status}. Nothing was written.`);
    }
    console.log(`[${COMMAND}] tenant   : reusing ${String(businessId)} ("${business.name}")`);
  } else {
    const business = await Business.create({ name: DEMO_BUSINESS_NAME, status: 'ACTIVE' });
    businessId = business._id;
    await User.create({
      businessId,
      name: 'AI Test Owner',
      email,
      role: 'OWNER',
      status: 'ACTIVE',
      firebaseUid: identity.uid,
      emailVerified: identity.emailVerified === true,
    });
    accountCreated = true;
    console.log(`[${COMMAND}] tenant   : CREATED ${String(businessId)} ("${DEMO_BUSINESS_NAME}")`);
  }

  // ---- reset this tenant's DATA (never the account rows) ----
  const cleared = await clearTenantData([businessId]);
  if (cleared.removed > 0) {
    console.log(`[${COMMAND}] reset    : removed ${cleared.removed} previous document(s) from this tenant`);
  }

  // ---- the shape of the dataset ----
  // Every count scales with `--total`, so the knob means what it says at any size.
  // A FIXED supplier/PO count was the first draft, and at `--total=300` the
  // "fixed" collections alone (24 + 6 + 300 + 50) produced 666 documents for a
  // 300-document request — a target the script then reported as if it had hit it.
  const scale = (share, min, max) => Math.max(min, Math.min(max, Math.round(total * share)));
  const categoryCount = Math.min(CATEGORY_NAMES.length, scale(0.0003, 4, 24));
  const locationCount = scale(0.0001, 2, 6);
  const supplierCount = scale(0.004, 5, 300);
  const poCount = scale(0.02, 5, 1600);
  const productCount = Math.max(5, Math.round(total * 0.225));

  const categories = await Category.insertMany(
    CATEGORY_NAMES.slice(0, categoryCount).map((name) => ({ businessId, name, status: 'ACTIVE' })),
    { ordered: false },
  );
  const locations = await Location.insertMany(
    LOCATION_NAMES.slice(0, locationCount).map((name) => ({ businessId, name, status: 'ACTIVE' })),
    { ordered: false },
  );
  const suppliers = await Supplier.insertMany(
    Array.from({ length: supplierCount }, (_, i) => ({
      businessId,
      name: `${pick(rand, ADJECTIVES)} ${pick(rand, SUPPLIER_SUFFIX)} ${1000 + i}`,
      contactName: `Contact ${i}`,
      phone: `+63 900 ${String(1000000 + i).slice(-7)}`,
      email: `supplier${i}@example.invalid`,
      description: 'Seeded supplier for AI scale testing',
      status: 'ACTIVE',
    })),
    { ordered: false },
  );

  // ---- products, with a realistic spread of stock health ----
  // A share sits at or below its minimum so the restock path returns a full page;
  // a tenant where nothing is ever low would leave that query's cost unmeasured.
  const productDocs = [];
  for (let i = 0; i < productCount; i += 1) {
    const minimumStock = intBetween(rand, 5, 100);
    const low = rand() < 0.15;
    const available = low
      ? (rand() < 0.4 ? 0 : intBetween(rand, 1, minimumStock))
      : Math.round(minimumStock * (1.5 + rand() * 8));
    productDocs.push({
      businessId,
      name: `${pick(rand, ADJECTIVES)} ${pick(rand, NOUNS)} ${10000 + i}`,
      sku: `DEMOSKU-${i}`,
      barcode: `DEMOBC${i}`,
      description: `Seeded row ${i} for AI scale testing`,
      categoryId: categories[i % categories.length]._id,
      costPrice: Number((1 + rand() * 40).toFixed(2)),
      sellingPrice: Number((2 + rand() * 80).toFixed(2)),
      unit: pick(rand, UNITS),
      minimumStock,
      status: 'ACTIVE',
      _availableTotal: available,
    });
  }
  const products = await insertChunked(
    Product,
    productDocs.map((doc) => {
      const clean = { ...doc };
      delete clean._availableTotal;
      return clean;
    }),
  );

  // ---- inventory: each product stocked at 1..3 locations ----
  const inventoryDocs = [];
  productDocs.forEach((doc, i) => {
    const totalQty = doc._availableTotal;
    const spread = intBetween(rand, 1, Math.min(3, locations.length));
    let remaining = totalQty;
    for (let l = 0; l < spread; l += 1) {
      const isLast = l === spread - 1;
      const qty = isLast ? remaining : Math.floor(totalQty / spread);
      remaining -= qty;
      inventoryDocs.push({
        businessId,
        productId: products[i]._id,
        locationId: locations[l]._id,
        quantity: Math.max(0, qty),
        reservedQuantity: 0,
      });
    }
  });
  const inventoryInserted = (await insertChunked(Inventory, inventoryDocs)).length;

  // ---- purchase orders ----
  // Status spread with receipts that are BACKED BY REAL TRANSACTIONS: a receipt line
  // requires an `inventoryTransactionId`, and pointing one at an id that was never
  // written would be a fixture that contradicts itself. The ids are pre-generated so
  // the transactions and the lines that reference them can be inserted in either
  // order. This is the perf seeder's own lesson: a self-contradicting ledger reads
  // exactly like a wrong answer.
  const PO_STATUSES = ['DRAFT', 'OPEN', 'RECEIVED', 'CANCELED'];
  const poDocs = [];
  const receiptTxDocs = [];
  const receivingUser = user?._id ?? null;

  for (let i = 0; i < poCount; i += 1) {
    const status = PO_STATUSES[i % PO_STATUSES.length];
    const itemCount = intBetween(rand, 1, 3);
    const items = [];
    for (let k = 0; k < itemCount; k += 1) {
      const productIndex = intBetween(rand, 0, products.length - 1);
      const ordered = intBetween(rand, 5, 100);
      const fullyReceived = status === 'RECEIVED';
      items.push({
        productId: products[productIndex]._id,
        productName: productDocs[productIndex].name,
        sku: productDocs[productIndex].sku,
        quantityOrdered: ordered,
        quantityReceived: fullyReceived ? ordered : 0,
        quantityCommitted: fullyReceived ? ordered : 0,
        unitCost: productDocs[productIndex].costPrice,
      });
    }

    const receipts = [];
    if (status === 'RECEIVED' && receivingUser) {
      const lines = items.map((item) => {
        const txId = new mongoose.Types.ObjectId();
        const previous = intBetween(rand, 0, 400);
        receiptTxDocs.push({
          _id: txId,
          businessId,
          productId: item.productId,
          locationId: locations[i % locations.length]._id,
          type: 'STOCK_IN',
          quantity: item.quantityReceived,
          previousQuantity: previous,
          newQuantity: previous + item.quantityReceived,
          reason: `Purchase order receipt`,
          reference: `PO-DEMO-${String(i + 1).padStart(5, '0')}`,
          userId: receivingUser,
          createdAt: new Date(Date.now() - rand() * 30 * 86400000),
        });
        return {
          productId: item.productId,
          quantity: item.quantityReceived,
          inventoryTransactionId: txId,
          previousQuantity: previous,
          newQuantity: previous + item.quantityReceived,
        };
      });
      receipts.push({
        receivedAt: new Date(Date.now() - rand() * 30 * 86400000),
        userId: receivingUser,
        reference: `DR-${1000 + i}`,
        lines,
      });
    }

    poDocs.push({
      businessId,
      number: `PO-DEMO-${String(i + 1).padStart(5, '0')}`,
      supplierId: suppliers[intBetween(rand, 0, suppliers.length - 1)]._id,
      locationId: locations[i % locations.length]._id,
      status,
      expectedAt: new Date(Date.now() - rand() * 30 * 86400000),
      notes: 'Seeded purchase order for AI scale testing',
      items,
      receipts,
      claims: [],
    });
  }
  const poInserted = (await insertChunked(PurchaseOrder, poDocs, 500)).length;

  // ---- transactions: the remainder of the budget, so the total is exact ----
  // Every row satisfies the invariant its OWN type implies — `newQuantity =
  // previousQuantity + quantity` for STOCK_IN, `- quantity` for STOCK_OUT, and
  // `quantity = |target - previousQuantity|` for an ADJUSTMENT — never merely two
  // plausible numbers. The first version of the performance seeder always ADDED, and
  // 6 615 of 6 616 STOCK_OUT rows ended up claiming stock went UP; the assistant then
  // reported that faithfully. Fixture consistency is part of answer trustworthiness.
  const TYPES = ['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT'];
  const historyDocs = [];
  // The PO receipt movements are ALREADY written and count toward the budget, so
  // they are subtracted here rather than added on top of it. Without that the first
  // full run reported 80 842 documents for an 80 000 target — a 1 % overshoot that
  // the script displayed as if the target had been met, which is the kind of drift a
  // fixture's own report should never have to explain away.
  const historyTarget = Math.max(
    productCount,
    total -
      categoryCount -
      locationCount -
      supplierCount -
      poInserted -
      productCount -
      inventoryInserted -
      receiptTxDocs.length,
  );

  for (let i = 0; i < historyTarget; i += 1) {
    const productIndex = i % productCount;
    const type = pick(rand, TYPES);
    const when = new Date(Date.now() - rand() * 90 * 86400000);
    let quantity;
    let previous;
    let target;
    if (type === 'STOCK_OUT') {
      // Stock must exist for stock to leave: a stock-out from an empty shelf is
      // impossible and would write the negative `newQuantity` the model forbids.
      previous = intBetween(rand, 1, 500);
      quantity = intBetween(rand, 1, previous);
      target = previous - quantity;
    } else if (type === 'ADJUSTMENT') {
      // An adjustment records a TARGET and its `quantity` is the absolute delta,
      // which is why the other two shapes' arithmetic does not apply to it.
      previous = intBetween(rand, 0, 500);
      target = intBetween(rand, 0, 500);
      if (target === previous) target = previous + 1;
      quantity = Math.abs(target - previous);
    } else {
      previous = intBetween(rand, 0, 500);
      quantity = intBetween(rand, 1, 50);
      target = previous + quantity;
    }
    historyDocs.push({
      businessId,
      productId: products[productIndex]._id,
      locationId: pick(rand, locations)._id,
      type,
      quantity,
      previousQuantity: previous,
      newQuantity: target,
      reason: 'Seeded movement',
      reference: `DEMO-${productIndex}-${i}`,
      userId: receivingUser,
      createdAt: when,
      updatedAt: when,
    });
  }

  const allTxDocs = [...historyDocs, ...receiptTxDocs];
  const txInserted = (await insertChunked(InventoryTransaction, allTxDocs, 2000)).length;

  const achieved = categoryCount + locationCount + supplierCount + productCount + inventoryInserted + txInserted + poInserted;

  console.log('');
  console.log(`[${COMMAND}] OK`);
  console.log(`[${COMMAND}]   categories             ${categoryCount}`);
  console.log(`[${COMMAND}]   locations              ${locationCount}`);
  console.log(`[${COMMAND}]   suppliers              ${supplierCount}`);
  console.log(`[${COMMAND}]   products               ${products.length}`);
  console.log(`[${COMMAND}]   inventory              ${inventoryInserted}`);
  console.log(`[${COMMAND}]   inventory_transactions ${txInserted}  (incl. ${receiptTxDocs.length} PO receipt movement(s))`);
  console.log(`[${COMMAND}]   purchase_orders        ${poInserted}`);
  console.log(`[${COMMAND}]   ----------------------------------------`);
  console.log(`[${COMMAND}]   TOTAL                  ${achieved.toLocaleString()}   (target ${total.toLocaleString()})`);
  console.log(`[${COMMAND}] businessId : ${String(businessId)}`);
  console.log(`[${COMMAND}] account    : ${email}${accountCreated ? '  (MongoDB account CREATED — sign in as usual)' : '  (existing account, unchanged)'}`);
  console.log(`[${COMMAND}] elapsed    : ${Date.now() - started} ms`);
  console.log(`[${COMMAND}] next       : npm run perf:measure -- --business=${String(businessId)}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof SeedSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
