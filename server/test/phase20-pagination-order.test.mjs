// Phase 20A — Offset-pagination ordering determinism.
//
// Every paginated list endpoint sorts by a key that is NOT unique. `createdAt`
// (or `updatedAt` for inventory) is identical across rows whenever they are
// written inside the same millisecond — a stock transfer updates its two
// inventory rows in one tick, a bulk import stamps one instant. MongoDB gives no
// stable order for equal sort keys, so a tie that resolves differently between
// two page requests makes a row appear on BOTH pages, or on neither. The mobile
// list appends pages as the user scrolls, so a tie-flip surfaces as a duplicated
// or silently missing row.
//
// The remedy is the convention already used by the audit trail, the dashboard
// recent activity and the inventory history: append `_id` as a tiebreaker in the
// SAME direction as the primary sort, making the order total so every page
// boundary is stable.
//
// This is the regression for that, over all seven paginated paths:
//   /api/products                        catalog list, no location filter
//   /api/products?locationId=…           catalog list, location-filtered
//   /api/products/reorder                compound sort, availability ascending
//   /api/inventory                       sorts on updatedAt
//   /api/purchase-orders
//   /api/categories, /api/locations, /api/suppliers — one shared list service
//   /api/users                           ASCENDING primary sort
//
// Each path is asserted three ways:
//   1. distinct sort values -> the intended business order is unchanged;
//   2. ONE shared sort value -> the rows fall back to `_id`, same direction;
//   3. paging at limit=1 and limit=2 reproduces the single-page order exactly —
//      no repeat, no omission, the union is the seeded set.
//
// DB-backed; fails loudly when MongoDB is unreachable (Phase 07F / M9).
// Registered as PURE_DB in run-tests.mjs.

import 'dotenv/config';

import mongoose from 'mongoose';
import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  startServer,
  makeApi,
  createTracker,
  registerOwner,
  uniqueName,
  uniqueEmail,
  disconnectDb,
} from './support.mjs';
import { dbSuite } from './testEnv.mjs';
import Product from '../src/models/product.model.js';
import Inventory from '../src/models/inventory.model.js';
import PurchaseOrder from '../src/models/purchaseOrder.model.js';
import Category from '../src/models/category.model.js';
import Location from '../src/models/location.model.js';
import Supplier from '../src/models/supplier.model.js';
import User from '../src/models/user.model.js';

const { dbOk, baseUrl, server } = await startServer();
const api = makeApi(baseUrl);
const tracker = createTracker(dbOk);

const { ObjectId } = mongoose.Types;

const PASSWORD = 'Password123!';
/** Rows seeded per path — enough that a page boundary falls inside the tie. */
const TIED = 5;

// One dedicated business per path, so each list is exactly its own fixture and
// an assertion can never be satisfied by a neighbouring test's rows.
let catalog; // /api/products, no location filter
let located; // /api/products?locationId=…
let reorderTie; // /api/products/reorder, every product out of stock
let reorderDir; // /api/products/reorder, distinct availabilities
let stock; // /api/inventory
let refs; // /api/categories + /api/locations + /api/suppliers
let people; // /api/users
let orders; // /api/purchase-orders

let locatedLocationId;
let reorderDirRows; // [{ id, available }] — the reorder list's intended order

/** URL with query params; undefined/null values are dropped. */
function url(path, params = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) qs.set(key, String(value));
  }
  const search = qs.toString();
  return search ? `${path}?${search}` : path;
}

/** GET a list route, asserting the standard pagination envelope. */
async function listPage(path, token, params) {
  const res = await api('GET', url(path, params), { token });
  assert.equal(
    res.status,
    200,
    `${path} ${JSON.stringify(params)} -> ${res.status} ${JSON.stringify(res.json)}`
  );
  assert.ok(Array.isArray(res.json.items), `${path}: items must be an array`);
  return res.json;
}

/**
 * Writes ONE value onto a raw column. `timestamps: true` owns createdAt /
 * updatedAt, so a deliberate tie has to be stamped onto the collection directly
 * — the same technique the Phase 16 audit suite uses.
 *
 * The write is then read back and asserted. This is not belt-and-braces: the raw
 * collection API does NOT cast, so a string `_id` would match nothing and leave
 * the rows with their natural, already-distinct timestamps. The suite would then
 * "pass" against the unfixed code because there was never a tie to page over.
 */
async function stamp(model, ids, field, value) {
  const oids = ids.map((id) => new ObjectId(id));
  await model.collection.updateMany({ _id: { $in: oids } }, { $set: { [field]: value } });

  const stamped = await model.find({ _id: { $in: oids } }).select(field).lean();
  assert.equal(stamped.length, ids.length, `stamp: expected ${ids.length} rows to exist`);
  for (const doc of stamped) {
    assert.equal(
      new Date(doc[field]).getTime(),
      value.getTime(),
      `stamp: ${field} did not take effect on ${doc._id}`
    );
  }
}

/**
 * Walks every page at `limit`, returning the ids in arrival order and asserting
 * the envelope stays consistent from page to page. The three ways a page
 * boundary can go wrong — a row repeated, a row skipped, the order shifting —
 * are each a separate assertion so a failure says which one happened.
 */
async function pageThrough(path, token, params, limit, reference) {
  const ids = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page += 1) {
    const body = await listPage(path, token, { ...params, page, limit });
    assert.equal(body.limit, limit, `${path}: limit is echoed`);
    assert.equal(body.page, page, `${path}: page is echoed`);
    assert.equal(body.total, reference.total, `${path}: total must not depend on the page`);
    totalPages = body.totalPages;
    ids.push(...body.items.map((i) => i.id));
    assert.ok(page <= 50, `${path}: paging terminated`);
  }

  const label = `${path} limit=${limit}`;
  assert.deepEqual(
    ids,
    reference.items.map((i) => i.id),
    `${label}: paged order must reproduce the single-page order`
  );
  assert.equal(ids.length, reference.total, `${label}: every record is returned`);
  assert.equal(new Set(ids).size, ids.length, `${label}: no record repeats across pages`);
  return ids;
}

/**
 * The Phase 20A contract for one paginated path.
 *
 * Step 1 gives every row a DISTINCT primary sort value and asserts the intended
 * business order is untouched. Step 2 collapses them all onto ONE value, so only
 * the `_id` tiebreaker can order them, and asserts it resolves in the SAME
 * direction as the primary sort. Step 3 is the guarantee that matters: paging a
 * tie at limit=1 and limit=2 reproduces that order exactly.
 */
async function assertPaginationContract({
  label,
  path,
  token,
  model,
  businessId,
  field,
  direction,
  params = {},
}) {
  const rows = await model.find({ businessId }).select('_id').lean();
  const ids = rows.map((r) => String(r._id)).sort();
  assert.ok(ids.length >= 3, `${label}: expected seeded rows to page over`);

  // Stamps ascend with `_id`, so ascending `field` and ascending `_id` agree and
  // one `expected` serves both steps.
  const base = Date.now();
  for (let i = 0; i < ids.length; i += 1) {
    await stamp(model, [ids[i]], field, new Date(base + i * 1000));
  }
  const expected = direction === 'desc' ? [...ids].reverse() : ids;

  const distinct = await listPage(path, token, { ...params, limit: 100 });
  assert.deepEqual(
    distinct.items.map((i) => i.id),
    expected,
    `${label}: primary sort (${field} ${direction}) is unchanged`
  );
  await pageThrough(path, token, params, 1, distinct);
  await pageThrough(path, token, params, 2, distinct);

  await stamp(model, ids, field, new Date(base));
  const tied = await listPage(path, token, { ...params, limit: 100 });
  const tiedIds = tied.items.map((i) => i.id);
  assert.deepEqual(tiedIds, expected, `${label}: equal ${field} falls back to _id, ${direction}`);
  assert.deepEqual([...tiedIds].sort(), ids, `${label}: the listing is exactly the seeded rows`);
  await pageThrough(path, token, params, 1, tied);
  await pageThrough(path, token, params, 2, tied);
}

async function newProduct(business, body = {}) {
  const res = await api('POST', '/api/products', {
    token: business.token,
    body: { name: uniqueName('P20'), ...body },
  });
  assert.equal(res.status, 201, `product create -> ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.id;
}

async function newReference(business, path) {
  const res = await api('POST', path, { token: business.token, body: { name: uniqueName('R20') } });
  assert.equal(res.status, 201, `${path} create -> ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.id;
}

const newLocation = (business) => newReference(business, '/api/locations');

async function newStaff(business) {
  const res = await api('POST', '/api/users', {
    token: business.token,
    body: { name: uniqueName('U20'), email: uniqueEmail('u20'), password: PASSWORD, role: 'STAFF' },
  });
  assert.equal(res.status, 201, `user create -> ${res.status} ${JSON.stringify(res.json)}`);
  tracker.trackUser(res.json.id);
  return res.json.id;
}

async function stockIn(business, productId, locationId, quantity) {
  const res = await api('POST', '/api/inventory/stock-in', {
    token: business.token,
    body: { productId, locationId, quantity, reason: 'Phase 20A seed' },
  });
  assert.equal(res.status, 201, `stock-in -> ${res.status} ${JSON.stringify(res.json)}`);
  return res.json;
}

dbSuite('Phase 20A — paginated list ordering is deterministic', dbOk, () => {
  before(async () => {
    catalog = await registerOwner(api, tracker);
    located = await registerOwner(api, tracker);
    reorderTie = await registerOwner(api, tracker);
    reorderDir = await registerOwner(api, tracker);
    stock = await registerOwner(api, tracker);
    refs = await registerOwner(api, tracker);
    people = await registerOwner(api, tracker);
    orders = await registerOwner(api, tracker);

    for (let i = 0; i < TIED; i += 1) await newProduct(catalog);

    // Location-filtered catalog: every seeded product carries stock at ONE
    // location, so the "stocked here" guard keeps all of them in the listing.
    locatedLocationId = await newLocation(located);
    for (let i = 0; i < TIED; i += 1) {
      await stockIn(located, await newProduct(located), locatedLocationId, 3);
    }

    // Reorder, tie case: no inventory rows at all, so availability is 0 for
    // every product and equals the default minimumStock — all are candidates
    // and only createdAt/_id can separate them.
    for (let i = 0; i < TIED; i += 1) await newProduct(reorderTie);

    // Reorder, direction case: minimumStock sits above every stocked quantity,
    // so all three are candidates and availability alone orders them.
    const dirLocation = await newLocation(reorderDir);
    reorderDirRows = [];
    for (const quantity of [3, 2, 1]) {
      const id = await newProduct(reorderDir, { minimumStock: 100 });
      await stockIn(reorderDir, id, dirLocation, quantity);
      reorderDirRows.push({ id, available: quantity });
    }

    // Inventory list: five rows in one location. A transfer updates two rows in
    // the same millisecond, which is exactly the tie this path must survive.
    const stockLocation = await newLocation(stock);
    for (let i = 0; i < TIED; i += 1) {
      await stockIn(stock, await newProduct(stock), stockLocation, 4);
    }

    // Categories, locations and suppliers are three models behind ONE list
    // service, so all three are seeded and asserted.
    for (let i = 0; i < TIED; i += 1) await newReference(refs, '/api/categories');
    for (let i = 0; i < TIED; i += 1) await newReference(refs, '/api/locations');
    for (let i = 0; i < TIED; i += 1) await newReference(refs, '/api/suppliers');

    // Users list: the OWNER (created by registerOwner) plus five STAFF.
    for (let i = 0; i < TIED; i += 1) await newStaff(people);

    const poSupplier = await newReference(orders, '/api/suppliers');
    const poLocation = await newLocation(orders);
    const poProduct = await newProduct(orders);
    for (let i = 0; i < TIED; i += 1) {
      const res = await api('POST', '/api/purchase-orders', {
        token: orders.token,
        body: {
          supplierId: poSupplier,
          locationId: poLocation,
          items: [{ productId: poProduct, quantityOrdered: 1, unitCost: 5 }],
        },
      });
      assert.equal(res.status, 201, `PO create -> ${res.status} ${JSON.stringify(res.json)}`);
    }
  });

  after(async () => {
    await tracker.cleanup();
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDb();
  });

  it('orders and pages the product catalog (no location filter)', async () => {
    await assertPaginationContract({
      label: 'GET /api/products',
      path: '/api/products',
      token: catalog.token,
      model: Product,
      businessId: catalog.businessId,
      field: 'createdAt',
      direction: 'desc',
    });
  });

  it('orders and pages the location-filtered product catalog', async () => {
    await assertPaginationContract({
      label: 'GET /api/products?locationId',
      path: '/api/products',
      token: located.token,
      model: Product,
      businessId: located.businessId,
      field: 'createdAt',
      direction: 'desc',
      params: { locationId: locatedLocationId },
    });
  });

  it('orders and pages the reorder list, tying on both of its leading keys', async () => {
    // Availability is 0 for every product here, so with createdAt also collapsed
    // onto one value the `_id` tiebreaker is the ONLY thing left ordering rows
    // that span a page boundary.
    await assertPaginationContract({
      label: 'GET /api/products/reorder',
      path: '/api/products/reorder',
      token: reorderTie.token,
      model: Product,
      businessId: reorderTie.businessId,
      field: 'createdAt',
      direction: 'desc',
    });
  });

  it('keeps the reorder list worst-first when availabilities differ', async () => {
    const res = await listPage('/api/products/reorder', reorderDir.token, { limit: 100 });
    assert.equal(res.total, reorderDirRows.length, JSON.stringify(res));
    assert.deepEqual(
      res.items.map((i) => i.id),
      [...reorderDirRows].sort((a, b) => a.available - b.available).map((r) => r.id),
      'availability ascending: the worst-off product comes first'
    );
    assert.deepEqual(res.items.map((i) => i.availableQuantity), [1, 2, 3]);
  });

  it('orders and pages the inventory list (sorts on updatedAt)', async () => {
    // Inventory is the path most likely to tie in production: a transfer writes
    // both of its rows inside one tick and both carry the same updatedAt.
    await assertPaginationContract({
      label: 'GET /api/inventory',
      path: '/api/inventory',
      token: stock.token,
      model: Inventory,
      businessId: stock.businessId,
      field: 'updatedAt',
      direction: 'desc',
    });
  });

  it('orders and pages the purchase order list', async () => {
    await assertPaginationContract({
      label: 'GET /api/purchase-orders',
      path: '/api/purchase-orders',
      token: orders.token,
      model: PurchaseOrder,
      businessId: orders.businessId,
      field: 'createdAt',
      direction: 'desc',
    });
  });

  it('orders and pages the categories, locations and suppliers lists', async () => {
    const paths = [
      ['/api/categories', Category],
      ['/api/locations', Location],
      ['/api/suppliers', Supplier],
    ];
    for (const [path, model] of paths) {
      await assertPaginationContract({
        label: `GET ${path}`,
        path,
        token: refs.token,
        model,
        businessId: refs.businessId,
        field: 'createdAt',
        direction: 'desc',
      });
    }
  });

  it('orders and pages the user list, which is the ascending one', async () => {
    const count = await User.countDocuments({ businessId: people.businessId });
    assert.equal(count, TIED + 1, 'five STAFF plus the OWNER');

    // The only path whose primary sort ascends — the tiebreaker must ascend with
    // it, not fall back to the descending default.
    await assertPaginationContract({
      label: 'GET /api/users',
      path: '/api/users',
      token: people.token,
      model: User,
      businessId: people.businessId,
      field: 'createdAt',
      direction: 'asc',
    });
  });
});
