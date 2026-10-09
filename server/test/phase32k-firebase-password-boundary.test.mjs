// Phase 32K — the Firebase password boundary, and the timing equalizer that must
// never be a credential.
//
// Phase 32J made Firebase-native OWNER registration a normal outcome, which made
// the O-2 defect reachable in ordinary use: an account whose credential lives in
// Firebase could still be mailed a password-reset link, could still have a
// `passwordHash` written by it, and could be shown a success message for a
// password no login path could ever accept. The audit that followed (Phase 32K)
// also found a second, sharper defect in the same code: the timing equalizer
// `bcrypt.hashSync('timing-equalizer-placeholder', 10)` is a VALID hash of a KNOWN
// string, and the old `user?.passwordHash || DUMMY_HASH` idiom made it the
// comparison TARGET for any account with no stored hash — so the literal
// placeholder was a working password for such an account, and in change-password a
// working "current password" with which to install a real one.
//
// This suite pins BOTH fixes against the SHIPPED app, and it is written as a
// matrix rather than a set of happy paths because the three account shapes must
// keep three different behaviours:
//
//   * LEGACY (no uid, hash)      — local password authentication is untouched.
//   * FIREBASE-NATIVE (uid, no hash) — no local credential exists at all.
//   * FIREBASE-LINKED (uid, hash)    — a hash exists but cannot authenticate.
//
// Four properties are load-bearing and none is incidental:
//
//   1. THE PLACEHOLDER IS NEVER ACCEPTED. Proven on both call sites, and the
//      literal is READ OUT OF THE SOURCE rather than restated here, so the case
//      cannot pass vacuously if the string changes.
//   2. A REFUSED PASSWORD CHANGE WRITES NOTHING. No hash, no `passwordChangedAt`,
//      no revoked session — asserted from the database, not from the response.
//   3. THE RECOVERY ROUTE DOES NOT BECOME AN ORACLE. A Firebase account takes the
//      SAME silent exit as an unknown address: one uniform 202, no token row, no
//      email, no audit row. Nothing distinguishes it from outside.
//   4. THE CLIENT LEARNS A CAPABILITY, NOT AN IDENTITY. `authMethods.password`
//      appears on every user-bearing response, and `firebaseUid` appears on none.
//
// The mail layer is replaced by the Phase 26B-1 fake registered through the real
// provider registry, and the Firebase verifier by the Phase 32B fake registered
// through its real seam, so no case reaches the network.
//
// Registered PURE_DB in run-tests.mjs: every case needs a real MongoDB, and there
// is nothing here a database-free run could honestly assert.

import 'dotenv/config';

import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { ensureDb, disconnectDb } from './helpers.mjs';
import { createTracker, uniqueEmail, uniqueName, issueSessionToken } from './support.mjs';
import { dbSuite } from './testEnv.mjs';
import { readSource } from './sourceFiles.mjs';

import { createApp } from '../src/app.ts';
import Business from '../src/models/business.model.ts';
import User from '../src/models/user.model.ts';
import Session from '../src/models/session.model.ts';
import PasswordResetToken from '../src/models/passwordResetToken.model.ts';
import { PASSWORD_NOT_APPLICABLE_CODE } from '../src/services/auth.service.ts';
import { hashResetToken, generateResetToken } from '../src/services/passwordReset.service.ts';

import {
  registerFakeFirebaseVerifier,
  deregisterFakeFirebaseVerifier,
  setFakeFirebaseToken,
} from './fakes/firebaseVerifier.mjs';
import {
  FAKE_MAIL_PROVIDER,
  registerFakeMailProvider,
  deregisterFakeMailProvider,
  sentMessages,
  clearSentMessages,
  awaitPendingMail,
} from './fakes/mailProvider.mjs';

const LOGIN = '/api/auth/login';
const CHANGE_PASSWORD = '/api/auth/change-password';
const FORGOT = '/api/auth/forgot-password';
const RESET = '/api/auth/reset-password';
const EXCHANGE = '/api/auth/firebase/exchange';

/** The opaque string this suite submits as an ID token. Never a real one. */
const ID_TOKEN = 'phase32k.fake.id-token-that-the-seam-replaces';

const PASSWORD = 'Password123!';
const NEW_PASSWORD = 'NewPassword456!';

/**
 * The exact 202 the recovery request route answers with, restated rather than
 * imported so a change to the constant fails this suite instead of agreeing with
 * itself. Every non-error exit must produce this and nothing more specific.
 */
const FORGOT_ACCEPTED =
  'If an account exists for that email, a password reset link has been sent.';

/**
 * The literal the timing equalizer is built from, READ OUT OF THE SOURCE rather
 * than restated here.
 *
 * Restating it would be the one way this suite could fail to guard anything: if
 * the source string ever changed, every case below would keep submitting a value
 * that no longer matters and keep passing. Reading it means the submission is
 * always the string the application actually hashed. The `assert.ok` on the match
 * is what fails — loudly — if the equalizer is removed or restructured, so the
 * guard cannot silently stop guarding. Phase 23 uses the same idiom for its
 * declaration guards.
 */
const EQUALIZER_LITERAL = (() => {
  const source = readSource(new URL('../src/services/auth.service.ts', import.meta.url));
  const match = /bcrypt\.hashSync\('([^']+)'/.exec(source);
  assert.ok(
    match,
    'the timing equalizer must still be constructed from a string literal in auth.service.ts',
  );
  return match[1];
})();

/** Limiters opened wide, so no case here can trip one. */
const UNCAPPED = {
  loginMax: 100000,
  loginIpMax: 100000,
  registerMax: 100000,
  passwordResetMax: 100000,
  passwordResetIpMax: 100000,
  passwordResetConfirmMax: 100000,
  firebaseExchangeMax: 100000,
  firebaseRegisterMax: 100000,
};

const RESET_BASE = 'https://app.inventory-ai.test/reset-password';

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
  MAIL_REQUEST_TIMEOUT_MS: '10000',
  PASSWORD_RESET_URL: RESET_BASE,
};

let savedMailEnv = new Map();

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
        body: body === undefined ? undefined : JSON.stringify(body),
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

dbSuite('Phase 32K — the Firebase password boundary against a real database', dbOk, () => {
  const tracker = createTracker(dbOk);
  const { ObjectId } = mongoose.Types;
  let app = null;

  const login = (body) => app.api('POST', LOGIN, { body });

  async function makeBusiness({ status = 'ACTIVE' } = {}) {
    const business = await Business.create({ name: uniqueName('Biz32K'), status });
    tracker.trackBusiness(String(business._id));
    return business;
  }

  /**
   * A MongoDB user. `linked` and `hasHash` are the TWO independent inputs this
   * phase's matrix turns on, and they are the only things that vary between the
   * three account shapes — so a case that passes cannot be passing for a reason
   * other than those fields.
   */
  async function makeUser({ business, status = 'ACTIVE', linked = false, hasHash = true, password = PASSWORD } = {}) {
    const biz = business ?? (await makeBusiness());
    const user = await User.create({
      businessId: biz._id,
      name: uniqueName('U32K'),
      email: uniqueEmail('u32k'),
      ...(hasHash ? { passwordHash: bcrypt.hashSync(password, 10) } : {}),
      ...(linked ? { firebaseUid: uniqueName('uid32k') } : {}),
      role: 'OWNER',
      status,
    });
    tracker.trackUser(String(user._id));
    return user;
  }

  /** The legacy shape, registered through the real HTTP route so it is exactly
   *  what a pre-Firebase user looks like on this server. */
  async function registerLegacyOwner() {
    const email = uniqueEmail('owner32k');
    const res = await app.api('POST', '/api/auth/register', {
      body: { businessName: uniqueName('Biz32K'), name: uniqueName('Owner32K'), email, password: PASSWORD },
    });
    assert.equal(res.status, 201, `precondition: registration failed ${JSON.stringify(res.json)}`);
    tracker.trackBusiness(res.json.business.id);
    tracker.trackUser(res.json.user.id);
    return { email, userId: res.json.user.id, businessId: res.json.business.id };
  }

  const oid = (id) => new ObjectId(String(id));

  /** A live session token for a user that already exists (the Phase 26A shape). */
  const issueToken = (user) => issueSessionToken(user._id);

  const activeSessionsOf = (userId) =>
    Session.countDocuments({ userId: oid(userId), revokedAt: null });

  const tokensOf = (userId) => PasswordResetToken.countDocuments({ userId: oid(userId) });

  const auditCount = (userId, action) =>
    mongoose.connection.db
      .collection('audit_logs')
      .countDocuments({ userId: oid(userId), action });

  /** Re-reads the credential state that a refused change must not have touched. */
  async function credentialState(userId) {
    const fresh = await User.findById(userId).select('+passwordHash');
    return { hash: fresh.passwordHash ?? null, changedAt: fresh.passwordChangedAt ?? null };
  }

  before(async () => {
    savedMailEnv = new Map(MAIL_ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of MAIL_ENV_KEYS) {
      if (Object.prototype.hasOwnProperty.call(MAIL_ENV, key)) process.env[key] = MAIL_ENV[key];
      else delete process.env[key];
    }
    registerFakeMailProvider();
    registerFakeFirebaseVerifier();
    app = await listen(createApp({ requestLogging: false, authLimits: UNCAPPED }));
  });

  after(async () => {
    deregisterFakeFirebaseVerifier();
    deregisterFakeMailProvider();
    for (const [key, value] of savedMailEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (app) await app.close();
    await tracker.cleanup();
    await disconnectDb();
  });

  // -------------------------------------------------------------------------
  // The unchanged half — the legacy account must not have moved at all
  // -------------------------------------------------------------------------

  it('1. a legacy account signs in, and change-password still works end to end', async () => {
    const owner = await registerLegacyOwner();

    const signedIn = await login({ email: owner.email, password: PASSWORD });
    assert.equal(signedIn.status, 200, 'the legacy password path is untouched');
    assert.equal(signedIn.json.user.authMethods.password, true, 'and it manages its own password');

    const changed = await app.api('POST', CHANGE_PASSWORD, {
      token: signedIn.json.token,
      body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });
    assert.equal(changed.status, 200, `change-password must still work: ${JSON.stringify(changed.json)}`);

    const relogin = await login({ email: owner.email, password: NEW_PASSWORD });
    assert.equal(relogin.status, 200, 'and the new password is the one that works');
  });

  it('2. a legacy account can still be sent a reset link', async () => {
    const owner = await registerLegacyOwner();
    clearSentMessages();

    const res = await app.api('POST', FORGOT, { body: { email: owner.email } });
    await awaitPendingMail();

    assert.equal(res.status, 202);
    assert.equal(res.json.message, FORGOT_ACCEPTED);
    assert.equal(await tokensOf(owner.userId), 1, 'a link was actually issued');
    assert.equal(sentMessages().length, 1, 'and it was actually sent');
  });

  // -------------------------------------------------------------------------
  // ★ The timing equalizer is not a credential
  // -------------------------------------------------------------------------

  it('3. ★ the equalizer literal cannot authenticate an account with no hash', async () => {
    // The sharpest form of the defect: this account has NO uid and NO hash, so the
    // old `|| DUMMY_HASH` made the placeholder the comparison target outright and
    // the login SUCCEEDED. A session would then exist for an account with no
    // password at all.
    const user = await makeUser({ linked: false, hasHash: false });

    const res = await login({ email: user.email, password: EQUALIZER_LITERAL });

    assert.equal(res.status, 401, 'the placeholder must never authenticate');
    assert.equal(res.json.code, 'INVALID_CREDENTIALS');
    assert.equal(res.json.token, undefined, 'no token is handed out');
    assert.equal(await activeSessionsOf(user._id), 0, 'and no session is written');
  });

  it('4. ★ the equalizer literal cannot be used as a current password to install one', async () => {
    // The second call site of the same idiom, and the one with a lasting effect:
    // accepting the placeholder here WRITES a real hash, so the attacker leaves
    // with a credential rather than a session.
    const user = await makeUser({ linked: false, hasHash: false });
    const token = await issueToken(user);

    const res = await app.api('POST', CHANGE_PASSWORD, {
      token,
      body: { currentPassword: EQUALIZER_LITERAL, newPassword: NEW_PASSWORD },
    });

    assert.equal(res.status, 400, 'the placeholder is not a current password');
    assert.equal(res.json.code, 'INVALID_CURRENT_PASSWORD');

    const state = await credentialState(user._id);
    assert.equal(state.hash, null, 'no credential was installed');
    assert.equal(state.changedAt, null, 'and nothing was stamped');

    const relogin = await login({ email: user.email, password: NEW_PASSWORD });
    assert.equal(relogin.status, 401, 'the attempted new password does not work either');
  });

  // -------------------------------------------------------------------------
  // Firebase-native: an identity with no local credential at all
  // -------------------------------------------------------------------------

  it('5. a Firebase-native account cannot sign in locally with anything', async () => {
    // Two submissions, because they say different things: an ordinary wrong
    // password is the generic 401, and the timing literal is the SAME generic 401
    // — which is what makes the placeholder unusable rather than merely refused.
    const user = await makeUser({ linked: true, hasHash: false });

    const ordinary = await login({ email: user.email, password: PASSWORD });
    const placeholder = await login({ email: user.email, password: EQUALIZER_LITERAL });

    assert.equal(ordinary.status, 401);
    assert.equal(placeholder.status, 401);
    assert.deepEqual(ordinary.json, placeholder.json, 'the two refusals are indistinguishable');
    assert.equal(ordinary.json.code, 'INVALID_CREDENTIALS');
    assert.equal(await activeSessionsOf(user._id), 0);
  });

  it('6. ★ change-password is refused for a Firebase-native account and writes nothing', async () => {
    const user = await makeUser({ linked: true, hasHash: false });
    const token = await issueToken(user);

    const res = await app.api('POST', CHANGE_PASSWORD, {
      token,
      body: { currentPassword: EQUALIZER_LITERAL, newPassword: NEW_PASSWORD },
    });

    assert.equal(res.status, 409);
    assert.equal(res.json.code, PASSWORD_NOT_APPLICABLE_CODE);
    assert.equal(res.json.code, 'PASSWORD_NOT_APPLICABLE', 'the exported constant is the contract');
    // The status is not incidental: a 401 or 403 here would be read by the mobile
    // client's session-loss rule as "your session died" and sign the user out of a
    // session that is perfectly valid.
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);

    const state = await credentialState(user._id);
    assert.equal(state.hash, null, 'no credential was created');
    assert.equal(state.changedAt, null, 'nothing was stamped');
    assert.equal(await activeSessionsOf(user._id), 1, 'and the caller was not signed out');
  });

  it('7. ★ a Firebase-native account takes the silent recovery exit — no token, no email', async () => {
    const user = await makeUser({ linked: true, hasHash: false });
    const auditBefore = await auditCount(user._id, 'PASSWORD_RESET_REQUESTED');
    clearSentMessages();

    const res = await app.api('POST', FORGOT, { body: { email: user.email } });
    await awaitPendingMail();

    assert.equal(res.status, 202, 'the uniform answer — a Firebase account is not distinguishable');
    assert.equal(res.json.message, FORGOT_ACCEPTED);
    assert.equal(await tokensOf(user._id), 0, 'no reset token was minted');
    assert.equal(sentMessages().length, 0, 'and no misleading email was sent');
    assert.equal(
      await auditCount(user._id, 'PASSWORD_RESET_REQUESTED'),
      auditBefore,
      'and the trail records no recovery request that was refused',
    );
  });

  it('8. ★ reset-password refuses a hand-issued token for a Firebase-native account', async () => {
    // A token that could still exist from before this phase. The claim is what is
    // being tested as much as the refusal: the token is SPENT (fail-closed) and the
    // account is left completely untouched — no hash, no stamp, no revocation, and
    // no PASSWORD_RESET_COMPLETED row.
    const user = await makeUser({ linked: true, hasHash: false });
    const raw = generateResetToken();
    await PasswordResetToken.create({
      userId: user._id,
      tokenHash: hashResetToken(raw),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const before = await auditCount(user._id, 'PASSWORD_RESET_COMPLETED');

    const res = await app.api('POST', RESET, {
      body: { token: raw, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
    });

    assert.equal(res.status, 400);
    assert.equal(res.json.code, 'INVALID_RESET_TOKEN');

    const state = await credentialState(user._id);
    assert.equal(state.hash, null, 'no local credential was written');
    assert.equal(state.changedAt, null, 'and no invalidation was stamped');
    assert.equal(await auditCount(user._id, 'PASSWORD_RESET_COMPLETED'), before);

    const relogin = await login({ email: user.email, password: NEW_PASSWORD });
    assert.equal(relogin.status, 401, 'the submitted password does not work');
  });

  // -------------------------------------------------------------------------
  // Firebase-linked: a retained hash that must not be a second way in
  // -------------------------------------------------------------------------

  it('9. a Firebase-linked account is still refused on the legacy route (32E intact)', async () => {
    const user = await makeUser({ linked: true, hasHash: true });

    const res = await login({ email: user.email, password: PASSWORD });

    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'FIREBASE_SIGN_IN_REQUIRED');
    assert.equal(res.json.token, undefined);
    assert.equal(await activeSessionsOf(user._id), 0);
  });

  it('10. ★ change-password is refused for a Firebase-linked account and leaves the hash alone', async () => {
    // The retained hash is deliberately NOT deleted — the unlink capability that would
    // have used it is CLOSED/REMOVED by Phase A / F-1 — so the property here is that it
    // is INERT rather than gone, an inert/closed boundary rather than an open future
    // implementation: the original password still verifies against it, and the
    // password this call tried to set does not.
    const user = await makeUser({ linked: true, hasHash: true });
    const token = await issueToken(user);
    const before = await credentialState(user._id);

    const res = await app.api('POST', CHANGE_PASSWORD, {
      token,
      body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });

    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'PASSWORD_NOT_APPLICABLE');

    const after = await credentialState(user._id);
    assert.equal(after.hash, before.hash, 'the retained hash is byte-identical');
    assert.equal(after.changedAt, before.changedAt, 'and no invalidation was stamped');
    assert.equal(await bcrypt.compare(PASSWORD, after.hash), true, 'the old credential still verifies');
    assert.equal(await bcrypt.compare(NEW_PASSWORD, after.hash), false, 'the attempted one does not');
    assert.equal(await activeSessionsOf(user._id), 1, 'and the caller was not signed out');
  });

  it('11. ★ a Firebase-linked account also takes the silent recovery exit', async () => {
    const user = await makeUser({ linked: true, hasHash: true });
    clearSentMessages();

    const res = await app.api('POST', FORGOT, { body: { email: user.email } });
    await awaitPendingMail();

    assert.equal(res.status, 202);
    assert.equal(await tokensOf(user._id), 0, 'no token for an account whose local password is inert');
    assert.equal(sentMessages().length, 0, 'and nothing was sent');
  });

  // -------------------------------------------------------------------------
  // ★ The client learns a capability, never the identity behind it
  // -------------------------------------------------------------------------

  it('12. ★ every user-bearing response publishes authMethods and no firebaseUid', async () => {
    // Three surfaces, because the client reads the user object from more than one:
    // `toPublicUser` answers login/exchange/register, while GET /api/auth/me answers
    // `req.user` from requireAuth. They are derived from one helper so they cannot
    // disagree — asserted here rather than assumed.
    const linked = await makeUser({ linked: true, hasHash: true });
    const token = await issueToken(linked);

    const me = await app.api('GET', '/api/auth/me', { token });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.authMethods.password, false, 'requireAuth publishes the capability');
    assert.equal(JSON.stringify(me.json).includes(linked.firebaseUid), false, 'never the uid');
    assert.equal(JSON.stringify(me.json).includes('firebaseUid'), false, 'not even the field name');

    const native = await makeUser({ linked: true, hasHash: false });
    setFakeFirebaseToken({ uid: native.firebaseUid, email: native.email, email_verified: true });
    const exchanged = await app.api('POST', EXCHANGE, { body: { idToken: ID_TOKEN } });

    assert.equal(exchanged.status, 200, `precondition: exchange failed ${JSON.stringify(exchanged.json)}`);
    assert.equal(exchanged.json.user.authMethods.password, false, 'and the exchange does too');
    assert.equal(JSON.stringify(exchanged.json).includes(native.firebaseUid), false, 'never the uid');

    const legacy = await registerLegacyOwner();
    const signedIn = await login({ email: legacy.email, password: PASSWORD });
    assert.equal(signedIn.json.user.authMethods.password, true, 'a legacy account keeps local management');
  });
});
