// Phase AUTH-02 — JWT + session foundation.
//
// The target architecture (docs/AUTHENTICATION_AND_USER_VERIFICATION_TARGET_ARCHITECTURE.md
// §11–§14, §36) locks four decisions, and this suite pins all four:
//
//   * the Inventory access JWT lives ~1 HOUR (not the old 7 days);
//   * it carries `iss`/`aud` (`inventory-ai` / `inventory-ai-api`), enforced by
//     jsonwebtoken on every verify — so a pre-AUTH-02 token is rejected once;
//   * the Inventory SESSION has its own 14-DAY ABSOLUTE cap, independent of the
//     token's `exp`. The two lifetimes mean different things and must not be
//     derived from one another;
//   * an EXPIRED-but-genuine token is classified precisely: a live session makes
//     it `SESSION_EXPIRED` (recoverable), a missing/revoked one makes it
//     `SESSION_REVOKED` (terminal), and everything else — forged, malformed,
//     wrong algorithm, wrong/missing issuer or audience, NotBefore — stays
//     `INVALID_TOKEN`.
//
// The installed jsonwebtoken@9.0.3 checks signature → nbf → exp → audience →
// issuer. Two consequences are load-bearing and are asserted here: expiry beats
// issuer/audience, so an expired token is re-verified with `ignoreExpiration` to
// keep wrong-issuer/audience out of the expiry bucket; and `TokenExpiredError`
// extends `JsonWebTokenError`, so the middleware must ask about expiry FIRST.
//
// Registered MIXED in run-tests.mjs: the JWT/claims cases run without a database;
// the HTTP classification and session-cap cases need MongoDB.

import 'dotenv/config';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { ensureDb, disconnectDb } from './helpers.mjs';
import { createTracker, uniqueEmail, uniqueName } from './support.mjs';
import { dbSuite, unitSuite } from './testEnv.mjs';

import { createApp } from '../src/app.ts';
import env from '../src/config/env.ts';
import Business from '../src/models/business.model.ts';
import User from '../src/models/user.model.ts';
import Session from '../src/models/session.model.ts';
import {
  signAccessToken,
  verifyAccessToken,
  verifyAccessTokenIgnoringExpiry,
  isTokenExpiredError,
} from '../src/config/jwt.ts';
import {
  SESSION_ABSOLUTE_CAP_DAYS,
  SESSION_ABSOLUTE_CAP_MS,
} from '../src/services/session.service.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(HERE, '..');
const SRC_DIR = path.join(SERVER_ROOT, 'src');

/** The locked AUTH-02 values. A change here is a change to the contract. */
const EXPECTED_ISSUER = 'inventory-ai';
const EXPECTED_AUDIENCE = 'inventory-ai-api';
const ONE_HOUR_SECONDS = 3600;

// ===========================================================================
// Unit — signing, claims and verification
// ===========================================================================

unitSuite('AUTH-02 — JWT claims and lifetime (no database)', () => {
  // Pin the secret to a local throwaway so the assertions are deterministic and
  // independent of whatever JWT_SECRET server/.env holds.
  const PROBE_SECRET = 'x'.repeat(48);
  const savedSecret = env.jwtSecret;
  const savedExpiresIn = env.jwtExpiresIn;
  before(() => {
    env.jwtSecret = PROBE_SECRET;
    // Force 1h so this suite is deterministic even when the developer's
    // gitignored server/.env still carries the pre-AUTH-02 JWT_EXPIRES_IN=7d.
    // The SHIPPED default is proven separately by the config guard below.
    env.jwtExpiresIn = '1h';
  });
  after(() => {
    env.jwtSecret = savedSecret;
    env.jwtExpiresIn = savedExpiresIn;
  });

  const USER_ID = '507f1f77bcf86cd799439011';
  const JTI = 'session-abc';

  it('★ the locked issuer and audience defaults are in force', () => {
    assert.equal(env.jwtIssuer, EXPECTED_ISSUER);
    assert.equal(env.jwtAudience, EXPECTED_AUDIENCE);
  });

  it('★ signs a ~1-hour token carrying iss/aud/iat/exp and sub/jti', () => {
    const token = signAccessToken(USER_ID, JTI);
    const claims = verifyAccessToken(token);

    assert.equal(claims.sub, USER_ID);
    assert.equal(claims.jti, JTI);
    assert.equal(claims.iss, EXPECTED_ISSUER);
    assert.equal(claims.aud, EXPECTED_AUDIENCE);
    assert.ok(Number.isInteger(claims.iat), 'iat present');
    assert.ok(Number.isInteger(claims.exp), 'exp present');
    assert.equal(
      claims.exp - claims.iat,
      ONE_HOUR_SECONDS,
      'the token must live exactly one hour (1h)'
    );
  });

  it('★ never mints authoritative role / businessId / permissions / status claims', () => {
    const claims = verifyAccessToken(signAccessToken(USER_ID, JTI));
    for (const forbidden of ['role', 'businessId', 'permissions', 'status']) {
      assert.equal(claims[forbidden], undefined, `${forbidden} must never be a JWT claim`);
    }
    assert.deepEqual(
      Object.keys(claims).sort(),
      ['aud', 'exp', 'iat', 'iss', 'jti', 'sub'],
      'the claim set is exactly the approved six'
    );
  });

  it('accepts a correctly issued token (issuer + audience verified by jsonwebtoken)', () => {
    const claims = verifyAccessToken(signAccessToken(USER_ID, JTI));
    assert.equal(claims.sub, USER_ID);
  });

  it('rejects a token with a missing/empty jti at signing time', () => {
    for (const bad of ['', undefined, null, 42]) {
      assert.throws(
        () => signAccessToken(USER_ID, bad),
        /session id/i,
        `jti=${JSON.stringify(bad)} must be refused`
      );
    }
  });
});

unitSuite('AUTH-02 — issuer/audience enforcement (no database)', () => {
  const PROBE_SECRET = 'y'.repeat(48);
  const savedSecret = env.jwtSecret;
  const PROBE_ISSUER = 'inventory-ai';
  const PROBE_AUDIENCE = 'inventory-ai-api';
  before(() => {
    env.jwtSecret = PROBE_SECRET;
    env.jwtIssuer = PROBE_ISSUER;
    env.jwtAudience = PROBE_AUDIENCE;
  });
  after(() => {
    env.jwtSecret = savedSecret;
  });

  const craft = (payload, options = {}) =>
    jwt.sign(payload, PROBE_SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
      issuer: PROBE_ISSUER,
      audience: PROBE_AUDIENCE,
      ...options,
    });

  it('★ rejects a wrong issuer', () => {
    const token = craft({ sub: 'u1', jti: 'j1' }, { issuer: 'evil' });
    assert.throws(() => verifyAccessToken(token), (e) => /issuer/i.test(e.message));
  });

  it('★ rejects a MISSING issuer (pre-AUTH-02 token shape)', () => {
    const token = jwt.sign({ sub: 'u1', jti: 'j1' }, PROBE_SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
      audience: PROBE_AUDIENCE,
    });
    assert.throws(() => verifyAccessToken(token), (e) => /issuer/i.test(e.message));
  });

  it('★ rejects a wrong audience', () => {
    const token = craft({ sub: 'u1', jti: 'j1' }, { audience: 'evil' });
    assert.throws(() => verifyAccessToken(token), (e) => /audience/i.test(e.message));
  });

  it('★ rejects a MISSING audience', () => {
    const token = jwt.sign({ sub: 'u1', jti: 'j1' }, PROBE_SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
      issuer: PROBE_ISSUER,
    });
    assert.throws(() => verifyAccessToken(token), (e) => /audience/i.test(e.message));
  });

  it('★ rejects an old token that carries neither issuer nor audience', () => {
    const legacy = jwt.sign({ sub: 'u1', jti: 'j1' }, PROBE_SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
      // no issuer, no audience — exactly the pre-AUTH-02 shape
    });
    assert.throws(() => verifyAccessToken(legacy), (e) => /audience/i.test(e.message));
  });

  it('rejects an invalid signature, a malformed token, and a wrong algorithm', () => {
    const foreign = jwt.sign({ sub: 'u1', jti: 'j1' }, 'z'.repeat(48), {
      algorithm: 'HS256',
      expiresIn: '1h',
      issuer: PROBE_ISSUER,
      audience: PROBE_AUDIENCE,
    });
    assert.throws(() => verifyAccessToken(foreign), (e) => /signature/i.test(e.message));

    for (const bad of ['not-a-jwt', 'aaa.bbb', '', 'aaa.bbb.ccc.ddd']) {
      assert.throws(() => verifyAccessToken(bad), `malformed ${JSON.stringify(bad)} must be refused`);
    }

    const hs384 = jwt.sign({ sub: 'u1', jti: 'j1' }, PROBE_SECRET, {
      algorithm: 'HS384',
      expiresIn: '1h',
      issuer: PROBE_ISSUER,
      audience: PROBE_AUDIENCE,
    });
    assert.throws(() => verifyAccessToken(hs384), /algorithm/i);
  });
});

// ===========================================================================
// Unit — expiry detection and the expiry-ignoring re-verification
// ===========================================================================

unitSuite('AUTH-02 — expiry detection precedes generic failures (no database)', () => {
  const PROBE_SECRET = 'q'.repeat(48);
  const savedSecret = env.jwtSecret;
  const savedIssuer = env.jwtIssuer;
  const savedAudience = env.jwtAudience;
  const PROBE_ISSUER = 'inventory-ai';
  const PROBE_AUDIENCE = 'inventory-ai-api';
  before(() => {
    env.jwtSecret = PROBE_SECRET;
    env.jwtIssuer = PROBE_ISSUER;
    env.jwtAudience = PROBE_AUDIENCE;
  });
  after(() => {
    env.jwtSecret = savedSecret;
    env.jwtIssuer = savedIssuer;
    env.jwtAudience = savedAudience;
  });

  const craft = (payload, options = {}) =>
    jwt.sign(payload, PROBE_SECRET, {
      algorithm: 'HS256',
      expiresIn: '-10s',
      issuer: PROBE_ISSUER,
      audience: PROBE_AUDIENCE,
      ...options,
    });

  it('★ TokenExpiredError is a SUBCLASS of JsonWebTokenError (the ordering trap)', () => {
    // Documented here because the middleware depends on it: testing
    // `instanceof JsonWebTokenError` first would swallow every expiry.
    const expired = craft({ sub: 'u1', jti: 'j1' });
    try {
      verifyAccessToken(expired);
      assert.fail('an expired token must throw');
    } catch (err) {
      assert.equal(err.name, 'TokenExpiredError');
      assert.equal(err instanceof jwt.JsonWebTokenError, true, 'expiry extends the generic class');
      assert.equal(isTokenExpiredError(err), true, 'but the predicate must still single it out');
    }
  });

  it('isTokenExpiredError is true ONLY for expiry', () => {
    const expired = craft({ sub: 'u1', jti: 'j1' });
    try {
      verifyAccessToken(expired);
      assert.fail('expected expiry');
    } catch (err) {
      assert.equal(isTokenExpiredError(err), true);
    }

    // A generic JsonWebTokenError is NOT an expiry.
    assert.equal(isTokenExpiredError(new jwt.JsonWebTokenError('nope')), false);
    // A NotBeforeError is NOT an expiry.
    const early = craft({ sub: 'u1', jti: 'j1' }, { notBefore: '1h', expiresIn: '1h' });
    try {
      verifyAccessToken(early);
      assert.fail('expected NotBefore');
    } catch (err) {
      assert.equal(err.name, 'NotBeforeError');
      assert.equal(isTokenExpiredError(err), false);
    }
    assert.equal(isTokenExpiredError(null), false);
    assert.equal(isTokenExpiredError(new Error('plain')), false);
  });

  it('★ expiry wins over issuer/audience — so the second verification is required', () => {
    // jsonwebtoken checks exp BEFORE audience/issuer, so an expired token with a
    // wrong issuer still throws TokenExpiredError. Re-verifying with
    // ignoreExpiration is what keeps it out of the SESSION_EXPIRED bucket.
    const expiredWrongIssuer = craft({ sub: 'u1', jti: 'j1' }, { issuer: 'evil' });
    assert.throws(
      () => verifyAccessToken(expiredWrongIssuer),
      (e) => e.name === 'TokenExpiredError',
      'expiry precedes the issuer check'
    );
    assert.throws(
      () => verifyAccessTokenIgnoringExpiry(expiredWrongIssuer),
      (e) => /issuer/i.test(e.message),
      'the second verification must still reject the wrong issuer'
    );
  });

  it('★ the expiry-ignoring re-verification accepts an expired-but-genuine token', () => {
    const expired = craft({ sub: 'u1', jti: 'j1' });
    const claims = verifyAccessTokenIgnoringExpiry(expired);
    assert.equal(claims.sub, 'u1');
    assert.equal(claims.jti, 'j1');
    assert.equal(claims.iss, PROBE_ISSUER);
    assert.equal(claims.aud, PROBE_AUDIENCE);
  });

  it('★ the expiry-ignoring re-verification rejects a legacy (no iss/aud) expired token', () => {
    const legacyExpired = jwt.sign({ sub: 'u1', jti: 'j1' }, PROBE_SECRET, {
      algorithm: 'HS256',
      expiresIn: '-10s',
    });
    assert.throws(() => verifyAccessToken(legacyExpired), (e) => e.name === 'TokenExpiredError');
    assert.throws(() => verifyAccessTokenIgnoringExpiry(legacyExpired), /audience/i);
  });

  it('★ the expiry-ignoring re-verification still rejects a forged signature', () => {
    const forged = jwt.sign({ sub: 'u1', jti: 'j1' }, 'z'.repeat(48), {
      algorithm: 'HS256',
      expiresIn: '-10s',
      issuer: PROBE_ISSUER,
      audience: PROBE_AUDIENCE,
    });
    assert.throws(() => verifyAccessToken(forged), (e) => /signature/i.test(e.message));
    assert.throws(() => verifyAccessTokenIgnoringExpiry(forged), (e) => /signature/i.test(e.message));
  });
});

// ===========================================================================
// Unit — source guard: the ordering that must not regress
// ===========================================================================

unitSuite('AUTH-02 — source guards', () => {
  const authenticateSource = fs.readFileSync(
    path.join(SRC_DIR, 'middlewares/authenticate.ts'),
    'utf8'
  );

  it('★ asks about expiry BEFORE any generic INVALID_TOKEN rejection', () => {
    const expiryAt = authenticateSource.indexOf('isTokenExpiredError(err)');
    const jtiAt = authenticateSource.indexOf('expiredTokenRejection');
    assert.ok(expiryAt !== -1, 'the expiry check must be present');
    assert.ok(jtiAt !== -1, 'expired tokens must be routed to classification');
    // Anchor on the THROW, not any textual mention: the module's own doc block
    // names INVALID_TOKEN, and the classification helper returns (not throws) its
    // copies, so this string identifies exactly the generic catch branch.
    const genericThrowAt = authenticateSource.indexOf(
      "throw new ApiError(401, 'Invalid or expired token', 'INVALID_TOKEN')"
    );
    assert.ok(genericThrowAt !== -1, 'the generic rejection must be present');
    assert.ok(
      expiryAt < genericThrowAt,
      'the expiry branch must precede the generic INVALID_TOKEN throw'
    );
  });

  it('★ requires a usable jti before consulting a session on the expired path', () => {
    assert.ok(
      authenticateSource.includes('typeof jti !== \'string\' || jti.length === 0'),
      'an expired token with no/empty jti must stay INVALID_TOKEN'
    );
    assert.ok(
      authenticateSource.includes('verifyAccessTokenIgnoringExpiry'),
      'the second (expiry-ignoring) verification must be used for classification'
    );
  });

  it('★ the session cap is 14 days and is a named constant', () => {
    assert.equal(SESSION_ABSOLUTE_CAP_DAYS, 14);
    assert.equal(SESSION_ABSOLUTE_CAP_MS, 14 * 24 * 60 * 60 * 1000);
  });

  it('★ the SHIPPED configuration defaults the token to 1h and pins iss/aud', () => {
    // The runtime `env` values may be overridden by a developer's .env (the
    // pre-AUTH-02 JWT_EXPIRES_IN=7d is exactly such an override), so the shipped
    // defaults are pinned at their source rather than only observed at runtime.
    const envSource = fs.readFileSync(path.join(SRC_DIR, 'config/env.ts'), 'utf8');
    assert.ok(
      envSource.includes("process.env.JWT_EXPIRES_IN || '1h'"),
      'the access-token lifetime default must be 1h'
    );
    assert.ok(
      envSource.includes("process.env.JWT_ISSUER || 'inventory-ai'"),
      'the issuer default must be inventory-ai'
    );
    assert.ok(
      envSource.includes("process.env.JWT_AUDIENCE || 'inventory-ai-api'"),
      'the audience default must be inventory-ai-api'
    );

    const example = fs.readFileSync(path.join(SERVER_ROOT, '.env.example'), 'utf8');
    for (const line of ['JWT_EXPIRES_IN=1h', 'JWT_ISSUER=inventory-ai', 'JWT_AUDIENCE=inventory-ai-api']) {
      assert.ok(example.includes(line), `.env.example must document ${line}`);
    }
  });
});

// ===========================================================================
// DB-backed — the HTTP classification contract and the session cap
// ===========================================================================

const dbOk = await ensureDb();

const PASSWORD = 'Password123!';
const ME = '/api/auth/me';
const LOGIN = '/api/auth/login';

const UNCAPPED = {
  loginMax: 100000,
  loginIpMax: 100000,
  registerMax: 100000,
};

async function listen(app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
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
      return { status: res.status, json };
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

dbSuite('AUTH-02 — expired-token classification over HTTP', dbOk, () => {
  const tracker = createTracker(dbOk);
  let app = null;
  const savedExpiresIn = env.jwtExpiresIn;

  before(async () => {
    // Force 1h so the real login path mints 1h tokens regardless of a developer's
    // gitignored server/.env (which may still carry the pre-AUTH-02 7d).
    env.jwtExpiresIn = '1h';
    app = await listen(createApp({ requestLogging: false, authLimits: UNCAPPED }));
  });

  after(async () => {
    env.jwtExpiresIn = savedExpiresIn;
    if (app) await app.close();
    await tracker.cleanup();
    await disconnectDb();
  });

  /** A fresh business + ACTIVE OWNER, created directly in the database. */
  async function makeUser({ status = 'ACTIVE', businessStatus = 'ACTIVE' } = {}) {
    const business = await Business.create({
      name: uniqueName('BizA2'),
      status: businessStatus,
    });
    tracker.trackBusiness(String(business._id));
    const email = uniqueEmail('uauth02');
    const user = await User.create({
      businessId: business._id,
      name: uniqueName('UA2'),
      email,
      passwordHash: bcrypt.hashSync(PASSWORD, 10),
      role: 'OWNER',
      status,
    });
    tracker.trackUser(String(user._id));
    return { business, user, email };
  }

  /** A live session row for `userId`, named by `jti`. */
  async function makeSession(userId, jti) {
    return Session.create({
      userId,
      jti,
      expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_CAP_MS),
    });
  }

  /** An EXPIRED token carrying the correct issuer/audience. */
  function expiredToken(userId, jti, overrides = {}) {
    const payload = { sub: String(userId) };
    if (jti !== undefined) payload.jti = jti;
    return jwt.sign(payload, env.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: '-10s',
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
      ...overrides,
    });
  }

  // -- the precise expiry bucket --------------------------------------------

  it('★ expired + live session → 401 SESSION_EXPIRED', async () => {
    const { user } = await makeUser();
    const jti = `a2-exp-${Date.now()}-1`;
    await makeSession(user._id, jti);

    const res = await app.api('GET', ME, { token: expiredToken(user._id, jti) });
    assert.equal(res.status, 401, JSON.stringify(res.json));
    assert.equal(res.json.code, 'SESSION_EXPIRED');
  });

  it('★ expired + revoked session → 401 SESSION_REVOKED', async () => {
    const { user } = await makeUser();
    const jti = `a2-rev-${Date.now()}-2`;
    await makeSession(user._id, jti);
    await Session.updateOne({ jti }, { $set: { revokedAt: new Date() } });

    const res = await app.api('GET', ME, { token: expiredToken(user._id, jti) });
    assert.equal(res.status, 401);
    assert.equal(res.json.code, 'SESSION_REVOKED');
  });

  it('★ expired + missing session → 401 SESSION_REVOKED', async () => {
    const { user } = await makeUser();
    const res = await app.api('GET', ME, { token: expiredToken(user._id, 'a2-no-such-session') });
    assert.equal(res.status, 401);
    assert.equal(res.json.code, 'SESSION_REVOKED');
  });

  it('★ expired + missing/empty jti → 401 INVALID_TOKEN (never SESSION_EXPIRED)', async () => {
    for (const jti of [undefined, '']) {
      const { user } = await makeUser();
      const token =
        jti === undefined
          ? jwt.sign({ sub: String(user._id) }, env.jwtSecret, {
              algorithm: 'HS256',
              expiresIn: '-10s',
              issuer: env.jwtIssuer,
              audience: env.jwtAudience,
            })
          : expiredToken(user._id, '');
      const res = await app.api('GET', ME, { token });
      assert.equal(res.status, 401, `jti=${JSON.stringify(jti)}`);
      assert.equal(res.json.code, 'INVALID_TOKEN', `jti=${JSON.stringify(jti)}`);
    }
  });

  it('★ expired + wrong/missing issuer or audience → 401 INVALID_TOKEN', async () => {
    const { user } = await makeUser();
    const jti = `a2-iss-${Date.now()}-3`;
    await makeSession(user._id, jti);

    const cases = [
      ['wrong issuer', { issuer: 'evil' }],
      ['missing issuer', { issuer: undefined }],
      ['wrong audience', { audience: 'evil' }],
      ['missing audience', { audience: undefined }],
    ];
    for (const [label, override] of cases) {
      const options = {
        algorithm: 'HS256',
        expiresIn: '-10s',
        issuer: env.jwtIssuer,
        audience: env.jwtAudience,
        ...override,
      };
      // jsonwebtoken rejects an explicitly-undefined option value, so "missing"
      // must OMIT the key rather than set it to undefined.
      for (const key of Object.keys(options)) {
        if (options[key] === undefined) delete options[key];
      }
      const token = jwt.sign({ sub: String(user._id), jti }, env.jwtSecret, options);
      const res = await app.api('GET', ME, { token });
      assert.equal(res.status, 401, `${label}: ${JSON.stringify(res.json)}`);
      assert.equal(res.json.code, 'INVALID_TOKEN', `${label} must not be SESSION_EXPIRED`);
    }
  });

  it('★ expired + invalid signature → 401 INVALID_TOKEN', async () => {
    const { user } = await makeUser();
    const token = jwt.sign({ sub: String(user._id), jti: 'a2-bad-sig' }, 'z'.repeat(48), {
      algorithm: 'HS256',
      expiresIn: '-10s',
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
    });
    const res = await app.api('GET', ME, { token });
    assert.equal(res.status, 401);
    assert.equal(res.json.code, 'INVALID_TOKEN');
  });

  it('★ NotBeforeError → 401 INVALID_TOKEN', async () => {
    const { user } = await makeUser();
    const jti = `a2-nbf-${Date.now()}-4`;
    await makeSession(user._id, jti);
    const token = jwt.sign({ sub: String(user._id), jti }, env.jwtSecret, {
      algorithm: 'HS256',
      notBefore: '1h',
      expiresIn: '1h',
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
    });
    const res = await app.api('GET', ME, { token });
    assert.equal(res.status, 401);
    assert.equal(res.json.code, 'INVALID_TOKEN');
  });

  // -- unchanged codes ------------------------------------------------------

  it('a malformed/forged token stays INVALID_TOKEN and no header stays AUTH_REQUIRED', async () => {
    const malformed = await app.api('GET', ME, { token: 'not.a.jwt' });
    assert.equal(malformed.status, 401);
    assert.equal(malformed.json.code, 'INVALID_TOKEN');

    const missing = await app.api('GET', ME);
    assert.equal(missing.status, 401);
    assert.equal(missing.json.code, 'AUTH_REQUIRED');
  });

  it('★ a valid unexpired token naming a revoked session → SESSION_REVOKED', async () => {
    const { email } = await makeUser();
    const login = await app.api('POST', LOGIN, { body: { email, password: PASSWORD } });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    const token = login.json.token;

    const claims = jwt.decode(token);
    await Session.updateOne({ jti: claims.jti }, { $set: { revokedAt: new Date() } });

    const res = await app.api('GET', ME, { token });
    assert.equal(res.status, 401);
    assert.equal(res.json.code, 'SESSION_REVOKED');
  });

  it('★ a disabled user with a valid session → 403 ACCOUNT_DISABLED', async () => {
    const { user, email } = await makeUser();
    const login = await app.api('POST', LOGIN, { body: { email, password: PASSWORD } });
    await User.updateOne({ _id: user._id }, { $set: { status: 'DISABLED' } });

    const res = await app.api('GET', ME, { token: login.json.token });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'ACCOUNT_DISABLED');
  });

  it('★ an inactive business with a valid session → 403 BUSINESS_NOT_ACTIVE', async () => {
    const { business, email } = await makeUser();
    const login = await app.api('POST', LOGIN, { body: { email, password: PASSWORD } });
    await Business.updateOne({ _id: business._id }, { $set: { status: 'SUSPENDED' } });

    const res = await app.api('GET', ME, { token: login.json.token });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'BUSINESS_NOT_ACTIVE');
  });

  // -- the session cap ------------------------------------------------------

  it('★ JWT exp ≈ creation + 1 hour, session expiresAt ≈ creation + 14 days', async () => {
    const { email } = await makeUser();
    const before = Date.now();
    const login = await app.api('POST', LOGIN, { body: { email, password: PASSWORD } });
    assert.equal(login.status, 200, JSON.stringify(login.json));

    const claims = jwt.decode(login.json.token);
    assert.equal(claims.exp - claims.iat, ONE_HOUR_SECONDS, 'the JWT lives ~1 hour');

    const row = await Session.findOne({ jti: claims.jti });
    assert.ok(row, 'the token names a session row');
    const createdMs = row.createdAt.getTime();
    const capMs = row.expiresAt.getTime() - createdMs;
    assert.ok(
      Math.abs(capMs - SESSION_ABSOLUTE_CAP_MS) < 60_000,
      `the session cap must be ~14 days, was ${capMs}ms`
    );
    assert.ok(createdMs >= before - 60_000, 'the cap is anchored at creation');

    // ★ The two lifetimes are independent: the session outlives its token by
    // nearly 14 days and is NOT derived from `exp`.
    assert.notEqual(row.expiresAt.getTime(), claims.exp * 1000);
    assert.ok(
      row.expiresAt.getTime() - claims.exp * 1000 > 13 * 24 * 60 * 60 * 1000,
      'the session must outlive its JWT by ~13+ days'
    );
  });
});
