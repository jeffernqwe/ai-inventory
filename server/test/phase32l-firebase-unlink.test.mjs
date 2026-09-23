// Phase 32L — the Firebase identity UNLINK boundary.
//
// The phase adds ONE route, `POST /api/auth/firebase/unlink`, and this suite is
// organised around the properties that make it safe to have at all. The central
// claims are three, and each is falsifiable rather than restated:
//
//   * POLICY B / THE LAST-METHOD INVARIANT. An account may leave Firebase
//     authority only by establishing a NEW local password in the same transition,
//     so it can never be observed with zero authentication methods. The sharpest
//     test of that is the RETAINED HASH: a Firebase-LINKED account still carries
//     its old bcrypt hash, and the OLD password must be dead afterwards while the
//     NEW one works. An implementation that merely re-enabled the retained hash
//     would pass a naive "unlink worked" test and fail this one.
//
//   * THE IDENTITY IS SERVER-DERIVED, TWICE OVER. The account is `req.user.id` and
//     the identity must EQUAL the uid already on the account. A body naming an
//     identity, an account, a tenant or a role must be inert; a token naming a
//     DIFFERENT identity must be refused without touching the mapping.
//
//   * ★ THE RESET-TOKEN RACE IS CLOSED, BOTH ORDERINGS. Phase 32K's guards are
//     keyed on `firebaseUid` BEING PRESENT, so the transition that clears the field
//     disables them exactly when the new password exists. Two cases pin the fix:
//     R-3 (a token outstanding at unlink time is gone before the write) and R-4
//     (a token ALREADY CLAIMED cannot write through a concurrent unlink). The R-4
//     case reaches the interleaving by interposing on the token claim, because
//     that is the window the fix exists for.
//
// RECENCY IS ENFORCED SERVER-SIDE FROM `auth_time`, and the runtime experiment
// behind Phase 32L is the reason: Firebase was measured ACCEPTING a provider unlink
// at a 390-second-old authentication while refusing `updatePassword` at the same
// age. A client-side reauthentication is therefore useful but is not a control.
// The exact window boundary is pinned in the DB-FREE suite with an injected clock,
// because the route reads the real clock and a one-second tick between the test and
// the service would make an exact-boundary case flaky; the route cases use margins.
//
// The verifier is the Phase 32B test fake installed through the REAL seam
// (`setFirebaseIdTokenVerifier`), so the narrowing in `toVerifiedIdentity` — now
// including the new `auth_time` field — runs on every case exactly as it does in
// production. No case reaches the network and no Firebase project exists.
//
// Registered MIXED in run-tests.mjs: the payload and freshness cases run without a
// database; everything else needs MongoDB.

import 'dotenv/config';

import { it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { ensureDb, disconnectDb } from './helpers.mjs';
import { createTracker, uniqueEmail, uniqueName, issueSessionToken } from './support.mjs';
import { dbSuite, unitSuite } from './testEnv.mjs';

import { createApp } from '../src/app.ts';
import Business from '../src/models/business.model.ts';
import User from '../src/models/user.model.ts';
import Session from '../src/models/session.model.ts';
import AuditLog from '../src/models/auditLog.model.ts';
import PasswordResetToken from '../src/models/passwordResetToken.model.ts';
import { validateFirebaseUnlink } from '../src/utils/validate.ts';
import { authMethodsFor } from '../src/services/auth.service.ts';
import { unlinkFirebaseIdentity } from '../src/services/firebaseUnlink.service.ts';
import { generateResetToken, hashResetToken } from '../src/services/passwordReset.service.ts';
import { AUDIT_ACTIONS } from '../src/constants/audit.ts';
import { FIREBASE_REAUTH_WINDOW_SECONDS, authTimeIsFresh } from '../src/constants/firebase.ts';
import { FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_ACCOUNT_ENV } from '../src/config/firebase.ts';
import { hasCustomFirebaseIdTokenVerifier } from '../src/services/firebase/tokenVerifier.ts';
import {
  registerFakeFirebaseVerifier,
  deregisterFakeFirebaseVerifier,
  setFakeFirebaseToken,
  setFakeFirebaseFailure,
  verifiedTokens,
  clearVerifiedTokens,
} from './fakes/firebaseVerifier.mjs';

const UNLINK = '/api/auth/firebase/unlink';
const LINK = '/api/auth/firebase/link';
const LOGIN = '/api/auth/login';
const RESET = '/api/auth/reset-password';
const ME = '/api/auth/me';

/** The opaque string this suite submits as an ID token. Never a real one. */
const ID_TOKEN = 'phase32l.fake.id-token-that-the-seam-replaces';
const ID_TOKEN_2 = 'phase32l.fake.second-token-that-the-seam-replaces';

const NEW_PASSWORD = 'BrandNewPass123!';
const OLD_PASSWORD = 'OldRetainedPass123!';
const ATTACKER_PASSWORD = 'AttackerPass123!';

const ALL_FIREBASE_ENV = [FIREBASE_SERVICE_ACCOUNT_JSON, ...FIREBASE_ACCOUNT_ENV];

const nowSec = () => Math.floor(Date.now() / 1000);

/**
 * A decoded-token payload in the shape the real verifier resolves with.
 *
 * `auth_time` is the field under test; `iat` is included deliberately so a case
 * can make it LOOK fresh while the authentication is stale, which is how "iat is
 * not a freshness signal" is asserted rather than described.
 */
function tokenPayload({
  uid,
  authTime = nowSec(),
  email = 'phase32l@example.test',
  emailVerified = true,
  iat,
} = {}) {
  return {
    uid,
    email,
    email_verified: emailVerified,
    auth_time: authTime,
    ...(iat === undefined ? {} : { iat }),
  };
}

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
      return { status: res.status, json };
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
  passwordResetMax: 100000,
  passwordResetIpMax: 100000,
  passwordResetConfirmMax: 100000,
};

/** The raw MongoDB document, for assertions the model layer would obscure. */
async function rawUser(id) {
  return mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(id) });
}

/** Runs `fn` and returns the error it threw, or null. */
async function captureRejection(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

/**
 * Runs `fn` with `bcrypt.hash` interposed, and restores it whatever happens.
 *
 * WHY THIS CALL AND NOT A SLEEP. Both the unlink and the reset completion flow
 * through `bcrypt.hash` strictly between READING the account (and evaluating the
 * in-memory guards that read feeds) and WRITING it. An interposition here therefore
 * lands in exactly the window the conditional filters exist for — deterministically,
 * with no reliance on scheduling.
 *
 * It is deliberately NOT hooked on a call that only some code paths make, such as
 * the R-3 token cleanup: a hook that a mutation can stop from being called would
 * make a test fail for a reason unrelated to what it asserts, which is a false
 * signal rather than a stronger test.
 */
async function withHashInterposition(hook, fn) {
  const realHash = bcrypt.hash;
  bcrypt.hash = async function interposed(...args) {
    await hook();
    return realHash.apply(this, args);
  };
  try {
    return await fn();
  } finally {
    bcrypt.hash = realHash;
  }
}

// ===========================================================================
// DB-free: the payload
// ===========================================================================

unitSuite('Phase 32L — the unlink payload (no database)', () => {
  it('requires idToken AND newPassword', () => {
    for (const body of [{}, null, undefined, { idToken: '' }, { idToken: '   ' }, { idToken: 42 }]) {
      const { problems, idToken } = validateFirebaseUnlink(body);
      assert.ok(
        problems.some((p) => p.field === 'idToken'),
        `expected an idToken problem for ${JSON.stringify(body)}`
      );
      assert.ok(
        problems.some((p) => p.field === 'newPassword'),
        `expected a newPassword problem for ${JSON.stringify(body)}`
      );
      assert.equal(idToken, undefined, 'no token is returned alongside a problem');
    }
  });

  it('holds newPassword to the shared policy and reports it under its own field', () => {
    const { problems } = validateFirebaseUnlink({ idToken: ID_TOKEN, newPassword: 'short' });
    assert.deepEqual(
      problems.map((p) => p.field),
      ['newPassword']
    );
    assert.match(problems[0].message, /at least 8/);

    const oversized = validateFirebaseUnlink({ idToken: ID_TOKEN, newPassword: 'x'.repeat(73) });
    assert.deepEqual(
      oversized.problems.map((p) => p.field),
      ['newPassword']
    );
  });

  it('accepts a well-formed payload and rejects an oversized idToken', () => {
    const ok = validateFirebaseUnlink({ idToken: ID_TOKEN, newPassword: NEW_PASSWORD });
    assert.deepEqual(ok.problems, []);
    assert.equal(ok.idToken, ID_TOKEN);
    assert.equal(ok.newPassword, NEW_PASSWORD);

    const big = validateFirebaseUnlink({ idToken: 'x'.repeat(4097), newPassword: NEW_PASSWORD });
    assert.deepEqual(
      big.problems.map((p) => p.field),
      ['idToken']
    );
  });

  // ★ The structural half of the identity claim: the handler has no variable
  //   holding a client-supplied identity, tenant or role, so there is nothing to
  //   forward by accident and no check that could be removed. Asserted on the
  //   RESULT rather than on the source, because a future edit that started
  //   returning `userId` would fail here even if it also added a check.
  it('★ returns ONLY {problems, idToken, newPassword} — nothing else can be forwarded', () => {
    const { problems, idToken, newPassword, ...rest } = validateFirebaseUnlink({
      idToken: ID_TOKEN,
      newPassword: NEW_PASSWORD,
    });
    assert.deepEqual(problems, []);
    assert.equal(idToken, ID_TOKEN);
    assert.equal(newPassword, NEW_PASSWORD);
    assert.deepEqual(Object.keys(rest), [], 'no other field is returned at all');
  });

  it('★ a body naming an identity, an account, a tenant or a role is inert', () => {
    const planted = {
      firebaseUid: 'uid-the-caller-invented',
      userId: '507f1f77bcf86cd799439011',
      businessId: '507f1f77bcf86cd799439012',
      role: 'OWNER',
      status: 'ACTIVE',
      email: 'someone-else@example.test',
      confirmPassword: 'irrelevant',
    };

    const plain = validateFirebaseUnlink({ idToken: ID_TOKEN, newPassword: NEW_PASSWORD });
    const loaded = validateFirebaseUnlink({
      idToken: ID_TOKEN,
      newPassword: NEW_PASSWORD,
      ...planted,
    });

    assert.deepEqual(loaded, plain, 'the planted fields are not "accepted" — they are unread');
    const surface = JSON.stringify(loaded);
    for (const [key, value] of Object.entries(planted)) {
      assert.equal(surface.includes(value), false, `${key} leaked into the validated payload`);
    }
  });
});

// ===========================================================================
// DB-free: the freshness rule
// ===========================================================================

unitSuite('Phase 32L — auth_time freshness (no database)', () => {
  // A FIXED clock, so the boundary is exact rather than racing a second tick.
  const nowMs = Date.UTC(2026, 8, 23, 12, 0, 0);
  const sec = Math.floor(nowMs / 1000);

  it('pins the window at 300 seconds', () => {
    assert.equal(FIREBASE_REAUTH_WINDOW_SECONDS, 300);
  });

  it('accepts at the boundary and refuses one second past it', () => {
    assert.equal(authTimeIsFresh(sec, nowMs), true, 'just authenticated');
    assert.equal(authTimeIsFresh(sec - 299, nowMs), true);
    assert.equal(authTimeIsFresh(sec - 300, nowMs), true, 'exactly at the window edge');
    assert.equal(authTimeIsFresh(sec - 301, nowMs), false, 'one second past it');
    assert.equal(authTimeIsFresh(sec - 3600, nowMs), false, 'an hour old');
  });

  it('honours an explicit window override', () => {
    assert.equal(authTimeIsFresh(sec - 60, nowMs, 30), false);
    assert.equal(authTimeIsFresh(sec - 60, nowMs, 600), true);
  });

  // ★ FAIL-CLOSED. A token that cannot be dated must not be treated as fresh.
  it('★ fails closed on every missing or malformed auth_time', () => {
    for (const bad of [null, undefined, NaN, Infinity, -Infinity, '1790159210', {}, [], true, false]) {
      assert.equal(
        authTimeIsFresh(bad, nowMs),
        false,
        `auth_time ${JSON.stringify(bad)} must NOT be treated as recent`
      );
    }
  });

  it('tolerates a claim slightly in the future — signing-host clock skew', () => {
    assert.equal(authTimeIsFresh(sec + 30, nowMs), true);
  });

  // The property the whole decision turns on: freshness is a fact about the
  // AUTHENTICATION, not about the token's issue time. The helper cannot even
  // express `iat`, which is asserted here by showing the same numeric value only
  // passes when it is passed as the authentication time.
  it('★ freshness is a function of the authentication time alone', () => {
    const staleAuthentication = sec - 1000;
    const freshIssueTime = sec;
    assert.equal(
      authTimeIsFresh(freshIssueTime, nowMs),
      true,
      'a fresh value passes when — and only when — it IS the authentication time'
    );
    assert.equal(
      authTimeIsFresh(staleAuthentication, nowMs),
      false,
      'a stale authentication is stale regardless of when the token was issued'
    );
  });
});

// ===========================================================================
// DB-backed: the route over the shipped app and a real database
// ===========================================================================

const dbOk = await ensureDb();

dbSuite('Phase 32L — Firebase unlink over HTTP and a real database', dbOk, () => {
  const tracker = createTracker(dbOk);
  let app = null;
  let api = null;

  const uidFor = (prefix) => uniqueName(prefix);

  async function makeBusiness({ status = 'ACTIVE' } = {}) {
    const business = await Business.create({ name: uniqueName('Biz32L'), status });
    tracker.trackBusiness(String(business._id));
    return business;
  }

  /**
   * A MongoDB user.
   *
   * `firebaseUid` is written ONLY when supplied. An explicit `null` would create a
   * document shape production never produces — and, worse, one that the sparse
   * unique index WOULD include, which is the very collision the unlink's `$unset`
   * exists to avoid. The suite therefore starts from the real "absent" shape.
   */
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
    const doc = {
      businessId: biz._id,
      name: uniqueName('U32L'),
      email: email ?? uniqueEmail('p32l'),
      role,
      status,
      emailVerified,
    };
    if (firebaseUid) doc.firebaseUid = firebaseUid;
    if (password) doc.passwordHash = bcrypt.hashSync(password, 10);
    const user = await User.create(doc);
    tracker.trackUser(String(user._id));
    return user;
  }

  /** A user plus a live session token, the shape every unlink case starts from. */
  async function makeCaller(options = {}) {
    const user = await makeUser(options);
    return { user, token: await issueSessionToken(user._id) };
  }

  function unlinkBody(overrides = {}) {
    return { idToken: ID_TOKEN, newPassword: NEW_PASSWORD, ...overrides };
  }

  async function unlink(token, body = unlinkBody()) {
    return api('POST', UNLINK, { token, body });
  }

  before(async () => {
    registerFakeFirebaseVerifier();
    const server = await listen(createApp({ requestLogging: false, authLimits: UNCAPPED }));
    app = server;
    api = server.api;
  });

  after(async () => {
    deregisterFakeFirebaseVerifier();
    if (app) await app.close();
    await tracker.cleanup();
  });

  beforeEach(() => {
    clearVerifiedTokens();
  });

  // -------------------------------------------------------------------------
  // The transition itself
  // -------------------------------------------------------------------------

  it('unlinks a Firebase-NATIVE account and establishes the new password', async () => {
    const fb = uidFor('native');
    const email = uniqueEmail('p32l-native');
    const { user, token } = await makeCaller({ firebaseUid: fb, email, emailVerified: true });

    setFakeFirebaseToken(tokenPayload({ uid: fb }));
    const res = await unlink(token);

    assert.equal(res.status, 200);
    assert.equal(res.json.unlinked, true);
    assert.deepEqual(res.json.user.authMethods, { password: true, firebase: false });

    const raw = await rawUser(user._id);
    assert.equal('firebaseUid' in raw, false, 'the field is REMOVED, not blanked');
    assert.equal(raw.emailVerified, false);
    assert.ok(raw.passwordChangedAt instanceof Date, 'passwordChangedAt is stamped');
    assert.equal(typeof raw.passwordHash, 'string');

    // ★ The invariant, read off the document: exactly one usable method.
    assert.deepEqual(authMethodsFor(raw), { password: true, firebase: false });

    const login = await api('POST', LOGIN, { body: { email, password: NEW_PASSWORD } });
    assert.equal(login.status, 200, 'the established password authenticates');
    assert.deepEqual(login.json.user.authMethods, { password: true, firebase: false });
  });

  // ★ The sharpest test of Policy B. A Firebase-LINKED account still carries its
  //   legacy hash; an implementation that re-enabled it instead of replacing it
  //   would leave a credential the user had stopped using (and that an attacker
  //   might still know) able to sign in. This case would pass a naive
  //   "unlink returned 200" test and must fail here.
  it('★ REPLACES a retained hash — the OLD password can never authenticate again', async () => {
    const fb = uidFor('linked');
    const email = uniqueEmail('p32l-linked');
    const { token } = await makeCaller({
      firebaseUid: fb,
      email,
      password: OLD_PASSWORD,
      emailVerified: true,
    });

    // Before: the retained hash is inert because Firebase is the authority (32E).
    const before = await api('POST', LOGIN, { body: { email, password: OLD_PASSWORD } });
    assert.equal(before.status, 403);
    assert.equal(before.json.code, 'FIREBASE_SIGN_IN_REQUIRED');

    setFakeFirebaseToken(tokenPayload({ uid: fb }));
    const res = await unlink(token);
    assert.equal(res.status, 200);

    const oldTry = await api('POST', LOGIN, { body: { email, password: OLD_PASSWORD } });
    assert.equal(oldTry.status, 401, 'the retained hash must NOT be resurrected');
    assert.equal(oldTry.json.code, 'INVALID_CREDENTIALS');

    const newTry = await api('POST', LOGIN, { body: { email, password: NEW_PASSWORD } });
    assert.equal(newTry.status, 200, 'the new password works');

    // And it is a fully functional password account: change-password applies.
    const chg = await api('POST', '/api/auth/change-password', {
      token: newTry.json.token,
      body: { currentPassword: NEW_PASSWORD, newPassword: 'ThirdPassword123!' },
    });
    assert.equal(chg.status, 200, 'no Firebase authority remains in the way');
  });

  it('publishes authMethods through BOTH surfaces (toPublicUser and req.user)', async () => {
    const fb = uidFor('methods');
    const { token } = await makeCaller({ firebaseUid: fb, emailVerified: true });

    const linked = await api('GET', ME, { token });
    assert.equal(linked.status, 200);
    assert.deepEqual(linked.json.user.authMethods, { password: false, firebase: true });

    setFakeFirebaseToken(tokenPayload({ uid: fb }));
    const res = await unlink(token);
    assert.deepEqual(
      res.json.user.authMethods,
      { password: true, firebase: false },
      'toPublicUser'
    );

    const free = await api('POST', LOGIN, {
      body: { email: res.json.user.email, password: NEW_PASSWORD },
    });
    assert.equal(free.status, 200);
    const after = await api('GET', ME, { token: free.json.token });
    assert.deepEqual(after.json.user.authMethods, { password: true, firebase: false }, 'req.user');
  });

  // -------------------------------------------------------------------------
  // Identity / authorization
  // -------------------------------------------------------------------------

  it('refuses an unauthenticated request with 401', async () => {
    const res = await unlink(undefined);
    assert.equal(res.status, 401);
    assert.equal(res.json.code, 'AUTH_REQUIRED');
    assert.equal(verifiedTokens().length, 0, 'the verifier was never reached');
  });

  it('inherits the ACTIVE-business requirement from requireAuth (403)', async () => {
    const suspended = await makeBusiness({ status: 'SUSPENDED' });
    const fb = uidFor('susp');
    const { token } = await makeCaller({ business: suspended, firebaseUid: fb });

    setFakeFirebaseToken(tokenPayload({ uid: fb }));
    const res = await unlink(token);
    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'BUSINESS_NOT_ACTIVE');
    assert.equal(verifiedTokens().length, 0, 'refused before the token is even verified');
  });

  it('refuses a DISABLED account with 403 ACCOUNT_DISABLED', async () => {
    const fb = uidFor('disabled');
    const caller = await makeCaller({ firebaseUid: fb });
    await User.updateOne({ _id: caller.user._id }, { $set: { status: 'DISABLED' } });

    setFakeFirebaseToken(tokenPayload({ uid: fb }));
    const res = await unlink(caller.token);
    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'ACCOUNT_DISABLED');
  });

  // ★ 400, not 401. The client's session-loss rule keys on the STATUS of a
  //   response to a request that carried a token, so a 401 here would sign the
  //   user out over an unrelated Firebase failure — the Phase 32H precedent.
  it('★ answers a rejected Firebase credential with 400, not 401, and keeps the session alive', async () => {
    const fb = uidFor('badtoken');
    const { token } = await makeCaller({ firebaseUid: fb });

    setFakeFirebaseFailure('auth/id-token-expired');
    const res = await unlink(token);
    assert.equal(res.status, 400);
    assert.equal(res.json.code, 'FIREBASE_TOKEN_INVALID');

    const still = await api('GET', ME, { token });
    assert.equal(still.status, 200, 'the Inventory AI session is untouched');
  });

  it('answers 409 FIREBASE_IDENTITY_NOT_LINKED when nothing is connected', async () => {
    const { user, token } = await makeCaller();

    setFakeFirebaseToken(tokenPayload({ uid: uidFor('nobody') }));
    const res = await unlink(token);

    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'FIREBASE_IDENTITY_NOT_LINKED');

    const raw = await rawUser(user._id);
    assert.equal('firebaseUid' in raw, false);
    assert.equal(raw.passwordHash, undefined, 'no credential was invented');

    // Deliberately NOT audited: no mapping changed hands.
    const trail = await AuditLog.find({
      action: AUDIT_ACTIONS.FIREBASE_IDENTITY_UNLINKED,
      userId: user._id,
    });
    assert.equal(trail.length, 0);
  });

  it('★ refuses a uid MISMATCH without touching the existing mapping', async () => {
    const attached = uidFor('attached');
    const presented = uidFor('presented');
    const { user, token } = await makeCaller({ firebaseUid: attached, password: OLD_PASSWORD });

    setFakeFirebaseToken(tokenPayload({ uid: presented }));
    const res = await unlink(token);

    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'FIREBASE_IDENTITY_CONFLICT');

    const raw = await rawUser(user._id);
    assert.equal(raw.firebaseUid, attached, 'the mapping is neither replaced nor transferred');
    assert.equal(
      bcrypt.compareSync(OLD_PASSWORD, raw.passwordHash),
      true,
      'the retained hash is untouched'
    );

    const trail = await AuditLog.findOne({
      action: AUDIT_ACTIONS.FIREBASE_IDENTITY_UNLINK_CONFLICT,
      userId: user._id,
    });
    assert.ok(trail, 'the refusal is audited');
  });

  // ★ The identity the token names belongs to SOMEBODY ELSE. Nothing is merged,
  //   nothing is transferred, and the other account keeps its identity.
  it('★ refuses when the presented identity is held by a DIFFERENT account', async () => {
    const ownersUid = uidFor('owned');
    const other = await makeCaller({ firebaseUid: ownersUid });
    const mineUid = uidFor('mine');
    const { user, token } = await makeCaller({ firebaseUid: mineUid });

    setFakeFirebaseToken(tokenPayload({ uid: ownersUid }));
    const res = await unlink(token);

    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'FIREBASE_IDENTITY_CONFLICT');

    const mine = await rawUser(user._id);
    const theirs = await rawUser(other.user._id);
    assert.equal(mine.firebaseUid, mineUid);
    assert.equal(theirs.firebaseUid, ownersUid, 'the other account keeps its identity');

    // The conflict message names no account, tenant, role or uid.
    const surface = JSON.stringify(res.json);
    for (const value of [String(user._id), String(other.user._id), ownersUid, mineUid]) {
      assert.equal(surface.includes(value), false, 'no identifier is disclosed');
    }
    // …and neither does the audit row, which every ADMIN of the business can read.
    const trail = await AuditLog.findOne({
      action: AUDIT_ACTIONS.FIREBASE_IDENTITY_UNLINK_CONFLICT,
      userId: user._id,
    });
    assert.ok(trail, 'the refusal is audited');
    const trailSurface = JSON.stringify(trail.toObject());
    for (const value of [ownersUid, mineUid, ID_TOKEN]) {
      assert.equal(trailSurface.includes(value), false, `the audit row leaked ${value}`);
    }
  });

  it('★ a body naming an identity and a tenant cannot steer the unlink', async () => {
    const victimUid = uidFor('victim');
    const victim = await makeCaller({ firebaseUid: victimUid });
    const mineUid = uidFor('real');
    const email = uniqueEmail('p32l-plant');
    const me = await makeCaller({ firebaseUid: mineUid, email });

    setFakeFirebaseToken(tokenPayload({ uid: mineUid }));
    const res = await unlink(
      me.token,
      unlinkBody({
        firebaseUid: victimUid,
        userId: String(victim.user._id),
        businessId: String(victim.user.businessId),
        role: 'OWNER',
        status: 'ACTIVE',
      })
    );

    assert.equal(res.status, 200);
    assert.equal(res.json.user.id, String(me.user._id), 'the CALLER was unlinked');

    const mine = await rawUser(me.user._id);
    const theirs = await rawUser(victim.user._id);
    assert.equal('firebaseUid' in mine, false);
    assert.equal(theirs.firebaseUid, victimUid, 'the planted target is untouched');
    assert.equal(theirs.role, 'STAFF', 'role was not read from the body');
  });

  // -------------------------------------------------------------------------
  // Recency
  // -------------------------------------------------------------------------

  it('★ refuses a STALE authentication with FIREBASE_REAUTHENTICATION_REQUIRED and mutates nothing', async () => {
    const fb = uidFor('stale');
    const { user, token } = await makeCaller({ firebaseUid: fb, password: OLD_PASSWORD });

    setFakeFirebaseToken(tokenPayload({ uid: fb, authTime: nowSec() - 1000 }));
    const res = await unlink(token);

    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'FIREBASE_REAUTHENTICATION_REQUIRED');

    const raw = await rawUser(user._id);
    assert.equal(raw.firebaseUid, fb, 'still linked — no mutation');
    assert.equal(bcrypt.compareSync(OLD_PASSWORD, raw.passwordHash), true, 'no new hash written');
    assert.equal(raw.passwordChangedAt, null);

    const sessions = await Session.countDocuments({ userId: user._id, revokedAt: null });
    assert.equal(sessions, 1, 'sessions are NOT revoked by a refusal');
    const still = await api('GET', ME, { token });
    assert.equal(still.status, 200);
  });

  it('accepts a comfortably fresh authentication and refuses one comfortably past the window', async () => {
    const freshUid = uidFor('fresh');
    const fresh = await makeCaller({ firebaseUid: freshUid });
    setFakeFirebaseToken(tokenPayload({ uid: freshUid, authTime: nowSec() - 5 }));
    assert.equal((await unlink(fresh.token)).status, 200);

    const staleUid = uidFor('old');
    const stale = await makeCaller({ firebaseUid: staleUid });
    setFakeFirebaseToken(tokenPayload({ uid: staleUid, authTime: nowSec() - 305 }));
    assert.equal((await unlink(stale.token)).status, 409);
  });

  // ★ `iat` is when THIS token was issued; `auth_time` is when the user
  //   authenticated. The hourly refresh moves `iat` and leaves `auth_time` alone,
  //   so a rule keyed on `iat` would accept an arbitrarily old authentication.
  //   This token LOOKS brand new and must still be refused.
  it('★ a refreshed `iat` cannot substitute for a recent `auth_time`', async () => {
    const fb = uidFor('iat');
    const { user, token } = await makeCaller({ firebaseUid: fb, password: OLD_PASSWORD });

    setFakeFirebaseToken(
      tokenPayload({ uid: fb, authTime: nowSec() - 4000, iat: nowSec() })
    );
    const res = await unlink(token);

    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'FIREBASE_REAUTHENTICATION_REQUIRED');

    const raw = await rawUser(user._id);
    assert.equal(raw.firebaseUid, fb, 'a freshly issued token did not buy a stale authentication');
  });

  it('refuses when the token carries no auth_time at all', async () => {
    const fb = uidFor('noauth');
    const { user, token } = await makeCaller({ firebaseUid: fb });
    const payload = tokenPayload({ uid: fb });
    delete payload.auth_time;

    setFakeFirebaseToken(payload);
    const res = await unlink(token);

    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'FIREBASE_REAUTHENTICATION_REQUIRED');
    assert.equal((await rawUser(user._id)).firebaseUid, fb);
  });

  // The narrowing refuses to COERCE. A numeric STRING is not a number, so it
  // becomes `null` and fails closed: the verifier does not let a token shape it has
  // never seen choose the value the freshness rule compares against.
  it('refuses a non-numeric auth_time rather than coercing it', async () => {
    const fb = uidFor('strtime');
    const { user, token } = await makeCaller({ firebaseUid: fb });
    setFakeFirebaseToken({ ...tokenPayload({ uid: fb }), auth_time: String(nowSec()) });

    const res = await unlink(token);
    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'FIREBASE_REAUTHENTICATION_REQUIRED');
    assert.equal((await rawUser(user._id)).firebaseUid, fb);
  });

  // -------------------------------------------------------------------------
  // Last-method invariant
  // -------------------------------------------------------------------------

  // ★ DEFENCE IN DEPTH, AND IT IS TESTED AS SUCH. The controller's validator refuses
  //   a bad `newPassword`, and the SERVICE refuses it again against the same policy.
  //   A suite that only went through HTTP would leave the service-level check
  //   entirely unmeasured — removing it would change nothing observable, which is
  //   exactly what a mutation pass revealed. So the service is called directly here,
  //   with no HTTP layer in front of it.
  it('★ the service ITSELF refuses a missing or weak password (validator bypassed)', async () => {
    const fb = uidFor('svc-pw');
    const { user } = await makeCaller({ firebaseUid: fb });
    setFakeFirebaseToken(tokenPayload({ uid: fb }));

    for (const bad of [undefined, '', 'short']) {
      const err = await captureRejection(() =>
        unlinkFirebaseIdentity({
          userId: String(user._id),
          businessId: String(user.businessId),
          idToken: ID_TOKEN,
          newPassword: bad,
        })
      );
      assert.ok(err, `expected the service to reject newPassword ${JSON.stringify(bad)}`);
      assert.equal(err.status, 400, `rejection for ${JSON.stringify(bad)} must be a 400`);
      assert.equal(err.code, 'VALIDATION_ERROR');
    }

    const raw = await rawUser(user._id);
    assert.equal(raw.firebaseUid, fb, 'nothing was mutated');
    assert.equal(raw.passwordHash, undefined, 'no credential was written');
  });

  it('requires a new password and refuses a malformed one', async () => {
    const fb = uidFor('nopw');
    const { user, token } = await makeCaller({ firebaseUid: fb });
    setFakeFirebaseToken(tokenPayload({ uid: fb }));

    const missing = await unlink(token, { idToken: ID_TOKEN });
    assert.equal(missing.status, 400);
    assert.equal(missing.json.code, 'VALIDATION_ERROR');
    assert.ok(missing.json.fields.some((f) => f.field === 'newPassword'));

    const weak = await unlink(token, { idToken: ID_TOKEN, newPassword: 'short' });
    assert.equal(weak.status, 400);
    assert.equal(weak.json.code, 'VALIDATION_ERROR');

    const raw = await rawUser(user._id);
    assert.equal(raw.firebaseUid, fb, 'the account is still linked');
    assert.equal(raw.passwordHash, undefined, 'no credential was created');
  });

  // ★ THE INVARIANT ITSELF, asserted rather than described: whatever the
  //   transition does, the account ends with exactly one usable method.
  it('★ never leaves a zero-authentication-method account', async () => {
    for (const start of [
      { firebaseUid: uidFor('inv-native'), password: null },
      { firebaseUid: uidFor('inv-linked'), password: OLD_PASSWORD },
    ]) {
      const email = uniqueEmail('p32l-inv');
      const { user, token } = await makeCaller({ ...start, email });
      setFakeFirebaseToken(tokenPayload({ uid: start.firebaseUid }));

      const res = await unlink(token);
      assert.equal(res.status, 200);

      const raw = await rawUser(user._id);
      const methods = authMethodsFor(raw);
      assert.equal(methods.password, true);
      assert.equal(methods.firebase, false);
      assert.equal(
        typeof raw.passwordHash === 'string' && 'firebaseUid' in raw === false,
        true,
        'exactly one usable method remains'
      );

      const login = await api('POST', LOGIN, { body: { email, password: NEW_PASSWORD } });
      assert.equal(login.status, 200);
    }
  });

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  it('revokes EVERY Inventory AI session on success, and the caller immediately', async () => {
    const fb = uidFor('sessions');
    const email = uniqueEmail('p32l-sess');
    const { user, token } = await makeCaller({ firebaseUid: fb, email });
    const second = await issueSessionToken(user._id, { deviceLabel: 'other-device' });
    assert.equal(await Session.countDocuments({ userId: user._id, revokedAt: null }), 2);

    setFakeFirebaseToken(tokenPayload({ uid: fb }));
    assert.equal((await unlink(token)).status, 200);

    assert.equal(
      await Session.countDocuments({ userId: user._id, revokedAt: null }),
      0,
      'every session is revoked'
    );
    assert.equal((await api('GET', ME, { token })).status, 401, 'the caller must sign in again');
    assert.equal((await api('GET', ME, { token: second })).status, 401);

    const revoked = await AuditLog.findOne({
      action: AUDIT_ACTIONS.SESSIONS_REVOKED_ALL,
      userId: user._id,
    });
    assert.ok(revoked, 'the mass revocation is on the trail');
  });

  // -------------------------------------------------------------------------
  // Concurrency / conditional write
  // -------------------------------------------------------------------------

  // ★ THE CONDITIONAL FILTER, PROVEN RATHER THAN ASSUMED. The uid clause in the
  //   authoritative write (`{ _id, firebaseUid: identity.uid }`) is redundant in the
  //   SEQUENTIAL path — the ownership check above already refuses a mismatch — so
  //   only a race can tell it apart from a bare `{ _id }`. This forces that race
  //   deterministically instead of hoping a sleep produces it.
  //
  //   The interposition is on `bcrypt.hash`, which the unlink service crosses
  //   strictly between the ownership check and the write. It therefore lands AFTER
  //   this request has read and validated the account and BEFORE it writes —
  //   exactly the window the filter exists for.
  //
  //   The invariant: a request that read identity A must not detach identity B,
  //   which arrived while it was in flight. Without the clause the write matches
  //   `{ _id }` and silently `$unset`s B — clearing an identity the caller never
  //   presented, on an account whose authority may have changed hands entirely.
  it('★ the conditional write refuses a STALE identity — a racing swap is not detached', async () => {
    const fb = uidFor('stale');
    const arrivingUid = uidFor('stale-arriving');
    const { user, token } = await makeCaller({ firebaseUid: fb });
    setFakeFirebaseToken(tokenPayload({ uid: fb }));

    let swapped = false;
    const res = await withHashInterposition(async () => {
      if (swapped) return;
      swapped = true;
      // The identity changes hands here: AFTER this request read uid A and passed
      // its ownership check, BEFORE it writes.
      await User.updateOne({ _id: user._id }, { $set: { firebaseUid: arrivingUid } });
    }, () => unlink(token));

    assert.equal(swapped, true, 'the interleaving actually happened');
    assert.equal(res.status, 409, `the write must not land (got ${res.status})`);
    assert.equal(res.json.code, 'FIREBASE_IDENTITY_CONFLICT');

    const raw = await rawUser(user._id);
    assert.equal(raw.firebaseUid, arrivingUid, '★ the arriving identity was NOT detached');
    assert.equal(raw.passwordHash, undefined, '★ no credential was written');
    assert.equal(
      await AuditLog.countDocuments({
        userId: user._id,
        action: AUDIT_ACTIONS.FIREBASE_IDENTITY_UNLINKED,
      }),
      0,
      'no successful transition was recorded'
    );
    assert.equal(
      await AuditLog.countDocuments({
        userId: user._id,
        action: AUDIT_ACTIONS.FIREBASE_IDENTITY_UNLINK_CONFLICT,
      }),
      1,
      'the refused race is recorded as a conflict'
    );
  });

  // ★ EXACTLY ONE WINNER, AND DETERMINISTICALLY SO.
  //
  //   The earlier form of this test asserted "at least one 200 and a non-2xx loser",
  //   and its outcome depended on whether the two requests actually OVERLAPPED —
  //   which is a scheduling accident, not a property. When they did not overlap the
  //   second request simply found nothing linked and the assertions passed for a
  //   reason unrelated to the filter. A mutation removing that filter was therefore
  //   caught only sometimes.
  //
  //   A BARRIER, not a sleep: both requests are held at `bcrypt.hash` — between the
  //   ownership check and the write — until the SECOND has arrived, so both have read
  //   the same pre-unlink account before either writes. That is the interleaving the
  //   conditional filter exists to adjudicate, and it now happens every time.
  //   The timeout is a safety valve that FAILS the test rather than a mechanism: it
  //   only fires if a request never reaches the window, which would itself be a bug.
  it('★ two concurrent unlinks yield exactly one 200 and one 409, and exactly one transition', async () => {
    const fb = uidFor('race');
    const email = uniqueEmail('p32l-race');
    const { user, token } = await makeCaller({ firebaseUid: fb, email });
    setFakeFirebaseToken(tokenPayload({ uid: fb }));

    let arrived = 0;
    let releaseBarrier = null;
    const barrier = new Promise((resolve) => {
      releaseBarrier = resolve;
    });
    const [a, b] = await withHashInterposition(async () => {
      arrived += 1;
      if (arrived === 2) releaseBarrier();
      let valve = null;
      const guard = new Promise((_, reject) => {
        valve = setTimeout(
          () => reject(new Error('barrier: only one request reached the write window')),
          15000
        );
        valve.unref?.();
      });
      try {
        await Promise.race([barrier, guard]);
      } finally {
        clearTimeout(valve);
      }
    }, () => Promise.all([unlink(token), unlink(token)]));

    assert.equal(arrived, 2, 'both requests reached the write window, so they genuinely overlapped');
    const statuses = [a.status, b.status].sort((x, y) => x - y);
    assert.deepEqual(statuses, [200, 409], `exactly one winner (got ${JSON.stringify([a.status, b.status])})`);

    const winner = a.status === 200 ? a : b;
    const loser = a.status === 200 ? b : a;
    assert.equal(winner.json.unlinked, true);
    assert.equal(
      loser.json.code,
      'FIREBASE_IDENTITY_NOT_LINKED',
      'the loser is refused by the frozen code — the winner removed the identity under it'
    );

    const raw = await rawUser(user._id);
    assert.equal('firebaseUid' in raw, false, 'the identity is removed');
    assert.equal(typeof raw.passwordHash, 'string');
    assert.deepEqual(authMethodsFor(raw), { password: true, firebase: false });
    assert.equal(
      await Session.countDocuments({ userId: user._id, revokedAt: null }),
      0,
      'no session survives the transition'
    );

    // Exactly ONE successful transition, recorded once — and no conflict row,
    // because the loser took the "nothing is linked" path rather than a mismatch.
    assert.equal(
      await AuditLog.countDocuments({
        userId: user._id,
        action: AUDIT_ACTIONS.FIREBASE_IDENTITY_UNLINKED,
      }),
      1,
      'exactly one successful transition'
    );
    assert.equal(
      await AuditLog.countDocuments({
        userId: user._id,
        action: AUDIT_ACTIONS.FIREBASE_IDENTITY_UNLINK_CONFLICT,
      }),
      0,
      'the loser is not a conflict — no identity mismatch occurred'
    );

    const login = await api('POST', LOGIN, { body: { email, password: NEW_PASSWORD } });
    assert.equal(login.status, 200, 'the winner\u2019s password is the one in force');
  });

  it('a link cannot run against an account that is still linked (CASE D preserved)', async () => {
    const fb = uidFor('caseD');
    const { token } = await makeCaller({ firebaseUid: fb });
    setFakeFirebaseToken(tokenPayload({ uid: uidFor('other') }));

    const res = await api('POST', LINK, { token, body: { idToken: ID_TOKEN } });
    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'FIREBASE_IDENTITY_CONFLICT');
  });

  it('unlink then link restores Firebase authority, flipping authMethods back', async () => {
    const fb = uidFor('relink');
    const email = uniqueEmail('p32l-relink');
    const { user, token } = await makeCaller({ firebaseUid: fb, email });
    setFakeFirebaseToken(tokenPayload({ uid: fb }));
    assert.equal((await unlink(token)).status, 200);

    const fresh = await api('POST', LOGIN, { body: { email, password: NEW_PASSWORD } });
    assert.equal(fresh.status, 200);

    const newUid = uidFor('relinked');
    setFakeFirebaseToken(tokenPayload({ uid: newUid }));
    const link = await api('POST', LINK, { token: fresh.json.token, body: { idToken: ID_TOKEN_2 } });
    assert.equal(link.status, 200);
    assert.equal(link.json.linked, true);
    assert.deepEqual(link.json.user.authMethods, { password: false, firebase: true });

    const raw = await rawUser(user._id);
    assert.equal(raw.firebaseUid, newUid);
  });

  // -------------------------------------------------------------------------
  // ★ The reset-token race (R-3 and R-4)
  // -------------------------------------------------------------------------

  /**
   * A reset token for `userId`, created DIRECTLY through the model.
   *
   * Necessary rather than convenient: `requestPasswordReset` refuses to mint one
   * for an account that carries a `firebaseUid` (the Phase 32K guard), so the only
   * way to model "a link issued before this account was linked" is to write the row
   * the way the pre-link request path would have.
   */
  async function plantResetToken(userId) {
    const raw = generateResetToken();
    await PasswordResetToken.create({
      userId,
      tokenHash: hashResetToken(raw),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });
    return raw;
  }

  it('★ R-3 — an outstanding reset token is destroyed by the unlink and cannot be spent', async () => {
    const fb = uidFor('r3');
    const email = uniqueEmail('p32l-r3');
    const { user, token } = await makeCaller({ firebaseUid: fb, email, password: OLD_PASSWORD });

    // (a) A SEPARATE token, used only to show that the Phase 32K completion guard
    //     refuses while the account is linked. Separate on purpose: this attempt
    //     SPENDS its token, and a shared row would make the count in (c) below
    //     measure the spending rather than the deletion.
    const gated = await plantResetToken(user._id);
    const whileLinked = await api('POST', RESET, {
      body: { token: gated, newPassword: ATTACKER_PASSWORD, confirmPassword: ATTACKER_PASSWORD },
    });
    assert.equal(whileLinked.status, 400);
    assert.equal(whileLinked.json.code, 'INVALID_RESET_TOKEN');

    // (b) The token that matters: issued BEFORE the account was linked.
    const raw = await plantResetToken(user._id);
    assert.equal(
      await PasswordResetToken.countDocuments({ userId: user._id, usedAt: null }),
      1,
      'precondition: exactly one UNSPENT row'
    );

    setFakeFirebaseToken(tokenPayload({ uid: fb }));
    assert.equal((await unlink(token)).status, 200);

    // ★ (c) R-3. The unused count is 0 because the row was DELETED — and the row is
    //   asserted gone by hash as well, so a merely-spent token could not satisfy
    //   this.
    assert.equal(
      await PasswordResetToken.countDocuments({ userId: user._id, usedAt: null }),
      0,
      'every outstanding reset token is invalidated before the authoritative write'
    );
    assert.equal(
      await PasswordResetToken.findOne({ tokenHash: hashResetToken(raw) }),
      null,
      'the outstanding row is removed outright, not left spent'
    );

    const spend = await api('POST', RESET, {
      body: { token: raw, newPassword: ATTACKER_PASSWORD, confirmPassword: ATTACKER_PASSWORD },
    });
    assert.equal(spend.status, 400);
    assert.equal(spend.json.code, 'INVALID_RESET_TOKEN');

    const good = await api('POST', LOGIN, { body: { email, password: NEW_PASSWORD } });
    assert.equal(good.status, 200, 'the password established by the unlink survives');
    const bad = await api('POST', LOGIN, { body: { email, password: ATTACKER_PASSWORD } });
    assert.equal(bad.status, 401, 'the reset never landed');
  });

  // ★ R-4. The link is CLAIMED first, and the unlink lands in the window between
  //   that claim and the completion write — the exact interleaving a baseline read
  //   during the request could not detect. The completion must refuse and leave the
  //   newer credential alone.
  //
  //   The interposition is on the token claim itself, which is where the window
  //   opens; `User.findOneAndUpdate` in this flow IS the completion write, so the
  //   unlink effect is applied before it is reached.
  it('★ R-4 — a CLAIMED token cannot overwrite the password a concurrent unlink installs', async () => {
    const fb = uidFor('r4');
    const email = uniqueEmail('p32l-r4');
    const unlinkPassword = 'UnlinkSetThis123!';
    const user = await makeUser({ firebaseUid: fb, email, password: OLD_PASSWORD });

    // A legacy-shaped reset token, issued while this account still had a password.
    const raw = generateResetToken();
    await PasswordResetToken.create({
      userId: user._id,
      tokenHash: hashResetToken(raw),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });

    const realClaim = PasswordResetToken.findOneAndUpdate.bind(PasswordResetToken);
    let interposed = false;
    PasswordResetToken.findOneAndUpdate = async function (filter, update, options) {
      const claimed = await realClaim(filter, update, options);
      if (claimed && !interposed) {
        interposed = true;
        // The unlink lands here: authority cleared, a NEW password established,
        // passwordChangedAt stamped — exactly the write Phase 32L performs.
        await User.updateOne(
          { _id: user._id },
          {
            $unset: { firebaseUid: 1 },
            $set: {
              passwordChangedAt: new Date(),
              emailVerified: false,
              passwordHash: bcrypt.hashSync(unlinkPassword, 10),
            },
          }
        );
      }
      return claimed;
    };

    let spend;
    try {
      spend = await api('POST', RESET, {
        body: { token: raw, newPassword: ATTACKER_PASSWORD, confirmPassword: ATTACKER_PASSWORD },
      });
    } finally {
      PasswordResetToken.findOneAndUpdate = realClaim;
    }

    assert.equal(interposed, true, 'the interleaving actually happened');
    assert.equal(spend.status, 400);
    assert.equal(spend.json.code, 'INVALID_RESET_TOKEN', 'the completion refuses to write');

    const raw4 = await rawUser(user._id);
    assert.equal(
      bcrypt.compareSync(unlinkPassword, raw4.passwordHash),
      true,
      '★ the password the unlink installed SURVIVES'
    );
    assert.equal(
      bcrypt.compareSync(ATTACKER_PASSWORD, raw4.passwordHash),
      false,
      'the reset password never landed'
    );

    const stillGood = await api('POST', LOGIN, { body: { email, password: unlinkPassword } });
    assert.equal(stillGood.status, 200);
    const blocked = await api('POST', LOGIN, { body: { email, password: ATTACKER_PASSWORD } });
    assert.equal(blocked.status, 401);
  });

  // The second ordering the freeze adopted: a token that predates an ordinary
  // password change must not survive it either. Same mechanism, no Firebase
  // involved — which is the point: the fix is a property of the completion write,
  // not of the unlink path.
  it('★ R-4 — a token issued before an ordinary password change cannot overwrite it', async () => {
    const email = uniqueEmail('p32l-chg');
    const changed = 'ChangedPassword123!';
    const user = await makeUser({ email, password: OLD_PASSWORD });
    const raw = await plantResetToken(user._id);

    // A password change lands after the token was issued.
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordHash: bcrypt.hashSync(changed, 10), passwordChangedAt: new Date() } }
    );

    const spend = await api('POST', RESET, {
      body: { token: raw, newPassword: ATTACKER_PASSWORD, confirmPassword: ATTACKER_PASSWORD },
    });
    assert.equal(spend.status, 400);
    assert.equal(spend.json.code, 'INVALID_RESET_TOKEN');

    const raw2 = await rawUser(user._id);
    assert.equal(bcrypt.compareSync(changed, raw2.passwordHash), true, 'the newer password survives');
    assert.equal(bcrypt.compareSync(ATTACKER_PASSWORD, raw2.passwordHash), false);
  });

  // ★ THE CLAUSE THE ORIGINAL R-4 TEST COULD NOT SEE. R-4 has TWO halves, and the
  //   first version measured only one of them. Its interposition was on the CLAIM,
  //   which runs BEFORE the user is read, so the competing change it applied always
  //   moved `passwordChangedAt` and was refused by the `$or` — leaving the
  //   `firebaseUid: null` half entirely unmeasured.
  //
  //   The half is real, and this is the interleaving that needs it: the account
  //   ACQUIRES Firebase authority inside the request, after the read that fed the
  //   Phase 32K in-memory guard (`if (user.firebaseUid) throw invalidResetToken()`),
  //   and before the completion write.
  //
  //   The `$or` cannot cover it, because LINKING DOES NOT MOVE `passwordChangedAt`:
  //   the nullity arm still matches, so without the uid clause the write would land
  //   a local password on an account under Firebase authority — re-creating exactly
  //   the credential Phase 32K says must not be usable while `firebaseUid` is set.
  //
  //   The interposition is on `bcrypt.hash`, which the completion flows through
  //   strictly between the read (and its guard) and the conditional write. That
  //   makes it deterministic: the guard has ALREADY been evaluated against the
  //   pre-link document when the link happens.
  it('★ R-4 — a LINK landing after the reset read is refused by the uid clause', async () => {
    const email = uniqueEmail('p32l-r4link');
    const user = await makeUser({ email });
    assert.equal((await rawUser(user._id)).passwordChangedAt, null, 'precondition: never changed');
    const raw = await plantResetToken(user._id);
    const arrivingUid = uidFor('r4link-arriving');

    let linkedInFlight = false;
    const spend = await withHashInterposition(async () => {
      if (linkedInFlight) return;
      linkedInFlight = true;
      // The account acquires Firebase authority here — after the reset flow read it
      // and passed the in-memory guard, before the completion write. Note what is
      // deliberately NOT touched: `passwordChangedAt`.
      await User.updateOne({ _id: user._id }, { $set: { firebaseUid: arrivingUid } });
    }, () =>
      api('POST', RESET, {
        body: { token: raw, newPassword: ATTACKER_PASSWORD, confirmPassword: ATTACKER_PASSWORD },
      })
    );

    assert.equal(linkedInFlight, true, 'the interleaving actually happened');
    assert.equal(spend.status, 400, `the completion must refuse (got ${spend.status})`);
    assert.equal(spend.json.code, 'INVALID_RESET_TOKEN');

    const raw4 = await rawUser(user._id);
    assert.equal(raw4.firebaseUid, arrivingUid, '★ the arriving identity is untouched');
    assert.equal(raw4.passwordHash, undefined, '★ NO local password was written');
    assert.equal(raw4.passwordChangedAt, null, 'nothing was stamped');
  });

  it('★ a NORMAL reset still works — the condition does not break the legitimate flow', async () => {
    const email = uniqueEmail('p32l-ok');
    const user = await makeUser({ email, password: OLD_PASSWORD });
    const raw = await plantResetToken(user._id);

    const spend = await api('POST', RESET, {
      body: { token: raw, newPassword: 'LegitResetPass123!', confirmPassword: 'LegitResetPass123!' },
    });
    assert.equal(spend.status, 200, 'an ordinary reset completes');

    const login = await api('POST', LOGIN, { body: { email, password: 'LegitResetPass123!' } });
    assert.equal(login.status, 200);
    assert.equal(await PasswordResetToken.countDocuments({ userId: user._id, usedAt: null }), 0);
  });

  // A user who has NEVER changed their password carries `passwordChangedAt: null`,
  // and the condition must still admit them — otherwise the fix would break every
  // account that predates it.
  it('★ a reset still works for an account whose passwordChangedAt is null', async () => {
    const email = uniqueEmail('p32l-null');
    const user = await makeUser({ email, password: OLD_PASSWORD });
    assert.equal((await rawUser(user._id)).passwordChangedAt, null);

    const raw = await plantResetToken(user._id);
    const spend = await api('POST', RESET, {
      body: { token: raw, newPassword: 'NullStampPass123!', confirmPassword: 'NullStampPass123!' },
    });
    assert.equal(spend.status, 200);
    assert.equal(
      (await api('POST', LOGIN, { body: { email, password: 'NullStampPass123!' } })).status,
      200
    );
  });

  // -------------------------------------------------------------------------
  // Audit hygiene
  // -------------------------------------------------------------------------

  it('records FIREBASE_IDENTITY_UNLINKED and leaks no sensitive value', async () => {
    const fb = uidFor('audit');
    const email = uniqueEmail('p32l-audit');
    const { user, token } = await makeCaller({ firebaseUid: fb, email, password: OLD_PASSWORD });

    setFakeFirebaseToken(tokenPayload({ uid: fb }));
    assert.equal((await unlink(token)).status, 200);

    const rows = await AuditLog.find({
      action: AUDIT_ACTIONS.FIREBASE_IDENTITY_UNLINKED,
      userId: user._id,
    });
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.entityType, 'USER');
    assert.equal(row.metadata.passwordEstablished, true);

    // ★ Nothing sensitive reaches the trail, which every ADMIN of the business can
    //   read. The detached uid is the sharpest of these: it is the identity join key.
    const surface = JSON.stringify(row.toObject());
    for (const secret of [
      fb,
      ID_TOKEN,
      NEW_PASSWORD,
      OLD_PASSWORD,
      'passwordHash',
      '$2b$',
      '$2a$',
    ]) {
      assert.equal(surface.includes(secret), false, `audit row leaked ${secret}`);
    }
  });

  it('does NOT write an UNLINKED row for a refused attempt', async () => {
    const fb = uidFor('norecord');
    const { user, token } = await makeCaller({ firebaseUid: fb, password: OLD_PASSWORD });
    setFakeFirebaseToken(tokenPayload({ uid: fb, authTime: nowSec() - 900 }));
    assert.equal((await unlink(token)).status, 409);

    const rows = await AuditLog.find({
      action: AUDIT_ACTIONS.FIREBASE_IDENTITY_UNLINKED,
      userId: user._id,
    });
    assert.equal(rows.length, 0, 'a refusal is not an unlink');
  });

  // -------------------------------------------------------------------------
  // Configuration boundary
  // -------------------------------------------------------------------------

  // The Phase 32B domain error must reach the client as its own status, not as a
  // generic 500. The fake verifier has to come out for this one — it bypasses the
  // admin app entirely, so leaving it installed would test nothing.
  it('answers 503 when no Firebase service account is configured', async () => {
    const fb = uidFor('unconf');
    const { user, token } = await makeCaller({ firebaseUid: fb });

    await withFirebaseUnconfigured(async () => {
      deregisterFakeFirebaseVerifier();
      try {
        const res = await unlink(token);
        assert.equal(res.status, 503);
        assert.equal(res.json.code, 'FIREBASE_NOT_CONFIGURED');
      } finally {
        registerFakeFirebaseVerifier();
      }
    });

    // Nothing was mutated by an operator-side misconfiguration.
    assert.equal((await rawUser(user._id)).firebaseUid, fb);
  });

  it('★ the suite never installed a custom verifier outside its own lifetime', async () => {
    assert.equal(hasCustomFirebaseIdTokenVerifier(), true, 'the fake is installed');
  });
});

after(async () => {
  await disconnectDb();
});
