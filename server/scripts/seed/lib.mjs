// Shared seeding core for the account seeders (`seed:demo` and `seed:accounts`).
//
// WHY THIS MODULE EXISTS. Both seeders write the same seven collections in the same
// shape, and they differ in exactly three things: WHICH accounts, HOW BIG, and
// whether products carry a generated `sku`/`barcode`. A second copy of the dataset
// shape is how two seeders drift apart — the same reason `perf/lib.mjs` keeps ONE
// `TENANT_DATA_COLLECTIONS` list. There is one implementation here and the two CLIs
// are thin shells over it, so a fix to the fixture benefits both.
//
// NOTHING HERE RUNS ON IMPORT: no `main()`, no connection, no write. A library that
// acts when you read it is how a "seed" script writes to a database by accident.
//
// SAFETY lives in the CALLERS (`assertSeedTarget` in ./guard.mjs), before a connection
// is opened. This module only ever writes rows belonging to the `businessId` it is
// handed, and it never deletes a Firebase identity.

import mongoose from 'mongoose';

import Business from '../../src/models/business.model.ts';
import Category from '../../src/models/category.model.ts';
import Inventory from '../../src/models/inventory.model.ts';
import InventoryTransaction from '../../src/models/inventoryTransaction.model.ts';
import Location from '../../src/models/location.model.ts';
import Product from '../../src/models/product.model.ts';
import PurchaseOrder from '../../src/models/purchaseOrder.model.ts';
import Supplier from '../../src/models/supplier.model.ts';
import User from '../../src/models/user.model.ts';
import { SeedSafetyError } from '../perf/lib.mjs';
import { assertSeedFirebaseProject } from './guard.mjs';

const LOCATION_NAMES = [
  'Main Warehouse', 'Shop Front', 'Overflow Store', 'Cold Room', 'Returns Bay', 'Transit Hub',
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
const PO_STATUSES = ['DRAFT', 'OPEN', 'RECEIVED', 'CANCELED'];
const TX_TYPES = ['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT'];

/**
 * A production run that would REPLACE an existing tenant must name it.
 *
 * Shared by `seed:demo` and `seed:accounts` so the two CLIs cannot answer "may I replace this
 * business?" differently. A brand-new tenant is allowed without an id: the run is about to create
 * it, and creating deletes nothing.
 *
 * `namingHint` is the command's own way of naming the tenant (`--business=` for one account, the
 * third field of `--accounts` for several), so the refusal tells the operator what to type rather
 * than what the other command would have accepted.
 */
export function assertTenantNamedForReset({
  production,
  reused,
  requestedBusinessId,
  businessId,
  businessName,
  command,
  namingHint = '--business=<businessId>',
}) {
  if (!production || !reused) return;

  if (!requestedBusinessId) {
    throw new SeedSafetyError(
      `${namingHint} is required in production [${command}]: this run would REPLACE the data of ` +
        `business ${String(businessId)}${businessName ? ` ("${businessName}")` : ''}. Name it to ` +
        'prove that is the tenant you mean. Nothing was replaced.',
    );
  }
  if (String(requestedBusinessId) !== String(businessId)) {
    throw new SeedSafetyError(
      `${namingHint} names business ${String(requestedBusinessId)}, but this account owns ` +
        `${String(businessId)} [${command}]. Refusing to reset a business that was not named. ` +
        'Nothing was replaced.',
    );
  }
}

/** Small deterministic PRNG (mulberry32) — same seed, same dataset, everywhere. */
export function makeRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const intBetween = (rand, min, max) => Math.floor(rand() * (max - min + 1)) + min;
export const pick = (rand, list) => list[Math.floor(rand() * list.length)];

/**
 * One spelling for an address, everywhere.
 *
 * WHY THIS IS NOT COSMETIC. The `User.email` field is `lowercase: true`, and Mongoose applies
 * that on WRITE only. A query with `{ email: 'A@X.com' }` therefore does not match the stored
 * `a@x.com`, so a mixed-case argument could miss the existing row and attempt a second one —
 * dying on the unique index with an error that names nothing. Firebase treats addresses
 * case-insensitively, so the identity was found and the database lookup was not: the two halves
 * of the script disagreed about who this person is. Normalising at the boundary makes the CLI,
 * the identity lookup and the database lookup use one string.
 */
export function normaliseEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * A strict whole number from a CLI value, or a refusal.
 *
 * `Number.parseInt` accepts `900abc` as 900 and `12.9` as 12, so a mistyped `--total` used to
 * seed a plausible-looking dataset of the wrong size. Seeding is a measurement input; a size
 * nobody intended is a measurement nobody can trust.
 *
 * Pure, so every branch is asserted without a database. `fallback` is used only when the flag
 * is absent or blank, which is what makes `--total` optional in the first place.
 */
export function parseCount(value, { name, min, max, fallback }) {
  const raw = String(value ?? '').trim();
  const text = raw === '' ? (fallback === undefined ? '' : String(fallback)) : raw;
  const range = max === undefined ? `at least ${min}` : `between ${min} and ${max}`;

  if (!/^\d+$/.test(text)) {
    const hint =
      raw === ''
        ? fallback === undefined
          ? ' (it is required)'
          : ` (default ${fallback})`
        : `, not "${raw}"`;
    throw new SeedSafetyError(`${name} must be a whole number ${range}${hint}. Nothing was written.`);
  }

  const parsed = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    throw new SeedSafetyError(
      `${name} must be a whole number ${range}, not "${text}". Nothing was written.`,
    );
  }
  return parsed;
}

/**
 * The three comparison accounts, in PRODUCTS — the unit a person actually thinks in.
 *
 * WHY ONE DEFINITION, IN THIS FILE. The seeder, the cleanup and the pre-flight check all
 * have to agree on WHICH accounts this workflow owns and how big each one is: a checker
 * that lists a different set from the seeder is worse than no checker. The list is read by
 * `seed-accounts.mjs`, `cleanup-accounts.mjs` and `check-accounts.mjs`, so all three
 * describe the same three tenants.
 *
 * Sizes are PRODUCTS. `seedTenant` takes DOCUMENTS (its `total` — the seven collections
 * together), and products land at ~22.5 % of that, so `documentsForProducts` converts and
 * the console prints both numbers for every entry.
 */
export const COMPARISON_ACCOUNTS = Object.freeze([
  { email: 'jefferndullamalinaozxc@gmail.com', products: 30000, tier: 'small' },
  { email: 'jefferndullamalinao@gmail.com', products: 50000, tier: 'medium' },
  { email: 'jeffernmalinaoqwe@gmail.com', products: 90000, tier: 'large' },
]);

/** The share of a seeded tenant that is products (the rest is stock, movements, POs, …). */
export const PRODUCTS_SHARE = 0.225;

/** Five is where `seedTenant` floors `productCount`, so it is also the smallest plan here. */
export const MIN_PRODUCTS = 5;

/**
 * The ceiling, in products, and why it is not one million.
 *
 * 112 500 products ≈ 500 000 documents, which the generator can still hold in memory and
 * write in bounded chunks. One million products would be ≈4.4 million documents — the
 * whole plan is built in memory before it is inserted, so that size is refused rather than
 * attempted: the run would either exhaust the process or, on the deployed tier, the storage
 * allowance, and neither failure would be pleasant to discover halfway through a replace.
 */
export const MAX_PRODUCTS = 112500;

/** The smallest `--total` in documents that `seedTenant` accepts as a serious dataset. */
export const MIN_DOCUMENTS = 100;

/** 112 500 products, expressed in documents. The two ceilings are the same ceiling. */
export const MAX_DOCUMENTS = 500000;

/** What a document count (`--total`, or a `d`-suffixed plan entry) yields in products. */
export function productsForDocuments(total) {
  return Math.max(5, Math.round(Number(total) * PRODUCTS_SHARE));
}

/**
 * The document budget that produces EXACTLY `products` products.
 *
 * Both sides round, so the round trip is checked rather than assumed: `seedTenant` computes
 * `max(5, round(total * 0.225))`, and a document figure that lands one product off would be
 * reported as a dataset nobody asked for. The loop moves the budget by a document or two
 * until the product count is exact, which is why every caller can print both numbers and
 * mean them.
 */
export function documentsForProducts(products) {
  const wanted = Math.max(1, Math.round(Number(products)));
  // No floor from `MIN_DOCUMENTS` here: that bound validates a DOCUMENT count, and applying
  // it to a small product count would make the request unsatisfiable (100 documents is
  // already 23 products, so "5 products" could never be met).
  let total = Math.max(1, Math.round(wanted / PRODUCTS_SHARE));

  for (let i = 0; i < 8; i += 1) {
    const achieved = Math.max(5, Math.round(total * PRODUCTS_SHARE));
    if (achieved === wanted) return total;
    total += achieved < wanted ? 1 : -1;
  }
  throw new SeedSafetyError(
    `${String(products)} products cannot be expressed as a document budget. Nothing was written.`,
  );
}

/**
 * Insert in bounded chunks: one 30 000-document batch would approach the 16 MB
 * command limit. Re-exported so both CLIs share the bound.
 */
export const DEFAULT_CHUNK_SIZE = 2000;

/**
 * Insert in bounded chunks.
 *
 * Returns the INSERTED DOCUMENTS, not a count — callers need the `_id` of every row
 * they just wrote to build the rows that reference it. The first draft returned a
 * number and the next collection's rows were built from `undefined._id`, which is how
 * this script failed on its very first real run: a count is only ever useful to a
 * caller that does not have to point anything at what it wrote, so callers here take
 * `.length` where they want the number.
 */
export async function insertChunked(model, docs, chunkSize = DEFAULT_CHUNK_SIZE) {
  const inserted = [];
  for (let i = 0; i < docs.length; i += chunkSize) {
    const result = await model.insertMany(docs.slice(i, i + chunkSize), { ordered: false });
    inserted.push(...result);
  }
  return inserted;
}

/**
 * Resolve the Firebase identity for an email, creating it only if it is absent — and
 * REFRESHING the password when one was supplied.
 *
 * The application joins Firebase to MongoDB on `firebaseUid` ONLY (never email), so
 * the honest way to hand an existing login a seeded tenant is to read the uid from
 * FIREBASE — the identity authority — and then create or reuse the MongoDB User that
 * carries it. Nothing in this module looks a user up by email in MongoDB.
 *
 * WHY AN EXISTING IDENTITY'S PASSWORD IS SET RATHER THAN IGNORED (found 2026-10-24). The
 * original version read the existing row and returned, so a second seeding run silently
 * kept whatever password the FIRST run chose — and since that password is supplied in the
 * environment and never written down, the next person to test a preview build had an
 * identity they could not sign in as, with no message saying why. The identity is reused
 * across test cycles precisely to avoid accumulating addresses, so refreshing its credential
 * is the behaviour that makes the documented `DEMO_ACCOUNT_PASSWORD` mean what it says.
 *
 * `refreshPassword: false` is for an EXISTING identity in production (2026-10-25). The account
 * seeders can now run against a real deployment, where the address may belong to a person: a
 * seeding run must never rewrite a living user's credential as a side effect. Creation still
 * uses the password, because a new identity has none otherwise.
 *
 * `emailVerified` is set true alongside it, for the reason the create path already gives:
 * this is a reserved demo credential (`…@example.invalid`), not a person, and the preview
 * test asserts the app's post-verification behaviour rather than re-testing Firebase.
 *
 * This never DELETES an identity. `docs/DEVELOPMENT_ROADMAP.md` §27BB records what
 * happens when the two stores are cleaned in the wrong relationship: a MongoDB user
 * whose Firebase identity was deleted can neither sign in nor register
 * (`409 EMAIL_IN_USE`), and nothing in the application can repair it.
 */
export async function resolveIdentity(email, { refreshPassword = true } = {}) {
  const { getFirebaseAdminApp } = await import('../../src/services/firebase/adminApp.ts');
  const { getAuth } = await import('firebase-admin/auth');
  const app = getFirebaseAdminApp();
  // WHICH identity authority, checked before the first read: the shell's credentials decide the
  // project, and an identity created in the wrong one could never be joined to the tenant written
  // here (the application resolves a user by `firebaseUid` only). See `assertSeedFirebaseProject`.
  assertSeedFirebaseProject(app.options?.projectId);
  const auth = getAuth(app);
  const address = normaliseEmail(email);

  const password = process.env.DEMO_ACCOUNT_PASSWORD;

  try {
    const existing = await auth.getUserByEmail(address);
    if (!password || !refreshPassword) {
      return {
        uid: existing.uid,
        created: false,
        emailVerified: existing.emailVerified,
        passwordRefreshed: false,
        // True only when a password WAS supplied and deliberately not applied. Callers use it to
        // say "unchanged" out loud rather than leaving the operator to wonder.
        passwordSkipped: Boolean(password) && !refreshPassword,
      };
    }
    await auth.updateUser(existing.uid, { password, emailVerified: true });
    return { uid: existing.uid, created: false, emailVerified: true, passwordRefreshed: true };
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
  }

  if (!password) {
    throw new SeedSafetyError(
      `no Firebase identity exists for ${address}, and DEMO_ACCOUNT_PASSWORD is not set. ` +
        'Set it in the environment to create the identity (it is never written to a file or printed).',
    );
  }
  const created = await auth.createUser({ email: address, password, emailVerified: true });
  // NOT a refresh: the identity did not exist, so creation is what set the credential.
  // Saying otherwise in the console line would report a change that did not happen.
  return { uid: created.uid, created: true, emailVerified: true, passwordRefreshed: false, passwordSkipped: false };
}

/**
 * Read-only: the Firebase identity for an address, or null. NEVER creates, NEVER updates.
 *
 * WHY IT IS SEPARATE FROM `resolveIdentity`. A preview has to answer "which tenant would this run
 * reset?" without the side effects a seed may have: `resolveIdentity` creates a login when one is
 * missing and can refresh a password. A dry run that created an identity would be the write it
 * promised not to make.
 */
export async function readIdentity(email) {
  const { getFirebaseAdminApp } = await import('../../src/services/firebase/adminApp.ts');
  const { getAuth } = await import('firebase-admin/auth');
  const app = getFirebaseAdminApp();
  assertSeedFirebaseProject(app.options?.projectId);
  const auth = getAuth(app);
  try {
    const existing = await auth.getUserByEmail(normaliseEmail(email));
    return { uid: existing.uid, emailVerified: Boolean(existing.emailVerified), created: false };
  } catch (err) {
    if (err?.code === 'auth/user-not-found') return null;
    throw err;
  }
}

/**
 * The identity link on an existing account must be the one Firebase reports now.
 *
 * WHY THIS EXISTS (found 2026-10-26). `ensureTenantForIdentity` resolves the tenant by
 * `firebaseUid`. When an identity has been deleted and re-created under the same address,
 * Firebase reports a NEW uid while the row still carries the old one, so the lookup misses
 * and the seeder tries to create a second User for the same address — dying on
 * `users.email_1` with a raw driver error that says nothing about the cause.
 *
 * That state is §27BB's trap: the row can neither sign in (the exchange resolves by
 * `firebaseUid` only) nor register again (`409 EMAIL_IN_USE`). It is NOT this seeder's job
 * to repair it, because re-pointing `firebaseUid` is an identity linkage change and the
 * project deliberately never performs one implicitly. So the run is refused, and the
 * message names both uids and the choice (repair deliberately, or seed another address).
 *
 * Pure: both uids are passed in, so the rule is testable without Firebase or MongoDB.
 */
export function assertIdentityLinkUsable({ email, storedUid, resolvedUid }) {
  const stored = String(storedUid ?? '').trim();
  const resolved = String(resolvedUid ?? '').trim();
  const short = (uid) => (uid.length > 10 ? `${uid.slice(0, 10)}…` : uid);

  if (stored && stored === resolved) return true;

  if (!stored) {
    throw new SeedSafetyError(
      `the database account for ${email} carries NO Firebase identity, so this run cannot prove it is the ` +
        'same person. A legacy address has to be migrated deliberately; a data seeder will not attach an ' +
        'identity to it. Nothing was written.',
    );
  }

  throw new SeedSafetyError(
    `the database account for ${email} is linked to Firebase uid ${short(stored)}, but Firebase now reports ` +
      `${short(resolved)} for that address. That row can neither sign in (the exchange resolves by ` +
      'firebaseUid only) nor register again (409 EMAIL_IN_USE), and re-pointing an identity link is not ' +
      'something a data seeder does implicitly. Repair the link deliberately, or seed a different address. ' +
      'Nothing was written.',
  );
}

/**
 * The tenant this identity already owns, or null when the account has none yet. READ-ONLY.
 *
 * The lookup is shared with the production dry run, so a preview and a real run cannot disagree
 * about which tenant an account owns — the disagreement that made the preview report exit 0 for
 * an id the real run refuses (measured 2026-10-28).
 */
export async function resolveExistingTenantForIdentity({ email, identity }) {
  const address = normaliseEmail(email);
  const user = await User.findOne({ firebaseUid: identity.uid })
    .select('_id businessId email')
    .lean();

  // The uid lookup missed. If a row already owns this ADDRESS, the next write would hit
  // `users.email_1` — and the reason is either a stale link (the §27BB trap) or a legacy
  // account. Both are reported, neither is repaired here: see assertIdentityLinkUsable.
  if (!user) {
    const byEmail = await User.findOne({ email: address })
      .select('_id businessId email firebaseUid')
      .lean();
    if (!byEmail) return null;
    assertIdentityLinkUsable({
      email: address,
      storedUid: byEmail.firebaseUid,
      resolvedUid: identity.uid,
    });
    return tenantForExistingUser(byEmail);
  }

  if (!user.businessId) return null;
  return tenantForExistingUser(user);
}

/** The business a resolved user row points at, with the two states a seed refuses to repair. */
async function tenantForExistingUser(user) {
  const business = user.businessId
    ? await Business.findById(user.businessId).select('name status').lean()
    : null;
  if (!business) {
    throw new SeedSafetyError(
      `the account for ${user.email} exists but its business ${String(user.businessId)} does not. ` +
        'Refusing to guess at a repair — fix the linkage deliberately. Nothing was written.',
    );
  }
  if (business.status !== 'ACTIVE') {
    throw new SeedSafetyError(
      `the account's business status is ${business.status}. Nothing was written.`,
    );
  }
  return {
    businessId: business._id,
    businessName: business.name,
    userId: user._id,
    accountCreated: false,
    reused: true,
  };
}

/**
 * Find — or create — the tenant that belongs to an already-resolved identity.
 *
 * Reuse is the normal path: the owner registers through the app, and the seeder then
 * attaches to the tenant registration created. Creation is the fallback for an
 * identity that exists in Firebase but has no MongoDB account yet (which is exactly
 * the state the app itself calls `REGISTRATION_REQUIRED`), and it writes the same
 * shape the registration flow writes: OWNER, ACTIVE, linked by `firebaseUid` only.
 *
 * The account rows are only ever CREATED here, never deleted and never re-linked: a
 * data seeder has no business touching an account's identity linkage.
 */
export async function ensureTenantForIdentity({ email, identity, businessName }) {
  const existing = await resolveExistingTenantForIdentity({ email, identity });
  if (existing) return existing;

  const address = normaliseEmail(email);
  const business = await Business.create({ name: businessName, status: 'ACTIVE' });
  const created = await User.create({
    businessId: business._id,
    name: 'AI Test Owner',
    email: address,
    role: 'OWNER',
    status: 'ACTIVE',
    firebaseUid: identity.uid,
    emailVerified: identity.emailVerified === true,
  });
  return {
    businessId: business._id,
    businessName,
    userId: created._id,
    accountCreated: true,
    reused: false,
  };
}

/**
 * Write a full, self-consistent dataset into ONE tenant.
 *
 * Every count scales with `total`, so the knob means what it says at any size. A
 * FIXED supplier/PO count was the first draft, and at `--total=300` the "fixed"
 * collections alone produced 666 documents for a 300-document request — a target the
 * script then reported as if it had hit it.
 *
 * `includeSkuBarcode: false` omits `sku`/`barcode` on products (and the `sku`
 * snapshot on PO lines, which is optional in the schema). Both fields are optional in
 * the Product schema and are uniquely indexed with a `partialFilterExpression`, so any
 * number of products may omit them — which is what leaves the app's own barcode
 * generation as the thing that first assigns them.
 *
 * Returns per-collection counts. It does NOT reset pre-existing data first; the
 * caller does that with `clearTenantData`, because "reset then seed" is a tenant
 * lifecycle decision rather than part of writing a dataset.
 */
export async function seedTenant({
  businessId,
  userId = null,
  total,
  rand,
  includeSkuBarcode = true,
  label = 'DEMO',
}) {
  const business = businessId;

  const scale = (share, min, max) => Math.max(min, Math.min(max, Math.round(total * share)));
  const categoryCount = Math.min(CATEGORY_NAMES.length, scale(0.0003, 4, 24));
  const locationCount = scale(0.0001, 2, 6);
  const supplierCount = scale(0.004, 5, 300);
  const poCount = scale(0.02, 5, 1600);
  const productCount = Math.max(5, Math.round(total * 0.225));

  const categories = await Category.insertMany(
    CATEGORY_NAMES.slice(0, categoryCount).map((name) => ({ businessId: business, name, status: 'ACTIVE' })),
    { ordered: false },
  );
  const locations = await Location.insertMany(
    LOCATION_NAMES.slice(0, locationCount).map((name) => ({ businessId: business, name, status: 'ACTIVE' })),
    { ordered: false },
  );
  const suppliers = await Supplier.insertMany(
    Array.from({ length: supplierCount }, (_, i) => ({
      businessId: business,
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
  // A share sits at or below its minimum so the restock path returns a full page; a
  // tenant where nothing is ever low would leave that query's cost unmeasured.
  const productDocs = [];
  for (let i = 0; i < productCount; i += 1) {
    const minimumStock = intBetween(rand, 5, 100);
    const low = rand() < 0.15;
    const available = low
      ? (rand() < 0.4 ? 0 : intBetween(rand, 1, minimumStock))
      : Math.round(minimumStock * (1.5 + rand() * 8));
    const doc = {
      businessId: business,
      name: `${pick(rand, ADJECTIVES)} ${pick(rand, NOUNS)} ${10000 + i}`,
      description: `Seeded row ${i} for AI scale testing`,
      categoryId: categories[i % categories.length]._id,
      costPrice: Number((1 + rand() * 40).toFixed(2)),
      sellingPrice: Number((2 + rand() * 80).toFixed(2)),
      unit: pick(rand, UNITS),
      minimumStock,
      status: 'ACTIVE',
      _availableTotal: available,
    };
    if (includeSkuBarcode) {
      doc.sku = `${label}SKU-${i}`;
      doc.barcode = `${label}BC${i}`;
    }
    productDocs.push(doc);
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
        businessId: business,
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
  // order. A self-contradicting ledger reads exactly like a wrong answer.
  const poDocs = [];
  const receiptTxDocs = [];
  const receivingUser = userId;

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
        // Optional in the schema. Omitted with the product's own sku, so the PO line
        // never claims a code the product does not have.
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
          businessId: business,
          productId: item.productId,
          locationId: locations[i % locations.length]._id,
          type: 'STOCK_IN',
          quantity: item.quantityReceived,
          previousQuantity: previous,
          newQuantity: previous + item.quantityReceived,
          reason: 'Purchase order receipt',
          reference: `PO-${label}-${String(i + 1).padStart(5, '0')}`,
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
      businessId: business,
      number: `PO-${label}-${String(i + 1).padStart(5, '0')}`,
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
  const historyDocs = [];
  // The PO receipt movements are ALREADY written and count toward the budget, so they
  // are subtracted here rather than added on top of it. Without that the first full run
  // reported 80 842 documents for an 80 000 target — a 1 % overshoot that the script
  // displayed as if the target had been met.
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
    const type = pick(rand, TX_TYPES);
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
      businessId: business,
      productId: products[productIndex]._id,
      locationId: pick(rand, locations)._id,
      type,
      quantity,
      previousQuantity: previous,
      newQuantity: target,
      reason: 'Seeded movement',
      reference: `${label}-${productIndex}-${i}`,
      userId: receivingUser,
      createdAt: when,
      updatedAt: when,
    });
  }

  const allTxDocs = [...historyDocs, ...receiptTxDocs];
  const txInserted = (await insertChunked(InventoryTransaction, allTxDocs, DEFAULT_CHUNK_SIZE)).length;

  const counts = {
    categories: categoryCount,
    locations: locationCount,
    suppliers: supplierCount,
    products: products.length,
    inventory: inventoryInserted,
    inventory_transactions: txInserted,
    purchase_orders: poInserted,
  };
  const achieved = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return { counts, achieved, receiptTransactions: receiptTxDocs.length, productDocs };
}

/**
 * Count what is ACTUALLY in one tenant, through the same `businessId` filter every screen uses.
 *
 * A seeder's own tally is evidence about the seeder. This is the read-back: if an insert was
 * partially rejected, the difference shows up here rather than in a measurement taken later.
 * The seven collections are the ones `seedTenant` writes, so the comparison is exact.
 */
export async function readTenantCounts(businessId) {
  const filter = { businessId };
  const [categories, locations, suppliers, products, inventory, inventory_transactions, purchase_orders] =
    await Promise.all([
      Category.countDocuments(filter),
      Location.countDocuments(filter),
      Supplier.countDocuments(filter),
      Product.countDocuments(filter),
      Inventory.countDocuments(filter),
      InventoryTransaction.countDocuments(filter),
      PurchaseOrder.countDocuments(filter),
    ]);

  return { categories, locations, suppliers, products, inventory, inventory_transactions, purchase_orders };
}

/**
 * The collections whose write count and read-back count disagree, named with both numbers.
 *
 * Pure, so the comparison is asserted on values rather than on a database. An empty array means
 * the dataset that was reported is the dataset that exists.
 */
export function countDisagreements(written, readBack) {
  return Object.keys(written ?? {})
    .filter((collection) => (readBack ?? {})[collection] !== written[collection])
    .map((collection) => ({
      collection,
      wrote: written[collection],
      found: (readBack ?? {})[collection],
    }));
}

/**
 * Which database a read-only check covers: exactly ONE.
 *
 * WHY ONE, AND WHY IT IS A FUNCTION (measured 2026-10-28). `check:accounts --with-production` used to
 * return `[development, production]` — development always, production appended when asked — and then
 * judged readiness across both. A shell whose development database held no user row (because the data
 * had been cleaned) therefore reported **NOT READY (exit 1)** for accounts that were READY in
 * production. The exit code described the other database, which is not the one the operator was
 * about to seed. Each environment is judged on its own, by selecting one.
 *
 * Pure, and takes the names as an argument, so the rule is asserted on values rather than inferred
 * from the script's text.
 */
export function databasesToCheck({ withProduction, databaseNames }) {
  return withProduction ? [databaseNames.production] : [databaseNames.development];
}

/**
 * Readiness over every database that was actually read — and over nothing else.
 *
 * The exit code is `notReady > 0 ? 1 : 0`, so this is where "a missing row in the other environment"
 * stops being able to fail a run: the caller only ever passes the databases `databasesToCheck` chose.
 * Pure, so the arithmetic is tested without a connection.
 */
export function summariseReadiness(checked) {
  const pairs = checked.reduce((total, entry) => total + entry.rows.length, 0);
  const notReady = checked.reduce(
    (total, entry) => total + entry.rows.filter((row) => row.verdict !== 'READY').length,
    0,
  );
  return { pairs, notReady, ready: pairs - notReady };
}

export default {
  COMPARISON_ACCOUNTS,
  PRODUCTS_SHARE,
  MIN_PRODUCTS,
  MAX_PRODUCTS,
  MIN_DOCUMENTS,
  MAX_DOCUMENTS,
  productsForDocuments,
  documentsForProducts,
  makeRandom,
  intBetween,
  pick,
  insertChunked,
  normaliseEmail,
  parseCount,
  assertIdentityLinkUsable,
  resolveIdentity,
  readIdentity,
  resolveExistingTenantForIdentity,
  ensureTenantForIdentity,
  seedTenant,
  readTenantCounts,
  countDisagreements,
  databasesToCheck,
  summariseReadiness,
};
