// Phase 08A — structured request logging + correlation IDs.
//
// Two layers, tested over the real shipped app (createApp factory):
//   * request/correlation ID middleware: generates a cryptographic id when none
//     is supplied, echoes a SAFE client-supplied id verbatim, replaces unsafe or
//     overlong ids, and returns X-Request-ID on every response (200/404/body
//     errors alike).
//   * structured request + error logging: one JSON line per completed request
//     (requestId, method, path, status, authed userId, duration) and one per
//     server-side error (with requestId + user context). Logs never contain
//     authorization headers, cookies, bodies, query strings or other secrets.
//
// The authenticated-user-in-log case needs a real session, so it is registered
// through dbSuite (fails loudly when MongoDB is unreachable — Phase 07F / M9);
// everything else is DB-free and always runs. Suites that capture the request
// access log start the app with requestLogging enabled; the run-tests runner
// keeps LOG_REQUESTS=0 everywhere else so suites stay quiet.

import 'dotenv/config';

import { it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

import { ensureDb, disconnectDb } from './helpers.mjs';
import { issueSessionToken } from './support.mjs';
import { dbSuite, unitSuite } from './testEnv.mjs';
import { createApp } from '../src/app.ts';
import errorHandler from '../src/middlewares/errorHandler.ts';
import Business from '../src/models/business.model.ts';
import User from '../src/models/user.model.ts';
import Session from '../src/models/session.model.ts';

const dbOk = await ensureDb();

// crypto.randomUUID() produces a v4 UUID — proof the generated id is a fresh,
// cryptographically random value rather than something predictable.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// HTTP + log-capture helpers
// ---------------------------------------------------------------------------
async function startApp(options = {}) {
  const app = createApp(options);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Low-level request: raw string body + arbitrary headers (incl. X-Request-ID). */
async function request(baseUrl, { method = 'GET', path = '/', headers = {}, body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json, header: (name) => res.headers.get(name) };
}

async function waitUntil(fn, { timeoutMs = 2000, stepMs = 10 } = {}) {
  const start = Date.now();
  for (;;) {
    if (fn()) return;
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for the log line');
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

/** Parse a captured console string into an object (or null if not JSON). */
function tryParse(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

const isHttpLog = (raw) => {
  const obj = tryParse(raw);
  return !!obj && obj.type === 'http';
};

/**
 * Run `action` while capturing console.log, and return when the request access
 * log line appears. The 'finish' event is emitted shortly after the response,
 * so we poll rather than assume ordering.
 */
async function captureAccess(action) {
  const calls = [];
  const spy = mock.method(console, 'log', (arg) => calls.push(String(arg)));
  try {
    const res = await action();
    await waitUntil(() => calls.some(isHttpLog));
    const raw = calls.find(isHttpLog);
    return { res, raw, line: tryParse(raw) };
  } finally {
    spy.mock.restore();
  }
}

// ---------------------------------------------------------------------------
// Fake res + error-log capture (unit, no server)
// ---------------------------------------------------------------------------
function fakeRes() {
  return {
    headersSent: false,
    statusCode: 0,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

/** Capture the console.error line errorHandler emits for one call. */
function logLineFor(err, req) {
  let line = '';
  const spy = mock.method(console, 'error', (arg) => {
    if (!line) line = String(arg);
  });
  try {
    const res = fakeRes();
    errorHandler(err, req ?? {}, res, () => {});
    return line;
  } finally {
    spy.mock.restore();
  }
}

// ---------------------------------------------------------------------------
// Seed a real OWNER (ACTIVE business + user) directly for the authenticated log
// context test. DB cleanup happens in the file-level after() below.
// ---------------------------------------------------------------------------
let seq = 0;
const unique = (prefix) => `${prefix}-${Date.now()}-${seq++}`;
const PASSWORD = 'Password123!';
const createdBusinessIds = [];
const createdUserIds = [];
const trackBusiness = (id) => id && createdBusinessIds.push(String(id));
const trackUser = (id) => id && createdUserIds.push(String(id));

async function seedOwner() {
  const business = await Business.create({ name: unique('Biz08A') });
  trackBusiness(business._id);
  const user = await User.create({
    businessId: business._id,
    name: unique('U08A'),
    email: `${unique('p08a')}@example.com`,
    passwordHash: bcrypt.hashSync(PASSWORD, 10),
    role: 'OWNER',
    status: 'ACTIVE',
  });
  trackUser(user._id);
  return {
    userId: String(user._id),
    businessId: String(business._id),
    token: await issueSessionToken(user._id),
  };
}

// ---------------------------------------------------------------------------
// X-Request-ID middleware (all DB-free)
// ---------------------------------------------------------------------------
unitSuite('request/correlation ID middleware (Phase 08A)', () => {
  let baseUrl;
  let stop;
  before(async () => {
    const s = await startApp({ requestLogging: false });
    baseUrl = s.baseUrl;
    stop = s.close;
  });
  after(async () => {
    if (stop) await stop();
  });

  it('generates a fresh cryptographic id when the client sends none', async () => {
    const first = await request(baseUrl, { path: '/api/health' });
    const second = await request(baseUrl, { path: '/api/health' });
    assert.equal(first.status, 200);
    const id1 = first.header('x-request-id');
    const id2 = second.header('x-request-id');
    assert.ok(id1, 'X-Request-ID is present');
    assert.match(id1, UUID_V4, 'generated id is a random v4 UUID');
    assert.ok(id1 !== id2, 'each request gets its own id');
  });

  it('echoes a safe client-supplied request id verbatim', async () => {
    const res = await request(baseUrl, { path: '/api/health', headers: { 'x-request-id': 'client-trace-a1.b2:c3_d4' } });
    assert.equal(res.status, 200);
    assert.equal(res.header('x-request-id'), 'client-trace-a1.b2:c3_d4');
  });

  it('replaces unsafe client-supplied ids and never echoes them', async () => {
    const unsafe = ['<script>alert(1)</script>', 'a/b', 'has space', 'ab,cd'];
    for (const bad of unsafe) {
      const res = await request(baseUrl, { path: '/api/health', headers: { 'x-request-id': bad } });
      assert.equal(res.status, 200);
      const echoed = res.header('x-request-id');
      assert.ok(echoed, 'a replacement id is always returned');
      assert.notEqual(echoed, bad, `unsafe value must be replaced: ${bad}`);
      assert.ok(!echoed.includes(bad), `unsafe value must not be reflected: ${bad}`);
      assert.match(echoed, UUID_V4);
    }
  });

  it('replaces overlong ids (no unbounded client-controlled header echo)', async () => {
    const res = await request(baseUrl, { path: '/api/health', headers: { 'x-request-id': 'A'.repeat(200) } });
    assert.equal(res.status, 200);
    assert.match(res.header('x-request-id'), UUID_V4);
  });

  it('returns X-Request-ID on 404 and body-error responses too', async () => {
    const notFound = await request(baseUrl, { path: '/api/does-not-exist', headers: { 'x-request-id': 'err-404' } });
    assert.equal(notFound.status, 404);
    assert.equal(notFound.header('x-request-id'), 'err-404');

    // Malformed JSON reaches the body parser AFTER the request-id middleware, so
    // even a 400 answered before any route still carries the id (Phase 07C / L2
    // response shape is unchanged).
    const badJson = await request(baseUrl, {
      method: 'POST',
      path: '/api/auth/login',
      body: '{"email":',
      headers: { 'x-request-id': 'err-400' },
    });
    assert.equal(badJson.status, 400);
    assert.equal(badJson.json.code, 'INVALID_JSON');
    assert.equal(badJson.header('x-request-id'), 'err-400');
  });
});

// ---------------------------------------------------------------------------
// Structured per-request access log (DB-free)
// ---------------------------------------------------------------------------
unitSuite('structured request logging — fields and no secrets (Phase 08A)', () => {
  let baseUrl;
  let stop;
  before(async () => {
    const s = await startApp({ requestLogging: true });
    baseUrl = s.baseUrl;
    stop = s.close;
  });
  after(async () => {
    if (stop) await stop();
  });

  it('logs requestId, method, path and status for a completed request', async () => {
    const { line } = await captureAccess(() => request(baseUrl, { path: '/api/health' }));
    assert.equal(line.type, 'http');
    assert.match(line.requestId, UUID_V4);
    assert.equal(line.method, 'GET');
    assert.equal(line.path, '/api/health');
    assert.equal(line.status, 200);
    assert.equal(typeof line.durationMs, 'number');
    assert.equal(line.userId, undefined, 'no user context on an anonymous request');
  });

  it('carries a valid client request id through to the request log (downstream)', async () => {
    const { line } = await captureAccess(() =>
      request(baseUrl, { path: '/api/health', headers: { 'x-request-id': 'downstream-trace-1' } })
    );
    assert.equal(line.requestId, 'downstream-trace-1');
  });

  it('never logs authorization headers, cookies, body content or query strings', async () => {
    const auth = 'Bearer AUTH-SENTINEL-77';
    const cookie = 'session=COOKIE-SENTINEL-9';
    const emailSentinel = 'pii-email-sentinel@example.com';
    const passwordSentinel = 'PWD-SENTINEL-123';
    const querySentinel = 'query-sentinel-42';

    const { raw, line } = await captureAccess(() =>
      request(baseUrl, {
        method: 'POST',
        path: '/?q=query-sentinel-42',
        headers: { authorization: auth, cookie, 'x-request-id': 'no-secrets' },
        body: JSON.stringify({ email: emailSentinel, password: passwordSentinel }),
      })
    );
    assert.equal(line.path, '/', 'query string is never part of the logged path');
    assert.equal(line.status, 404);
    assert.ok(!raw.includes(auth), 'Authorization header is not logged');
    assert.ok(!raw.includes('AUTH-SENTINEL'), 'Bearer token is not logged');
    assert.ok(!raw.includes(cookie), 'cookies are not logged');
    assert.ok(!raw.includes(emailSentinel), 'request body content is not logged');
    assert.ok(!raw.includes(passwordSentinel), 'request body content is not logged');
    assert.ok(!raw.includes(querySentinel), 'query strings are not logged');
  });
});

// ---------------------------------------------------------------------------
// Structured error logging — request id + user context, no secrets (DB-free)
// ---------------------------------------------------------------------------
unitSuite('structured error logging — request + user context (Phase 08A)', () => {
  it('logs a 5xx as one JSON record with requestId, method, path and userId', async () => {
    const raw = logLineFor(new Error('simulated failure'), {
      requestId: 'req-123',
      method: 'POST',
      path: '/api/inventory/stock-out',
      user: { id: 'u-999' },
    });
    const obj = JSON.parse(raw);
    assert.equal(obj.level, 'error');
    assert.equal(obj.type, 'error');
    assert.equal(obj.requestId, 'req-123');
    assert.equal(obj.method, 'POST');
    assert.equal(obj.path, '/api/inventory/stock-out');
    assert.equal(obj.userId, 'u-999');
    assert.ok(obj.message.includes('POST /api/inventory/stock-out'));
    assert.ok(obj.message.includes('user u-999'));
    assert.ok(obj.message.includes('simulated failure'));
  });

  it('logs a database-unavailable error as JSON carrying its request id', async () => {
    const err = new Error('connection refused');
    err.name = 'MongoServerSelectionError';
    const raw = logLineFor(err, { requestId: 'db-trace-7', method: 'GET', path: '/api/products' });
    const obj = JSON.parse(raw);
    assert.equal(obj.type, 'db_error');
    assert.equal(obj.requestId, 'db-trace-7');
    assert.ok(obj.message.includes('database unavailable'));
  });

  it('never echoes authorization headers, cookies or request-body content', async () => {
    const raw = logLineFor(new Error('internal boom'), {
      requestId: 'req-sec',
      method: 'POST',
      path: '/api/auth/login',
      headers: { authorization: 'Bearer LEAK-AUTH-1', cookie: 'session=LEAK-COOKIE' },
      body: { password: 'LEAK-BODY-PWD' },
    });
    assert.ok(!raw.includes('LEAK-AUTH-1'), 'authorization header never reaches the log');
    assert.ok(!raw.includes('LEAK-COOKIE'), 'cookies never reach the log');
    assert.ok(!raw.includes('LEAK-BODY-PWD'), 'request bodies never reach the log');
  });

  it('still falls back to a stable label when no request object exists', async () => {
    const raw = logLineFor(new Error('simulated failure'), {});
    const obj = JSON.parse(raw);
    assert.ok(obj.message.includes('unknown request'));
    assert.ok(obj.message.includes('simulated failure'));
    assert.equal('requestId' in obj, false, 'no requestId field when none exists');
    assert.equal('userId' in obj, false, 'no userId field when unauthenticated');
  });
});

// ---------------------------------------------------------------------------
// Authenticated request logging (real session; needs MongoDB)
// ---------------------------------------------------------------------------
dbSuite('authenticated request logging carries the user id (Phase 08A)', dbOk, () => {
  let baseUrl;
  let stop;
  before(async () => {
    const s = await startApp({ requestLogging: true });
    baseUrl = s.baseUrl;
    stop = s.close;
  });
  after(async () => {
    if (stop) await stop();
  });

  it('logs the authenticated user id together with the request id', async () => {
    const owner = await seedOwner();
    const { line } = await captureAccess(() =>
      request(baseUrl, {
        path: '/api/auth/me',
        headers: { authorization: `Bearer ${owner.token}`, 'x-request-id': 'auth-trace-1' },
      })
    );
    assert.equal(line.requestId, 'auth-trace-1');
    assert.equal(line.userId, owner.userId);
    assert.equal(line.method, 'GET');
    assert.equal(line.path, '/api/auth/me');
    assert.equal(line.status, 200);
  });
});

after(async () => {
  if (dbOk) {
    if (createdBusinessIds.length) {
      await Business.deleteMany({ _id: { $in: createdBusinessIds } }).catch(() => {});
    }
    if (createdUserIds.length) {
      // Phase 26A: sessions carry no businessId, so they are cleared by userId.
      await Session.deleteMany({ userId: { $in: createdUserIds } }).catch(() => {});
      await User.deleteMany({ _id: { $in: createdUserIds } }).catch(() => {});
    }
  }
  await disconnectDb();
});
