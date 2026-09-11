// Phase 04 — Inventory core + dashboard: stock in/out/adjust semantics,
// negative-stock prevention, concurrency, history, low/out-of-stock logic,
// RBAC, business isolation, validation and audit logging. Integration tests
// against the real shipped app + MongoDB (DB-backed; fails loudly when MongoDB
// is unreachable — Phase 07F / M9).

import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  startServer,
  makeApi,
  createTracker,
  registerOwner,
  makeRoleUser,
  uniqueName,
  disconnectDb,
} from './support.mjs';
import { dbSuite } from './testEnv.mjs';
import Inventory from '../src/models/inventory.model.js';
import InventoryTransaction from '../src/models/inventoryTransaction.model.js';
import AuditLog from '../src/models/auditLog.model.js';
import { ROLES } from '../src/constants/roles.js';

const { dbOk, baseUrl, server } = await startServer();
const api = makeApi(baseUrl);
const tracker = createTracker(dbOk);

let owner; // Business A
let other; // Business B (isolation)
let status; // business with controlled low/out-of-stock data
let dash; // business with controlled dashboard data
let hist; // business with controlled history data
let staff;
let manager;

async function newProduct(business, over = {}) {
  const res = await api('POST', '/api/products', {
    token: business.token,
    body: { name: uniqueName('P'), ...over },
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json.id;
}

async function newLocation(business, over = {}) {
  const res = await api('POST', '/api/locations', {
    token: business.token,
    body: { name: uniqueName('Loc'), ...over },
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json.id;
}

async function stockIn(business, productId, locationId, quantity, over = {}) {
  return api('POST', '/api/inventory/stock-in', {
    token: business.token,
    body: { productId, locationId, quantity, ...over },
  });
}

async function stockOut(business, productId, locationId, quantity, over = {}) {
  return api('POST', '/api/inventory/stock-out', {
    token: business.token,
    body: { productId, locationId, quantity, ...over },
  });
}

async function adjust(business, productId, locationId, quantity, over = {}) {
  return api('POST', '/api/inventory/adjust', {
    token: business.token,
    body: { productId, locationId, quantity, ...over },
  });
}

async function row(productId, locationId, businessId) {
  return Inventory.findOne({ businessId, productId, locationId });
}

async function txnCount(businessId, productId, locationId, type) {
  return InventoryTransaction.countDocuments({ businessId, productId, locationId, type });
}

async function auditExists(businessId, action) {
  return AuditLog.exists({ businessId, action });
}

after(async () => {
  await tracker.cleanup();
  if (server) await new Promise((resolve) => server.close(resolve));
  await disconnectDb();
});

dbSuite('Phase 04 — inventory core + dashboard', dbOk, () => {
  before(async () => {
    owner = await registerOwner(api, tracker);
    other = await registerOwner(api, tracker);
    status = await registerOwner(api, tracker);
    dash = await registerOwner(api, tracker);
    hist = await registerOwner(api, tracker);
    staff = await makeRoleUser({ role: ROLES.STAFF, businessId: owner.businessId }, tracker);
    manager = await makeRoleUser({ role: ROLES.MANAGER, businessId: owner.businessId }, tracker);
  });

  it('stock movements require authentication (401)', async () => {
    const p = await newProduct(owner);
    const l = await newLocation(owner);
    const res = await api('POST', '/api/inventory/stock-in', {
      body: { productId: p, locationId: l, quantity: 5 },
    });
    assert.equal(res.status, 401);
    assert.equal(res.json.code, 'AUTH_REQUIRED');
  });

  it('validates movement input (quantity integer > 0, ids present/valid)', async () => {
    const p = await newProduct(owner);
    const l = await newLocation(owner);

    const zero = await stockIn(owner, p, l, 0);
    assert.equal(zero.status, 400);
    assert.ok(zero.json.fields.some((f) => f.field === 'quantity'));

    const frac = await stockIn(owner, p, l, 2.5);
    assert.equal(frac.status, 400);
    assert.ok(frac.json.fields.some((f) => f.field === 'quantity'));

    const noProduct = await stockIn(owner, undefined, l, 5);
    assert.equal(noProduct.status, 400);
    assert.ok(noProduct.json.fields.some((f) => f.field === 'productId'));

    const badId = await stockIn(owner, 'zzzz', l, 5);
    assert.equal(badId.status, 400);
    assert.ok(badId.json.fields.some((f) => f.field === 'productId'));
  });

  it('stock-in creates the inventory row, a transaction and an audit log', async () => {
    const p = await newProduct(owner);
    const l = await newLocation(owner);
    const res = await stockIn(owner, p, l, 10, { reason: 'initial', reference: 'INV-1' });
    assert.equal(res.status, 201);
    assert.equal(res.json.transaction.type, 'STOCK_IN');
    assert.equal(res.json.previousQuantity, 0);
    assert.equal(res.json.newQuantity, 10);
    assert.equal(res.json.transaction.previousQuantity, 0);
    assert.equal(res.json.transaction.newQuantity, 10);
    assert.equal(res.json.transaction.quantity, 10);
    assert.equal(res.json.transaction.reference, 'INV-1');

    const inv = await row(p, l, owner.businessId);
    assert.ok(inv);
    assert.equal(inv.quantity, 10);
    assert.equal(inv.reservedQuantity, 0);
    assert.equal(inv.availableQuantity, 10);
    assert.equal(await txnCount(owner.businessId, p, l, 'STOCK_IN'), 1);
    assert.ok(await auditExists(owner.businessId, 'INVENTORY_STOCK_IN'));

    const list = await api('GET', `/api/inventory?productId=${p}&locationId=${l}`, { token: owner.token });
    assert.equal(list.status, 200);
    assert.equal(list.json.total, 1);
    const item = list.json.items[0];
    assert.equal(item.product.id, p);
    assert.equal(item.location.id, l);
    assert.equal(item.quantity, 10);
    assert.equal(item.availableQuantity, 10);
    assert.equal(item.isOutOfStock, false);
  });

  it('stock-out succeeds when available, is atomic, and writes prev/new', async () => {
    const p = await newProduct(owner);
    const l = await newLocation(owner);
    await stockIn(owner, p, l, 10);
    const res = await stockOut(owner, p, l, 4, { reason: 'sale' });
    assert.equal(res.status, 200);
    assert.equal(res.json.previousQuantity, 10);
    assert.equal(res.json.newQuantity, 6);
    assert.equal(res.json.transaction.type, 'STOCK_OUT');
    assert.equal(await row(p, l, owner.businessId).then((x) => x.quantity), 6);
    assert.ok(await auditExists(owner.businessId, 'INVENTORY_STOCK_OUT'));
  });

  it('rejects stock-out above available stock (409) and never goes negative', async () => {
    const p = await newProduct(owner);
    const l = await newLocation(owner);
    await stockIn(owner, p, l, 6);
    const res = await stockOut(owner, p, l, 7);
    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'INSUFFICIENT_STOCK');
    assert.equal((await row(p, l, owner.businessId)).quantity, 6);
    assert.equal(await txnCount(owner.businessId, p, l, 'STOCK_OUT'), 0);
  });

  it('stock-out exactly to zero is allowed, then further stock-out is 409', async () => {
    const p = await newProduct(owner);
    const l = await newLocation(owner);
    await stockIn(owner, p, l, 5);
    assert.equal((await stockOut(owner, p, l, 5)).status, 200);
    assert.equal((await row(p, l, owner.businessId)).quantity, 0);
    const blocked = await stockOut(owner, p, l, 1);
    assert.equal(blocked.status, 409);
    assert.equal((await row(p, l, owner.businessId)).quantity, 0);
  });

  it('stock-out on a missing row returns 404 INVENTORY_NOT_FOUND', async () => {
    const p = await newProduct(owner);
    const l = await newLocation(owner);
    const res = await stockOut(owner, p, l, 1);
    assert.equal(res.status, 404);
    assert.equal(res.json.code, 'INVENTORY_NOT_FOUND');
  });

  it('concurrent stock-outs never oversell (atomic availability guard)', async () => {
    const p = await newProduct(owner);
    const l = await newLocation(owner);
    await stockIn(owner, p, l, 10);
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => stockOut(owner, p, l, 3))
    );
    const ok = results.filter((r) => r.status === 200).length;
    const rejected = results.filter((r) => r.status === 409 && r.json.code === 'INSUFFICIENT_STOCK').length;
    assert.equal(ok, 3);
    assert.equal(rejected, 1);
    assert.equal((await row(p, l, owner.businessId)).quantity, 1);
    assert.equal(await txnCount(owner.businessId, p, l, 'STOCK_OUT'), 3);
  });

  it('adjustment sets absolute quantity, stores the magnitude, rejects no-change and negatives', async () => {
    const p = await newProduct(owner);
    const l = await newLocation(owner);
    await stockIn(owner, p, l, 5);

    const up = await adjust(owner, p, l, 20, { reason: 'stocktake' });
    assert.equal(up.status, 200);
    assert.equal(up.json.transaction.type, 'ADJUSTMENT');
    assert.equal(up.json.transaction.quantity, 15);
    assert.equal(up.json.previousQuantity, 5);
    assert.equal(up.json.newQuantity, 20);
    assert.equal((await row(p, l, owner.businessId)).quantity, 20);
    assert.ok(await auditExists(owner.businessId, 'INVENTORY_ADJUSTED'));

    const same = await adjust(owner, p, l, 20);
    assert.equal(same.status, 409);
    assert.equal(same.json.code, 'NO_CHANGE');
    assert.equal(await txnCount(owner.businessId, p, l, 'ADJUSTMENT'), 1);

    const down = await adjust(owner, p, l, 0);
    assert.equal(down.status, 200);
    assert.equal(down.json.newQuantity, 0);
    assert.equal((await row(p, l, owner.businessId)).quantity, 0);

    const neg = await adjust(owner, p, l, -3);
    assert.equal(neg.status, 400);

    const blocked = await stockOut(owner, p, l, 1);
    assert.equal(blocked.status, 409);
  });

  it('rejects movements against archived products and locations', async () => {
    const p = await newProduct(owner);
    const l = await newLocation(owner);
    await api('POST', `/api/products/${p}/archive`, { token: owner.token });
    const prodArch = await stockIn(owner, p, l, 5);
    assert.equal(prodArch.status, 409);
    assert.equal(prodArch.json.code, 'PRODUCT_ARCHIVED');

    const p2 = await newProduct(owner);
    const l2 = await newLocation(owner);
    await api('POST', `/api/locations/${l2}/archive`, { token: owner.token });
    const locArch = await stockIn(owner, p2, l2, 5);
    assert.equal(locArch.status, 409);
    assert.equal(locArch.json.code, 'LOCATION_ARCHIVED');
  });

  it('isolation: foreign product/location ids never match another business', async () => {
    const bp = await newProduct(other);
    const bl = await newLocation(other);
    await stockIn(other, bp, bl, 7);

    const crossIn = await stockIn(owner, bp, bl, 1);
    assert.equal(crossIn.status, 404);
    assert.equal(crossIn.json.code, 'PRODUCT_NOT_FOUND');

    const crossList = await api('GET', `/api/inventory?locationId=${bl}`, { token: owner.token });
    assert.equal(crossList.status, 200);
    assert.equal(crossList.json.total, 0);

    const ownList = await api('GET', `/api/inventory?locationId=${bl}`, { token: other.token });
    assert.equal(ownList.json.total, 1);
    assert.equal(ownList.json.items[0].quantity, 7);
  });

  it('inventory list flags low stock / out of stock per spec §19', async () => {
    const l = await newLocation(status);
    // healthy (10 >= min 5)
    const healthy = await newProduct(status, { minimumStock: 5 });
    await stockIn(status, healthy, l, 10);
    // low only (3 <= min 3, but > 0)
    const lowOnly = await newProduct(status, { minimumStock: 3 });
    await stockIn(status, lowOnly, l, 3);
    // low AND out (0 stock)
    const gone = await newProduct(status, { minimumStock: 0 });
    await stockIn(status, gone, l, 1);
    await adjust(status, gone, l, 0);
    // low only (1 <= min 2)
    const scarce = await newProduct(status, { minimumStock: 2 });
    await stockIn(status, scarce, l, 1);

    const all = await api('GET', '/api/inventory', { token: status.token });
    assert.equal(all.json.total, 4);

    const low = await api('GET', '/api/inventory?lowStock=true', { token: status.token });
    assert.equal(low.json.total, 3);
    const lowIds = low.json.items.map((i) => i.product.id).sort();
    assert.deepEqual(lowIds, [lowOnly, gone, scarce].sort());

    const out = await api('GET', '/api/inventory?outOfStock=true', { token: status.token });
    assert.equal(out.json.total, 1);
    assert.equal(out.json.items[0].product.id, gone);
    assert.equal(out.json.items[0].isOutOfStock, true);
    assert.equal(out.json.items[0].isLowStock, true);

    // Products endpoint uses the same predicates (business-wide availability).
    const prodLow = await api('GET', '/api/products?lowStock=true', { token: status.token });
    const prodLowIds = prodLow.json.items.map((x) => x.id).sort();
    assert.deepEqual(prodLowIds, [lowOnly, gone, scarce].sort());
  });

  it('dashboard returns correct totals, low/out counts and recent activity', async () => {
    const l = await newLocation(dash);
    const d1 = await newProduct(dash, { minimumStock: 5 });
    await stockIn(dash, d1, l, 10);
    const d2 = await newProduct(dash, { minimumStock: 3 });
    await stockIn(dash, d2, l, 3);
    await newProduct(dash, { minimumStock: 0 }); // no stock row at all
    const d4 = await newProduct(dash, { minimumStock: 2 });
    await stockIn(dash, d4, l, 1);
    await api('POST', `/api/products/${d4}/archive`, { token: dash.token });

    const res = await api('GET', '/api/dashboard', { token: dash.token });
    assert.equal(res.status, 200);
    assert.equal(res.json.totalProducts, 3); // active products only (d1,d2,d3)
    assert.equal(res.json.totalInventoryQuantity, 14); // includes archived d4 stock
    assert.equal(res.json.lowStockProducts, 2); // d2 (3<=3) + d3 (0<=0)
    assert.equal(res.json.outOfStockProducts, 1); // d3 only
    assert.equal(res.json.recentActivity.length, 3);
    const newest = res.json.recentActivity[0];
    assert.ok(newest.product?.name);
    assert.ok(newest.location?.name);
  });

  it('history is newest-first, filterable, searchable by type and paginated', async () => {
    const p = await newProduct(hist);
    const l = await newLocation(hist);
    const t1 = await stockIn(hist, p, l, 10);
    const t2 = await stockOut(hist, p, l, 3);
    const t3 = await stockIn(hist, p, l, 2);
    const t4 = await adjust(hist, p, l, 20);
    assert.equal([t1, t2, t3, t4].every((r) => r.status === 200 || r.status === 201), true);

    const all = await api('GET', '/api/inventory/history', { token: hist.token });
    assert.equal(all.json.total, 4);
    assert.equal(all.json.items.length, 4);
    assert.equal(all.json.items[0].type, 'ADJUSTMENT'); // newest first
    assert.ok(all.json.items[0].product?.name);
    assert.ok(all.json.items[0].location?.name);

    const ins = await api('GET', '/api/inventory/history?type=STOCK_IN', { token: hist.token });
    assert.equal(ins.json.total, 2);
    assert.ok(ins.json.items.every((i) => i.type === 'STOCK_IN'));

    // An unrecognised type is rejected. TRANSFER used to serve as this example
    // because it was reserved-but-unimplemented; Phase 19 made it a real,
    // filterable type, so the example is now a value that is not a type at all.
    const badType = await api('GET', '/api/inventory/history?type=NOT_A_TYPE', { token: hist.token });
    assert.equal(badType.status, 400);
    assert.ok(badType.json.fields.some((f) => f.field === 'type'));

    const from = t2.json.transaction.createdAt;
    const since = await api('GET', `/api/inventory/history?from=${encodeURIComponent(from)}`, { token: hist.token });
    assert.equal(since.json.total, 3);

    const page1 = await api('GET', '/api/inventory/history?limit=2&page=1', { token: hist.token });
    assert.equal(page1.json.total, 4);
    assert.equal(page1.json.items.length, 2);
    const page2 = await api('GET', '/api/inventory/history?limit=2&page=2', { token: hist.token });
    assert.equal(page2.json.items.length, 2);
    assert.notDeepEqual(page1.json.items.map((i) => i.id), page2.json.items.map((i) => i.id));
  });

  it('enforces RBAC on inventory, history and dashboard', async () => {
    const p = await newProduct(owner);
    const l = await newLocation(owner);

    const staffList = await api('GET', '/api/inventory', { token: staff.token });
    assert.equal(staffList.status, 200);
    const staffHist = await api('GET', '/api/inventory/history', { token: staff.token });
    assert.equal(staffHist.status, 200);

    const staffIn = await stockIn(staff, p, l, 5);
    assert.equal(staffIn.status, 201, JSON.stringify(staffIn.json));
    const staffOut = await stockOut(staff, p, l, 2);
    assert.equal(staffOut.status, 200);

    const staffAdj = await adjust(staff, p, l, 1);
    assert.equal(staffAdj.status, 403);
    assert.equal(staffAdj.json.code, 'FORBIDDEN');

    const staffDash = await api('GET', '/api/dashboard', { token: staff.token });
    assert.equal(staffDash.status, 403);

    const managerDash = await api('GET', '/api/dashboard', { token: manager.token });
    assert.equal(managerDash.status, 200);

    // MANAGER can adjust (inventory.manage), confirming it is not STAFF-restricted.
    const mp = await newProduct(owner);
    const ml = await newLocation(owner);
    assert.equal((await stockIn(owner, mp, ml, 5)).status, 201);
    const mgrAdj = await adjust(manager, mp, ml, 9);
    assert.equal(mgrAdj.status, 200, JSON.stringify(mgrAdj.json));
  });
});
