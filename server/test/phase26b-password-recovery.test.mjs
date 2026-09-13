// Phase 26B-2 — the password-reset token store and the recovery service.
//
// This suite pins the two operations the phase adds, and it is deliberately
// paranoid about four things:
//
//   * THE RAW TOKEN NEVER LEAVES. Only its SHA-256 hash is persisted, and the
//     raw value exists only inside the email. Every case that touches the token
//     checks that the store, the audit trail and every error message carry the
//     hash and never the token.
//   * THE CLAIM IS ATOMIC AND FAIL-CLOSED. One conditional update is the whole
//     single-use guarantee, and no later failure releases it. Both halves are
//     proven by injection: a concurrent double-use, and a `user.save()` that
//     throws after the claim has already matched.
//   * REJECTION IS GENERIC. Unknown, expired, already-used, disabled-user and
//     suspended-tenant all produce one code and one message.
//   * ENUMERATION RESISTANCE IS STRUCTURAL. The request path returns nothing on
//     every non-error outcome, so a controller has no field it could reflect.
//
// The mail layer is replaced by the Phase 26B-1 test fake registered through the
// real provider registry, so no case reaches the network and a whole test run
// sends no email.
//
// Registered MIXED in run-tests.mjs: the token/policy helpers run without a
// database, everything else needs MongoDB.

import 'dotenv/config';

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
  disconnectDb,
} from './support.mjs';
import { dbSuite, unitSuite } from './testEnv.mjs';
import { SOURCE_EXTENSION_PATTERN, readSource, sourceModuleName } from './sourceFiles.mjs';

import PasswordResetToken from '../src/models/passwordResetToken.model.ts';
import User from '../src/models/user.model.ts';
import Session from '../src/models/session.model.ts';
import Business from '../src/models/business.model.ts';
import AuditLog from '../src/models/auditLog.model.ts';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../src/constants/audit.ts';
import { validateChangePassword } from '../src/utils/validate.js';

import {
  PASSWORD_RESET_TTL_MINUTES,
  INVALID_RESET_TOKEN_CODE,
  VALIDATION_ERROR_CODE,
  PasswordResetError,
  generateResetToken,
  hashResetToken,
  buildResetUrl,
  newPasswordProblems,
  requestPasswordReset,
  resetPassword,
} from '../src/services/passwordReset.service.js';
import { MailNotConfigured, MailDeliveryError } from '../src/services/mail/index.js';

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
} from './fakes/mailProvider.mjs';

const { dbOk, baseUrl, server } = await startServer();
const api = makeApi(baseUrl);
const tracker = createTracker(dbOk);
const { ObjectId } = mongoose.Types;

const PASSWORD = 'Password123!';
const NEW_PASSWORD = 'NewPassword456!';
const RESET_BASE = 'https://app.inventory-ai.test/reset-password';

// Every env var the mail layer reads, so a test that wants mail disabled can
// clear all of them and no stray value from the developer's own .env survives.
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

async function captureError(fn) {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  return assert.fail('expected the call to throw, but it resolved');
}

/** Replaces a model STATIC and returns a restore function — the repo-wide idiom. */
function stubStatic(model, name, impl) {
  const real = model[name];
  model[name] = impl;
  return () => {
    model[name] = real;
  };
}

/**
 * Makes `user.save()` throw for the document `resetPassword` loads — the only
 * realistic way for the write that follows the claim to fail.
 *
 * The seam is `User.findById`, a model STATIC, because that is the seam this
 * repository patches everywhere else; nothing in `test/` reaches for a document
 * prototype. The real finder still runs, so the service receives a genuine
 * Mongoose document with a genuine `_id` — the failure is injected at the one
 * call that must not be able to un-spend the token.
 */
function stubUserSaveToThrow() {
  const real = User.findById.bind(User);
  User.findById = async (...args) => {
    const user = await real(...args);
    if (user) {
      user.save = async () => {
        const err = new Error('injected user save failure');
        err.name = 'InjectedUserSaveError';
        throw err;
      };
    }
    return user;
  };
  return () => {
    User.findById = real;
  };
}

/** The reset URL handed to the transport for the most recent send. */
function resetUrlSent() {
  const message = lastSentMessage();
  assert.ok(message, 'precondition: a message reached the transport');
  const match = /https?:\/\/\S*[?&]token=([A-Za-z0-9_-]+)/.exec(`${message.text}\n${message.html}`);
  assert.ok(match, 'the message must carry a reset link');
  return match[0];
}

/** The RAW token out of the most recent send — the one value that never persists. */
function rawTokenSent() {
  const message = lastSentMessage();
  assert.ok(message, 'precondition: a message reached the transport');
  const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(message.text);
  assert.ok(match, 'the message must carry a token');
  return match[1];
}

/** Every token row for a user, oldest first. */
async function tokensOf(userId, filter = {}) {
  return PasswordResetToken.find({ userId, ...filter }).sort({ _id: 1 });
}

/** Creates a user directly in the database with a known password. */
async function makeUser({ role = 'STAFF', status = 'ACTIVE', businessId, email } = {}) {
  const user = await User.create({
    businessId: new ObjectId(businessId ?? owner.businessId),
    name: uniqueName('U26B'),
    email: email ?? uniqueEmail('u26b'),
    passwordHash: bcrypt.hashSync(PASSWORD, 10),
    role,
    status,
  });
  tracker.trackUser(String(user._id));
  return user;
}

async function makeBusiness({ status = 'ACTIVE' } = {}) {
  const business = await Business.create({ name: uniqueName('Biz26B'), status });
  tracker.trackBusiness(String(business._id));
  return business;
}

function login(email, password) {
  return api('POST', '/api/auth/login', { body: { email, password } });
}

/**
 * Issues a token for `user` through the real request path and returns both the
 * raw token (from the email) and the stored row.
 */
async function issueToken(user) {
  clearSentMessages();
  await requestPasswordReset({ email: user.email });
  const raw = rawTokenSent();
  const row = await PasswordResetToken.findOne({ tokenHash: hashResetToken(raw) });
  assert.ok(row, 'precondition: the issued token has a row');
  return { raw, row };
}

let owner;

// ===========================================================================
// DB-free: the token helpers, the policy and the domain-error shape
// ===========================================================================

unitSuite('Phase 26B-2 — token helpers, password policy and domain errors', () => {
  it('U1. generateResetToken() is 256 bits of URL-safe randomness', () => {
    const token = generateResetToken();
    // 32 bytes base64url = 43 chars, unpadded.
    assert.equal(token.length, 43);
    assert.match(token, /^[A-Za-z0-9_-]+$/, 'base64url only — no escaping, no padding');
    assert.equal(token.includes('='), false);
    assert.equal(token.includes('+'), false);
    assert.equal(token.includes('/'), false);

    // Not derived from the clock: a thousand tokens in a tight loop are distinct.
    const seen = new Set();
    for (let i = 0; i < 1000; i += 1) seen.add(generateResetToken());
    assert.equal(seen.size, 1000, 'every token must be unique');
  });

  it('U2. hashResetToken() is a deterministic SHA-256 hex digest, never the token', () => {
    const token = generateResetToken();
    const hash = hashResetToken(token);

    assert.equal(hash.length, 64, 'sha256 hex is 64 characters');
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(hashResetToken(token), hash, 'hashing is deterministic');
    assert.notEqual(hash, token, 'the hash is not the token');
    assert.equal(hash.includes(token), false, 'the token is not recoverable from the hash');

    // Distinct tokens never share a hash, and a re-encoded input is a different
    // input — so the store cannot be searched with anything but the exact token.
    assert.notEqual(hashResetToken(generateResetToken()), hash);
    assert.notEqual(hashResetToken(`${token} `), hash);
  });

  it('U3. buildResetUrl() appends the token correctly, with or without an existing query', () => {
    assert.equal(buildResetUrl(RESET_BASE, 'abc123'), `${RESET_BASE}?token=abc123`);
    // An `&` when the configured base already carries a query string, so a base
    // like `.../reset?lang=en` is not broken by the addition.
    assert.equal(buildResetUrl(`${RESET_BASE}?lang=en`, 'abc123'), `${RESET_BASE}?lang=en&token=abc123`);
    assert.equal(buildResetUrl(`${RESET_BASE}?`, 'abc123'), `${RESET_BASE}?&token=abc123`);

    // A token is always base64url in practice; encoding is belt-and-braces for a
    // future alphabet change and must not corrupt the common case.
    const token = generateResetToken();
    assert.equal(buildResetUrl(RESET_BASE, token), `${RESET_BASE}?token=${token}`);
    assert.ok(buildResetUrl(RESET_BASE, 'a b&c').endsWith('token=a%20b%26c'));
  });

  it('U4. the password policy accepts 8..72 characters and refuses 7 and 73', () => {
    assert.deepEqual(newPasswordProblems('x'.repeat(8)), []);
    assert.deepEqual(newPasswordProblems('x'.repeat(72)), []);
    assert.deepEqual(newPasswordProblems('x'.repeat(40)), []);

    assert.deepEqual(newPasswordProblems('x'.repeat(7)), [
      { field: 'newPassword', message: 'password must be at least 8 characters' },
    ]);
    assert.deepEqual(newPasswordProblems('x'.repeat(73)), [
      { field: 'newPassword', message: 'password must be at most 72 characters' },
    ]);

    // Anything that is not a usable string is "required", never a length error.
    for (const value of [undefined, null, '', 42, {}, [], true]) {
      assert.deepEqual(newPasswordProblems(value), [
        { field: 'newPassword', message: 'password is required' },
      ]);
    }
  });

  it('U5. the password policy has not drifted from utils/validate.js', () => {
    // utils/validate.js keeps passwordProblems module-private, so this service
    // carries its own copy of the rule. The copy is only correct while it agrees
    // with the shipped validator, and this case is what proves it does — at the
    // exact boundary values, and on the message text a client would display.
    const viaValidator = (value) =>
      validateChangePassword({ currentPassword: 'x', newPassword: value }).filter(
        (p) => p.field === 'newPassword',
      );

    for (const value of [
      undefined,
      null,
      '',
      42,
      'x'.repeat(7),
      'x'.repeat(8),
      'x'.repeat(9),
      'x'.repeat(71),
      'x'.repeat(72),
      'x'.repeat(73),
      'x'.repeat(200),
    ]) {
      assert.deepEqual(
        newPasswordProblems(value),
        viaValidator(value),
        `policy drift at ${String(value).length} characters`,
      );
    }
  });

  it('U6. PasswordResetError is a domain error: a code, never an HTTP status', () => {
    const plain = new PasswordResetError(INVALID_RESET_TOKEN_CODE, 'nope');
    assert.ok(plain instanceof Error);
    assert.equal(plain.name, 'PasswordResetError');
    assert.equal(plain.code, INVALID_RESET_TOKEN_CODE);
    assert.equal(plain.message, 'nope');
    assert.equal(plain.status, undefined, 'the domain layer must not decide HTTP');
    assert.equal(plain.statusCode, undefined);
    assert.equal(plain.problems, undefined, 'no problems array when there are none');

    const invalid = new PasswordResetError(VALIDATION_ERROR_CODE, 'bad', {
      problems: [{ field: 'newPassword', message: 'x' }],
    });
    assert.equal(invalid.code, VALIDATION_ERROR_CODE);
    assert.deepEqual(invalid.problems, [{ field: 'newPassword', message: 'x' }]);

    // The two codes are distinct strings, and neither collides with a mail code.
    assert.notEqual(INVALID_RESET_TOKEN_CODE, VALIDATION_ERROR_CODE);
    assert.match(INVALID_RESET_TOKEN_CODE, /^[A-Z_]+$/);
  });

  it('U7. the two recovery audit actions exist, are distinct, and stay in the frozen set', () => {
    assert.ok(Object.isFrozen(AUDIT_ACTIONS), 'the action catalogue is frozen');
    assert.equal(AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED, 'PASSWORD_RESET_REQUESTED');
    assert.equal(AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED, 'PASSWORD_RESET_COMPLETED');
    assert.notEqual(AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED, AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED);

    // Both describe the account, so both use the existing USER entity type — the
    // phase adds no entity type.
    assert.equal(AUDIT_ENTITY_TYPES.USER, 'USER');

    // No fifth session action crept in alongside them.
    assert.equal(
      Object.keys(AUDIT_ACTIONS).filter((k) => k.startsWith('PASSWORD_RESET_')).length,
      2,
    );
  });

  it('U8. the service reaches mail only through its public interface', () => {
    // A structural guard, because the transport boundary is easy to pierce by
    // accident: importing the provider registry or the Resend provider directly
    // would let a transport concern — or an API key — into the recovery service.
    const source = readSource(new URL('../src/services/passwordReset.service.js', import.meta.url));

    assert.match(
      source,
      new RegExp(`from '\\./mail/index${SOURCE_EXTENSION_PATTERN}'`),
      'the mail service boundary is imported'
    );
    assert.match(
      source,
      new RegExp(`from '\\./mail/mailConfig${SOURCE_EXTENSION_PATTERN}'`),
      'the reset URL comes from mail config'
    );

    assert.equal(source.includes('providers/'), false, 'no direct provider access');
    assert.equal(source.includes('resendProvider'), false);
    assert.equal(/RESEND_/i.test(source), false, 'no provider credential name may appear here');
    assert.equal(/api\.resend\.com/i.test(source), false);

    // Model access stays inside its own services: the token store and User, and
    // nothing else. Sessions are revoked through session.service, not directly.
    // The assertion pins WHICH modules are imported, not the extension they carry.
    const modelImports = [...source.matchAll(/from '\.\.\/models\/([^']+)'/g)].map((m) =>
      sourceModuleName(m[1])
    );
    assert.deepEqual(modelImports.sort(), [
      'passwordResetToken.model',
      'user.model',
    ]);

    // The token is never logged, and no failure path un-spends it.
    assert.equal(source.includes('console.log('), false, 'the service never logs');
    assert.equal(source.includes('$unset'), false, 'usedAt is never released');
  });
});

// ===========================================================================
// DB-backed: the store and the two operations
// ===========================================================================

dbSuite('Phase 26B-2 — password recovery over a real database', dbOk, () => {
  before(async () => {
    savedMailEnv = new Map(MAIL_ENV_KEYS.map((key) => [key, process.env[key]]));
    Object.assign(process.env, MAIL_ENV);
    registerFakeMailProvider();
    clearSentMessages();
    owner = await registerOwner(api, tracker);
  });

  after(async () => {
    deregisterFakeMailProvider();
    for (const [key, value] of savedMailEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await tracker.cleanup();
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDb();
  });

  // -------------------------------------------------------------------------
  // The request path: what it stores, what it sends, what it refuses
  // -------------------------------------------------------------------------

  it('1. a request stores exactly one row, and only the hash of the token', async () => {
    const user = await makeUser();
    clearSentMessages();
    const before = Date.now();

    const result = await requestPasswordReset({ email: user.email });

    // The request path returns NOTHING. Not "sent: true", not a count, not the
    // user — nothing a controller could reflect back and turn into an oracle.
    assert.equal(result, undefined);

    const rows = await tokensOf(user._id);
    assert.equal(rows.length, 1, 'exactly one token row');
    const row = rows[0];

    assert.equal(String(row.userId), String(user._id));
    assert.equal(row.usedAt, null, 'a fresh token is unused');
    assert.match(row.tokenHash, /^[a-f0-9]{64}$/, 'only the SHA-256 hex digest is stored');

    // The lifetime is the exported constant — the same value the email states.
    const ttlMs = row.expiresAt.getTime() - before;
    assert.ok(
      Math.abs(ttlMs - PASSWORD_RESET_TTL_MINUTES * 60_000) < 5000,
      `expiresAt must be ~${PASSWORD_RESET_TTL_MINUTES} minutes out, was ${ttlMs}ms`,
    );

    // The raw token reached the email and matches the stored hash exactly.
    const raw = rawTokenSent();
    assert.equal(row.tokenHash, hashResetToken(raw), 'the stored hash is the sent token’s hash');

    // And the raw token is nowhere in the document, in any form.
    const serialized = JSON.stringify(row.toObject());
    assert.equal(serialized.includes(raw), false, 'the raw token must never be persisted');
    assert.equal(serialized.includes('token='), false);
    assert.equal(Object.prototype.hasOwnProperty.call(row.toObject(), 'token'), false);
  });

  it('2. the email carries the configured reset URL, and no credential', async () => {
    const user = await makeUser();
    clearSentMessages();

    await requestPasswordReset({ email: user.email });

    const messages = sentMessages();
    assert.equal(messages.length, 1, 'exactly one email');
    const message = messages[0];
    assert.equal(message.to, user.email);
    assert.match(message.subject, /password/i);

    const url = resetUrlSent();
    assert.ok(url.startsWith(RESET_BASE), `the configured base must be used: ${url}`);
    assert.ok(message.text.includes(url), 'the link is in the text part');
    assert.ok(message.html.includes(url), 'and in the html part');

    // The message names no account metadata — the link is the whole payload.
    assert.equal(message.text.includes(user.id), false, 'no user id in the email');
    assert.equal(message.html.includes(user.id), false);
    assert.equal(/token=[A-Za-z0-9_-]+/.test(message.subject), false, 'no token in the subject');
  });

  it('3. a second request supersedes the first: exactly one link works', async () => {
    const user = await makeUser();

    const first = await issueToken(user);
    const second = await issueToken(user);

    // The older row is gone, so its link is dead; only the newest link is live.
    assert.equal(await PasswordResetToken.countDocuments({ tokenHash: first.row.tokenHash }), 0);
    const live = await tokensOf(user._id, { usedAt: null });
    assert.equal(live.length, 1, 'at most one unused token per user');
    assert.equal(String(live[0]._id), String(second.row._id));

    const stale = await captureError(() =>
      resetPassword({ token: first.raw, newPassword: NEW_PASSWORD }),
    );
    assert.equal(stale.code, INVALID_RESET_TOKEN_CODE, 'the superseded link is dead');

    const ok = await resetPassword({ token: second.raw, newPassword: NEW_PASSWORD });
    assert.ok(ok.changedAt instanceof Date, 'the newest link works');
  });

  it('4. several sequential requests converge on one unused token', async () => {
    const user = await makeUser();
    const raw = [];
    for (let i = 0; i < 4; i += 1) raw.push((await issueToken(user)).raw);

    const rows = await tokensOf(user._id);
    assert.equal(rows.length, 1, 'only the newest row survives');
    assert.equal(rows[0].usedAt, null);

    // Every superseded link is refused, and refused identically.
    for (const token of raw.slice(0, 3)) {
      const err = await captureError(() => resetPassword({ token, newPassword: NEW_PASSWORD }));
      assert.equal(err.code, INVALID_RESET_TOKEN_CODE);
    }
    const ok = await resetPassword({ token: raw[3], newPassword: NEW_PASSWORD });
    assert.ok(ok.changedAt instanceof Date);
  });

  it('5. an unknown address is a silent no-op that sends nothing', async () => {
    clearSentMessages();

    const result = await requestPasswordReset({ email: uniqueEmail('nobody') });

    assert.equal(result, undefined);
    assert.equal(sentMessages().length, 0, 'no email may be sent for an unknown address');
  });

  it('6. a DISABLED user is a silent no-op: no token row, no email', async () => {
    const user = await makeUser({ status: 'DISABLED' });
    clearSentMessages();

    const result = await requestPasswordReset({ email: user.email });

    assert.equal(result, undefined);
    assert.equal(await PasswordResetToken.countDocuments({ userId: user._id }), 0);
    assert.equal(
      await AuditLog.countDocuments({ userId: user._id, action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED }),
      0,
      'no recovery event is recorded for an account that may not recover',
    );
    assert.equal(sentMessages().length, 0);
  });

  it('7. a user of a SUSPENDED, ARCHIVED or missing business is a silent no-op', async () => {
    for (const status of ['SUSPENDED', 'ARCHIVED']) {
      const business = await makeBusiness({ status });
      const user = await makeUser({ businessId: business._id });
      clearSentMessages();

      const result = await requestPasswordReset({ email: user.email });
      assert.equal(result, undefined, `${status} must be a silent no-op`);
      assert.equal(await PasswordResetToken.countDocuments({ userId: user._id }), 0);
      assert.equal(sentMessages().length, 0);
    }

    // A user whose business row has been removed entirely is treated the same.
    const orphaned = await makeBusiness();
    const user = await makeUser({ businessId: orphaned._id });
    await Business.deleteOne({ _id: orphaned._id });
    clearSentMessages();

    assert.equal(await requestPasswordReset({ email: user.email }), undefined);
    assert.equal(await PasswordResetToken.countDocuments({ userId: user._id }), 0);
    assert.equal(sentMessages().length, 0);
  });

  it('8. every non-error outcome is indistinguishable from every other', async () => {
    // The enumeration-resistance guarantee, stated as an equivalence: a valid
    // account and four different reasons to refuse one all return the SAME thing
    // — the value `undefined` — so no caller can tell them apart.
    const active = await makeUser();
    const disabled = await makeUser({ status: 'DISABLED' });
    const suspended = await makeBusiness({ status: 'SUSPENDED' });
    const suspendedUser = await makeUser({ businessId: suspended._id });

    const outcomes = [
      await requestPasswordReset({ email: active.email }),
      await requestPasswordReset({ email: disabled.email }),
      await requestPasswordReset({ email: suspendedUser.email }),
      await requestPasswordReset({ email: uniqueEmail('ghost') }),
      await requestPasswordReset({ email: '   ' }),
      await requestPasswordReset({}),
      await requestPasswordReset(),
    ];

    for (const outcome of outcomes) {
      assert.equal(outcome, undefined, 'the request path returns nothing, ever');
    }
    assert.equal(new Set(outcomes.map((o) => String(o))).size, 1);

    // The one account that MAY recover did get a link; the others did not. The
    // difference is invisible from outside and real inside.
    assert.equal(await PasswordResetToken.countDocuments({ userId: active._id }), 1);
    assert.equal(await PasswordResetToken.countDocuments({ userId: disabled._id }), 0);
    assert.equal(await PasswordResetToken.countDocuments({ userId: suspendedUser._id }), 0);
  });

  it('9. a disabled mail server refuses before any token is minted', async () => {
    const user = await makeUser();

    for (const vars of [{}, { MAIL_PROVIDER: FAKE_MAIL_PROVIDER }]) {
      await withEnv(vars, async () => {
        const err = await captureError(() => requestPasswordReset({ email: user.email }));
        assert.ok(err instanceof MailNotConfigured, JSON.stringify(vars));
        assert.equal(err.code, 'MAIL_NOT_CONFIGURED');
      });
    }

    assert.equal(
      await PasswordResetToken.countDocuments({ userId: user._id }),
      0,
      'a server that cannot deliver a link must not accumulate one',
    );
    assert.equal(
      await AuditLog.countDocuments({ userId: user._id, action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED }),
      0,
    );
  });

  it('10. a missing PASSWORD_RESET_URL disables recovery rather than sending a bare token', async () => {
    const user = await makeUser();

    await withEnv({ ...MAIL_ENV, PASSWORD_RESET_URL: undefined }, async () => {
      const err = await captureError(() => requestPasswordReset({ email: user.email }));
      assert.ok(err instanceof MailNotConfigured);
      assert.match(err.message, /PASSWORD_RESET_URL/);
    });

    assert.equal(await PasswordResetToken.countDocuments({ userId: user._id }), 0);
  });

  it('11. a delivery failure is logged on the DETACHED path and leaves the issued token in place', async () => {
    const user = await makeUser();
    clearSentMessages();

    // ★ Phase 28 B1. This case previously asserted the OPPOSITE contract: that
    //   `requestPasswordReset` REJECTED with a MailDeliveryError. That rejection
    //   was the transport failure sitting on the request path, so it is exactly
    //   what B1 removes — the service now resolves and handles the rejection in
    //   its own `.catch`. The test is therefore rewritten to the new contract
    //   rather than the production code being restored to satisfy the old one.
    //
    //   What has NOT changed is the error the transport raises, and that is still
    //   asserted below exactly as before: the instance is captured through the
    //   scenario (the same object the service's `.catch` receives), so the
    //   namespaced-code claim is pinned rather than dropped.
    const reason = 'The email provider is unavailable.';
    let raised;
    const failing = fakeMailFailure(reason);
    setFakeMailScenario((message) => {
      try {
        return failing(message);
      } catch (err) {
        raised = err;
        throw err;
      }
    });

    const records = [];
    const realError = console.error;
    const rejections = [];
    const onRejection = (err) => rejections.push(err);
    console.error = (line) => {
      records.push(String(line));
    };
    process.on('unhandledRejection', onRejection);

    let result;
    let rejection = null;
    try {
      result = await requestPasswordReset({ email: user.email });

      // ★ Deterministic wait, not a sleep: the failure lands on the detached
      //   path, so its log record is only guaranteed to exist once that path has
      //   settled. The extra macrotask turns let an unhandled rejection be
      //   reported while the listener is still installed.
      await awaitPendingMail();
      for (let i = 0; i < 3; i += 1) await new Promise((resolve) => setImmediate(resolve));
    } catch (err) {
      rejection = err;
    } finally {
      console.error = realError;
      setFakeMailScenario(null);
      process.off('unhandledRejection', onRejection);
    }

    // ★ THE NEW CONTRACT: the request resolves. Anything thrown here would be the
    //   pre-B1 behaviour returning, i.e. an outbound send back on the request path.
    assert.equal(
      rejection,
      null,
      `the request must resolve — delivery is detached: ${rejection && rejection.message}`
    );
    // And it still returns nothing a caller could reflect.
    assert.equal(result, undefined, 'every non-error outcome stays indistinguishable');

    // The transport failure keeps its own namespaced code — never an auth code.
    assert.ok(raised instanceof MailDeliveryError);
    assert.equal(raised.code, 'MAIL_UNAVAILABLE');
    assert.match(raised.code, /^MAIL_/);

    // The operator-facing signal that replaced the thrown error: one record, the
    // real reason, and the standard shape. The classification is what preserves
    // the distinction from a misconfiguration (`mail_not_configured`).
    const failures = records
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((record) => record && record.type === 'mail_delivery_failure');
    assert.equal(failures.length, 1, `exactly one failure record, got ${JSON.stringify(records)}`);
    assert.ok(failures[0].message.includes(reason), 'the operator gets the real reason');
    assert.ok(failures[0].ts, 'and the standard record shape');

    // The detached promise had a handler: a lost one would have surfaced here.
    assert.deepEqual(rejections, [], 'a background failure must never go unhandled');

    // The token WAS issued and IS audited: the attempt happened and a credential
    // exists. Its meaning is "a reset was requested and a single-use token was
    // issued" — true whether or not the transport then succeeded. UNCHANGED by
    // B1, and the reason the detach is safe: it happens strictly AFTER these
    // writes, so the durable state is already committed when the send starts.
    const rows = await tokensOf(user._id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].usedAt, null);
    assert.equal(rows[0].tokenHash, hashResetToken(rawTokenSent()), 'the attempted link matches');
    assert.equal(
      await AuditLog.countDocuments({
        userId: user._id,
        action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
      }),
      1,
    );
  });

  it('12. the request is audited with the account as its entity and no metadata', async () => {
    const user = await makeUser();
    await issueToken(user);

    const row = await AuditLog.findOne({
      userId: user._id,
      action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
    });
    assert.ok(row, 'the request is recorded');
    assert.equal(row.entityType, AUDIT_ENTITY_TYPES.USER);
    assert.equal(row.entityId, String(user._id), 'the entity is the account');
    assert.equal(String(row.businessId), owner.businessId, 'the tenant is recorded');
    assert.equal(String(row.userId), String(user._id));
    // No metadata at all: under the mail layer's throw-based contract a
    // `delivered` flag would be a constant, and a reset URL is a live credential.
    assert.equal(row.metadata, undefined);
  });

  it('13. the address is normalised, so case and padding do not defeat the lookup', async () => {
    // The schema lower-cases on write, so the canonical stored form is the
    // lower-case one — which is exactly why the lookup has to normalise its
    // input rather than trust it: a user who types their address with a capital
    // letter must still reach their own account.
    const email = uniqueEmail('MixedCase');
    const user = await makeUser({ email });
    assert.equal(user.email, email.toLowerCase(), 'precondition: the store holds the canonical form');
    clearSentMessages();

    await requestPasswordReset({ email: `  ${email.toUpperCase()}  ` });

    assert.equal(await PasswordResetToken.countDocuments({ userId: user._id }), 1);
    assert.equal(sentMessages().length, 1, 'the link went to the stored address');
    assert.equal(sentMessages()[0].to, email.toLowerCase(), 'never to the un-normalised spelling');

    // Whitespace alone is the same story.
    await requestPasswordReset({ email: `   ${email}   ` });
    assert.equal(sentMessages().length, 2);

    // A non-string is normalised to '' and matches nobody rather than throwing.
    assert.equal(await requestPasswordReset({ email: 42 }), undefined);
    assert.equal(sentMessages().length, 2);
  });

  it('14. a weak password is refused BEFORE the token is claimed', async () => {
    const user = await makeUser();
    const { raw, row } = await issueToken(user);

    const err = await captureError(() => resetPassword({ token: raw, newPassword: 'short' }));
    assert.ok(err instanceof PasswordResetError);
    assert.equal(err.code, VALIDATION_ERROR_CODE);
    assert.deepEqual(err.problems, [
      { field: 'newPassword', message: 'password must be at least 8 characters' },
    ]);

    // The link survived: a fat-fingered password costs the user nothing, and a
    // caller cannot burn a valid link at will.
    const after = await PasswordResetToken.findById(row._id);
    assert.equal(after.usedAt, null, 'a rejected password must not consume the token');
    assert.equal(await bcrypt.compare('short', (await User.findById(user._id).select('+passwordHash')).passwordHash), false);

    // The same link still works with an acceptable password.
    const ok = await resetPassword({ token: raw, newPassword: NEW_PASSWORD });
    assert.ok(ok.changedAt instanceof Date);
  });

  it('15. an over-long password is refused before the claim, on the same terms', async () => {
    const user = await makeUser();
    const { raw, row } = await issueToken(user);

    const err = await captureError(() => resetPassword({ token: raw, newPassword: 'x'.repeat(73) }));
    assert.equal(err.code, VALIDATION_ERROR_CODE);
    assert.deepEqual(err.problems, [
      { field: 'newPassword', message: 'password must be at most 72 characters' },
    ]);
    assert.equal((await PasswordResetToken.findById(row._id)).usedAt, null);
  });

  it('16. the happy path replaces the password and returns the change time', async () => {
    const user = await makeUser();
    assert.equal((await login(user.email, PASSWORD)).status, 200, 'precondition: the old password works');

    const { raw, row } = await issueToken(user);
    const before = Date.now();
    const result = await resetPassword({ token: raw, newPassword: NEW_PASSWORD });

    assert.ok(result.changedAt instanceof Date, 'the change time is returned');
    assert.ok(result.changedAt.getTime() >= before - 1000);
    assert.deepEqual(Object.keys(result), ['changedAt'], 'nothing else is returned');

    // The credential itself changed, verified against the stored hash.
    const stored = await User.findById(user._id).select('+passwordHash');
    assert.equal(await bcrypt.compare(NEW_PASSWORD, stored.passwordHash), true);
    assert.equal(await bcrypt.compare(PASSWORD, stored.passwordHash), false);
    assert.equal(stored.passwordChangedAt.getTime(), result.changedAt.getTime());

    // The token is spent, not deleted — the row is the evidence of use.
    const claimed = await PasswordResetToken.findById(row._id);
    assert.ok(claimed.usedAt instanceof Date, 'usedAt is stamped');
    assert.equal(claimed.usedAt.getTime(), result.changedAt.getTime(), 'claim and change share one clock read');

    // And the change is real over HTTP, in both directions.
    assert.equal((await login(user.email, NEW_PASSWORD)).status, 200, 'the new password works');
    const old = await login(user.email, PASSWORD);
    assert.equal(old.status, 401, JSON.stringify(old.json));
  });

  it('17. a spent token cannot be replayed', async () => {
    const user = await makeUser();
    const { raw } = await issueToken(user);

    await resetPassword({ token: raw, newPassword: NEW_PASSWORD });
    const stored = await User.findById(user._id).select('+passwordHash');

    const err = await captureError(() => resetPassword({ token: raw, newPassword: 'Another789!' }));
    assert.equal(err.code, INVALID_RESET_TOKEN_CODE);

    const unchanged = await User.findById(user._id).select('+passwordHash');
    assert.equal(unchanged.passwordHash, stored.passwordHash, 'a replay changes nothing');
    assert.equal(await bcrypt.compare('Another789!', unchanged.passwordHash), false);
  });

  it('18. two concurrent uses settle with exactly one winner', async () => {
    const user = await makeUser();
    const { raw } = await issueToken(user);

    // One conditional update is the entire single-use guarantee: both calls issue
    // the same filter, and MongoDB can match it for only one of them.
    const [a, b] = await Promise.allSettled([
      resetPassword({ token: raw, newPassword: NEW_PASSWORD }),
      resetPassword({ token: raw, newPassword: 'SecondWinner789!' }),
    ]);

    const winners = [a, b].filter((r) => r.status === 'fulfilled');
    const losers = [a, b].filter((r) => r.status === 'rejected');
    assert.equal(winners.length, 1, 'exactly one concurrent use may succeed');
    assert.equal(losers.length, 1);
    assert.equal(losers[0].reason.code, INVALID_RESET_TOKEN_CODE);

    // The surviving password is the winner's, and only the winner's.
    const stored = await User.findById(user._id).select('+passwordHash');
    const winnerIndex = a.status === 'fulfilled' ? 0 : 1;
    const winnerPassword = winnerIndex === 0 ? NEW_PASSWORD : 'SecondWinner789!';
    const loserPassword = winnerIndex === 0 ? 'SecondWinner789!' : NEW_PASSWORD;
    assert.equal(await bcrypt.compare(winnerPassword, stored.passwordHash), true);
    assert.equal(await bcrypt.compare(loserPassword, stored.passwordHash), false);

    // Exactly one row, spent once.
    const rows = await tokensOf(user._id);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].usedAt instanceof Date);
  });

  it('19. an expired token is refused even before the TTL sweep runs', async () => {
    const user = await makeUser();
    const { raw, row } = await issueToken(user);

    // Past the deadline but still present: the sweep is eventual (~60s), so the
    // claim query has to filter `expiresAt` itself rather than rely on deletion.
    await PasswordResetToken.updateOne({ _id: row._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.ok(await PasswordResetToken.findById(row._id), 'precondition: the row still exists');

    const err = await captureError(() => resetPassword({ token: raw, newPassword: NEW_PASSWORD }));
    assert.equal(err.code, INVALID_RESET_TOKEN_CODE);
    // Refused, and left unused — the deadline is what ended it, not a claim.
    assert.equal((await PasswordResetToken.findById(row._id)).usedAt, null);
  });

  it('20. unknown, malformed and blank tokens are refused identically', async () => {
    for (const token of [
      generateResetToken(),          // well-formed, but no such row
      'not-a-real-token',
      'x'.repeat(43),
      '',
      '   ',
      undefined,
      null,
      42,
      { $ne: null },
      { tokenHash: { $ne: null } },
    ]) {
      const err = await captureError(() => resetPassword({ token, newPassword: NEW_PASSWORD }));
      assert.ok(err instanceof PasswordResetError, `token=${JSON.stringify(token)}`);
      assert.equal(err.code, INVALID_RESET_TOKEN_CODE);
      assert.equal(err.problems, undefined, 'a token rejection is not a validation problem');
    }

    // A token-shaped operator object cannot reach the query as an operator: the
    // input is coerced to a string before it is hashed.
    const injected = await captureError(() =>
      resetPassword({ token: { $gt: '' }, newPassword: NEW_PASSWORD }),
    );
    assert.equal(injected.code, INVALID_RESET_TOKEN_CODE);
  });

  it('21. a token whose account no longer exists is refused generically', async () => {
    const user = await makeUser();
    const { raw } = await issueToken(user);

    await User.deleteOne({ _id: user._id });

    const err = await captureError(() => resetPassword({ token: raw, newPassword: NEW_PASSWORD }));
    assert.equal(err.code, INVALID_RESET_TOKEN_CODE, 'never NOT_FOUND, never a user-less success');
  });

  it('22. a DISABLED user is refused generically — never ACCOUNT_DISABLED', async () => {
    const user = await makeUser();
    const { raw } = await issueToken(user);
    await User.updateOne({ _id: user._id }, { $set: { status: 'DISABLED' } });

    const err = await captureError(() => resetPassword({ token: raw, newPassword: NEW_PASSWORD }));
    assert.equal(err.code, INVALID_RESET_TOKEN_CODE);
    assert.notEqual(err.code, 'ACCOUNT_DISABLED', 'this endpoint must not be an account probe');

    // A disabled account's password is untouched.
    const stored = await User.findById(user._id).select('+passwordHash');
    assert.equal(await bcrypt.compare(PASSWORD, stored.passwordHash), true);
  });

  it('23. a SUSPENDED business is refused generically — never BUSINESS_NOT_ACTIVE', async () => {
    const business = await makeBusiness();
    const user = await makeUser({ businessId: business._id });
    const { raw } = await issueToken(user);

    await Business.updateOne({ _id: business._id }, { $set: { status: 'SUSPENDED' } });

    const err = await captureError(() => resetPassword({ token: raw, newPassword: NEW_PASSWORD }));
    assert.equal(err.code, INVALID_RESET_TOKEN_CODE, 'a suspended tenant must not be tellable here');
    assert.notEqual(err.code, 'BUSINESS_NOT_ACTIVE');
  });

  it('24. all five rejection reasons produce one identical code and message', async () => {
    const unknown = generateResetToken();

    const expiring = await makeUser();
    const expiringToken = await issueToken(expiring);
    await PasswordResetToken.updateOne(
      { _id: expiringToken.row._id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    const used = await makeUser();
    const usedToken = await issueToken(used);
    await resetPassword({ token: usedToken.raw, newPassword: NEW_PASSWORD });

    const disabled = await makeUser();
    const disabledToken = await issueToken(disabled);
    await User.updateOne({ _id: disabled._id }, { $set: { status: 'DISABLED' } });

    const suspendedBiz = await makeBusiness();
    const suspendedUser = await makeUser({ businessId: suspendedBiz._id });
    // Issued while the tenant is live, then the tenant is suspended — so the
    // token is genuinely valid and only the business liveness can refuse it.
    const suspendedToken = await issueToken(suspendedUser);
    await Business.updateOne({ _id: suspendedBiz._id }, { $set: { status: 'SUSPENDED' } });

    const errors = [];
    for (const token of [unknown, expiringToken.raw, usedToken.raw, disabledToken.raw, suspendedToken.raw]) {
      errors.push(await captureError(() => resetPassword({ token, newPassword: NEW_PASSWORD })));
    }

    assert.equal(errors.length, 5);
    const shapes = new Set(errors.map((e) => `${e.code}|${e.message}`));
    assert.equal(shapes.size, 1, `every rejection must look identical, got ${[...shapes].join(' / ')}`);
    assert.equal([...shapes][0].split('|')[0], INVALID_RESET_TOKEN_CODE);

    // And the message never enumerates the reasons.
    const message = errors[0].message;
    assert.equal(/expired token|already used|disabled|suspended/i.test(message), false);
    assert.match(message, /invalid or has expired/i);
  });

  it('25. the claim is fail-closed: a failed write does not release the token', async () => {
    const user = await makeUser();
    const { raw, row } = await issueToken(user);
    const original = await User.findById(user._id).select('+passwordHash');

    const restore = stubUserSaveToThrow();
    let err;
    try {
      err = await captureError(() => resetPassword({ token: raw, newPassword: NEW_PASSWORD }));
    } finally {
      restore();
    }

    // The failure propagated rather than being swallowed.
    assert.ok(err);
    assert.equal(err.name, 'InjectedUserSaveError');

    // And the token stays SPENT. This is the whole point: a reset that failed
    // half-way is recoverable by asking for a new link, while a token that could
    // be replayed after a partial failure is not recoverable at all.
    const claimed = await PasswordResetToken.findById(row._id);
    assert.ok(claimed.usedAt instanceof Date, 'usedAt must not be released by a later failure');

    const after = await User.findById(user._id).select('+passwordHash');
    assert.equal(after.passwordHash, original.passwordHash, 'the password is untouched');
    assert.equal(after.passwordChangedAt, null);

    // The user's only route forward is a new link — proven by the retry failing.
    const retry = await captureError(() => resetPassword({ token: raw, newPassword: NEW_PASSWORD }));
    assert.equal(retry.code, INVALID_RESET_TOKEN_CODE, 'the burned token is not resurrectable');

    // A fresh request restores access, so the fail-closed rule costs one email.
    const fresh = await issueToken(user);
    const ok = await resetPassword({ token: fresh.raw, newPassword: NEW_PASSWORD });
    assert.ok(ok.changedAt instanceof Date);
  });

  it('26. the claim is fail-closed when the session revocation fails', async () => {
    const user = await makeUser();
    const { raw, row } = await issueToken(user);
    const original = await User.findById(user._id).select('+passwordHash');

    const restore = stubStatic(Session, 'updateMany', async () => {
      throw new Error('injected session revocation failure');
    });
    let err;
    try {
      err = await captureError(() => resetPassword({ token: raw, newPassword: NEW_PASSWORD }));
    } finally {
      restore();
    }
    assert.match(err.message, /injected session revocation failure/);

    // The password DID change — that write already committed — but the token is
    // still spent, so nothing about this failure is replayable.
    const after = await User.findById(user._id).select('+passwordHash');
    assert.equal(await bcrypt.compare(NEW_PASSWORD, after.passwordHash), true);
    assert.notEqual(after.passwordHash, original.passwordHash);
    assert.ok((await PasswordResetToken.findById(row._id)).usedAt instanceof Date);

    const retry = await captureError(() => resetPassword({ token: raw, newPassword: NEW_PASSWORD }));
    assert.equal(retry.code, INVALID_RESET_TOKEN_CODE);
  });

  it('27. a completed reset ends every session the account had', async () => {
    const user = await makeUser();
    const first = (await login(user.email, PASSWORD)).json.token;
    const second = (await login(user.email, PASSWORD)).json.token;
    assert.equal(
      await Session.countDocuments({ userId: user._id, revokedAt: null }),
      2,
      'precondition: two live sessions',
    );

    const { raw } = await issueToken(user);
    await resetPassword({ token: raw, newPassword: NEW_PASSWORD });

    // Every open session row is revoked, not merely stale-by-timestamp: the
    // `passwordChangedAt` check alone cannot reach a token minted in the same
    // second as the change, and the session list would otherwise advertise
    // devices whose tokens no longer work.
    assert.equal(await Session.countDocuments({ userId: user._id, revokedAt: null }), 0);
    for (const token of [first, second]) {
      const res = await api('GET', '/api/auth/me', { token });
      assert.equal(res.status, 401, JSON.stringify(res.json));
      assert.ok(
        ['SESSION_INVALIDATED', 'SESSION_REVOKED'].includes(res.json.code),
        `unexpected code ${res.json.code}`,
      );
    }

    // The revocation is audited once, with its count — the third row a completed
    // reset legitimately produces.
    const revoke = await AuditLog.findOne({
      userId: user._id,
      action: AUDIT_ACTIONS.SESSIONS_REVOKED_ALL,
    });
    assert.ok(revoke, 'the sign-out-everywhere is recorded');
    assert.equal(revoke.metadata.sessionsRevoked, 2);

    // A fresh login on the new password is unaffected by the revocation.
    assert.equal((await login(user.email, NEW_PASSWORD)).status, 200);
  });

  it('28. completing a reset invalidates every other outstanding link for that user', async () => {
    const user = await makeUser();

    // Two live rows for one user, created directly so the request path's
    // supersede rule does not remove the second before the reset runs.
    const keep = generateResetToken();
    const drop = generateResetToken();
    await PasswordResetToken.create({
      userId: user._id,
      tokenHash: hashResetToken(keep),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });
    await PasswordResetToken.create({
      userId: user._id,
      tokenHash: hashResetToken(drop),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });
    assert.equal(await tokensOf(user._id).then((r) => r.length), 2);

    await resetPassword({ token: keep, newPassword: NEW_PASSWORD });

    // The spent row is kept as evidence; the never-used one is removed.
    const rows = await tokensOf(user._id);
    assert.equal(rows.length, 1, 'the other link must not survive the reset');
    assert.equal(rows[0].tokenHash, hashResetToken(keep));
    assert.ok(rows[0].usedAt instanceof Date);

    const stale = await captureError(() => resetPassword({ token: drop, newPassword: 'Another789!' }));
    assert.equal(stale.code, INVALID_RESET_TOKEN_CODE);
  });

  it('29. the completion is audited, and the trail carries no credential', async () => {
    const user = await makeUser();
    const { raw } = await issueToken(user);
    await resetPassword({ token: raw, newPassword: NEW_PASSWORD });

    const row = await AuditLog.findOne({
      userId: user._id,
      action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
    });
    assert.ok(row, 'the completion is recorded');
    assert.equal(row.entityType, AUDIT_ENTITY_TYPES.USER);
    assert.equal(row.entityId, String(user._id));
    assert.equal(String(row.businessId), owner.businessId);
    assert.equal(row.metadata, undefined, 'no metadata: there is no safe fact left to add');

    // The whole trail for this user — both events, however many rows — must never
    // carry the token, its hash, the password, or a reset link.
    const trail = await AuditLog.find({ userId: user._id });
    assert.ok(trail.length >= 2, 'both recovery events are present');
    const serialized = JSON.stringify(trail.map((r) => r.toObject()));
    for (const secret of [raw, hashResetToken(raw), NEW_PASSWORD, PASSWORD, RESET_BASE, 'token=']) {
      assert.equal(serialized.includes(secret), false, `the audit trail must never carry ${secret}`);
    }

    // Exactly the two declared recovery actions exist, and nothing adjacent.
    const actions = (await AuditLog.find({ userId: user._id }).distinct('action')).filter((a) =>
      a.startsWith('PASSWORD_RESET_'),
    );
    assert.deepEqual(actions.sort(), [
      AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
      AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
    ]);
  });

  it('30. a failed audit write never fails the request or the reset', async () => {
    const requestUser = await makeUser();
    const resetUser = await makeUser();
    const { raw } = await issueToken(resetUser);

    const restore = stubStatic(AuditLog, 'create', async () => {
      throw new Error('injected audit failure');
    });
    let logged = false;
    const realError = console.error;
    console.error = () => {
      logged = true;
    };
    try {
      clearSentMessages();
      await requestPasswordReset({ email: requestUser.email });
      const ok = await resetPassword({ token: raw, newPassword: NEW_PASSWORD });
      assert.ok(ok.changedAt instanceof Date, 'the reset completed despite the audit failure');

      // The audit writer signals the loss on the console — it is not silent.
      assert.equal(logged, true, 'a dropped audit row must be visible to an operator');
    } finally {
      console.error = realError;
      restore();
    }

    // The real work is durable: the link was issued, the password changed.
    assert.equal(await PasswordResetToken.countDocuments({ userId: requestUser._id, usedAt: null }), 1);
    assert.equal(sentMessages().length, 1);
    const stored = await User.findById(resetUser._id).select('+passwordHash');
    assert.equal(await bcrypt.compare(NEW_PASSWORD, stored.passwordHash), true);
  });

  it('31. the recovery surface is exactly the two declared public routes', async () => {
    // Written while 26B-2 was the domain layer only, as an inverted guard: it
    // then asserted that NO recovery route existed, so a future 26B-3 could not
    // be smuggled in unnoticed. Phase 26B-3 is that phase, and it is approved —
    // so the guard is inverted rather than deleted, and it still fails if a
    // THIRD recovery surface appears, if either route stops being public, or if
    // the routes get mounted a second time through another router.
    const authRoutes = readSource(new URL('../src/routes/auth.routes.js', import.meta.url));

    // Exactly the two recovery paths are registered, and nothing adjacent.
    const declared = [...authRoutes.matchAll(/router\.(get|post|patch|put|delete)\(\s*'([^']+)'/g)]
      .map(([, method, path]) => `${method.toUpperCase()} ${path}`)
      .filter((route) => /forgot|reset/i.test(route));
    assert.deepEqual(declared.sort(), [
      'POST /forgot-password',
      'POST /reset-password',
    ]);

    // Both are public. `requireAuth` is not on either chain — and `requireAuth`
    // does appear elsewhere in the file, so this is checked per route rather
    // than by a bare substring search.
    for (const path of ['/forgot-password', '/reset-password']) {
      const start = authRoutes.indexOf(`'${path}'`);
      assert.notEqual(start, -1, `${path} must be registered`);
      const end = authRoutes.indexOf(');', start);
      const chain = authRoutes.slice(start, end === -1 ? undefined : end);
      assert.equal(
        chain.includes('requireAuth'),
        false,
        `${path} must not require authentication — the caller has no password`
      );
    }

    // app.js mounts the auth router once and no second recovery router. Phase
    // 26B-3 added no mount of its own: /api/auth was already there.
    const appSource = readSource(new URL('../src/app.js', import.meta.url));
    assert.equal(
      (appSource.match(/createAuthRouter\(/g) || []).length,
      1,
      'the auth router must be mounted exactly once'
    );
    assert.equal(
      appSource.includes('passwordReset'),
      false,
      'no separate password-reset router may be mounted — the routes live on /api/auth'
    );
  });
});
