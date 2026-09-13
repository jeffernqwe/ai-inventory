import 'dotenv/config';

import { it, after } from 'node:test';
import assert from 'node:assert/strict';
import express, { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import authRouter from '../src/routes/auth.routes.js';
import healthRouter from '../src/routes/health.routes.js';
import notFound from '../src/middlewares/notFound.ts';
import errorHandler from '../src/middlewares/errorHandler.ts';
import requireAuth from '../src/middlewares/authenticate.ts';
import { requireRole, requirePermission } from '../src/middlewares/authorize.ts';
import assertBusinessAccess from '../src/utils/businessAccess.ts';
import env from '../src/config/env.ts';
import User from '../src/models/user.model.ts';
import Business from '../src/models/business.model.ts';
import Session from '../src/models/session.model.ts';
import { ensureDb, disconnectDb } from './helpers.mjs';
import { issueSessionToken } from './support.mjs';
import { dbSuite } from './testEnv.mjs';

// ---------------------------------------------------------------------------
// Test app: real shipped routers + middleware, composed over HTTP.
// ---------------------------------------------------------------------------
function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);

  // Demo guarded routes (test-only) exercising the shipped authz middleware.
  const guard = Router();
  guard.get('/whoami', requireAuth, (req, res) => res.json({ user: req.user }));
  guard.get('/owner-only', requireAuth, requireRole('OWNER'), (req, res) =>
    res.json({ ok: true, role: req.user.role })
  );
  guard.get('/products-manage', requireAuth, requirePermission('products.manage'), (req, res) =>
    res.json({ ok: true, role: req.user.role })
  );
  guard.get('/dashboard-view', requireAuth, requirePermission('dashboard.view'), (req, res) =>
    res.json({ ok: true, role: req.user.role })
  );
  guard.get(
    '/business/:businessId/resources',
    requireAuth,
    (req, res) => {
      assertBusinessAccess(req.user, req.params.businessId);
      res.json({ ok: true, businessId: req.user.businessId });
    }
  );
  app.use('/guard', guard);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const dbOk = await ensureDb();
let server = null;
let baseUrl = '';
if (dbOk) {
  server = buildTestApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

let seq = 0;
const createdUserIds = [];
const createdBusinessIds = [];

function uniqueEmail() {
  seq += 1;
  return `p03-${Date.now()}-${seq}@example.com`;
}

async function registerViaHttp({ businessName, name, email, password }) {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ businessName, name, email, password }),
  });
  const json = await res.json();
  if (json?.user?.id) createdUserIds.push(json.user.id);
  if (json?.business?.id) createdBusinessIds.push(json.business.id);
  return { status: res.status, json };
}

async function api(method, path, { token, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function makeDirectUser(role) {
  seq += 1;
  const business = await Business.create({ name: `Direct Biz ${role} ${seq}` });
  createdBusinessIds.push(String(business._id));
  const user = await User.create({
    businessId: business._id,
    name: `Direct ${role}`,
    email: uniqueEmail(),
    passwordHash: bcrypt.hashSync('Password123!', 10),
    role,
    status: 'ACTIVE',
  });
  createdUserIds.push(String(user._id));
  // Phase 26A: a token is only usable while it names a live session row.
  return { business, user, token: await issueSessionToken(user._id) };
}

after(async () => {
  if (dbOk) {
    if (createdUserIds.length) {
      // Phase 26A: sessions are user-owned, so they go with the users. They are
      // removed first — a session row left behind would outlive its user until
      // the TTL index expired it.
      await Session.deleteMany({ userId: { $in: createdUserIds } }).catch(() => {});
      await User.deleteMany({ _id: { $in: createdUserIds } }).catch(() => {});
    }
    if (createdBusinessIds.length) {
      await Business.deleteMany({ _id: { $in: createdBusinessIds } }).catch(() => {});
    }
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectDb();
});

// DB-backed suite: dbSuite fails loudly if MongoDB is unreachable (Phase 07F/M9).
// ---------------------------------------------------------------------------
dbSuite('Phase 03 authentication + authorization (integration)', dbOk, () => {
  it('GET /api/health still works', async () => {
    const { status, json } = await api('GET', '/api/health');
    assert.equal(status, 200);
    assert.equal(json.status, 'ok');
    assert.ok(['connected', 'disconnected'].includes(json.db));
  });

  it('registration creates Business + OWNER and returns a safe public user', async () => {
    const email = uniqueEmail();
    const { status, json } = await registerViaHttp({
      businessName: 'Acme Grocery',
      name: 'Ann Owner',
      email,
      password: 'Password123!',
    });
    assert.equal(status, 201);
    assert.equal(json.user.role, 'OWNER');
    assert.equal(json.user.status, 'ACTIVE');
    assert.equal(json.user.email, email);
    assert.ok(json.user.businessId);
    assert.ok(json.user.id);
    assert.equal(json.business.status, 'ACTIVE');
    assert.equal(json.business.name, 'Acme Grocery');
    assert.equal('passwordHash' in json.user, false);
    assert.equal(JSON.stringify(json).includes('passwordHash'), false);

    const dbUser = await User.findOne({ email }).select('+passwordHash');
    assert.ok(dbUser);
    assert.equal(dbUser.role, 'OWNER');
    assert.equal(dbUser.status, 'ACTIVE');
  });

  it('password is stored hashed (bcrypt) and never equals the raw password', async () => {
    const email = uniqueEmail();
    await registerViaHttp({
      businessName: 'HashCo',
      name: 'Hash Test',
      email,
      password: 'Password123!',
    });
    const dbUser = await User.findOne({ email }).select('+passwordHash');
    assert.ok(dbUser.passwordHash);
    assert.notEqual(dbUser.passwordHash, 'Password123!');
    assert.equal(dbUser.passwordHash.startsWith('$2'), true);
    assert.equal(await bcrypt.compare('Password123!', dbUser.passwordHash), true);
    assert.equal(await bcrypt.compare('WrongPass!', dbUser.passwordHash), false);
  });

  it('successful login returns a verifiable JWT and public user', async () => {
    const email = uniqueEmail();
    await registerViaHttp({
      businessName: 'LoginBiz',
      name: 'Login User',
      email,
      password: 'Password123!',
    });
    const { status, json } = await api('POST', '/api/auth/login', {
      body: { email, password: 'Password123!' },
    });
    assert.equal(status, 200);
    assert.equal(json.tokenType, 'Bearer');
    assert.ok(json.token);
    assert.equal(json.user.email, email);
    assert.equal('passwordHash' in json.user, false);
    const payload = jwt.verify(json.token, env.jwtSecret);
    assert.equal(payload.sub, json.user.id);
  });

  it('login normalizes email case/whitespace', async () => {
    const email = uniqueEmail();
    await registerViaHttp({
      businessName: 'CaseBiz',
      name: 'Case User',
      email,
      password: 'Password123!',
    });
    const { status } = await api('POST', '/api/auth/login', {
      body: { email: `  ${email.toUpperCase()}  `, password: 'Password123!' },
    });
    assert.equal(status, 200);
  });

  it('invalid password / unknown email returns generic 401', async () => {
    const email = uniqueEmail();
    await registerViaHttp({
      businessName: 'LeakBiz',
      name: 'Leak User',
      email,
      password: 'Password123!',
    });
    const bad = await api('POST', '/api/auth/login', {
      body: { email, password: 'WrongPass!' },
    });
    assert.equal(bad.status, 401);
    assert.equal(bad.json.code, 'INVALID_CREDENTIALS');
    assert.equal(bad.json.error, 'Invalid email or password');

    const unknown = await api('POST', '/api/auth/login', {
      body: { email: 'nobody@example.com', password: 'WrongPass!' },
    });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.json.error, 'Invalid email or password');
  });

  it('DISABLED user is rejected at login (403)', async () => {
    const email = uniqueEmail();
    await registerViaHttp({
      businessName: 'DisableBiz',
      name: 'Disable User',
      email,
      password: 'Password123!',
    });
    await User.updateOne({ email }, { status: 'DISABLED' });
    const { status, json } = await api('POST', '/api/auth/login', {
      body: { email, password: 'Password123!' },
    });
    assert.equal(status, 403);
    assert.equal(json.code, 'ACCOUNT_DISABLED');
  });

  it('duplicate registration returns 409 EMAIL_IN_USE', async () => {
    const email = uniqueEmail();
    const first = await registerViaHttp({
      businessName: 'DupBiz',
      name: 'Dup User',
      email,
      password: 'Password123!',
    });
    assert.equal(first.status, 201);
    const second = await registerViaHttp({
      businessName: 'DupBiz 2',
      name: 'Dup User 2',
      email,
      password: 'Password123!',
    });
    assert.equal(second.status, 409);
    assert.equal(second.json.code, 'EMAIL_IN_USE');
  });

  it('registration validates required fields / bad email (400 with fields)', async () => {
    const r1 = await api('POST', '/api/auth/register', { body: { name: 'No Email' } });
    assert.equal(r1.status, 400);
    assert.equal(r1.json.code, 'VALIDATION_ERROR');
    assert.ok(Array.isArray(r1.json.fields));

    const r2 = await api('POST', '/api/auth/register', {
      body: { businessName: 'B', name: 'U', email: 'not-an-email', password: 'Password123!' },
    });
    assert.equal(r2.status, 400);
    assert.ok(r2.json.fields.some((f) => f.field === 'email'));
  });

  it('GET /api/auth/me requires a valid token (missing / invalid / expired / wrong secret)', async () => {
    const missing = await api('GET', '/api/auth/me');
    assert.equal(missing.status, 401);
    assert.equal(missing.json.code, 'AUTH_REQUIRED');

    const invalid = await api('GET', '/api/auth/me', { token: 'not.a.jwt' });
    assert.equal(invalid.status, 401);
    assert.equal(invalid.json.code, 'INVALID_TOKEN');

    const email = uniqueEmail();
    const reg = await registerViaHttp({
      businessName: 'MeBiz',
      name: 'Me User',
      email,
      password: 'Password123!',
    });
    const uid = reg.json.user.id;

    const expired = jwt.sign({ sub: uid, exp: Math.floor(Date.now() / 1000) - 60 }, env.jwtSecret);
    const expiredRes = await api('GET', '/api/auth/me', { token: expired });
    assert.equal(expiredRes.status, 401);

    const wrongSecret = jwt.sign({ sub: uid }, 'this-is-not-the-configured-secret');
    const wrongRes = await api('GET', '/api/auth/me', { token: wrongSecret });
    assert.equal(wrongRes.status, 401);
  });

  it('GET /api/auth/me returns the server-authoritative current user', async () => {
    const email = uniqueEmail();
    const reg = await registerViaHttp({
      businessName: 'Me2Biz',
      name: 'Me2 User',
      email,
      password: 'Password123!',
    });
    const login = await api('POST', '/api/auth/login', {
      body: { email, password: 'Password123!' },
    });
    const { status, json } = await api('GET', '/api/auth/me', { token: login.json.token });
    assert.equal(status, 200);
    assert.equal(json.user.id, reg.json.user.id);
    assert.equal(json.user.businessId, reg.json.user.businessId);
    assert.equal(json.user.role, 'OWNER');
    assert.equal(JSON.stringify(json).includes('passwordHash'), false);
  });

  it('DISABLED user is rejected on a protected route (403)', async () => {
    const email = uniqueEmail();
    await registerViaHttp({
      businessName: 'Dis2Biz',
      name: 'Dis2 User',
      email,
      password: 'Password123!',
    });
    const login = await api('POST', '/api/auth/login', {
      body: { email, password: 'Password123!' },
    });
    await User.updateOne({ email }, { status: 'DISABLED' });
    const { status, json } = await api('GET', '/api/auth/me', { token: login.json.token });
    assert.equal(status, 403);
    assert.equal(json.code, 'ACCOUNT_DISABLED');
  });

  it('role authorization: OWNER vs ADMIN vs MANAGER vs STAFF', async () => {
    const owner = await makeDirectUser('OWNER');
    const admin = await makeDirectUser('ADMIN');
    const manager = await makeDirectUser('MANAGER');
    const staff = await makeDirectUser('STAFF');

    const holder = { OWNER: owner, ADMIN: admin, MANAGER: manager, STAFF: staff };

    for (const [role, expected] of [
      ['OWNER', 200], ['ADMIN', 403], ['MANAGER', 403], ['STAFF', 403],
    ]) {
      const res = await api('GET', '/guard/owner-only', { token: holder[role].token });
      assert.equal(res.status, expected, `owner-only ${role} expected ${expected}`);
    }

    for (const [role, expected] of [
      ['OWNER', 200], ['ADMIN', 200], ['MANAGER', 200], ['STAFF', 403],
    ]) {
      const res = await api('GET', '/guard/products-manage', { token: holder[role].token });
      assert.equal(res.status, expected, `products-manage ${role} expected ${expected}`);
    }

    for (const [role, expected] of [
      ['OWNER', 200], ['ADMIN', 200], ['MANAGER', 200], ['STAFF', 403],
    ]) {
      const res = await api('GET', '/guard/dashboard-view', { token: holder[role].token });
      assert.equal(res.status, expected, `dashboard-view ${role} expected ${expected}`);
    }
  });

  it('business isolation: cross-business access is prevented (403)', async () => {
    const a = await makeDirectUser('OWNER'); // Business A
    const b = await makeDirectUser('OWNER'); // Business B

    const own = await api('GET', `/guard/business/${a.business._id}/resources`, { token: a.token });
    assert.equal(own.status, 200);
    assert.equal(own.json.businessId, String(a.business._id));

    const cross = await api('GET', `/guard/business/${b.business._id}/resources`, { token: a.token });
    assert.equal(cross.status, 403);
    assert.equal(cross.json.code, 'FORBIDDEN_BUSINESS');

    // Client-injected businessId (different from token owner) is never honored.
    const hijack = await api('GET', `/guard/business/${b.business._id}/resources`, {
      token: a.token,
    });
    assert.equal(hijack.status, 403);
  });

  it('unknown routes return the structured 404', async () => {
    const { status, json } = await api('GET', '/api/does-not-exist');
    assert.equal(status, 404);
    assert.equal(json.error, 'Not Found');
  });
});
