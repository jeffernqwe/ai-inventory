// Phase 32E — the legacy password route refusing an account that Firebase owns.
//
// This suite exists because Phase 32E makes a password stop working, and a change
// that removes a working credential is exactly the kind that must not be trusted to
// inspection. Every case here is an ORDERING claim, not a happy path:
//
//   * The guard sits BEHIND the password comparison, so it cannot be an
//     enumeration oracle. Proven from both sides: a caller with the wrong password
//     gets the ordinary 401, and the 401 bodies for "unknown email" and "wrong
//     password on a linked account" are asserted byte-identical.
//   * The guard sits BEHIND the status check, so a disabled account still reports
//     ACCOUNT_DISABLED on this route — including when it is ALSO Firebase-linked,
//     which is the only case that can tell the two orders apart.
//   * The guard sits AHEAD of the tenant check and every write, so a refusal
//     creates no session and no SESSION_CREATED audit row.
//   * NOBODY IS LOCKED OUT. The account the guard refuses still signs in through
//     the route that exists for it — asserted here against the real exchange
//     endpoint, because a guard that merely moves the lockout is not a fix.
//
// The Firebase verifier is the Phase 32B test fake installed through the real seam,
// so no case reaches the network and no Firebase project exists.
//
// Registered PURE_DB in run-tests.mjs: every case needs a real MongoDB, and there
// is nothing here that a database-free run could honestly assert.

import 'dotenv/config';

import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { ensureDb, disconnectDb } from './helpers.mjs';
import { createTracker, uniqueEmail, uniqueName } from './support.mjs';
import { dbSuite } from './testEnv.mjs';

import { createApp } from '../src/app.ts';
import { decodeAccessToken } from '../src/config/jwt.ts';
import Business from '../src/models/business.model.ts';
import User from '../src/models/user.model.ts';
import Session from '../src/models/session.model.ts';
import { FIREBASE_SIGN_IN_REQUIRED_CODE } from '../src/services/auth.service.ts';
import {
  registerFakeFirebaseVerifier,
  deregisterFakeFirebaseVerifier,
  setFakeFirebaseToken,
} from './fakes/firebaseVerifier.mjs';

const LOGIN = '/api/auth/login';
const EXCHANGE = '/api/auth/firebase/exchange';

/** The opaque string this suite submits as an ID token. Never a real one. */
const ID_TOKEN = 'phase32e.fake.id-token-that-the-seam-replaces';

const PASSWORD = 'Password123!';
const WRONG_PASSWORD = 'NotThePassword123!';

/** The code the guard emits, restated so the assertion cannot drift with it. */
const EXPECTED_CODE = 'FIREBASE_SIGN_IN_REQUIRED';

/** Limiters opened wide, so no case here can trip one. */
const UNCAPPED = {
  loginMax: 100000,
  loginIpMax: 100000,
  registerMax: 100000,
  firebaseExchangeMax: 100000,
  firebaseRegisterMax: 100000,
};

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
      return { status: res.status, json };
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

const dbOk = await ensureDb();

dbSuite('Phase 32E — the legacy password guard against a real database', dbOk, () => {
  const tracker = createTracker(dbOk);
  let app = null;

  async function makeBusiness({ status = 'ACTIVE' } = {}) {
    const business = await Business.create({ name: uniqueName('Biz32E'), status });
    tracker.trackBusiness(String(business._id));
    return business;
  }

  /**
   * A MongoDB user. `linked` decides whether it carries a `firebaseUid`, which is
   * the single input the guard reads — everything else about the two shapes is
   * deliberately identical, so a case that passes cannot be passing for a reason
   * other than that field.
   */
  async function makeUser({ business, status = 'ACTIVE', linked = false, password = PASSWORD } = {}) {
    const biz = business ?? (await makeBusiness());
    const user = await User.create({
      businessId: biz._id,
      name: uniqueName('U32E'),
      email: uniqueEmail('u32e'),
      ...(password ? { passwordHash: bcrypt.hashSync(password, 10) } : {}),
      ...(linked ? { firebaseUid: uniqueName('uid32e') } : {}),
      role: 'OWNER',
      status,
    });
    tracker.trackUser(String(user._id));
    return user;
  }

  const login = (body) => app.api('POST', LOGIN, { body });
  const exchange = (body) => app.api('POST', EXCHANGE, { body });

  const activeSessionsOf = (userId) =>
    Session.countDocuments({ userId: new mongoose.Types.ObjectId(String(userId)), revokedAt: null });

  async function createdSessions(userId) {
    return mongoose.connection.db
      .collection('audit_logs')
      .countDocuments({
        userId: new mongoose.Types.ObjectId(String(userId)),
        action: 'SESSION_CREATED',
      });
  }

  before(async () => {
    registerFakeFirebaseVerifier();
    app = await listen(createApp({ requestLogging: false, authLimits: UNCAPPED }));
  });

  after(async () => {
    deregisterFakeFirebaseVerifier();
    if (app) await app.close();
    await tracker.cleanup();
    await disconnectDb();
  });

  // -------------------------------------------------------------------------
  // The unchanged half — what must NOT have moved
  // -------------------------------------------------------------------------

  it('1. a legacy-only account still signs in exactly as before', async () => {
    const user = await makeUser({ linked: false });

    const res = await login({ email: user.email, password: PASSWORD });

    assert.equal(res.status, 200, 'the password path is untouched for an unlinked account');
    assert.equal(res.json.user.id, String(user._id));
    assert.ok(decodeAccessToken(res.json.token).jti, 'and still opens a real session');
    assert.equal(await activeSessionsOf(user._id), 1);
  });

  it('2. a wrong password on a legacy-only account is still the generic 401', async () => {
    const user = await makeUser({ linked: false });

    const res = await login({ email: user.email, password: WRONG_PASSWORD });

    assert.equal(res.status, 401);
    assert.equal(res.json.code, 'INVALID_CREDENTIALS');
  });

  it('3. a disabled account still reports ACCOUNT_DISABLED, guard or no guard', async () => {
    const user = await makeUser({ status: 'DISABLED', linked: false });

    const res = await login({ email: user.email, password: PASSWORD });

    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'ACCOUNT_DISABLED', 'the guard did not steal this outcome');
  });

  it('4. an inactive business still answers BUSINESS_NOT_ACTIVE for a legacy account', async () => {
    const business = await makeBusiness({ status: 'SUSPENDED' });
    const user = await makeUser({ business, linked: false });

    const res = await login({ email: user.email, password: PASSWORD });

    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'BUSINESS_NOT_ACTIVE');
  });

  // -------------------------------------------------------------------------
  // ★ The guard itself
  // -------------------------------------------------------------------------

  it('5. ★ a Firebase-linked account cannot sign in with its retained password', async () => {
    // The bypass Phase 32E closes. This account holds a VALID bcrypt hash — the
    // password below is correct — and is refused anyway, because the credential
    // that owns it now lives in Firebase.
    const user = await makeUser({ linked: true });

    const res = await login({ email: user.email, password: PASSWORD });

    assert.equal(res.status, 403);
    assert.equal(res.json.code, EXPECTED_CODE);
    assert.equal(res.json.code, FIREBASE_SIGN_IN_REQUIRED_CODE, 'the exported constant is the contract');
    assert.equal(res.json.token, undefined, 'no token is handed out');
    assert.equal(await activeSessionsOf(user._id), 0, 'and no session row is written');
  });

  it('6. ★ the refusal is not an enumeration oracle', async () => {
    // The guard sits BEHIND the password comparison, so the only caller who can
    // ever see FIREBASE_SIGN_IN_REQUIRED is one who already holds a working
    // credential. A caller without one must learn nothing — not the linked
    // account's existence, and not whether the email exists at all. Asserted as
    // byte-identical bodies rather than two equal statuses.
    const linked = await makeUser({ linked: true });
    const unknownEmail = uniqueEmail('ghost32e');

    const wrongPassword = await login({ email: linked.email, password: WRONG_PASSWORD });
    const noSuchUser = await login({ email: unknownEmail, password: PASSWORD });

    assert.equal(wrongPassword.status, 401, 'a bad password never reaches the guard');
    assert.equal(noSuchUser.status, 401);
    assert.deepEqual(
      wrongPassword.json,
      noSuchUser.json,
      'the two 401s must be indistinguishable',
    );
    assert.equal(wrongPassword.json.code, 'INVALID_CREDENTIALS');
  });

  it('7. ★ a disabled AND linked account reports ACCOUNT_DISABLED, not the Firebase code', async () => {
    // The only case that can tell the two orderings apart. The owner's decision
    // places the guard AFTER the status check, so disablement keeps its existing
    // meaning on this route; a guard placed before it would answer
    // FIREBASE_SIGN_IN_REQUIRED here and quietly change what DISABLED reports.
    const user = await makeUser({ status: 'DISABLED', linked: true });

    const res = await login({ email: user.email, password: PASSWORD });

    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'ACCOUNT_DISABLED');
    assert.notEqual(res.json.code, EXPECTED_CODE);
  });

  it('8. ★ a linked account in an inactive business is refused before the tenant is checked', async () => {
    // The guard sits AHEAD of `assertActiveBusiness`. That is the approved order,
    // and its observable consequence is this: the tenant's state is not reported to
    // a caller who has already proved the password but may not use it. Pinned so the
    // ordering cannot drift silently — the legacy case (4) is the contrast.
    const business = await makeBusiness({ status: 'SUSPENDED' });
    const user = await makeUser({ business, linked: true });

    const res = await login({ email: user.email, password: PASSWORD });

    assert.equal(res.status, 403);
    assert.equal(res.json.code, EXPECTED_CODE);
    assert.notEqual(res.json.code, 'BUSINESS_NOT_ACTIVE');
    assert.equal(await activeSessionsOf(user._id), 0);
  });

  it('9. ★ a refused login writes no SESSION_CREATED audit row', async () => {
    const user = await makeUser({ linked: true });
    const before = await createdSessions(user._id);

    const res = await login({ email: user.email, password: PASSWORD });
    assert.equal(res.status, 403);

    assert.equal(await createdSessions(user._id), before, 'a refusal records nothing');
  });

  it('10. the refusal body names no uid and no internal detail', async () => {
    const user = await makeUser({ linked: true });

    const res = await login({ email: user.email, password: PASSWORD });
    const surface = JSON.stringify(res.json ?? null);

    assert.equal(surface.includes(user.firebaseUid), false, 'the uid must not be echoed');
    assert.equal(surface.includes(user.firebaseUid.slice(0, 6)), false, 'nor any fragment of it');
    assert.equal(surface.includes(String(user._id)), false, 'nor the user id');
    assert.equal(surface.includes(String(user.businessId)), false, 'nor the business id');
    assert.equal(surface.includes('firebaseUid'), false, 'nor the field name');
  });

  // -------------------------------------------------------------------------
  // ★ No lockout — the account the guard refuses still has a way in
  // -------------------------------------------------------------------------

  it('11. ★ the refused account signs in through the Firebase exchange instead', async () => {
    // The property that makes this a migration rather than a lockout. Without this
    // case the guard would be indistinguishable from "delete the account's access",
    // and Phase 32A §9.2's "no user is ever unable to sign in" would be unverified.
    const user = await makeUser({ linked: true });
    setFakeFirebaseToken({ uid: user.firebaseUid, email: user.email, email_verified: true });

    const refused = await login({ email: user.email, password: PASSWORD });
    assert.equal(refused.status, 403, 'the legacy door is closed');

    const exchanged = await exchange({ idToken: ID_TOKEN });

    assert.equal(exchanged.status, 200, 'and the Firebase door is open');
    assert.equal(exchanged.json.user.id, String(user._id), 'to the same account');
    assert.equal(exchanged.json.user.businessId, String(user.businessId));
    assert.ok(decodeAccessToken(exchanged.json.token).jti);
    assert.equal(await activeSessionsOf(user._id), 1);
  });

  it('12. ★ an unlinked account is never refused by the guard, whatever else it carries', async () => {
    // The guard reads `firebaseUid` and nothing else. An account with no uid is
    // admitted even when it shares every other Firebase-adjacent field — so a future
    // field cannot silently become a second lock on the legacy path.
    const business = await makeBusiness();
    const user = await User.create({
      businessId: business._id,
      name: uniqueName('U32E'),
      email: uniqueEmail('unlinked32e'),
      passwordHash: bcrypt.hashSync(PASSWORD, 10),
      emailVerified: true,
      role: 'OWNER',
      status: 'ACTIVE',
    });
    tracker.trackUser(String(user._id));

    const res = await login({ email: user.email, password: PASSWORD });

    assert.equal(res.status, 200, 'emailVerified alone must not gate the password path');
    assert.equal(res.json.user.id, String(user._id));
  });
});
