// The DEMO TENANT fixture — one small, fully known inventory, and the numbers it
// must produce.
//
// WHY A HAND-WRITTEN FIXTURE RATHER THAN THE GENERATOR. `seed:demo` produces a
// realistic dataset of tens of thousands of documents, which is right for
// measuring queries and wrong for checking an answer: nobody can say what the
// total SHOULD be. Every quantity, location and minimum below is chosen so the
// expected summary, the expected per-location breakdown and the expected restock
// list are exact integers a test — or a person reading the phone — can compare
// against without querying anything. That is the whole point: an assistant answer
// is only verifiable when the ground truth is known in advance.
//
// THE SHAPE IS DELIBERATELY NON-DEGENERATE. It contains one healthy product, one
// product spread over two locations, one product below its minimum in one place,
// and one product with NO inventory row at all (which the specification defines
// as zero stock, not missing stock). A fixture where every row is healthy would
// leave the restock path, the out-of-stock count and the "missing row is zero"
// rule all unexercised.
//
// NOTHING HERE CONNECTS OR WRITES. It is data plus pure arithmetic; the CLI and
// its library do the I/O. A fixture module that opens a connection on import is
// how a test run writes to a database.

/** The tenant's identity. Both fingerprints are checked before anything is deleted. */
export const DEMO_TENANT = {
  businessName: 'DEMO PREVIEW — safe to delete',
  ownerName: 'Demo Tester',
  // `.invalid` is reserved by RFC 2606 and can never resolve, so no mail can be
  // sent here by accident. The identity is created with `emailVerified: true`
  // because it is a test credential, not a person.
  email: 'demo-preview@example.invalid',
  role: 'OWNER',
};

/** Three places, so a per-location answer has something to compare. */
export const DEMO_LOCATIONS = [
  { key: 'warehouse', name: 'Demo Warehouse' },
  { key: 'shop', name: 'Demo Shop' },
  { key: 'van', name: 'Demo Van' },
];

export const DEMO_CATEGORIES = [
  { key: 'beverages', name: 'Demo Beverages' },
  { key: 'office', name: 'Demo Office' },
];

/**
 * Six ACTIVE products. `minimumStock` is what makes a product "low" (available
 * at or below the minimum), so the restock expectations below are derived from
 * these values rather than restated.
 */
export const DEMO_PRODUCTS = [
  { key: 'coffee', name: 'Demo Coffee Beans 1kg', sku: 'DEMO-001', category: 'beverages', unit: 'bag', costPrice: 8.5, sellingPrice: 14, minimumStock: 10 },
  { key: 'cups', name: 'Demo Paper Cups 100pk', sku: 'DEMO-002', category: 'beverages', unit: 'pack', costPrice: 3.2, sellingPrice: 6.5, minimumStock: 20 },
  { key: 'oat', name: 'Demo Oat Milk 1L', sku: 'DEMO-003', category: 'beverages', unit: 'carton', costPrice: 1.8, sellingPrice: 3.4, minimumStock: 12 },
  { key: 'lamp', name: 'Demo Desk Lamp', sku: 'DEMO-004', category: 'office', unit: 'pcs', costPrice: 12, sellingPrice: 24, minimumStock: 3 },
  { key: 'cable', name: 'Demo USB-C Cable 2m', sku: 'DEMO-005', category: 'office', unit: 'pcs', costPrice: 2.5, sellingPrice: 7.9, minimumStock: 25 },
  { key: 'notebook', name: 'Demo Notebook A5', sku: 'DEMO-006', category: 'office', unit: 'pcs', costPrice: 1.1, sellingPrice: 3, minimumStock: 8 },
];

/**
 * On-hand inventory. `lamp` has NO row on purpose: zero stock is the absence of
 * a row, and the dashboard's definition counts it as out of stock.
 *
 * Totals: Warehouse 75 units / 4 products, Shop 30 / 2, Van 7 / 1, business
 * 112 units across 5 stocked products out of 6 ACTIVE products.
 */
export const DEMO_STOCK = [
  { product: 'coffee', location: 'warehouse', quantity: 4 },
  { product: 'cups', location: 'warehouse', quantity: 15 },
  { product: 'oat', location: 'warehouse', quantity: 30 },
  { product: 'oat', location: 'shop', quantity: 10 },
  { product: 'cable', location: 'warehouse', quantity: 26 },
  { product: 'cable', location: 'van', quantity: 7 },
  { product: 'notebook', location: 'shop', quantity: 20 },
];

/**
 * Nine ledger rows whose arithmetic is true by construction: STOCK_IN adds,
 * STOCK_OUT subtracts, and each row's `previousQuantity`/`newQuantity` chain
 * ends at exactly the `DEMO_STOCK` figure for that (product, location).
 *
 * `seed-perf-data` taught this lesson the hard way: a ledger that always ADDED
 * made 6 615 of 6 616 STOCK_OUT rows claim stock went up, and the assistant
 * reported that faithfully (§27BG). A fixture is not exempt from the invariant
 * it is used to check.
 */
export const DEMO_MOVEMENTS = [
  { product: 'coffee', location: 'warehouse', type: 'STOCK_IN', quantity: 20, previousQuantity: 0, newQuantity: 20, daysAgo: 9, reason: 'Initial demo stock' },
  { product: 'cups', location: 'warehouse', type: 'STOCK_IN', quantity: 20, previousQuantity: 0, newQuantity: 20, daysAgo: 8, reason: 'Initial demo stock' },
  { product: 'oat', location: 'warehouse', type: 'STOCK_IN', quantity: 30, previousQuantity: 0, newQuantity: 30, daysAgo: 7, reason: 'Initial demo stock' },
  { product: 'oat', location: 'shop', type: 'STOCK_IN', quantity: 10, previousQuantity: 0, newQuantity: 10, daysAgo: 6, reason: 'Initial demo stock' },
  { product: 'cable', location: 'warehouse', type: 'STOCK_IN', quantity: 26, previousQuantity: 0, newQuantity: 26, daysAgo: 5, reason: 'Initial demo stock' },
  { product: 'cable', location: 'van', type: 'STOCK_IN', quantity: 7, previousQuantity: 0, newQuantity: 7, daysAgo: 4, reason: 'Initial demo stock' },
  { product: 'notebook', location: 'shop', type: 'STOCK_IN', quantity: 20, previousQuantity: 0, newQuantity: 20, daysAgo: 3, reason: 'Initial demo stock' },
  { product: 'coffee', location: 'warehouse', type: 'STOCK_OUT', quantity: 16, previousQuantity: 20, newQuantity: 4, daysAgo: 2, reason: 'Demo stock out' },
  { product: 'cups', location: 'warehouse', type: 'STOCK_OUT', quantity: 5, previousQuantity: 20, newQuantity: 15, daysAgo: 1, reason: 'Demo stock out' },
];

/** The quantity on hand per product, summed over every location. */
export function stockByProduct() {
  const totals = new Map(DEMO_PRODUCTS.map((p) => [p.key, 0]));
  for (const row of DEMO_STOCK) totals.set(row.product, (totals.get(row.product) ?? 0) + row.quantity);
  return totals;
}

/** The quantity on hand per location. */
export function stockByLocation() {
  const totals = new Map(DEMO_LOCATIONS.map((l) => [l.key, 0]));
  for (const row of DEMO_STOCK) totals.set(row.location, (totals.get(row.location) ?? 0) + row.quantity);
  return totals;
}

/**
 * What `getInventorySummary` and the dashboard must answer, by §19's own
 * definitions: low = available <= minimumStock, out = available <= 0, and
 * inStock is the complement of low among ACTIVE products.
 */
export function expectedSummary() {
  const byProduct = stockByProduct();
  const low = DEMO_PRODUCTS.filter((p) => (byProduct.get(p.key) ?? 0) <= p.minimumStock);
  const out = DEMO_PRODUCTS.filter((p) => (byProduct.get(p.key) ?? 0) <= 0);
  const totalInventoryQuantity = DEMO_STOCK.reduce((sum, row) => sum + row.quantity, 0);
  return {
    totalProducts: DEMO_PRODUCTS.length,
    totalInventoryQuantity,
    lowStockProducts: low.length,
    outOfStockProducts: out.length,
    inStockProducts: DEMO_PRODUCTS.length - low.length,
    lowStockNames: low.map((p) => p.name),
    outOfStockNames: out.map((p) => p.name),
  };
}

/**
 * What `getLocationBreakdown` must answer: per location, the number of DISTINCT
 * products held and the units on hand, plus business totals counted over
 * distinct products (so a product in two places counts once).
 */
export function expectedLocationBreakdown() {
  const byLocation = stockByLocation();
  const distinctByLocation = new Map(DEMO_LOCATIONS.map((l) => [l.key, new Set()]));
  for (const row of DEMO_STOCK) distinctByLocation.get(row.location).add(row.product);
  const stockedProducts = new Set(DEMO_STOCK.map((row) => row.product));
  return {
    locations: DEMO_LOCATIONS.map((l) => ({
      name: l.name,
      products: distinctByLocation.get(l.key).size,
      units: byLocation.get(l.key),
    })),
    totals: {
      products: stockedProducts.size,
      units: DEMO_STOCK.reduce((sum, row) => sum + row.quantity, 0),
    },
  };
}

/**
 * What `getReorderNeededProducts` must answer, in the order the server returns:
 * out-of-stock first, then low stock.
 */
export function expectedRestock() {
  const byProduct = stockByProduct();
  const rows = DEMO_PRODUCTS
    .filter((p) => (byProduct.get(p.key) ?? 0) <= p.minimumStock)
    .map((p) => ({
      name: p.name,
      available: byProduct.get(p.key) ?? 0,
      minimumStock: p.minimumStock,
      stockStatus: (byProduct.get(p.key) ?? 0) <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
      shortfall: p.minimumStock - (byProduct.get(p.key) ?? 0),
    }));
  return [...rows.filter((r) => r.stockStatus === 'OUT_OF_STOCK'), ...rows.filter((r) => r.stockStatus !== 'OUT_OF_STOCK')];
}

export default {
  DEMO_TENANT,
  DEMO_LOCATIONS,
  DEMO_CATEGORIES,
  DEMO_PRODUCTS,
  DEMO_STOCK,
  DEMO_MOVEMENTS,
  stockByProduct,
  stockByLocation,
  expectedSummary,
  expectedLocationBreakdown,
  expectedRestock,
};
