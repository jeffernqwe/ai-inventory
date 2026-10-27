// `npm run verify:demo -- --email=<address> [--database=<name>]` — prove the seeded
// dataset is what the seeder claimed, WITHOUT believing the seeder's own report.
//
// It works in ANY named database, production included: `--database=<name>` must equal
// the database this process resolved. Development and the test database need no
// naming, exactly as before. Nothing is written, deleted or spent, so there is no
// confirmation phrase — the target's name is the whole of what is deliberate.
//
// WHY THIS EXISTS. `seed:demo` prints counts it computed from its own inserts, which
// is evidence about the script, not about the database. This reads the rows back and
// checks the three things a fixture can silently get wrong:
//
//   1. COUNTS, from the database, resolved through the account's own businessId.
//   2. LEDGER CONSISTENCY — every inventory transaction must satisfy the invariant its
//      OWN type implies (`newQuantity = previous +/- quantity`, `quantity = |target -
//      previous|` for an adjustment) and no quantity may be negative. The performance
//      seeder once wrote 6 615 of 6 616 STOCK_OUT rows as increases, and the assistant
//      reported that faithfully: a self-contradicting fixture reads like a wrong answer.
//   3. REFERENTIAL INTEGRITY — every inventory row points at a product and a location
//      that exist, every purchase order at a real supplier, and every receipt line at a
//      real inventory transaction (a receipt must be backed by the movement it claims).
//
// Read-only: it never writes. Exit code 1 on any violation, so it can gate a
// measurement run. It also prints the stock-health spread, because a dataset where
// nothing is ever low leaves the restock path unmeasured.
//
// Two bugs in the FIRST version of this file are worth remembering, because both were
// false alarms that a reader could have mistaken for fixture defects: a `select()` that
// omitted `supplierId` made all 1 600 purchase orders look like orphans, and counting
// inventory ROWS instead of summing quantities reported all 18 000 products as low.

import 'dotenv/config';
import mongoose from 'mongoose';

import env, { DATABASE_NAMES } from '../src/config/env.ts';
import Category from '../src/models/category.model.ts';
import Inventory from '../src/models/inventory.model.ts';
import InventoryTransaction from '../src/models/inventoryTransaction.model.ts';
import Location from '../src/models/location.model.ts';
import Product from '../src/models/product.model.ts';
import PurchaseOrder from '../src/models/purchaseOrder.model.ts';
import Supplier from '../src/models/supplier.model.ts';
import User from '../src/models/user.model.ts';
import { SeedSafetyError, assertNamedReadTarget } from './perf/lib.mjs';

const COMMAND = 'verify:demo';

// A MISSING ADDRESS MUST STOP HERE, BEFORE THE CONNECTION. `User.findOne({ email: undefined })`
// drops the key, so the query becomes `findOne({})` — the first user in the database — and a run
// that forgot the flag would verify, and could pass, an account nobody named. Measured 2026-10-27:
// the old code reached the connection first, so the only symptom was a network error. It is
// reported as "could not check" (exit 2) because nothing has been read and nothing is claimed.
// The positional form (`npm run verify:demo -- you@example.com`) is kept, but a POSITIONAL FLAG is
// not an address: `-- --database=…` alone used to be read as the email.
const emailFlag = process.argv.find((a) => a.startsWith('--email='))?.slice('--email='.length);
const positional = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : undefined;
const email = String(emailFlag ?? positional ?? '').trim();
if (!email) {
  console.error(`[${COMMAND}] --email=<address> is required, and nothing was read.`);
  console.error(`[${COMMAND}] NOT VERIFIED (exit 2) — no account was named.`);
  process.exit(2);
}

// Which database these numbers came from has to be answerable before the first query.
// A refusal here is NOT a data problem, so it takes the same exit code as an
// unreachable database: 2, "could not check".
let database;
try {
  database = assertNamedReadTarget({
    mongodbUri: env.mongodbUri,
    resolvedDbName: env.mongodbDbName,
    requestedDatabase: process.argv.find((a) => a.startsWith('--database='))?.slice('--database='.length),
    command: COMMAND,
  });
} catch (err) {
  if (err instanceof SeedSafetyError) {
    console.error(`[${COMMAND}] ${err.message}`);
    console.error(`[${COMMAND}] NOT VERIFIED (exit 2) — nothing was read.`);
    process.exit(2);
  }
  throw err;
}

// THE EXIT CODE IS A CONTRACT, and conflating two very different outcomes is how a
// network blip sends someone hunting for a data bug. That happened twice while this
// file was being written — an Atlas `ETIMEDOUT` exited 1, exactly like a broken row:
//
//   0  verified — the dataset is what the seeder claimed
//   1  a VIOLATION was found — the data is wrong
//   2  NOT VERIFIED — the database could not be reached, or the account does not
//      exist. Nothing is known about the data, and nothing is claimed about it.
//
// An exit 2 is the honest answer to "we could not look"; only 1 means "we looked and
// it is broken".
try {
  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });
} catch (err) {
  console.error(`[verify:demo] could not reach MongoDB: ${err?.message ?? err}`);
  console.error('[verify:demo] NOT VERIFIED (exit 2) — this is not a data violation.');
  process.exit(2);
}

// Printed BEFORE the lookup, so an exit 2 still says which database was checked.
console.log(`database    : ${database}${database === DATABASE_NAMES.production ? '   (PRODUCTION)' : ''}`);

const user = await User.findOne({ email }).select('_id businessId role status emailVerified firebaseUid').lean();
if (!user) {
  // Also not a violation: asking about an account that is not there says nothing about
  // the seeded rows.
  console.error(`[verify:demo] no MongoDB user for ${email} — NOT VERIFIED (exit 2).`);
  process.exit(2);
}
const businessId = user.businessId;
const filter = { businessId };
console.log(`account     : ${email}  role=${user.role} status=${user.status} firebaseUid=${user.firebaseUid ? 'yes' : 'NONE'}`);
console.log(`businessId  : ${String(businessId)}`);

const counts = {
  categories: await Category.countDocuments(filter),
  locations: await Location.countDocuments(filter),
  suppliers: await Supplier.countDocuments(filter),
  products: await Product.countDocuments(filter),
  inventory: await Inventory.countDocuments(filter),
  inventory_transactions: await InventoryTransaction.countDocuments(filter),
  purchase_orders: await PurchaseOrder.countDocuments(filter),
};
let sum = 0;
console.log('\nINDEPENDENT COUNTS (from the database, not from the script):');
for (const [k, v] of Object.entries(counts)) {
  sum += v;
  console.log(`  ${k.padEnd(24)} ${String(v).padStart(7)}`);
}
console.log(`  ${'TOTAL'.padEnd(24)} ${String(sum).padStart(7)}`);

// ---- ledger consistency: every row must satisfy the invariant its OWN type implies
const tx = await InventoryTransaction.find(filter)
  .select('type quantity previousQuantity newQuantity')
  .lean();
const bad = { STOCK_IN: 0, STOCK_OUT: 0, ADJUSTMENT: 0, other: 0 };
for (const t of tx) {
  if (t.type === 'STOCK_IN') {
    if (t.newQuantity !== t.previousQuantity + t.quantity) bad.STOCK_IN += 1;
  } else if (t.type === 'STOCK_OUT') {
    if (t.newQuantity !== t.previousQuantity - t.quantity) bad.STOCK_OUT += 1;
  } else if (t.type === 'ADJUSTMENT') {
    if (t.quantity !== Math.abs(t.newQuantity - t.previousQuantity)) bad.ADJUSTMENT += 1;
  } else bad.other += 1;
}
console.log('\nLEDGER CONSISTENCY (a self-contradicting ledger reads like a wrong answer):');
console.log(`  checked          ${tx.length}`);
console.log(`  STOCK_IN  bad    ${bad.STOCK_IN}`);
console.log(`  STOCK_OUT bad    ${bad.STOCK_OUT}`);
console.log(`  ADJUSTMENT bad   ${bad.ADJUSTMENT}`);
const negative = tx.filter((t) => t.newQuantity < 0 || t.previousQuantity < 0).length;
console.log(`  negative stock   ${negative}`);

// ---- referential integrity of what was written
const productIds = new Set((await Product.find(filter).select('_id').lean()).map((d) => String(d._id)));
const locationIds = new Set((await Location.find(filter).select('_id').lean()).map((d) => String(d._id)));
const supplierIds = new Set((await Supplier.find(filter).select('_id').lean()).map((d) => String(d._id)));
const txIds = new Set((await InventoryTransaction.find(filter).select('_id').lean()).map((d) => String(d._id)));

const inventory = await Inventory.find(filter).select('productId locationId quantity').lean();
const invOrphans =
  inventory.filter((r) => !productIds.has(String(r.productId))).length +
  inventory.filter((r) => !locationIds.has(String(r.locationId))).length;

// `supplierId` MUST be projected: leaving it out made every PO look like an orphan
// in the first version of this check, which reported 1600 broken references that
// were not broken at all.
const pos = await PurchaseOrder.find(filter).select('items receipts number supplierId').lean();
let poOrphanProduct = 0;
let poOrphanTx = 0;
let receiptLines = 0;
for (const po of pos) {
  for (const item of po.items ?? []) {
    if (!productIds.has(String(item.productId))) poOrphanProduct += 1;
  }
  for (const receipt of po.receipts ?? []) {
    for (const line of receipt.lines ?? []) {
      receiptLines += 1;
      if (!txIds.has(String(line.inventoryTransactionId))) poOrphanTx += 1;
    }
  }
}
const suppliers = await Supplier.find(filter).select('_id').lean();
const poOrphanSupplier = pos.filter((po) => !supplierIds.has(String(po.supplierId))).length;

console.log('\nREFERENTIAL INTEGRITY:');
console.log(`  inventory rows with a missing product or location : ${invOrphans}`);
console.log(`  PO items with a missing product                   : ${poOrphanProduct}`);
console.log(`  PO rows with a missing supplier                   : ${poOrphanSupplier}`);
console.log(`  receipt lines total                               : ${receiptLines}`);
console.log(`  receipt lines pointing at a MISSING transaction    : ${poOrphanTx}`);
console.log(`  suppliers present                                 : ${suppliers.length}`);

// ---- stock-health spread, so the assistant's answers have something to report
const products = await Product.find(filter).select('_id minimumStock').lean();
// SUM the quantities across locations — counting the ROWS instead (the first draft)
// compares a per-product row count of 1-3 against a minimum of 5-100, which reports
// every single product as low on stock.
const perProduct = new Map();
for (const row of inventory) {
  const key = String(row.productId);
  perProduct.set(key, (perProduct.get(key) ?? 0) + (row.quantity ?? 0));
}
let low = 0;
let zero = 0;
for (const p of products) {
  const qty = perProduct.get(String(p._id)) ?? 0;
  if (qty <= (p.minimumStock ?? 0)) low += 1;
  if (qty === 0) zero += 1;
}
console.log('\nSTOCK HEALTH:');
console.log(`  products                       ${products.length}`);
console.log(`  at or below minimum (restock)   ${low}`);
console.log(`  zero on hand                    ${zero}`);

// ---- the verdict, and the only path that exits 1
const problems = [
  ['STOCK_IN movements whose arithmetic does not hold', bad.STOCK_IN],
  ['STOCK_OUT movements whose arithmetic does not hold', bad.STOCK_OUT],
  ['ADJUSTMENT movements whose arithmetic does not hold', bad.ADJUSTMENT],
  ['movements of an unrecognised type', bad.other],
  ['movements leaving a negative quantity', negative],
  ['inventory rows pointing at a missing product or location', invOrphans],
  ['purchase-order items pointing at a missing product', poOrphanProduct],
  ['purchase orders pointing at a missing supplier', poOrphanSupplier],
  ['receipt lines pointing at a missing transaction', poOrphanTx],
].filter(([, count]) => count > 0);

await mongoose.disconnect();

if (problems.length > 0) {
  console.error('\n[verify:demo] VIOLATIONS FOUND (exit 1):');
  for (const [label, count] of problems) console.error(`  - ${label}: ${count}`);
  process.exit(1);
}
console.log('\n[verify:demo] OK (exit 0) — counts, ledger and referential integrity all hold.');
process.exit(0);
