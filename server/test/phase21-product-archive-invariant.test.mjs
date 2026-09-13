// Phase 21 — product archive-only lifecycle and the inventory↔product invariant,
// asserted at the DECLARATION.
//
// The system operates an archive-only product lifecycle:
//
//   CREATE -> ACTIVE     ACTIVE <-> ARCHIVED     (ARCHIVED is terminal)
//
// No product hard-delete exists anywhere in the application: no route, no
// service method, no audit action, no cascade. That is currently true because no
// code path was ever written — NOT because anything enforces it. MongoDB has no
// cross-collection foreign keys, and Mongoose `ref` only powers `populate()`; it
// constrains nothing. Referential integrity here is a property of the
// application lifecycle rules plus the write-path validation every movement goes
// through (inventory.service.js assertOperationalProduct: the product must
// exist, belong to the same business, and not be archived).
//
// This suite is the cheap guard that the invariant cannot be removed, reordered
// or "tidied away" without a deliberate, visible change. It pins declarations,
// not behavior: the schema, the router table, the service surface and the audit
// vocabulary. Behavioral evidence — an archived product keeps its stock row, its
// quantity and its history, and every movement path rejects it — is DB-backed
// and lives in phase04-inventory.test.mjs and phase04-catalog.test.mjs.
//
// DATABASE-FREE on purpose — it reads declarations, never data, so it runs in
// both `npm test` and `npm run test:unit`. That matters more here than in most
// suites: "nobody added a delete route" should stay checkable even when MongoDB
// is unreachable.

import { it } from 'node:test';
import assert from 'node:assert/strict';

import Product from '../src/models/product.model.ts';
import Inventory from '../src/models/inventory.model.ts';
import InventoryTransaction from '../src/models/inventoryTransaction.model.ts';
import productService from '../src/services/product.service.ts';
import productRoutes from '../src/routes/products.routes.ts';
import { AUDIT_ACTIONS } from '../src/constants/audit.ts';
import { unitSuite } from './testEnv.mjs';

/** Every (method, path) the products router actually registers. */
const registeredRoutes = () =>
  productRoutes.stack
    .filter((layer) => layer.route)
    .flatMap((layer) =>
      Object.keys(layer.route.methods).map((method) => ({ method: method.toLowerCase(), path: layer.route.path }))
    );

/**
 * Tokens that would signal a removed/retired state rather than an archived one.
 * Kept deliberately generous: the point is that no spelling of "gone" exists.
 */
const DELETION_TOKENS = /DELET|REMOVED|PURGED|DESTROY/i;

unitSuite('Phase 21 — product archive-only lifecycle (declaration guards)', () => {
  it('declares exactly two product statuses, with no deleted state', () => {
    const statuses = Product.schema.path('status').enumValues;
    assert.deepEqual(statuses, ['ACTIVE', 'ARCHIVED']);
    assert.equal(
      statuses.some((s) => DELETION_TOKENS.test(s)),
      false,
      `product status enum contains a deletion-like state: ${JSON.stringify(statuses)}`
    );
    // A created product is ACTIVE; ARCHIVED is only ever reached through
    // setStatus (POST /:id/archive), which is reversible via /:id/restore.
    assert.equal(Product.schema.path('status').defaultValue, 'ACTIVE');
  });

  it('registers no DELETE route on the products router', () => {
    // Asserted as "no delete, and archive/restore present" rather than as a
    // snapshot of the whole route table: an exact-set assertion would break the
    // moment a future phase legitimately adds a read route, which trains people
    // to update the guard reflexively — the opposite of what a guard is for.
    const routes = registeredRoutes();
    const deletes = routes.filter((r) => r.method === 'delete');
    assert.deepEqual(deletes, [], `products router exposes a delete route: ${JSON.stringify(deletes)}`);

    const suspicious = routes.filter((r) => DELETION_TOKENS.test(r.path));
    assert.deepEqual(suspicious, [], `products router exposes a deletion-like path: ${JSON.stringify(suspicious)}`);

    for (const path of ['/:id/archive', '/:id/restore']) {
      assert.ok(
        routes.some((r) => r.method === 'post' && r.path === path),
        `POST ${path} is missing — archive/restore is the terminal lifecycle surface`
      );
    }
  });

  it('exposes no product-delete operation on the service', () => {
    const suspicious = Object.keys(productService).filter((k) => /^(delete|remove|purge|destroy)/i.test(k));
    assert.deepEqual(suspicious, [], `productService exposes a deletion operation: ${JSON.stringify(suspicious)}`);
    assert.equal(typeof productService.delete, 'undefined');
  });

  it('declares no product-deletion audit action', () => {
    assert.equal(AUDIT_ACTIONS.PRODUCT_ARCHIVED, 'PRODUCT_ARCHIVED');
    const suspicious = Object.values(AUDIT_ACTIONS).filter((a) => /PRODUCT_.*DELET/i.test(a));
    assert.deepEqual(suspicious, [], `audit vocabulary declares a product-deletion action: ${JSON.stringify(suspicious)}`);
  });

  // `required: true` is the schema-level assertion that a row cannot be written
  // without a productId. `ref: 'Product'` is NOT a constraint — it only lets
  // `populate()` resolve the product, and it is pinned here as such so a later
  // reader does not mistake it for referential integrity.
  it('requires productId on an inventory row and on a ledger row', () => {
    for (const [label, Model] of [
      ['Inventory', Inventory],
      ['InventoryTransaction', InventoryTransaction],
    ]) {
      const path = Model.schema.path('productId');
      assert.equal(path.isRequired, true, `${label}.productId must be required`);
      assert.equal(path.options.ref, 'Product', `${label}.productId must reference Product`);
    }
  });

  // businessId is immutable through the API: `update`'s apply() list
  // (product.service.js) covers name/sku/barcode/description/costPrice/
  // sellingPrice/unit/minimumStock/imageUrl/categoryId and never businessId, so
  // a product can never be moved out of the business that owns its inventory.
  // The schema half of that guarantee is pinned here.
  it('keeps businessId required on the product schema', () => {
    assert.equal(Product.schema.path('businessId').isRequired, true);
  });
});
