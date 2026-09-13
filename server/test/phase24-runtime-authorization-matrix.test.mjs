// Phase 24 — runtime authorization matrix & tenant-isolation verification.
//
// The vertical RBAC axis is already exercised per feature (phase04-inventory
// pins the STAFF boundary on inventory, phase13-* on suppliers/POs, phase14 on
// users, phase16 on audit), and the only four-role matrix in the suite runs
// against the TEST-ONLY `/guard` router inside phase03-auth.test.mjs — i.e.
// against synthetic routes, not shipped endpoints. This file adds the missing
// consolidated view over the REAL routes, and closes the one authorization
// property nothing verified: that a role change takes effect immediately on an
// already-issued JWT.
//
// Two design rules make it trustworthy:
//
//   1. EXPECTATIONS ARE DERIVED, NEVER TRANSCRIBED. The tier a route belongs to
//      is computed by asking the shipped `hasPermission(role, permission)` who
//      holds its capability. There is no second copy of the role matrix here, so
//      this file cannot silently disagree with constants/roles.js: a grant change
//      flows straight through to the cells, and a permission that gained or lost
//      a holder moves tiers on its own.
//   2. ADMITTED CELLS DO NOT DEPEND ON UNRELATED BEHAVIOUR. A gate is the second
//      handler, so it decides before any validation or lookup runs. Admitted
//      cells therefore assert "not 401, not 403, and not the code-less global
//      404" — no request body, no seeded resource, no provider availability, no
//      success payload. A 400/404/409 still proves the gate admitted; a mistyped
//      path is caught because the global 404 handler (middlewares/notFound.js)
//      answers `{error, message}` with NO `code`, while every ApiError 404 does
//      carry one.
//
// No production behaviour is changed by this phase. DB-backed; fails loudly when
// MongoDB is unreachable (Phase 07F / M9).

import { it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  startServer,
  makeApi,
  createTracker,
  registerOwner,
  makeRoleUser,
  uniqueEmail,
  uniqueName,
  disconnectDb,
} from './support.mjs';
import { dbSuite } from './testEnv.mjs';
import { ROLES, ROLE_VALUES, PERMISSIONS, hasPermission } from '../src/constants/roles.ts';
import {
  registerFakeProvider,
  setFakeScenario,
  fakeText,
  fakeCalls,
  toolResults,
} from './fakes/aiProvider.mjs';

// The fake provider lets the AI cells (and the promoted-role tool-gate test) run
// with no external key, and the permissive limiter keeps /api/ai/chat from
// answering 429 part-way through the matrix.
process.env.AI_PROVIDER = 'fake';
process.env.AI_RATE_LIMIT_MAX = '1000';
registerFakeProvider();

const PASSWORD = 'Password123!';

// A syntactically valid, non-existent ObjectId: by-id routes reach their service
// and answer 404 NOT_FOUND, which is still proof the gate admitted.
const ABSENT_ID = '000000000000000000000000';

/**
 * Representative real routes, one per capability that has an endpoint. Each row
 * names the permission the route declares; the expected outcome for a role is
 * `hasPermission(role, permission)` and nothing else.
 */
const MATRIX = Object.freeze([
  // OWNER + ADMIN
  { method: 'GET', path: '/api/users', permission: PERMISSIONS.USERS_MANAGE },
  { method: 'GET', path: '/api/audit', permission: PERMISSIONS.AUDIT_VIEW },
  { method: 'POST', path: '/api/categories', permission: PERMISSIONS.CATEGORIES_MANAGE },
  { method: 'POST', path: '/api/locations', permission: PERMISSIONS.LOCATIONS_MANAGE },

  // OWNER + ADMIN + MANAGER
  { method: 'GET', path: '/api/dashboard', permission: PERMISSIONS.DASHBOARD_VIEW },
  { method: 'POST', path: '/api/inventory/adjust', permission: PERMISSIONS.INVENTORY_MANAGE },
  { method: 'POST', path: '/api/inventory/transfer', permission: PERMISSIONS.INVENTORY_MANAGE },
  { method: 'POST', path: '/api/products', permission: PERMISSIONS.PRODUCTS_MANAGE },
  { method: 'POST', path: '/api/suppliers', permission: PERMISSIONS.SUPPLIERS_MANAGE },
  { method: 'POST', path: '/api/purchase-orders', permission: PERMISSIONS.PURCHASE_ORDERS_MANAGE },
  { method: 'POST', path: `/api/purchase-orders/${ABSENT_ID}/issue`, permission: PERMISSIONS.PURCHASE_ORDERS_MANAGE },

  // every role
  { method: 'GET', path: '/api/products', permission: PERMISSIONS.PRODUCTS_VIEW },
  { method: 'GET', path: '/api/suppliers', permission: PERMISSIONS.SUPPLIERS_VIEW },
  { method: 'GET', path: '/api/purchase-orders', permission: PERMISSIONS.PURCHASE_ORDERS_VIEW },
  { method: 'GET', path: '/api/inventory', permission: PERMISSIONS.INVENTORY_VIEW },
  { method: 'GET', path: '/api/inventory/history', permission: PERMISSIONS.INVENTORY_HISTORY_VIEW },
  { method: 'GET', path: '/api/ai/conversations', permission: PERMISSIONS.AI_USE },
  { method: 'POST', path: '/api/inventory/stock-in', permission: PERMISSIONS.INVENTORY_STOCK_IN },
  { method: 'POST', path: '/api/inventory/stock-out', permission: PERMISSIONS.INVENTORY_STOCK_OUT },
  { method: 'POST', path: `/api/purchase-orders/${ABSENT_ID}/receive`, permission: PERMISSIONS.PURCHASE_ORDERS_RECEIVE },
  { method: 'POST', path: '/api/ai/chat', permission: PERMISSIONS.AI_USE, body: { message: 'matrix probe' } },
]);

/** Routes held by requireAuth alone — they must not discriminate by role. */
const AUTHENTICATED_ROUTES = Object.freeze([
  { method: 'GET', path: '/api/auth/me' },
  { method: 'GET', path: '/api/categories' },
  { method: 'GET', path: '/api/locations' },
]);

/** Roles that hold `permission`, in ROLE_VALUES order — derived from the catalogue. */
function holders(permission) {
  return ROLE_VALUES.filter((role) => hasPermission(role, permission));
}

/**
 * Tier of a routed capability, derived from the grants rather than declared:
 * C = every role, B = OWNER/ADMIN/MANAGER, A = OWNER/ADMIN, OWNER_ONLY = one
 * holder (which no endpoint in this system has — see the explicit assertion).
 */
function tierOf(permission) {
  const n = holders(permission).length;
  if (n === ROLE_VALUES.length) return 'C';
  if (n === 3) return 'B';
  if (n === 2) return 'A';
  return 'OWNER_ONLY';
}

const TIER_A = MATRIX.filter((r) => tierOf(r.permission) === 'A');
const TIER_B = MATRIX.filter((r) => tierOf(r.permission) === 'B');
const TIER_C = MATRIX.filter((r) => tierOf(r.permission) === 'C');

/** The global notFound handler answers with no `code`; every ApiError 404 has one. */
function isUnknownRoute(res) {
  return res.status === 404 && (res.json === null || res.json?.code === undefined);
}

function label(role, route) {
  return `${role} ${route.method} ${route.path} [${route.permission}]`;
}

/** Asserts the request was allowed past the authorization gate. */
function assertAdmitted(res, role, route) {
  const where = label(role, route);
  assert.notEqual(res.status, 401, `${where} must not be 401: ${JSON.stringify(res.json)}`);
  assert.notEqual(res.status, 403, `${where} must not be 403: ${JSON.stringify(res.json)}`);
  assert.ok(!isUnknownRoute(res), `${where} is not a real route (code-less 404)`);
}

/** Asserts the authorization gate refused the request with the standard 403. */
function assertForbidden(res, role, route) {
  const where = label(role, route);
  assert.equal(res.status, 403, `${where} must be 403: ${JSON.stringify(res.json)}`);
  assert.equal(res.json.code, 'FORBIDDEN', `${where} must carry code FORBIDDEN`);
}

const { dbOk, baseUrl, server } = await startServer();
const api = makeApi(baseUrl);
const tracker = createTracker(dbOk);

let owner;
let session; // role -> token, all four roles inside ONE business

async function createUserViaApi(role) {
  const res = await api('POST', '/api/users', {
    token: owner.token,
    body: { name: uniqueName(`P24 ${role}`), email: uniqueEmail(`p24-${role.toLowerCase()}`), password: PASSWORD, role },
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  tracker.trackUser(res.json.id);
  return res.json;
}

/** A real login, so the JWT is issued by the shipped auth path. */
async function loginToken(email) {
  const res = await api('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return res.json.token;
}

async function patchRole(id, role) {
  const res = await api('PATCH', `/api/users/${id}`, { token: owner.token, body: { role } });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(res.json.role, role);
  return res;
}

afterEach(() => setFakeScenario(null));

after(async () => {
  await tracker.cleanup();
  if (server) await new Promise((resolve) => server.close(resolve));
  await disconnectDb();
});

dbSuite('Phase 24 — runtime authorization matrix', dbOk, () => {
  before(async () => {
    owner = await registerOwner(api, tracker);
    const admin = await makeRoleUser({ role: ROLES.ADMIN, businessId: owner.businessId }, tracker);
    const manager = await makeRoleUser({ role: ROLES.MANAGER, businessId: owner.businessId }, tracker);
    const staff = await makeRoleUser({ role: ROLES.STAFF, businessId: owner.businessId }, tracker);
    session = {
      [ROLES.OWNER]: owner.token,
      [ROLES.ADMIN]: admin.token,
      [ROLES.MANAGER]: manager.token,
      [ROLES.STAFF]: staff.token,
    };
  });

  it('Tier A (OWNER+ADMIN) real routes refuse MANAGER and STAFF', async () => {
    assert.ok(TIER_A.length > 0, 'the derived Tier A must not be empty');
    for (const route of TIER_A) {
      assert.deepEqual(holders(route.permission), [ROLES.OWNER, ROLES.ADMIN]);
      for (const role of ROLE_VALUES) {
        const res = await api(route.method, route.path, { token: session[role], body: route.body });
        if (hasPermission(role, route.permission)) assertAdmitted(res, role, route);
        else assertForbidden(res, role, route);
      }
    }
  });

  it('Tier B (OWNER+ADMIN+MANAGER) real routes refuse STAFF', async () => {
    assert.ok(TIER_B.length > 0, 'the derived Tier B must not be empty');
    for (const route of TIER_B) {
      assert.deepEqual(holders(route.permission), [ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER]);
      for (const role of ROLE_VALUES) {
        const res = await api(route.method, route.path, { token: session[role], body: route.body });
        if (hasPermission(role, route.permission)) assertAdmitted(res, role, route);
        else assertForbidden(res, role, route);
      }
    }
  });

  it('Tier C real routes admit every role, including STAFF', async () => {
    assert.ok(TIER_C.length > 0, 'the derived Tier C must not be empty');
    for (const route of TIER_C) {
      assert.equal(holders(route.permission).length, ROLE_VALUES.length);
      for (const role of ROLE_VALUES) {
        const res = await api(route.method, route.path, { token: session[role], body: route.body });
        assertAdmitted(res, role, route);
      }
    }
  });

  it('authenticated routes admit every role and discriminate nothing', async () => {
    for (const route of AUTHENTICATED_ROUTES) {
      for (const role of ROLE_VALUES) {
        const res = await api(route.method, route.path, { token: session[role] });
        assert.equal(res.status, 200, `${role} ${route.method} ${route.path}: ${JSON.stringify(res.json)}`);
      }
    }
  });

  it('a gated route refuses an unauthenticated request with 401 AUTH_REQUIRED', async () => {
    // Sampled per tier, not per route: Phase 23 proves structurally that
    // requireAuth is handlers[0] on all 47 gated routes, so a per-route runtime
    // repeat would assert the same wiring 47 times over.
    const sample = [
      TIER_A[0],
      TIER_B[0],
      TIER_C[0],
      MATRIX.find((r) => r.permission === PERMISSIONS.INVENTORY_HISTORY_VIEW),
      AUTHENTICATED_ROUTES[0],
    ];
    for (const route of sample) {
      const res = await api(route.method, route.path);
      assert.equal(res.status, 401, `${route.method} ${route.path}: ${JSON.stringify(res.json)}`);
      assert.equal(res.json.code, 'AUTH_REQUIRED');
    }
  });

  it('has no runtime route reserved to OWNER alone, because the OWNER-only tools are catalogue-only', () => {
    // The two OWNER-exclusive capabilities have no endpoint (Phase 22 declared
    // them catalogue-only), so no real route can distinguish OWNER from ADMIN.
    // Asserted explicitly rather than left as an implicit hole in the matrix.
    assert.deepEqual(holders(PERMISSIONS.BUSINESS_MANAGE), [ROLES.OWNER]);
    assert.deepEqual(holders(PERMISSIONS.ROLES_MANAGE), [ROLES.OWNER]);
    for (const route of MATRIX) {
      assert.notEqual(tierOf(route.permission), 'OWNER_ONLY', `${route.path} claims an OWNER-only tier that cannot exist`);
      assert.ok(
        hasPermission(ROLES.ADMIN, route.permission),
        `${route.path} admits OWNER but not ADMIN — no such route may exist`
      );
    }
  });

  it('promoting STAFF to MANAGER grants a MANAGER-gated capability on the SAME token', async () => {
    const user = await createUserViaApi(ROLES.STAFF);
    const token = await loginToken(user.email);

    const before = await api('GET', '/api/dashboard', { token });
    assertForbidden(before, ROLES.STAFF, { method: 'GET', path: '/api/dashboard', permission: PERMISSIONS.DASHBOARD_VIEW });

    await patchRole(user.id, ROLES.MANAGER);

    // The SAME pre-existing JWT: authenticate.js re-reads role from the database,
    // so the promotion takes effect without a new login or a new token.
    const afterPromotion = await api('GET', '/api/dashboard', { token });
    assertAdmitted(afterPromotion, ROLES.MANAGER, {
      method: 'GET',
      path: '/api/dashboard',
      permission: PERMISSIONS.DASHBOARD_VIEW,
    });
  });

  it('demoting MANAGER to STAFF revokes a MANAGER-gated capability on the SAME token', async () => {
    const user = await createUserViaApi(ROLES.MANAGER);
    const token = await loginToken(user.email);

    const before = await api('GET', '/api/dashboard', { token });
    assertAdmitted(before, ROLES.MANAGER, { method: 'GET', path: '/api/dashboard', permission: PERMISSIONS.DASHBOARD_VIEW });

    await patchRole(user.id, ROLES.STAFF);

    // De-escalation must be immediate too: the old token is not a licence that
    // keeps working until it expires.
    const afterDemotion = await api('GET', '/api/dashboard', { token });
    assertForbidden(afterDemotion, ROLES.STAFF, {
      method: 'GET',
      path: '/api/dashboard',
      permission: PERMISSIONS.DASHBOARD_VIEW,
    });
  });

  it('crossing tiers STAFF -> ADMIN -> STAFF grants and revokes users.manage on the SAME token', async () => {
    const user = await createUserViaApi(ROLES.STAFF);
    const token = await loginToken(user.email);
    const route = { method: 'GET', path: '/api/users', permission: PERMISSIONS.USERS_MANAGE };

    assertForbidden(await api('GET', '/api/users', { token }), ROLES.STAFF, route);

    await patchRole(user.id, ROLES.ADMIN);
    assertAdmitted(await api('GET', '/api/users', { token }), ROLES.ADMIN, route);

    await patchRole(user.id, ROLES.STAFF);
    assertForbidden(await api('GET', '/api/users', { token }), ROLES.STAFF, route);
  });

  it('a promoted role reaches the AI tool authorization gate on the SAME token', async () => {
    const user = await createUserViaApi(ROLES.STAFF);
    const token = await loginToken(user.email);

    // Stateless scenario: ask for the dashboard-gated summary tool, then finish.
    let lastCtx = null;
    setFakeScenario((ctx) => {
      lastCtx = ctx;
      const alreadyCalled = ctx.messages.some((m) => m.role === 'tool');
      return alreadyCalled ? fakeText('done') : fakeCalls([{ id: 'g1', name: 'getInventorySummary', input: {} }]);
    });

    const denied = await api('POST', '/api/ai/chat', { token, body: { message: 'inventory summary?' } });
    assert.equal(denied.status, 201, JSON.stringify(denied.json));
    assert.ok(
      toolResults(lastCtx).some((r) => r && r.code === 'TOOL_FORBIDDEN'),
      'STAFF must get a TOOL_FORBIDDEN soft result from the dashboard-gated tool'
    );

    await patchRole(user.id, ROLES.MANAGER);

    const allowed = await api('POST', '/api/ai/chat', { token, body: { message: 'inventory summary?' } });
    assert.equal(allowed.status, 201, JSON.stringify(allowed.json));
    const results = toolResults(lastCtx);
    assert.ok(results.length > 0, 'the tool must have run after the promotion');
    assert.ok(
      !results.some((r) => r && r.code === 'TOOL_FORBIDDEN'),
      'a promoted MANAGER must pass the AI tool permission gate'
    );
  });
});
