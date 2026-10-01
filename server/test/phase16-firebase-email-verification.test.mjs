// Phase 16 — Firebase email-verification enforcement at REGISTRATION.
//
// THE PHASE'S ONE SERVER RULE, and the reason it is drawn where it is: an identity
// Firebase has authenticated but whose address Firebase does NOT report as verified may
// not create a tenant. That is enforced in `registerBusinessFromFirebase` and in ONE
// place only, after the token is verified and before the first write, so refusal leaves
// no Business, no User, no session and no audit row behind.
//
// AUTH-03 EXTENDED THIS RULE TO EVERY FIREBASE-BACKED SESSION BOUNDARY. Email
// verification is now required before an Inventory AI session is created OR renewed
// (target architecture §6 / invariant 8), so `exchangeFirebaseSession` carries the same
// gate as registration and `sessionRenew.service.ts` carries it too. The previous
// "registration only" carve-out (RG-14) is DELETED — it was a migration-era exception,
// and the locked architecture permits no permanent one. The exchange assertions in this
// file were therefore REWRITTEN: the exchange now REFUSES an unverified identity with
// 400 EMAIL_NOT_VERIFIED instead of admitting it.
//
// WHAT REMAINS TRUE, AND IS STILL ASSERTED:
//
//   * `requireAuth` is untouched (RG-7 / AUTH-03 decision 13): it is the single
//     authentication choke point, it grows no `emailVerified` branch, and a live session
//     is therefore never retroactively terminated by a claim that has since gone false.
//   * The legacy password path is untouched (N-6): `/api/auth/register` and
//     `/api/auth/login` still work for accounts that carry `emailVerified: false` and no
//     Firebase identity. Legacy Mongo authentication is migration-era (AUTH-03 decision
//     12) and is retired by AUTH-08, not by this phase.
//
// THE DECISION IS THE SIGNED CLAIM, NEVER THE PROVIDER (RG-11/L-7). Two cases below send
// `sign_in_provider: 'google.com'` with an unverified claim and
// `sign_in_provider: 'password'` with a verified one, and require the outcome to follow
// `email_verified` and nothing else. Provider identity is not ownership proof.
//
// The verifier is the Phase 32B fake installed through the REAL seam
// (`setFirebaseIdTokenVerifier`), so `toVerifiedIdentity`'s narrowing — uid extraction,
// email lowercasing, the `email_verified` mapping — runs on every case here exactly as in
// production. No case reaches the network and no Firebase project exists.
//
// Registered MIXED in run-tests.mjs: the source guards run without a database, and the
// behavioural cases need MongoDB.

import 'dotenv/config';

import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { ensureDb, disconnectDb } from './helpers.mjs';
import { createTracker, uniqueEmail, uniqueName } from './support.mjs';
import { dbSuite, unitSuite } from './testEnv.mjs';

import { createApp } from '../src/app.ts';
import Business from '../src/models/business.model.ts';
import User from '../src/models/user.model.ts';
import Session from '../src/models/session.model.ts';
import {
  registerFakeFirebaseVerifier,
  deregisterFakeFirebaseVerifier,
  setFakeFirebaseToken,
} from './fakes/firebaseVerifier.mjs';

const EXCHANGE = '/api/auth/firebase/exchange';
const REGISTER = '/api/auth/firebase/register';

/** The opaque string this suite submits as an ID token. Never a real one. */
const ID_TOKEN = 'phase16.fake.id-token-that-the-seam-replaces';

/** The exact contract the refusal must answer. Transcribed, not derived. */
const VERIFICATION_FIELD_MESSAGE =
  'the verified Firebase identity has an unverified email address';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const readSrc = (relative) => readFileSync(join(SRC, relative), 'utf8');

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

/** Limiters opened wide, so no case in this suite can trip one. */
const UNCAPPED = {
  firebaseExchangeMax: 100000,
  firebaseRegisterMax: 100000,
  registerMax: 100000,
  loginMax: 100000,
  loginIpMax: 100000,
};

// ===========================================================================
// DB-free: where the enforcement lives, and where it does NOT
// ===========================================================================

unitSuite('Phase 16 — enforcement is at registration, and only there (no database)', () => {
  const service = readSrc('services/firebaseAuth.service.ts');
  const registerStart = service.indexOf('export async function registerBusinessFromFirebase');
  const exchangeStart = service.indexOf('export async function exchangeFirebaseSession');
  const registerBody = service.slice(registerStart);
  const exchangeBody = service.slice(exchangeStart, registerStart);

  it('★ the registration service refuses an unverified identity exactly once', () => {
    // TWO gates, one per Firebase-backed session boundary in this file: the registration
    // path and the exchange (AUTH-03 decisions 9/10). A gate on either one is required;
    // a THIRD would be an accidental duplicate.
    const occurrences = service.split('identity.emailVerified !== true').length - 1;
    assert.equal(occurrences, 2, 'exactly one verification gate per Firebase session boundary');

    assert.ok(
      service.includes(VERIFICATION_FIELD_MESSAGE),
      'the refusal carries the approved message verbatim'
    );
    assert.ok(
      /field: 'idToken'/.test(service),
      'the problem is reported under idToken, as the adjacent no-email branch does'
    );
  });

  it('★ the gate sits after the token is VERIFIED, and before the FIRST write', () => {
    assert.ok(registerStart >= 0 && exchangeStart >= 0, 'both entry points are exported');

    const verified = registerBody.indexOf('const identity = await verifyFirebaseIdToken(idToken)');
    const gate = registerBody.indexOf('identity.emailVerified !== true');
    const firstWrite = registerBody.indexOf('await User.exists({ email })');

    assert.ok(verified >= 0 && gate >= 0 && firstWrite >= 0, 'all three anchors are present');
    // Before: the claim is read from a token the verifier already accepted, never from
    // anything a caller supplied.
    assert.ok(verified < gate, 'the claim is read only from a VERIFIED token');
    // After: nothing has been written or even looked up, so a refusal leaves no
    // Business, no User, no session and no audit row (RG-1/RG-2/RG-3).
    assert.ok(gate < firstWrite, 'refusal happens before any lookup or write');
  });

  it('★ the exchange DOES carry a verification gate, before the session is minted', () => {
    assert.ok(exchangeStart >= 0 && registerStart > exchangeStart, 'both bodies are delimited');

    const verified = exchangeBody.indexOf('const identity = await verifyFirebaseIdToken(idToken)');
    const gate = exchangeBody.indexOf('identity.emailVerified !== true');
    const mint = exchangeBody.indexOf('createSessionForToken(');

    assert.ok(verified >= 0 && gate >= 0 && mint >= 0, 'all three anchors are present');
    // AUTH-03 decision 10: the exchange creates an Inventory session, so it enforces the
    // gate, and the claim is read only from a token the verifier already accepted.
    assert.ok(verified < gate, 'the claim is read only from a VERIFIED token');
    // The refusal happens BEFORE the session is minted, so an unverified identity can
    // never obtain one.
    assert.ok(gate < mint, 'the gate precedes session creation');
    // It answers the locked AUTH-03 code, not the registration field error.
    assert.ok(exchangeBody.includes('EMAIL_NOT_VERIFIED'), 'the locked code is used');
  });

  it('★ requireAuth is untouched — verification is not an authentication rule (RG-7)', () => {
    const middleware = readSrc('middlewares/authenticate.ts');

    assert.equal(
      /emailVerified/.test(middleware),
      false,
      'the single authentication choke point must not grow a verification branch'
    );
  });

  it('★ the legacy password service still contains no verification gate (RG-14/N-6)', () => {
    const legacy = readSrc('services/auth.service.ts');

    assert.equal(
      /emailVerified\s*!==/.test(legacy),
      false,
      'legacy accounts carrying emailVerified false keep signing in'
    );
  });

  it('★ a refusal cannot write an audit row — the path reaches no audit write', () => {
    // The registration path writes no AuditLog row on ANY outcome, the success path
    // included, so a refusal cannot leave a false trail. Asserted structurally rather
    // than by counting rows: the DB suites share one database and run in parallel, so a
    // count is not a guard.
    assert.equal(
      registerBody.includes('recordAudit('),
      false,
      'the registration path contains no audit write for a refusal to reach'
    );
  });
});

// ===========================================================================
// DB-backed: the behaviour over HTTP
// ===========================================================================

const dbOk = await ensureDb();

dbSuite('Phase 16 — Firebase email-verification enforcement over HTTP', dbOk, () => {
  const tracker = createTracker(dbOk);
  let app = null;

  const LOGIN = '/api/auth/login';
  const PASSWORD = 'OwnerPass123!';

  /** A unique Firebase uid for a case, so parallel files cannot collide. */
  const uid = (prefix = 'p16') => uniqueName(prefix);

  async function makeBusiness({ status = 'ACTIVE' } = {}) {
    const business = await Business.create({ name: uniqueName('Biz16'), status });
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
      name: uniqueName('U16'),
      email: email ?? uniqueEmail('u16'),
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
    app = await listen(createApp({ requestLogging: false, authLimits: UNCAPPED }));
  });

  after(async () => {
    deregisterFakeFirebaseVerifier();
    if (app) await app.close();
    await tracker.cleanup();
    await disconnectDb();
  });

  // -------------------------------------------------------------------------
  // The refusal
  // -------------------------------------------------------------------------

  it('1. ★ an UNVERIFIED identity cannot register, and writes NOTHING', async () => {
    const id = uid('unverified');
    const email = uniqueEmail('unverified');
    const businessName = uniqueName('UnverifiedBiz');
    setFakeFirebaseToken({ uid: id, email, email_verified: false });

    const res = await register({ idToken: ID_TOKEN, businessName, name: 'Unverified Owner' });

    // The approved contract, exactly: 400 VALIDATION_ERROR, one problem on idToken.
    assert.equal(res.status, 400);
    assert.equal(res.json.code, 'VALIDATION_ERROR');
    assert.deepEqual(res.json.fields, [
      { field: 'idToken', message: VERIFICATION_FIELD_MESSAGE },
    ]);

    // ZERO WRITES. The absent tenant IS the server-side gate (RG-1/RG-2/RG-3), so it is
    // asserted on both collections rather than inferred from the status code.
    assert.equal(await User.countDocuments({ firebaseUid: id }), 0, 'no user was created');
    assert.equal(await User.countDocuments({ email: email.toLowerCase() }), 0, 'no user by email');
    assert.equal(
      await Business.countDocuments({ name: businessName }),
      0,
      'no business was created and none was left behind'
    );
  });

  it('2. an ABSENT email_verified claim is treated as unverified, not as verified', async () => {
    // `token.email_verified === true` is the only thing that counts, so a token that
    // simply omits the claim is unverified. A `!== false` check would have let it pass.
    const id = uid('absent');
    const email = uniqueEmail('absent');
    const businessName = uniqueName('AbsentBiz');
    setFakeFirebaseToken({ uid: id, email });

    const res = await register({ idToken: ID_TOKEN, businessName, name: 'X' });

    assert.equal(res.status, 400);
    assert.equal(res.json.code, 'VALIDATION_ERROR');
    assert.equal(await User.countDocuments({ firebaseUid: id }), 0);
    assert.equal(await Business.countDocuments({ name: businessName }), 0);
  });

  it('3. a NON-BOOLEAN email_verified is unverified, and cannot be coerced', async () => {
    // A string, a number and an object all arrive through the same narrow mapping
    // (`=== true`), so none of them can be truthy enough to open the gate.
    for (const claim of ['true', 1, {}, []]) {
      const id = uid('coerce');
      const businessName = uniqueName('CoerceBiz');
      setFakeFirebaseToken({ uid: id, email: uniqueEmail('coerce'), email_verified: claim });

      const res = await register({ idToken: ID_TOKEN, businessName, name: 'X' });

      assert.equal(res.status, 400, `${JSON.stringify(claim)} must not verify`);
      assert.equal(await User.countDocuments({ firebaseUid: id }), 0);
      assert.equal(await Business.countDocuments({ name: businessName }), 0);
    }
  });

  it('4. ★ the refusal leaks no credential, no token and no uid', async () => {
    const id = uid('leak');
    const email = uniqueEmail('leak');
    setFakeFirebaseToken({ uid: id, email, email_verified: false });

    const res = await register({ idToken: ID_TOKEN, businessName: uniqueName('LeakBiz'), name: 'X' });

    const surface = JSON.stringify(res.json);
    assert.equal(res.status, 400);
    // Nothing the caller sent, and nothing the server derived, is echoed back.
    assert.equal(surface.includes(ID_TOKEN), false, 'the ID token must never be echoed');
    assert.equal(surface.includes(id), false, 'the Firebase uid must never be echoed');
    assert.equal(surface.includes(email), false, 'the address must never be echoed');
    assert.equal(surface.includes('emailVerified'), false, 'the claim name is internal');
    // And the body carries no key outside the standard error envelope, so no new field
    // was introduced for this refusal. Asserted as an allowlist rather than an exact key
    // set because `stack` is present outside production.
    const envelopeKeys = new Set(['error', 'code', 'fields', 'applied', 'stack']);
    for (const key of Object.keys(res.json)) {
      assert.ok(envelopeKeys.has(key), `unexpected key in the refusal body: ${key}`);
    }
    assert.equal(typeof res.json.error, 'string');
  });
  // -------------------------------------------------------------------------
  // The claim decides, not the provider
  // -------------------------------------------------------------------------

  it('5. ★ the outcome follows email_verified, NEVER the provider (RG-11/L-7)', async () => {
    // A GOOGLE identity Firebase reports as unverified. The provider name is a well-known
    // one and the address looks like a Google address, and neither fact may open the gate:
    // authenticating with a provider is not proof of ownership of an address.
    const googleId = uid('google');
    const googleBusiness = uniqueName('GoogleBiz');
    setFakeFirebaseToken({
      uid: googleId,
      email: uniqueEmail('google'),
      email_verified: false,
      firebase: { sign_in_provider: 'google.com' },
    });

    const refused = await register({ idToken: ID_TOKEN, businessName: googleBusiness, name: 'G' });

    assert.equal(refused.status, 400, 'google.com must not verify an address');
    assert.equal(refused.json.code, 'VALIDATION_ERROR');
    assert.equal(await Business.countDocuments({ name: googleBusiness }), 0);

    // The SAME token shape with ONLY the claim flipped, and a password provider. It
    // registers — so the difference between the two cases is the claim and nothing else.
    const passwordId = uid('password');
    setFakeFirebaseToken({
      uid: passwordId,
      email: uniqueEmail('password'),
      email_verified: true,
      firebase: { sign_in_provider: 'password' },
    });

    const allowed = await register({
      idToken: ID_TOKEN,
      businessName: uniqueName('PasswordBiz'),
      name: 'P',
    });

    assert.equal(allowed.status, 201, 'a verified identity registers whatever minted it');
    tracker.trackBusiness(allowed.json.business.id);
    tracker.trackUser(allowed.json.user.id);
  });

  it('6. a VERIFIED identity still registers, and the claim is mirrored as true', async () => {
    const id = uid('verified');
    const email = uniqueEmail('verified');
    setFakeFirebaseToken({ uid: id, email, email_verified: true });

    const res = await register({
      idToken: ID_TOKEN,
      businessName: uniqueName('VerifiedBiz'),
      name: 'Verified Owner',
    });

    assert.equal(res.status, 201);
    tracker.trackBusiness(res.json.business.id);
    tracker.trackUser(res.json.user.id);

    const stored = await User.findById(res.json.user.id);
    assert.equal(stored.firebaseUid, id, 'the uid is the verified one');
    assert.equal(stored.emailVerified, true, 'the claim is mirrored');
    assert.equal(stored.role, 'OWNER');
    assert.equal(String(stored.businessId), res.json.business.id);
  });

  // -------------------------------------------------------------------------
  // What the enforcement must NOT have changed
  // -------------------------------------------------------------------------

  it('7. ★★ an UNVERIFIED identity cannot exchange, and a verified one still can (AUTH-03)', async () => {
    // AUTH-03 REVERSED the old RG-14 carve-out. The exchange creates an Inventory
    // session, so email verification is required before it proceeds: an identity whose
    // claim is currently false is refused with 400 EMAIL_NOT_VERIFIED and opens no
    // session. The SAME account, with only the claim flipped true, exchanges — so the
    // claim is the only thing deciding the outcome.
    const id = uid('legacy');
    const user = await makeUser({ firebaseUid: id, emailVerified: false, role: 'MANAGER' });

    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: false });
    const refused = await exchange({ idToken: ID_TOKEN });

    assert.equal(refused.status, 400, 'the exchange must enforce verification (AUTH-03)');
    assert.equal(refused.json.code, 'EMAIL_NOT_VERIFIED');
    assert.equal(refused.json.token, undefined, 'no token was issued');
    assert.equal(await activeSessionsOf(user._id), 0, 'no session was created');

    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });
    const allowed = await exchange({ idToken: ID_TOKEN });

    assert.equal(allowed.status, 200, 'a verified identity exchanges');
    assert.equal(allowed.json.user.id, String(user._id));
    assert.equal(allowed.json.user.role, 'MANAGER');
    assert.equal(allowed.json.token.split('.').length, 3, 'a real application JWT was issued');
  });

  it('8. ★ the legacy password route is untouched (RG-14/N-6)', async () => {
    const user = await makeUser({ emailVerified: false, password: PASSWORD });

    const res = await app.api('POST', LOGIN, {
      body: { email: user.email, password: PASSWORD },
    });

    assert.equal(res.status, 200, 'an unverified legacy account still signs in');
    assert.equal(res.json.user.id, String(user._id));
  });

  it('9. ★ an unknown uid still answers REGISTRATION_REQUIRED, not a verification error', async () => {
    // The gate must not shadow the pre-existing contract: an identity with no record is
    // told to register, and the registration route is then what refuses it on the claim.
    const unknownUid = uid('unknown');
    setFakeFirebaseToken({ uid: unknownUid, email: uniqueEmail('ghost'), email_verified: true });

    const res = await exchange({ idToken: ID_TOKEN });

    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'REGISTRATION_REQUIRED');
    assert.equal(res.json.token, undefined);
    assert.equal(await User.countDocuments({ firebaseUid: unknownUid }), 0);
  });

  it('10. ★ a refusal writes nothing attributable to the caller, and opens no session', async () => {
    // RG-1/RG-3 stated as negatives on the WRITE path. Scoped to THIS case's identifiers
    // on purpose: node --test runs the DB suites in parallel against one database, so a
    // global collection count moves for reasons that have nothing to do with this request
    // and would be a flaky assertion rather than a guard.
    const id = uid('audit');
    const email = uniqueEmail('audit');
    const businessName = uniqueName('AuditBiz');
    setFakeFirebaseToken({ uid: id, email, email_verified: false });

    const res = await register({ idToken: ID_TOKEN, businessName, name: 'X' });

    assert.equal(res.status, 400);
    assert.equal(await User.countDocuments({ firebaseUid: id }), 0, 'no user by uid');
    assert.equal(await User.countDocuments({ email: email.toLowerCase() }), 0, 'no user by email');
    assert.equal(await Business.countDocuments({ name: businessName }), 0, 'no business was created');

    // A session is named by a userId, so the absence of any account is the absence of any
    // session this request could have opened. Asserted positively rather than by counting
    // the sessions collection, for the reason above.
    assert.equal(
      await User.findOne({ email: email.toLowerCase() }),
      null,
      'no account exists for a session to name'
    );
  });

  it('11. a DISABLED user is refused exactly as before, verification notwithstanding', async () => {
    // On the EXCHANGE the AUTH-03 gate sits AFTER the pre-existing status and tenant
    // checks, so it must not reorder them into a different answer for an account that is
    // already known and disabled — the disabled refusal wins, as it always did.
    const id = uid('disabled');
    const user = await makeUser({ firebaseUid: id, status: 'DISABLED' });
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });

    const before = await activeSessionsOf(user._id);
    const res = await exchange({ idToken: ID_TOKEN });

    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'ACCOUNT_DISABLED');
    assert.equal(await activeSessionsOf(user._id), before, 'no session was created');
  });
});

// ===========================================================================
// DB-free: the anti-vacuity controls
// ===========================================================================

unitSuite('Phase 16 — the refusal assertions can actually fail (no database)', () => {
  const expected = [{ field: 'idToken', message: VERIFICATION_FIELD_MESSAGE }];

  it('the exact-field assertion rejects a different message, field, or an empty list', () => {
    // A guard that cannot be shown to fail is not a guard. The same deep-equal used in
    // case 1 is driven from the other side here, so it is known to be sensitive to all
    // three ways it could silently stop meaning anything.
    assert.deepEqual([{ field: 'idToken', message: VERIFICATION_FIELD_MESSAGE }], expected);

    assert.throws(
      () => assert.deepEqual([{ field: 'idToken', message: 'some other message' }], expected),
      'a changed message must break it'
    );
    assert.throws(
      () => assert.deepEqual([{ field: 'businessName', message: VERIFICATION_FIELD_MESSAGE }], expected),
      'a changed field must break it'
    );
    assert.throws(
      () => assert.deepEqual([], expected),
      'a missing problem must break it too'
    );
  });
});
