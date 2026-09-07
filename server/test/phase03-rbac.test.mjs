// Pure unit tests for RBAC + business-isolation guards. No DB, no HTTP:
// exercises requireRole / requirePermission / hasPermission /
// assertBusinessAccess directly with fabricated req.user objects.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { requireRole, requirePermission } from '../src/middlewares/authorize.js';
import {
  ROLES,
  ROLE_VALUES,
  ROLE_PERMISSIONS,
  PERMISSIONS,
  hasPermission,
} from '../src/constants/roles.js';
import assertBusinessAccess from '../src/utils/businessAccess.js';
import ApiError from '../src/utils/ApiError.js';

/** Invoke a middleware with a fabricated req/res and resolve with next's error (null on pass). */
function callMw(mw, req) {
  return new Promise((resolve) => {
    mw(req, {}, (err) => resolve(err ?? null));
  });
}

function userOf(role) {
  return { id: 'u1', businessId: 'b1', name: 'X', email: 'x@example.com', role, status: 'ACTIVE' };
}

describe('roles constants', () => {
  it('defines exactly OWNER, ADMIN, MANAGER, STAFF', () => {
    assert.deepEqual([...ROLE_VALUES].sort(), ['ADMIN', 'MANAGER', 'OWNER', 'STAFF']);
    assert.deepEqual(
      Object.keys(ROLE_PERMISSIONS).sort(),
      ['ADMIN', 'MANAGER', 'OWNER', 'STAFF']
    );
  });

  it('OWNER holds every permission including OWNER-only ones', () => {
    for (const p of Object.values(PERMISSIONS)) {
      assert.equal(hasPermission(ROLES.OWNER, p), true, `OWNER should hold ${p}`);
    }
  });

  it('ADMIN holds operational permissions but not OWNER-only business/user/role management', () => {
    for (const p of [PERMISSIONS.BUSINESS_MANAGE, PERMISSIONS.USERS_MANAGE, PERMISSIONS.ROLES_MANAGE]) {
      assert.equal(hasPermission(ROLES.ADMIN, p), false, `ADMIN should NOT hold ${p}`);
    }
    assert.equal(hasPermission(ROLES.ADMIN, PERMISSIONS.PRODUCTS_MANAGE), true);
    assert.equal(hasPermission(ROLES.ADMIN, PERMISSIONS.DASHBOARD_VIEW), true);
    assert.equal(hasPermission(ROLES.ADMIN, PERMISSIONS.AI_USE), true);
  });

  it('MANAGER manages products/inventory but not users or locations/categories', () => {
    for (const p of [
      PERMISSIONS.PRODUCTS_MANAGE,
      PERMISSIONS.INVENTORY_STOCK_IN,
      PERMISSIONS.INVENTORY_STOCK_OUT,
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.AI_USE,
    ]) {
      assert.equal(hasPermission(ROLES.MANAGER, p), true, `MANAGER should hold ${p}`);
    }
    for (const p of [
      PERMISSIONS.USERS_MANAGE,
      PERMISSIONS.BUSINESS_MANAGE,
      PERMISSIONS.LOCATIONS_MANAGE,
      PERMISSIONS.CATEGORIES_MANAGE,
    ]) {
      assert.equal(hasPermission(ROLES.MANAGER, p), false, `MANAGER should NOT hold ${p}`);
    }
  });

  it('STAFF views and does stock work but holds no management/dashboard permission', () => {
    for (const p of [
      PERMISSIONS.PRODUCTS_VIEW,
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.INVENTORY_STOCK_IN,
      PERMISSIONS.INVENTORY_STOCK_OUT,
      PERMISSIONS.INVENTORY_HISTORY_VIEW,
      PERMISSIONS.AI_USE,
    ]) {
      assert.equal(hasPermission(ROLES.STAFF, p), true, `STAFF should hold ${p}`);
    }
    for (const p of [
      PERMISSIONS.PRODUCTS_MANAGE,
      PERMISSIONS.INVENTORY_MANAGE,
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.TRANSACTIONS_VIEW,
      PERMISSIONS.USERS_MANAGE,
    ]) {
      assert.equal(hasPermission(ROLES.STAFF, p), false, `STAFF should NOT hold ${p}`);
    }
  });
});

describe('requireRole middleware', () => {
  it('passes when the user role is allowed', async () => {
    const err = await callMw(requireRole(ROLES.OWNER), { user: userOf(ROLES.OWNER) });
    assert.equal(err, null);
  });

  it('rejects with 403 FORBIDDEN when the role is not allowed', async () => {
    const err = await callMw(requireRole(ROLES.OWNER), { user: userOf(ROLES.STAFF) });
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 403);
    assert.equal(err.code, 'FORBIDDEN');
  });

  it('supports multiple allowed roles (varargs and arrays)', async () => {
    assert.equal(await callMw(requireRole(ROLES.OWNER, ROLES.ADMIN), { user: userOf(ROLES.ADMIN) }), null);
    assert.equal(await callMw(requireRole([ROLES.OWNER, ROLES.MANAGER]), { user: userOf(ROLES.MANAGER) }), null);
    const err = await callMw(requireRole(ROLES.OWNER, ROLES.ADMIN), { user: userOf(ROLES.STAFF) });
    assert.equal(err?.status, 403);
  });

  it('returns 401 when there is no authenticated user', async () => {
    const err = await callMw(requireRole(ROLES.OWNER), {});
    assert.equal(err?.status, 401);
    assert.equal(err?.code, 'AUTH_REQUIRED');
  });
});

describe('requirePermission middleware', () => {
  it('passes OWNER/ADMIN/MANAGER and blocks STAFF on dashboard.view', async () => {
    for (const role of [ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER]) {
      const err = await callMw(requirePermission(PERMISSIONS.DASHBOARD_VIEW), {
        user: userOf(role),
      });
      assert.equal(err, null, `${role} should see the dashboard`);
    }
    const err = await callMw(requirePermission(PERMISSIONS.DASHBOARD_VIEW), {
      user: userOf(ROLES.STAFF),
    });
    assert.equal(err?.status, 403);
  });

  it('blocks ADMIN from OWNER-only users.manage', async () => {
    const err = await callMw(requirePermission(PERMISSIONS.USERS_MANAGE), {
      user: userOf(ROLES.ADMIN),
    });
    assert.equal(err?.status, 403);
    const ownerErr = await callMw(requirePermission(PERMISSIONS.USERS_MANAGE), {
      user: userOf(ROLES.OWNER),
    });
    assert.equal(ownerErr, null);
  });

  it('returns 401 when there is no authenticated user', async () => {
    const err = await callMw(requirePermission(PERMISSIONS.PRODUCTS_VIEW), {});
    assert.equal(err?.status, 401);
  });
});

describe('assertBusinessAccess', () => {
  const me = userOf(ROLES.OWNER);

  it('allows access to the user’s own business', () => {
    assert.doesNotThrow(() => assertBusinessAccess(me, me.businessId));
    // ObjectId/string equivalence (server values may be hydrated as ObjectIds)
    assert.doesNotThrow(() => assertBusinessAccess(me, 'b1'));
  });

  it('rejects a different business with 403 FORBIDDEN_BUSINESS', () => {
    assert.throws(
      () => assertBusinessAccess(me, 'b2'),
      (err) => err instanceof ApiError && err.status === 403 && err.code === 'FORBIDDEN_BUSINESS'
    );
  });

  it('rejects a missing/blank target businessId with 403', () => {
    for (const bad of [null, undefined, '']) {
      assert.throws(() => assertBusinessAccess(me, bad), (err) => err.status === 403);
    }
  });

  it('rejects when there is no authenticated user with 401', () => {
    assert.throws(() => assertBusinessAccess(null, 'b1'), (err) => err.status === 401);
  });
});
