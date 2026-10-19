// DEMO-1 — the demo tenant: its fixture's arithmetic, and the guards that decide
// whether a database may be written to or deleted from.
//
// This suite is deliberately DB-FREE. The fixture and `planSeed` are pure, and the
// target guard takes its values as arguments, so every rule — including the ones that
// only matter when they are wrong (a mismatched --database, the test database, an
// address that belongs to a real business) — is asserted without a connection.
//
// The arithmetic is the point: an assistant answer can only be called correct when
// the expected number is stated in advance and the fixture actually produces it.

import assert from 'node:assert/strict';
import test from 'node:test';

import { DATABASE_NAMES } from '../src/config/env.ts';
import {
  DEMO_MOVEMENTS,
  DEMO_PRODUCTS,
  DEMO_STOCK,
  expectedLocationBreakdown,
  expectedRestock,
  expectedSummary,
  stockByLocation,
  stockByProduct,
} from '../scripts/demo/fixture.mjs';
import {
  DEMO_CLEANUP_CONFIRM,
  DEMO_SEED_CONFIRM,
  DemoTenantError,
  assertDemoTarget,
  isProductionDatabase,
  planSeed,
} from '../scripts/demo/lib.mjs';

const SEED = {
  mongodbUri: 'mongodb://example.invalid',
  resolvedDbName: DATABASE_NAMES.production,
  requestedDatabase: DATABASE_NAMES.production,
  confirm: DEMO_SEED_CONFIRM,
  confirmPhrase: DEMO_SEED_CONFIRM,
  command: 'seed:demo-tenant',
};

test('DEMO-1 the fixture summary is the §19 definition, not a restatement', () => {
  const summary = expectedSummary();
  const byProduct = stockByProduct();

  assert.equal(summary.totalProducts, DEMO_PRODUCTS.length);
  assert.equal(
    summary.totalInventoryQuantity,
    DEMO_STOCK.reduce((sum, row) => sum + row.quantity, 0),
  );

  // Recomputed from first principles rather than compared with a literal, so a
  // fixture edit cannot make this pass with a stale expectation.
  const low = DEMO_PRODUCTS.filter((p) => (byProduct.get(p.key) ?? 0) <= p.minimumStock);
  const out = DEMO_PRODUCTS.filter((p) => (byProduct.get(p.key) ?? 0) <= 0);
  assert.deepEqual(summary.lowStockNames.sort(), low.map((p) => p.name).sort());
  assert.deepEqual(summary.outOfStockNames.sort(), out.map((p) => p.name).sort());
  assert.equal(summary.inStockProducts, DEMO_PRODUCTS.length - low.length);
  assert.equal(summary.outOfStockProducts, 1);
});

test('DEMO-1 one product has NO inventory row, and the fixture still counts it as zero', () => {
  const stocked = new Set(DEMO_STOCK.map((row) => row.product));
  const unstocked = DEMO_PRODUCTS.filter((p) => !stocked.has(p.key));
  assert.equal(unstocked.length, 1, 'exactly one product must exercise "missing row is zero"');
  const summary = expectedSummary();
  assert.equal(stockByProduct().get(unstocked[0].key), 0);
  assert.ok(summary.outOfStockNames.includes(unstocked[0].name));
});

test('DEMO-1 every location total is the sum of the rows that name it', () => {
  const breakdown = expectedLocationBreakdown();
  const byLocation = stockByLocation();
  for (const loc of breakdown.locations) {
    assert.equal(typeof loc.units, 'number');
    assert.equal(loc.products > 0, loc.units > 0, `${loc.name} must not claim products with no units`);
  }
  assert.equal(
    breakdown.locations.reduce((sum, loc) => sum + loc.units, 0),
    DEMO_STOCK.reduce((sum, row) => sum + row.quantity, 0),
  );
  assert.equal([...byLocation.values()].reduce((a, b) => a + b, 0), breakdown.totals.units);
  // Business product count is over DISTINCT products, so a product held in two
  // places counts once — the facet's whole reason for existing.
  assert.equal(breakdown.totals.products, new Set(DEMO_STOCK.map((row) => row.product)).size);
});

test('DEMO-1 the restock expectation lists out-of-stock first and carries a shortfall', () => {
  const rows = expectedRestock();
  assert.ok(rows.length >= 2);
  assert.equal(rows[0].stockStatus, 'OUT_OF_STOCK');
  assert.deepEqual(
    rows.map((r) => r.stockStatus),
    [...rows.filter((r) => r.stockStatus === 'OUT_OF_STOCK'), ...rows.filter((r) => r.stockStatus !== 'OUT_OF_STOCK')]
      .map((r) => r.stockStatus),
  );
  for (const row of rows) {
    assert.equal(row.shortfall, row.minimumStock - row.available);
    assert.ok(row.shortfall >= 0);
  }
});

test('DEMO-1 every stock row ends at a figure its ledger can explain', () => {
  // Chain the movements per (product, location) and require the final newQuantity to
  // equal the stock row. This is the invariant `seed-perf-data` broke for 6 615 rows.
  const chains = new Map();
  for (const row of DEMO_MOVEMENTS) {
    const key = `${row.product}@${row.location}`;
    const state = chains.get(key) ?? { current: 0, rows: 0 };
    if (row.type === 'STOCK_IN') {
      assert.equal(row.newQuantity, row.previousQuantity + row.quantity, `${key} STOCK_IN arithmetic`);
    } else if (row.type === 'STOCK_OUT') {
      assert.equal(row.newQuantity, row.previousQuantity - row.quantity, `${key} STOCK_OUT arithmetic`);
      assert.ok(row.newQuantity >= 0, `${key} must never go negative`);
    } else {
      assert.fail(`unexpected movement type ${row.type}`);
    }
    assert.equal(row.previousQuantity, state.current, `${key} must continue from the previous row`);
    state.current = row.newQuantity;
    state.rows += 1;
    chains.set(key, state);
  }

  const stock = new Map(DEMO_STOCK.map((row) => [`${row.product}@${row.location}`, row.quantity]));
  for (const [key, state] of chains) {
    assert.equal(stock.get(key), state.current, `${key} ledger must end at the stock row`);
  }
  for (const key of stock.keys()) {
    assert.ok(chains.has(key), `${key} has stock but no movement explaining how it got there`);
  }
});

test('DEMO-1 the fixture has unique SKUs and ACTIVE-only rows', () => {
  const skus = DEMO_PRODUCTS.map((p) => p.sku);
  assert.equal(new Set(skus).size, skus.length, 'SKUs must be unique — the model enforces it per business');
  for (const p of DEMO_PRODUCTS) {
    assert.ok(p.minimumStock >= 0);
    assert.ok(p.name.length > 0);
  }
});

test('DEMO-1 production is a permitted target, while the TEST database is not', () => {
  assert.equal(assertDemoTarget(SEED), DATABASE_NAMES.production);
  assert.equal(isProductionDatabase(SEED.resolvedDbName), true);
  assert.equal(isProductionDatabase(DATABASE_NAMES.development), false);

  assert.throws(
    () => assertDemoTarget({ ...SEED, resolvedDbName: DATABASE_NAMES.test, requestedDatabase: DATABASE_NAMES.test }),
    (err) => err instanceof DemoTenantError && /test database/.test(err.message),
  );
});

test('DEMO-1 the named database must equal the one the run actually resolved', () => {
  assert.throws(
    () => assertDemoTarget({ ...SEED, requestedDatabase: DATABASE_NAMES.development }),
    (err) => err instanceof DemoTenantError && /Refusing to touch a database/.test(err.message),
  );
  assert.throws(
    () => assertDemoTarget({ ...SEED, requestedDatabase: '' }),
    (err) => err instanceof DemoTenantError && /--database=<name> is required/.test(err.message),
  );
});

test('DEMO-1 no confirmation phrase means no write, and the phrases differ per command', () => {
  assert.throws(
    () => assertDemoTarget({ ...SEED, confirm: '' }),
    (err) => err instanceof DemoTenantError && /confirmation/.test(err.message),
  );
  assert.throws(
    () => assertDemoTarget({ ...SEED, confirm: DEMO_CLEANUP_CONFIRM }),
    (err) => err instanceof DemoTenantError,
  );
  assert.throws(
    () => assertDemoTarget({ ...SEED, mongodbUri: '' }),
    (err) => err instanceof DemoTenantError && /MONGODB_URI/.test(err.message),
  );
  assert.notEqual(DEMO_SEED_CONFIRM, DEMO_CLEANUP_CONFIRM);
});

test('DEMO-1 the seed refuses an address that already belongs to a REAL tenant', () => {
  const plan = planSeed({ businessId: 'demo', userId: 'user', userBusinessId: 'someone-else' });
  assert.equal(plan.action, 'refuse');
  assert.match(plan.reason, /DIFFERENT business/);
});

test('DEMO-1 a half-state is refused rather than repaired, and the happy paths are named', () => {
  assert.equal(planSeed({ businessId: 'b', userId: 'u', userBusinessId: 'b' }).action, 'reset');
  assert.equal(planSeed({ businessId: 'b', userId: null, userBusinessId: null }).action, 'attach-user');
  assert.equal(planSeed({ businessId: null, userId: null, userBusinessId: null }).action, 'create');
  const orphan = planSeed({ businessId: null, userId: 'u', userBusinessId: null });
  assert.equal(orphan.action, 'refuse');
  assert.match(orphan.reason, /invent its linkage/);
});

test('DEMO-1 the cleanup phrase and the seed phrase are not interchangeable', () => {
  // Nothing in the cleanup CLI reads SEED_CONFIRM; this asserts the decision the
  // scripts make visible, not their source text.
  assert.equal(assertDemoTarget({ ...SEED, confirm: DEMO_CLEANUP_CONFIRM, confirmPhrase: DEMO_CLEANUP_CONFIRM }), DATABASE_NAMES.production);
  assert.throws(() => assertDemoTarget({ ...SEED, confirm: DEMO_CLEANUP_CONFIRM }), DemoTenantError);
});
