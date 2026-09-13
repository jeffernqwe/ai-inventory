// Phase 22 — Authorization Contract Enforcement & RBAC Coverage Guards.
//
// DATABASE-FREE. Nothing here touches MongoDB, and nothing here is a route
// inventory: owner decision 7 was explicit that this suite must test the
// authorization CONTRACT, not an incidental route count. There is deliberately
// no "the products router has exactly N routes" assertion — a future phase that
// legitimately adds a read route should not have to edit a guard, because a
// guard people update reflexively stops being a guard.
//
// What is pinned, and how, in three layers:
//
//   1. STRUCTURAL (real, at import time) — each read route in Phase 22 scope is
//      proven to be `requireAuth -> <gate> -> controller` by walking the actual
//      Express router stack: three handlers, the first being the SAME function
//      object as `authenticate.js`'s default export (identity works for
//      requireAuth because it is a stable module-level export), the last having
//      controller arity.
//
//   2. BEHAVIOURAL (real, executed) — the middle handler is INVOKED with
//      synthetic `req.user` values. A role that holds no permissions is refused
//      with 403 FORBIDDEN and STAFF is admitted. `requirePermission(permission)`
//      returns a fresh anonymous closure per call, so its identity cannot reveal
//      WHICH permission it enforces — but refusing an unknown role while
//      admitting a known one proves it is a functioning permission gate and not
//      a pass-through. The 403 is the discriminator: `requireAuth` can only ever
//      answer 401.
//
//   3. SOURCE DECLARATION — the one thing layers 1 and 2 cannot prove is the
//      exact catalogue key, because the closure is opaque. So the declaration
//      statement for each route is read from its module and required to name
//      `PERMISSIONS.<EXPECTED_KEY>`. This is the only file-read in the suite and
//      it is a declaration assertion, not a text snapshot of the file.
//
// Layers 1-3 together are what make "GET /api/products requires products.view"
// a tested fact rather than a comment. Attaching a marker to the closure would
// have proven it directly, but that means editing middlewares/authorize.js,
// which is outside Phase 22's approved scope.
//
// Beyond the per-route bindings, the suite makes the catalogue itself
// self-checking: every key in PERMISSIONS is now required to be either wired to
// an enforcement point (a `requirePermission(...)` call in src/routes/, or a
// `permission:` entry in the AI tool table) or explicitly named in
// CATALOGUE_ONLY_PERMISSIONS. A capability can no longer be granted to a role
// and quietly never enforced — which is exactly how `transactions.view` and
// friends went unnoticed, and is how the next one would.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { unitSuite } from './testEnv.mjs';
import { listSourceFiles, readSource, sourceModuleName, walkSourceFiles } from './sourceFiles.mjs';
import {
  CATALOGUE_ONLY_PERMISSIONS,
  PERMISSIONS,
  ROLES,
  ROLE_VALUES,
  hasPermission,
} from '../src/constants/roles.ts';
import requireAuth from '../src/middlewares/authenticate.ts';
import productsRoutes from '../src/routes/products.routes.ts';
import suppliersRoutes from '../src/routes/suppliers.routes.ts';
import purchaseOrdersRoutes from '../src/routes/purchase-orders.routes.js';
import inventoryRoutes from '../src/routes/inventory.routes.js';

// ---------------------------------------------------------------------------
// Source access — every path is resolved from this file, never from cwd.
// ---------------------------------------------------------------------------

const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url));
const ROUTES_DIR = fileURLToPath(new URL('../src/routes/', import.meta.url));

// Extension-agnostic (Phase TS-1): every read below resolves `x.js` or `x.ts`, so a
// migrated module is found without the guard having to be retargeted by hand.
const readSrc = (relPath) => readSource(new URL(`../src/${relPath}`, import.meta.url));

/**
 * The enforcement surface: every route module (read from disk, so a NEW route
 * module is covered automatically) plus the AI tool table. These are the only
 * two places a permission can be attached to anything.
 */
const ROUTE_FILES = listSourceFiles(ROUTES_DIR);

const ROUTE_SOURCES = ROUTE_FILES.map((f) => [`routes/${f}`, fs.readFileSync(ROUTES_DIR + f, 'utf8')]);
const ALL_SOURCES = [...ROUTE_SOURCES, ['services/ai/tools.js', readSrc('services/ai/tools.js')]];

/**
 * Both shapes an enforcement point takes:
 *   routes/**.js          ->  requirePermission(PERMISSIONS.PRODUCTS_VIEW)
 *   services/ai/tools.js  ->  permission: PERMISSIONS.PRODUCTS_VIEW,
 *
 * A raw string literal is accepted too, so a future author who writes
 * `requirePermission('products.view')` is still counted as enforcing it (and is
 * still caught by the catalogue-membership test below if they typo it).
 */
const ENFORCEMENT_CALL =
  /(?:requirePermission\s*\(|permission\s*:)\s*(PERMISSIONS\.[A-Z_0-9]+|'[^']*'|"[^"]*")/g;

function resolveToken(token) {
  if (token.startsWith('PERMISSIONS.')) {
    // An unknown member resolves to undefined on purpose: the catalogue-
    // membership test below is what turns that into a failure.
    return PERMISSIONS[token.slice('PERMISSIONS.'.length)];
  }
  return token.slice(1, -1);
}

/** Map of permission value -> Set of files that attach it. */
function scanEnforcement(sources) {
  const found = new Map();
  for (const [file, text] of sources) {
    for (const match of text.matchAll(ENFORCEMENT_CALL)) {
      const value = resolveToken(match[1]);
      if (!found.has(value)) found.set(value, new Set());
      found.get(value).add(file);
    }
  }
  return found;
}

const ALL_ENFORCED = scanEnforcement(ALL_SOURCES);
const ROUTE_ENFORCED = scanEnforcement(ROUTE_SOURCES);

/** The declaration statement for one route, whitespace-normalised. */
function declarationOf(relPath, method, routePath) {
  const text = readSrc(relPath).replace(/\s+/g, ' ');
  const start = text.indexOf(`router.${method.toLowerCase()}('${routePath}',`);
  assert.notEqual(start, -1, `no declaration found for ${method.toUpperCase()} ${routePath} in ${relPath}`);
  const end = text.indexOf(';', start);
  return text.slice(start, end === -1 ? undefined : end);
}

// ---------------------------------------------------------------------------
// Router-stack access
// ---------------------------------------------------------------------------

function handlersOf(router, method, routePath) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method.toLowerCase()]
  );
  assert.ok(layer, `no ${method.toUpperCase()} ${routePath} route registered`);
  return layer.route.stack.map((s) => s.handle);
}

/** Invoke a permission gate with a synthetic req.user and capture the outcome. */
function runGate(gate, user) {
  let error = null;
  let passed = false;
  gate({ user }, {}, (err) => {
    if (err) error = err;
    else passed = true;
  });
  return { error, passed };
}

const UNKNOWN_ROLE = 'NO_SUCH_ROLE';

// ---------------------------------------------------------------------------
// Phase 22 scope: the read routes that gained an explicit permission gate.
// ---------------------------------------------------------------------------

const PHASE22_READ_ROUTES = [
  { route: 'GET /api/products', mod: productsRoutes, file: 'routes/products.routes.js', method: 'get', path: '/', key: 'PRODUCTS_VIEW' },
  { route: 'GET /api/products/reorder', mod: productsRoutes, file: 'routes/products.routes.js', method: 'get', path: '/reorder', key: 'PRODUCTS_VIEW' },
  { route: 'GET /api/products/barcode', mod: productsRoutes, file: 'routes/products.routes.js', method: 'get', path: '/barcode', key: 'PRODUCTS_VIEW' },
  { route: 'GET /api/products/:id', mod: productsRoutes, file: 'routes/products.routes.js', method: 'get', path: '/:id', key: 'PRODUCTS_VIEW' },
  { route: 'GET /api/suppliers', mod: suppliersRoutes, file: 'routes/suppliers.routes.js', method: 'get', path: '/', key: 'SUPPLIERS_VIEW' },
  { route: 'GET /api/suppliers/:id', mod: suppliersRoutes, file: 'routes/suppliers.routes.js', method: 'get', path: '/:id', key: 'SUPPLIERS_VIEW' },
  { route: 'GET /api/purchase-orders', mod: purchaseOrdersRoutes, file: 'routes/purchase-orders.routes.js', method: 'get', path: '/', key: 'PURCHASE_ORDERS_VIEW' },
  { route: 'GET /api/purchase-orders/:id', mod: purchaseOrdersRoutes, file: 'routes/purchase-orders.routes.js', method: 'get', path: '/:id', key: 'PURCHASE_ORDERS_VIEW' },
];

const NEWLY_ENFORCED = ['PRODUCTS_VIEW', 'SUPPLIERS_VIEW', 'PURCHASE_ORDERS_VIEW'];

unitSuite('Phase 22 — authorization contract & RBAC coverage', () => {
  // -------------------------------------------------------------------------
  describe('permission catalogue coverage', () => {
    it('enforces or explicitly catalogues every declared permission', () => {
      const catalogue = Object.values(PERMISSIONS);
      const catalogueOnly = [...CATALOGUE_ONLY_PERMISSIONS];

      // Anchors: if the enforcement scan ever silently stops matching, the
      // union test below fails too — but these make the cause obvious.
      for (const key of ['AI_USE', 'INVENTORY_HISTORY_VIEW', 'PRODUCTS_VIEW']) {
        assert.ok(
          ALL_ENFORCED.has(PERMISSIONS[key]),
          `enforcement scan found no live reference to ${key} — the scan is broken, not the route`
        );
      }

      const enforced = catalogue.filter((p) => ALL_ENFORCED.has(p));
      const uncovered = catalogue.filter((p) => !ALL_ENFORCED.has(p) && !catalogueOnly.includes(p));

      assert.deepEqual(
        uncovered,
        [],
        `permission(s) granted to a role but attached to nothing and not listed in ` +
          `CATALOGUE_ONLY_PERMISSIONS: ${uncovered.join(', ')}. Either wire the capability to the ` +
          `endpoint that needs it, or declare it catalogue-only in constants/roles.js.`
      );

      // The two sets partition the catalogue: no overlap, no gap.
      const overlap = catalogueOnly.filter((p) => ALL_ENFORCED.has(p));
      assert.deepEqual(overlap, [], `catalogue-only permission(s) that ARE enforced: ${overlap.join(', ')}`);

      assert.deepEqual(
        [...enforced, ...catalogueOnly].sort(),
        [...catalogue].sort(),
        'enforced + catalogue-only must account for every permission exactly once'
      );

      // Every catalogue-only entry must be a real permission value, not a key.
      for (const entry of CATALOGUE_ONLY_PERMISSIONS) {
        assert.ok(catalogue.includes(entry), `CATALOGUE_ONLY_PERMISSIONS holds a non-permission value: ${entry}`);
      }
    });

    it('rejects a permission a route references that is not in the catalogue', () => {
      // A typo'd member resolves to `undefined`; a typo'd string literal stays a
      // string. Both fail here, which is the whole point: a route can never gate
      // on a permission that does not exist.
      const catalogue = Object.values(PERMISSIONS);
      for (const [value, files] of ROUTE_ENFORCED) {
        assert.ok(
          catalogue.includes(value),
          `route(s) ${[...files].join(', ')} gate on "${value}", which is not in the permission catalogue`
        );
      }
    });

    it('keeps CATALOGUE_ONLY_PERMISSIONS out of the runtime authorization path', () => {
      // Owner decision 2: the declaration is metadata for this guard only. It
      // must not be consumed by authorize.js or any other runtime decision.
      const authorizeSrc = readSrc('middlewares/authorize.js');
      assert.equal(
        authorizeSrc.includes('CATALOGUE_ONLY_PERMISSIONS'),
        false,
        'middlewares/authorize.js must not consume CATALOGUE_ONLY_PERMISSIONS'
      );

      const importers = walkSourceFiles(SRC_DIR)
        .map((file) => path.relative(SRC_DIR, file).split(path.sep).join('/'))
        .filter((rel) => sourceModuleName(rel) !== 'constants/roles')
        .filter((rel) => fs.readFileSync(path.join(SRC_DIR, rel), 'utf8').includes('CATALOGUE_ONLY_PERMISSIONS'));

      assert.deepEqual(
        importers,
        [],
        `CATALOGUE_ONLY_PERMISSIONS is metadata for the guard alone but is referenced by: ${importers.join(', ')}`
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('Phase 22 read-route enforcement', () => {
    it('gates each read route with requireAuth, a permission gate, then the controller', () => {
      for (const { route, mod, method, path } of PHASE22_READ_ROUTES) {
        const handlers = handlersOf(mod, method, path);

        assert.equal(handlers.length, 3, `${route}: expected requireAuth + gate + controller`);
        assert.equal(handlers[0], requireAuth, `${route}: first handler must be the shared requireAuth`);
        assert.notEqual(handlers[1], requireAuth, `${route}: second handler must be the permission gate`);
        assert.equal(handlers[1].length, 3, `${route}: the gate must have (req, res, next) arity`);
        assert.equal(handlers[2].length, 2, `${route}: last handler must be the controller, not another gate`);
      }
    });

    it('names the declared view permission in each read route declaration', () => {
      for (const { route, file, method, path, key } of PHASE22_READ_ROUTES) {
        const declaration = declarationOf(file, method, path);
        assert.ok(
          declaration.includes(`PERMISSIONS.${key}`),
          `${route} must be gated by PERMISSIONS.${key}; declaration reads: ${declaration}`
        );
      }
    });

    it('refuses a role holding nothing and admits STAFF on every read route', () => {
      for (const { route, mod, method, path, key } of PHASE22_READ_ROUTES) {
        const gate = handlersOf(mod, method, path)[1];

        const anonymous = runGate(gate, undefined);
        assert.equal(anonymous.error?.status, 401, `${route}: no authenticated user must be a 401`);
        assert.equal(anonymous.error?.code, 'AUTH_REQUIRED', `${route}: expected AUTH_REQUIRED`);

        // 403 is what distinguishes a permission gate from requireAuth.
        const stranger = runGate(gate, { role: UNKNOWN_ROLE });
        assert.equal(stranger.error?.status, 403, `${route}: a role holding nothing must be a 403`);
        assert.equal(stranger.error?.code, 'FORBIDDEN', `${route}: expected FORBIDDEN`);
        assert.equal(stranger.passed, false, `${route}: an ungranted role must not reach the controller`);

        // STAFF is the weakest real role; every view permission covers it.
        const staff = runGate(gate, { role: ROLES.STAFF });
        assert.equal(staff.error, null, `${route}: STAFF holds ${key} and must be admitted`);
        assert.equal(staff.passed, true, `${route}: STAFF must reach the controller`);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('behaviour-neutrality of the newly enforced view permissions', () => {
    it('leaves all four roles holding the three view permissions', () => {
      // This is the reason Phase 22 changes no observable behavior: the gate was
      // added, but every role that could already read these resources still can.
      for (const key of NEWLY_ENFORCED) {
        for (const role of ROLE_VALUES) {
          assert.equal(
            hasPermission(role, PERMISSIONS[key]),
            true,
            `${role} must still hold ${PERMISSIONS[key]} — enforcing the route must not revoke access`
          );
        }
      }
    });

    it('keeps each view permission distinct from its manage counterpart', () => {
      // Guards the other direction: a read route must never be gated by the
      // manage key, because STAFF does not hold any manage capability.
      const pairs = [
        ['PRODUCTS_VIEW', 'PRODUCTS_MANAGE'],
        ['SUPPLIERS_VIEW', 'SUPPLIERS_MANAGE'],
        ['PURCHASE_ORDERS_VIEW', 'PURCHASE_ORDERS_MANAGE'],
      ];
      for (const [viewKey, manageKey] of pairs) {
        assert.notEqual(PERMISSIONS[viewKey], PERMISSIONS[manageKey]);
        assert.equal(hasPermission(ROLES.STAFF, PERMISSIONS[manageKey]), false, `STAFF must not hold ${manageKey}`);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('transactions.view stays catalogue-only', () => {
    it('is declared catalogue-only and attached to no endpoint', () => {
      assert.ok(
        CATALOGUE_ONLY_PERMISSIONS.includes(PERMISSIONS.TRANSACTIONS_VIEW),
        'transactions.view must be declared in CATALOGUE_ONLY_PERMISSIONS'
      );
      assert.equal(
        ALL_ENFORCED.has(PERMISSIONS.TRANSACTIONS_VIEW),
        false,
        'transactions.view was expected to have no implementing endpoint'
      );
    });

    it('leaves GET /api/inventory/history on inventory.history.view', () => {
      const declaration = declarationOf('routes/inventory.routes.js', 'get', '/history');
      assert.ok(
        declaration.includes('PERMISSIONS.INVENTORY_HISTORY_VIEW'),
        `inventory history must stay gated by inventory.history.view; declaration reads: ${declaration}`
      );

      const inventorySrc = readSrc('routes/inventory.routes.js');
      assert.equal(
        inventorySrc.includes('PERMISSIONS.TRANSACTIONS_VIEW'),
        false,
        'the inventory history route must not be moved onto transactions.view'
      );

      const handlers = handlersOf(inventoryRoutes, 'get', '/history');
      assert.equal(handlers.length, 3);
      assert.equal(handlers[0], requireAuth);
      assert.equal(handlers[1].length, 3);
    });

    it('admits STAFF to inventory history, proving the route is not on transactions.view', () => {
      // The sharpest available proof, and it needs no file text: STAFF holds
      // inventory.history.view but NOT transactions.view, so a 403 here would
      // mean the route had been switched to the wrong key.
      assert.equal(hasPermission(ROLES.STAFF, PERMISSIONS.INVENTORY_HISTORY_VIEW), true);
      assert.equal(hasPermission(ROLES.STAFF, PERMISSIONS.TRANSACTIONS_VIEW), false);

      const gate = handlersOf(inventoryRoutes, 'get', '/history')[1];
      const staff = runGate(gate, { role: ROLES.STAFF });
      assert.equal(staff.error, null, 'STAFF must still reach inventory history');
      assert.equal(staff.passed, true);

      const stranger = runGate(gate, { role: UNKNOWN_ROLE });
      assert.equal(stranger.error?.status, 403, 'the history gate must still refuse an ungranted role');
    });
  });
});
