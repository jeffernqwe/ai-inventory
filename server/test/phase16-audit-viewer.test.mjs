// Phase 16 — Read-only audit trail viewer (GET /api/audit).
//
// DB-backed suite over the real HTTP app. Exercises the OWNER/ADMIN audit
// endpoint end to end: RBAC (no token 401, STAFF/MANAGER 403, OWNER/ADMIN 200),
// tenant isolation (a client-supplied businessId is ignored, foreign trails
// never leak), filters (action, entityType, userId, from/to, q — with unknown
// values rejected 400 VALIDATION_ERROR), pagination with newest-first ordering,
// actor population (system rows with no userId return actor: null), and a
// strict whitelisted DTO (no password/hash/sensitive fields ever). Registered
// as MIXED in run-tests.mjs.
//
// NOTE: business context always comes from the authenticated user — the audit
// endpoint accepts no client businessId at all.

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
import AuditLog from '../src/models/auditLog.model.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../src/constants/audit.js';

const { dbOk, baseUrl, server } = await startServer();
const api = makeApi(baseUrl);
const tracker = createTracker(dbOk);

const PASSWORD = 'Password123!';

let main; // OWNER business whose trail is under test
let other; // isolation victim business
let auditor; // dedicated business for exact filter/pagination counts
let adminMain;
let managerMain;
let staffMain;

let mainUser; // USER created in `main` over the API
let foreignUser; // USER created in `other` over the API
let ownerName; // `main` OWNER's name (for the actor assertion)

dbSuite('Phase 16 — audit trail viewer over real HTTP', dbOk, () => {
  before(async () => {
    main = await registerOwner(api, tracker);
    other = await registerOwner(api, tracker);
    auditor = await registerOwner(api, tracker);
    adminMain = await makeRoleUser({ role: ROLES.ADMIN, businessId: main.businessId }, tracker);
    managerMain = await makeRoleUser({ role: ROLES.MANAGER, businessId: main.businessId }, tracker);
    staffMain = await makeRoleUser({ role: ROLES.STAFF, businessId: main.businessId }, tracker);

    const me = await api('GET', '/api/auth/me', { token: main.token });
    ownerName = me.json.user.name;
  });

  after(async () => {
    await tracker.cleanup();
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDb();
  });

  it('requires authentication and restricts the trail to OWNER/ADMIN', async () => {
    const noToken = await api('GET', '/api/audit');
    assert.equal(noToken.status, 401, JSON.stringify(noToken.json));
    assert.equal(noToken.json.code, 'AUTH_REQUIRED');

    const badToken = await api('GET', '/api/audit', { token: 'not.a.real.token' });
    assert.equal(badToken.status, 401);
    assert.equal(badToken.json.code, 'INVALID_TOKEN');

    for (const restricted of [staffMain, managerMain]) {
      const res = await api('GET', '/api/audit', { token: restricted.token });
      assert.equal(res.status, 403, `${restricted.userId} should be blocked: ${JSON.stringify(res.json)}`);
      assert.equal(res.json.code, 'FORBIDDEN');
    }
  });

  it('lets OWNER and ADMIN list the trail with the standard envelope', async () => {
    const owner = await api('GET', '/api/audit', { token: main.token });
    assert.equal(owner.status, 200, JSON.stringify(owner.json));
    assert.ok(Array.isArray(owner.json.items));
    assert.equal(typeof owner.json.total, 'number');
    assert.equal(typeof owner.json.page, 'number');
    assert.equal(typeof owner.json.totalPages, 'number');

    const admin = await api('GET', '/api/audit', { token: adminMain.token });
    assert.equal(admin.status, 200, JSON.stringify(admin.json));
  });

  it('returns a strict whitelisted DTO with the actor populated', async () => {
    const userRes = await api('POST', '/api/users', {
      token: main.token,
      body: { name: uniqueName('U16'), email: uniqueEmail('u16'), password: PASSWORD, role: 'STAFF' },
    });
    assert.equal(userRes.status, 201, JSON.stringify(userRes.json));
    tracker.trackUser(userRes.json.id);
    mainUser = userRes.json;

    const catRes = await api('POST', '/api/categories', {
      token: main.token,
      body: { name: uniqueName('Cat16') },
    });
    assert.equal(catRes.status, 201, JSON.stringify(catRes.json));

    const list = await api('GET', '/api/audit?entityType=USER&limit=100', { token: main.token });
    assert.equal(list.status, 200, JSON.stringify(list.json));

    const row = list.json.items.find((r) => r.entityId === mainUser.id);
    assert.ok(row, 'a USER_CREATED row exists for the created user');
    assert.equal(row.action, 'USER_CREATED');
    assert.equal(row.entityType, 'USER');
    assert.equal(row.actor.id, main.userId);
    assert.equal(row.actor.name, ownerName);
    assert.equal(row.metadata.role, 'STAFF');
    assert.ok(row.createdAt);

    // DTO hygiene — every row is exactly the whitelist, nothing more.
    for (const item of list.json.items) {
      assert.deepEqual(
        Object.keys(item).sort(),
        ['action', 'actor', 'createdAt', 'entityId', 'entityType', 'id', 'metadata']
      );
      assert.equal(item.passwordHash, undefined);
      assert.equal(item.password, undefined);
      assert.equal(item.userId, undefined);
    }
  });

  it('never leaks another business’s trail and ignores a client businessId', async () => {
    const foreign = await api('POST', '/api/users', {
      token: other.token,
      body: { name: uniqueName('U16'), email: uniqueEmail('u16'), password: PASSWORD, role: 'STAFF' },
    });
    assert.equal(foreign.status, 201, JSON.stringify(foreign.json));
    tracker.trackUser(foreign.json.id);
    foreignUser = foreign.json;

    // main lists with a planted businessId — it is ignored; only own rows return.
    const mainList = await api('GET', `/api/audit?limit=100&businessId=${other.businessId}`, {
      token: main.token,
    });
    assert.equal(mainList.status, 200, JSON.stringify(mainList.json));
    assert.ok(mainList.json.items.some((r) => r.entityId === mainUser.id), 'own trail is present');
    assert.ok(!mainList.json.items.some((r) => r.entityId === foreignUser.id), 'foreign trail never leaks');

    // other sees its own row and not main’s.
    const otherList = await api('GET', '/api/audit?limit=100', { token: other.token });
    assert.equal(otherList.status, 200);
    assert.ok(otherList.json.items.some((r) => r.entityId === foreignUser.id), 'other sees its own row');
    assert.ok(!otherList.json.items.some((r) => r.entityId === mainUser.id), 'and not main’s');
  });

  // ---------------------------------------------------------------------------
  // Filter/pagination counts run in a dedicated business so totals are exact.
  // Seeding below creates 6 rows: 3 USER_CREATED + 1 USER_UPDATED + 2 CATEGORY_CREATED.
  // Phase 26A adds one more row this business always has: SESSION_CREATED, written
  // when the auditor OWNER logged in during before(). So every whole-business
  // total below is 7, and the by-action / by-type totals are unchanged.
  // ---------------------------------------------------------------------------

  it('seeds the auditor business and filters by action and entityType', async () => {
    const s1 = await api('POST', '/api/users', {
      token: auditor.token,
      body: { name: uniqueName('U16'), email: uniqueEmail('u16'), password: PASSWORD, role: 'STAFF' },
    });
    const s2 = await api('POST', '/api/users', {
      token: auditor.token,
      body: { name: uniqueName('U16'), email: uniqueEmail('u16'), password: PASSWORD, role: 'STAFF' },
    });
    const s3 = await api('POST', '/api/users', {
      token: auditor.token,
      body: { name: uniqueName('U16'), email: uniqueEmail('u16'), password: PASSWORD, role: 'STAFF' },
    });
    for (const s of [s1, s2, s3]) {
      assert.equal(s.status, 201, JSON.stringify(s.json));
      tracker.trackUser(s.json.id);
    }

    const upd = await api('PATCH', `/api/users/${s1.json.id}`, {
      token: auditor.token,
      body: { role: 'MANAGER' },
    });
    assert.equal(upd.status, 200, JSON.stringify(upd.json));

    const c1 = await api('POST', '/api/categories', { token: auditor.token, body: { name: uniqueName('CatA') } });
    const c2 = await api('POST', '/api/categories', { token: auditor.token, body: { name: uniqueName('CatB') } });
    assert.equal(c1.status, 201, JSON.stringify(c1.json));
    assert.equal(c2.status, 201, JSON.stringify(c2.json));

    const byAction = await api('GET', '/api/audit?action=USER_CREATED', { token: auditor.token });
    assert.equal(byAction.status, 200);
    assert.equal(byAction.json.total, 3, JSON.stringify(byAction.json));
    assert.ok(byAction.json.items.every((r) => r.action === 'USER_CREATED'));

    const byType = await api('GET', '/api/audit?entityType=CATEGORY', { token: auditor.token });
    assert.equal(byType.status, 200);
    assert.equal(byType.json.total, 2, JSON.stringify(byType.json));
    assert.ok(byType.json.items.every((r) => r.entityType === 'CATEGORY'));

    const both = await api('GET', '/api/audit?action=USER_CREATED&entityType=USER', { token: auditor.token });
    assert.equal(both.status, 200);
    assert.equal(both.json.total, 3);
  });

  it('filters by actor userId and rejects an invalid one (400)', async () => {
    const mine = await api('GET', `/api/audit?userId=${auditor.userId}`, { token: auditor.token });
    assert.equal(mine.status, 200);
    assert.equal(mine.json.total, 7, JSON.stringify(mine.json));

    const nobody = await api('GET', `/api/audit?userId=${other.userId}`, { token: auditor.token });
    assert.equal(nobody.status, 200);
    assert.equal(nobody.json.total, 0, 'a foreign actor id is valid but matches nothing');

    const invalid = await api('GET', '/api/audit?userId=not-an-id', { token: auditor.token });
    assert.equal(invalid.status, 400, JSON.stringify(invalid.json));
    assert.equal(invalid.json.code, 'VALIDATION_ERROR');
    assert.ok(invalid.json.fields.some((f) => f.field === 'userId'));
  });

  it('filters by date range and validates from/to (400 on bad ranges)', async () => {
    const old = await api('GET', '/api/audit?from=2020-01-01T00%3A00%3A00.000Z&to=2020-12-31T23%3A59%3A59.000Z', {
      token: auditor.token,
    });
    assert.equal(old.status, 200);
    assert.equal(old.json.total, 0, 'rows created in 2026 are outside a 2020 range');

    const future = await api('GET', '/api/audit?from=2099-01-01T00%3A00%3A00.000Z', { token: auditor.token });
    assert.equal(future.status, 200);
    assert.equal(future.json.total, 0);

    const all = await api('GET', '/api/audit?from=2020-01-01T00%3A00%3A00.000Z', { token: auditor.token });
    assert.equal(all.status, 200);
    assert.equal(all.json.total, 7);

    const flipped = await api(
      'GET',
      '/api/audit?from=2026-01-01T00%3A00%3A00.000Z&to=2025-01-01T00%3A00%3A00.000Z',
      { token: auditor.token }
    );
    assert.equal(flipped.status, 400, JSON.stringify(flipped.json));
    assert.equal(flipped.json.code, 'VALIDATION_ERROR');
    assert.ok(flipped.json.fields.some((f) => f.field === 'to'));

    const garbage = await api('GET', '/api/audit?from=not-a-date', { token: auditor.token });
    assert.equal(garbage.status, 400);
    assert.equal(garbage.json.code, 'VALIDATION_ERROR');
    assert.ok(garbage.json.fields.some((f) => f.field === 'from'));
  });

  it('rejects unknown action/entityType values and over-long q (400)', async () => {
    const badAction = await api('GET', '/api/audit?action=NOT_A_REAL_ACTION', { token: main.token });
    assert.equal(badAction.status, 400, JSON.stringify(badAction.json));
    assert.equal(badAction.json.code, 'VALIDATION_ERROR');
    assert.ok(badAction.json.fields.some((f) => f.field === 'action'));

    const badType = await api('GET', '/api/audit?entityType=WIDGET', { token: main.token });
    assert.equal(badType.status, 400);
    assert.ok(badType.json.fields.some((f) => f.field === 'entityType'));

    const longQ = await api('GET', `/api/audit?q=${'x'.repeat(200)}`, { token: main.token });
    assert.equal(longQ.status, 400);
    assert.ok(longQ.json.fields.some((f) => f.field === 'q'));
  });

  it('searches actions and entityIds with q', async () => {
    const byId = await api('GET', `/api/audit?q=${mainUser.id}`, { token: main.token });
    assert.equal(byId.status, 200);
    assert.ok(byId.json.items.some((r) => r.entityId === mainUser.id), 'q matches the entityId');

    const byAction = await api('GET', '/api/audit?q=USER_CREATED', { token: auditor.token });
    assert.equal(byAction.status, 200);
    assert.equal(byAction.json.total, 3, JSON.stringify(byAction.json));
    assert.ok(byAction.json.items.every((r) => r.action === 'USER_CREATED'));
  });

  it('paginates newest-first with the standard envelope', async () => {
    const page1 = await api('GET', '/api/audit?limit=2&page=1', { token: auditor.token });
    assert.equal(page1.status, 200, JSON.stringify(page1.json));
    assert.equal(page1.json.total, 7);
    assert.equal(page1.json.items.length, 2);
    assert.equal(page1.json.totalPages, 4);
    assert.equal(page1.json.page, 1);

    const page2 = await api('GET', '/api/audit?limit=2&page=2', { token: auditor.token });
    assert.equal(page2.json.items.length, 2);
    assert.equal(page2.json.page, 2);

    const page3 = await api('GET', '/api/audit?limit=2&page=3', { token: auditor.token });
    assert.equal(page3.json.items.length, 2);
    assert.equal(page3.json.page, 3);

    // The final, short page: 7 rows over pages of 2 leaves exactly one.
    const page4 = await api('GET', '/api/audit?limit=2&page=4', { token: auditor.token });
    assert.equal(page4.json.items.length, 1);
    assert.equal(page4.json.page, 4);

    const seen = [...page1.json.items, ...page2.json.items, ...page3.json.items, ...page4.json.items];
    const created = seen.map((r) => new Date(r.createdAt).getTime());
    for (let i = 1; i < created.length; i++) {
      assert.ok(created[i - 1] >= created[i], 'rows are ordered newest-first');
    }
    assert.equal(new Set(seen.map((r) => r.id)).size, 7, 'all seven rows accounted for, no duplicates');
  });

  it('orders rows that share a createdAt deterministically, newest first', async () => {
    // Rows written inside the same millisecond must still have a stable order,
    // or paging could repeat or skip one. Five rows are stamped with ONE
    // identical createdAt so only the _id tiebreaker can order them.
    const created = [];
    for (let i = 0; i < 5; i += 1) {
      created.push(
        await AuditLog.create({
          businessId: auditor.businessId,
          userId: null,
          action: AUDIT_ACTIONS.CATEGORY_CREATED,
          entityType: AUDIT_ENTITY_TYPES.CATEGORY,
          entityId: `tie-${i}`,
        })
      );
    }
    const ids = created.map((d) => String(d._id));

    // timestamps:true owns createdAt, so the tie is stamped onto the raw
    // collection — every row ends up with the exact same instant.
    const at = new Date();
    await AuditLog.collection.updateMany({ _id: { $in: created.map((d) => d._id) } }, { $set: { createdAt: at } });

    // A from/to pinned to that instant isolates exactly the tied rows.
    const range = `from=${encodeURIComponent(at.toISOString())}&to=${encodeURIComponent(at.toISOString())}`;

    const listed = await api('GET', `/api/audit?${range}&limit=100`, { token: auditor.token });
    assert.equal(listed.status, 200, JSON.stringify(listed.json));
    assert.equal(listed.json.total, 5, 'only the tied rows fall in range');

    const order = listed.json.items.map((r) => r.id);
    assert.deepEqual(order, [...ids].sort().reverse(), 'equal timestamps fall back to _id, newest first');

    // The guarantee that matters: paging over the tie never repeats or drops.
    const paged = [];
    for (const page of [1, 2, 3]) {
      const res = await api('GET', `/api/audit?${range}&limit=2&page=${page}`, { token: auditor.token });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      paged.push(...res.json.items.map((r) => r.id));
    }
    assert.deepEqual(paged, order, 'the paged order matches the single-page order exactly');
    assert.equal(new Set(paged).size, 5, 'every tied row appears exactly once across pages');
  });

  it('returns actor null for system-initiated rows (no userId)', async () => {
    const system = await AuditLog.create({
      businessId: main.businessId,
      userId: null,
      action: AUDIT_ACTIONS.PRODUCT_UPDATED,
      entityType: AUDIT_ENTITY_TYPES.PRODUCT,
      entityId: 'system-import-1',
      metadata: { source: 'import' },
    });
    assert.ok(system._id, 'system row created');

    const list = await api('GET', '/api/audit?entityType=PRODUCT&limit=100', { token: main.token });
    assert.equal(list.status, 200);
    const row = list.json.items.find((r) => r.entityId === 'system-import-1');
    assert.ok(row, 'system row is listed');
    assert.equal(row.actor, null);
    assert.equal(row.metadata.source, 'import');
  });
});
