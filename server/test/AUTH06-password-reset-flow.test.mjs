/**
 * AUTH-06 — the in-app six-digit password-reset flow.
 *
 * WHY THIS SUITE EXISTS. This is the flow that replaces both Firebase's browser reset and the
 * 26B link, and it is reachable without a session, so the properties below are the whole
 * security argument:
 *
 *   1. THE REQUEST CANNOT ENUMERATE ACCOUNTS. Known, unknown, ineligible and delivery-failure
 *      outcomes are one status and one sentence; the send is detached, so the response time does
 *      not include a mail provider either.
 *   2. A GUESS COSTS AN ATTEMPT, AND A MALFORMED SUBMISSION COSTS NONE. The reservation is one
 *      conditional update; the validator refuses an unfinished payload before the service runs.
 *   3. THE ACCOUNT WRITTEN IS THE ONE RECORDED WHEN THE CODE WAS ISSUED, never one re-derived
 *      from the address at confirm time.
 *   4. THE RESET IS FINAL. The password is written through Firebase, `passwordChangedAt` is
 *      stamped, and every existing Inventory AI session is revoked — the thing a Firebase-native
 *      reset could not do.
 *   5. NO SECRET REACHES A LOG, an error, or a response body: not the code, not a digest, not the
 *      pepper, not a password.
 *
 * Registered MIXED in run-tests.mjs: the template and validator cases run without a database,
 * everything else needs MongoDB and the fake mail provider.
 */

import 'dotenv/config';

import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { dbSuite, unitSuite } from './testEnv.mjs';
import {
  startServer,
  makeApi,
  createTracker,
  issueSessionToken,
  uniqueEmail,
  uniqueName,
  disconnectDb,
} from './support.mjs';
import {
  registerFakeMailProvider,
  deregisterFakeMailProvider,
  setFakeMailScenario,
  clearSentMessages,
  sentMessages,
  lastSentMessage,
  fakeMailGate,
  awaitPendingMail,
} from './fakes/mailProvider.mjs';
import { FAKE_MAIL_PROVIDER } from './fakes/mailProvider.mjs';

import Business from '../src/models/business.model.ts';
import User from '../src/models/user.model.ts';
import Session from '../src/models/session.model.ts';
import AuditLog from '../src/models/auditLog.model.ts';
import PasswordResetChallenge from '../src/models/passwordResetChallenge.model.ts';
import { AUDIT_ACTIONS } from '../src/constants/audit.ts';
import {
  INVALID_PASSWORD_RESET_CODE,
  PASSWORD_RESET_CODE_MAX_ATTEMPTS,
  PASSWORD_RESET_CODE_NOT_CONFIGURED,
  PASSWORD_RESET_CODE_TTL_MINUTES,
} from '../src/constants/passwordResetCode.ts';
import {
  hashResetCode,
  hashResetEmail,
} from '../src/services/passwordResetCode/code.ts';
import {
  requestPasswordResetCode,
  confirmPasswordResetCode,
  PasswordResetCodeError,
} from '../src/services/passwordResetCode/index.ts';
import { passwordResetCodeEmail } from '../src/services/mail/templates/passwordResetCode.ts';
import {
  setFirebasePasswordUpdater,
  resetFirebasePasswordUpdater,
  setFirebaseTokenRevoker,
  resetFirebaseTokenRevoker,
} from '../src/services/firebase/passwordUpdater.ts';
import { FirebaseUnavailableError } from '../src/services/firebase/firebaseErrors.ts';
import {
  validatePasswordResetCodeRequest,
  validatePasswordResetCodeConfirm,
} from '../src/utils/validate.ts';

const PEPPER = 'pepper-for-tests-only-0123456789abcdef';
const NEW_PASSWORD = 'NewPassword456!';
const { dbOk, baseUrl, server } = await startServer();
const api = makeApi(baseUrl);
const tracker = createTracker(dbOk);

const MAIL_ENV_KEYS = ['MAIL_PROVIDER', 'BREVO_API_KEY', 'MAIL_FROM', 'MAIL_APP_NAME'];

let savedEnv = new Map();

async function withEnv(vars, fn) {
  const keys = [...MAIL_ENV_KEYS, 'EMAIL_VERIFICATION_CODE_PEPPER'];
  const saved = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function captureError(fn) {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  return assert.fail('expected the call to throw, but it resolved');
}

/** A Firebase-backed account: the reset flow needs a `firebaseUid` to write through the Admin SDK. */
async function makeFirebaseUser({ status = 'ACTIVE', firebaseUid } = {}) {
  const business = await Business.create({ name: uniqueName('ResetBiz') });
  tracker.trackBusiness(business._id);
  const user = await User.create({
    businessId: business._id,
    name: uniqueName('ResetOwner'),
    email: uniqueEmail('reset'),
    firebaseUid: firebaseUid ?? `uid-${new mongoose.Types.ObjectId().toString()}`,
    role: 'OWNER',
    status,
    emailVerified: true,
  });
  tracker.trackUser(user._id);
  return { business, user };
}

function codeFromMessage(message) {
  const match = /\b(\d{6})\b/.exec(message?.text ?? '');
  assert.ok(match, 'the reset email must carry a six-digit code');
  return match[1];
}

async function challengeFor(email) {
  return PasswordResetChallenge.findOne({ emailHmac: hashResetEmail(PEPPER, email) });
}

/** Records what the Admin bridge was asked to do, so the assertions are about real calls. */
let passwordWrites = [];
let tokenRevocations = [];

before(async () => {
  savedEnv = new Map(MAIL_ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.MAIL_PROVIDER = FAKE_MAIL_PROVIDER;
  process.env.MAIL_FROM = 'Inventory AI <no-reply@inventory-ai.test>';
  process.env.EMAIL_VERIFICATION_CODE_PEPPER = PEPPER;
  registerFakeMailProvider();
  setFirebasePasswordUpdater(async (uid, password) => {
    passwordWrites.push({ uid, password });
    return { uid };
  });
  setFirebaseTokenRevoker(async (uid) => {
    tokenRevocations.push(uid);
    return { uid };
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  deregisterFakeMailProvider();
  resetFirebasePasswordUpdater();
  resetFirebaseTokenRevoker();
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await tracker.cleanup();
  // Without this the Mongoose connection keeps the process alive after the last test, and the run
  // reports a timeout rather than a suite result.
  await disconnectDb();
});

// ---------------------------------------------------------------------------
// The template — DB-free
// ---------------------------------------------------------------------------

unitSuite('AUTH-06 reset email template', () => {
  it('carries exactly six digits and keeps a leading zero', () => {
    const { text, html } = passwordResetCodeEmail({ code: '000042', expiresInMinutes: 10 });
    assert.ok(text.includes('000042'));
    assert.ok(html.includes('000042'));
  });

  it('keeps the code out of the subject line, so it never reaches a lock screen', () => {
    const { subject } = passwordResetCodeEmail({ code: '123456' });
    assert.ok(!subject.includes('123456'));
    assert.match(subject, /reset/i);
  });

  it('contains no address, no link and no identifier', () => {
    const { subject, text, html } = passwordResetCodeEmail({ code: '123456' });
    const everything = `${subject}\n${text}\n${html}`;
    assert.ok(!/@/.test(everything), 'no address may appear in the message');
    assert.ok(!/https?:\/\//i.test(everything), 'a reset code email carries no link');
    assert.ok(!/oobCode|token|firebaseUid/i.test(everything));
  });

  it('states the lifetime it was given, and refuses an unusable code without echoing it', () => {
    assert.ok(passwordResetCodeEmail({ code: '123456', expiresInMinutes: 10 }).text.includes('10 minutes'));
    assert.throws(() => passwordResetCodeEmail({ code: '12345' }), (err) => {
      assert.ok(!String(err.message).includes('12345'), 'the rejected value is a credential');
      return true;
    });
  });
});

// ---------------------------------------------------------------------------
// Payload validators — DB-free
// ---------------------------------------------------------------------------

unitSuite('AUTH-06 reset payloads', () => {
  it('reads only the address, normalizing it, and leaves every other key inert', () => {
    const { problems, email } = validatePasswordResetCodeRequest({
      email: '  Owner@Example.TEST ',
      userId: 'someone-else',
      businessId: 'another-tenant',
      role: 'OWNER',
    });
    assert.deepEqual(problems, []);
    assert.equal(email, 'owner@example.test');
  });

  it('rejects a missing or malformed address', () => {
    assert.ok(validatePasswordResetCodeRequest({}).problems.some((p) => p.field === 'email'));
    assert.ok(validatePasswordResetCodeRequest({ email: 'nope' }).problems.some((p) => p.field === 'email'));
  });

  it('accepts a well-formed confirmation payload and never returns the confirmation password', () => {
    const result = validatePasswordResetCodeConfirm({
      email: 'owner@example.test',
      code: ' 123456 ',
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    assert.deepEqual(result.problems, []);
    assert.equal(result.email, 'owner@example.test');
    assert.equal(result.code, '123456');
    assert.equal(result.newPassword, NEW_PASSWORD);
    assert.equal(
      Object.prototype.hasOwnProperty.call(result, 'confirmPassword'),
      false,
      'the confirmation must have no variable to forward or persist'
    );
  });

  it('refuses a short password and a mismatched confirmation, before any request is made', () => {
    const short = validatePasswordResetCodeConfirm({
      email: 'owner@example.test',
      code: '123456',
      newPassword: 'short',
      confirmPassword: 'short',
    });
    assert.ok(short.problems.some((p) => p.field === 'newPassword'));

    const mismatched = validatePasswordResetCodeConfirm({
      email: 'owner@example.test',
      code: '123456',
      newPassword: NEW_PASSWORD,
      confirmPassword: `${NEW_PASSWORD}x`,
    });
    assert.ok(mismatched.problems.some((p) => p.field === 'confirmPassword'));
  });

  it('refuses an unfinished code as a field problem, so a typo cannot spend a guess', () => {
    const { problems } = validatePasswordResetCodeConfirm({
      email: 'owner@example.test',
      code: '1234',
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    assert.ok(problems.some((p) => p.field === 'code'));
  });
});

// ---------------------------------------------------------------------------
// The request lifecycle
// ---------------------------------------------------------------------------

dbSuite('AUTH-06 reset code — request', dbOk, () => {
  it('refuses before any database work when the pepper is unusable', async () => {
    const { user } = await makeFirebaseUser();
    const err = await withEnv({ EMAIL_VERIFICATION_CODE_PEPPER: undefined }, () =>
      captureError(() => requestPasswordResetCode({ email: user.email }))
    );
    assert.ok(err instanceof PasswordResetCodeError);
    assert.equal(err.code, PASSWORD_RESET_CODE_NOT_CONFIGURED);
    assert.equal(await challengeFor(user.email), null, 'no challenge may be minted');
    assert.equal(lastSentMessage(), null, 'no mail may be attempted');
  });

  it('refuses before any database work when mail cannot be sent', async () => {
    const { user } = await makeFirebaseUser();
    clearSentMessages();
    const err = await withEnv({ MAIL_PROVIDER: undefined }, () =>
      captureError(() => requestPasswordResetCode({ email: user.email }))
    );
    assert.ok(err instanceof PasswordResetCodeError);
    assert.equal(err.code, PASSWORD_RESET_CODE_NOT_CONFIGURED);
    assert.equal(await challengeFor(user.email), null);
  });

  it('resolves silently for an unknown address, minting nothing and sending nothing', async () => {
    clearSentMessages();
    const email = uniqueEmail('stranger');
    await requestPasswordResetCode({ email });
    assert.equal(await challengeFor(email), null);
    assert.equal(lastSentMessage(), null);
  });

  it('resolves silently for an account that is not ACTIVE', async () => {
    const { user } = await makeFirebaseUser({ status: 'DISABLED' });
    clearSentMessages();
    await requestPasswordResetCode({ email: user.email });
    assert.equal(await challengeFor(user.email), null);
    assert.equal(lastSentMessage(), null);
  });

  it('mints one challenge bound to the account and emails the plaintext code', async () => {
    const { user, business } = await makeFirebaseUser();
    clearSentMessages();
    await requestPasswordResetCode({ email: user.email });
    await awaitPendingMail();

    const challenge = await challengeFor(user.email);
    assert.ok(challenge, 'a challenge must exist for an eligible account');
    assert.equal(String(challenge.userId), String(user._id));
    assert.equal(String(challenge.userId), String(user._id));
    assert.ok(!challenge.emailHmac.includes(user.email), 'the address itself is never stored');
    assert.equal(challenge.attempts, 0);
    assert.equal(challenge.usedAt, null);
    assert.equal(challenge.codeHmac.length, 64);

    const minutes = Math.round(
      (challenge.expiresAt.getTime() - Date.now()) / 60000
    );
    assert.ok(
      Math.abs(minutes - PASSWORD_RESET_CODE_TTL_MINUTES) <= 1,
      `expected a ${PASSWORD_RESET_CODE_TTL_MINUTES}-minute window, got ${minutes}`
    );

    const message = lastSentMessage();
    assert.equal(message.to, user.email);
    const code = codeFromMessage(message);
    assert.equal(
      challenge.codeHmac,
      hashResetCode(PEPPER, code),
      'the stored digest must be the digest of the mailed code'
    );
    assert.ok(!message.text.includes(PEPPER));
    assert.equal(String(business._id), String(user.businessId));
  });

  it('does not wait for the mail provider, and never surfaces a delivery failure', async () => {
    const { user } = await makeFirebaseUser();
    const gate = fakeMailGate({ fail: 'provider down' });
    setFakeMailScenario(gate.scenario);
    try {
      // The gate holds the send open. If the request awaited it, this would never resolve.
      await requestPasswordResetCode({ email: user.email });
      gate.release();
      await awaitPendingMail();
      assert.ok(
        await challengeFor(user.email),
        'a delivery failure leaves the challenge current, so the provider is not hammered'
      );
    } finally {
      setFakeMailScenario(null);
    }
  });

  it('★ answers an immediate second request with silence, not with a refusal', async () => {
    const { user } = await makeFirebaseUser();
    clearSentMessages();
    await requestPasswordResetCode({ email: user.email });
    await awaitPendingMail();

    const first = await challengeFor(user.email);
    const firstCode = codeFromMessage(sentMessages()[0]);

    // THE COOLDOWN IS INVISIBLE, AND THAT IS THE SECURITY FIX (2026-10-20).
    //
    // A challenge row exists only for an ELIGIBLE account, so a 429 here would be reachable only
    // for a real one: "second request refused" would answer "this address has an account", which
    // is the one question this entire path is shaped not to answer. AUTH-04 may refuse its
    // cooldown with a 429 because that route is authenticated; a public route has no such licence.
    // Resolves like every other non-error path. A throw here fails the case, which is the point:
    // the refusal this replaced was the leak.
    assert.equal(await requestPasswordResetCode({ email: user.email }), undefined);
    await awaitPendingMail();

    assert.equal(sentMessages().length, 1, 'one request per window means one email');
    const after = await challengeFor(user.email);
    assert.equal(String(after._id), String(first._id), 'the live code is not replaced');
    assert.equal(after.codeHmac, first.codeHmac, 'the mailed code is still the code');
    assert.equal(
      after.codeHmac,
      hashResetCode(PEPPER, firstCode),
      'and it is still the one in the person’s inbox'
    );
    assert.equal(after.expiresAt.getTime(), first.expiresAt.getTime(), 'expiring when it said it would');
  });

  it('suppresses the second send for an UNKNOWN address in exactly the same way', async () => {
    // The uniformity the case above depends on: with no row and no account, the same two calls
    // resolve the same way and produce no mail at all. Neither caller can observe which one they
    // are — no error, no header, no second message.
    const email = uniqueEmail('ghost');
    clearSentMessages();

    assert.equal(await requestPasswordResetCode({ email }), undefined);
    assert.equal(await requestPasswordResetCode({ email }), undefined);
    await awaitPendingMail();

    assert.equal(sentMessages().length, 0);
    assert.equal(await challengeFor(email), null, 'an unknown address never gets a row');
  });

  it('carries no secret, and no cooldown field, on the one error it can still throw', () => {
    // The request path now throws for EXACTLY one reason — an unusable configuration — so the
    // secret-hygiene claim is asserted on that shape directly rather than by provoking a lookup.
    //
    // `retryAfterSeconds` is gone with the 429 it fed. Its absence is asserted, not assumed: a
    // field that describes a wait also describes WHOSE wait it is, and on a public route that is
    // an account-existence answer wearing a number.
    const err = new PasswordResetCodeError(
      PASSWORD_RESET_CODE_NOT_CONFIGURED,
      'Password reset is temporarily unavailable. Please try again later.'
    );
    const rendered = `${err.message} ${JSON.stringify(err)}`;
    assert.ok(!('retryAfterSeconds' in err), 'no cooldown figure may exist on this error');
    assert.ok(!rendered.includes(PEPPER));
    assert.ok(!/codeHmac|emailHmac/.test(rendered));
  });
});

// ---------------------------------------------------------------------------
// The confirm lifecycle
// ---------------------------------------------------------------------------

dbSuite('AUTH-06 reset code — confirm', dbOk, () => {
  it('spends exactly one attempt on a wrong code and writes nothing', async () => {
    const { user } = await makeFirebaseUser();
    passwordWrites = [];
    await requestPasswordResetCode({ email: user.email });
    await awaitPendingMail();
    const code = codeFromMessage(lastSentMessage());
    const wrong = code === '111111' ? '222222' : '111111';

    const err = await captureError(() =>
      confirmPasswordResetCode({ email: user.email, code: wrong, newPassword: NEW_PASSWORD })
    );
    assert.equal(err.code, INVALID_PASSWORD_RESET_CODE);
    assert.equal((await challengeFor(user.email)).attempts, 1);
    assert.equal(passwordWrites.length, 0, 'a wrong code must never reach the credential write');
    assert.equal((await challengeFor(user.email)).usedAt, null);
  });

  it('refuses once the attempt budget is exhausted, without incrementing past it', async () => {
    const { user } = await makeFirebaseUser();
    await requestPasswordResetCode({ email: user.email });
    await awaitPendingMail();
    const challenge = await challengeFor(user.email);
    await PasswordResetChallenge.updateOne(
      { _id: challenge._id },
      { $set: { attempts: PASSWORD_RESET_CODE_MAX_ATTEMPTS } }
    );

    const err = await captureError(() =>
      confirmPasswordResetCode({ email: user.email, code: '000000', newPassword: NEW_PASSWORD })
    );
    assert.equal(err.code, INVALID_PASSWORD_RESET_CODE);
    assert.equal(
      (await challengeFor(user.email)).attempts,
      PASSWORD_RESET_CODE_MAX_ATTEMPTS,
      'an exhausted challenge must not be charged another attempt'
    );
  });

  it('refuses an expired code', async () => {
    const { user } = await makeFirebaseUser();
    await requestPasswordResetCode({ email: user.email });
    await awaitPendingMail();
    const code = codeFromMessage(lastSentMessage());
    const challenge = await challengeFor(user.email);
    await PasswordResetChallenge.updateOne(
      { _id: challenge._id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    const err = await captureError(() =>
      confirmPasswordResetCode({ email: user.email, code, newPassword: NEW_PASSWORD })
    );
    assert.equal(err.code, INVALID_PASSWORD_RESET_CODE);
  });

  it('changes the password through Firebase, revokes every session, and writes the audit row', async () => {
    const { user } = await makeFirebaseUser();
    await requestPasswordResetCode({ email: user.email });
    await awaitPendingMail();
    const code = codeFromMessage(lastSentMessage());
    const { token } = await issueSessionToken(user._id);
    passwordWrites = [];
    tokenRevocations = [];

    const result = await confirmPasswordResetCode({
      email: user.email,
      code,
      newPassword: NEW_PASSWORD,
    });

    assert.ok(result.changedAt instanceof Date);
    assert.deepEqual(passwordWrites, [{ uid: user.firebaseUid, password: NEW_PASSWORD }]);
    assert.deepEqual(tokenRevocations, [user.firebaseUid]);

    const updated = await User.findById(user._id);
    assert.ok(updated.passwordChangedAt, 'the stamp authenticate.ts compares iat against');
    assert.equal(updated.passwordHash, undefined, 'no server-side password hash is written');

    const session = await Session.findOne({ userId: user._id, jti: token ? token.jti : undefined });
    assert.equal(session, null, 'every existing session must be gone');

    const audit = await AuditLog.findOne({
      action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
      userId: user._id,
    });
    assert.ok(audit, 'a completed reset must be recorded');
    assert.equal(String(audit.businessId), String(user.businessId));

    const challenge = await challengeFor(user.email);
    assert.ok(challenge.usedAt, 'the code is spent');
    assert.ok(!JSON.stringify(audit).includes(code), 'the audit row never carries the code');
  });

  it('cannot redeem the same code twice', async () => {
    const { user } = await makeFirebaseUser();
    await requestPasswordResetCode({ email: user.email });
    await awaitPendingMail();
    const code = codeFromMessage(lastSentMessage());
    await confirmPasswordResetCode({ email: user.email, code, newPassword: NEW_PASSWORD });

    const err = await captureError(() =>
      confirmPasswordResetCode({ email: user.email, code, newPassword: `${NEW_PASSWORD}x` })
    );
    assert.equal(err.code, INVALID_PASSWORD_RESET_CODE);
  });

  it('does not fail the reset when the refresh-token revocation fails', async () => {
    const { user } = await makeFirebaseUser();
    await requestPasswordResetCode({ email: user.email });
    await awaitPendingMail();
    const code = codeFromMessage(lastSentMessage());
    setFirebaseTokenRevoker(async () => {
      throw new FirebaseUnavailableError('revoke-failed');
    });
    try {
      const result = await confirmPasswordResetCode({
        email: user.email,
        code,
        newPassword: NEW_PASSWORD,
      });
      assert.ok(result.changedAt, 'the password change already happened and must be reported');
      assert.ok((await User.findById(user._id)).passwordChangedAt);
    } finally {
      setFirebaseTokenRevoker(async (uid) => {
        tokenRevocations.push(uid);
        return { uid };
      });
    }
  });

  it('leaves the code unspent when the credential write fails', async () => {
    const { user } = await makeFirebaseUser();
    await requestPasswordResetCode({ email: user.email });
    await awaitPendingMail();
    const code = codeFromMessage(lastSentMessage());
    setFirebasePasswordUpdater(async () => {
      throw new FirebaseUnavailableError('admin-unavailable');
    });
    try {
      const err = await captureError(() =>
        confirmPasswordResetCode({ email: user.email, code, newPassword: NEW_PASSWORD })
      );
      assert.ok(err instanceof FirebaseUnavailableError);
      assert.equal((await challengeFor(user.email)).usedAt, null);
      assert.equal((await User.findById(user._id)).passwordChangedAt, null);
    } finally {
      setFirebasePasswordUpdater(async (uid, password) => {
        passwordWrites.push({ uid, password });
        return { uid };
      });
    }
  });

  it('refuses before any database work when the pepper is unusable', async () => {
    const { user } = await makeFirebaseUser();
    const err = await withEnv({ EMAIL_VERIFICATION_CODE_PEPPER: undefined }, () =>
      captureError(() =>
        confirmPasswordResetCode({ email: user.email, code: '123456', newPassword: NEW_PASSWORD })
      )
    );
    assert.equal(err.code, PASSWORD_RESET_CODE_NOT_CONFIGURED);
  });

  it('refuses a blank code without spending an attempt', async () => {
    const { user } = await makeFirebaseUser();
    await requestPasswordResetCode({ email: user.email });
    await awaitPendingMail();
    const err = await captureError(() =>
      confirmPasswordResetCode({ email: user.email, code: '   ', newPassword: NEW_PASSWORD })
    );
    assert.equal(err.code, INVALID_PASSWORD_RESET_CODE);
    assert.equal((await challengeFor(user.email)).attempts, 0);
  });
});

// ---------------------------------------------------------------------------
// The HTTP surface
// ---------------------------------------------------------------------------

const REQUEST_ACCEPTED =
  'If an account exists for that email, a password reset code has been sent.';

dbSuite('AUTH-06 reset over HTTP', dbOk, () => {
  it('answers one 202 and one sentence for a known and an unknown address alike', async () => {
    const { user } = await makeFirebaseUser();
    clearSentMessages();
    const known = await api('POST', '/api/auth/password-reset/code', { body: { email: user.email } });
    const unknown = await api('POST', '/api/auth/password-reset/code', {
      body: { email: uniqueEmail('nobody') },
    });

    assert.equal(known.status, 202);
    assert.equal(unknown.status, 202);
    assert.deepEqual(known.json, unknown.json);
    assert.equal(known.json.message, REQUEST_ACCEPTED);
  });

  it('rejects a malformed address with a field problem', async () => {
    const res = await api('POST', '/api/auth/password-reset/code', { body: { email: 'nope' } });
    assert.equal(res.status, 400);
    assert.ok(res.json.fields?.some((f) => f.field === 'email'));
  });

  it('★ answers a resend inside the cooldown with the SAME 202, and sends nothing', async () => {
    const { user } = await makeFirebaseUser();
    clearSentMessages();

    const first = await api('POST', '/api/auth/password-reset/code', { body: { email: user.email } });
    await awaitPendingMail();
    // The second request for a REAL address, fetched raw because the header is half the claim:
    // no 429, and no `Retry-After` either.
    const secondRaw = await fetch(`${baseUrl}/api/auth/password-reset/code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email }),
    });
    const secondJson = await secondRaw.json();

    // And the same pair for an address with no account.
    const ghost = uniqueEmail('nobody');
    await api('POST', '/api/auth/password-reset/code', { body: { email: ghost } });
    const ghostSecond = await api('POST', '/api/auth/password-reset/code', { body: { email: ghost } });
    await awaitPendingMail();

    assert.equal(first.status, 202);
    assert.deepEqual(first.json, { message: REQUEST_ACCEPTED });
    assert.equal(secondRaw.status, 202, 'the cooldown must not be observable');
    assert.deepEqual(secondJson, first.json, 'and must say exactly what a first request says');
    assert.equal(secondRaw.headers.get('retry-after'), null, 'no header may describe a wait');
    assert.equal(ghostSecond.status, 202);
    assert.deepEqual(ghostSecond.json, first.json, 'a real and an unknown address are indistinguishable');
    assert.equal(sentMessages().length, 1, 'one window, one email — the cooldown still holds');
  });

  it('completes the reset over HTTP and refuses the code afterwards', async () => {
    const { user } = await makeFirebaseUser();
    clearSentMessages();
    const requested = await api('POST', '/api/auth/password-reset/code', {
      body: { email: user.email },
    });
    assert.equal(requested.status, 202);
    await awaitPendingMail();
    const code = codeFromMessage(lastSentMessage());

    const confirmed = await api('POST', '/api/auth/password-reset/confirm', {
      body: {
        email: user.email,
        code,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      },
    });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.json.message, 'Password changed. Please sign in again.');

    const replay = await api('POST', '/api/auth/password-reset/confirm', {
      body: {
        email: user.email,
        code,
        newPassword: `${NEW_PASSWORD}x`,
        confirmPassword: `${NEW_PASSWORD}x`,
      },
    });
    assert.equal(replay.status, 400);
    assert.equal(replay.json.code, INVALID_PASSWORD_RESET_CODE);
  });

  it('refuses a mismatched confirmation before any attempt is spent', async () => {
    const { user } = await makeFirebaseUser();
    await api('POST', '/api/auth/password-reset/code', { body: { email: user.email } });
    await awaitPendingMail();

    const res = await api('POST', '/api/auth/password-reset/confirm', {
      body: {
        email: user.email,
        code: '123456',
        newPassword: NEW_PASSWORD,
        confirmPassword: 'different',
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, 'VALIDATION_ERROR');
    assert.ok(res.json.fields?.some((f) => f.field === 'confirmPassword'));
    assert.equal((await challengeFor(user.email)).attempts, 0);
  });

  it('answers 503 when the code flow is not configured, without touching the account', async () => {
    const { user } = await makeFirebaseUser();
    const res = await withEnv({ EMAIL_VERIFICATION_CODE_PEPPER: undefined }, () =>
      api('POST', '/api/auth/password-reset/code', { body: { email: user.email } })
    );
    assert.equal(res.status, 503);
    assert.equal(res.json.code, PASSWORD_RESET_CODE_NOT_CONFIGURED);
    assert.ok(!JSON.stringify(res.json).includes('MAIL_PROVIDER'));
  });

  it('never leaks account state in an error body', async () => {
    const { user } = await makeFirebaseUser();
    const res = await api('POST', '/api/auth/password-reset/confirm', {
      body: {
        email: user.email,
        code: '000000',
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, INVALID_PASSWORD_RESET_CODE);
    assert.ok(!JSON.stringify(res.json).includes(PEPPER));
  });
});
