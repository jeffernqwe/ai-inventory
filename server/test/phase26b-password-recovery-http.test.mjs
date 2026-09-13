// Phase 26B-3 — the password-recovery HTTP surface.
//
// This suite pins the two public routes end to end over the SHIPPED app, and it
// is deliberately paranoid about four things:
//
//   * ENUMERATION RESISTANCE IS AN HTTP PROPERTY, not just a service one. Every
//     outcome a caller can reach — unknown address, known address, disabled user,
//     suspended tenant, missing tenant, successful send, FAILED send — must be
//     indistinguishable from outside. The last of those is the sharp one: the
//     service can only reach the send after it has found a live account, so a
//     503 there would be a known-account-only response. It is answered with the
//     same 202 as everything else and logged server-side instead (decision D1,
//     option B).
//   * NO CREDENTIAL EVER LEAVES. The raw token, the reset URL, the password hash
//     and the new password are each asserted to EXIST somewhere first (in the
//     captured email or in the database) and then asserted absent from every
//     response body, from the audit trail and from the access log — so no case
//     can pass vacuously.
//   * A BAD CONFIRMATION NEVER SPENDS A TOKEN. `confirmPassword` is checked by
//     the validator before the service is called, and the validator does not
//     return it, so there is no variable to forward and no way to burn a valid
//     link by mistyping.
//   * MAIL THAT IS NOT CONFIGURED IS A 503 AND WRITES NOTHING. The service
//     checks configuration before it looks the account up, which is what makes
//     that 503 enumeration-neutral.
//
// The mail layer is replaced by the Phase 26B-1 test fake registered through the
// real provider registry, so no case reaches the network and a whole run sends
// no email.
//
// Registered MIXED in run-tests.mjs: the validators and the rate limiters run
// without a database (validation rejects before any query, and the limiter fires
// before the controller), everything else needs MongoDB.

import 'dotenv/config';

import express from 'express';

import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import {
  startServer,
  makeApi,
  createTracker,
  registerOwner,
  uniqueName,
  uniqueEmail,
  issueSessionToken,
  disconnectDb,
} from './support.mjs';
import { dbSuite, unitSuite } from './testEnv.mjs';
import { readSource } from './sourceFiles.mjs';

import { createApp } from '../src/app.js';
import { createAuthRouter } from '../src/routes/auth.routes.js';
import notFound from '../src/middlewares/notFound.js';
import errorHandler from '../src/middlewares/errorHandler.js';
import requireAuth from '../src/middlewares/authenticate.js';

import User from '../src/models/user.model.ts';
import Business from '../src/models/business.model.ts';
import Session from '../src/models/session.model.ts';
import PasswordResetToken from '../src/models/passwordResetToken.model.ts';
import AuditLog from '../src/models/auditLog.model.ts';

import {
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
} from '../src/utils/validate.js';
import { hashResetToken, INVALID_RESET_TOKEN_CODE } from '../src/services/passwordReset.service.js';

import {
  FAKE_MAIL_PROVIDER,
  registerFakeMailProvider,
  deregisterFakeMailProvider,
  setFakeMailScenario,
  sentMessages,
  clearSentMessages,
  lastSentMessage,
  fakeMailFailure,
  awaitPendingMail,
  pendingMailCount,
  fakeMailGate,
} from './fakes/mailProvider.mjs';

const { dbOk, baseUrl, server } = await startServer();
const api = makeApi(baseUrl);
const tracker = createTracker(dbOk);
const { ObjectId } = mongoose.Types;

const PASSWORD = 'Password123!';
const NEW_PASSWORD = 'NewPassword456!';
const RESET_BASE = 'https://app.inventory-ai.test/reset-password';

// The exact copy the routes answer with. Spelled out here rather than imported,
// so a change to either constant fails this suite instead of silently agreeing
// with itself.
const FORGOT_ACCEPTED =
  'If an account exists for that email, a password reset link has been sent.';
const RESET_COMPLETED = 'Password changed. Please sign in again.';
const RATE_CODE = 'PASSWORD_RESET_RATE_LIMITED';

const MAIL_ENV_KEYS = [
  'MAIL_PROVIDER',
  'RESEND_API_KEY',
  'MAIL_FROM',
  'MAIL_APP_NAME',
  'MAIL_REQUEST_TIMEOUT_MS',
  'PASSWORD_RESET_URL',
];

const MAIL_ENV = {
  MAIL_PROVIDER: FAKE_MAIL_PROVIDER,
  MAIL_FROM: 'Inventory AI <no-reply@inventory-ai.test>',
  MAIL_APP_NAME: 'Inventory AI',
  PASSWORD_RESET_URL: RESET_BASE,
};

let savedMailEnv = new Map();

/** Runs `fn` with exactly the named mail vars set — every other one cleared. */
async function withEnv(vars, fn) {
  const saved = new Map(MAIL_ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of MAIL_ENV_KEYS) {
      if (Object.prototype.hasOwnProperty.call(vars, key) && vars[key] !== undefined) {
        process.env[key] = vars[key];
      } else {
        delete process.env[key];
      }
    }
    return await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/**
 * POSTs to a base URL and keeps the RESPONSE HEADERS, which support.mjs's `api`
 * deliberately drops. Rate-limit assertions need Retry-After.
 */
async function post(base, path, body, { token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json, header: (name) => res.headers.get(name) };
}

const forgot = (email, base = recoveryBase) => post(base, '/api/auth/forgot-password', { email });
const reset = (body, base = recoveryBase) => post(base, '/api/auth/reset-password', body);

/** Asserts a rate-limit block, exactly as Phase 07B's suite does. */
function assertRateLimitBlock(res, code = RATE_CODE) {
  assert.equal(res.status, 429, `expected 429, got ${res.status} ${JSON.stringify(res.json)}`);
  assert.equal(res.json.code, code);
  assert.ok(typeof res.json.error === 'string' && res.json.error.length > 0);
  // A limiter answers directly rather than through errorHandler, so its body is
  // EXACTLY these two keys — no dev-mode stack, no fields.
  assert.deepEqual(Object.keys(res.json).sort(), ['code', 'error']);
  assert.ok(res.header('retry-after'), 'rate-limited responses carry a Retry-After header');
}

/** The RAW token out of the most recent send — the one value that never persists. */
function rawTokenSent() {
  const message = lastSentMessage();
  assert.ok(message, 'precondition: a message reached the transport');
  const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(message.text);
  assert.ok(match, 'the message must carry a token');
  return match[1];
}

const resetUrlSent = () =>
  /https?:\/\/\S*[?&]token=[A-Za-z0-9_-]+/.exec(`${lastSentMessage()?.text ?? ''}`)?.[0];

/** Every token row for a user, oldest first. */
const tokensOf = (userId, filter = {}) =>
  PasswordResetToken.find({ userId, ...filter }).sort({ _id: 1 });

/** Creates a user directly in the database inside `owner`'s business. */
async function makeUser({ status = 'ACTIVE', businessId, email } = {}) {
  const user = await User.create({
    businessId: new ObjectId(businessId ?? owner.businessId),
    name: uniqueName('U26B3'),
    email: email ?? uniqueEmail('u26b3'),
    passwordHash: bcrypt.hashSync(PASSWORD, 10),
    role: 'STAFF',
    status,
  });
  tracker.trackUser(String(user._id));
  return user;
}

async function makeBusiness({ status = 'ACTIVE' } = {}) {
  const business = await Business.create({ name: uniqueName('Biz26B3'), status });
  tracker.trackBusiness(String(business._id));
  return business;
}

/** Issues a link through the real HTTP route and returns the raw token + row. */
async function issueLinkViaHttp(user) {
  clearSentMessages();
  const res = await forgot(user.email);
  assert.equal(res.status, 202, 'precondition: the request route accepted the address');
  const raw = rawTokenSent();
  const row = await PasswordResetToken.findOne({ tokenHash: hashResetToken(raw) });
  assert.ok(row, 'precondition: the issued token has a row');
  return { raw, row };
}

const login = (email, password) =>
  api('POST', '/api/auth/login', { body: { email, password } });

let owner;

/**
 * The base URL every recovery request in this suite is sent to.
 *
 * It is the shipped app (createApp — the same wiring app.js exports) but with the
 * recovery limiters opened wide, because this suite makes far more than the five
 * requests an hour a real account is allowed. The limiters themselves are NOT
 * untested as a result: cases 33 and 34 build their own tightly-limited instances
 * and prove the budget is counted and enforced.
 */
let recoveryBase = null;
let recoveryServer = null;

/** Overrides generous enough that no case here can trip a limiter. */
const UNCAPPED = {
  passwordResetMax: 100000,
  passwordResetIpMax: 100000,
  passwordResetConfirmMax: 100000,
};

/** Starts an app on an ephemeral port and returns a closer. */
async function listen(app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// ===========================================================================
// DB-free: the validators, the route shape and the rate limiters
// ===========================================================================

unitSuite('Phase 26B-3 — recovery payloads and rate limiters (no database)', () => {
  // Mail is cleared for this suite on purpose, and the reason is not tidiness:
  // the service checks mail configuration BEFORE it looks an account up, so with
  // no provider configured every well-formed request terminates at the pre-lookup
  // 503 without a single query. That is what makes these cases genuinely
  // DB-independent — including when a developer's server/.env configures a real
  // provider, which would otherwise turn this suite into an accidental DB test.
  let savedUnitMailEnv = null;
  before(() => {
    savedUnitMailEnv = new Map(MAIL_ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of MAIL_ENV_KEYS) delete process.env[key];
  });
  after(() => {
    for (const [key, value] of savedUnitMailEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  // -------------------------------------------------------------------------
  // Validators. Every case here rejects BEFORE the controller runs, which is why
  // this suite needs no MongoDB: no query is ever reached.
  // -------------------------------------------------------------------------

  it('1. forgot-password accepts only a well-formed address, and normalises it', () => {
    for (const bad of [undefined, null, '', '   ', 42, {}, [], 'not-an-email', 'a@b', '@b.com']) {
      const { problems } = validateForgotPassword({ email: bad });
      assert.deepEqual(
        problems.map((p) => p.field),
        ['email'],
        `email ${JSON.stringify(bad)} must be rejected on the email field alone`
      );
    }

    // Over-long is rejected; the boundary length itself is not.
    const long = `${'a'.repeat(250)}@example.com`;
    assert.equal(validateForgotPassword({ email: long }).problems.length, 1);
    assert.equal(validateForgotPassword({ email: `${'a'.repeat(240)}@example.com` }).problems.length, 0);

    const { problems, email } = validateForgotPassword({ email: '  MiXeD@Example.COM  ' });
    assert.deepEqual(problems, []);
    assert.equal(email, 'mixed@example.com', 'the address is normalised, as login does');

    // Absent body entirely is a validation error, never a crash.
    assert.equal(validateForgotPassword(undefined).problems.length, 1);
  });

  it('2. reset-password bounds the token without format-checking it', () => {
    const base = { newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD };

    for (const bad of [undefined, null, '', '   ', 42, {}, []]) {
      const { problems } = validateResetPassword({ ...base, token: bad });
      assert.deepEqual(
        problems.map((p) => p.field),
        ['token'],
        `token ${JSON.stringify(bad)} must be rejected as a missing token`
      );
    }

    // 257 characters is past the cap; 256 is not. A token that merely LOOKS wrong
    // is not a 400 — it is the service's generic INVALID_RESET_TOKEN.
    assert.equal(validateResetPassword({ ...base, token: 'x'.repeat(257) }).problems.length, 1);
    assert.deepEqual(validateResetPassword({ ...base, token: 'x'.repeat(256) }).problems, []);

    const { problems, token } = validateResetPassword({
      ...base,
      token: '  abcdefghij  ',
    });
    assert.deepEqual(problems, []);
    assert.equal(token, 'abcdefghij', 'the token is trimmed, as the service also does');
  });

  it('3. the password policy is identical to change-password at every boundary', () => {
    const input = (newPassword) => ({ token: 'abc', newPassword, confirmPassword: newPassword });

    // Only the PASSWORD rule is compared: the recovery route adds a
    // confirmPassword rule change-password has no equivalent for, so the shared
    // rule is isolated by field before the two are compared.
    const passwordProblemsOf = (problems) =>
      problems.filter((problem) => problem.field === 'newPassword');

    for (const length of [0, 1, 7, 8, 9, 71, 72, 73]) {
      const candidate = 'p'.repeat(length);
      const mine = passwordProblemsOf(validateResetPassword(input(candidate)).problems);
      // validateChangePassword reports the same rule under `newPassword`, so the
      // two must agree message-for-message. A drift here would mean the recovery
      // route accepts a password the change-password route refuses.
      const theirs = validateChangePassword({
        currentPassword: 'whatever',
        newPassword: candidate,
      });
      assert.deepEqual(mine, theirs, `length ${length} must produce identical problems`);
    }

    // And the rule is reported as newPassword, not password.
    assert.deepEqual(validateResetPassword(input('short')).problems, [
      { field: 'newPassword', message: 'password must be at least 8 characters' },
    ]);
    assert.deepEqual(validateResetPassword(input('p'.repeat(73))).problems, [
      { field: 'newPassword', message: 'password must be at most 72 characters' },
    ]);
  });

  it('4. the confirmation is required, must match, and never reaches the service', () => {
    const withConfirm = (confirmPassword) =>
      validateResetPassword({ token: 'abc', newPassword: NEW_PASSWORD, confirmPassword });

    for (const [value, expected] of [
      [undefined, 'confirmPassword is required'],
      ['', 'confirmPassword is required'],
      [42, 'confirmPassword is required'],
      ['something-else', 'confirmPassword must match newPassword'],
      ['Password123!', 'confirmPassword must match newPassword'],
    ]) {
      const { problems } = withConfirm(value);
      assert.deepEqual(
        problems,
        [{ field: 'confirmPassword', message: expected }],
        `confirmPassword ${JSON.stringify(value)}`
      );
    }

    const result = validateResetPassword({
      token: 'abc',
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    assert.deepEqual(result.problems, []);
    // THE structural half of "confirmPassword never reaches the service": there
    // is no property to pass, so no caller can forward it by mistake.
    assert.equal(
      Object.prototype.hasOwnProperty.call(result, 'confirmPassword'),
      false,
      'the validator must not return confirmPassword'
    );
    assert.deepEqual(Object.keys(result).sort(), ['newPassword', 'problems', 'token']);

    // The other half, and it has to be structural: `resetPassword` destructures
    // the fields it wants, so forwarding an extra KEY would change nothing
    // observable — no response, no stored document, no audit row would differ.
    // The only place the leak can be seen is the call site itself, so the
    // controller's own source is read and required to be ignorant of the field.
    //
    // Comments are stripped first, and that is not a convenience: the function's
    // docstring explains this very rule in prose and therefore names the field
    // while doing so. Only CODE can forward it.
    const controller = readSource(new URL('../src/controllers/passwordReset.controller.js', import.meta.url));
    const code = controller.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    // Positive control for the strip: prose that names the field survives in the
    // raw source, so a strip that silently ate the whole file would show up here
    // rather than as a passing absence check.
    assert.ok(/confirmPassword/.test(controller), 'the docstring explains this rule in prose');
    assert.equal(
      /confirmPassword/.test(code),
      false,
      'the controller CODE must not mention confirmPassword at all'
    );
    const call = /resetPasswordService\(\s*\{([^}]*)\}\s*\)/.exec(code);
    assert.ok(call, 'the controller must call resetPasswordService with an object literal');
    const passed = call[1]
      .split(',')
      .map((pair) => pair.split(':')[0].trim())
      .filter(Boolean)
      .sort();
    assert.deepEqual(passed, ['newPassword', 'token'], 'and pass exactly those two fields');
  });

  it('5. identity fields in the body are inert, not read', () => {
    const { email } = validateForgotPassword({
      email: '  Person@Example.com ',
      userId: 'someone-elses-id',
      businessId: 'someone-elses-business',
      role: 'OWNER',
      status: 'ACTIVE',
    });
    assert.equal(email, 'person@example.com', 'only the email is read');

    const { token, newPassword } = validateResetPassword({
      token: 'abc',
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
      userId: 'someone-elses-id',
      businessId: 'someone-elses-business',
      role: 'OWNER',
      status: 'ACTIVE',
      email: 'someone@example.com',
    });
    assert.equal(token, 'abc');
    assert.equal(newPassword, NEW_PASSWORD);
  });

  // -------------------------------------------------------------------------
  // The route shape: reachable with no token, and POST-only.
  // -------------------------------------------------------------------------

  it('6. both routes are public, POST-only, and carry the expected chain', () => {
    const router = createAuthRouter();
    const routes = router.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
        handlers: layer.route.stack.map((s) => s.handle),
      }));

    const byPath = new Map(routes.map((r) => [r.path, r]));

    const forgotRoute = byPath.get('/forgot-password');
    assert.ok(forgotRoute, '/forgot-password must be registered');
    assert.deepEqual(forgotRoute.methods, ['post'], 'POST only — a GET would put the token in a URL');
    assert.equal(forgotRoute.handlers.length, 3, 'account limiter, IP limiter, controller');
    assert.notEqual(forgotRoute.handlers[0], requireAuth, 'must not require authentication');
    assert.equal(forgotRoute.handlers.includes(requireAuth), false);

    const resetRoute = byPath.get('/reset-password');
    assert.ok(resetRoute, '/reset-password must be registered');
    assert.deepEqual(resetRoute.methods, ['post']);
    assert.equal(resetRoute.handlers.length, 2, 'IP limiter, controller');
    assert.equal(resetRoute.handlers.includes(requireAuth), false);
  });

  // -------------------------------------------------------------------------
  // Rate limiters. Each limiter gets a FRESH router (and therefore a fresh
  // in-memory store), so cases cannot leak budget into one another.
  // -------------------------------------------------------------------------

  function buildApp(limits) {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter({ limits }));
    app.use(notFound);
    app.use(errorHandler);
    return app;
  }

  const startApp = (app) => listen(app);

  // Mail is deliberately unconfigured for this suite (see the before hook), so a
  // well-formed address stops at the service's pre-lookup 503 — no database, no
  // network. A malformed one stops at the validator with a 400. Either way the
  // request REACHED the route, which is what a limiter case needs.
  const BAD_BODY = { email: 'not-an-email' };
  const PROCESSED = 503;

  it('7. a 429 body has exactly { error, code } and a Retry-After header', async () => {
    const app = await startApp(
      buildApp({ passwordResetMax: 2, passwordResetIpMax: 100, passwordResetConfirmMax: 100 })
    );
    try {
      for (let i = 0; i < 2; i += 1) {
        const res = await post(app.base, '/api/auth/forgot-password', BAD_BODY);
        assert.equal(res.status, 400, 'the request is counted even though it was rejected');
      }
      assertRateLimitBlock(await post(app.base, '/api/auth/forgot-password', BAD_BODY));
    } finally {
      await app.close();
    }
  });

  it('8. the account bucket is keyed on the NORMALISED address, and scopes to it', async () => {
    const app = await startApp(
      buildApp({ passwordResetMax: 2, passwordResetIpMax: 1000, passwordResetConfirmMax: 1000 })
    );
    const address = uniqueEmail('Keyed');
    try {
      for (let i = 0; i < 2; i += 1) {
        const res = await post(app.base, '/api/auth/forgot-password', { email: address });
        assert.equal(res.status, PROCESSED, 'precondition: the request was processed');
      }

      // Same address, differently spelled: the same bucket, because the key runs
      // the input through the same normalisation login uses. Casing cannot buy a
      // fresh budget.
      const disguised = await post(app.base, '/api/auth/forgot-password', {
        email: `  ${address.toUpperCase()}  `,
      });
      assertRateLimitBlock(disguised);

      // A DIFFERENT address from the same source is a different bucket, so the
      // per-account limit does not become a per-server one.
      const other = await post(app.base, '/api/auth/forgot-password', {
        email: uniqueEmail('Other'),
      });
      assert.equal(other.status, PROCESSED, 'another address still has its own budget');
      assert.notEqual(other.status, 429);
    } finally {
      await app.close();
    }
  });

  it('9. the per-IP bucket catches addresses rotated from one source', async () => {
    const app = await startApp(
      buildApp({ passwordResetMax: 1000, passwordResetIpMax: 2, passwordResetConfirmMax: 1000 })
    );
    try {
      for (let i = 0; i < 2; i += 1) {
        const res = await post(app.base, '/api/auth/forgot-password', {
          email: uniqueEmail('Rotate'),
        });
        assert.equal(res.status, PROCESSED, 'precondition: the request was processed');
      }
      // A third, never-seen address would have its own account bucket — the IP
      // bucket is what stops the rotation.
      assertRateLimitBlock(
        await post(app.base, '/api/auth/forgot-password', { email: uniqueEmail('Rotate') })
      );
    } finally {
      await app.close();
    }
  });

  it('10. reset-password is limited per source', async () => {
    const app = await startApp(
      buildApp({ passwordResetConfirmMax: 2, passwordResetMax: 1000, passwordResetIpMax: 1000 })
    );
    try {
      for (let i = 0; i < 2; i += 1) {
        const res = await post(app.base, '/api/auth/reset-password', { token: 'nope' });
        assert.equal(res.status, 400);
      }
      assertRateLimitBlock(await post(app.base, '/api/auth/reset-password', { token: 'nope' }));
    } finally {
      await app.close();
    }
  });

  it('11. the two routes are throttled independently of login and register', async () => {
    const app = await startApp(
      buildApp({ passwordResetMax: 1, passwordResetIpMax: 1, passwordResetConfirmMax: 1 })
    );
    try {
      await post(app.base, '/api/auth/forgot-password', BAD_BODY);
      assertRateLimitBlock(await post(app.base, '/api/auth/forgot-password', BAD_BODY));

      // Draining the recovery budget must not touch the login budget: a locked-out
      // user can still sign in with a password they remember.
      const loginRes = await post(app.base, '/api/auth/login', { email: 'x@y.com', password: 'z' });
      assert.notEqual(loginRes.status, 429, 'login has its own budget');
    } finally {
      await app.close();
    }
  });

  it('12. the limiter checks can fail — negative controls', () => {
    const ok = {
      status: 429,
      json: { error: 'slow down', code: RATE_CODE },
      header: () => '60',
    };
    assertRateLimitBlock(ok, RATE_CODE);

    assert.throws(() => assertRateLimitBlock(ok, 'SOMETHING_ELSE'), 'a wrong code must fail');
    assert.throws(
      () => assertRateLimitBlock({ ...ok, status: 200 }),
      'a 200 must not pass as a rate-limit block'
    );
    assert.throws(
      () => assertRateLimitBlock({ ...ok, json: { ...ok.json, stack: 'at x' } }),
      'an extra key must fail — a limiter body carries nothing else'
    );
    assert.throws(
      () => assertRateLimitBlock({ ...ok, header: () => null }),
      'a missing Retry-After must fail'
    );
  });
});

// ===========================================================================
// DB-backed: the routes over the shipped app and a real database
// ===========================================================================

dbSuite('Phase 26B-3 — password recovery over HTTP and a real database', dbOk, () => {
  before(async () => {
    savedMailEnv = new Map(MAIL_ENV_KEYS.map((key) => [key, process.env[key]]));
    Object.assign(process.env, MAIL_ENV);
    registerFakeMailProvider();
    clearSentMessages();
    owner = await registerOwner(api, tracker);

    const recovery = await listen(createApp({ requestLogging: false, authLimits: UNCAPPED }));
    recoveryBase = recovery.base;
    recoveryServer = recovery.close;
  });

  after(async () => {
    setFakeMailScenario(null);
    deregisterFakeMailProvider();
    for (const [key, value] of savedMailEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (recoveryServer) await recoveryServer();
    await tracker.cleanup();
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDb();
  });

  // -------------------------------------------------------------------------
  // The happy path, end to end
  // -------------------------------------------------------------------------

  it('13. forgot-password answers 202 and issues exactly one unused link', async () => {
    const user = await makeUser();
    clearSentMessages();

    const res = await forgot(user.email);

    assert.equal(res.status, 202);
    assert.deepEqual(res.json, { message: FORGOT_ACCEPTED }, 'the body is the constant, and nothing else');
    assert.deepEqual(Object.keys(res.json), ['message']);

    // ★ Phase 28 B1: delivery is DETACHED, so the message's outcome is awaited
    //   explicitly rather than assumed to have settled with the response. The
    //   attempt itself is still recorded synchronously, so `sentMessages()` would
    //   already show it — this makes the result deterministic as well, instead of
    //   restoring synchronous behaviour in production to suit the test.
    await awaitPendingMail();

    const messages = sentMessages();
    assert.equal(messages.length, 1, 'exactly one email');
    assert.equal(messages[0].to, user.email);
    assert.ok(resetUrlSent().startsWith(RESET_BASE), 'the configured base is used');

    const rows = await tokensOf(user._id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].usedAt, null);
    assert.match(rows[0].tokenHash, /^[a-f0-9]{64}$/);
    assert.equal(
      rows[0].tokenHash,
      hashResetToken(rawTokenSent()),
      'the stored value is the hash of the token that was emailed'
    );
    assert.equal(
      JSON.stringify(rows[0].toObject()).includes(rawTokenSent()),
      false,
      'the raw token is never persisted'
    );
  });

  it('14. reset-password spends the link and really changes the password', async () => {
    const user = await makeUser();
    const { raw } = await issueLinkViaHttp(user);

    const res = await reset({ token: raw, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { message: RESET_COMPLETED });
    // Byte-identical to change-password's success message, so the client shows
    // one string whichever route changed the password.
    assert.equal(
      RESET_COMPLETED,
      'Password changed. Please sign in again.',
      'the reset message matches the change-password contract'
    );

    const stored = await User.findById(user._id).select('+passwordHash');
    assert.equal(await bcrypt.compare(NEW_PASSWORD, stored.passwordHash), true);
    assert.equal(await bcrypt.compare(PASSWORD, stored.passwordHash), false);
    assert.ok(stored.passwordChangedAt instanceof Date);

    // And it is the real credential: the old password no longer signs in, the new
    // one does.
    assert.equal((await login(user.email, PASSWORD)).status, 401);
    assert.equal((await login(user.email, NEW_PASSWORD)).status, 200);
  });

  it('15. spending the link ends every session the account had', async () => {
    const user = await makeUser();
    const firstToken = await issueSessionToken(user._id, { deviceLabel: 'phone' });
    const secondToken = await issueSessionToken(user._id, { deviceLabel: 'tablet' });
    assert.equal((await api('GET', '/api/auth/me', { token: firstToken })).status, 200);

    const { raw } = await issueLinkViaHttp(user);
    assert.equal(
      (await reset({ token: raw, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).status,
      200
    );

    // Both tokens are dead, and the session rows say so rather than merely
    // failing the timestamp comparison.
    assert.equal((await api('GET', '/api/auth/me', { token: firstToken })).status, 401);
    assert.equal((await api('GET', '/api/auth/me', { token: secondToken })).status, 401);
    assert.equal(
      await Session.countDocuments({ userId: user._id, revokedAt: null }),
      0,
      'no session may remain open after a reset'
    );
  });

  it('16. the link is single-use, and a second use is refused generically', async () => {
    const user = await makeUser();
    const { raw } = await issueLinkViaHttp(user);
    const body = { token: raw, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD };

    assert.equal((await reset(body)).status, 200);
    const again = await reset(body);

    assert.equal(again.status, 400);
    assert.equal(again.json.code, INVALID_RESET_TOKEN_CODE);
    // The password was not changed twice or reopened: the token is spent.
    const stored = await User.findById(user._id).select('+passwordHash');
    assert.equal(await bcrypt.compare(NEW_PASSWORD, stored.passwordHash), true);
  });

  it('17. completing a reset leaves no other outstanding link', async () => {
    const user = await makeUser();
    const { raw } = await issueLinkViaHttp(user);
    assert.equal(
      (await reset({ token: raw, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).status,
      200
    );
    assert.equal(await PasswordResetToken.countDocuments({ userId: user._id, usedAt: null }), 0);
  });

  // -------------------------------------------------------------------------
  // The confirmation field (decision: checked at the HTTP layer, never persisted)
  // -------------------------------------------------------------------------

  it('18. a mismatched confirmation is a 400 and does NOT spend the token', async () => {
    const user = await makeUser();
    const { raw, row } = await issueLinkViaHttp(user);

    const bad = await reset({
      token: raw,
      newPassword: NEW_PASSWORD,
      confirmPassword: 'TypoPassword999!',
    });

    assert.equal(bad.status, 400);
    assert.equal(bad.json.code, 'VALIDATION_ERROR');
    assert.deepEqual(
      bad.json.fields.map((p) => p.field),
      ['confirmPassword']
    );

    // ★ THE POINT OF CHECKING IT HERE: the token is untouched. A mistyped
    //   confirmation must cost the user a retry, never another email.
    const after = await PasswordResetToken.findById(row._id);
    assert.equal(after.usedAt, null, 'the token must still be unused');
    const stored = await User.findById(user._id).select('+passwordHash');
    assert.equal(await bcrypt.compare(PASSWORD, stored.passwordHash), true, 'password unchanged');

    // And the same link still works once the confirmation is right.
    const good = await reset({
      token: raw,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    assert.equal(good.status, 200, 'the same link works with the correct confirmation');
  });

  it('19. a missing confirmation is a 400 and does not spend the token', async () => {
    const user = await makeUser();
    const { raw, row } = await issueLinkViaHttp(user);

    const res = await reset({ token: raw, newPassword: NEW_PASSWORD });
    assert.equal(res.status, 400);
    assert.deepEqual(
      res.json.fields.map((p) => p.field),
      ['confirmPassword']
    );
    assert.equal((await PasswordResetToken.findById(row._id)).usedAt, null);
  });

  it('20. the confirmation is never persisted anywhere', async () => {
    const user = await makeUser();
    const { raw } = await issueLinkViaHttp(user);
    assert.equal(
      (await reset({ token: raw, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).status,
      200
    );

    // Non-vacuous: the reset really happened, so these collections DO hold this
    // user's documents.
    const stored = await User.findById(user._id).select('+passwordHash +passwordChangedAt');
    assert.ok(stored.passwordChangedAt, 'precondition: the password really changed');

    const db = mongoose.connection.db;
    for (const collection of ['users', 'sessions', 'password_reset_tokens', 'audit_logs']) {
      const docs = await db
        .collection(collection)
        .find(collection === 'users' ? { _id: user._id } : { userId: user._id })
        .toArray();
      for (const doc of docs) {
        const serialized = JSON.stringify(doc);
        assert.equal(
          serialized.includes(NEW_PASSWORD),
          false,
          `${collection} must never carry the plaintext password`
        );
        assert.equal(
          serialized.includes('confirmPassword'),
          false,
          `${collection} must never carry a confirmPassword field`
        );
      }
    }
  });

  // -------------------------------------------------------------------------
  // The body's identity fields are inert end to end
  // -------------------------------------------------------------------------

  it('21. identity fields in the request change nothing', async () => {
    const target = await makeUser();
    const decoy = await makeUser();

    // The same address, once with fabricated identity attached and once without.
    clearSentMessages();
    const clean = await forgot(target.email);

    clearSentMessages();
    const withIdentity = await post(recoveryBase, '/api/auth/forgot-password', {
      email: target.email,
      userId: String(decoy._id),
      businessId: String(decoy.businessId),
      role: 'OWNER',
      status: 'ACTIVE',
    });

    // Indistinguishable: the extra fields are read by nothing.
    assert.equal(withIdentity.status, clean.status);
    assert.deepEqual(withIdentity.json, clean.json);

    // And inert where it would matter most — the account that was served. The
    // link belongs to the ADDRESS in the body; the ids beside it are ignored, so
    // the decoy got nothing and the named `userId` did not become the subject.
    const served = lastSentMessage();
    assert.equal(served.to, target.email, 'the address decides, never a supplied id');
    assert.equal(await PasswordResetToken.countDocuments({ userId: decoy._id }), 0);
    assert.equal(await PasswordResetToken.countDocuments({ userId: target._id, usedAt: null }), 1);

    // The reset route is just as indifferent. A body naming someone else's ids
    // still resets the account the TOKEN belongs to, and no other.
    const link = await issueLinkViaHttp(target);
    const res = await reset({
      token: link.raw,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
      userId: String(decoy._id),
      businessId: String(decoy.businessId),
      role: 'OWNER',
    });
    assert.equal(res.status, 200);
    assert.equal(await PasswordResetToken.countDocuments({ userId: decoy._id }), 0);

    const decoyDoc = await User.findById(decoy._id).select('+passwordHash +role +status');
    assert.equal(await bcrypt.compare(PASSWORD, decoyDoc.passwordHash), true, 'the decoy is untouched');
    assert.equal(decoyDoc.role, 'STAFF', 'and definitely not promoted by a body field');
    assert.equal(decoyDoc.status, 'ACTIVE');
  });

  // -------------------------------------------------------------------------
  // Enumeration resistance at the HTTP layer
  // -------------------------------------------------------------------------

  it('22. a known address, an unknown address and a DISABLED user are identical', async () => {
    const known = await makeUser();
    const disabled = await makeUser({ status: 'DISABLED' });

    const a = await forgot(known.email);
    const b = await forgot(uniqueEmail('nobody-at-all'));
    const c = await forgot(disabled.email);

    assert.equal(a.status, 202);
    assert.equal(b.status, 202);
    assert.equal(c.status, 202);

    // Byte-identical, whole body — not merely the same status code.
    assert.equal(JSON.stringify(b.json), JSON.stringify(a.json));
    assert.equal(JSON.stringify(c.json), JSON.stringify(a.json));

    // The difference is invisible but real: the known address got a link, the
    // other two did not.
    clearSentMessages();
    await forgot(known.email);
    assert.equal(sentMessages().length, 1);
    clearSentMessages();
    await forgot(disabled.email);
    assert.equal(sentMessages().length, 0, 'a disabled account is never mailed');
    assert.equal(
      await PasswordResetToken.countDocuments({ userId: disabled._id }),
      0,
      'and no token is issued for it'
    );
  });

  it('23. a SUSPENDED or missing business is identical to an unknown address', async () => {
    const suspendedBiz = await makeBusiness({ status: 'ACTIVE' });
    const suspended = await makeUser({ businessId: String(suspendedBiz._id) });
    await Business.updateOne({ _id: suspendedBiz._id }, { $set: { status: 'SUSPENDED' } });

    const orphanBiz = await makeBusiness({ status: 'ACTIVE' });
    const orphan = await makeUser({ businessId: String(orphanBiz._id) });
    await Business.deleteOne({ _id: orphanBiz._id });

    const unknown = await forgot(uniqueEmail('nobody'));
    const suspendedRes = await forgot(suspended.email);
    const orphanRes = await forgot(orphan.email);

    assert.equal(suspendedRes.status, 202);
    assert.equal(orphanRes.status, 202);
    assert.equal(JSON.stringify(suspendedRes.json), JSON.stringify(unknown.json));
    assert.equal(JSON.stringify(orphanRes.json), JSON.stringify(unknown.json));

    assert.equal(await PasswordResetToken.countDocuments({ userId: suspended._id }), 0);
    assert.equal(await PasswordResetToken.countDocuments({ userId: orphan._id }), 0);
  });

  it('24. no response from either route ever names an account state', async () => {
    const disabled = await makeUser({ status: 'DISABLED' });
    const banned = ['ACCOUNT_DISABLED', 'BUSINESS_NOT_ACTIVE', 'INVALID_CREDENTIALS', 'SESSION_'];
    const bodies = [];

    bodies.push(await forgot(disabled.email));
    bodies.push(await forgot(uniqueEmail('nobody')));
    bodies.push(await reset({ token: 'not-a-real-token', newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }));
    bodies.push(await reset({ token: '', newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }));

    for (const res of bodies) {
      const serialized = JSON.stringify(res.json);
      for (const needle of banned) {
        assert.equal(
          serialized.includes(needle),
          false,
          `${needle} must never reach a recovery client: ${serialized}`
        );
      }
    }
  });

  // -------------------------------------------------------------------------
  // ★ Decision D1 — a delivery failure is NOT a known-account-only response
  // -------------------------------------------------------------------------

  it('25. a DELIVERY FAILURE on a known account is identical to an unknown address', async () => {
    const known = await makeUser();

    // The transport is made to fail, so the request reaches the send — which the
    // service only does AFTER it has found a live, ACTIVE account in an active
    // business.
    setFakeMailScenario(fakeMailFailure('The email service could not be reached.'));
    try {
      const failed = await forgot(known.email);
      const unknown = await forgot(uniqueEmail('nobody-at-all'));

      // ★ THE INVARIANT. A 503 here would have been reachable only for an address
      //   that exists, i.e. an account-existence oracle.
      assert.equal(failed.status, 202, 'a delivery failure must not be answered with an error');
      assert.equal(failed.status, unknown.status);
      assert.equal(JSON.stringify(failed.json), JSON.stringify(unknown.json));
      assert.equal(JSON.stringify(failed.json), JSON.stringify({ message: FORGOT_ACCEPTED }));

      // Not MAIL_UNAVAILABLE, not any other mail code, and not a `code` at all.
      assert.equal(failed.json.code, undefined);
      assert.equal(JSON.stringify(failed.json).includes('MAIL_'), false);

      // Precondition, so the case cannot pass by never reaching the send: the
      // service had already found the account and written its token.
      assert.equal(
        await PasswordResetToken.countDocuments({ userId: known._id, usedAt: null }),
        1,
        'precondition: the account was found and a token was issued before the send failed'
      );
    } finally {
      setFakeMailScenario(null);
    }
  });

  it('26. the swallowed failure is still observable server-side, and carries no credential', async () => {
    const known = await makeUser();
    const reason = 'The email service rejected the message (HTTP 422, validation_error)';
    setFakeMailScenario(fakeMailFailure(reason));

    const records = [];
    const realError = console.error;
    console.error = (line) => {
      records.push(String(line));
    };
    let res;
    try {
      res = await forgot(known.email);

      // ★ Phase 28 B1: the failure now happens on the DETACHED path, so the log
      //   record it produces lands AFTER the 202. The capture has to stay
      //   installed until that path has settled, or this case would race its own
      //   assertion. See case 39 for the same failure with the ordering and the
      //   no-unhandled-rejection property asserted explicitly.
      await awaitPendingMail();
    } finally {
      console.error = realError;
      setFakeMailScenario(null);
    }

    assert.equal(res.status, 202, 'the caller still learns nothing');

    // The operator does: exactly one structured record, naming the operational
    // reason the client was not told.
    const lines = records
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((record) => record && record.type === 'mail_delivery_failure');

    assert.equal(lines.length, 1, `exactly one delivery-failure record, got ${JSON.stringify(records)}`);
    assert.ok(
      lines[0].message.includes(reason),
      'the record must carry the real reason, or an operator cannot diagnose the outage'
    );
    assert.ok(lines[0].ts, 'and the standard record shape');
    // The route is unauthenticated, so there is no user to name — and the account
    // is not named either, because a log line identifying it would be the oracle
    // the response refuses to be.
    assert.equal(lines[0].userId, undefined);
    assert.equal(lines[0].message.includes(known.email), false, 'no address in the log');

    // Nothing about the failure reached the client, including the reason.
    assert.equal(JSON.stringify(res.json).includes(reason), false);
  });

  // -------------------------------------------------------------------------
  // Mail that is not configured: a 503, and NO write
  // -------------------------------------------------------------------------

  it('27. mail that is not configured is a fixed 503 that writes nothing', async () => {
    const user = await makeUser();

    for (const vars of [
      // No provider at all.
      { PASSWORD_RESET_URL: RESET_BASE },
      // A built-in provider missing its own required configuration.
      { MAIL_PROVIDER: 'resend', MAIL_FROM: 'Inventory AI <no-reply@inventory-ai.test>', PASSWORD_RESET_URL: RESET_BASE },
      // A provider configured, but nowhere to send the user.
      { MAIL_PROVIDER: FAKE_MAIL_PROVIDER, MAIL_FROM: 'x@y.test' },
      // A provider nobody supports.
      { MAIL_PROVIDER: 'postmark', MAIL_FROM: 'x@y.test', PASSWORD_RESET_URL: RESET_BASE },
    ]) {
      clearSentMessages();
      await withEnv(vars, async () => {
        const res = await forgot(user.email);

        assert.equal(res.status, 503, `expected 503 for ${JSON.stringify(vars)}`);
        assert.equal(res.json.code, 'MAIL_NOT_CONFIGURED');
        assert.equal(sentMessages().length, 0);

        // The client copy is FIXED (decision D2b): the mail layer's own message
        // names environment variables and the configured provider, which is
        // operator-facing detail on an unauthenticated endpoint.
        const serialized = JSON.stringify(res.json);
        for (const leak of [
          'MAIL_PROVIDER',
          'MAIL_FROM',
          'RESEND_API_KEY',
          'PASSWORD_RESET_URL',
          'resend',
          'postmark',
          'missing required configuration',
          'is not supported',
        ]) {
          assert.equal(
            serialized.includes(leak),
            false,
            `a 503 must not disclose ${leak}: ${serialized}`
          );
        }
      });

      // ★ The service checks configuration BEFORE it looks the account up, which
      //   is what makes this 503 enumeration-neutral — and it is also why no
      //   token may be created for a link that could never be delivered.
      assert.equal(
        await PasswordResetToken.countDocuments({ userId: user._id }),
        0,
        `no token may be issued while mail is unusable: ${JSON.stringify(vars)}`
      );
      assert.equal(await AuditLog.countDocuments({ userId: user._id }), 0);
    }
  });

  it('28. the 503 is the same for a known and an unknown address', async () => {
    const known = await makeUser();

    const a = await withEnv({ MAIL_PROVIDER: '' }, () => forgot(known.email));
    const b = await withEnv({ MAIL_PROVIDER: '' }, () => forgot(uniqueEmail('nobody')));

    assert.equal(a.status, 503);
    assert.equal(b.status, 503);
    assert.equal(a.json.code, b.json.code);
    assert.equal(a.json.error, b.json.error);
  });

  // -------------------------------------------------------------------------
  // Token rejection stays generic over HTTP
  // -------------------------------------------------------------------------

  it('29. every rejection reason produces one status, code and message', async () => {
    const body = (token) => ({ token, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    // Unknown, blank-ish, and a plausibly-shaped token that never existed.
    const unknown = await reset(body('a'.repeat(43)));
    const garbage = await reset(body('not-a-token'));

    // Already used.
    const used = await makeUser();
    const usedLink = await issueLinkViaHttp(used);
    assert.equal((await reset(body(usedLink.raw))).status, 200);
    const reused = await reset(body(usedLink.raw));

    // Expired: the row exists and is unused, but its window has passed.
    const expiredUser = await makeUser();
    const expiredLink = await issueLinkViaHttp(expiredUser);
    await PasswordResetToken.updateOne(
      { _id: expiredLink.row._id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );
    const expired = await reset(body(expiredLink.raw));

    // A live token whose user was disabled since it was issued.
    const disabledUser = await makeUser();
    const disabledLink = await issueLinkViaHttp(disabledUser);
    await User.updateOne({ _id: disabledUser._id }, { $set: { status: 'DISABLED' } });
    const disabled = await reset(body(disabledLink.raw));

    const all = [unknown, garbage, reused, expired, disabled];
    for (const res of all) {
      assert.equal(res.status, 400);
      assert.equal(res.json.code, INVALID_RESET_TOKEN_CODE);
    }
    // One message for all five: the client cannot tell them apart, so neither can
    // an attacker probing the endpoint.
    const messages = new Set(all.map((res) => res.json.error));
    assert.equal(messages.size, 1, `all five must share one message, got ${[...messages].join(' | ')}`);
    assert.equal([...messages][0].includes('expired'), true, 'and the message stays generic-but-useful');

    // None of them changed a password.
    const stillDisabled = await User.findById(disabledUser._id).select('+passwordHash');
    assert.equal(await bcrypt.compare(PASSWORD, stillDisabled.passwordHash), true);
  });

  // -------------------------------------------------------------------------
  // Secrecy
  // -------------------------------------------------------------------------

  it('30. no response carries the token, the link, a hash or a password', async () => {
    const user = await makeUser();
    const { raw } = await issueLinkViaHttp(user);
    const url = resetUrlSent();

    // Non-vacuous: the token and the link really do exist at this point.
    assert.ok(raw && raw.length >= 40);
    assert.ok(url.startsWith(RESET_BASE) && url.includes(raw));

    const responses = [
      await forgot(user.email),
      await reset({ token: raw, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
      await reset({ token: 'nope', newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
      await reset({ token: raw, newPassword: 'short', confirmPassword: 'short' }),
    ];

    const stored = await User.findById(user._id).select('+passwordHash');
    for (const res of responses) {
      const serialized = JSON.stringify(res.json);
      for (const needle of [raw, url, 'token=', NEW_PASSWORD, stored.passwordHash, '$2a$', '$2b$']) {
        assert.equal(
          serialized.includes(needle),
          false,
          `a response must never carry ${needle.slice(0, 24)}: ${serialized}`
        );
      }
    }
  });

  it('31. the audit trail records the events and no credential', async () => {
    const user = await makeUser();
    const { raw } = await issueLinkViaHttp(user);
    assert.equal(
      (await reset({ token: raw, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).status,
      200
    );

    const actions = (await AuditLog.find({ userId: user._id }).distinct('action')).filter((a) =>
      a.startsWith('PASSWORD_RESET_')
    );
    assert.deepEqual(actions.sort(), ['PASSWORD_RESET_COMPLETED', 'PASSWORD_RESET_REQUESTED']);

    const rows = await AuditLog.find({ userId: user._id });
    const serialized = JSON.stringify(rows.map((row) => row.toObject()));
    for (const needle of [raw, resetUrlSent() ?? 'never', NEW_PASSWORD, 'token=', 'jti']) {
      assert.equal(serialized.includes(needle), false, `the trail must never carry ${needle}`);
    }
    assert.equal(rows.some((row) => 'metadata' in row.toObject() && row.metadata), false);
  });

  it('32. the request log records the path and never the token', async () => {
    const user = await makeUser();
    const { raw } = await issueLinkViaHttp(user);
    assert.ok(raw && raw.length > 20, 'precondition: a real token is in play');

    const app = await listen(createApp({ requestLogging: true, authLimits: UNCAPPED }));
    const base = app.base;

    const lines = [];
    const realLog = console.log;
    console.log = (line) => {
      lines.push(String(line));
    };
    try {
      const res = await post(base, '/api/auth/reset-password', {
        token: raw,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
      assert.equal(res.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 100)); // let 'finish' fire
    } finally {
      console.log = realLog;
      await app.close();
    }

    const httpLines = lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((record) => record && record.type === 'http');

    // Every request-path assertion needs a positive control first.
    assert.ok(
      httpLines.some((r) => r.path === '/api/auth/reset-password' && r.status === 200),
      `the access log must record the request: ${JSON.stringify(lines)}`
    );
    for (const line of lines) {
      assert.equal(line.includes(raw), false, 'the access log must never carry the token');
      assert.equal(line.includes(NEW_PASSWORD), false, 'nor the password');
      assert.equal(line.includes('token='), false);
    }
  });

  // -------------------------------------------------------------------------
  // Rate limiting over the shipped app
  // -------------------------------------------------------------------------

  it('33. a SUCCESSFUL request consumes the recovery budget', async () => {
    // The one behavioural divergence from the login limiter. On login, a 2xx is
    // skipped; here a 2xx must count, because the success path and the silent
    // no-op are deliberately indistinguishable — skipping 2xx would leave the
    // limiter with nothing to count and disable it outright.
    const user = await makeUser();
    const app = await listen(
      createApp({
        requestLogging: false,
        authLimits: { passwordResetMax: 2, passwordResetIpMax: 1000, passwordResetConfirmMax: 1000 },
      })
    );
    const base = app.base;
    try {
      for (let i = 0; i < 2; i += 1) {
        const res = await post(base, '/api/auth/forgot-password', { email: user.email });
        assert.equal(res.status, 202, 'precondition: these attempts SUCCEED');
      }
      assertRateLimitBlock(await post(base, '/api/auth/forgot-password', { email: user.email }));
    } finally {
      await app.close();
    }
  });

  it('34. a SUCCESSFUL reset consumes the confirmation budget', async () => {
    const first = await makeUser();
    const second = await makeUser();
    const firstLink = await issueLinkViaHttp(first);
    const secondLink = await issueLinkViaHttp(second);

    const app = await listen(
      createApp({
        requestLogging: false,
        authLimits: { passwordResetConfirmMax: 1, passwordResetMax: 1000, passwordResetIpMax: 1000 },
      })
    );
    const base = app.base;
    try {
      const ok = await post(base, '/api/auth/reset-password', {
        token: firstLink.raw,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
      assert.equal(ok.status, 200, 'precondition: the first reset SUCCEEDS');

      // A second, entirely valid link from the same source is refused: the
      // successful first attempt spent the budget.
      const blocked = await post(base, '/api/auth/reset-password', {
        token: secondLink.raw,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
      assertRateLimitBlock(blocked);

      // And the second link is untouched — a throttled request must not consume
      // the token it carried.
      assert.equal(
        await PasswordResetToken.countDocuments({ userId: second._id, usedAt: null }),
        1,
        'a rate-limited attempt must not spend the token'
      );
      const stillOld = await User.findById(second._id).select('+passwordHash');
      assert.equal(await bcrypt.compare(PASSWORD, stillOld.passwordHash), true);
    } finally {
      await app.close();
    }
  });

  // -------------------------------------------------------------------------
  // Shape and boundary
  // -------------------------------------------------------------------------

  it('35. the routes answer with no Authorization header and no session', async () => {
    const user = await makeUser();

    // No token, no session, no account relationship to the caller: exactly the
    // case these routes exist for.
    for (const res of [
      await post(recoveryBase, '/api/auth/forgot-password', { email: user.email }),
      await post(recoveryBase, '/api/auth/reset-password', {
        token: 'x'.repeat(43),
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      }),
    ]) {
      assert.notEqual(res.status, 401, 'these routes must never demand a session');
      assert.notEqual(res.status, 403);
    }

    // A GET is not a route at all — the global 404, which carries no `code`.
    const got = await fetch(`${recoveryBase}/api/auth/forgot-password`);
    assert.equal(got.status, 404);
    const body = await got.json();
    assert.equal(body.code, undefined, 'the token must never be accepted from a URL');
  });

  it('36. a 400 carries field problems and a 503 carries none', async () => {
    const validation = await reset({ token: '', newPassword: 'short', confirmPassword: 'nope' });
    assert.equal(validation.status, 400);
    assert.equal(validation.json.code, 'VALIDATION_ERROR');
    assert.deepEqual(
      validation.json.fields.map((p) => p.field).sort(),
      ['confirmPassword', 'newPassword', 'token']
    );

    const unconfigured = await withEnv({ MAIL_PROVIDER: '' }, () => forgot('who@example.com'));
    assert.equal(unconfigured.status, 503);
    assert.equal(unconfigured.json.fields, undefined, 'a 503 exposes no field structure');
  });

  // =========================================================================
  // ★ Phase 28 B1 — delivery is detached from the request path
  //
  // The timing oracle these cases defend against is an OBSERVABLE property, so
  // none of them is asserted statistically: each holds the transport open with
  // `fakeMailGate`, which makes "the response did not wait for delivery" a fact
  // about ordering rather than a measurement. A latency-threshold test would be
  // flaky on a loaded machine and would prove nothing when it passed.
  // =========================================================================

  it('37. the 202 does not wait for the mail transport', async () => {
    const user = await makeUser();
    clearSentMessages();

    const gate = fakeMailGate();
    setFakeMailScenario(gate.scenario);
    try {
      const res = await forgot(user.email);

      // ★ THE INVARIANT. The response has already been received...
      assert.equal(res.status, 202);
      assert.deepEqual(res.json, { message: FORGOT_ACCEPTED });

      // ...while the send it triggered is STILL blocked inside the transport.
      // That the attempt is already recorded is what stops this passing
      // vacuously: it proves the transport was reached, so the case cannot
      // succeed by the send never having been attempted at all.
      assert.equal(sentMessages().length, 1, 'the transport was reached during the request');
      assert.equal(pendingMailCount(), 1, 'and the send has not settled');
    } finally {
      gate.release();
      await awaitPendingMail();
      setFakeMailScenario(null);
    }
  });

  it('38. the detached send still completes exactly once, after release', async () => {
    const user = await makeUser();
    clearSentMessages();

    const gate = fakeMailGate();
    setFakeMailScenario(gate.scenario);
    try {
      const res = await forgot(user.email);
      assert.equal(res.status, 202);

      // The durable half is already committed when the caller is answered — the
      // detach happens strictly after the token and audit writes, which is what
      // makes the order survivable: a process that died on the next line would
      // still have a valid, usable token on disk.
      assert.equal(
        await PasswordResetToken.countDocuments({ userId: user._id, usedAt: null }),
        1,
        'precondition: the token was persisted before the response'
      );
      assert.equal(
        await AuditLog.countDocuments({
          userId: user._id,
          action: 'PASSWORD_RESET_REQUESTED',
        }),
        1,
        'precondition: the audit row was written before the response'
      );

      gate.release();
      await awaitPendingMail();

      assert.equal(sentMessages().length, 1, 'exactly one email — not zero, not two');
      assert.equal(pendingMailCount(), 0, 'and nothing is left in flight');
      // The message is the real one, carrying the token that was persisted.
      assert.ok(resetUrlSent().startsWith(RESET_BASE), 'the configured base is used');
      assert.equal(
        hashResetToken(rawTokenSent()),
        (await PasswordResetToken.findOne({ userId: user._id })).tokenHash,
        'the delivered link carries the token that was stored, as a hash'
      );
    } finally {
      gate.release();
      await awaitPendingMail();
      setFakeMailScenario(null);
    }
  });

  it('39. a detached delivery failure is logged AFTER the response, and never goes unhandled', async () => {
    const user = await makeUser();
    const reason = 'The email service rejected the message (HTTP 503, provider_unavailable)';

    // A gate that FAILS on release, so the ordering is provable: while the send
    // is blocked no failure can have happened yet, so a zero count here is a
    // fact rather than a fast machine.
    const gate = fakeMailGate({ fail: reason });
    setFakeMailScenario(gate.scenario);

    const rejections = [];
    const onRejection = (err) => rejections.push(err);
    process.on('unhandledRejection', onRejection);

    const records = [];
    const realError = console.error;
    console.error = (line) => {
      records.push(String(line));
    };

    const failuresLogged = () =>
      records
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((record) => record && record.type === 'mail_delivery_failure');

    try {
      const res = await forgot(user.email);

      // ★ The caller is answered, uniformly, before the transport has even
      //   resolved its failure — and nothing about it reaches them.
      assert.equal(res.status, 202);
      assert.deepEqual(res.json, { message: FORGOT_ACCEPTED });
      assert.equal(JSON.stringify(res.json).includes(reason), false);
      assert.equal(failuresLogged().length, 0, 'nothing can have failed while the send is blocked');

      gate.release();
      await awaitPendingMail();
      // Extra macrotask turns so an unhandled rejection would be reported before
      // the listener comes off.
      for (let i = 0; i < 3; i += 1) await new Promise((resolve) => setImmediate(resolve));

      // ★ Neither an unhandled rejection nor a crash: the detached promise has a
      //   handler, and this is the assertion that would fail if it lost one.
      assert.deepEqual(rejections, [], 'the detached promise must never reject unhandled');

      const lines = failuresLogged();
      assert.equal(lines.length, 1, `exactly one failure record, got ${JSON.stringify(records)}`);
      assert.ok(lines[0].message.includes(reason), 'the operator gets the real reason');
      assert.ok(lines[0].ts, 'and the standard record shape');
      assert.equal(lines[0].userId, undefined, 'an unauthenticated route names no user');
      assert.equal(lines[0].message.includes(user.email), false, 'and no address');
    } finally {
      gate.release();
      await awaitPendingMail();
      console.error = realError;
      setFakeMailScenario(null);
      process.off('unhandledRejection', onRejection);
    }
  });

  it('40. the delivery call is detached in the source, and no awaited send remains', () => {
    // The structural half of B1, and the one that cannot rot: cases 37-39 prove
    // the behaviour, this pins the mechanism so a later refactor cannot quietly
    // restore `await` and reintroduce the transport term while the behaviour
    // tests continue to pass on a fast local fake.
    const service = readSource(new URL('../src/services/passwordReset.service.js', import.meta.url));
    const controller = readSource(new URL('../src/controllers/passwordReset.controller.js', import.meta.url));

    assert.equal(
      /await\s+sendPasswordResetEmail\s*\(/.test(service),
      false,
      'no awaited delivery may remain in the recovery service'
    );
    assert.match(
      service,
      /sendPasswordResetEmail\(\{[\s\S]*?\}\)\s*\.catch\(/,
      'the detached call must attach a .catch synchronously, or a delivery failure becomes an unhandled rejection'
    );
    assert.match(
      service,
      /\.catch\(logDetachedMailFailure\)/,
      'and the handler must be the one that logs without throwing'
    );

    // The controller keeps its branch — retained as a regression guard, not
    // because it is reachable today. Deleting it is the change this pins against.
    assert.match(
      controller,
      /err instanceof MailDeliveryError/,
      'the controller must keep its delivery-failure guard'
    );
    assert.match(
      controller,
      /logMailFailure\(err, 'mail_delivery_failure'\)/,
      'and the branch must still answer the uniform 202 rather than falling through to a 503'
    );
  });
});
