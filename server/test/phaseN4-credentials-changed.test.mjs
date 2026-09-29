// N-4 (Phase 32R) — the server-side credential-change bridge.
//
// The phase adds ONE route, `POST /api/auth/credentials-changed`, and the suite is
// organised around the properties that make it safe to have at all. The central
// claim is a single sentence:
//
//   A CALLER MAY ONLY EVER REVOKE THEIR OWN SESSIONS, AND ONLY AFTER PROVING THE
//   FIREBASE IDENTITY THAT CHANGED ITS CREDENTIAL IS THE ONE THEIR ACCOUNT
//   AUTHENTICATES THROUGH.
//
// So the suite is built to falsify that claim rather than to restate it:
//
//   * THE ACCOUNT AND THE IDENTITY ARE BOTH SERVER-DERIVED. A body carrying
//     `userId`, `businessId`, `firebaseUid`, `role`, `status`, `email`, `jti` or a
//     session id — all pointing at a DIFFERENT linked user in a DIFFERENT business —
//     must be inert, and the account actually affected must be the caller's.
//   * A MISMATCH IS REFUSED, NEVER RESOLVED. An unrelated identity, an account with
//     no Firebase identity at all, and a stale authentication each answer 409 with
//     nothing mutated — no stamp, no revocation, no audit row.
//   * THE REVOCATION IS TOTAL, AND THAT IS THE POINT. The session the request
//     arrived on dies with every other one (`revokeAllSessions` has no caller
//     exception), and a session minted AFTER the stamp authenticates successfully.
//     Both halves are asserted, because the first alone would also pass against an
//     implementation that simply broke the account.
//   * NOTHING BUT `passwordChangedAt` MOVES. `businessId`, `role`, `status` and the
//     retained bcrypt `passwordHash` are compared before and after.
//   * NO RESPONSE CAN SIGN THE USER OUT MID-FLOW. A bad Firebase credential is 400,
//     never the 401 that `lib/client.ts` reads as session loss, and a refusal is
//     checked to leave the caller's session usable.
//
// The verifier is the Phase 32B test fake installed through the REAL seam
// (`setFirebaseIdTokenVerifier`), so the narrowing in `toVerifiedIdentity` — the
// `auth_time` handling included — runs on every case exactly as it does in
// production. No case reaches the network and no Firebase project exists.
//
// Registered MIXED in run-tests.mjs: the payload cases run without a database;
// everything else needs MongoDB.

import 'dotenv/config';

import { it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

import { ensureDb, disconnectDb } from './helpers.mjs';
import { createTracker, uniqueEmail, uniqueName, issueSessionToken } from './support.mjs';
import { dbSuite, unitSuite } from './testEnv.mjs';

import { createApp } from '../src/app.ts';
import requireAuth from '../src/middlewares/authenticate.ts';
import authRouter from '../src/routes/auth.routes.ts';
import Business from '../src/models/business.model.ts';
import User from '../src/models/user.model.ts';
import Session from '../src/models/session.model.ts';
import AuditLog from '../src/models/auditLog.model.ts';
import { validateCredentialsChanged } from '../src/utils/validate.ts';
import { AUDIT_ACTIONS } from '../src/constants/audit.ts';
import {
  FIREBASE_ACCOUNT_ENV,
  FIREBASE_SERVICE_ACCOUNT_JSON,
} from '../src/config/firebase.ts';
import { FIREBASE_REAUTH_WINDOW_SECONDS } from '../src/constants/firebase.ts';
import {
  registerFakeFirebaseVerifier,
  deregisterFakeFirebaseVerifier,
  setFakeFirebaseToken,
  setFakeFirebaseFailure,
  verifiedTokens,
  clearVerifiedTokens,
} from './fakes/firebaseVerifier.mjs';

const BRIDGE = '/api/auth/credentials-changed';
const ME = '/api/auth/me';
const SESSIONS = '/api/auth/sessions';

/** The opaque string this suite submits as an ID token. Never a real one. */
const ID_TOKEN = 'phasedN4.fake.id-token-that-the-seam-replaces';

const ALL_FIREBASE_ENV = [FIREBASE_SERVICE_ACCOUNT_JSON, ...FIREBASE_ACCOUNT_ENV];

/** Every string a JSON response body could carry, for a leak search. */
function bodySurface(json) {
  return JSON.stringify(json ?? null);
}

/** The current Unix second, matching the unit the signed `auth_time` claim uses. */
const nowSec = () => Math.floor(Date.now() / 1000);

/**
 * A decoded-token payload in the shape the real verifier resolves with.
 *
 * `auth_time` is the freshness field under test; `iat` is included deliberately so
 * a case can make the token LOOK newly issued while the authentication is stale —
 * which is how "iat is not a freshness signal" is asserted rather than described.
 */
function tokenPayload({ uid, authTime = nowSec(), iat } = {}) {
  return {
    uid,
    email: 'phaseN4@example.test',
    email_verified: true,
    auth_time: authTime,
    ...(iat === undefined ? {} : { iat }),
  };
}

/**
 * Runs `fn` with no Firebase variables set, restoring the previous environment
 * afterwards — the same helper the 32H/32L suites use, because a developer's own
 * server/.env may configure a real project and the "not configured" case must not
 * depend on it being absent.
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

/** Limiters opened wide, so no case in this file can trip one. */
const UNCAPPED = {
  firebaseExchangeMax: 100000,
  firebaseRegisterMax: 100000,
  registerMax: 100000,
  loginMax: 100000,
  loginIpMax: 100000,
};

// ===========================================================================
// DB-free: the payload
// ===========================================================================

unitSuite('N-4 — the credentials-changed payload (no database)', () => {
  it('requires idToken, and rejects it for every non-string or blank shape', () => {
    for (const body of [{}, null, undefined, { idToken: '' }, { idToken: '   ' }, { idToken: 42 }]) {
      const { problems, idToken } = validateCredentialsChanged(body);
      assert.deepEqual(
        problems.map((p) => p.field),
        ['idToken'],
        `expected an idToken problem for ${JSON.stringify(body)}`
      );
      assert.equal(idToken, undefined, 'no token is returned alongside a problem');
    }
  });

  it('rejects an oversized idToken', () => {
    const { problems } = validateCredentialsChanged({ idToken: 'x'.repeat(4097) });
    assert.deepEqual(problems.map((p) => p.field), ['idToken']);
  });

  // ★ The structural half of the body contract: the handler has no variable holding
  //   a client-supplied identity, tenant, role or session, so there is nothing to
  //   forward by accident and no check that could be removed. Asserted on the RESULT
  //   rather than on the source, because a future edit that started returning
  //   `userId` would fail here even if it also added a check.
  it('★ returns ONLY {problems, idToken} — the account, identity and session cannot be forwarded', () => {
    const { problems, idToken, ...rest } = validateCredentialsChanged({ idToken: ID_TOKEN });
    assert.deepEqual(problems, []);
    assert.equal(idToken, ID_TOKEN);
    assert.deepEqual(Object.keys(rest), [], 'no other field is returned at all');
  });

  it('★ a body naming an account, an identity, a tenant, a role or a session is inert', () => {
    const planted = {
      userId: '507f1f77bcf86cd799439011',
      businessId: '507f1f77bcf86cd799439012',
      firebaseUid: 'uid-the-caller-invented',
      role: 'OWNER',
      status: 'ACTIVE',
      email: 'someone-else@example.test',
      jti: 'a-session-the-caller-invented',
      sessionId: '507f1f77bcf86cd799439013',
      all: true,
    };

    const plain = validateCredentialsChanged({ idToken: ID_TOKEN });
    const loaded = validateCredentialsChanged({ idToken: ID_TOKEN, ...planted });

    assert.deepEqual(loaded, plain, 'the planted fields are not "accepted" — they are unread');
    const surface = bodySurface(loaded);
    for (const [key, value] of Object.entries(planted)) {
      assert.equal(surface.includes(String(value)), false, `${key} leaked into the validated payload`);
    }
  });

  // The freshness window is the existing constant, not a value this phase chose:
  // the bridge imports it and must never restate or widen it.
  it('★ the freshness window is the existing FIREBASE_REAUTH_WINDOW_SECONDS (300)', () => {
    assert.equal(FIREBASE_REAUTH_WINDOW_SECONDS, 300);
  });
});

// ===========================================================================
// DB-backed: the route over the shipped app and a real database
// ===========================================================================

const dbOk = await ensureDb();

dbSuite('N-4 — the credential-change bridge over HTTP and a real database', dbOk, () => {
  const tracker = createTracker(dbOk);
  let app = null;

  /** A unique Firebase uid for a case, so parallel files cannot collide. */
  const uidFor = (prefix = 'phasedN4') => uniqueName(prefix);

  async function makeBusiness({ status = 'ACTIVE' } = {}) {
    const business = await Business.create({ name: uniqueName('BizN4'), status });
    tracker.trackBusiness(String(business._id));
    return business;
  }

  /**
   * A MongoDB user, optionally already linked to a Firebase identity.
   *
   * `firebaseUid: null` writes NO `firebaseUid` key at all rather than an explicit
   * null, which is the state every legacy account is in.
   */
  async function makeUser({
    business,
    role = 'STAFF',
    status = 'ACTIVE',
    firebaseUid = null,
    email = null,
    password = null,
  } = {}) {
    const biz = business ?? (await makeBusiness());
    const user = await User.create({
      businessId: biz._id,
      name: uniqueName('UN4'),
      email: email ?? uniqueEmail('un4'),
      ...(password ? { passwordHash: bcrypt.hashSync(password, 10) } : {}),
      ...(firebaseUid ? { firebaseUid } : {}),
      role,
      status,
    });
    tracker.trackUser(String(user._id));
    return user;
  }

  /** The caller's own authenticated token, minted the way requireAuth expects. */
  const tokenFor = (user) => issueSessionToken(user._id);

  const activeSessionsOf = (userId) => Session.countDocuments({ userId, revokedAt: null });

  const sessionsRevokedAllRows = (businessId) =>
    AuditLog.find({ businessId, action: AUDIT_ACTIONS.SESSIONS_REVOKED_ALL });

  /** Re-reads a user with every field visible, including the credential. */
  const reload = (user) => User.findById(user._id).select('+passwordHash');

  const bridge = (token, body) => app.api('POST', BRIDGE, { token, body });

  before(async () => {
    registerFakeFirebaseVerifier();
    app = await listen(createApp({ requestLogging: false, authLimits: UNCAPPED }));
  });

  /**
   * Each case starts with an empty call log: `verifiedTokens()` accumulates across
   * the whole file otherwise, so a case asserting "the verifier was never reached"
   * would be reading earlier cases' tokens as well as its own.
   */
  beforeEach(() => {
    clearVerifiedTokens();
  });

  after(async () => {
    deregisterFakeFirebaseVerifier();
    if (app) await app.close();
    await tracker.cleanup();
    await disconnectDb();
  });

  // -------------------------------------------------------------------------
  // 1 — the happy path
  // -------------------------------------------------------------------------

  it('1. ★ an authenticated caller records the change: 200 { changedAt }, stamped, sessions revoked', async () => {
    const fb = uidFor();
    const business = await makeBusiness();
    const user = await makeUser({ business, role: 'MANAGER', firebaseUid: fb });
    const token = await tokenFor(user);
    setFakeFirebaseToken(tokenPayload({ uid: fb }));

    const res = await bridge(token, { idToken: ID_TOKEN });

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.json).sort(), ['changedAt'], 'the response envelope, exactly');
    assert.equal(
      Number.isNaN(Date.parse(res.json.changedAt)),
      false,
      'changedAt is an ISO timestamp the client can read'
    );
    assert.deepEqual(verifiedTokens(), [ID_TOKEN], 'the verifier saw the submitted token');

    const stored = await reload(user);
    assert.ok(stored.passwordChangedAt, 'the stamp is durable');
    assert.equal(
      stored.passwordChangedAt.toISOString(),
      res.json.changedAt,
      'the response reports the instant that was actually written'
    );

    // The caller learns nothing about the identity that changed: the account was
    // named by the session, never by the body.
    assert.equal(bodySurface(res.json).includes(fb), false, 'the Firebase uid left the server');
  });

  // -------------------------------------------------------------------------
  // 2 — a bad Firebase credential is a 400, and mutates nothing
  // -------------------------------------------------------------------------

  it('2. ★ a rejected Firebase token answers 400 (never the 401 that means session loss) and mutates nothing', async () => {
    const fb = uidFor();
    const user = await makeUser({ firebaseUid: fb });
    const token = await tokenFor(user);
    setFakeFirebaseToken(tokenPayload({ uid: fb }));

    const before = await reload(user);
    const sessionsBefore = await activeSessionsOf(user._id);

    setFakeFirebaseFailure('auth/id-token-expired');
    const res = await bridge(token, { idToken: ID_TOKEN });

    assert.equal(res.status, 400, 'a bad provider credential is a bad request field, not a dead session');
    assert.equal(res.json.code, 'FIREBASE_TOKEN_INVALID');

    const after = await reload(user);
    assert.equal(after.passwordChangedAt, null, 'nothing was stamped');
    assert.equal(await activeSessionsOf(user._id), sessionsBefore, 'nothing was revoked');
    assert.equal((await sessionsRevokedAllRows(user.businessId)).length, 0, 'no audit row');
    assert.equal(before.passwordChangedAt, null);

    // ★ The property the 400 exists to protect: the caller's session still works.
    const me = await app.api('GET', ME, { token });
    assert.equal(me.status, 200, 'a rejected provider credential did not kill the application session');
  });

  // -------------------------------------------------------------------------
  // 3 — the identity must be this account's
  // -------------------------------------------------------------------------

  it('3. ★ a DIFFERENT verified identity is refused 409 FIREBASE_IDENTITY_CONFLICT and changes nothing', async () => {
    const mine = uidFor();
    const theirs = uidFor();
    const user = await makeUser({ firebaseUid: mine });
    const token = await tokenFor(user);

    setFakeFirebaseToken(tokenPayload({ uid: theirs }));
    const res = await bridge(token, { idToken: ID_TOKEN });

    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'FIREBASE_IDENTITY_CONFLICT');
    assert.equal(bodySurface(res.json).includes(theirs), false, 'the presented uid is not echoed');
    assert.equal(bodySurface(res.json).includes(mine), false, 'nor is the account’s');

    const stored = await reload(user);
    assert.equal(stored.passwordChangedAt, null, 'nothing was stamped');
    assert.equal(await activeSessionsOf(user._id), 1, 'nothing was revoked');
    assert.equal((await sessionsRevokedAllRows(user.businessId)).length, 0, 'no audit row');
    assert.equal(stored.firebaseUid, mine, 'the existing mapping is untouched');
  });

  it('3b. ★ an account carrying NO Firebase identity takes the same refusal', async () => {
    const user = await makeUser(); // legacy account: no firebaseUid at all
    const token = await tokenFor(user);
    setFakeFirebaseToken(tokenPayload({ uid: uidFor() }));

    const res = await bridge(token, { idToken: ID_TOKEN });

    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'FIREBASE_IDENTITY_CONFLICT');
    assert.equal((await reload(user)).passwordChangedAt, null);
    assert.equal(await activeSessionsOf(user._id), 1, 'a legacy account keeps its session');
  });

  // -------------------------------------------------------------------------
  // 4 — recency, from the signed claim only
  // -------------------------------------------------------------------------

  it('4. ★ a STALE authentication answers 409 FIREBASE_REAUTHENTICATION_REQUIRED and mutates nothing', async () => {
    const fb = uidFor();
    const user = await makeUser({ firebaseUid: fb });
    const token = await tokenFor(user);
    setFakeFirebaseToken(tokenPayload({ uid: fb, authTime: nowSec() - (300 + 90) }));

    const res = await bridge(token, { idToken: ID_TOKEN });

    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'FIREBASE_REAUTHENTICATION_REQUIRED');
    assert.equal((await reload(user)).passwordChangedAt, null, 'nothing was stamped');
    assert.equal(await activeSessionsOf(user._id), 1, 'nothing was revoked');
    assert.equal((await sessionsRevokedAllRows(user.businessId)).length, 0, 'no audit row');
  });

  it('4b. ★ a freshly-issued `iat` cannot substitute for a stale `auth_time`', async () => {
    const fb = uidFor();
    const user = await makeUser({ firebaseUid: fb });
    const token = await tokenFor(user);
    // The hourly SDK refresh moves `iat` and leaves the authentication old.
    setFakeFirebaseToken(tokenPayload({ uid: fb, authTime: nowSec() - 3600, iat: nowSec() }));

    const res = await bridge(token, { idToken: ID_TOKEN });

    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'FIREBASE_REAUTHENTICATION_REQUIRED');
    assert.equal((await reload(user)).passwordChangedAt, null);
  });

  it('4c. fails closed when the token carries no usable auth_time', async () => {
    const fb = uidFor();
    const user = await makeUser({ firebaseUid: fb });
    const token = await tokenFor(user);

    for (const bad of [undefined, null, '12345', Number.NaN]) {
      const payload = tokenPayload({ uid: fb });
      if (bad === undefined) delete payload.auth_time;
      else payload.auth_time = bad;
      setFakeFirebaseToken(payload);

      const res = await bridge(token, { idToken: ID_TOKEN });
      assert.equal(res.status, 409, `auth_time ${JSON.stringify(bad)} must not be treated as recent`);
      assert.equal(res.json.code, 'FIREBASE_REAUTHENTICATION_REQUIRED');
      assert.equal((await reload(user)).passwordChangedAt, null);
      assert.equal(await activeSessionsOf(user._id), 1);
    }
  });

  it('4d. a recent authentication is accepted — the window is not applied with extra severity', async () => {
    const fb = uidFor();
    const user = await makeUser({ firebaseUid: fb });
    const token = await tokenFor(user);
    // One minute old: comfortably inside the window.
    //
    // The EXACT boundary (`now - 300 <= window`) is deliberately NOT asserted here
    // and is already pinned by the Phase 32L unit suite against `authTimeIsFresh`
    // itself. Over a live HTTP round trip this case cannot pin it honestly: the
    // payload is built one JS statement before the request and the service reads its
    // own clock, so a second boundary can fall between them and turn an exactly-300
    // case into a 301 — a flaky test that would fail for a reason unrelated to the
    // rule being checked.
    setFakeFirebaseToken(tokenPayload({ uid: fb, authTime: nowSec() - 60 }));

    const res = await bridge(token, { idToken: ID_TOKEN });
    assert.equal(res.status, 200);
    assert.ok((await reload(user)).passwordChangedAt, 'a fresh authentication is admitted');
  });

  // -------------------------------------------------------------------------
  // 5 + 6 — the revocation is total, and only the stamp moves
  // -------------------------------------------------------------------------

  it('5. ★ EVERY session dies, the caller’s own included, and a session minted after the stamp works', async () => {
    const fb = uidFor();
    const business = await makeBusiness();
    const user = await makeUser({ business, firebaseUid: fb });
    const callerToken = await tokenFor(user);
    // Two other devices, so the revocation is proven to be account-wide rather
    // than "the caller's session and nothing else".
    const otherA = await tokenFor(user);
    const otherB = await tokenFor(user);
    assert.equal(await activeSessionsOf(user._id), 3);

    setFakeFirebaseToken(tokenPayload({ uid: fb }));
    const res = await bridge(callerToken, { idToken: ID_TOKEN });
    assert.equal(res.status, 200);

    assert.equal(await activeSessionsOf(user._id), 0, 'no session survived');

    // All three are dead, whatever code requireAuth reports: a token minted in the
    // same second as the stamp is caught by the session check (SESSION_REVOKED),
    // and one minted earlier by the stamp itself (SESSION_INVALIDATED). Both are
    // 401, and asserting the exact one would make this case depend on which side of
    // a second boundary the test happened to run.
    for (const dead of [callerToken, otherA, otherB]) {
      const me = await app.api('GET', ME, { token: dead });
      assert.equal(me.status, 401, 'a revoked session no longer authenticates');
      assert.ok(
        ['SESSION_REVOKED', 'SESSION_INVALIDATED'].includes(me.json.code),
        `unexpected code ${me.json.code} for a revoked session`
      );
    }

    // ★ The other half, and the one that makes the flow work at all: the final
    //   re-exchange's session is valid because its iat is not before the stamp.
    const fresh = await tokenFor(user);
    const me = await app.api('GET', ME, { token: fresh });
    assert.equal(me.status, 200, 'a session minted after the stamp authenticates');
    assert.equal(me.json.user.id, String(user._id));

    const listed = await app.api('GET', SESSIONS, { token: fresh });
    assert.equal(listed.status, 200);
    assert.equal(listed.json.sessions.length, 1, 'the session list agrees with the database');
  });

  it('6. ★ only passwordChangedAt moves — tenant, role, status and the retained hash are untouched', async () => {
    const fb = uidFor();
    const business = await makeBusiness();
    const user = await makeUser({
      business,
      role: 'ADMIN',
      firebaseUid: fb,
      password: 'LegacyPassword123!',
    });
    const token = await tokenFor(user);

    const before = await reload(user);
    const hashBefore = before.passwordHash;

    setFakeFirebaseToken(tokenPayload({ uid: fb }));
    assert.equal((await bridge(token, { idToken: ID_TOKEN })).status, 200);

    const after = await reload(user);
    assert.ok(after.passwordChangedAt, 'stamped');
    assert.equal(after.passwordHash, hashBefore, 'the retained credential is not re-hashed or cleared');
    assert.equal(String(after.businessId), String(business._id), 'tenant untouched');
    assert.equal(after.role, 'ADMIN', 'role untouched');
    assert.equal(after.status, 'ACTIVE', 'status untouched');
    assert.equal(after.firebaseUid, fb, 'the identity stays attached — this is not an unlink');
    assert.equal(after.email, before.email, 'email untouched');
  });

  it('6b. is idempotent: a second bridge call re-stamps and revokes nothing that is already gone', async () => {
    const fb = uidFor();
    const user = await makeUser({ firebaseUid: fb });
    const token = await tokenFor(user);
    setFakeFirebaseToken(tokenPayload({ uid: fb }));

    assert.equal((await bridge(token, { idToken: ID_TOKEN })).status, 200);
    assert.equal(await activeSessionsOf(user._id), 0);

    // A retry arrives on a NEW session (the client re-exchanged), which is exactly
    // the state the recovery flow's retry produces.
    const retryToken = await tokenFor(user);
    const retry = await bridge(retryToken, { idToken: ID_TOKEN });

    assert.equal(retry.status, 200, 'a retry is accepted rather than refused');
    assert.equal(await activeSessionsOf(user._id), 0, 'the retry revokes the session it arrived on too');
  });

  // -------------------------------------------------------------------------
  // 7 — audit behaviour
  // -------------------------------------------------------------------------

  it('7. ★ one SESSIONS_REVOKED_ALL row records how many sessions died, and refusals write none', async () => {
    const fb = uidFor();
    const business = await makeBusiness();
    const user = await makeUser({ business, firebaseUid: fb });
    const token = await tokenFor(user);
    await tokenFor(user); // a second device

    assert.equal((await sessionsRevokedAllRows(business._id)).length, 0);

    setFakeFirebaseToken(tokenPayload({ uid: fb }));
    assert.equal((await bridge(token, { idToken: ID_TOKEN })).status, 200);

    const rows = await sessionsRevokedAllRows(business._id);
    assert.equal(rows.length, 1, 'one durable outcome, one row');
    assert.equal(rows[0].entityType, 'SESSION');
    assert.equal(String(rows[0].userId), String(user._id));
    assert.equal(rows[0].metadata.sessionsRevoked, 2, 'the count is the real one');
    // The trail is ADMIN-readable, so no uid, token or session secret may reach it.
    const surface = bodySurface(rows[0].toObject());
    assert.equal(surface.includes(fb), false, 'a Firebase uid reached the audit trail');
    assert.equal(surface.includes(ID_TOKEN), false, 'an ID token reached the audit trail');

    // A refused call is not an event: nothing durable happened, so nothing is recorded.
    const refused = await makeUser({ business, firebaseUid: uidFor() });
    const refusedToken = await tokenFor(refused);
    setFakeFirebaseToken(tokenPayload({ uid: uidFor() }));
    assert.equal((await bridge(refusedToken, { idToken: ID_TOKEN })).status, 409);
    assert.equal((await sessionsRevokedAllRows(business._id)).length, 1, 'a refusal added no row');
  });

  // -------------------------------------------------------------------------
  // 8 — the body contract, over HTTP
  // -------------------------------------------------------------------------

  it('8. ★ planted body fields cannot steer the operation onto another account', async () => {
    const myUid = uidFor();
    const theirUid = uidFor();
    const business = await makeBusiness();
    const me = await makeUser({ business, firebaseUid: myUid });
    const other = await makeUser({ business, firebaseUid: theirUid });
    const token = await tokenFor(me);
    await tokenFor(other);

    setFakeFirebaseToken(tokenPayload({ uid: myUid }));
    const res = await bridge(token, {
      idToken: ID_TOKEN,
      userId: String(other._id),
      firebaseUid: theirUid,
      businessId: String(business._id),
      role: 'OWNER',
      status: 'ACTIVE',
      all: true,
    });

    assert.equal(res.status, 200);
    assert.ok((await reload(me)).passwordChangedAt, 'the CALLER’S account is the one affected');
    assert.equal((await reload(other)).passwordChangedAt, null, 'the planted account is untouched');
    assert.equal(await activeSessionsOf(other._id), 1, 'the planted account keeps its session');
    assert.equal(bodySurface(res.json).includes(theirUid), false, 'the planted uid is not echoed');
  });

  it('8b. an unauthenticated request is refused before the handler runs', async () => {
    setFakeFirebaseToken(tokenPayload({ uid: uidFor() }));
    const res = await app.api('POST', BRIDGE, { body: { idToken: ID_TOKEN } });

    assert.equal(res.status, 401);
    assert.equal(res.json.code, 'AUTH_REQUIRED');
    assert.deepEqual(verifiedTokens(), [], 'the verifier is never reached without a session');
  });

  it('8c. a missing or blank idToken is a 400 VALIDATION_ERROR, before anything is verified', async () => {
    const fb = uidFor();
    const user = await makeUser({ firebaseUid: fb });
    const token = await tokenFor(user);

    for (const body of [{}, { idToken: '' }, { idToken: '   ' }]) {
      const res = await bridge(token, body);
      assert.equal(res.status, 400);
      assert.equal(res.json.code, 'VALIDATION_ERROR');
      assert.deepEqual(
        res.json.fields.map((p) => p.field),
        ['idToken'],
        `expected only an idToken problem for ${JSON.stringify(body)}`
      );
    }
    assert.deepEqual(verifiedTokens(), [], 'nothing was verified');
    assert.equal((await reload(user)).passwordChangedAt, null);
  });

  // -------------------------------------------------------------------------
  // 9 — authorization inherited from requireAuth
  // -------------------------------------------------------------------------

  it('9. ★ a DISABLED account is refused 403 ACCOUNT_DISABLED and its sessions are not touched', async () => {
    const fb = uidFor();
    const user = await makeUser({ firebaseUid: fb, status: 'DISABLED' });
    const token = await tokenFor(user);
    setFakeFirebaseToken(tokenPayload({ uid: fb }));

    const res = await bridge(token, { idToken: ID_TOKEN });

    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'ACCOUNT_DISABLED');
    assert.equal((await reload(user)).passwordChangedAt, null);
    assert.equal(await activeSessionsOf(user._id), 1, 'requireAuth refuses before the handler');
  });

  it('9b. ★ an account in a non-ACTIVE business is refused 403 BUSINESS_NOT_ACTIVE', async () => {
    const fb = uidFor();
    const business = await makeBusiness({ status: 'SUSPENDED' });
    const user = await makeUser({ business, firebaseUid: fb });
    const token = await tokenFor(user);
    setFakeFirebaseToken(tokenPayload({ uid: fb }));

    const res = await bridge(token, { idToken: ID_TOKEN });

    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'BUSINESS_NOT_ACTIVE');
    assert.equal((await reload(user)).passwordChangedAt, null);
  });

  // -------------------------------------------------------------------------
  // 10 — Firebase not configured
  // -------------------------------------------------------------------------

  it('10. answers 503 FIREBASE_NOT_CONFIGURED when no service account is configured', async () => {
    const fb = uidFor();
    const user = await makeUser({ firebaseUid: fb });
    const token = await tokenFor(user);

    await withFirebaseUnconfigured(async () => {
      // The fake bypasses the admin app entirely, so it must come out for this one
      // or the case would test nothing.
      deregisterFakeFirebaseVerifier();
      try {
        const res = await bridge(token, { idToken: ID_TOKEN });
        assert.equal(res.status, 503);
        assert.equal(res.json.code, 'FIREBASE_NOT_CONFIGURED');
        // A 503 is about the SERVER, not the caller's credential — the session is
        // untouched and no mutation happened.
        assert.equal((await reload(user)).passwordChangedAt, null);
        assert.equal(await activeSessionsOf(user._id), 1);
      } finally {
        registerFakeFirebaseVerifier();
      }
    });
  });

  // -------------------------------------------------------------------------
  // 11 — the authorization contract
  // -------------------------------------------------------------------------

  it('11. ★ the route is registered as requireAuth + controller, with no gate and no second middleware', () => {
    const layer = authRouter.stack.find(
      (entry) => entry.route?.path === '/credentials-changed' && entry.route.methods?.post
    );
    assert.ok(layer, 'POST /api/auth/credentials-changed is registered on the auth router');
    const handlers = layer.route.stack.map((s) => s.handle);
    assert.equal(handlers.length, 2, 'exactly two handlers: the choke point and the controller');
    assert.equal(
      handlers[0],
      requireAuth,
      'requireAuth is first — the route cannot be reached unauthenticated'
    );
    assert.notEqual(handlers[1], requireAuth, 'requireAuth is not applied twice');
    assert.equal(typeof handlers[1], 'function', 'the second handler is the controller');
  });

  it('11b. ★ the Phase 23 authorization contract declares the route in its AUTHENTICATED bucket', () => {
    // The contract suite itself fails if a route lands in NO bucket; this asserts
    // the DECLARATION exists, so the route cannot be covered only by accident.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const contract = fs.readFileSync(path.join(here, 'phase23-authorization-contract.test.mjs'), 'utf8');
    assert.ok(
      contract.includes("route: 'POST /api/auth/credentials-changed'"),
      'the route is declared in the Phase 23 authorization contract'
    );
    assert.ok(
      contract.includes("methods.post") || contract.includes('credentials-changed'),
      'the declaration is discoverable by the classifier'
    );
  });
});
