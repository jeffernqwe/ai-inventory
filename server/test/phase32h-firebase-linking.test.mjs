// Phase 32H — the server-side Firebase identity linking boundary.
//
// The phase adds ONE route, `POST /api/auth/firebase/link`, and the suite is
// organised around the properties that make it safe to have at all. The central
// claim is a single sentence:
//
//   AUTHENTICATING AN IDENTITY IS NOT PROVING OWNERSHIP OF AN EXISTING ACCOUNT.
//
// So the suite is built to falsify that claim rather than to restate it:
//
//   * EMAIL IS NEVER A JOIN KEY. The token's address matching an account's is not
//     a reason to attach anything, and — the sharper side — a token whose address
//     matches a DIFFERENT account still links onto the CALLER'S account and never
//     onto that one. Both directions are asserted; one direction alone would pass
//     against an implementation that merely preferred the caller.
//   * THE ACCOUNT AND THE IDENTITY ARE BOTH SERVER-DERIVED. A body carrying
//     `firebaseUid`, `userId`, `businessId`, `role` and `status` — all pointing at
//     a DIFFERENT user in a DIFFERENT business — must be inert, and the resulting
//     document must be the caller's, unchanged in tenant and role.
//   * A CONFLICT IS REFUSED, NEVER RESOLVED. Both conflict shapes answer one
//     status, one code and one message; the account that already holds the
//     identity keeps it; an account that already holds a different identity keeps
//     that one. Nothing is merged and nothing is transferred.
//   * 32E IS NOT WEAKENED — IT IS MADE LIVE. The strongest available proof is
//     behavioural: a legacy account signs in with its password, LINKS, and is then
//     refused by the password route with FIREBASE_SIGN_IN_REQUIRED. That test
//     would fail if linking silently granted a second way in.
//   * A BAD FIREBASE CREDENTIAL DOES NOT KILL THE APPLICATION SESSION. This is the
//     one place the link route deliberately differs from the exchange, and it is
//     asserted against the client's own rule rather than described: the response is
//     400, not the 401 that `lib/client.ts` treats as session loss, and the
//     caller's token still works afterwards.
//
// The verifier is the Phase 32B test fake installed through the REAL seam
// (`setFirebaseIdTokenVerifier`), so the narrowing in `toVerifiedIdentity` runs on
// every case exactly as it does in production. No case reaches the network and no
// Firebase project exists — and no case here claims that any provider SDK works,
// because none is installed and none is exercised.
//
// Registered MIXED in run-tests.mjs: the validator cases run without a database;
// everything else needs MongoDB.

import 'dotenv/config';

import { it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { ensureDb, disconnectDb } from './helpers.mjs';
import { createTracker, uniqueEmail, uniqueName, issueSessionToken } from './support.mjs';
import { dbSuite, unitSuite } from './testEnv.mjs';

import { createApp } from '../src/app.ts';
import requireAuth from '../src/middlewares/authenticate.ts';
import Business from '../src/models/business.model.ts';
import User from '../src/models/user.model.ts';
import Session from '../src/models/session.model.ts';
import AuditLog from '../src/models/auditLog.model.ts';
import { validateFirebaseLink } from '../src/utils/validate.ts';
import { AUDIT_ACTIONS } from '../src/constants/audit.ts';
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

const LINK = '/api/auth/firebase/link';
const EXCHANGE = '/api/auth/firebase/exchange';
const LOGIN = '/api/auth/login';
const ME = '/api/auth/me';

/** The opaque string this suite submits as an ID token. Never a real one. */
const ID_TOKEN = 'phase32h.fake.id-token-that-the-seam-replaces';

const ALL_FIREBASE_ENV = [FIREBASE_SERVICE_ACCOUNT_JSON, ...FIREBASE_ACCOUNT_ENV];

/** Every string a JSON response body could carry, for a leak search. */
function bodySurface(json) {
  return JSON.stringify(json ?? null);
}

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
// DB-free: the payload
// ===========================================================================

unitSuite('Phase 32H — the linking payload (no database)', () => {
  it('requires idToken, and rejects it for every non-string or blank shape', () => {
    for (const body of [{}, null, undefined, { idToken: '' }, { idToken: '   ' }, { idToken: 42 }]) {
      const { problems, idToken } = validateFirebaseLink(body);
      assert.deepEqual(
        problems.map((p) => p.field),
        ['idToken'],
        `expected an idToken problem for ${JSON.stringify(body)}`
      );
      assert.equal(idToken, undefined, 'no token is returned alongside a problem');
    }
  });

  it('rejects an oversized idToken', () => {
    const { problems } = validateFirebaseLink({ idToken: 'x'.repeat(4097) });
    assert.deepEqual(problems.map((p) => p.field), ['idToken']);
  });

  // ★ The structural half of §5 and §8: the handler has no variable holding a
  //   client-supplied identity, tenant or role, so there is nothing to forward by
  //   accident and no check that could be removed. Asserted on the RESULT rather
  //   than on the source, because a future edit that started returning `role`
  //   would fail here even if it also added a check.
  it('★ returns ONLY {problems, idToken} — the account, tenant and role cannot be forwarded', () => {
    const { problems, idToken, ...rest } = validateFirebaseLink({ idToken: ID_TOKEN });
    assert.deepEqual(problems, []);
    assert.equal(idToken, ID_TOKEN);
    assert.deepEqual(Object.keys(rest), [], 'no other field is returned at all');
  });

  it('★ a body naming an identity, an account, a tenant or a role is inert and changes nothing', () => {
    const planted = {
      firebaseUid: 'uid-the-caller-invented',
      userId: '507f1f77bcf86cd799439011',
      businessId: '507f1f77bcf86cd799439012',
      role: 'OWNER',
      status: 'ACTIVE',
      email: 'someone-else@example.test',
    };

    const plain = validateFirebaseLink({ idToken: ID_TOKEN });
    const loaded = validateFirebaseLink({ idToken: ID_TOKEN, ...planted });

    assert.deepEqual(loaded, plain, 'the planted fields are not "accepted" — they are unread');
    const surface = bodySurface(loaded);
    for (const [key, value] of Object.entries(planted)) {
      assert.equal(surface.includes(value), false, `${key} leaked into the validated payload`);
    }
  });
});

// ===========================================================================
// DB-backed: the route over the shipped app and a real database
// ===========================================================================

const dbOk = await ensureDb();

dbSuite('Phase 32H — identity linking over HTTP and a real database', dbOk, () => {
  const tracker = createTracker(dbOk);
  let app = null;

  /** A unique Firebase uid for a case, so parallel files cannot collide. */
  const uid = (prefix = 'p32h') => uniqueName(prefix);

  async function makeBusiness({ status = 'ACTIVE' } = {}) {
    const business = await Business.create({ name: uniqueName('Biz32H'), status });
    tracker.trackBusiness(String(business._id));
    return business;
  }

  /**
   * A MongoDB user, optionally already linked to a Firebase identity.
   *
   * `firebaseUid: null` writes NO `firebaseUid` key at all rather than an explicit
   * null, which is the state every account is in before linking and the state the
   * conditional attach must match. Writing it as a literal null would quietly test
   * a document shape production never produces.
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
    const user = await User.create({
      businessId: biz._id,
      name: uniqueName('U32H'),
      email: email ?? uniqueEmail('u32h'),
      ...(password ? { passwordHash: bcrypt.hashSync(password, 10) } : {}),
      ...(firebaseUid ? { firebaseUid } : {}),
      emailVerified,
      role,
      status,
    });
    tracker.trackUser(String(user._id));
    return user;
  }

  /** The caller's own authenticated token, minted the way requireAuth expects. */
  const tokenFor = (user) => issueSessionToken(user._id);

  const linkAudits = (businessId, action) =>
    AuditLog.countDocuments({ businessId: new mongoose.Types.ObjectId(String(businessId)), action });

  const activeSessionsOf = (userId) =>
    Session.countDocuments({ userId: new mongoose.Types.ObjectId(String(userId)), revokedAt: null });

  /** Re-reads a user without any projection so every field is visible. */
  const reload = (user) => User.findById(user._id).select('+passwordHash');

  const link = (token, body) => app.api('POST', LINK, { token, body });

  before(async () => {
    registerFakeFirebaseVerifier();
    app = await listen(createApp({ requestLogging: false, authLimits: UNCAPPED }));
  });

  /**
   * Each case starts with an empty call log.
   *
   * `verifiedTokens()` accumulates across the whole file otherwise, so a case
   * asserting "the verifier was never reached" would be reading every earlier
   * case's tokens as well as its own — a green assertion that means nothing, or
   * here a red one that means the wrong thing.
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
  // CASE C — the happy path
  // -------------------------------------------------------------------------

  it('1. ★ an authenticated caller links a verified identity to their OWN account', async () => {
    const id = uid();
    const business = await makeBusiness();
    const user = await makeUser({ business, role: 'MANAGER' });
    const token = await tokenFor(user);
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });
    clearVerifiedTokens();

    const res = await link(token, { idToken: ID_TOKEN });

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.json).sort(), ['linked', 'user'], 'the linking envelope, exactly');
    assert.equal(res.json.linked, true, 'a real attachment is reported as one');
    assert.equal(res.json.user.id, String(user._id));
    assert.equal(res.json.user.businessId, String(business._id));
    assert.equal(res.json.user.role, 'MANAGER', 'a link is not a role change');
    assert.deepEqual(verifiedTokens(), [ID_TOKEN], 'the verifier saw the submitted token');

    const stored = await reload(user);
    assert.equal(stored.firebaseUid, id);
    assert.equal(stored.emailVerified, true, 'the verified claim moves with the identity');
    assert.equal(String(stored.businessId), String(business._id), 'tenant untouched');
    assert.equal(stored.role, 'MANAGER', 'role untouched');
    assert.equal(stored.status, 'ACTIVE', 'status untouched');

    // The identity is not echoed back: the caller learns which account was linked,
    // never the identifier attached to it.
    assert.equal(bodySurface(res.json).includes(id), false, 'the Firebase uid left the server');
  });

  it('2. linking writes exactly one FIREBASE_IDENTITY_LINKED audit row, with no uid in it', async () => {
    const id = uid();
    const business = await makeBusiness();
    const user = await makeUser({ business });
    const token = await tokenFor(user);
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });

    assert.equal(await linkAudits(business._id, AUDIT_ACTIONS.FIREBASE_IDENTITY_LINKED), 0);
    const res = await link(token, { idToken: ID_TOKEN });
    assert.equal(res.status, 200);

    const rows = await AuditLog.find({
      businessId: business._id,
      action: AUDIT_ACTIONS.FIREBASE_IDENTITY_LINKED,
    });
    assert.equal(rows.length, 1, 'one durable outcome, one row');
    assert.equal(String(rows[0].userId), String(user._id));
    assert.equal(rows[0].entityType, 'USER');
    assert.equal(String(rows[0].entityId), String(user._id));
    // ★ The audit viewer is ADMIN-readable and the uid may name a person in another
    //   tenant, so a uid must never reach it. Asserted against the raw stored
    //   document rather than the DTO, because the DTO is not what protects this.
    assert.equal(bodySurface(rows[0].toObject()).includes(id), false, 'a uid reached the audit trail');
  });

  it('3. ★ the audit row records whether a legacy password credential was retained', async () => {
    const withPw = await makeUser({ password: 'Password123!' });
    const withoutPw = await makeUser();

    setFakeFirebaseToken({ uid: uid(), email: withPw.email, email_verified: true });
    assert.equal((await link(await tokenFor(withPw), { idToken: ID_TOKEN })).status, 200);

    setFakeFirebaseToken({ uid: uid(), email: withoutPw.email, email_verified: true });
    assert.equal((await link(await tokenFor(withoutPw), { idToken: ID_TOKEN })).status, 200);

    const rowFor = (user) =>
      AuditLog.findOne({
        businessId: user.businessId,
        action: AUDIT_ACTIONS.FIREBASE_IDENTITY_LINKED,
        userId: user._id,
      });

    // The fact the OPEN password-authority item turns on: this account now carries
    // a Firebase identity AND a hash that still works on the legacy route.
    assert.equal((await rowFor(withPw)).metadata.passwordCredentialRetained, true);
    assert.equal((await rowFor(withoutPw)).metadata.passwordCredentialRetained, false);
  });

  // -------------------------------------------------------------------------
  // CASE A — idempotent
  // -------------------------------------------------------------------------

  it('4. ★ CASE A: the same identity on the same account is idempotent and writes nothing', async () => {
    const id = uid();
    const business = await makeBusiness();
    const user = await makeUser({ business, firebaseUid: id, emailVerified: true });
    const token = await tokenFor(user);
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });

    const auditBefore = await linkAudits(business._id, AUDIT_ACTIONS.FIREBASE_IDENTITY_LINKED);
    const sessionsBefore = await activeSessionsOf(user._id);

    const res = await link(token, { idToken: ID_TOKEN });

    assert.equal(res.status, 200, 'already yours is a success, not a conflict');
    assert.equal(res.json.linked, false, 'nothing was attached');
    assert.equal(res.json.user.id, String(user._id));
    // An event that did not happen must not appear in the trail — the same
    // reasoning `revokeSessionByJti` uses for an idempotent revoke.
    assert.equal(
      await linkAudits(business._id, AUDIT_ACTIONS.FIREBASE_IDENTITY_LINKED),
      auditBefore,
      'idempotence means no row'
    );
    assert.equal(await activeSessionsOf(user._id), sessionsBefore, 'no session was created');
    assert.equal((await reload(user)).firebaseUid, id, 'the mapping is unchanged');
  });

  // -------------------------------------------------------------------------
  // CASE B — the identity belongs to another account
  // -------------------------------------------------------------------------

  it('5. ★ CASE B: an identity owned by another account is a hard conflict, and it is NOT moved', async () => {
    const id = uid();
    const business = await makeBusiness();
    const holder = await makeUser({ business, email: uniqueEmail('holder') });
    // The conflicting identity deliberately belongs to a DIFFERENT business, so the
    // refusal is also the cross-tenant case.
    const otherBusiness = await makeBusiness();
    const other = await makeUser({ business: otherBusiness, firebaseUid: id, email: uniqueEmail('other') });

    const token = await tokenFor(holder);
    setFakeFirebaseToken({ uid: id, email: holder.email, email_verified: true });

    const res = await link(token, { idToken: ID_TOKEN });

    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'FIREBASE_IDENTITY_CONFLICT');

    // Neither account moved.
    assert.equal((await reload(holder)).firebaseUid ?? null, null, 'the caller did not gain the identity');
    assert.equal((await reload(other)).firebaseUid, id, 'the holder kept it — never transferred');
    assert.equal(String((await reload(other)).businessId), String(otherBusiness._id), 'no tenant move');

    // The refusal is audited against the CALLER's tenant, and says why.
    const conflicts = await AuditLog.find({
      businessId: business._id,
      action: AUDIT_ACTIONS.FIREBASE_IDENTITY_LINK_CONFLICT,
    });
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].metadata.reason, 'identity_already_owned');

    // ★ Nothing about the other tenant reaches the caller: not its id, not the uid,
    //   not the account's name or address.
    const surface = bodySurface(res.json);
    assert.equal(surface.includes(id), false, 'the conflicting uid leaked');
    assert.equal(surface.includes(String(otherBusiness._id)), false, 'a foreign businessId leaked');
    assert.equal(surface.includes(String(other._id)), false, 'a foreign userId leaked');
    assert.equal(surface.includes(other.email), false, 'a foreign email leaked');
  });

  // -------------------------------------------------------------------------
  // CASE D — this account already owns a different identity
  // -------------------------------------------------------------------------

  it('6. ★ CASE D: an account that already owns a different identity is refused, never re-pointed', async () => {
    const existing = uid();
    const incoming = uid();
    const business = await makeBusiness();
    const user = await makeUser({ business, firebaseUid: existing });
    const token = await tokenFor(user);
    setFakeFirebaseToken({ uid: incoming, email: user.email, email_verified: true });

    const res = await link(token, { idToken: ID_TOKEN });

    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'FIREBASE_IDENTITY_CONFLICT');
    // ★ The whole point: silently replacing the mapping would hand the incoming
    //   Firebase account the ability to sign in as this user.
    assert.equal((await reload(user)).firebaseUid, existing, 'the original identity is preserved');
    assert.equal(bodySurface(res.json).includes(incoming), false);

    const conflicts = await AuditLog.find({
      businessId: business._id,
      action: AUDIT_ACTIONS.FIREBASE_IDENTITY_LINK_CONFLICT,
    });
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].metadata.reason, 'account_already_linked');
    assert.equal(bodySurface(conflicts[0].toObject()).includes(incoming), false, 'a uid reached the trail');
  });

  it('7. ★ CASE B and CASE D are indistinguishable to the caller', async () => {
    const business = await makeBusiness();

    // CASE B: the incoming uid belongs to someone else.
    const ownedUid = uid();
    await makeUser({ business: await makeBusiness(), firebaseUid: ownedUid });
    const bCaller = await makeUser({ business, email: uniqueEmail('b') });
    setFakeFirebaseToken({ uid: ownedUid, email: bCaller.email, email_verified: true });
    const b = await link(await tokenFor(bCaller), { idToken: ID_TOKEN });

    // CASE D: the caller already owns a different uid.
    const dCaller = await makeUser({ business, firebaseUid: uid(), email: uniqueEmail('d') });
    setFakeFirebaseToken({ uid: uid(), email: dCaller.email, email_verified: true });
    const d = await link(await tokenFor(dCaller), { idToken: ID_TOKEN });

    // The CLIENT-VISIBLE contract, and exactly it. `stack` is excluded because
    // `middlewares/errorHandler.ts` appends it to every ApiError body when
    // `NODE_ENV !== 'production'` — a pre-existing, development-only behaviour that
    // this phase neither introduced nor changes. It is worth naming rather than
    // hiding, because the exclusion is doing real work: the development stack DOES
    // differ between the two cases (different line numbers inside the service), so
    // an unqualified deepEqual over the whole body fails in development and passes
    // in production. The fields below are what a client can branch on in either
    // environment, and they are identical.
    const contract = ({ status, json }) => ({
      status,
      code: json.code,
      error: json.error,
      fields: json.fields,
    });
    assert.deepEqual(contract(b), contract(d), 'the two conflict shapes must not be tellable apart');
    // Guarding the guard: the assertion above would also pass if BOTH responses
    // were, say, identical 200s. Pinned so a future change that made conflicts
    // succeed cannot satisfy it by accident.
    assert.deepEqual(contract(b), {
      status: 409,
      code: 'FIREBASE_IDENTITY_CONFLICT',
      error: 'This sign-in cannot be connected to this account. Please contact an administrator.',
      fields: undefined,
    });
    // The message names no account, no tenant, no role and no identity.
    assert.equal(b.json.error.includes('@'), false, 'the conflict message names an address');
    // And the reason they differ is recorded where only an operator can read it.
    assert.notEqual(
      (await AuditLog.findOne({ userId: bCaller._id, action: AUDIT_ACTIONS.FIREBASE_IDENTITY_LINK_CONFLICT }))
        .metadata.reason,
      (await AuditLog.findOne({ userId: dCaller._id, action: AUDIT_ACTIONS.FIREBASE_IDENTITY_LINK_CONFLICT }))
        .metadata.reason
    );
  });

  // -------------------------------------------------------------------------
  // §8 — the body is not an identity, a tenant or a role
  // -------------------------------------------------------------------------

  it('8. ★ a body naming businessId, role, userId and firebaseUid cannot steer the link', async () => {
    const id = uid();
    const business = await makeBusiness();
    const caller = await makeUser({ business, role: 'STAFF' });
    const token = await tokenFor(caller);

    // A separate account and tenant, to be pointed at from the body.
    const victimBusiness = await makeBusiness();
    const victim = await makeUser({ business: victimBusiness, role: 'OWNER', email: uniqueEmail('victim') });

    setFakeFirebaseToken({ uid: id, email: caller.email, email_verified: true });

    const res = await link(token, {
      idToken: ID_TOKEN,
      userId: String(victim._id),
      businessId: String(victimBusiness._id),
      role: 'OWNER',
      status: 'ACTIVE',
      firebaseUid: 'uid-the-caller-invented',
      email: victim.email,
    });

    assert.equal(res.status, 200);
    // ★ The link landed on the CALLER, in the CALLER's tenant, with the CALLER's
    //   role — none of which the body could name.
    assert.equal(res.json.user.id, String(caller._id));
    assert.equal(res.json.user.businessId, String(business._id));
    assert.equal(res.json.user.role, 'STAFF');

    const storedCaller = await reload(caller);
    assert.equal(storedCaller.firebaseUid, id, 'the verified uid, not the invented one');
    assert.equal(String(storedCaller.businessId), String(business._id));
    assert.equal(storedCaller.role, 'STAFF');

    // The victim is entirely untouched — no uid, no role change, no tenant change.
    const storedVictim = await reload(victim);
    assert.equal(storedVictim.firebaseUid ?? null, null);
    assert.equal(storedVictim.role, 'OWNER');
    assert.equal(String(storedVictim.businessId), String(victimBusiness._id));
    assert.equal(await linkAudits(victimBusiness._id, AUDIT_ACTIONS.FIREBASE_IDENTITY_LINKED), 0);
  });

  it('9. ★ the token email is never compared to the account email', async () => {
    // The verified identity carries an address belonging to NOBODY in this
    // database. The link must still succeed onto the caller's own account, because
    // the account is `req.user` and the email is not a join key in either
    // direction.
    const id = uid();
    const business = await makeBusiness();
    const user = await makeUser({ business, email: uniqueEmail('real') });
    const token = await tokenFor(user);
    setFakeFirebaseToken({ uid: id, email: uniqueEmail('unrelated'), email_verified: true });

    const res = await link(token, { idToken: ID_TOKEN });

    assert.equal(res.status, 200, 'a mismatched address is not a reason to refuse the caller');
    assert.equal(res.json.linked, true);
    const stored = await reload(user);
    assert.equal(stored.firebaseUid, id);
    assert.equal(stored.email, user.email, 'the account address is never rewritten from a token');
  });

  // -------------------------------------------------------------------------
  // §22-7 — unauthenticated
  // -------------------------------------------------------------------------

  it('10. ★ unauthenticated linking is rejected before any handler runs', async () => {
    const id = uid();
    const business = await makeBusiness();
    const user = await makeUser({ business });
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });

    const res = await app.api('POST', LINK, { body: { idToken: ID_TOKEN } });

    assert.equal(res.status, 401);
    assert.equal((await reload(user)).firebaseUid ?? null, null, 'nothing was linked');
    assert.equal(await linkAudits(business._id, AUDIT_ACTIONS.FIREBASE_IDENTITY_LINKED), 0);
    // The verifier was never reached: the gate is the middleware, not the handler.
    assert.deepEqual(verifiedTokens(), []);
  });

  it('11. the link route is `requireAuth, limiter, handler` — no gate and no other middleware', async () => {
    const { createAuthRouter } = await import('../src/routes/auth.routes.ts');
    const router = createAuthRouter({ limits: UNCAPPED });
    const layer = router.stack.find((l) => l.route?.path === '/firebase/link');
    assert.ok(layer, 'the route is registered on the auth router');
    assert.deepEqual(
      Object.keys(layer.route.methods),
      ['post'],
      'POST is the only verb — the identity travels in a body, never a URL'
    );
    // 2026-10-23 security audit: the chain is now requireAuth -> per-account
    // limiter -> controller. The limiter is NOT an authorization gate (it decides
    // how often, never who), requireAuth is still first, and there is still no
    // permission middleware anywhere in the chain.
    assert.equal(layer.route.stack.length, 3, 'requireAuth, the link limiter, and the controller');
    assert.equal(layer.route.stack[0].handle, requireAuth, 'the middleware IS requireAuth');
    assert.equal(
      layer.route.stack[1].handle.length,
      3,
      'the middle handler is a (req,res,next) limiter, not a gate'
    );
    assert.equal(layer.route.stack[2].handle.length, 2, 'and the controller is last');
  });

  // -------------------------------------------------------------------------
  // The Firebase failures, and why they are not 401s here
  // -------------------------------------------------------------------------

  it('12. ★ a rejected Firebase token is a 400 and does NOT end the caller\'s session', async () => {
    const business = await makeBusiness();
    const user = await makeUser({ business });
    const token = await tokenFor(user);
    setFakeFirebaseFailure('auth/id-token-expired');

    const res = await link(token, { idToken: ID_TOKEN });

    // ★ The deliberate divergence from the exchange. `lib/client.ts` reports
    //   session loss on `if (token && (res.status === 401 || res.status === 403))`,
    //   so a 401 here would destroy a perfectly valid application session because a
    //   SECOND, unrelated credential was stale. The code is unchanged; the status
    //   moves out of that rule's way.
    assert.equal(res.status, 400, 'not the 401 the client reads as session loss');
    assert.equal(res.json.code, 'FIREBASE_TOKEN_INVALID');
    assert.equal((await reload(user)).firebaseUid ?? null, null, 'nothing was linked');

    // The session really is still alive — asserted against the API, not inferred.
    const me = await app.api('GET', ME, { token });
    assert.equal(me.status, 200, 'the Inventory AI session survived a bad Firebase credential');
    assert.equal(me.json.user.id, String(user._id));
  });

  it('13. an unconfigured server answers 503 and leaves the session intact', async () => {
    const business = await makeBusiness();
    const user = await makeUser({ business });
    const token = await tokenFor(user);

    // ★ This case CANNOT run with the fake verifier installed, and the reason is
    //   the point of it: the substitute is dispatched in front of the real
    //   implementation, so it answers without ever consulting the configuration and
    //   the "not configured" path would be unreachable. The sub-suite's `before`
    //   installs the fake for every case, so it is removed here and restored in the
    //   `finally` — the seam is a process global, and leaving it uninstalled would
    //   silently turn every later case in this file into a live-SDK test.
    deregisterFakeFirebaseVerifier();
    try {
      assert.equal(
        hasCustomFirebaseIdTokenVerifier(),
        false,
        'this case needs the real verifier: a substituted one never checks configuration'
      );
      // The admin app is memoized per process, so an app built from a developer's
      // own .env would be handed back even with the variables cleared below — and
      // verifying against it would make a real network call to Google.
      await resetFirebaseAdminApp();

      await withFirebaseUnconfigured(async () => {
        const res = await link(token, { idToken: ID_TOKEN });
        assert.equal(res.status, 503, 'an operator problem is not a caller problem');
        assert.equal(res.json.code, 'FIREBASE_NOT_CONFIGURED');
        // The copy is fixed here, so no environment-variable name reaches the caller.
        assert.equal(bodySurface(res.json).includes('FIREBASE_PROJECT_ID'), false);
      });
    } finally {
      registerFakeFirebaseVerifier();
    }

    const me = await app.api('GET', ME, { token });
    assert.equal(me.status, 200);
    assert.equal((await reload(user)).firebaseUid ?? null, null);
  });

  it('14. a missing or blank idToken is a validation problem, not a token rejection', async () => {
    const business = await makeBusiness();
    const user = await makeUser({ business });
    const token = await tokenFor(user);

    for (const body of [{}, { idToken: '' }, { idToken: '   ' }]) {
      const res = await link(token, body);
      assert.equal(res.status, 400);
      assert.equal(res.json.code, 'VALIDATION_ERROR');
      assert.equal(res.json.fields[0].field, 'idToken');
    }
    assert.deepEqual(verifiedTokens(), [], 'nothing reached the verifier');
  });

  // -------------------------------------------------------------------------
  // §22-9/10 — the exchange is untouched and stays UID-authoritative
  // -------------------------------------------------------------------------

  it('15. ★ the exchange is still UID-authoritative: an email match resolves nothing', async () => {
    const id = uid();
    const business = await makeBusiness();
    const user = await makeUser({ business, email: uniqueEmail('match') });

    // The identity's address is THIS account's address, but the uid is unknown.
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });
    const notYet = await app.api('POST', EXCHANGE, { body: { idToken: ID_TOKEN } });
    assert.equal(notYet.status, 403);
    assert.equal(notYet.json.code, 'REGISTRATION_REQUIRED', 'an email match is not an account');

    // After an explicit link, the same uid exchanges successfully.
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });
    assert.equal((await link(await tokenFor(user), { idToken: ID_TOKEN })).status, 200);

    const after = await app.api('POST', EXCHANGE, { body: { idToken: ID_TOKEN } });
    assert.equal(after.status, 200);
    assert.equal(after.json.user.id, String(user._id));
    assert.equal(after.json.user.businessId, String(business._id));
  });

  it('16. an unknown uid still answers REGISTRATION_REQUIRED, including for a linked-looking address', async () => {
    const business = await makeBusiness();
    const user = await makeUser({ business, firebaseUid: uid() });

    setFakeFirebaseToken({ uid: uid(), email: user.email, email_verified: true });
    const res = await app.api('POST', EXCHANGE, { body: { idToken: ID_TOKEN } });

    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'REGISTRATION_REQUIRED');
    // The linked account was not disturbed by an exchange that resolved nothing.
    assert.equal((await reload(user)).firebaseUid.startsWith('p32h'), true);
  });

  // -------------------------------------------------------------------------
  // §22-11 — 32E is intact, and linking is what makes it bite
  // -------------------------------------------------------------------------

  it('17. ★§32E linking makes the password guard live, and never weakens it', async () => {
    const password = 'Password123!';
    const business = await makeBusiness();
    const user = await makeUser({ business, password });
    const token = await tokenFor(user);

    // Before: the legacy route works, exactly as it always has.
    const before = await app.api('POST', LOGIN, { body: { email: user.email, password } });
    assert.equal(before.status, 200, 'an unlinked legacy account still signs in with a password');
    assert.ok(before.json.token);

    // Link.
    const id = uid();
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });
    assert.equal((await link(token, { idToken: ID_TOKEN })).status, 200);

    // After: the password route refuses with the 32E code, and the bcrypt hash is
    // still intact — the guard is the refusal, not a destroyed credential.
    const after = await app.api('POST', LOGIN, { body: { email: user.email, password } });
    assert.equal(after.status, 403);
    assert.equal(after.json.code, 'FIREBASE_SIGN_IN_REQUIRED');
    const stored = await reload(user);
    assert.ok(stored.passwordHash, 'the hash is retained — the guard is what refuses');
    assert.equal(stored.firebaseUid, id);

    // And the Firebase path is the one that now works.
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });
    const exchanged = await app.api('POST', EXCHANGE, { body: { idToken: ID_TOKEN } });
    assert.equal(exchanged.status, 200);
    assert.equal(exchanged.json.user.id, String(user._id));
  });

  // -------------------------------------------------------------------------
  // §22-12 — nothing else about sessions or auth moved
  // -------------------------------------------------------------------------

  it('18. linking does not disturb the caller\'s session, and creates no new one', async () => {
    const id = uid();
    const business = await makeBusiness();
    const user = await makeUser({ business });
    const token = await tokenFor(user);

    const sessionsBefore = await activeSessionsOf(user._id);
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });

    const res = await link(token, { idToken: ID_TOKEN });
    assert.equal(res.status, 200);
    assert.equal(await activeSessionsOf(user._id), sessionsBefore, 'no session was minted');
    // The SAME token still authenticates — a link is not a re-authentication and
    // must not invalidate the credential that authorized it.
    const me = await app.api('GET', ME, { token });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.id, String(user._id));
  });

  it('19. a disabled account cannot link (requireAuth refuses first)', async () => {
    const business = await makeBusiness();
    const user = await makeUser({ business, status: 'DISABLED' });
    const token = await tokenFor(user);
    setFakeFirebaseToken({ uid: uid(), email: user.email, email_verified: true });

    const res = await link(token, { idToken: ID_TOKEN });

    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'ACCOUNT_DISABLED');
    assert.equal((await reload(user)).firebaseUid ?? null, null);
  });

  // -------------------------------------------------------------------------
  // The race
  // -------------------------------------------------------------------------

  it('20. ★ two accounts racing for one identity: exactly one wins, the other is a conflict', async () => {
    const id = uid();
    const business = await makeBusiness();
    const first = await makeUser({ business, email: uniqueEmail('race1') });
    const second = await makeUser({ business, email: uniqueEmail('race2') });
    const [t1, t2] = [await tokenFor(first), await tokenFor(second)];

    setFakeFirebaseToken({ uid: id, email: first.email, email_verified: true });
    const [r1, r2] = await Promise.all([
      link(t1, { idToken: ID_TOKEN }),
      link(t2, { idToken: ID_TOKEN }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    // One attaches; the other is refused. A 500 would mean the collision escaped as
    // an unhandled driver error, which is precisely what `duplicateKeyField` and the
    // conditional attach exist to prevent.
    assert.deepEqual(statuses, [200, 409], `unexpected outcomes: ${bodySurface([r1.json, r2.json])}`);

    const holders = await User.countDocuments({ firebaseUid: id });
    assert.equal(holders, 1, 'the unique index and the conditional attach agree: one owner, never two');
    const [s1, s2] = [await reload(first), await reload(second)];
    assert.equal([s1.firebaseUid, s2.firebaseUid].filter((u) => u === id).length, 1);
  });

  it('21. a concurrent re-link of the SAME identity is idempotent, not a conflict', async () => {
    const id = uid();
    const business = await makeBusiness();
    const user = await makeUser({ business, firebaseUid: id, emailVerified: true });
    const token = await tokenFor(user);
    setFakeFirebaseToken({ uid: id, email: user.email, email_verified: true });

    const results = await Promise.all([
      link(token, { idToken: ID_TOKEN }),
      link(token, { idToken: ID_TOKEN }),
      link(token, { idToken: ID_TOKEN }),
    ]);

    for (const res of results) {
      assert.equal(res.status, 200, 'already-yours is never a conflict, however many times it is asked');
      assert.equal(res.json.linked, false);
    }
    assert.equal(await User.countDocuments({ firebaseUid: id }), 1);
    assert.equal(await linkAudits(business._id, AUDIT_ACTIONS.FIREBASE_IDENTITY_LINK_CONFLICT), 0);
  });
});
