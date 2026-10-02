// AUTH-04-C + D — the email-verification HTTP surface and its two rate limiters.
//
// WHAT THIS SUITE PINS. AUTH-04-C turns the B3/B4 domain services into two
// pre-session, Firebase-authenticated endpoints, and it is the only place an
// email-verification domain failure becomes an HTTP status. The properties that
// matter are therefore the BOUNDARY, not the lifecycle (the B3/B4 suites already
// own the lifecycle):
//
//   * THE PAYLOAD CANNOT CARRY AN IDENTITY. `uid`, `email`, `userId`,
//     `businessId`, `role` and `status` must be INERT, because the validator
//     returns only `{ problems, idToken[, code] }` — so the cases below send all
//     of them at once and require the response to be unaffected.
//   * A REJECTED FIREBASE TOKEN IS A 400, NOT A 401. The mobile client's
//     session-loss rule acts on the STATUS of a response to a request that carried
//     a token, so a 401 here would be indistinguishable from a dead application
//     session. Asserted as an inequality (not 401, not 403), because that is the
//     actual contract — a future "harmless" remap to 401 is the regression.
//   * NOTHING SENSITIVE IS ECHOED. No code, no address, no uid, no pepper, no
//     Firebase reason, no HMAC name, no error message from a service. Asserted on
//     the serialized body, so a nested field cannot hide.
//   * SUCCESS IS EXACTLY `{ message }`, and the same envelope for the AD-14
//     already-verified no-op as for a real send — which is why the request copy's
//     conditional clause is load-bearing rather than cosmetic.
//   * THE LIMITERS COUNT SUCCESSES. Both AUTH-04 limiters omit
//     `skipSuccessfulRequests`, so a successful request must still consume budget.
//     Proven behaviourally with a narrowly-capped app.
//
// WHY THE VERIFIER SEAM IS DRIVEN DIRECTLY. `fakes/firebaseVerifier.mjs` can
// express a success or a `FirebaseTokenError`, and nothing else. This suite must
// also exercise `FirebaseNotConfigured` and `FirebaseUnavailableError` over HTTP,
// because the mapper's three Firebase branches are exactly what C adds and two of
// them would otherwise be untested. It therefore installs its own delegate through
// the SAME public seam that fake uses (`setFirebaseIdTokenVerifier`), rather than
// weakening the cases to what one fake happens to express. The mail and Admin-write
// fakes are the shipped ones, because those two layers are unmodified by C.
//
// Registered MIXED in run-tests.mjs: the validators, the limiter configuration and
// the source/route guards need no database; the two HTTP lifecycles and the
// behavioural limiter cases need MongoDB.

import 'dotenv/config';

import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { ensureDb, disconnectDb } from './helpers.mjs';
import { dbSuite, unitSuite } from './testEnv.mjs';
import { readSource } from './sourceFiles.mjs';

import { createApp } from '../src/app.ts';
import {
  validateEmailVerificationRequest,
  validateEmailVerificationConfirm,
} from '../src/utils/validate.ts';
import EmailVerificationChallenge from '../src/models/emailVerificationChallenge.model.ts';
import {
  hashVerificationCode,
  hashVerificationEmail,
} from '../src/services/emailVerification/code.ts';
import { EMAIL_VERIFICATION_CODE_PEPPER_ENV } from '../src/config/emailVerification.ts';
import {
  EMAIL_VERIFICATION_NOT_CONFIGURED,
  EMAIL_VERIFICATION_RATE_LIMITED,
  EMAIL_VERIFICATION_MAIL_FAILED,
  INVALID_VERIFICATION_CODE,
} from '../src/constants/emailVerification.ts';
import {
  FirebaseNotConfigured,
  FirebaseTokenError,
  FirebaseUnavailableError,
  FIREBASE_NOT_CONFIGURED,
  FIREBASE_TOKEN_INVALID,
  FIREBASE_UNAVAILABLE,
} from '../src/services/firebase/firebaseErrors.ts';
import {
  setFirebaseIdTokenVerifier,
  resetFirebaseIdTokenVerifier,
} from '../src/services/firebase/tokenVerifier.ts';
import {
  authRateConfig,
  createEmailVerificationRequestLimiter,
  createEmailVerificationConfirmLimiter,
} from '../src/middlewares/rateLimit.ts';
import {
  registerFakeFirebaseUserUpdater,
  deregisterFakeFirebaseUserUpdater,
  setFakeFirebaseUpdateFailure,
  updatedUids,
  clearUpdatedUids,
} from './fakes/firebaseUserUpdater.mjs';
import {
  FAKE_MAIL_PROVIDER,
  registerFakeMailProvider,
  deregisterFakeMailProvider,
  setFakeMailScenario,
  fakeMailFailure,
  sentMessages,
  clearSentMessages,
} from './fakes/mailProvider.mjs';
import { fakeServiceAccountJson } from './fakes/firebaseVerifier.mjs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REQUEST_PATH = '/api/auth/email-verification/request';
const CONFIRM_PATH = '/api/auth/email-verification/confirm';

/** The opaque strings this suite submits. None is ever a real credential. */
const ID_TOKEN = 'phaseauth04c.fake.id-token-that-the-seam-replaces';
const VALID_PEPPER = 'inventory-ai-auth04c-test-pepper-value';
const USER_EMAIL = 'owner@inventory-ai.test';
const CODE = '246810';
const WRONG_CODE = '135790';

/** Built once: generating an RSA key per case would only slow the suite down. */
const FIREBASE_JSON = fakeServiceAccountJson();

/** Every environment variable these endpoints read; all others are left alone. */
const ENV_KEYS = [
  EMAIL_VERIFICATION_CODE_PEPPER_ENV,
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'MAIL_PROVIDER',
  'RESEND_API_KEY',
  'MAIL_FROM',
  'MAIL_APP_NAME',
  'MAIL_REQUEST_TIMEOUT_MS',
  'PASSWORD_RESET_URL',
];

/** Limiters opened wide, so no case outside the limiter suite can trip one. */
const UNCAPPED = {
  emailVerificationRequestMax: 100000,
  emailVerificationConfirmMax: 100000,
  firebaseExchangeMax: 100000,
  firebaseRegisterMax: 100000,
  registerMax: 100000,
  loginMax: 100000,
  loginIpMax: 100000,
  passwordResetMax: 100000,
  passwordResetIpMax: 100000,
  passwordResetConfirmMax: 100000,
  renewMax: 100000,
};

/** A unique uid per case, so parallel files and cases cannot collide. */
let seq = 0;
function nextUid(prefix = 'auth04c') {
  seq += 1;
  return `${prefix}-${process.pid}-${Date.now()}-${seq}`;
}

/** A decoded-token-shaped payload, as the real verifier narrows its output. */
function tokenPayload({ uid = nextUid(), email = USER_EMAIL, emailVerified = false } = {}) {
  return {
    uid,
    email,
    email_verified: emailVerified,
    firebase: { sign_in_provider: 'password' },
    auth_time: Math.floor(Date.now() / 1000),
  };
}

// ---------------------------------------------------------------------------
// Environment + seam harness
// ---------------------------------------------------------------------------

/** Runs `fn` with EXACTLY these values for the managed env vars, then restores. */
async function withEnv(vars, fn) {
  const saved = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(vars, key) && vars[key] !== undefined) {
      process.env[key] = vars[key];
    } else {
      delete process.env[key];
    }
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** A fully configured server: pepper, Firebase, and the fake mail transport. */
function configuredEnv(extra = {}) {
  return {
    [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: VALID_PEPPER,
    FIREBASE_SERVICE_ACCOUNT_JSON: FIREBASE_JSON,
    MAIL_PROVIDER: FAKE_MAIL_PROVIDER,
    ...extra,
  };
}

/**
 * Installs a verifier that answers one of the outcomes the mapper must translate.
 * A FUNCTION is used directly, so a case can vary the payload per call.
 */
function installVerifier(behaviour) {
  setFirebaseIdTokenVerifier(async (idToken) => {
    if (typeof behaviour === 'function') return behaviour(idToken);
    if (behaviour === 'ok') return tokenPayload();
    if (behaviour === 'verified') return tokenPayload({ emailVerified: true });
    if (behaviour === 'invalid') throw new FirebaseTokenError('auth/id-token-expired');
    if (behaviour === 'unavailable') throw new FirebaseUnavailableError('app/network-error');
    if (behaviour === 'not-configured') throw new FirebaseNotConfigured();
    throw new Error(`unknown verifier behaviour: ${behaviour}`);
  });
}

/** Registers the verifier, mail and Admin-write seams, removing them in a finally. */
async function withSeams({ verifier = 'ok', mail = true, updater = true } = {}, fn) {
  installVerifier(verifier);
  if (mail) registerFakeMailProvider();
  if (updater) registerFakeFirebaseUserUpdater();
  clearSentMessages();
  clearUpdatedUids();
  try {
    return await fn();
  } finally {
    resetFirebaseIdTokenVerifier();
    if (mail) deregisterFakeMailProvider();
    if (updater) deregisterFakeFirebaseUserUpdater();
  }
}

/** Env + seams in one call: what almost every HTTP case actually needs. */
async function scenario({ env = {}, verifier = 'ok', mail = true, updater = true } = {}, fn) {
  return withEnv(configuredEnv(env), () => withSeams({ verifier, mail, updater }, fn));
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

/** The exact success envelope: one key, and that key's exact sentence. */
function assertMessageBody(json, message) {
  assert.ok(json && typeof json === 'object', 'body is an object');
  assert.deepEqual(Object.keys(json), ['message']);
  assert.equal(json.message, message);
}

/** Every secret this suite could leak, searched across the serialized body. */
function assertNoSecrets(json) {
  const surface = JSON.stringify(json ?? null);
  for (const needle of [CODE, WRONG_CODE, VALID_PEPPER, USER_EMAIL, ID_TOKEN]) {
    assert.equal(surface.includes(needle), false, `body leaked ${needle}`);
  }
  for (const needle of ['codeHmac', 'emailHmac', 'pepper', 'token']) {
    assert.equal(surface.includes(needle), false, `body leaked the field name ${needle}`);
  }
}

/** Starts an app on an ephemeral port and returns a fetch wrapper + a closer. */
async function listen(app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    api: async (method, path, { body, headers: extra } = {}) => {
      const headers = { 'content-type': 'application/json', ...(extra ?? {}) };
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
      return { status: res.status, json, headers: res.headers };
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Builds an app with the given limiter overrides and disposes it afterwards.
 *
 * `trustProxy: 0` is pinned rather than inherited, so the spoofed-forwarded-header
 * case is deterministic: with trust off, `request.ip` is always the direct peer,
 * and the assertion cannot be defeated by a developer's own TRUST_PROXY setting.
 */
async function withApp(limits, fn) {
  const started = await listen(
    createApp({ requestLogging: false, trustProxy: 0, authLimits: { ...UNCAPPED, ...limits } })
  );
  try {
    return await fn(started);
  } finally {
    await started.close();
  }
}

/** Seconds from a `Retry-After` header, or NaN when it is absent/unparseable. */
function retryAfterSeconds(res) {
  const raw = res.headers.get('retry-after');
  return raw === null ? NaN : Number(raw);
}

// ---------------------------------------------------------------------------
// DB-free: validation lives in utils/validate.ts, so it needs nothing
// ---------------------------------------------------------------------------

const src = (p) => fileURLToPath(new URL(`../src/${p}`, import.meta.url));
const testFile = (p) => fileURLToPath(new URL(`./${p}`, import.meta.url));

unitSuite('AUTH-04-C — the request and confirm payloads (no database)', () => {
  it('requires idToken, and reports the same field problem every Firebase payload does', () => {
    for (const body of [{}, { idToken: '' }, { idToken: '   ' }, { idToken: 42 }, { idToken: null }]) {
      const { problems, idToken } = validateEmailVerificationRequest(body);
      assert.deepEqual(problems, [{ field: 'idToken', message: 'idToken is required' }]);
      assert.equal(idToken, undefined);
    }
  });

  it('bounds idToken by the shared MAX_ID_TOKEN and trims it', () => {
    const oversized = validateEmailVerificationRequest({ idToken: 'x'.repeat(4097) });
    assert.deepEqual(oversized.problems, [
      { field: 'idToken', message: 'idToken must be at most 4096 characters' },
    ]);

    const padded = validateEmailVerificationRequest({ idToken: `  ${ID_TOKEN}  ` });
    assert.deepEqual(padded.problems, []);
    assert.equal(padded.idToken, ID_TOKEN);
  });

  it('returns only { problems, idToken }, so an identity/tenant/role in the body is inert', () => {
    const { problems, ...rest } = validateEmailVerificationRequest({
      idToken: ID_TOKEN,
      uid: 'attacker-uid',
      firebaseUid: 'attacker-firebase-uid',
      email: 'attacker@example.test',
      userId: 'attacker-user-id',
      businessId: 'attacker-business-id',
      role: 'OWNER',
      status: 'ACTIVE',
    });
    assert.deepEqual(problems, []);
    assert.deepEqual(Object.keys(rest), ['idToken']);
    assert.equal(rest.idToken, ID_TOKEN);
  });

  it('errors are serialized field-by-field, so the suite can assert their absence', () => {
    const { problems } = validateEmailVerificationRequest({});
    assert.equal(problems.length, 1);
    assert.deepEqual(Object.keys(problems[0]), ['field', 'message']);
  });

  it('requires code as well, and reports both missing fields at once', () => {
    const both = validateEmailVerificationConfirm({});
    assert.deepEqual(both.problems, [
      { field: 'idToken', message: 'idToken is required' },
      { field: 'code', message: 'code is required' },
    ]);

    const onlyCode = validateEmailVerificationConfirm({ idToken: ID_TOKEN });
    assert.deepEqual(onlyCode.problems, [{ field: 'code', message: 'code is required' }]);
    assert.equal(onlyCode.code, undefined);
  });

  it('rejects a blank, non-string or oversized code as a SHAPE problem', () => {
    for (const code of ['', '   ', 42, null, true, {}]) {
      const { problems } = validateEmailVerificationConfirm({ idToken: ID_TOKEN, code });
      assert.deepEqual(problems, [{ field: 'code', message: 'code is required' }]);
    }

    const oversized = validateEmailVerificationConfirm({
      idToken: ID_TOKEN,
      code: '1'.repeat(65),
    });
    assert.deepEqual(oversized.problems, [
      { field: 'code', message: 'code must be at most 64 characters' },
    ]);
  });

  it('does NOT shape-check a PRESENT code, so every wrong value reaches the service', () => {
    // The 6-digit format is AUTH-04-B4's policy, not this layer's: a validator that
    // refused a non-six-digit value would invent a second way to refuse a code, and
    // would tell the caller their format was wrong where the contract requires the
    // answer to say nothing about the code's state. `EMAIL_VERIFICATION_CODE_LENGTH`
    // is deliberately NOT the bound — see EMAIL_VERIFICATION_CODE_MAX.
    for (const code of ['abc', '12345', '1234567', '0000000', '1234567890', 'abcdef']) {
      const { problems, code: returned } = validateEmailVerificationConfirm({
        idToken: ID_TOKEN,
        code,
      });
      assert.deepEqual(problems, [], `code ${code} must reach the service`);
      assert.equal(returned, code);
    }
  });

  it('trims the code, and returns exactly the three declared keys', () => {
    const { problems, ...rest } = validateEmailVerificationConfirm({
      idToken: ` ${ID_TOKEN} `,
      code: ` ${CODE} `,
      uid: 'attacker-uid',
      businessId: 'attacker-business-id',
      role: 'OWNER',
    });
    assert.deepEqual(problems, []);
    assert.deepEqual(Object.keys(rest), ['idToken', 'code']);
    assert.equal(rest.idToken, ID_TOKEN);
    assert.equal(rest.code, CODE);
  });

  it('accepts a code of exactly the transport ceiling and rejects one character more', () => {
    const atCeiling = validateEmailVerificationConfirm({
      idToken: ID_TOKEN,
      code: '1'.repeat(64),
    });
    assert.deepEqual(atCeiling.problems, []);

    const overCeiling = validateEmailVerificationConfirm({
      idToken: ID_TOKEN,
      code: '1'.repeat(65),
    });
    assert.equal(overCeiling.problems.length, 1);
  });

  it('source guard: the bound is local, is 64, and does not reuse the SKU/barcode cap', () => {
    const text = readSource(src('utils/validate.ts'));
    assert.match(text, /const EMAIL_VERIFICATION_CODE_MAX = 64;/);
    // The SKU/barcode cap must not become the code ceiling by accident.
    assert.match(text, /const code = requiredString\(body\?\.code, 'code', EMAIL_VERIFICATION_CODE_MAX\);/);
    // No digit/length format check on the code: the six-digit policy constant is
    // NOT this module's bound. The doc comment above deliberately NAMES it to
    // explain why, so the guard checks for USE (as a bound or as an import), not
    // for a bare mention anywhere in the file.
    assert.equal(/requiredString\([^)]*EMAIL_VERIFICATION_CODE_LENGTH/.test(text), false);
    assert.equal(/^import[^;]*EMAIL_VERIFICATION_CODE_LENGTH/m.test(text), false);
  });
});

const srcText = (p) => readSource(src(p)).replace(/\r\n/g, '\n');
const testText = (p) => readSource(testFile(p)).replace(/\r\n/g, '\n');

unitSuite('AUTH-04-D — limiter configuration and route shape (no database)', () => {
  it('both factories exist and return independent limiter instances', () => {
    const request = createEmailVerificationRequestLimiter();
    const confirm = createEmailVerificationConfirmLimiter();
    assert.equal(typeof request, 'function');
    assert.equal(typeof confirm, 'function');
    assert.equal(typeof request.resetKey, 'function');
    assert.equal(typeof confirm.resetKey, 'function');
    assert.notEqual(request, confirm);
  });

  it('defaults to 15 minutes / 30 for BOTH routes, read through the existing config reader', () => {
    const config = authRateConfig();
    assert.equal(config.emailVerificationRequestWindowMs, 900000);
    assert.equal(config.emailVerificationRequestMax, 30);
    assert.equal(config.emailVerificationConfirmWindowMs, 900000);
    assert.equal(config.emailVerificationConfirmMax, 30);
  });

  it('reads the four documented environment names, and lets an override win', () => {
    const text = srcText('middlewares/rateLimit.ts');
    for (const name of [
      'AUTH_EMAIL_VERIFICATION_REQUEST_RATE_LIMIT_WINDOW_MS',
      'AUTH_EMAIL_VERIFICATION_REQUEST_RATE_LIMIT_MAX',
      'AUTH_EMAIL_VERIFICATION_CONFIRM_RATE_LIMIT_WINDOW_MS',
      'AUTH_EMAIL_VERIFICATION_CONFIRM_RATE_LIMIT_MAX',
    ]) {
      assert.ok(text.includes(name), `${name} must be read by the factories`);
    }
    assert.equal(authRateConfig({ emailVerificationConfirmMax: 7 }).emailVerificationConfirmMax, 7);
  });

  it('the 429 code is IMPORTED, not re-declared as a second source of truth', () => {
    const text = srcText('middlewares/rateLimit.ts');
    assert.match(
      text,
      /import \{ EMAIL_VERIFICATION_RATE_LIMITED \} from '\.\.\/constants\/emailVerification\.ts';/
    );
    // One client-facing code, one definition: no local literal with the same value.
    assert.equal(text.includes(`'${EMAIL_VERIFICATION_RATE_LIMITED}'`), false);
  });

  it('neither factory skips successful requests, and both key on the client address', () => {
    const text = srcText('middlewares/rateLimit.ts');
    const start = text.indexOf('export function createEmailVerificationRequestLimiter');
    const end = text.indexOf('export default {', start);
    assert.ok(start > 0 && end > start, 'both factories must sit before the default export');
    const slice = text.slice(start, end);
    assert.ok(slice.includes('createEmailVerificationConfirmLimiter'), 'the slice covers both');
    assert.equal(slice.includes('skipSuccessfulRequests'), false);
    assert.equal((slice.match(/return ipKeyGenerator\(clientIp\(request\)\);/g) ?? []).length, 2);
    assert.equal(slice.includes('request.body'), false, 'no body-derived key component');
  });

  it('the routes mount limiter-then-controller, with no requireAuth in either chain', () => {
    const text = srcText('routes/auth.routes.ts');
    const request = text.match(/router\.post\(\n\s*'\/email-verification\/request',([\s\S]*?)\);/);
    const confirm = text.match(/router\.post\(\n\s*'\/email-verification\/confirm',([\s\S]*?)\);/);
    assert.ok(request, 'the request route is registered');
    assert.ok(confirm, 'the confirm route is registered');

    assert.ok(request[1].includes('createEmailVerificationRequestLimiter(limits),'));
    assert.ok(request[1].includes('emailVerificationRequest'));
    assert.equal(request[1].includes('requireAuth'), false);

    assert.ok(confirm[1].includes('createEmailVerificationConfirmLimiter(limits),'));
    assert.ok(confirm[1].includes('emailVerificationConfirm'));
    assert.equal(confirm[1].includes('requireAuth'), false);
  });

  it('the AUTH-04 mapper is module-local and does not borrow the link mapper', () => {
    const text = srcText('controllers/emailVerification.controller.ts');
    assert.match(text, /function mapEmailVerificationFailure\(err: unknown\)/);
    assert.equal(text.includes('export function mapEmailVerificationFailure'), false);
    assert.equal(/import[^;]*mapAuthenticatedFirebaseFailure/.test(text), false);
    // The lock handler copied the pattern and the log record types it never calls.
    assert.equal(text.includes("from '../controllers/firebaseAuth.controller.ts'"), false);
  });

  it('phase23 declares both routes as PUBLIC exemptions WITH a written reason', () => {
    const text = testText('phase23-authorization-contract.test.mjs');
    const from = text.indexOf('const PUBLIC_ROUTES = [');
    const to = text.indexOf('const AUTHENTICATED_ROUTES = [');
    assert.ok(from > 0 && to > from, 'the PUBLIC bucket is declared before the AUTHENTICATED one');
    const publicBlock = text.slice(from, to);
    for (const route of [
      'POST /api/auth/email-verification/request',
      'POST /api/auth/email-verification/confirm',
    ]) {
      assert.ok(publicBlock.includes(`route: '${route}'`), `${route} must be declared`);
    }
    // A declaration without a real reason is not a declaration.
    for (const path of ['request', 'confirm']) {
      const entry = publicBlock.match(
        new RegExp(`route: 'POST \\/api\\/auth\\/email-verification\\/${path}'[\\s\\S]*?why: '([^']+)'`)
      );
      assert.ok(entry, `${path} must carry a reason`);
      assert.ok(entry[1].length >= 80, `${path}'s reason must actually explain itself`);
      assert.ok(/Firebase-authenticated/.test(entry[1]), `${path} must state it is Firebase-authenticated`);
    }
  });

  it('phase23 has no count assertion, so an added route is declared rather than counted', () => {
    const text = testText('phase23-authorization-contract.test.mjs');
    assert.equal(/inventory from \d+/.test(text), false);
  });
});

// ===========================================================================
// DB-backed: both endpoints over the shipped app and a real database
// ===========================================================================

/** The two locked success messages (OD-4), asserted verbatim. */
const REQUEST_MESSAGE = 'If that address needs verification, a verification code has been sent.';
const VERIFIED_MESSAGE = 'Email verified.';

const dbOk = await ensureDb();

dbSuite('AUTH-04-C — the email-verification endpoints over HTTP (real database)', dbOk, () => {
  let app = null;
  const trackedUids = new Set();

  /** Every uid this suite creates a challenge for, so cleanup is exact. */
  function trackUid(uid) {
    trackedUids.add(uid);
    return uid;
  }

  /** A verifier that answers with a fresh, tracked uid on every call. */
  const freshUidPerCall = () => () => tokenPayload({ uid: trackUid(nextUid()) });

  /** Seeds a live challenge for `uid` with a known plaintext code. */
  async function seedChallenge({
    uid,
    code = CODE,
    email = USER_EMAIL,
    expiresAt = new Date(Date.now() + 10 * 60 * 1000),
    attempts = 0,
    usedAt = null,
    lastSentAt = new Date(),
  } = {}) {
    trackUid(uid);
    return EmailVerificationChallenge.create({
      uid,
      codeHmac: hashVerificationCode(VALID_PEPPER, code),
      emailHmac: hashVerificationEmail(VALID_PEPPER, email),
      expiresAt,
      attempts,
      usedAt,
      lastSentAt,
    });
  }

  const readChallenge = (uid) => EmailVerificationChallenge.findOne({ uid }).lean();
  const request = (body) => app.api('POST', REQUEST_PATH, { body });
  const confirm = (body) => app.api('POST', CONFIRM_PATH, { body });

  before(async () => {
    app = await listen(createApp({ requestLogging: false, authLimits: UNCAPPED }));
  });

  after(async () => {
    if (app) await app.close();
    if (trackedUids.size > 0) {
      await EmailVerificationChallenge.deleteMany({ uid: { $in: [...trackedUids] } });
    }
    await disconnectDb();
  });

  // -------------------------------------------------------------------------
  // Request
  // -------------------------------------------------------------------------

  it('request — success returns exactly { message }, mints a challenge and mails once', async () => {
    const uid = trackUid(nextUid());
    await scenario({ verifier: () => tokenPayload({ uid }) }, async () => {
      const res = await request({ idToken: ID_TOKEN });
      assert.equal(res.status, 200);
      assertMessageBody(res.json, REQUEST_MESSAGE);
      assertNoSecrets(res.json);

      const row = await readChallenge(uid);
      assert.ok(row, 'a challenge was created');
      assert.equal(row.attempts, 0);
      assert.equal(row.usedAt, null);
      assert.ok(row.expiresAt instanceof Date);

      // The stored digest corresponds to the digits the email actually carried.
      assert.equal(sentMessages().length, 1);
      const sent = sentMessages()[0];
      const blob = `${sent.subject}\n${sent.text}\n${sent.html}`;
      const digits = blob.match(/\b(\d{6})\b/);
      assert.ok(digits, 'the delivered email carries a six-digit code');
      assert.equal(row.codeHmac, hashVerificationCode(VALID_PEPPER, digits[1]));
    });
  });

  it('request — an already-verified identity is the SAME 200 envelope, and sends nothing', async () => {
    const uid = trackUid(nextUid());
    await scenario({ verifier: () => tokenPayload({ uid, emailVerified: true }) }, async () => {
      const res = await request({ idToken: ID_TOKEN });
      assert.equal(res.status, 200);
      assertMessageBody(res.json, REQUEST_MESSAGE);
      assert.equal(sentMessages().length, 0, 'the AD-14 no-op sends no mail');
      assert.equal(await readChallenge(uid), null, 'and creates no challenge');
    });
  });

  it('request — a rejected Firebase token is 400 FIREBASE_TOKEN_INVALID, never 401/403', async () => {
    await scenario({ verifier: 'invalid' }, async () => {
      const res = await request({ idToken: ID_TOKEN });
      assert.equal(res.status, 400);
      assert.notEqual(res.status, 401);
      assert.notEqual(res.status, 403);
      assert.equal(res.json.code, FIREBASE_TOKEN_INVALID);
      assertNoSecrets(res.json);
      // No SDK reason may reach the caller.
      assert.equal(JSON.stringify(res.json).includes('id-token-expired'), false);
    });
  });

  it('request — Firebase not configured is 503 FIREBASE_NOT_CONFIGURED', async () => {
    await scenario({ verifier: 'not-configured' }, async () => {
      const res = await request({ idToken: ID_TOKEN });
      assert.equal(res.status, 503);
      assert.equal(res.json.code, FIREBASE_NOT_CONFIGURED);
      assertNoSecrets(res.json);
    });
  });

  it('request — Firebase unavailable is 503 FIREBASE_UNAVAILABLE, not a token error', async () => {
    await scenario({ verifier: 'unavailable' }, async () => {
      const res = await request({ idToken: ID_TOKEN });
      assert.equal(res.status, 503);
      assert.equal(res.json.code, FIREBASE_UNAVAILABLE);
      assert.notEqual(res.json.code, FIREBASE_TOKEN_INVALID);
      assertNoSecrets(res.json);
      assert.equal(JSON.stringify(res.json).includes('network-error'), false);
    });
  });

  it('request — a missing pepper is 503 EMAIL_VERIFICATION_NOT_CONFIGURED', async () => {
    const uid = trackUid(nextUid());
    await scenario(
      { verifier: () => tokenPayload({ uid }), env: { [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: undefined } },
      async () => {
        const res = await request({ idToken: ID_TOKEN });
        assert.equal(res.status, 503);
        assert.equal(res.json.code, EMAIL_VERIFICATION_NOT_CONFIGURED);
        assert.equal(await readChallenge(uid), null, 'nothing was minted');
        assert.equal(sentMessages().length, 0);
        assertNoSecrets(res.json);
      }
    );
  });

  it('request — a delivery failure is 503 EMAIL_VERIFICATION_MAIL_FAILED', async () => {
    const uid = trackUid(nextUid());
    await scenario({ verifier: () => tokenPayload({ uid }) }, async () => {
      setFakeMailScenario(fakeMailFailure('The email could not be sent.'));
      const res = await request({ idToken: ID_TOKEN });
      assert.equal(res.status, 503);
      assert.equal(res.json.code, EMAIL_VERIFICATION_MAIL_FAILED);
      assertNoSecrets(res.json);
      // The new challenge stays current — no rollback, and the cooldown is kept.
      assert.ok(await readChallenge(uid));
    });
  });

  it('request — the 60-second resend cooldown is 429 EMAIL_VERIFICATION_RATE_LIMITED with Retry-After', async () => {
    const uid = trackUid(nextUid());
    await scenario({ verifier: () => tokenPayload({ uid }) }, async () => {
      const first = await request({ idToken: ID_TOKEN });
      assert.equal(first.status, 200);

      const second = await request({ idToken: ID_TOKEN });
      assert.equal(second.status, 429);
      assert.equal(second.json.code, EMAIL_VERIFICATION_RATE_LIMITED);
      const seconds = retryAfterSeconds(second);
      assert.ok(Number.isInteger(seconds) && seconds >= 1 && seconds <= 60, `Retry-After was ${seconds}`);
      assertNoSecrets(second.json);
    });
  });

  it('request — a missing idToken is 400 VALIDATION_ERROR with an idToken field problem', async () => {
    await scenario({}, async () => {
      const res = await request({});
      assert.equal(res.status, 400);
      assert.equal(res.json.code, 'VALIDATION_ERROR');
      assert.deepEqual(res.json.fields, [{ field: 'idToken', message: 'idToken is required' }]);
      assertNoSecrets(res.json);
    });
  });

  it('request — an identity, tenant and role in the body are inert', async () => {
    const uid = trackUid(nextUid());
    await scenario({ verifier: () => tokenPayload({ uid }) }, async () => {
      const res = await request({
        idToken: ID_TOKEN,
        uid: 'attacker-uid',
        firebaseUid: 'attacker-firebase-uid',
        email: 'attacker@example.test',
        userId: 'attacker-user-id',
        businessId: 'attacker-business-id',
        role: 'OWNER',
        status: 'ACTIVE',
      });
      assert.equal(res.status, 200);
      assert.ok(await readChallenge(uid), 'the challenge belongs to the TOKEN uid');
      assert.equal(await readChallenge('attacker-uid'), null);
      // The mail went to the verified identity's address, not the body's.
      assert.equal(sentMessages()[0].to, USER_EMAIL);
    });
  });

  // -------------------------------------------------------------------------
  // Confirm
  // -------------------------------------------------------------------------

  it('confirm — success returns exactly { message } and bridges emailVerified', async () => {
    const uid = trackUid(nextUid());
    await seedChallenge({ uid, code: CODE });
    await scenario({ verifier: () => tokenPayload({ uid }) }, async () => {
      const res = await confirm({ idToken: ID_TOKEN, code: CODE });
      assert.equal(res.status, 200);
      assertMessageBody(res.json, VERIFIED_MESSAGE);
      assertNoSecrets(res.json);

      assert.deepEqual(updatedUids(), [uid], 'the Admin write used the VERIFIED uid');
      const row = await readChallenge(uid);
      assert.equal(row.attempts, 1, 'exactly one attempt was spent');
      assert.ok(row.usedAt instanceof Date, 'the challenge was consumed');
    });
  });

  it('confirm — an already-verified identity is the SAME 200 envelope and touches nothing', async () => {
    const uid = trackUid(nextUid());
    await seedChallenge({ uid, code: CODE });
    await scenario({ verifier: () => tokenPayload({ uid, emailVerified: true }) }, async () => {
      const res = await confirm({ idToken: ID_TOKEN, code: CODE });
      assert.equal(res.status, 200);
      assertMessageBody(res.json, VERIFIED_MESSAGE);
      assert.equal(updatedUids().length, 0, 'no Admin write on the AD-14 short-circuit');
      const row = await readChallenge(uid);
      assert.equal(row.attempts, 0, 'no attempt reserved');
      assert.equal(row.usedAt, null);
    });
  });

  it('confirm — a wrong code is 400 INVALID_VERIFICATION_CODE and spends one attempt', async () => {
    const uid = trackUid(nextUid());
    await seedChallenge({ uid, code: CODE });
    await scenario({ verifier: () => tokenPayload({ uid }) }, async () => {
      const res = await confirm({ idToken: ID_TOKEN, code: WRONG_CODE });
      assert.equal(res.status, 400);
      assert.equal(res.json.code, INVALID_VERIFICATION_CODE);
      assertNoSecrets(res.json);
      const row = await readChallenge(uid);
      assert.equal(row.attempts, 1);
      assert.equal(row.usedAt, null);
      assert.equal(updatedUids().length, 0);
    });
  });

  it('confirm — an expired challenge, an exhausted one and an absent one are the SAME refusal', async () => {
    const expired = trackUid(nextUid());
    const exhausted = trackUid(nextUid());
    const absent = trackUid(nextUid());
    await seedChallenge({ uid: expired, code: CODE, expiresAt: new Date(Date.now() - 5000) });
    await seedChallenge({ uid: exhausted, code: CODE, attempts: 5 });

    await scenario({ verifier: () => tokenPayload({ uid: expired }) }, async () => {
      const res = await confirm({ idToken: ID_TOKEN, code: CODE });
      assert.equal(res.status, 400);
      assert.equal(res.json.code, INVALID_VERIFICATION_CODE);
    });
    await scenario({ verifier: () => tokenPayload({ uid: exhausted }) }, async () => {
      const res = await confirm({ idToken: ID_TOKEN, code: CODE });
      assert.equal(res.status, 400);
      assert.equal(res.json.code, INVALID_VERIFICATION_CODE);
    });
    await scenario({ verifier: () => tokenPayload({ uid: absent }) }, async () => {
      const res = await confirm({ idToken: ID_TOKEN, code: CODE });
      assert.equal(res.status, 400);
      assert.equal(res.json.code, INVALID_VERIFICATION_CODE);
      assert.equal(updatedUids().length, 0, 'a guess never creates a challenge');
    });
  });

  it('confirm — a blank or non-string code is 400 VALIDATION_ERROR, before any attempt is spent', async () => {
    const uid = trackUid(nextUid());
    await seedChallenge({ uid, code: CODE });
    await scenario({ verifier: () => tokenPayload({ uid }) }, async () => {
      for (const code of ['', '   ', 42, null]) {
        const res = await confirm({ idToken: ID_TOKEN, code });
        assert.equal(res.status, 400);
        assert.equal(res.json.code, 'VALIDATION_ERROR');
        assert.deepEqual(res.json.fields, [{ field: 'code', message: 'code is required' }]);
      }
      const row = await readChallenge(uid);
      assert.equal(row.attempts, 0, 'a malformed submission spends nothing');
    });
  });

  it('confirm — a rejected Firebase token is 400 FIREBASE_TOKEN_INVALID, never 401/403', async () => {
    await scenario({ verifier: 'invalid' }, async () => {
      const res = await confirm({ idToken: ID_TOKEN, code: CODE });
      assert.equal(res.status, 400);
      assert.notEqual(res.status, 401);
      assert.notEqual(res.status, 403);
      assert.equal(res.json.code, FIREBASE_TOKEN_INVALID);
      assertNoSecrets(res.json);
    });
  });

  it('confirm — Firebase not configured is 503, and Firebase unavailable is 503', async () => {
    await scenario({ verifier: 'not-configured' }, async () => {
      const res = await confirm({ idToken: ID_TOKEN, code: CODE });
      assert.equal(res.status, 503);
      assert.equal(res.json.code, FIREBASE_NOT_CONFIGURED);
      assertNoSecrets(res.json);
    });
    await scenario({ verifier: 'unavailable' }, async () => {
      const res = await confirm({ idToken: ID_TOKEN, code: CODE });
      assert.equal(res.status, 503);
      assert.equal(res.json.code, FIREBASE_UNAVAILABLE);
      assertNoSecrets(res.json);
    });
  });

  it('confirm — a missing pepper is 503 EMAIL_VERIFICATION_NOT_CONFIGURED, before any reservation', async () => {
    const uid = trackUid(nextUid());
    await seedChallenge({ uid, code: CODE });
    await scenario(
      { verifier: () => tokenPayload({ uid }), env: { [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: undefined } },
      async () => {
        const res = await confirm({ idToken: ID_TOKEN, code: CODE });
        assert.equal(res.status, 503);
        assert.equal(res.json.code, EMAIL_VERIFICATION_NOT_CONFIGURED);
        const row = await readChallenge(uid);
        assert.equal(row.attempts, 0, 'the pepper gate runs before the reservation');
        assert.equal(row.usedAt, null);
        assertNoSecrets(res.json);
      }
    );
  });

  it('confirm — an Admin user-not-found is 400 and leaves usedAt unset', async () => {
    const uid = trackUid(nextUid());
    await seedChallenge({ uid, code: CODE });
    await scenario({ verifier: () => tokenPayload({ uid }) }, async () => {
      setFakeFirebaseUpdateFailure('auth/user-not-found');
      const res = await confirm({ idToken: ID_TOKEN, code: CODE });
      assert.equal(res.status, 400);
      assert.equal(res.json.code, FIREBASE_TOKEN_INVALID);
      const row = await readChallenge(uid);
      assert.equal(row.usedAt, null, 'a failed write never consumes the challenge');
      assert.equal(row.attempts, 1, 'the attempt stays spent (AD-12/OD-4)');
      assertNoSecrets(res.json);
    });
  });

  it('confirm — an Admin transport failure is 503 FIREBASE_UNAVAILABLE and leaves usedAt unset', async () => {
    const uid = trackUid(nextUid());
    await seedChallenge({ uid, code: CODE });
    await scenario({ verifier: () => tokenPayload({ uid }) }, async () => {
      setFakeFirebaseUpdateFailure('app/network-error');
      const res = await confirm({ idToken: ID_TOKEN, code: CODE });
      assert.equal(res.status, 503);
      assert.equal(res.json.code, FIREBASE_UNAVAILABLE);
      const row = await readChallenge(uid);
      assert.equal(row.usedAt, null);
      assert.equal(row.attempts, 1);
      assertNoSecrets(res.json);
    });
  });

  it('confirm — an identity and tenant in the body are inert', async () => {
    const uid = trackUid(nextUid());
    await seedChallenge({ uid, code: CODE });
    await scenario({ verifier: () => tokenPayload({ uid }) }, async () => {
      const res = await confirm({
        idToken: ID_TOKEN,
        code: CODE,
        uid: 'attacker-uid',
        firebaseUid: 'attacker-uid',
        businessId: 'attacker-business-id',
        role: 'OWNER',
      });
      assert.equal(res.status, 200);
      assertMessageBody(res.json, VERIFIED_MESSAGE);
      // The write went to the TOKEN's uid, never the body's.
      assert.deepEqual(updatedUids(), [uid]);
    });
  });

  // -------------------------------------------------------------------------
  // D — the two limiters, behaviourally
  // -------------------------------------------------------------------------

  it('request limiter — the (max+1)th request from one address is 429 with Retry-After', async () => {
    await scenario({ verifier: freshUidPerCall() }, async () => {
      const limits = { emailVerificationRequestMax: 2, emailVerificationRequestWindowMs: 60000 };
      await withApp(limits, async (instance) => {
        const r = () => instance.api('POST', REQUEST_PATH, { body: { idToken: ID_TOKEN } });
        assert.equal((await r()).status, 200);
        assert.equal((await r()).status, 200);
        const blocked = await r();
        assert.equal(blocked.status, 429);
        assert.equal(blocked.json.code, EMAIL_VERIFICATION_RATE_LIMITED);
        const seconds = retryAfterSeconds(blocked);
        assert.ok(
          Number.isInteger(seconds) && seconds >= 1 && seconds <= 60,
          `Retry-After was ${seconds}`
        );
        assertNoSecrets(blocked.json);
      });
    });
  });

  it('confirm limiter — the (max+1)th confirmation from one address is 429', async () => {
    await scenario({ verifier: freshUidPerCall() }, async () => {
      const limits = { emailVerificationConfirmMax: 2, emailVerificationConfirmWindowMs: 60000 };
      await withApp(limits, async (instance) => {
        const c = () =>
          instance.api('POST', CONFIRM_PATH, { body: { idToken: ID_TOKEN, code: CODE } });
        // Each is refused by the SERVICE (no challenge exists) but still COUNTED —
        // a limiter that skipped 4xx would leave exactly this surface unbounded.
        assert.equal((await c()).status, 400);
        assert.equal((await c()).status, 400);
        const blocked = await c();
        assert.equal(blocked.status, 429);
        assert.equal(blocked.json.code, EMAIL_VERIFICATION_RATE_LIMITED);
        assert.ok(retryAfterSeconds(blocked) >= 1);
      });
    });
  });

  it('a SUCCESSFUL request still consumes the budget — successes are not skipped', async () => {
    await scenario({ verifier: freshUidPerCall() }, async () => {
      const limits = { emailVerificationRequestMax: 1, emailVerificationRequestWindowMs: 60000 };
      await withApp(limits, async (instance) => {
        const r = () => instance.api('POST', REQUEST_PATH, { body: { idToken: ID_TOKEN } });
        assert.equal((await r()).status, 200);
        assert.equal((await r()).status, 429, 'the 200 bought no free credit');
      });
    });
  });

  it('the request and the confirm budgets are independent', async () => {
    await scenario({ verifier: freshUidPerCall() }, async () => {
      const limits = {
        emailVerificationRequestMax: 1,
        emailVerificationConfirmMax: 5,
        emailVerificationRequestWindowMs: 60000,
        emailVerificationConfirmWindowMs: 60000,
      };
      await withApp(limits, async (instance) => {
        const base = 'http://127.0.0.1';
        assert.ok(instance.base.startsWith(base));
        assert.equal(
          (await instance.api('POST', REQUEST_PATH, { body: { idToken: ID_TOKEN } })).status,
          200
        );
        assert.equal(
          (await instance.api('POST', REQUEST_PATH, { body: { idToken: ID_TOKEN } })).status,
          429
        );
        // The confirm bucket must be untouched by the request bucket.
        const c = await instance.api('POST', CONFIRM_PATH, {
          body: { idToken: ID_TOKEN, code: CODE },
        });
        assert.equal(c.status, 400, 'confirm is refused by the service, not the limiter');
        assert.notEqual(c.json.code, EMAIL_VERIFICATION_RATE_LIMITED);
      });
    });
  });

  it('the bucket is keyed on the ADDRESS — no body field can reach a different one', async () => {
    await scenario({ verifier: freshUidPerCall() }, async () => {
      const limits = { emailVerificationRequestMax: 1, emailVerificationRequestWindowMs: 60000 };
      await withApp(limits, async (instance) => {
        const r = (body) => instance.api('POST', REQUEST_PATH, { body });
        assert.equal((await r({ idToken: ID_TOKEN })).status, 200);
        const blocked = await r({
          idToken: ID_TOKEN,
          uid: 'other-uid',
          email: 'other@example.test',
          businessId: 'other-business-id',
          role: 'OWNER',
        });
        assert.equal(blocked.status, 429, 'a different identity in the body shares the bucket');
      });
    });
  });

  it('a spoofed X-Forwarded-For does not open a fresh bucket while trust proxy is off', async () => {
    await scenario({ verifier: freshUidPerCall() }, async () => {
      const limits = { emailVerificationRequestMax: 1, emailVerificationRequestWindowMs: 60000 };
      await withApp(limits, async (instance) => {
        const first = await instance.api('POST', REQUEST_PATH, {
          body: { idToken: ID_TOKEN },
        });
        assert.equal(first.status, 200);
        const blocked = await instance.api('POST', REQUEST_PATH, {
          body: { idToken: ID_TOKEN },
          headers: { 'x-forwarded-for': '203.0.113.9' },
        });
        assert.equal(blocked.status, 429, 'the forwarded header was ignored');
      });
    });
  });

  it('a short window recovers: the next request after it elapses is allowed again', async () => {
    await scenario({ verifier: freshUidPerCall() }, async () => {
      const limits = { emailVerificationRequestMax: 1, emailVerificationRequestWindowMs: 1100 };
      await withApp(limits, async (instance) => {
        const r = () => instance.api('POST', REQUEST_PATH, { body: { idToken: ID_TOKEN } });
        assert.equal((await r()).status, 200);
        assert.equal((await r()).status, 429);
        await new Promise((resolve) => setTimeout(resolve, 1400));
        assert.equal((await r()).status, 200, 'the window moved on');
      });
    });
  });

  it('the AD-19 limiter and the per-UID cooldown are separate controls', async () => {
    const first = trackUid(nextUid());
    const second = trackUid(nextUid());
    let call = 0;
    await scenario(
      { verifier: () => tokenPayload({ uid: call++ < 2 ? first : second }) },
      async () => {
        const limits = { emailVerificationRequestMax: 100, emailVerificationRequestWindowMs: 60000 };
        await withApp(limits, async (instance) => {
          const r = () => instance.api('POST', REQUEST_PATH, { body: { idToken: ID_TOKEN } });
          assert.equal((await r()).status, 200);
          const cooled = await r();
          assert.equal(cooled.status, 429, 'the COOLDOWN refused the second request');
          const seconds = retryAfterSeconds(cooled);
          assert.ok(
            Number.isInteger(seconds) && seconds >= 1 && seconds <= 60,
            `the refusal is the resend cooldown, so Retry-After is 1..60 — got ${seconds}`
          );
          // A different identity is served immediately: the route limiter (100) is
          // nowhere near its cap, so what refused the first account was the cooldown.
          assert.equal((await r()).status, 200);
        });
      }
    );
  });
});
