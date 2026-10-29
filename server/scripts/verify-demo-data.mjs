// `npm run verify:demo -- --email=<address> [--expect-products=<n>] [--expect-codes=…] [--database=<name>]`
// `npm run verify:demo -- --accounts="<address>[:products][:codes=…],…" [--expect-products=<n>] [--expect-codes=…] [--database=<name>]`
//
// Prove a seeded dataset is what the seeder claimed, WITHOUT believing the seeder's own
// report. One run may verify one account (`--email=`) or several (`--accounts=`), and each
// entry may name the product count it should hold and the SKU/barcode mode it should carry.
// Read-only in every mode.
//
// It works in ANY named database, production included: `--database=<name>` must equal
// the database this process resolved. Development and the test database need no
// naming, exactly as before. Nothing is written, deleted or spent, so there is no
// confirmation phrase — the target's name is the whole of what is deliberate.
//
// WHY THIS EXISTS. `seed:demo` prints counts it computed from its own inserts, which
// is evidence about the script, not about the database. This reads the rows back and
// checks the four things a fixture can silently get wrong:
//
//   1. COUNTS, from the database, resolved through the account's own businessId — and
//      the tenant must actually HOLD something. An empty tenant used to produce zero
//      violations and print SUCCESS, which verified nothing at all. When an expected
//      product count is named, the count must match it exactly; otherwise verification
//      only proves the tenant is non-empty.
//   2. LEDGER CONSISTENCY — every inventory transaction must satisfy the invariant its
//      OWN type implies (`newQuantity = previous +/- quantity`, `quantity = |target -
//      previous|` for an adjustment, the same absolute change for each TRANSFER leg) and
//      no quantity may be negative. The performance seeder once wrote 6 615 of 6 616
//      STOCK_OUT rows as increases, and the assistant reported that faithfully: a
//      self-contradicting fixture reads like a wrong answer.
//   3. REFERENTIAL INTEGRITY — every inventory row points at a product and a location
//      that exist, every purchase order at a real supplier, and every receipt line at a
//      real transaction (a receipt must be backed by the movement it claims).
//   4. CODE COVERAGE + BARCODE HEALTH — the products actually carry the SKU/barcode
//      mode the seed was asked for, and their barcode VALUES are valid. The old verifier
//      read counts and references but never this setting, so a seed that dropped either
//      field could still print SUCCESS. `--expect-codes=` or an entry's `codes=` states
//      the expected mode; the four product counts are printed on every run, and only an
//      explicitly named mode can fail the run. Every run also checks the stored values:
//      a wrong EAN-13 check digit or a duplicate value fails it, while a non-EAN-13
//      manufacturer code is reported without failing.
//
// Read-only: it never writes. Exit code 1 on any violation, code-mode mismatch or
// expected-size mismatch (including an empty tenant), so it can gate a measurement run.
// Exit 2 means NOT VERIFIED — a database could not be reached, or an account cannot be
// checked. With several accounts, every account is read before the exit code is chosen:
// one failed account makes the run exit 1; if none failed but one could not be checked,
// it exits 2. It also prints the stock-health spread, because a dataset where nothing is
// ever low leaves the restock path unmeasured.
//
// Two bugs in the FIRST version of this file are worth remembering, because both were
// false alarms that a reader could have mistaken for fixture defects: a `select()` that
// omitted `supplierId` made all 1 600 purchase orders look like orphans, and counting
// inventory ROWS instead of summing quantities reported all 18 000 products as low.

import 'dotenv/config';
import mongoose from 'mongoose';

import env, { DATABASE_NAMES } from '../src/config/env.ts';
import Business from '../src/models/business.model.ts';
import Category from '../src/models/category.model.ts';
import Inventory from '../src/models/inventory.model.ts';
import InventoryTransaction from '../src/models/inventoryTransaction.model.ts';
import Location from '../src/models/location.model.ts';
import Product from '../src/models/product.model.ts';
import PurchaseOrder from '../src/models/purchaseOrder.model.ts';
import Supplier from '../src/models/supplier.model.ts';
import User from '../src/models/user.model.ts';
import { readProductCodeCoverage } from './demo/codeCoverage.mjs';
import {
  barcodeHealthProblem,
  classifyBarcodeHealth,
  classifyCodeCoverage,
  codeCoverageProblem,
  formatBarcodeHealth,
  formatCodeCoverage,
  ledgerViolations,
  parseExpectedCodeMode,
  parseExpectedProducts,
  parseVerificationAccounts,
  tenantEmptinessProblem,
} from './demo/verify.mjs';
import { SeedSafetyError, assertNamedReadTarget } from './perf/lib.mjs';
import { isEmailAddress, normaliseEmail } from './seed/lib.mjs';

const COMMAND = 'verify:demo';

function argValue(flag, argv = process.argv) {
  const prefix = `${flag}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

/** A target/input refusal is "could not check", not "the data is broken". */
function notVerified(message) {
  console.error(`[${COMMAND}] ${message}`);
  console.error(`[${COMMAND}] NOT VERIFIED (exit 2) — nothing was read.`);
  process.exit(2);
}

// A MISSING ADDRESS MUST STOP HERE, BEFORE THE CONNECTION. `User.findOne({ email: undefined })`
// drops the key, so the query becomes `findOne({})` — the first user in the database — and a run
// that forgot the flag would verify, and could pass, an account nobody named. Measured 2026-10-27:
// the old code reached the connection first, so the only symptom was a network error. It is
// reported as "could not check" (exit 2) because nothing has been read and nothing is claimed.
// The positional form (`npm run verify:demo -- you@example.com`) is kept, but a POSITIONAL FLAG is
// not an address: `-- --database=…` alone used to be read as the email.
const emailFlag = process.argv.find((a) => a.startsWith('--email='))?.slice('--email='.length);
const positional = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : undefined;
const accountsFlag = process.argv.find((a) => a.startsWith('--accounts='))?.slice('--accounts='.length);
const expectCodesFlags = process.argv.filter((a) => a.startsWith('--expect-codes='));
// One spelling at the boundary, because `users.email` is stored lower-case and Mongoose
// applies `lowercase` on WRITE only: `--email=A@X.com` used to miss the row it named.
const email = normaliseEmail(emailFlag ?? positional);

let accounts;
try {
  if (accountsFlag !== undefined && (emailFlag !== undefined || positional !== undefined)) {
    throw new Error('--accounts= cannot be combined with --email= or a positional address. Nothing was read.');
  }

  const defaultExpectedProducts = parseExpectedProducts(argValue('--expect-products'));
  if (process.argv.includes('--expect-codes')) {
    throw new Error('--expect-codes needs a value: --expect-codes=both, --expect-codes=none, --expect-codes=sku or --expect-codes=barcode. Nothing was read.');
  }
  if (expectCodesFlags.length > 1) {
    throw new Error('--expect-codes is given more than once. Nothing was read.');
  }
  const defaultExpectedCodes = parseExpectedCodeMode(
    expectCodesFlags[0]?.slice('--expect-codes='.length),
  );

  if (accountsFlag !== undefined) {
    accounts = parseVerificationAccounts(
      accountsFlag,
      defaultExpectedProducts,
      defaultExpectedCodes,
    );
  } else {
    if (!isEmailAddress(email)) {
      console.error(
        `[${COMMAND}] --email=<address> is required (or --accounts="address[:products][:codes=…],…"), ` +
          'and nothing was read.',
      );
      console.error(`[${COMMAND}] NOT VERIFIED (exit 2) — no usable account was named.`);
      process.exit(2);
    }
    accounts = [
      { email, expectedProducts: defaultExpectedProducts, expectedCodes: defaultExpectedCodes },
    ];
  }

  const seen = new Set();
  for (const account of accounts) {
    account.email = normaliseEmail(account.email);
    if (!isEmailAddress(account.email)) {
      throw new Error(`"${account.email}" is not a usable address. Nothing was read.`);
    }
    if (seen.has(account.email)) {
      throw new Error(`"${account.email}" appears twice in --accounts. Nothing was read.`);
    }
    seen.add(account.email);
  }
} catch (err) {
  notVerified(err?.message ?? String(err));
}

// Which database these numbers came from has to be answerable before the first query.
// A refusal here is NOT a data problem, so it takes the same exit code as an
// unreachable database: 2, "could not check".
let database;
try {
  database = assertNamedReadTarget({
    mongodbUri: env.mongodbUri,
    resolvedDbName: env.mongodbDbName,
    requestedDatabase: argValue('--database'),
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
console.log(`Database : ${database}${database === DATABASE_NAMES.production ? ' (PRODUCTION)' : ''}`);
console.log(`Accounts : ${accounts.length}`);

/**
 * One account. Returns `verified`, `failed` or `unchecked`, and prints the evidence either way.
 *
 * The tenant is resolved through the account's OWN `businessId`, never from a client-supplied
 * id, so a row read here belongs to the business the account is linked to. The `expectedProducts`
 * and `expectedCodes` checks are optional; without them, the command still proves the tenant is
 * non-empty and internally consistent, and prints the code coverage it found.
 */
async function verifyTenant({ email, expectedProducts, expectedCodes }) {
  const user = await User.findOne({ email })
    .select('_id businessId role status emailVerified firebaseUid')
    .lean();
  if (!user) {
    // Also not a violation: asking about an account that is not there says nothing about
    // the seeded rows.
    console.error('');
    console.error(`[${COMMAND}] ${email} — no MongoDB user — NOT VERIFIED (exit 2).`);
    return 'unchecked';
  }

  const businessId = user.businessId;
  const business = businessId
    ? await Business.findById(businessId).select('name').lean()
    : null;
  if (!business) {
    // A user row pointing at no business cannot describe a tenant. Nothing is known about
    // the data, so this is the same "could not check" outcome as an unreachable database.
    console.error('');
    console.error(
      `[${COMMAND}] ${email} — business ${String(businessId)} does not exist — NOT VERIFIED (exit 2).`,
    );
    return 'unchecked';
  }

  const filter = { businessId };
  console.log('');
  console.log(`Account  : ${email} (${user.role})`);
  console.log(`Business : ${business.name} (${String(businessId)})`);

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
  for (const v of Object.values(counts)) sum += v;
  console.log(
    `Products : ${counts.products.toLocaleString()}` +
      (expectedProducts === null ? '' : ` — expected ${expectedProducts.toLocaleString()}`),
  );
  console.log(`Documents: ${sum.toLocaleString()}`);

  // ---- SKU/barcode coverage, read from the products rather than the seed's plan. The
  // lines print on every run — including an empty tenant, where they read `empty` and zero
  // barcodes — so the report says what was found even when there is nothing to verify.
  const rawCoverage = await readProductCodeCoverage(businessId);
  const coverage = classifyCodeCoverage(rawCoverage);
  const barcodeHealth = classifyBarcodeHealth(rawCoverage.barcodes);
  console.log(formatCodeCoverage(coverage, expectedCodes));
  console.log(formatBarcodeHealth(barcodeHealth));

  // An empty tenant has no violations because it has no rows to violate anything. That is
  // not a pass: the command exists to verify a seeded dataset, and there is none.
  const emptyProblem = tenantEmptinessProblem(counts);
  if (emptyProblem) {
    console.error('');
    console.error(`Result   : FAILED — ${emptyProblem}.`);
    return 'failed';
  }

  // ---- ledger consistency: every row must satisfy the invariant its OWN type implies
  const tx = await InventoryTransaction.find(filter)
    .select('type quantity previousQuantity newQuantity')
    .lean();
  const { bad, negative, badTotal } = ledgerViolations(tx);
  console.log(`Ledger   : ${tx.length.toLocaleString()} rows — ${badTotal} bad, ${negative} negative`);

  // ---- referential integrity of what was written
  const productIds = new Set((await Product.find(filter).select('_id').lean()).map((d) => String(d._id)));
  const locationIds = new Set((await Location.find(filter).select('_id').lean()).map((d) => String(d._id)));
  const supplierIds = new Set((await Supplier.find(filter).select('_id').lean()).map((d) => String(d._id)));
  const txIds = new Set(
    (await InventoryTransaction.find(filter).select('_id').lean()).map((d) => String(d._id)),
  );

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
  for (const po of pos) {
    for (const item of po.items ?? []) {
      if (!productIds.has(String(item.productId))) poOrphanProduct += 1;
    }
    for (const receipt of po.receipts ?? []) {
      for (const line of receipt.lines ?? []) {
        if (!txIds.has(String(line.inventoryTransactionId))) poOrphanTx += 1;
      }
    }
  }
  const poOrphanSupplier = pos.filter((po) => !supplierIds.has(String(po.supplierId))).length;

  const orphanTotal = invOrphans + poOrphanProduct + poOrphanSupplier + poOrphanTx;
  console.log(`Integrity: ${orphanTotal} missing references`);

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
  console.log(`Stock    : ${low.toLocaleString()} low, ${zero.toLocaleString()} out of stock`);

  // ---- the verdict, and the only paths that exit 1 for this account
  const mismatch =
    expectedProducts !== null && counts.products !== expectedProducts
      ? `the tenant holds ${counts.products.toLocaleString()} products, expected ${expectedProducts.toLocaleString()}`
      : null;
  const codeProblem = codeCoverageProblem(coverage, expectedCodes);
  const barcodeProblem = barcodeHealthProblem(barcodeHealth);
  const problems = [
    ['STOCK_IN movements whose arithmetic does not hold', bad.STOCK_IN],
    ['STOCK_OUT movements whose arithmetic does not hold', bad.STOCK_OUT],
    ['ADJUSTMENT movements whose arithmetic does not hold', bad.ADJUSTMENT],
    ['TRANSFER movements whose arithmetic does not hold', bad.TRANSFER],
    ['movements of an unrecognised type', bad.other],
    ['movements leaving a negative quantity', negative],
    ['inventory rows pointing at a missing product or location', invOrphans],
    ['purchase-order items pointing at a missing product', poOrphanProduct],
    ['purchase orders pointing at a missing supplier', poOrphanSupplier],
    ['receipt lines pointing at a missing transaction', poOrphanTx],
  ].filter(([, count]) => count > 0);

  const failures = [mismatch, codeProblem, barcodeProblem].filter(Boolean);
  if (failures.length > 0 || problems.length > 0) {
    console.error('');
    console.error(
      `Result   : FAILED — ${failures.length ? failures.join('; ') : 'violations found'}` +
        `${problems.length ? ':' : '.'}`,
    );
    for (const [label, count] of problems) console.error(`  - ${label}: ${count}`);
    return 'failed';
  }

  console.log('Result   : SUCCESS');
  return 'verified';
}

const results = [];
for (const account of accounts) {
  try {
    results.push({ email: account.email, status: await verifyTenant(account) });
  } catch (err) {
    // A query failure after the connection is "could not check", not a broken row. Without this
    // boundary the process would reject and exit 1, which is the code reserved for a real data
    // violation — the exact confusion the 0/1/2 contract exists to prevent.
    console.error('');
    console.error(`[${COMMAND}] ${account.email} — could not be checked: ${err?.message ?? err}`);
    console.error(`[${COMMAND}] NOT VERIFIED (exit 2) — this is not a data violation.`);
    results.push({ email: account.email, status: 'unchecked' });
  }
}

const verified = results.filter((r) => r.status === 'verified').length;
const failed = results.filter((r) => r.status === 'failed').length;
const unchecked = results.filter((r) => r.status === 'unchecked').length;

await mongoose.disconnect();

console.log('');
if (failed > 0) {
  console.log(
    `Result   : FAILED — ${failed} of ${results.length} account(s) failed verification` +
      `${unchecked > 0 ? `, ${unchecked} could not be checked` : ''}.`,
  );
  process.exit(1);
}
if (unchecked > 0) {
  console.log(`Result   : NOT VERIFIED — ${unchecked} of ${results.length} account(s) could not be checked.`);
  process.exit(2);
}
console.log(`Result   : SUCCESS — ${verified} account(s) verified.`);
process.exit(0);
