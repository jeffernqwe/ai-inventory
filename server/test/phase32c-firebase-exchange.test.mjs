// Phase 32C — the Firebase ID-token exchange and Firebase registration HTTP surface.
//
// This is the phase that makes Firebase a real sign-in path, so the suite is
// organised around the properties that make that safe rather than around the
// routes' happy paths:
//
//   * THE BODY IS NEVER AN IDENTITY. `firebaseUid`, `businessId`, `role`, `email`
//     and `status` in a request body must be inert, and the cases below send all
//     of them at once, pointing at a DIFFERENT user and a DIFFERENT business, and
//     require the resulting session to belong to the token's user in the token's
//     tenant. Phase 32A §19 calls this the mandatory case: without it the central
//     security claim is untested.
//   * THE FIREBASE TOKEN IS NOT THE APPLICATION TOKEN. The response carries an
//     HS256 application JWT naming a session row, and the ID token that was
//     submitted appears nowhere in the response — asserted, not assumed.
//   * EVERY REJECTION IS INDISTINGUISHABLE AND CREATES NOTHING. An expired token
//     and a forged one must answer byte-identical bodies, and no failure path may
//     leave a session behind. Each rejection case asserts the session count for
//     the affected user is unchanged.
//   * THE LIMITER COUNTS SUCCESSES. A successful exchange is a 2xx, so a limiter
//     that skipped successes would exempt exactly the traffic it exists to bound.
//     Proven behaviourally with a narrowly-capped app.
//
// The verifier is the Phase 32B test fake, installed through the REAL seam
// (`setFirebaseIdTokenVerifier`), so the narrowing in `toVerifiedIdentity` — uid
// extraction, email lowercasing, `email_verified` mapping — runs on every case
// here exactly as it does in production. No case reaches the network and no
// Firebase project exists.
//
// Registered MIXED in run-tests.mjs: the validators, the route shape and the
// limiters run without a database; everything else needs MongoDB.

import 'dotenv/config';

import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { ensureDb, disconnectDb } from './helpers.mjs';
import { createTracker, uniqueEmail, uniqueName } from './support.mjs';
import { dbSuite, unitSuite } from './testEnv.mjs';

import { createApp } from '../src/app.ts';
import { createAuthRouter } from '../src/routes/auth.routes.ts';
import requireAuth from '../src/middlewares/authenticate.ts';
import { decodeAccessToken } from '../src/config/jwt.ts';
import { SESSION_ABSOLUTE_CAP_MS } from '../src/services/session.service.ts';
import env from '../src/config/env.ts';
import Business from '../src/models/business.model.ts';
import User from '../src/models/user.model.ts';
import Session from '../src/models/session.model.ts';
import { validateFirebaseExchange, validateFirebaseRegister } from '../src/utils/validate.ts';
import {
  FIREBASE_ACCOUNT_ENV,
  FIREBASE_SERVICE_ACCOUNT_JSON,
} from '../src/config/firebase.ts';
import { resetFirebaseAdminApp } from '../src/services/firebase/adminApp.ts';
import { hasCustomFirebaseIdTokenVerifier } from '../src/services/firebase/tokenVerifier.ts';
import {
  registerFakeFirebaseVerifier,
  deregisterFakeFirebaseVerifier,
  setFakeFirebaseToken,
  setFakeFirebaseFailure,
  verifiedTokens,
  clearVerifiedTokens,
} from './fakes/firebaseVerifier.mjs';

const EXCHANGE = '/api/auth/firebase/exchange';
const REGISTER = '/api/auth/firebase/register';

/** The opaque string this suite submits as an ID token. Never a real one. */
const ID_TOKEN = 'phase32c.fake.id-token-that-the-seam-replaces';

const ALL_FIREBASE_ENV = [FIREBASE_SERVICE_ACCOUNT_JSON, ...FIREBASE_ACCOUNT_ENV];

/**
 * Runs `fn` with no Firebase variables set, restoring the previous environment
 * afterwards. Needed because a developer's own server/.env may configure a real
 * project, and the "not configured" case must not depend on it being absent.
 */
async function withFirebaseUnconfigured(fn) {
  const saved = new Map(ALL_FIREBASE_ENV.map((key) => [key, process.env[key]]));
  try {
    for (const key of ALL_FIREBASE_ENV) delete process.env[key];
    return await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** Every string a JSON response body could carry, for a leak search. */
function bodySurface(json) {
  return JSON.stringify(json ?? null);
}

/** Starts an app on an ephemeral port and returns a closer + a fetch wrapper. */
async function listen(app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    api: async (method, path, { token, body } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (token) headers.authorization = `Bearer ${token}`;
      const res = await fetch(`${base}${path}`, {
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
      return { status: res.status, json, headers: res.headers };
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Limiters opened wide, so no case in the main suites can trip one. */
const UNCAPPED = {
  firebaseExchangeMax: 100000,
  firebaseRegisterMax: 100000,
  registerMax: 100000,
  loginMax: 100000,
  loginIpMax: 100000,
};

// ===========================================================================
// DB-free: the payloads
// ===========================================================================

unitSuite('Phase 32C — Firebase exchange and registration payloads (no database)', () => {
  // -------------------------------------------------------------------------
  // The exchange payload
  // -------------------------------------------------------------------------

  it('requires idToken', () => {
    for (const body of [{}, null, undefined, { idToken: '' }, { idToken: '   ' }]) {
      const { problems } = validateFirebaseExchange(body);
      assert.deepEqual(
        problems.map((p) => p.field),
        ['idToken'],
        `expected an idToken problem for ${JSON.stringify(body)}`
      );
    }
  });

  it('rejects a non-string idToken rather than coercing it', () => {
    for (const bad of [12345, true, { uid: 'x' }, ['a.b.c'], Buffer.from('x')]) {
      const { problems, idToken } = validateFirebaseExchange({ idToken: bad });
      assert.equal(problems.length, 1, `expected a problem for ${typeof bad}`);
      assert.equal(problems[0].field, 'idToken');
      assert.equal(idToken, undefined, 'a rejected token must not be forwarded');
    }
  });

  it('bounds idToken length without checking its shape', () => {
    const long = validateFirebaseExchange({ idToken: 'x'.repeat(4097) });
    assert.equal(long.problems.length, 1, 'past the length bound');
    assert.equal(long.problems[0].field, 'idToken');

    // A token that merely LOOKS wrong is not a validation error: the verifier is
    // the only thing that may decide, and a 400 here would imply the server knows
    // what a real token looks like.
    const odd = validateFirebaseExchange({ idToken: 'not-a-jwt-at-all' });
    assert.deepEqual(odd.problems, []);
    assert.equal(odd.idToken, 'not-a-jwt-at-all');
  });

  it('★ returns ONLY idToken and deviceLabel — no identity field can be forwarded', () => {
    const { problems, ...rest } = validateFirebaseExchange({
      idToken: ID_TOKEN,
      deviceLabel: 'Pixel 7',
      // Every one of these is an identity or authorization input. The validator
      // reads two fields, so there is no variable in the controller holding any
      // of the others to pass by mistake.
      firebaseUid: 'attacker-supplied-uid',
      businessId: '000000000000000000000000',
      role: 'OWNER',
      status: 'ACTIVE',
      email: 'attacker@example.test',
      userId: '000000000000000000000000',
    });

    assert.deepEqual(problems, []);
    assert.deepEqual(Object.keys(rest).sort(), ['deviceLabel', 'idToken']);
    assert.equal(rest.idToken, ID_TOKEN);
    assert.equal(rest.deviceLabel, 'Pixel 7');
  });

  it('passes deviceLabel through unvalidated, matching the login contract', () => {
    // A malformed label must never be able to fail a sign-in — it is cosmetic and
    // normalizeDeviceLabel coerces anything. validateLogin has the same contract.
    for (const label of [undefined, null, 42, {}, [], '']) {
      const { problems, deviceLabel } = validateFirebaseExchange({ idToken: ID_TOKEN, deviceLabel: label });
      assert.deepEqual(problems, [], `expected no problem for ${JSON.stringify(label)}`);
      assert.equal(deviceLabel, label);
    }
  });

  // -------------------------------------------------------------------------
  // The registration payload
  // -------------------------------------------------------------------------

  it('requires idToken and businessName, and bounds both', () => {
    assert.deepEqual(
      validateFirebaseRegister({}).problems.map((p) => p.field),
      ['idToken', 'businessName']
    );
    assert.deepEqual(
      validateFirebaseRegister({ idToken: ID_TOKEN, businessName: 'x'.repeat(101) }).problems.map((p) => p.field),
      ['businessName']
    );
  });

  it('treats name as OPTIONAL, unlike POST /api/auth/register', () => {
    // A provider may supply no display name; the service falls back to the email
    // local-part so the model's required field is always populated.
    for (const name of [undefined, null, '', '   ']) {
      const { problems, name: value } = validateFirebaseRegister({
        idToken: ID_TOKEN,
        businessName: 'Biz',
        name,
      });
      assert.deepEqual(problems, [], `expected no problem for ${JSON.stringify(name)}`);
      assert.equal(value, undefined);
    }
    assert.equal(
      validateFirebaseRegister({ idToken: ID_TOKEN, businessName: 'Biz', name: 'x'.repeat(101) }).problems.length,
      1
    );
  });

  it('★ returns ONLY idToken, businessName and name', () => {
    const { problems, ...rest } = validateFirebaseRegister({
      idToken: ID_TOKEN,
      businessName: 'Attacker Biz',
      firebaseUid: 'attacker-supplied-uid',
      businessId: '000000000000000000000000',
      email: 'attacker@example.test',
      role: 'OWNER',
      status: 'ACTIVE',
    });

    assert.deepEqual(problems, []);
    assert.deepEqual(Object.keys(rest).sort(), ['businessName', 'idToken', 'name']);
    assert.equal(rest.name, undefined, 'no name was sent');
  });

  it('the key-set assertions above can actually fail — negative controls', () => {
    // A guard that cannot be shown to fail is not a guard. The same comparison is
    // driven two-sided here: an ADDED identity key and a MISSING one must each
    // break it, so the assertions above are known to be sensitive to both.
    const expected = ['deviceLabel', 'idToken'];
    const real = { idToken: ID_TOKEN, deviceLabel: undefined };
    assert.deepEqual(Object.keys(real).sort(), expected, 'the real shape matches');

    assert.throws(
      () => assert.deepEqual(Object.keys({ ...real, firebaseUid: 'x' }).sort(), expected),
      'an extra identity key must break the key-set assertion'
    );
    assert.throws(
      () => assert.deepEqual(Object.keys({ idToken: ID_TOKEN }).sort(), expected),
      'a missing key must break it too'
    );
  });
});

// ===========================================================================
// DB-free: the route shape and the limiters
// ===========================================================================

unitSuite('Phase 32C — Firebase route shape and rate limiters (no database)', () => {
  /** The route table of a freshly built auth router, keyed "METHOD /path". */
  function authRoutes(limits) {
    const router = createAuthRouter({ limits });
    const table = new Map();
    for (const layer of router.stack) {
      if (!layer.route) continue;
      for (const method of Object.keys(layer.route.methods)) {
        table.set(`${method.toUpperCase()} ${layer.route.path}`, layer.route.stack.map((s) => s.handle));
      }
    }
    return table;
  }

  it('registers both Firebase routes as POST', () => {
    const table = authRoutes(UNCAPPED);
    assert.ok(table.has(`POST ${'/firebase/exchange'}`), 'exchange must be registered');
    assert.ok(table.has(`POST ${'/firebase/register'}`), 'register must be registered');
    assert.equal(table.has(`GET ${'/firebase/exchange'}`), false, 'POST only');
    assert.equal(table.has(`GET ${'/firebase/register'}`), false, 'POST only');
  });

  it('★ carries NO requireAuth — the caller has no session by definition', () => {
    const table = authRoutes(UNCAPPED);
    for (const path of ['/firebase/exchange', '/firebase/register']) {
      const handlers = table.get(`POST ${path}`);
      assert.equal(handlers.length, 2, `${path} is [limiter, controller]`);
      for (const handler of handlers) {
        assert.notEqual(handler, requireAuth, `${path} must not authenticate`);
      }
    }
    // The comparison is meaningful only because requireAuth IS a distinct
    // function object — asserted so this case cannot pass vacuously.
    const guarded = authRoutes(UNCAPPED).get('GET /me');
    assert.ok(guarded.includes(requireAuth), 'GET /me does carry requireAuth');
  });

  it('★ answers 429 with a fixed body and a Retry-After header', async () => {
    // limit 1, and the first request is deliberately one the CONTROLLER rejects —
    // an empty body is a validation failure, which happens before the service is
    // called. That keeps this case database-free and Firebase-free (nothing here
    // can reach MongoDB or the verifier) while still spending the budget, which is
    // the behaviour under test. A limit of 0 would refuse even the first request,
    // which express-rate-limit warns about and which would prove less.
    const app = await listen(
      createApp({ requestLogging: false, authLimits: { firebaseExchangeMax: 1, firebaseRegisterMax: 1 } })
    );
    try {
      for (const path of [EXCHANGE, REGISTER]) {
        const spent = await app.api('POST', path, { body: {} });
        assert.equal(spent.status, 400, `${path}: a validation failure still spends budget`);
        assert.equal(spent.json.code, 'VALIDATION_ERROR');

        const res = await app.api('POST', path, { body: { idToken: ID_TOKEN } });
        assert.equal(res.status, 429, `${path} must be throttled`);
        assert.deepEqual(res.json, {
          error: 'Too many sign-in attempts. Please wait a moment and try again.',
          code: 'FIREBASE_RATE_LIMITED',
        });
        assert.ok(res.headers.get('retry-after'), `${path} must send Retry-After`);
      }
    } finally {
      await app.close();
    }
  });

  it('the limiter is keyed per IP, not shared with login or recovery', async () => {
    const app = await listen(
      createApp({
        requestLogging: false,
        authLimits: {
          firebaseExchangeMax: 1,
          loginMax: 100000,
          loginIpMax: 100000,
          registerMax: 100000,
        },
      })
    );
    try {
      const spent = await app.api('POST', EXCHANGE, { body: {} });
      assert.equal(spent.status, 400, 'precondition: the exchange budget is now spent');
      const blocked = await app.api('POST', EXCHANGE, { body: { idToken: ID_TOKEN } });
      assert.equal(blocked.status, 429);

      // A separate bucket: exhausting the exchange budget must not throttle the
      // password register route, which is a different operation with its own cap.
      const other = await app.api('POST', '/api/auth/register', { body: {} });
      assert.notEqual(other.status, 429, 'register has its own budget');
      assert.equal(other.status, 400, 'and its own validator');
    } finally {
      await app.close();
    }
  });

  it('★ reports FIREBASE_NOT_CONFIGURED as a 503 without touching the database', async () => {
    // This case is the ONE place in this file that reaches the REAL verifier, so
    // it declares its precondition rather than assuming it: this suite is
    // DB-free and runs before the DB-backed suite installs the fake, and if that
    // ever stopped being true the case would silently test the fake instead of
    // the configuration check. Asserted, so the failure says why.
    assert.equal(
      hasCustomFirebaseIdTokenVerifier(),
      false,
      'this case needs the real verifier: a substituted one never checks configuration'
    );
    // The admin app is memoized per process, so an app built from a developer's
    // own .env would be handed back even with the variables cleared below — and
    // verifying against it would make a real network call to Google.
    await resetFirebaseAdminApp();

    // Reaches the real verifier, which refuses before any query — so this case is
    // genuinely DB-independent, and it stays DB-independent whatever a developer's
    // own .env contains.
    await withFirebaseUnconfigured(async () => {
      const app = await listen(createApp({ requestLogging: false, authLimits: UNCAPPED }));
      try {
        for (const path of [EXCHANGE, REGISTER]) {
          const res = await app.api('POST', path, {
            body: { idToken: ID_TOKEN, businessName: 'Biz' },
          });
          assert.equal(res.status, 503, `${path}: an operator problem is not a caller problem`);
          assert.equal(res.json.code, 'FIREBASE_NOT_CONFIGURED');
          assert.equal(res.json.error, 'Sign-in is temporarily unavailable. Please try again later.');
          // The copy is fixed here, so no environment-variable name, project id or
          // provider detail reaches an unauthenticated caller.
          assert.equal(bodySurface(res.json).includes('FIREBASE_PROJECT_ID'), false);
        }
      } finally {
        await app.close();
      }
    });
  });
});

// ===========================================================================
// DB-backed: the routes over the shipped app and a real database
// ===========================================================================

const dbOk = await ensureDb();

dbSuite('Phase 32C — Firebase exchange and registration over HTTP and a real database', dbOk, () => {
  const tracker = createTracker(dbOk);
  let app = null;

  /** A unique Firebase uid for a case, so parallel files cannot collide. */
  const uid = (prefix = 'p32c') => uniqueName(prefix);

  async function makeBusiness({ status = 'ACTIVE' } = {}) {
    const business = await Business.create({ name: uniqueName('Biz32C'), status });
    tracker.trackBusiness(String(business._id));
    return business;
  }

  /** A MongoDB user, optionally already linked to a Firebase identity. */
  async function makeUser({
    business,
    role = 'STAFF',
    status = 'ACTIVE',
    firebaseUid = null,
    email = null,
    emailVerified = false,
    password = null,
  } = {}) {
    const biz = business ?? (await makeBusiness());
    const user = await User.create({
      businessId: biz._id,
      name: uniqueName('U32C'),
      email: email ?? uniqueEmail('u32c'),
      ...(password ? { passwordHash: bcrypt.hashSync(password, 10) } : {}),
      ...(firebaseUid ? { firebaseUid } : {}),
      emailVerified,
      role,
      status,
    });
    tracker.trackUser(String(user._id));
    return user;
  }

  const activeSessionsOf = (userId) =>
    Session.countDocuments({ userId: new mongoose.Types.ObjectId(String(userId)), revokedAt: null });

  const exchange = (body) => app.api('POST', EXCHANGE, { body });
  const register = (body) => app.api('POST', REGISTER, { body });

  before(async () => {
    registerFakeFirebaseVerifier();
    const started = await listen(createApp({ requestLogging: false, authLimits: UNCAPPED }));
    app = started;
  });

  after(async () => {
    deregisterFakeFirebaseVerifier();
    if (app) await app.close();
    await tracker.cleanup();
    await disconnectDb();
  });

  // -------------------------------------------------------------------------
  // The exchange: the happy path
  // -------------------------------------------------------------------------

  it('1. a valid token for a linked user opens an application session', async () => {
    const id = uid();
    const business = await makeBusiness();
    const user = await makeUser({ business, role: 'OWNER', firebaseUid: id });
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });
    clearVerifiedTokens();

    const res = await exchange({ idToken: ID_TOKEN, deviceLabel: 'Pixel 7' });

    assert.equal(res.status, 200);
    assert.deepEqual(
      Object.keys(res.json).sort(),
      ['expiresIn', 'token', 'tokenType', 'user'],
      'the login envelope, exactly'
    );
    assert.equal(res.json.tokenType, 'Bearer');
    assert.equal(res.json.expiresIn, env.jwtExpiresIn);
    assert.equal(res.json.user.id, String(user._id));
    assert.equal(res.json.user.businessId, String(business._id));
    assert.equal(res.json.user.role, 'OWNER');

    // The verifier saw exactly one token, and it was the one submitted.
    assert.deepEqual(verifiedTokens(), [ID_TOKEN]);
  });

  it('2. ★ the token is an application JWT whose sub and jti name the user and a real session row', async () => {
    const id = uid();
    const business = await makeBusiness();
    const user = await makeUser({ business, firebaseUid: id });
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });

    const before = await activeSessionsOf(user._id);
    const res = await exchange({ idToken: ID_TOKEN, deviceLabel: 'Work laptop' });
    assert.equal(res.status, 200);

    const claims = decodeAccessToken(res.json.token);
    assert.ok(claims, 'the returned token must decode as one of ours');
    assert.equal(claims.sub, String(user._id), 'sub is the MongoDB user');
    assert.ok(claims.jti, 'jti is mandatory (Phase 26A)');
    assert.ok(claims.exp > Math.floor(Date.now() / 1000), 'not already expired');
    // AUTH-02: the token names its issuer/audience.
    assert.equal(claims.iss, env.jwtIssuer);
    assert.equal(claims.aud, env.jwtAudience);

    // The row exists, is open, and carries the SESSION's own 14-day absolute cap
    // (AUTH-02) — NOT the token's ~1-hour `exp`.
    const row = await Session.findOne({ jti: claims.jti });
    assert.ok(row, 'the token must name a session row');
    assert.equal(String(row.userId), String(user._id));
    assert.equal(row.deviceLabel, 'Work laptop', 'the label is stored, normalized');
    assert.equal(row.revokedAt, null);
    const capMs = row.expiresAt.getTime() - row.createdAt.getTime();
    assert.ok(
      Math.abs(capMs - SESSION_ABSOLUTE_CAP_MS) < 60_000,
      `the session carries a ~14-day cap, was ${capMs}ms`
    );
    assert.notEqual(row.expiresAt.getTime(), claims.exp * 1000, 'the session outlives its JWT');
    assert.equal(await activeSessionsOf(user._id), before + 1, 'exactly one session was opened');
  });

  it('3. a session row is written even when no deviceLabel is sent', async () => {
    const id = uid();
    const user = await makeUser({ firebaseUid: id });
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });

    const res = await exchange({ idToken: ID_TOKEN });
    assert.equal(res.status, 200);
    const row = await Session.findOne({ jti: decodeAccessToken(res.json.token).jti });
    assert.equal(row.deviceLabel, 'Unknown device', 'the same default the login path uses');
  });

  it('4. ★ the exchanged token authenticates against existing protected endpoints', async () => {
    const id = uid();
    const user = await makeUser({ role: 'OWNER', firebaseUid: id });
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });

    const exchanged = await exchange({ idToken: ID_TOKEN });
    assert.equal(exchanged.status, 200);
    const token = exchanged.json.token;

    // An authenticated route and a PERMISSION-GATED one. The second is the one
    // that matters: it proves the session this route minted is accepted by the
    // ordinary authorization stack, so the two layers compose rather than merely
    // coexisting.
    const me = await app.api('GET', '/api/auth/me', { token });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.id, String(user._id));

    const products = await app.api('GET', '/api/products', { token });
    assert.notEqual(products.status, 401);
    assert.notEqual(products.status, 403);
    assert.equal(products.status, 200, 'a permission-gated route accepts the exchanged session');
  });

  it('5. ★ the Firebase ID token is never returned as the application token', async () => {
    const id = uid();
    const user = await makeUser({ firebaseUid: id });
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });

    const res = await exchange({ idToken: ID_TOKEN });
    assert.equal(res.status, 200);
    assert.notEqual(res.json.token, ID_TOKEN);
    assert.equal(bodySurface(res.json).includes(ID_TOKEN), false, 'the ID token is nowhere in the response');
    // And the credential that came back is one of OURS: it decodes with our
    // secret. A Firebase token would not.
    assert.ok(decodeAccessToken(res.json.token), 'a token signed by this server');
  });

  it('6. exposes no internal identity fields to the client', async () => {
    const id = uid();
    const user = await makeUser({ firebaseUid: id });
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });

    const res = await exchange({ idToken: ID_TOKEN });
    // Phase 32K adds exactly one key — `authMethods`, the provider-neutral
    // capability the client needs — and this stays an EXACT allowlist so that
    // addition had to be made here deliberately rather than slipping through.
    // The uid itself is still asserted absent by both cases below.
    assert.deepEqual(
      Object.keys(res.json.user).sort(),
      ['authMethods', 'businessId', 'createdAt', 'email', 'id', 'name', 'role', 'status'],
      'the public DTO is a strict allowlist and carries no firebaseUid'
    );
    assert.equal(
      res.json.user.authMethods.password,
      false,
      'and an identity with a uid manages no local password'
    );
    assert.equal(bodySurface(res.json).includes(id), false, 'nor is the uid leaked');
  });

  // -------------------------------------------------------------------------
  // The exchange: rejections, each asserted to create nothing
  // -------------------------------------------------------------------------

  it('7. an invalid token answers 401 and opens no session', async () => {
    const id = uid();
    const user = await makeUser({ firebaseUid: id });
    setFakeFirebaseFailure('auth/argument-error');

    const before = await activeSessionsOf(user._id);
    // Scoped to this case: the fake's record is cumulative across the suite, so
    // the assertion below is about THIS attempt only.
    clearVerifiedTokens();
    const res = await exchange({ idToken: ID_TOKEN });

    assert.equal(res.status, 401);
    assert.equal(res.json.code, 'FIREBASE_TOKEN_INVALID');
    assert.equal(res.json.token, undefined);
    assert.equal(await activeSessionsOf(user._id), before, 'no session was created');
    assert.deepEqual(verifiedTokens(), [ID_TOKEN], 'the attempt reached the verifier');
  });

  it('8. ★ an expired token is indistinguishable from an invalid one, and the reason never leaks', async () => {
    const id = uid();
    await makeUser({ firebaseUid: id });

    setFakeFirebaseFailure('auth/argument-error');
    const invalid = await exchange({ idToken: ID_TOKEN });

    setFakeFirebaseFailure('auth/id-token-expired');
    const expired = await exchange({ idToken: ID_TOKEN });

    assert.equal(expired.status, 401);
    assert.deepEqual(expired.json, invalid.json, 'a caller cannot tell the two apart');
    // The distinguishing detail belongs in the log, not the response. `reason` is
    // the allowlisted SDK class; it must not appear in the body.
    assert.equal(bodySurface(expired.json).includes('expired'), false);
    assert.equal(bodySurface(expired.json).includes('auth/'), false);
  });

  it('9. ★ an unknown uid answers REGISTRATION_REQUIRED, not a 404, and creates nothing', async () => {
    const unknownUid = uid('unknown');
    assert.equal(await User.countDocuments({ firebaseUid: unknownUid }), 0, 'precondition');
    setFakeFirebaseToken({ uid: unknownUid, email: uniqueEmail('ghost'), email_verified: true });

    const res = await exchange({ idToken: ID_TOKEN });

    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'REGISTRATION_REQUIRED');
    assert.equal(res.json.token, undefined);
    assert.equal(await User.countDocuments({ firebaseUid: unknownUid }), 0, 'the exchange creates no user');
  });

  it('10. a DISABLED user answers ACCOUNT_DISABLED with the login message, and opens no session', async () => {
    const id = uid();
    const user = await makeUser({ firebaseUid: id, status: 'DISABLED' });
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });

    const before = await activeSessionsOf(user._id);
    const res = await exchange({ idToken: ID_TOKEN });

    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'ACCOUNT_DISABLED');
    // Identical wording to the password path: a user must not be able to tell
    // which sign-in method their account "has".
    assert.equal(res.json.error, 'This account is disabled. Contact an administrator.');
    assert.equal(await activeSessionsOf(user._id), before, 'no session was created');
  });

  it('11. an inactive business answers BUSINESS_NOT_ACTIVE, exactly as password login does', async () => {
    const id = uid();
    const business = await makeBusiness({ status: 'SUSPENDED' });
    const user = await makeUser({ business, firebaseUid: id, status: 'ACTIVE' });
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });

    const before = await activeSessionsOf(user._id);
    const res = await exchange({ idToken: ID_TOKEN });

    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'BUSINESS_NOT_ACTIVE');
    assert.equal(await activeSessionsOf(user._id), before, 'no session was created');
  });

  it('12. a missing business fails closed with the same code', async () => {
    const id = uid();
    const business = await Business.create({ name: uniqueName('Biz32C') });
    const user = await makeUser({ business, firebaseUid: id });
    await Business.deleteOne({ _id: business._id });
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });

    const res = await exchange({ idToken: ID_TOKEN });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'BUSINESS_NOT_ACTIVE', 'missing and suspended are not distinguished');
  });

  // -------------------------------------------------------------------------
  // ★ The central security case: the body is never an identity
  // -------------------------------------------------------------------------

  it('13. ★★ a body carrying firebaseUid/businessId/role/status/email is entirely inert', async () => {
    // TWO users in TWO different businesses. The token names user A; every
    // identity field in the body points at user B's world. If any of them were
    // read, the session would belong to the wrong principal or the wrong tenant —
    // which is the exact failure this test exists to make impossible.
    const uidA = uid('victim');
    const businessA = await makeBusiness();
    const userA = await makeUser({ business: businessA, role: 'STAFF', firebaseUid: uidA });

    const uidB = uid('attacker');
    const businessB = await makeBusiness();
    const userB = await makeUser({ business: businessB, role: 'OWNER', firebaseUid: uidB, email: uniqueEmail('attacker') });

    setFakeFirebaseToken({ uid: uidA, email: userA.email, email_verified: true });

    const res = await exchange({
      idToken: ID_TOKEN,
      firebaseUid: uidB,
      businessId: String(businessB._id),
      userId: String(userB._id),
      role: 'OWNER',
      status: 'ACTIVE',
      email: userB.email,
    });

    assert.equal(res.status, 200);

    // The session belongs to the TOKEN's user, in the TOKEN's user's tenant.
    const claims = decodeAccessToken(res.json.token);
    assert.equal(claims.sub, String(userA._id), 'the token subject is the verified uid\'s user, not the body\'s');
    assert.equal(res.json.user.id, String(userA._id));
    assert.equal(res.json.user.businessId, String(businessA._id), 'the tenant comes from MongoDB');
    assert.notEqual(res.json.user.businessId, String(businessB._id));

    // ★ The role comes from MongoDB too — userA is STAFF while the body claimed
    //   OWNER, so a body-supplied role would have been visible here.
    assert.equal(res.json.user.role, 'STAFF', 'the role is the stored one, never the body\'s');
    assert.equal(userA.role, 'STAFF', 'precondition: the stored role really is the lower one');

    // And the session row belongs to user A alone.
    const row = await Session.findOne({ jti: claims.jti });
    assert.equal(String(row.userId), String(userA._id));
    assert.equal(await activeSessionsOf(userB._id), 0, 'the other user gained nothing');
  });

  it('14. ★ a body naming another user\'s firebaseUid does not resolve to that user', async () => {
    // The uid in the body is a REAL, LINKED uid — just not the one in the token.
    // A lookup that consulted the body would find user B and succeed as them.
    const uidA = uid('token');
    const userA = await makeUser({ firebaseUid: uidA });

    const uidB = uid('body');
    const userB = await makeUser({ firebaseUid: uidB, role: 'OWNER' });

    setFakeFirebaseToken({ uid: uidA, email: userA.email, email_verified: true });
    const res = await exchange({ idToken: ID_TOKEN, firebaseUid: uidB });

    assert.equal(res.status, 200);
    assert.equal(res.json.user.id, String(userA._id));
    assert.notEqual(res.json.user.id, String(userB._id));
  });

  it('15. the email in the body cannot select the account', async () => {
    // Only the uid is a join key, but an email-keyed lookup would be a plausible
    // "shortcut" — this pins that it was not taken.
    const uidA = uid('a');
    const userA = await makeUser({ firebaseUid: uidA });
    const userB = await makeUser({ role: 'OWNER' });

    setFakeFirebaseToken({ uid: uidA, email: userB.email, email_verified: true });
    const res = await exchange({ idToken: ID_TOKEN, email: userB.email });

    assert.equal(res.status, 200);
    assert.equal(res.json.user.id, String(userA._id), 'the uid decides, not the address');
  });

  it('16. ★ an exchange for one identity leaves every other user\'s sessions untouched', async () => {
    const uidA = uid();
    const userA = await makeUser({ firebaseUid: uidA });
    const userB = await makeUser({ firebaseUid: uid('other') });

    setFakeFirebaseToken({ uid: uidA, email: userA.email, email_verified: true });
    const res = await exchange({ idToken: ID_TOKEN });
    assert.equal(res.status, 200);

    assert.equal(await activeSessionsOf(userA._id), 1);
    assert.equal(await activeSessionsOf(userB._id), 0, 'the other user gained no session');
  });

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  it('17. a verified identity with no tenant gets a business and an OWNER user', async () => {
    const id = uid('new');
    const email = uniqueEmail('firebase');
    setFakeFirebaseToken({ uid: id, email: email.toUpperCase(), email_verified: true });

    const res = await register({ idToken: ID_TOKEN, businessName: 'Fresh Biz', name: 'Fresh Owner' });

    assert.equal(res.status, 201);
    assert.deepEqual(Object.keys(res.json).sort(), ['business', 'user'], 'matching POST /api/auth/register');
    assert.equal(res.json.token, undefined, 'registration issues no token, exactly as the password path does');
    assert.equal(res.json.business.name, 'Fresh Biz');
    assert.equal(res.json.business.status, 'ACTIVE');
    assert.equal(res.json.user.role, 'OWNER');
    assert.equal(res.json.user.status, 'ACTIVE');
    assert.equal(res.json.user.name, 'Fresh Owner');
    // ★ The email is the VERIFIED token's, lowercased — the token sent a
    //   capitalized address and the stored one is normalized.
    assert.equal(res.json.user.email, email.toLowerCase());
    assert.equal(res.json.user.businessId, res.json.business.id);

    tracker.trackBusiness(res.json.business.id);
    tracker.trackUser(res.json.user.id);

    const stored = await User.findById(res.json.user.id);
    assert.equal(stored.firebaseUid, id, 'the uid is the verified one');
    // Phase 16 changed the second half of this claim: the assertion used to read
    // "mirrored (and not enforced)". It is still mirrored here, and it is now
    // ENFORCED at this very route — an unverified identity is refused before any
    // write, so a 201 can only ever carry a verified claim.
    assert.equal(stored.emailVerified, true, 'the claim is mirrored at registration');
    assert.equal(stored.passwordHash, undefined, 'a federated account holds no password hash');
  });

  it('18. ★ registration takes nothing but profile text from the body', async () => {
    const id = uid('inject');
    const other = await makeUser({ role: 'OWNER' });
    setFakeFirebaseToken({ uid: id, email: uniqueEmail('inject'), email_verified: true });

    const res = await register({
      idToken: ID_TOKEN,
      businessName: 'Injected Biz',
      name: 'Injected Owner',
      firebaseUid: 'attacker-uid',
      businessId: String(other.businessId),
      role: 'ADMIN',
      status: 'DISABLED',
      email: other.email,
    });

    assert.equal(res.status, 201);
    tracker.trackBusiness(res.json.business.id);
    tracker.trackUser(res.json.user.id);

    const stored = await User.findById(res.json.user.id);
    assert.equal(stored.firebaseUid, id, 'never the body\'s uid');
    assert.equal(stored.role, 'OWNER', 'never the body\'s role');
    assert.equal(stored.status, 'ACTIVE', 'never the body\'s status');
    assert.equal(String(stored.businessId), res.json.business.id, 'never the body\'s businessId');
    assert.equal(stored.businessId.toString() === String(other.businessId), false);
    assert.notEqual(stored.email, other.email, 'never the body\'s email');
  });

  it('19. an absent name falls back to the email local-part', async () => {
    const id = uid('noname');
    const email = uniqueEmail('fallback');
    const localPart = email.split('@')[0];
    setFakeFirebaseToken({ uid: id, email, email_verified: true });

    const res = await register({ idToken: ID_TOKEN, businessName: 'Fallback Biz' });
    assert.equal(res.status, 201, 'the model\'s required name is always populated');
    tracker.trackBusiness(res.json.business.id);
    tracker.trackUser(res.json.user.id);
    assert.equal(res.json.user.name, localPart);
  });

  it('20. an identity with no email address cannot register, and writes nothing', async () => {
    const id = uid('noemail');
    const businessName = uniqueName('NoEmailBiz');
    setFakeFirebaseToken({ uid: id, email_verified: false });

    const res = await register({ idToken: ID_TOKEN, businessName, name: 'X' });

    assert.equal(res.status, 400);
    assert.equal(res.json.code, 'VALIDATION_ERROR');
    assert.deepEqual(res.json.fields.map((f) => f.field), ['idToken']);
    assert.equal(await User.countDocuments({ firebaseUid: id }), 0);
    assert.equal(
      await Business.countDocuments({ name: businessName }),
      0,
      'no business was left behind'
    );
  });

  it('21. ★ a duplicate email is refused and leaves NO business behind', async () => {
    const existing = await makeUser({ role: 'OWNER' });
    const id = uid('dup');
    const businessName = uniqueName('CollisionBiz');
    setFakeFirebaseToken({ uid: id, email: existing.email, email_verified: true });

    const res = await register({ idToken: ID_TOKEN, businessName, name: 'X' });

    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'EMAIL_IN_USE');
    assert.equal(res.json.error, 'An account with this email already exists');
    assert.equal(await User.countDocuments({ firebaseUid: id }), 0);
    // Scoped to THIS case's name rather than a global count: `node --test` runs
    // each file in its own process, so a total is moved by a neighbouring file's
    // cleanup as well as by an orphan of our own — an unscoped baseline is not a
    // stable one, and the down-by-one failure that produced was a neighbour's.
    assert.equal(
      await Business.countDocuments({ name: businessName }),
      0,
      'the business was rolled back'
    );
  });

  it('22. ★ an unregistered identity answers REGISTRATION_REQUIRED, and registering adopts it', async () => {
    // The orphan path (Phase 32A §8.2): the exchange refuses a valid identity with
    // no record, so a user whose first signup failed simply retries and the orphan
    // is adopted. Both halves are exercised here, in order, for one identity.
    const id = uid('orphan');
    const email = uniqueEmail('orphan');
    setFakeFirebaseToken({ uid: id, email, email_verified: true });

    const early = await exchange({ idToken: ID_TOKEN });
    assert.equal(early.status, 403, 'precondition: nothing is registered yet');
    assert.equal(early.json.code, 'REGISTRATION_REQUIRED');

    const registered = await register({ idToken: ID_TOKEN, businessName: 'Orphan Biz', name: 'Orphan' });
    assert.equal(registered.status, 201);
    tracker.trackBusiness(registered.json.business.id);
    tracker.trackUser(registered.json.user.id);

    const adopted = await exchange({ idToken: ID_TOKEN, deviceLabel: 'Retry' });
    assert.equal(adopted.status, 200, 'the same identity now exchanges');
    assert.equal(adopted.json.user.id, registered.json.user.id);
  });

  it('23. ★ a uid already linked to a user is a hard error, and rolls the business back', async () => {
    // Phase 32A §7.4: the unique index rejects the write and this must never be
    // auto-resolved or reported as the ordinary EMAIL_IN_USE — it is the signature
    // of a compromised or misconfigured mapping.
    const id = uid('linked');
    const linked = await makeUser({ firebaseUid: id, email: uniqueEmail('first') });
    const businessName = uniqueName('SecondBiz');

    // The SAME uid, a DIFFERENT email, so the email pre-check passes and the
    // collision can only be detected by the index.
    setFakeFirebaseToken({ uid: id, email: uniqueEmail('second'), email_verified: true });

    const res = await register({ idToken: ID_TOKEN, businessName, name: 'X' });

    assert.equal(res.status, 500, 'a hard error, not a client-handleable conflict');
    assert.equal(res.json.code, undefined, 'and it carries no code, so no client branches on it');
    assert.equal(bodySurface(res.json).includes(id), false, 'the uid is not echoed to the caller');
    assert.equal(
      await Business.countDocuments({ name: businessName }),
      0,
      'the new business was rolled back'
    );
    // The original link is untouched.
    const stillThere = await User.findById(linked._id);
    assert.equal(stillThere.firebaseUid, id);
    assert.equal(await User.countDocuments({ firebaseUid: id }), 1);
  });

  it('24. registration and exchange write no inventory, product or ledger data', async () => {
    const id = uid('quiet');
    setFakeFirebaseToken({ uid: id, email: uniqueEmail('quiet'), email_verified: true });
    const res = await register({ idToken: ID_TOKEN, businessName: 'Quiet Biz', name: 'Q' });
    assert.equal(res.status, 201);
    tracker.trackBusiness(res.json.business.id);
    tracker.trackUser(res.json.user.id);

    const db = mongoose.connection.db;
    const businessId = new mongoose.Types.ObjectId(res.json.business.id);
    for (const collection of ['products', 'inventory', 'inventory_transactions']) {
      assert.equal(
        await db.collection(collection).countDocuments({ businessId }),
        0,
        `${collection} must be untouched by authentication`
      );
    }
    // The ONE row a registration legitimately writes is the user's own.
    assert.equal(await User.countDocuments({ businessId }), 1);
  });

  // -------------------------------------------------------------------------
  // The limiter, behaviourally
  // -------------------------------------------------------------------------

  it('25. ★ the exchange limiter counts SUCCESSFUL exchanges', async () => {
    // The property the omitted `skipSuccessfulRequests` guarantees. limit 3, three
    // real 2xx exchanges, then a fourth is refused — so the budget was spent by
    // traffic the limiter exists to bound, not by failures.
    const capped = await listen(
      createApp({ requestLogging: false, authLimits: { ...UNCAPPED, firebaseExchangeMax: 3 } })
    );
    try {
      const id = uid('capped');
      const user = await makeUser({ firebaseUid: id });
      setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });

      for (let i = 1; i <= 3; i += 1) {
        const ok = await capped.api('POST', EXCHANGE, { body: { idToken: ID_TOKEN } });
        assert.equal(ok.status, 200, `exchange ${i} should succeed`);
      }

      const refused = await capped.api('POST', EXCHANGE, { body: { idToken: ID_TOKEN } });
      assert.equal(refused.status, 429, 'the fourth is refused — successes were counted');
      assert.equal(refused.json.code, 'FIREBASE_RATE_LIMITED');
      // And nothing was minted by the refused request.
      assert.equal(await activeSessionsOf(user._id), 3, 'exactly the three admitted exchanges');
    } finally {
      await capped.close();
    }
  });

  it('26. ★ the REGISTRATION_REQUIRED path spends budget too — it is not skipped', async () => {
    // A 403 must count as well: that path is the enumeration surface Phase 32A
    // §15 names, so a limiter that skipped non-2xx would leave it unbounded.
    const capped = await listen(
      createApp({ requestLogging: false, authLimits: { ...UNCAPPED, firebaseExchangeMax: 2 } })
    );
    try {
      const unknownUid = uid('unknown-capped');
      setFakeFirebaseToken({ uid: unknownUid, email: uniqueEmail('ghost'), email_verified: true });

      for (let i = 1; i <= 2; i += 1) {
        const res = await capped.api('POST', EXCHANGE, { body: { idToken: ID_TOKEN } });
        assert.equal(res.status, 403, `attempt ${i} is a legitimate REGISTRATION_REQUIRED`);
      }
      const refused = await capped.api('POST', EXCHANGE, { body: { idToken: ID_TOKEN } });
      assert.equal(refused.status, 429, '403s consumed the budget');
    } finally {
      await capped.close();
    }
  });

  // -------------------------------------------------------------------------
  // The legacy path, asserted rather than assumed
  // -------------------------------------------------------------------------

  it('27. ★ password login still works, and linking Firebase retires the bcrypt path', async () => {
    // The rollback property (Phase 32A §10): every account that existed before
    // Firebase keeps working. Asserted against the SHIPPED app, with the Firebase
    // fake installed throughout this suite — so a change that made the exchange
    // path interfere with the password path would fail here.
    //
    // PHASE 32E REVERSED THE FINAL ASSERTION OF THIS CASE, deliberately and with
    // owner approval, and this note is left in place so the reversal is visible
    // rather than discovered. Until 32E, one account could hold both credentials
    // and both worked — the lazy-migration shape Phase 32A §9.1 describes. 32E's
    // guard in `loginWithPassword` makes the retained hash stop working the moment
    // a `firebaseUid` is present, so a Firebase credential cannot be bypassed by a
    // legacy password that nothing keeps in step with it. Everything ABOVE the
    // reversal is unchanged, and it is still what proves the password path itself
    // was not touched: the account registers and signs in with a password normally,
    // and only stops doing so once it is linked. The full ordering contract lives in
    // test/phase32e-firebase-legacy-guard.test.mjs.
    const password = 'Password123!';
    const email = uniqueEmail('legacy');
    const registration = await app.api('POST', '/api/auth/register', {
      body: { businessName: uniqueName('Legacy Biz'), name: uniqueName('Legacy Owner'), email, password },
    });
    assert.equal(registration.status, 201);
    tracker.trackBusiness(registration.json.business.id);
    tracker.trackUser(registration.json.user.id);

    const login = await app.api('POST', '/api/auth/login', { body: { email, password } });
    assert.equal(login.status, 200, 'the password path is untouched');
    assert.ok(decodeAccessToken(login.json.token).jti, 'and still opens a real session');

    // The lazy-migration shape: one account, both credentials — and since Phase
    // 32E, only the Firebase one still authenticates it.
    const linkedUid = uid('both');
    await User.updateOne({ _id: registration.json.user.id }, { $set: { firebaseUid: linkedUid } });
    setFakeFirebaseToken({ uid: linkedUid, email, email_verified: true });

    const exchanged = await exchange({ idToken: ID_TOKEN });
    assert.equal(exchanged.status, 200, 'the same account also signs in with Firebase');
    assert.equal(exchanged.json.user.id, registration.json.user.id);

    // Phase 32E: the account is linked, so the password it still holds is refused
    // here — and refused WITHOUT minting a session, which is what makes the refusal
    // a security boundary rather than a message.
    const loginAgain = await app.api('POST', '/api/auth/login', { body: { email, password } });
    assert.equal(loginAgain.status, 403, 'a Firebase-linked account no longer accepts a password');
    assert.equal(loginAgain.json.code, 'FIREBASE_SIGN_IN_REQUIRED');
    assert.equal(loginAgain.json.token, undefined, 'and no session is handed out');
  });

  it('28. ★ a Firebase-only account cannot log in with any password', async () => {
    // The other half of `passwordHash.required: false`: relaxing the field must
    // not create an account that anything can authenticate against. 401 with the
    // generic credential message, never a 500 from comparing against undefined.
    const id = uid('nopassword');
    const email = uniqueEmail('nopassword');
    setFakeFirebaseToken({ uid: id, email, email_verified: true });
    const res = await register({ idToken: ID_TOKEN, businessName: 'No Password Biz', name: 'NP' });
    assert.equal(res.status, 201);
    tracker.trackBusiness(res.json.business.id);
    tracker.trackUser(res.json.user.id);

    for (const attempt of ['', 'Password123!', 'undefined', 'null']) {
      const login = await app.api('POST', '/api/auth/login', { body: { email, password: attempt } });
      const expected = attempt === '' ? 400 : 401;
      assert.equal(login.status, expected, `password ${JSON.stringify(attempt)} must not authenticate`);
    }
  });

  it('29. ★ a rejected exchange writes no audit trail entry claiming a session was created', async () => {
    const id = uid('noaudit');
    const user = await makeUser({ firebaseUid: id });
    setFakeFirebaseFailure('auth/id-token-expired');

    const db = mongoose.connection.db;
    const before = await db
      .collection('audit_logs')
      .countDocuments({ userId: new mongoose.Types.ObjectId(String(user._id)), action: 'SESSION_CREATED' });

    const res = await exchange({ idToken: ID_TOKEN });
    assert.equal(res.status, 401);

    const after = await db
      .collection('audit_logs')
      .countDocuments({ userId: new mongoose.Types.ObjectId(String(user._id)), action: 'SESSION_CREATED' });
    assert.equal(after, before, 'a refused exchange records no session');
  });

  it('30. ★ no Firebase credential or ID token appears in any failure response', async () => {
    // A sweep over every rejection this route can produce, searching the serialized
    // body for the token that was submitted, for Firebase internals, and for the
    // service-account field names that must never surface.
    const id = uid('leak');
    const user = await makeUser({ firebaseUid: id, status: 'DISABLED' });

    const responses = [];
    setFakeFirebaseFailure('auth/argument-error');
    responses.push(await exchange({ idToken: ID_TOKEN, deviceLabel: 'x' }));
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });
    responses.push(await exchange({ idToken: ID_TOKEN }));
    responses.push(await register({ idToken: ID_TOKEN, businessName: 'Leak Biz' }));
    responses.push(await exchange({ idToken: ID_TOKEN, firebaseUid: 'x', businessId: 'y', role: 'OWNER' }));

    for (const res of responses) {
      const surface = bodySurface(res.json);
      assert.equal(surface.includes(ID_TOKEN), false, `ID token leaked in ${res.status}`);
      assert.equal(surface.includes('firebase-adminsdk'), false, 'service account leaked');
      assert.equal(surface.includes('private_key'), false, 'private key field leaked');
      assert.equal(surface.includes('serviceAccount'), false, 'service account field leaked');
      // The `reason` is deliberately absent from every body too.
      assert.equal(surface.includes('argument-error'), false, 'the SDK reason leaked');
    }
  });
});
