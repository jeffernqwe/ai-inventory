// Phase 20G — the list-sort indexes for products, purchase_orders and users,
// asserted at the schema.
//
// Three list endpoints read newest-first (users reads oldest-first) with a
// deterministic `_id` tiebreaker:
//
//   GET /api/products           sort({ createdAt: -1, _id: -1 })  product.service.js listSimple
//   GET /api/purchase-orders    sort({ createdAt: -1, _id: -1 })  purchase-orders.service.js list
//   GET /api/users              sort({ createdAt:  1, _id:  1 })  users.service.js list
//
// Every index those models declared carried a `businessId` prefix, so it served
// the equality match but none of them could supply the *order*: the winning plan
// on each was `SORT -> FETCH -> IXSCAN`, a blocking in-memory sort over the whole
// tenant partition. Phase 20G adds the key shape that matches the sort.
//
// The `users` index is declared DESCENDING even though that list sorts ascending:
// MongoDB walks a compound index backwards, and because both sort keys invert
// together a full-reverse scan supplies the ascending order with no blocking
// sort. Declaring it descending keeps one shape across all three collections.
//
// This suite pins the DECLARATION, not the query plan. It is the cheap guard that
// an index cannot be dropped, reordered, or "tidied away" without a deliberate
// change. Every part of the shape is load-bearing: the equality key must come
// first, `createdAt` must carry the sort's direction, and `_id` must be last so
// paging a tie boundary stays deterministic.
//
// DATABASE-FREE on purpose — it reads the schema, never the data, so it runs in
// both `npm test` and `npm run test:unit`. Plan-level evidence (the blocking SORT
// before, the index-ordered walk after, the backward scan for users) is not
// reproducible as a unit test and lives in the Phase 20G explain probe instead.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import Product from '../src/models/product.model.js';
import PurchaseOrder from '../src/models/purchaseOrder.model.js';
import User from '../src/models/user.model.js';

/** The sort-bearing shape every one of the three list endpoints needs. */
const REQUIRED_KEY = { businessId: 1, createdAt: -1, _id: -1 };

/**
 * Renders an index key as an ORDER-SENSITIVE signature. `assert.deepEqual` is
 * order-insensitive for object keys, but key order is precisely what decides
 * whether the equality key can be used as a prefix and whether the index can be
 * walked instead of sorted — so the signature is built from `Object.entries`.
 */
const signature = (key) =>
  Object.entries(key)
    .map(([field, direction]) => `${field}:${direction}`)
    .join(', ');

/** Every index key declared on the schema, as ordered signatures. */
const signaturesOf = (Model) => Model.schema.indexes().map(([key]) => signature(key));

/** The declared options for one index, found by its ordered signature. */
const optionsOf = (Model, key) =>
  Model.schema.indexes().find(([declared]) => signature(declared) === signature(key))?.[1] ?? null;

const CASES = [
  {
    name: 'products',
    Model: Product,
    endpoint: 'GET /api/products',
    // Phase 20G adds an index; it does not replace or modify one. A future
    // "cleanup" that drops any of these has to fail here first.
    kept: [
      { businessId: 1 },
      { businessId: 1, sku: 1 },
      { businessId: 1, barcode: 1 },
      { businessId: 1, name: 1 },
      { businessId: 1, categoryId: 1 },
      { businessId: 1, status: 1 },
    ],
  },
  {
    name: 'purchase_orders',
    Model: PurchaseOrder,
    endpoint: 'GET /api/purchase-orders',
    kept: [
      { businessId: 1 },
      { businessId: 1, number: 1 },
      { businessId: 1, status: 1 },
      { businessId: 1, supplierId: 1 },
      { businessId: 1, locationId: 1 },
    ],
  },
  {
    name: 'users',
    Model: User,
    endpoint: 'GET /api/users',
    kept: [
      { businessId: 1 },
      { email: 1 },
      { businessId: 1, role: 1 },
      { businessId: 1, status: 1 },
    ],
  },
];

describe('Phase 20G — list-sort indexes (products, purchase_orders, users)', () => {
  for (const { name, Model, endpoint, kept } of CASES) {
    describe(name, () => {
      it(`declares the sort-bearing index ${endpoint} needs`, () => {
        const wanted = signature(REQUIRED_KEY);
        assert.ok(
          signaturesOf(Model).includes(wanted),
          `${name} must declare { businessId: 1, createdAt: -1, _id: -1 } ` +
            `(order-sensitive: "${wanted}") so ${endpoint}'s list sort is index-ordered; ` +
            `declared instead: ${JSON.stringify(signaturesOf(Model))}`
        );
      });

      it('keeps every pre-existing index — Phase 20G is purely additive', () => {
        const declared = signaturesOf(Model);
        const missing = kept.map(signature).filter((k) => !declared.includes(k));
        assert.deepEqual(
          missing,
          [],
          `${name} must keep every index it declared before Phase 20G; ` +
            `missing: ${JSON.stringify(missing)}; declared: ${JSON.stringify(declared)}`
        );
      });
    });
  }

  it('keeps the products SKU/barcode unique + partial semantics', () => {
    // A signature check alone cannot see index OPTIONS, and losing
    // partialFilterExpression here would silently reintroduce the collision the
    // model comment describes: any document already carries the prefix field
    // (businessId), so MongoDB indexes SKU-less products as (businessId, null)
    // and two of them collide. The filter must stay on both unique indexes.
    for (const key of [
      { businessId: 1, sku: 1 },
      { businessId: 1, barcode: 1 },
    ]) {
      const opts = optionsOf(Product, key);
      assert.ok(opts, `products must still declare ${JSON.stringify(key)}`);
      assert.equal(
        opts.unique,
        true,
        `${JSON.stringify(key)} must stay unique; options were: ${JSON.stringify(opts)}`
      );
      assert.deepEqual(
        opts.partialFilterExpression,
        { [Object.keys(key)[1]]: { $type: 'string' } },
        `${JSON.stringify(key)} must keep its partialFilterExpression so SKU-less / ` +
          `barcode-less products stay out of the uniqueness check; options were: ${JSON.stringify(opts)}`
      );
    }
  });
});
