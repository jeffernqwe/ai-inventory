// Phase 14A — User Management (CRUD over /api/users).
//
// DB-backed suite over the real HTTP app. Exercises the OWNER/ADMIN user
// management API end to end: create/list/get/role+status updates, the
// cross-role rules (no OWNER ever, no self-change, ADMIN may neither touch nor
// assign ADMIN), tenant isolation (foreign ids are 404s, never a leak, and a
// client businessId is ignored), duplicate-email 409s (global index, same and
// cross business), disabled users (login + existing JWTs revoked instantly,
// re-enable restores), invalid role/status validation, the bcrypt round-trip,
// and the USER_CREATED / USER_UPDATED audit rows. Registered as MIXED in
// run-tests.mjs.
//
// NOTE: business context always comes from the authenticated user — no client
// businessId input is accepted.

import 'dotenv/config';

import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  startServer,
  makeApi,
  createTracker,
  registerOwner,
  makeRoleUser,
  uniqueName,
  uniqueEmail,
  disconnectDb,
} from './support.mjs';
import { dbSuite } from './testEnv.mjs';
import { ROLES } from '../src/constants/roles.js';
import AuditLog from '../src/models/auditLog.model.ts';
import User from '../src/models/user.model.ts';

const { dbOk, baseUrl, server } = await startServer();
const api = makeApi(baseUrl);
const tracker = createTracker(dbOk);

const usersUrl = (id) => `/api/users/${id}`;
const PASSWORD = 'Password123!';

/** Create a user over the API; tracks it for cleanup on success. */
async function createUser(business, over = {}) {
  const res = await api('POST', '/api/users', {
    token: business.token,
    body: { name: uniqueName('U14'), email: uniqueEmail('u14'), password: PASSWORD, role: 'STAFF', ...over },
  });
  if (res.status === 201) tracker.trackUser(res.json.id);
  return res;
}

async function login(email, password) {
  return api('POST', '/api/auth/login', { body: { email, password } });
}

let main; // primary fixture business (OWNER)
let other; // isolation victim business (OWNER)
let pager; // dedicated business for exact list counts
let adminMain; // ADMIN inside `main` (fixture)
let managerMain; // MANAGER inside `main` (fixture)
let staffMain; // STAFF inside `main` (fixture)

let createdStaff; // STAFF created over the API in `main`
let disableTarget; // dedicated user for the disable/re-enable flow

dbSuite('Phase 14A — user management over real HTTP', dbOk, () => {
  before(async () => {
    main = await registerOwner(api, tracker);
    other = await registerOwner(api, tracker);
    pager = await registerOwner(api, tracker);
    adminMain = await makeRoleUser({ role: ROLES.ADMIN, businessId: main.businessId }, tracker);
    managerMain = await makeRoleUser({ role: ROLES.MANAGER, businessId: main.businessId }, tracker);
    staffMain = await makeRoleUser({ role: ROLES.STAFF, businessId: main.businessId }, tracker);
  });

  after(async () => {
    await tracker.cleanup();
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDb();
  });

  it('creates a STAFF user and returns the public shape (no passwordHash)', async () => {
    const res = await createUser(main);
    assert.equal(res.status, 201, JSON.stringify(res.json));
    createdStaff = res.json;
    assert.equal(createdStaff.role, 'STAFF');
    assert.equal(createdStaff.status, 'ACTIVE');
    assert.equal(createdStaff.businessId, main.businessId);
    assert.ok(createdStaff.id && createdStaff.name && createdStaff.email);
    assert.ok(createdStaff.createdAt, 'public user has createdAt');
    assert.equal(createdStaff.passwordHash, undefined, 'passwordHash must never leak');
    assert.equal(createdStaff.updatedAt, undefined);

    // The full record is readable by id with the same safe shape.
    const get = await api('GET', usersUrl(createdStaff.id), { token: main.token });
    assert.equal(get.status, 200, JSON.stringify(get.json));
    assert.equal(get.json.id, createdStaff.id);
    assert.equal(get.json.passwordHash, undefined);
  });

  it('the created user can log in and the stored hash is bcrypt', async () => {
    const loginRes = await login(createdStaff.email, PASSWORD);
    assert.equal(loginRes.status, 200, JSON.stringify(loginRes.json));
    assert.ok(loginRes.json.token);

    const dbUser = await User.findById(createdStaff.id).select('+passwordHash');
    assert.ok(dbUser, 'created user exists in the database');
    assert.ok(dbUser.passwordHash.startsWith('$2'), 'password is stored as a bcrypt hash');
    assert.notEqual(dbUser.passwordHash, PASSWORD);
    assert.notEqual(dbUser.passwordHash, '');
  });

  it('OWNER can create ADMIN, MANAGER and STAFF', async () => {
    const admin = await createUser(main, { role: 'ADMIN' });
    assert.equal(admin.status, 201, JSON.stringify(admin.json));
    assert.equal(admin.json.role, 'ADMIN');

    const mgr = await createUser(main, { role: 'MANAGER' });
    assert.equal(mgr.status, 201, JSON.stringify(mgr.json));
    assert.equal(mgr.json.role, 'MANAGER');

    const staff = await createUser(main, { role: 'STAFF' });
    assert.equal(staff.status, 201, JSON.stringify(staff.json));
    assert.equal(staff.json.role, 'STAFF');
  });

  it('rejects OWNER and unknown/blank roles on create (400 VALIDATION_ERROR)', async () => {
    for (const role of ['OWNER', 'SUPERUSER', '', undefined]) {
      const res = await api('POST', '/api/users', {
        token: main.token,
        body: { name: uniqueName('U14'), email: uniqueEmail('u14'), password: PASSWORD, role },
      });
      assert.equal(res.status, 400, `role=${JSON.stringify(role)} should be a 400: ${JSON.stringify(res.json)}`);
      assert.equal(res.json.code, 'VALIDATION_ERROR');
      assert.ok(res.json.fields.some((f) => f.field === 'role'), `role field problem expected for ${JSON.stringify(role)}`);
    }
  });

  it('validates email/password/name on create', async () => {
    const badEmail = await api('POST', '/api/users', {
      token: main.token,
      body: { name: uniqueName('U14'), email: 'not-an-email', password: PASSWORD, role: 'STAFF' },
    });
    assert.equal(badEmail.status, 400, JSON.stringify(badEmail.json));
    assert.ok(badEmail.json.fields.some((f) => f.field === 'email'));

    const shortPw = await api('POST', '/api/users', {
      token: main.token,
      body: { name: uniqueName('U14'), email: uniqueEmail('u14'), password: 'short', role: 'STAFF' },
    });
    assert.equal(shortPw.status, 400, JSON.stringify(shortPw.json));
    assert.ok(shortPw.json.fields.some((f) => f.field === 'password'));

    const noName = await api('POST', '/api/users', {
      token: main.token,
      body: { email: uniqueEmail('u14'), password: PASSWORD, role: 'STAFF' },
    });
    assert.equal(noName.status, 400, JSON.stringify(noName.json));
    assert.ok(noName.json.fields.some((f) => f.field === 'name'));
  });

  it('rejects duplicate emails — same business and cross business (409 EMAIL_IN_USE)', async () => {
    const dup = await createUser(main);
    assert.equal(dup.status, 201);

    const sameBiz = await api('POST', '/api/users', {
      token: main.token,
      body: { name: uniqueName('U14'), email: dup.json.email, password: PASSWORD, role: 'STAFF' },
    });
    assert.equal(sameBiz.status, 409, JSON.stringify(sameBiz.json));
    assert.equal(sameBiz.json.code, 'EMAIL_IN_USE');

    // The global unique email index blocks the same email in another business.
    const crossBiz = await api('POST', '/api/users', {
      token: other.token,
      body: { name: uniqueName('U14'), email: dup.json.email, password: PASSWORD, role: 'STAFF' },
    });
    assert.equal(crossBiz.status, 409, JSON.stringify(crossBiz.json));
    assert.equal(crossBiz.json.code, 'EMAIL_IN_USE');

    // A fresh email in the other business is fine.
    const fresh = await createUser(other);
    assert.equal(fresh.status, 201);
    assert.equal(fresh.json.businessId, other.businessId);
  });

  it('ADMIN may create MANAGER/STAFF only — ADMIN creation is 403 ADMIN_RESTRICTED', async () => {
    const tryAdmin = await api('POST', '/api/users', {
      token: adminMain.token,
      body: { name: uniqueName('U14'), email: uniqueEmail('u14'), password: PASSWORD, role: 'ADMIN' },
    });
    assert.equal(tryAdmin.status, 403, JSON.stringify(tryAdmin.json));
    assert.equal(tryAdmin.json.code, 'ADMIN_RESTRICTED');

    const mgr = await api('POST', '/api/users', {
      token: adminMain.token,
      body: { name: uniqueName('U14'), email: uniqueEmail('u14'), password: PASSWORD, role: 'MANAGER' },
    });
    assert.equal(mgr.status, 201, JSON.stringify(mgr.json));
    tracker.trackUser(mgr.json.id);

    const staff = await api('POST', '/api/users', {
      token: adminMain.token,
      body: { name: uniqueName('U14'), email: uniqueEmail('u14'), password: PASSWORD, role: 'STAFF' },
    });
    assert.equal(staff.status, 201, JSON.stringify(staff.json));
    tracker.trackUser(staff.json.id);
  });

  it('enforces RBAC: no token 401, STAFF/MANAGER 403 on every route, ADMIN/OWNER pass', async () => {
    const noToken = await api('GET', '/api/users');
    assert.equal(noToken.status, 401, JSON.stringify(noToken.json));
    assert.equal(noToken.json.code, 'AUTH_REQUIRED');

    const badToken = await api('GET', '/api/users', { token: 'not.a.real.token' });
    assert.equal(badToken.status, 401);
    assert.equal(badToken.json.code, 'INVALID_TOKEN');

    for (const restricted of [staffMain, managerMain]) {
      const list = await api('GET', '/api/users', { token: restricted.token });
      assert.equal(list.status, 403, `${restricted.userId} should be blocked from list`);
      assert.equal(list.json.code, 'FORBIDDEN');

      const create = await api('POST', '/api/users', {
        token: restricted.token,
        body: { name: uniqueName('U14'), email: uniqueEmail('u14'), password: PASSWORD, role: 'STAFF' },
      });
      assert.equal(create.status, 403, `${restricted.userId} should be blocked from create`);

      const patch = await api('PATCH', usersUrl(createdStaff.id), {
        token: restricted.token,
        body: { role: 'MANAGER' },
      });
      assert.equal(patch.status, 403, `${restricted.userId} should be blocked from patch`);
    }

    const adminList = await api('GET', '/api/users', { token: adminMain.token });
    assert.equal(adminList.status, 200, JSON.stringify(adminList.json));

    const ownerList = await api('GET', '/api/users', { token: main.token });
    assert.equal(ownerList.status, 200, JSON.stringify(ownerList.json));
  });

  it('lists only the caller’s business users, with q and pagination', async () => {
    // `pager` is a fresh business: OWNER + three API-created STAFF = 4 users.
    const s1 = await createUser(pager);
    const s2 = await createUser(pager);
    const s3 = await createUser(pager);
    assert.equal(s1.status, 201);
    assert.equal(s2.status, 201);
    assert.equal(s3.status, 201);

    const page1 = await api('GET', '/api/users?limit=2&page=1', { token: pager.token });
    assert.equal(page1.status, 200);
    assert.equal(page1.json.total, 4, JSON.stringify(page1.json));
    assert.equal(page1.json.items.length, 2);
    assert.equal(page1.json.totalPages, 2);
    assert.equal(page1.json.page, 1);
    // List is oldest-first (createdAt asc) — the OWNER registered first.
    assert.equal(page1.json.items[0].id, pager.userId);

    const page2 = await api('GET', '/api/users?limit=2&page=2', { token: pager.token });
    assert.equal(page2.status, 200);
    assert.equal(page2.json.items.length, 2);
    assert.equal(page2.json.page, 2);

    const seen = [...page1.json.items, ...page2.json.items].map((u) => u.id).sort();
    assert.deepEqual(seen, [pager.userId, s1.json.id, s2.json.id, s3.json.id].sort());

    // Exact-email q narrows to a single user.
    const byEmail = await api('GET', `/api/users?q=${encodeURIComponent(s3.json.email)}`, { token: pager.token });
    assert.equal(byEmail.status, 200);
    assert.equal(byEmail.json.total, 1, JSON.stringify(byEmail.json));
    assert.equal(byEmail.json.items[0].id, s3.json.id);
  });

  it('isolates users across businesses (foreign id is a 404, list never leaks)', async () => {
    const foreign = await createUser(other);
    assert.equal(foreign.status, 201);

    const get = await api('GET', usersUrl(foreign.json.id), { token: main.token });
    assert.equal(get.status, 404, JSON.stringify(get.json));
    assert.equal(get.json.code, 'NOT_FOUND');

    const patch = await api('PATCH', usersUrl(foreign.json.id), {
      token: main.token,
      body: { status: 'DISABLED' },
    });
    assert.equal(patch.status, 404);
    assert.equal(patch.json.code, 'NOT_FOUND');

    // main's list contains no user from `other`.
    const list = await api('GET', '/api/users?limit=100', { token: main.token });
    assert.equal(list.status, 200);
    assert.ok(
      list.json.items.every((u) => u.businessId === main.businessId),
      'every listed user belongs to the caller’s business'
    );
    assert.ok(!list.json.items.some((u) => u.id === foreign.json.id));

    // And the foreign user is untouched.
    const check = await api('GET', usersUrl(foreign.json.id), { token: other.token });
    assert.equal(check.status, 200);
    assert.equal(check.json.status, 'ACTIVE');

    // A malformed id is a 400 INVALID_ID.
    const malformed = await api('GET', usersUrl('not-an-object-id'), { token: main.token });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.json.code, 'INVALID_ID');
  });

  it('never trusts a client-supplied businessId on create', async () => {
    const res = await api('POST', '/api/users', {
      token: main.token,
      body: {
        name: uniqueName('U14'),
        email: uniqueEmail('u14'),
        password: PASSWORD,
        role: 'STAFF',
        businessId: other.businessId, // attempt to plant the user elsewhere
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    tracker.trackUser(res.json.id);
    assert.equal(res.json.businessId, main.businessId, 'server-derived businessId wins');
    assert.notEqual(res.json.businessId, other.businessId);
  });

  it('blocks self-modification for OWNER and ADMIN (403 CANNOT_MODIFY_SELF)', async () => {
    const ownerSelf = await api('PATCH', usersUrl(main.userId), {
      token: main.token,
      body: { role: 'MANAGER' },
    });
    assert.equal(ownerSelf.status, 403, JSON.stringify(ownerSelf.json));
    assert.equal(ownerSelf.json.code, 'CANNOT_MODIFY_SELF');

    const ownerSelfStatus = await api('PATCH', usersUrl(main.userId), {
      token: main.token,
      body: { status: 'DISABLED' },
    });
    assert.equal(ownerSelfStatus.status, 403);
    assert.equal(ownerSelfStatus.json.code, 'CANNOT_MODIFY_SELF');

    const adminSelf = await api('PATCH', usersUrl(adminMain.userId), {
      token: adminMain.token,
      body: { role: 'MANAGER' },
    });
    assert.equal(adminSelf.status, 403, JSON.stringify(adminSelf.json));
    assert.equal(adminSelf.json.code, 'CANNOT_MODIFY_SELF');
  });

  it('keeps the OWNER immutable — ADMIN cannot modify or disable the OWNER', async () => {
    const changeRole = await api('PATCH', usersUrl(main.userId), {
      token: adminMain.token,
      body: { role: 'MANAGER' },
    });
    assert.equal(changeRole.status, 403, JSON.stringify(changeRole.json));
    assert.equal(changeRole.json.code, 'OWNER_IMMUTABLE');

    const disable = await api('PATCH', usersUrl(main.userId), {
      token: adminMain.token,
      body: { status: 'DISABLED' },
    });
    assert.equal(disable.status, 403);
    assert.equal(disable.json.code, 'OWNER_IMMUTABLE');

    // The OWNER is still ACTIVE and in the business.
    const check = await api('GET', usersUrl(main.userId), { token: main.token });
    assert.equal(check.status, 200);
    assert.equal(check.json.role, 'OWNER');
    assert.equal(check.json.status, 'ACTIVE');
  });

  it('ADMIN cannot modify or assign another ADMIN (403 ADMIN_RESTRICTED)', async () => {
    const adminTwo = await createUser(main, { role: 'ADMIN' });
    assert.equal(adminTwo.status, 201);

    const demote = await api('PATCH', usersUrl(adminTwo.json.id), {
      token: adminMain.token,
      body: { role: 'MANAGER' },
    });
    assert.equal(demote.status, 403, JSON.stringify(demote.json));
    assert.equal(demote.json.code, 'ADMIN_RESTRICTED');

    const disable = await api('PATCH', usersUrl(adminTwo.json.id), {
      token: adminMain.token,
      body: { status: 'DISABLED' },
    });
    assert.equal(disable.status, 403);
    assert.equal(disable.json.code, 'ADMIN_RESTRICTED');

    // ADMIN promoting an existing MANAGER to ADMIN is equally blocked.
    const promote = await api('PATCH', usersUrl(managerMain.userId), {
      token: adminMain.token,
      body: { role: 'ADMIN' },
    });
    assert.equal(promote.status, 403);
    assert.equal(promote.json.code, 'ADMIN_RESTRICTED');

    // OWNER, by contrast, CAN assign ADMIN — proving the rule is ADMIN-scoped.
    const ownerAssigns = await api('PATCH', usersUrl(managerMain.userId), {
      token: main.token,
      body: { role: 'ADMIN' },
    });
    assert.equal(ownerAssigns.status, 200, JSON.stringify(ownerAssigns.json));
    assert.equal(ownerAssigns.json.role, 'ADMIN');
  });

  it('changes role and status independently, preserving untouched fields', async () => {
    const promote = await api('PATCH', usersUrl(createdStaff.id), {
      token: main.token,
      body: { role: 'MANAGER' },
    });
    assert.equal(promote.status, 200, JSON.stringify(promote.json));
    assert.equal(promote.json.role, 'MANAGER');
    assert.equal(promote.json.status, 'ACTIVE', 'untouched status is preserved');
    assert.equal(promote.json.email, createdStaff.email);
    assert.equal(promote.json.name, createdStaff.name);

    const disable = await api('PATCH', usersUrl(createdStaff.id), {
      token: main.token,
      body: { status: 'DISABLED' },
    });
    assert.equal(disable.status, 200, JSON.stringify(disable.json));
    assert.equal(disable.json.status, 'DISABLED');
    assert.equal(disable.json.role, 'MANAGER', 'untouched role is preserved');

    // Restore for later assertions.
    const reenable = await api('PATCH', usersUrl(createdStaff.id), {
      token: main.token,
      body: { status: 'ACTIVE' },
    });
    assert.equal(reenable.status, 200);
    assert.equal(reenable.json.status, 'ACTIVE');
  });

  it('disabling a user revokes login and existing JWTs; re-enabling restores access', async () => {
    const created = await createUser(main, { role: 'STAFF', name: 'Disable Me' });
    assert.equal(created.status, 201);
    disableTarget = created.json;

    // Pre-disable login gives a working token.
    const before = await login(disableTarget.email, PASSWORD);
    assert.equal(before.status, 200, JSON.stringify(before.json));
    const priorToken = before.json.token;

    const disable = await api('PATCH', usersUrl(disableTarget.id), {
      token: main.token,
      body: { status: 'DISABLED' },
    });
    assert.equal(disable.status, 200, JSON.stringify(disable.json));
    assert.equal(disable.json.status, 'DISABLED');

    // Status filter reflects the change on the list.
    const disabledList = await api('GET', '/api/users?status=DISABLED&limit=100', { token: main.token });
    assert.ok(disabledList.json.items.some((u) => u.id === disableTarget.id));
    const activeList = await api('GET', '/api/users?status=ACTIVE&limit=100', { token: main.token });
    assert.ok(!activeList.json.items.some((u) => u.id === disableTarget.id));

    // Fresh login is rejected with 403 ACCOUNT_DISABLED.
    const after = await login(disableTarget.email, PASSWORD);
    assert.equal(after.status, 403, JSON.stringify(after.json));
    assert.equal(after.json.code, 'ACCOUNT_DISABLED');

    // The pre-disable JWT is revoked instantly (requireAuth reloads status).
    const prior = await api('GET', '/api/users', { token: priorToken });
    assert.equal(prior.status, 403);
    assert.equal(prior.json.code, 'ACCOUNT_DISABLED');

    // Re-enable and everything works again.
    const reenable = await api('PATCH', usersUrl(disableTarget.id), {
      token: main.token,
      body: { status: 'ACTIVE' },
    });
    assert.equal(reenable.status, 200, JSON.stringify(reenable.json));

    const restored = await login(disableTarget.email, PASSWORD);
    assert.equal(restored.status, 200, JSON.stringify(restored.json));
  });

  it('rejects invalid role/status and empty PATCH payloads (400 VALIDATION_ERROR)', async () => {
    const target = usersUrl(createdStaff.id);
    const cases = [
      { body: { role: 'SUPERUSER' }, field: 'role' },
      { body: { role: 'OWNER' }, field: 'role' },
      { body: { status: 'SUSPENDED' }, field: 'status' },
      { body: {} }, // nothing to change
      { body: { nickname: 'nope' } }, // unsupported key only
    ];
    for (const c of cases) {
      const res = await api('PATCH', target, { token: main.token, body: c.body });
      assert.equal(res.status, 400, `body=${JSON.stringify(c.body)} should be a 400: ${JSON.stringify(res.json)}`);
      assert.equal(res.json.code, 'VALIDATION_ERROR');
      if (c.field) {
        assert.ok(res.json.fields.some((f) => f.field === c.field), `expected a ${c.field} field problem`);
      }
    }
  });

  it('a no-op PATCH (same role + status) succeeds without changing anything', async () => {
    const res = await api('PATCH', usersUrl(createdStaff.id), {
      token: main.token,
      body: { role: 'MANAGER', status: 'ACTIVE' },
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.role, 'MANAGER');
    assert.equal(res.json.status, 'ACTIVE');
  });

  it('writes USER_CREATED and USER_UPDATED audit rows (entityType USER, no secrets)', async () => {
    const auditCount = (action, entityId) =>
      AuditLog.countDocuments({
        businessId: main.businessId,
        action,
        entityType: 'USER',
        ...(entityId ? { entityId } : {}),
      });

    const beforeCreate = await auditCount('USER_CREATED');
    const beforeUpdate = await auditCount('USER_UPDATED');

    const created = await createUser(main, { role: 'MANAGER', name: 'Audit Target' });
    assert.equal(created.status, 201);

    const updated = await api('PATCH', usersUrl(created.json.id), {
      token: main.token,
      body: { role: 'ADMIN' },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.json));

    // Exactly one creation row and one update row for this user.
    assert.equal(await auditCount('USER_CREATED', created.json.id), 1);
    assert.equal(await auditCount('USER_UPDATED', created.json.id), 1);

    // Global counts moved by exactly one each.
    assert.equal(await auditCount('USER_CREATED'), beforeCreate + 1);
    assert.equal(await auditCount('USER_UPDATED'), beforeUpdate + 1);

    // Metadata carries the new values and never the password.
    const createLog = await AuditLog.findOne({
      businessId: main.businessId,
      action: 'USER_CREATED',
      entityType: 'USER',
      entityId: created.json.id,
    });
    assert.equal(createLog.metadata.name, 'Audit Target');
    assert.equal(createLog.metadata.email, created.json.email);
    assert.equal(createLog.metadata.role, 'MANAGER');
    assert.equal(createLog.metadata.passwordHash, undefined);
    assert.equal(createLog.metadata.password, undefined);

    const updateLog = await AuditLog.findOne({
      businessId: main.businessId,
      action: 'USER_UPDATED',
      entityType: 'USER',
      entityId: created.json.id,
    });
    assert.deepEqual(updateLog.metadata.updated, ['role']);
    assert.equal(updateLog.metadata.role, 'ADMIN');
    assert.equal(updateLog.metadata.passwordHash, undefined);
  });
});
