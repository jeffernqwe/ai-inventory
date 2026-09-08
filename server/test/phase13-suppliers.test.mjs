// Phase 13A — Suppliers (CRUD over /api/suppliers).
//
// DB-backed suite over the real HTTP app. Exercises the generalized reference
// stack with extra fields (contactName/phone/email) via the reference-service
// `fields` option: create/get/list(q, status, pagination)/update/archive/
// restore; the extra contact fields persist and round-trip; validation 400s;
// RBAC (auth required, STAFF cannot manage, MANAGER/OWNER can, reads are open
// to any member); cross-business isolation; ARCHIVED behavior; and that
// archiving then re-creating the same name stays legal (the supplier name index
// is non-unique). Registered as MIXED in run-tests.mjs.
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
  disconnectDb,
} from './support.mjs';
import { dbSuite } from './testEnv.mjs';
import { ROLES } from '../src/constants/roles.js';

const { dbOk, baseUrl, server } = await startServer();
const api = makeApi(baseUrl);
const tracker = createTracker(dbOk);

const supplierUrl = (id) => `/api/suppliers/${id}`;

async function createSupplier(business, over = {}) {
  const res = await api('POST', '/api/suppliers', {
    token: business.token,
    body: { name: uniqueName('S13'), ...over },
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json; // the created supplier DTO
}

let main; // primary fixture business (OWNER)
let other; // isolation victim business (OWNER)
let staffMain; // STAFF inside `main`
let managerMain; // MANAGER inside `main`
let pager; // dedicated business for exact pagination counts

let full; // supplier with every contact field (main)
let archivable; // created then ARCHIVED (main)
let foreignTarget; // supplier owned by `other`

dbSuite('Phase 13A — suppliers CRUD over real HTTP', dbOk, () => {
  before(async () => {
    main = await registerOwner(api, tracker);
    other = await registerOwner(api, tracker);
    pager = await registerOwner(api, tracker);
    staffMain = await makeRoleUser({ role: ROLES.STAFF, businessId: main.businessId }, tracker);
    managerMain = await makeRoleUser({ role: ROLES.MANAGER, businessId: main.businessId }, tracker);
  });

  after(async () => {
    await tracker.cleanup();
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDb();
  });

  it('creates a supplier with optional contact fields and they round-trip', async () => {
    const res = await api('POST', '/api/suppliers', {
      token: main.token,
      body: {
        name: 'Acme Wholesale',
        contactName: 'Jane Doe',
        phone: '+1 555 0100',
        email: 'jane@acme.example.com',
        description: 'Primary distributor',
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    full = res.json;
    assert.equal(full.name, 'Acme Wholesale');
    assert.equal(full.contactName, 'Jane Doe');
    assert.equal(full.phone, '+1 555 0100');
    assert.equal(full.email, 'jane@acme.example.com');
    assert.equal(full.description, 'Primary distributor');
    assert.equal(full.status, 'ACTIVE');
    assert.equal(full.businessId, main.businessId);
    assert.ok(full.createdAt && full.updatedAt);

    const get = await api('GET', supplierUrl(full.id), { token: main.token });
    assert.equal(get.status, 200, JSON.stringify(get.json));
    assert.equal(get.json.contactName, 'Jane Doe');
    assert.equal(get.json.phone, '+1 555 0100');
    assert.equal(get.json.email, 'jane@acme.example.com');
  });

  it('a minimal supplier (name only) is valid and defaults to ACTIVE', async () => {
    const sup = await createSupplier(main);
    assert.equal(sup.name, sup.name);
    assert.equal(sup.contactName, undefined);
    assert.equal(sup.phone, undefined);
    assert.equal(sup.email, undefined);
    assert.equal(sup.description, undefined);
    assert.equal(sup.status, 'ACTIVE');
    assert.equal(sup.businessId, main.businessId);
  });

  it('validates input (missing name, bad email, overlong phone/description)', async () => {
    const noName = await api('POST', '/api/suppliers', { token: main.token, body: { email: 'x@example.com' } });
    assert.equal(noName.status, 400, JSON.stringify(noName.json));
    assert.equal(noName.json.code, 'VALIDATION_ERROR');
    assert.ok(noName.json.fields.some((f) => f.field === 'name'));

    const badEmail = await api('POST', '/api/suppliers', {
      token: main.token,
      body: { name: uniqueName('S13'), email: 'not-an-email' },
    });
    assert.equal(badEmail.status, 400, JSON.stringify(badEmail.json));
    assert.ok(badEmail.json.fields.some((f) => f.field === 'email'));

    const longPhone = await api('POST', '/api/suppliers', {
      token: main.token,
      body: { name: uniqueName('S13'), phone: '1'.repeat(51) },
    });
    assert.equal(longPhone.status, 400, JSON.stringify(longPhone.json));
    assert.ok(longPhone.json.fields.some((f) => f.field === 'phone'));

    const longDesc = await api('POST', '/api/suppliers', {
      token: main.token,
      body: { name: uniqueName('S13'), description: 'x'.repeat(501) },
    });
    assert.equal(longDesc.status, 400, JSON.stringify(longDesc.json));
    assert.ok(longDesc.json.fields.some((f) => f.field === 'description'));
  });

  it('lists suppliers with q, status and pagination', async () => {
    // `pager` is a fresh business so counts are exact.
    const a = await createSupplier(pager, { name: `${uniqueName('S13')} Alpha` });
    const b = await createSupplier(pager, { name: `${uniqueName('S13')} Beta` });
    const c = await createSupplier(pager, { name: `${uniqueName('S13')} Gamma` });

    // Exact-name q narrows to a single supplier.
    const byName = await api('GET', `/api/suppliers?q=${encodeURIComponent(a.name)}`, { token: pager.token });
    assert.equal(byName.status, 200, JSON.stringify(byName.json));
    assert.equal(byName.json.total, 1, JSON.stringify(byName.json));
    assert.equal(byName.json.items[0].id, a.id);

    // Pagination is stable and complete.
    const page1 = await api('GET', '/api/suppliers?limit=2&page=1', { token: pager.token });
    assert.equal(page1.status, 200);
    assert.equal(page1.json.total, 3);
    assert.equal(page1.json.items.length, 2);
    assert.equal(page1.json.totalPages, 2);
    assert.equal(page1.json.page, 1);

    const page2 = await api('GET', '/api/suppliers?limit=2&page=2', { token: pager.token });
    assert.equal(page2.status, 200);
    assert.equal(page2.json.items.length, 1);
    assert.equal(page2.json.page, 2);

    // List is ordered newest-first (createdAt desc) — `c` was created last.
    assert.equal(page1.json.items[0].id, c.id);

    // Every created supplier appears exactly once across the two pages.
    const seen = [...page1.json.items, ...page2.json.items].map((x) => x.id).sort();
    assert.deepEqual(seen, [a.id, b.id, c.id].sort());
  });

  it('archives and restores, filtering by status, and keeps reads available', async () => {
    archivable = await createSupplier(main);

    const arch = await api('POST', `${supplierUrl(archivable.id)}/archive`, { token: main.token });
    assert.equal(arch.status, 200, JSON.stringify(arch.json));
    assert.equal(arch.json.status, 'ARCHIVED');

    const activeList = await api('GET', `/api/suppliers?status=ACTIVE&limit=100`, { token: main.token });
    assert.ok(!activeList.json.items.some((s) => s.id === archivable.id));

    const archivedList = await api('GET', `/api/suppliers?status=ARCHIVED&limit=100`, { token: main.token });
    assert.ok(archivedList.json.items.some((s) => s.id === archivable.id));

    // An archived supplier is still readable by id (and searchable).
    const get = await api('GET', supplierUrl(archivable.id), { token: main.token });
    assert.equal(get.status, 200);
    assert.equal(get.json.status, 'ARCHIVED');

    const rest = await api('POST', `${supplierUrl(archivable.id)}/restore`, { token: main.token });
    assert.equal(rest.status, 200, JSON.stringify(rest.json));
    assert.equal(rest.json.status, 'ACTIVE');
  });

  it('archiving then re-creating the same name stays legal (name index is non-unique)', async () => {
    const first = await createSupplier(main, { name: 'Rename-Me Supplies' });
    const arch = await api('POST', `${supplierUrl(first.id)}/archive`, { token: main.token });
    assert.equal(arch.status, 200);

    // Same name again — must NOT collide.
    const again = await api('POST', '/api/suppliers', {
      token: main.token,
      body: { name: 'Rename-Me Supplies' },
    });
    assert.equal(again.status, 201, JSON.stringify(again.json));
    assert.notEqual(again.json.id, first.id);
  });

  it('updates name and contact fields independently (partial PATCH)', async () => {
    const res = await api('PATCH', supplierUrl(full.id), {
      token: main.token,
      body: { phone: '+1 555 0199' },
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.phone, '+1 555 0199');
    assert.equal(res.json.contactName, 'Jane Doe', 'untouched fields are preserved');
    assert.equal(res.json.name, 'Acme Wholesale');

    const renamed = await api('PATCH', supplierUrl(full.id), {
      token: main.token,
      body: { name: 'Acme Wholesale Co', email: 'orders@acme.example.com' },
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.json.name, 'Acme Wholesale Co');
    assert.equal(renamed.json.email, 'orders@acme.example.com');
    assert.equal(renamed.json.phone, '+1 555 0199');

    // Invalid email on PATCH is rejected.
    const bad = await api('PATCH', supplierUrl(full.id), {
      token: main.token,
      body: { email: 'nope' },
    });
    assert.equal(bad.status, 400);
    assert.ok(bad.json.fields.some((f) => f.field === 'email'));
  });

  it('isolates suppliers across businesses (foreign id is a 404, never a leak)', async () => {
    foreignTarget = await createSupplier(other, { name: `${uniqueName('S13')} of Other` });

    const get = await api('GET', supplierUrl(foreignTarget.id), { token: main.token });
    assert.equal(get.status, 404, JSON.stringify(get.json));
    assert.equal(get.json.code, 'NOT_FOUND');

    const patch = await api('PATCH', supplierUrl(foreignTarget.id), { token: main.token, body: { name: 'hijack' } });
    assert.equal(patch.status, 404);
    assert.equal(patch.json.code, 'NOT_FOUND');

    const arch = await api('POST', `${supplierUrl(foreignTarget.id)}/archive`, { token: main.token });
    assert.equal(arch.status, 404);
    assert.equal(arch.json.code, 'NOT_FOUND');

    // And the foreign supplier is untouched.
    const check = await api('GET', supplierUrl(foreignTarget.id), { token: other.token });
    assert.equal(check.status, 200);
    assert.equal(check.json.status, 'ACTIVE');
    assert.equal(check.json.name, foreignTarget.name);
  });

  it('the SAME name may exist in two different businesses (no global collision)', async () => {
    const shared = uniqueName('S13 Shared');
    const inMain = await api('POST', '/api/suppliers', { token: main.token, body: { name: shared } });
    const inOther = await api('POST', '/api/suppliers', { token: other.token, body: { name: shared } });
    assert.equal(inMain.status, 201, JSON.stringify(inMain.json));
    assert.equal(inOther.status, 201, JSON.stringify(inOther.json));
    assert.notEqual(inMain.json.id, inOther.json.id);
    assert.equal(inMain.json.businessId, main.businessId);
    assert.equal(inOther.json.businessId, other.businessId);
  });

  it('enforces RBAC: auth required, STAFF cannot manage, MANAGER can, reads are open to members', async () => {
    // No token.
    const noToken = await api('POST', '/api/suppliers', { body: { name: uniqueName('S13') } });
    assert.equal(noToken.status, 401);
    assert.equal(noToken.json.code, 'AUTH_REQUIRED');

    // STAFF holds SUPPLIERS_VIEW only — creating/updating needs suppliers.manage.
    const staffCreate = await api('POST', '/api/suppliers', { token: staffMain.token, body: { name: uniqueName('S13') } });
    assert.equal(staffCreate.status, 403, JSON.stringify(staffCreate.json));
    assert.equal(staffCreate.json.code, 'FORBIDDEN');

    const staffPatch = await api('PATCH', supplierUrl(full.id), { token: staffMain.token, body: { phone: 'x' } });
    assert.equal(staffPatch.status, 403);
    assert.equal(staffPatch.json.code, 'FORBIDDEN');

    const staffArchive = await api('POST', `${supplierUrl(full.id)}/archive`, { token: staffMain.token });
    assert.equal(staffArchive.status, 403);
    assert.equal(staffArchive.json.code, 'FORBIDDEN');

    // Reads are open to any authenticated member of the business.
    const staffList = await api('GET', '/api/suppliers?limit=100', { token: staffMain.token });
    assert.equal(staffList.status, 200, JSON.stringify(staffList.json));
    assert.ok(staffList.json.items.some((s) => s.id === full.id));

    // MANAGER may create and update.
    const mgrCreate = await api('POST', '/api/suppliers', {
      token: managerMain.token,
      body: { name: uniqueName('S13'), contactName: 'Mgr Contact', email: 'mgr@example.com' },
    });
    assert.equal(mgrCreate.status, 201, JSON.stringify(mgrCreate.json));
    assert.equal(mgrCreate.json.contactName, 'Mgr Contact');

    const mgrPatch = await api('PATCH', supplierUrl(mgrCreate.json.id), { token: managerMain.token, body: { phone: '+1 800' } });
    assert.equal(mgrPatch.status, 200, JSON.stringify(mgrPatch.json));
    assert.equal(mgrPatch.json.phone, '+1 800');
  });

  it('a malformed supplier id is a 400 INVALID_ID', async () => {
    const res = await api('GET', supplierUrl('not-an-object-id'), { token: main.token });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, 'INVALID_ID');
  });
});
