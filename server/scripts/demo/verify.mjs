// The pure half of `npm run verify:demo`.
//
// The script reads rows and prints them; these two rules decide whether what it read is
// a usable seeded tenant. Keeping them here means the decisions are asserted on values
// in `DEMO1-demo-tenant.test.mjs` without a connection, and the script cannot quietly
// stop applying one of them.
//
// NOTHING RUNS ON IMPORT.

/**
 * Every movement must satisfy the arithmetic ITS OWN type implies.
 *
 * TRANSFER is deliberately included: the ledger stores TWO rows for one transfer, one
 * per leg, each with a positive quantity and a signed change. The old check treated
 * every transfer as an "unrecognised type", so a tenant with valid transfers could never
 * pass verification. An adjustment uses the absolute change, because its direction is
 * already carried by the sign of `newQuantity - previousQuantity`.
 */
export function ledgerViolations(transactions) {
  const rows = transactions ?? [];
  const bad = { STOCK_IN: 0, STOCK_OUT: 0, ADJUSTMENT: 0, TRANSFER: 0, other: 0 };

  for (const t of rows) {
    if (t.type === 'STOCK_IN') {
      if (t.newQuantity !== t.previousQuantity + t.quantity) bad.STOCK_IN += 1;
    } else if (t.type === 'STOCK_OUT') {
      if (t.newQuantity !== t.previousQuantity - t.quantity) bad.STOCK_OUT += 1;
    } else if (t.type === 'ADJUSTMENT') {
      if (t.quantity !== Math.abs(t.newQuantity - t.previousQuantity)) bad.ADJUSTMENT += 1;
    } else if (t.type === 'TRANSFER') {
      if (t.quantity !== Math.abs(t.newQuantity - t.previousQuantity)) bad.TRANSFER += 1;
    } else {
      bad.other += 1;
    }
  }

  const negative = rows.filter((t) => t.newQuantity < 0 || t.previousQuantity < 0).length;
  const badTotal = Object.values(bad).reduce((sum, count) => sum + count, 0);
  return { bad, negative, badTotal };
}

/**
 * A tenant with nothing in it cannot be called verified.
 *
 * The old verdict only counted violations, so an empty (or product-less) tenant produced
 * zero violations and printed SUCCESS. These are not row defects — there is simply
 * nothing the seeder claims that can be checked — so they get their own sentence and the
 * caller's FAILED exit code.
 */
export function tenantEmptinessProblem(counts) {
  const total = Object.values(counts ?? {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
  if (total === 0) {
    return 'the tenant is empty — it holds no seeded documents';
  }
  if ((Number(counts?.products) || 0) === 0) {
    return 'the tenant holds no products — the seeded catalogue is missing';
  }
  return null;
}
