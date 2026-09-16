import {
  PERMISSIONS,
  ROLES,
  can,
  canModifyUser,
  assignableRoles,
  defaultHomePath,
} from '../lib/permissions';

/**
 * The client-side RBAC mirror decides what the UI offers. The backend stays
 * authoritative, but this file is also read by the server's Phase 23 guard, so
 * these cases pin the mirror's own contract: which role holds which capability,
 * and the cross-role rules the user-management screens rely on.
 */
describe('can', () => {
  it('grants a governance capability to OWNER', () => {
    expect(can({ role: ROLES.OWNER }, PERMISSIONS.BUSINESS_MANAGE)).toBe(true);
  });

  it('denies the audit trail to STAFF', () => {
    expect(can({ role: ROLES.STAFF }, PERMISSIONS.AUDIT_VIEW)).toBe(false);
  });

  it('denies a signed-out subject and an unknown role', () => {
    expect(can(null, PERMISSIONS.PRODUCTS_VIEW)).toBe(false);
    expect(can({ role: 'SUPERUSER' }, PERMISSIONS.PRODUCTS_VIEW)).toBe(false);
  });

  it('denies an inherited Object key used as a role', () => {
    // The lookup is guarded by an own-property check, so a role name like
    // 'toString' must not resolve to anything grantable.
    expect(can({ role: 'toString' }, PERMISSIONS.PRODUCTS_VIEW)).toBe(false);
  });
});

describe('user-management role rules', () => {
  const admin = { id: 'a1', role: ROLES.ADMIN };
  const otherAdmin = { id: 'a2', role: ROLES.ADMIN };
  const staff = { id: 's1', role: ROLES.STAFF };

  it('refuses a self role/status change', () => {
    expect(canModifyUser(admin, admin)).toBe(false);
  });

  it('refuses an ADMIN editing another ADMIN but allows editing STAFF', () => {
    expect(canModifyUser(admin, otherAdmin)).toBe(false);
    expect(canModifyUser(admin, staff)).toBe(true);
  });

  it('never offers OWNER as an assignable role', () => {
    expect(assignableRoles({ role: ROLES.OWNER })).not.toContain(ROLES.OWNER);
    expect(assignableRoles(admin)).toEqual([ROLES.MANAGER, ROLES.STAFF]);
  });
});

describe('defaultHomePath', () => {
  it('sends STAFF to inventory and MANAGER to the dashboard', () => {
    expect(defaultHomePath({ role: ROLES.STAFF })).toBe('/inventory');
    expect(defaultHomePath({ role: ROLES.MANAGER })).toBe('/dashboard');
  });
});
