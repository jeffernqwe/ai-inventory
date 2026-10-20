// AUTH-04-B3 — the email-verification challenge REQUEST lifecycle.
//
// One operation, `requestEmailVerificationCode({ idToken })`, and this suite
// pins the properties that make it safe to expose:
//
//   * THE STEP ORDER IS THE DESIGN. The Firebase ID token is verified first and
//     its errors are propagated UNCHANGED; an already-verified identity is a
//     clean no-op before ANY configuration question or challenge access; and the
//     pepper/mail configuration gates run before anything is minted or written.
//   * NOTHING PLAINTEXT IS PERSISTED. The stored `codeHmac` corresponds exactly
//     to the digits in the delivered email, and no plaintext code, address or
//     pepper appears anywhere on the raw document.
//   * SUPERSESSION IS ONE ROW. A later request reuses the same `_id`, resets
//     `attempts` and `usedAt`, and a request inside the cooldown is refused with
//     an accurate `retryAfterSeconds` and leaves the row untouched.
//   * CONCURRENCY CONVERGES. Two racing requests — stale-row supersession OR
//     first-time creation — leave ONE row and at most ONE send.
//   * A DELIVERY FAILURE IS NOT ROLLED BACK. The new challenge stays current and
//     its cooldown stays active, so the caller cannot immediately re-request.
//   * AD-18 LOGGING IS BY ALLOWLIST. Only the declared event names are emitted,
//     and no uid, email, code, HMAC, pepper or Firebase ID token is ever in a
//     record.
//
// Registered MIXED in run-tests.mjs: the error-propagation, pre-flight,
// cooldown-arithmetic and source-guard cases need no database; the lifecycle,
// concurrency and persistence cases need MongoDB.

import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { ensureDb, disconnectDb } from './helpers.mjs';
import { unitSuite, dbSuite } from './testEnv.mjs';
import { readSource } from './sourceFiles.mjs';

import {
  registerFakeFirebaseVerifier,
  deregisterFakeFirebaseVerifier,
  setFakeFirebaseToken,
  setFakeFirebaseFailure,
  fakeServiceAccountJson,
} from './fakes/firebaseVerifier.mjs';
import { hasCustomFirebaseIdTokenVerifier } from '../src/services/firebase/tokenVerifier.ts';
import {
  FAKE_MAIL_PROVIDER,
  registerFakeMailProvider,
  deregisterFakeMailProvider,
  setFakeMailScenario,
  sentMessages,
  clearSentMessages,
  fakeMailFailure,
} from './fakes/mailProvider.mjs';
import { registeredProviders } from '../src/services/mail/providers/index.ts';

import {
  requestEmailVerificationCode,
  retryAfterSecondsFor,
} from '../src/services/emailVerification/request.ts';
import { EmailVerificationError } from '../src/services/emailVerification/errors.ts';
import { requestEmailVerificationCode as boundaryRequest } from '../src/services/emailVerification/index.ts';
import {
  hashVerificationCode,
  hashVerificationEmail,
} from '../src/services/emailVerification/code.ts';

import {
  EMAIL_VERIFICATION_LOG_EVENTS,
  EMAIL_VERIFICATION_MAIL_FAILED,
  EMAIL_VERIFICATION_NOT_CONFIGURED,
  EMAIL_VERIFICATION_RATE_LIMITED,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
  EMAIL_VERIFICATION_TTL_MINUTES,
} from '../src/constants/emailVerification.ts';
import { EMAIL_VERIFICATION_CODE_PEPPER_ENV } from '../src/config/emailVerification.ts';
import {
  FirebaseNotConfigured,
  FirebaseTokenError,
  FIREBASE_NOT_CONFIGURED,
  FIREBASE_TOKEN_INVALID,
} from '../src/services/firebase/firebaseErrors.ts';
import EmailVerificationChallenge from '../src/models/emailVerificationChallenge.model.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A valid pepper comfortably over the minimum, and obviously a test value. */
const VALID_PEPPER = 'inventory-ai-auth04b3-test-pepper-value';

const USER_EMAIL = 'owner@inventory-ai.test';

/** Built once: generating an RSA key per case would only slow the suite down. */
const FIREBASE_JSON = fakeServiceAccountJson();

/** Every environment variable this lifecycle reads; all others are cleared. */
const ENV_KEYS = [
  EMAIL_VERIFICATION_CODE_PEPPER_ENV,
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'MAIL_PROVIDER',
  'BREVO_API_KEY',
  'MAIL_FROM',
  'MAIL_APP_NAME',
  'MAIL_REQUEST_TIMEOUT_MS',
  'PASSWORD_RESET_URL',
];

/**
 * Runs `fn` with EXACTLY the given values for this lifecycle's env vars — every
 * other managed key is cleared first — and restores the previous environment.
 */
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

/** Registers the Firebase and mail seams, and removes them in a `finally`. */
async function withSeams({ firebase = true, mail = true } = {}, fn) {
  if (firebase) registerFakeFirebaseVerifier();
  if (mail) registerFakeMailProvider();
  try {
    return await fn();
  } finally {
    if (firebase) deregisterFakeFirebaseVerifier();
    if (mail) deregisterFakeMailProvider();
  }
}

/** A fully configured server: pepper, Firebase and the fake mail transport. */
function configuredEnv(extra = {}) {
  return {
    [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: VALID_PEPPER,
    FIREBASE_SERVICE_ACCOUNT_JSON: FIREBASE_JSON,
    MAIL_PROVIDER: FAKE_MAIL_PROVIDER,
    ...extra,
  };
}

/**
 * An identity for the fake verifier, in DECODED-TOKEN shape.
 *
 * `email` is defaulted by OWN-PROPERTY test on purpose: an explicit `email:
 * undefined` or `email: null` is a case under test, and a default parameter would
 * silently turn the former into a valid address.
 */
function tokenPayload(options = {}) {
  const hasEmail = Object.prototype.hasOwnProperty.call(options, 'email');
  return {
    uid: options.uid,
    email: hasEmail ? options.email : USER_EMAIL,
    email_verified: options.emailVerified ?? false,
    firebase: { sign_in_provider: 'password' },
    auth_time: Math.floor(Date.now() / 1000),
  };
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Runs `fn` with the console captured and reports what it resolved or threw and
 * every line that was logged, restoring the console in a `finally`.
 */
async function captureOutcome(fn) {
  const original = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  const lines = [];
  const capture = (...args) => {
    lines.push(args.map((arg) => (typeof arg === 'string' ? arg : safeStringify(arg))).join(' '));
  };
  console.log = capture;
  console.error = capture;
  console.warn = capture;
  console.info = capture;

  let value;
  let error = null;
  try {
    value = await fn();
  } catch (err) {
    error = err;
  } finally {
    Object.assign(console, original);
  }
  return { value, error, lines };
}

/** The structured log records, parsed out of the captured JSON lines. */
function logRecords(lines) {
  return lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** The six digits the template rendered. */
function codeFromMessage(message) {
  const match = /\b\d{6}\b/.exec(message.text);
  assert.ok(match, `no six-digit code in the delivered message: ${safeStringify(message.text)}`);
  return match[0];
}

// ---------------------------------------------------------------------------
// Unit — Firebase verification propagation (step 1)
// ---------------------------------------------------------------------------

unitSuite('AUTH-04-B3 — Firebase verification errors propagate unchanged', () => {
  it('rejects a missing or empty idToken with the verifier\u2019s own error', async () => {
    // The guard lives in `verifyFirebaseIdToken` and runs BEFORE the seam, so the
    // service never mints, reads or writes anything for it.
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        for (const idToken of [undefined, null, '', '   ', 42]) {
          const { error } = await captureOutcome(() => requestEmailVerificationCode({ idToken }));
          assert.ok(error instanceof FirebaseTokenError, `expected FirebaseTokenError for ${String(idToken)}`);
          assert.equal(error.code, FIREBASE_TOKEN_INVALID);
          assert.equal(error.reason, 'missing-token');
          assert.ok(!(error instanceof EmailVerificationError), 'the verifier error must not be remapped');
        }
        assert.equal(sentMessages().length, 0, 'no email may be attempted without an identity');
      })
    );
  });

  it('propagates an expired token, an invalid token and a revoked token unchanged', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        for (const reason of ['auth/id-token-expired', 'auth/invalid-credential', 'auth/id-token-revoked']) {
          setFakeFirebaseFailure(reason);
          const { error } = await captureOutcome(() => requestEmailVerificationCode({ idToken: 'tok' }));
          assert.ok(error instanceof FirebaseTokenError, `expected a token error for ${reason}`);
          assert.equal(error.code, FIREBASE_TOKEN_INVALID);
          assert.equal(error.reason, reason, 'the classified reason must survive unchanged');
        }
        assert.equal(sentMessages().length, 0);
      })
    );
  });

  it('propagates an unconfigured Firebase before the flow\u2019s own config gate', async () => {
    // No seam and no service account: the REAL verifier path is used, and its
    // FirebaseNotConfigured must arrive untouched. The flow's own pepper gate
    // must not have been reached first — the two are different faults.
    await withEnv({}, () =>
      withSeams({ firebase: false }, async () => {
        const { error } = await captureOutcome(() => requestEmailVerificationCode({ idToken: 'a.b.c' }));
        assert.ok(error instanceof FirebaseNotConfigured, 'expected FirebaseNotConfigured');
        assert.equal(error.code, FIREBASE_NOT_CONFIGURED);
        assert.ok(!(error instanceof EmailVerificationError), 'no flow error may replace it');
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Unit — the pre-flight contract (steps 2-5)
// ---------------------------------------------------------------------------

unitSuite('AUTH-04-B3 — pre-flight: short-circuit, email, configuration', () => {
  it('returns immediately for an already-verified identity, with nothing configured', async () => {
    // The strongest form of O-2: NO pepper, NO mail provider and NO Firebase
    // config. If the short-circuit sat after either config gate this would throw
    // EMAIL_VERIFICATION_NOT_CONFIGURED instead of resolving.
    await withEnv({}, () =>
      withSeams({}, async () => {
        setFakeFirebaseToken(tokenPayload({ uid: 'auth04b3-unit-verified', emailVerified: true }));
        const { value, error, lines } = await captureOutcome(() =>
          requestEmailVerificationCode({ idToken: 'tok' })
        );
        assert.equal(error, null, 'an already-verified identity must not fail on configuration');
        assert.equal(value, undefined, 'the short-circuit returns nothing');
        assert.equal(sentMessages().length, 0, 'no email may be sent');
        assert.equal(lines.join(''), '', 'the no-op logs nothing');
      })
    );
  });

  it('does not treat an already-verified identity with no email as a validation error', async () => {
    // Pins the ordering between steps 2 and 3: the short-circuit wins.
    await withEnv({}, () =>
      withSeams({}, async () => {
        setFakeFirebaseToken(tokenPayload({ uid: 'auth04b3-unit-noemail', email: null, emailVerified: true }));
        const { value, error } = await captureOutcome(() => requestEmailVerificationCode({ idToken: 'tok' }));
        assert.equal(error, null);
        assert.equal(value, undefined);
      })
    );
  });

  it('reports a missing Firebase email as VALIDATION_ERROR on idToken', async () => {
    // Env deliberately EMPTY, so a wrong order would surface as NOT_CONFIGURED.
    // The shape, wording and code are the register path's — no new flow error.
    await withEnv({}, () =>
      withSeams({}, async () => {
        for (const email of [null, undefined, '', '   ']) {
          setFakeFirebaseToken(tokenPayload({ uid: 'auth04b3-unit-missing-email', email }));
          const { error } = await captureOutcome(() => requestEmailVerificationCode({ idToken: 'tok' }));
          assert.ok(error, `expected a failure for email ${String(email)}`);
          assert.ok(!(error instanceof EmailVerificationError), 'not a flow error');
          assert.equal(error.status, 400);
          assert.equal(error.code, 'VALIDATION_ERROR');
          assert.deepEqual(error.fields, [
            { field: 'idToken', message: 'the verified Firebase identity carries no email address' },
          ]);
        }
        assert.equal(sentMessages().length, 0);
      })
    );
  });

  it('refuses with EMAIL_VERIFICATION_NOT_CONFIGURED when the pepper is unusable', async () => {
    await withEnv(
      configuredEnv({ [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: undefined }),
      () =>
        withSeams({}, async () => {
          setFakeFirebaseToken(tokenPayload({ uid: 'auth04b3-unit-nopepper' }));
          const { error, lines } = await captureOutcome(() =>
            requestEmailVerificationCode({ idToken: 'tok' })
          );
          assert.ok(error instanceof EmailVerificationError);
          assert.equal(error.code, EMAIL_VERIFICATION_NOT_CONFIGURED);
          assert.equal(sentMessages().length, 0, 'nothing may be sent');
          // The caller-facing copy must not name an environment variable.
          assert.ok(!error.message.includes(EMAIL_VERIFICATION_CODE_PEPPER_ENV));
          assert.equal(lines.join(''), '', 'no code was requested, so no event is emitted');
        })
    );
  });

  it('refuses with EMAIL_VERIFICATION_NOT_CONFIGURED when mail is unusable', async () => {
    await withEnv(configuredEnv({ MAIL_PROVIDER: undefined }), () =>
      withSeams({}, async () => {
        setFakeFirebaseToken(tokenPayload({ uid: 'auth04b3-unit-nomail' }));
        const { error, lines } = await captureOutcome(() =>
          requestEmailVerificationCode({ idToken: 'tok' })
        );
        assert.ok(error instanceof EmailVerificationError);
        assert.equal(error.code, EMAIL_VERIFICATION_NOT_CONFIGURED);
        assert.equal(sentMessages().length, 0);
        assert.ok(!error.message.includes('MAIL_PROVIDER'), 'the copy must not name a variable');
        assert.equal(lines.join(''), '');
      })
    );
  });

  it('exposes the operation and its error class through the service boundary', () => {
    assert.equal(typeof boundaryRequest, 'function');
    assert.equal(boundaryRequest, requestEmailVerificationCode, 'one implementation, not a copy');
  });
});

// ---------------------------------------------------------------------------
// Unit — cooldown arithmetic (O-1/O-5), pure and exact
// ---------------------------------------------------------------------------

unitSuite('AUTH-04-B3 — cooldown arithmetic', () => {
  const T0 = new Date('2026-01-01T00:00:00.000Z');
  const after = (ms) => new Date(T0.getTime() + ms);

  it('reports the full window at the moment of sending', () => {
    assert.equal(EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS, 60, 'the locked cooldown is 60s');
    assert.equal(retryAfterSecondsFor(T0, T0), 60);
  });

  it('counts down, rounding up to a whole second', () => {
    assert.equal(retryAfterSecondsFor(T0, after(1)), 60);
    assert.equal(retryAfterSecondsFor(T0, after(1_000)), 59);
    assert.equal(retryAfterSecondsFor(T0, after(30_000)), 30);
    assert.equal(retryAfterSecondsFor(T0, after(59_001)), 1);
    assert.equal(retryAfterSecondsFor(T0, after(59_999)), 1);
  });

  it('floors at one second once the window is spent, never at zero or below', () => {
    // The only way to reach this with a live row is a race, and "wait 0 seconds"
    // would invite an immediate retry into a row already being superseded.
    assert.equal(retryAfterSecondsFor(T0, after(60_000)), 1);
    assert.equal(retryAfterSecondsFor(T0, after(120_000)), 1);
  });

  it('caps at the cooldown, so a skewed or hand-edited lastSentAt cannot inflate it', () => {
    assert.equal(retryAfterSecondsFor(after(5_000), T0), 60);
  });

  it('is total over an unusable lastSentAt, answering the full window rather than NaN', () => {
    for (const bad of [null, undefined, 0, 'x', {}, new Date('nope')]) {
      const answer = retryAfterSecondsFor(bad, T0);
      assert.equal(answer, 60, `expected 60 for ${safeStringify(bad)}`);
      assert.ok(Number.isInteger(answer));
    }
  });
});

// ---------------------------------------------------------------------------
// Unit — the domain error class
// ---------------------------------------------------------------------------

unitSuite('AUTH-04-B3 — EmailVerificationError shape', () => {
  it('carries a code and a message, and never an HTTP status', () => {
    const err = new EmailVerificationError('SOME_CODE', 'a message');
    assert.equal(err.name, 'EmailVerificationError');
    assert.equal(err.code, 'SOME_CODE');
    assert.equal(err.message, 'a message');
    assert.ok(!('status' in err), 'the domain layer decides no HTTP status');
  });

  it('leaves the optional fields ABSENT rather than undefined', () => {
    const bare = new EmailVerificationError('A', 'm');
    assert.equal(Object.prototype.hasOwnProperty.call(bare, 'problems'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(bare, 'retryAfterSeconds'), false);

    const full = new EmailVerificationError('B', 'm', {
      problems: [{ field: 'x', message: 'y' }],
      retryAfterSeconds: 12,
    });
    assert.deepEqual(full.problems, [{ field: 'x', message: 'y' }]);
    assert.equal(full.retryAfterSeconds, 12);
    assert.equal(Object.prototype.hasOwnProperty.call(full, 'problems'), true);
  });

  it('never serialises a credential-like field', () => {
    const rendered = JSON.stringify(new EmailVerificationError('C', 'm', { retryAfterSeconds: 1 }));
    for (const banned of ['uid', 'email', 'codeHmac', 'emailHmac', 'pepper', 'idToken']) {
      assert.ok(!rendered.includes(banned), `${banned} must not exist on the error`);
    }
  });
});

// ---------------------------------------------------------------------------
// Unit — source guards (mechanism, not behaviour)
// ---------------------------------------------------------------------------

const REQUEST_SRC = readSource(new URL('../src/services/emailVerification/request.ts', import.meta.url));
const ERRORS_SRC = readSource(new URL('../src/services/emailVerification/errors.ts', import.meta.url));
const FIREBASE_AUTH_SRC = readSource(new URL('../src/services/firebaseAuth.service.ts', import.meta.url));

/**
 * The same sources with comments removed.
 *
 * The mechanism guards must read CODE, not prose: this module's own header names
 * `isMailConfigured()`, `recordAudit` and `BRIDGE_FAILED` in order to explain why
 * they are handled where they are, and a guard searching the raw text would fail
 * on its own documentation.
 */
function codeOnly(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

const REQUEST_CODE = codeOnly(REQUEST_SRC);
const ERRORS_CODE = codeOnly(ERRORS_SRC);

/** Replaces every string literal with an empty one, so a word in copy cannot match. */
function withoutStrings(text) {
  return text
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""')
    .replace(/`[^`]*`/g, '``');
}

unitSuite('AUTH-04-B3 — source guards', () => {
  it('runs the twelve steps in the required order', () => {
    const order = [
      'verifyFirebaseIdToken(',
      'identity.emailVerified === true',
      'normalizeEmail(',
      'isEmailVerificationConfigured(',
      'isMailConfigured(',
      'generateVerificationCode(',
      'findOneAndUpdate(',
      'logCodeRequested();',
      'sendEmailVerificationEmail(',
    ];
    const positions = order.map((needle) => {
      const at = REQUEST_CODE.indexOf(needle);
      assert.ok(at >= 0, `request.ts must contain ${needle}`);
      return at;
    });
    for (let i = 1; i < positions.length; i += 1) {
      assert.ok(
        positions[i] > positions[i - 1],
        `${order[i]} must follow ${order[i - 1]} in the source`
      );
    }
  });

  it('is fail-closed on the verified claim, and preserves the two existing gates', () => {
    assert.ok(REQUEST_SRC.includes('identity.emailVerified === true'));
    assert.ok(!REQUEST_SRC.includes('emailVerified !== false'), 'must not admit a non-boolean claim');
    // The exchange and register gates are pinned by phase16 as EXACTLY two; B3
    // must not have added a third.
    const gates = FIREBASE_AUTH_SRC.match(/emailVerified !== true/g) ?? [];
    assert.equal(gates.length, 2, 'firebaseAuth.service.ts must keep exactly its two gates');
  });

  it('logs nothing itself, and only through the allowlisted events', () => {
    assert.ok(!REQUEST_CODE.includes('console.'), 'request.ts must not use the console directly');
    assert.ok(!ERRORS_CODE.includes('console.'), 'errors.ts must not log');
    assert.ok(REQUEST_CODE.includes('EMAIL_VERIFICATION_LOG_EVENTS.CODE_REQUESTED'));
    assert.ok(REQUEST_CODE.includes('EMAIL_VERIFICATION_LOG_EVENTS.FAILED'));
    for (const forbidden of ['EMAIL_VERIFICATION_LOG_EVENTS.BRIDGE_FAILED', 'EMAIL_VERIFICATION_LOG_EVENTS.COMPLETED']) {
      assert.ok(!REQUEST_CODE.includes(forbidden), `${forbidden} belongs to another phase`);
    }
  });

  it('keeps every logged field identifier free of secret material', () => {
    // Strip the string literals first: the human copy legitimately contains the
    // word "code", and it is an IDENTIFIER that would leak a value, not a word
    // in a sentence.
    const bodies = REQUEST_SRC.match(/log(?:Info|Error)\(\{[\s\S]*?\}\)/g) ?? [];
    assert.equal(bodies.length, 2, 'exactly two log call sites are expected');
    const banned = /\b(uid|email|code|pepper|idToken|token|codeHmac|emailHmac|businessId)\b/;
    for (const body of bodies) {
      const identifiers = withoutStrings(body);
      const match = banned.exec(identifiers);
      assert.equal(match, null, `a log record must not carry ${match && match[0]}: ${identifiers}`);
    }
  });

  it('writes no audit row, and cannot: no tenant exists yet', () => {
    assert.ok(!REQUEST_CODE.includes('recordAudit'));
    assert.ok(!REQUEST_CODE.includes('businessId'));
    assert.ok(!REQUEST_CODE.includes('AUDIT_ACTIONS'));
  });

  it('uses no transaction, no lock, no new index and no upsert', () => {
    for (const forbidden of ['upsert', 'startSession', 'withTransaction', 'ensureIndexes', '.index(']) {
      assert.ok(!REQUEST_CODE.includes(forbidden), `request.ts must not use ${forbidden}`);
    }
  });

  it('persists only keyed digests, and resets usedAt on supersession', () => {
    assert.ok(REQUEST_CODE.includes('codeHmac'), 'the digest is what is stored');
    assert.ok(!REQUEST_CODE.includes('createHash'), 'the digest must stay keyed');
    assert.ok(!REQUEST_CODE.includes('Math.random'));
    // AD-10: supersession replaces the challenge, so the new row is live.
    assert.ok(/usedAt:\s*null/.test(REQUEST_CODE));
    // AD-12 (never unsetting on consumption) is the B4 path and is not here.
    assert.ok(!/usedAt:\s*undefined/.test(REQUEST_CODE));
  });

  it('declares no HTTP status and reads no identity from a request body', () => {
    assert.ok(!/\bstatus\b/.test(ERRORS_CODE), 'a domain error decides no status');
    for (const clientField of ['firebaseUid', 'userId', 'role', 'businessId', 'status', 'sessionId']) {
      assert.ok(!REQUEST_CODE.includes(clientField), `${clientField} must not be read on this path`);
    }
    assert.ok(REQUEST_CODE.includes('idToken?: unknown'), 'the input is idToken and nothing else');
  });
});

// ---------------------------------------------------------------------------
// Database — the lifecycle against real MongoDB
// ---------------------------------------------------------------------------

const dbOk = await ensureDb();

dbSuite('AUTH-04-B3 — request lifecycle against MongoDB', dbOk, () => {
  let uidSeq = 0;
  const uniqueUid = (label) => `auth04b3-${process.pid}-${label}-${++uidSeq}`;
  const COOLDOWN_MS = EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000;

  /** Installs a token payload for `uid` and runs one request, capturing output. */
  function request(uid, { email = USER_EMAIL, emailVerified = false } = {}) {
    setFakeFirebaseToken(tokenPayload({ uid, email, emailVerified }));
    return captureOutcome(() => requestEmailVerificationCode({ idToken: 'fake-id-token' }));
  }

  const rowFor = (uid) => EmailVerificationChallenge.findOne({ uid });
  const countFor = (uid) => EmailVerificationChallenge.countDocuments({ uid });

  /** Ages a challenge's cooldown anchor by `ms`, to reach past the window. */
  function ageCooldown(uid, ms) {
    return EmailVerificationChallenge.updateOne(
      { uid },
      { $set: { lastSentAt: new Date(Date.now() - ms) } }
    );
  }

  /** The stable, comparable parts of a challenge row. */
  async function snapshot(uid) {
    const row = await rowFor(uid);
    return {
      codeHmac: row.codeHmac,
      emailHmac: row.emailHmac,
      lastSentAt: row.lastSentAt.getTime(),
      expiresAt: row.expiresAt.getTime(),
      attempts: row.attempts,
      usedAt: row.usedAt,
    };
  }

  before(async () => {
    if (!dbOk) return;
    await EmailVerificationChallenge.ensureIndexes();
  });

  after(async () => {
    if (!dbOk) return;
    await EmailVerificationChallenge.deleteMany({ uid: /^auth04b3-/ });
    await disconnectDb();
  });

  it('mints, persists and delivers a code, and stores no plaintext', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('success');
        clearSentMessages();
        const { value, error, lines } = await request(uid, { email: 'Owner@Example.TEST' });

        assert.equal(error, null);
        assert.equal(value, undefined, 'success resolves with nothing');
        assert.equal(await countFor(uid), 1, 'exactly one challenge');

        const row = await rowFor(uid);
        assert.equal(row.attempts, 0);
        assert.equal(row.usedAt, null);
        // Both derive from one `now`, so the window is exact.
        assert.equal(
          row.expiresAt.getTime() - row.lastSentAt.getTime(),
          EMAIL_VERIFICATION_TTL_MINUTES * 60_000
        );

        assert.equal(sentMessages().length, 1);
        const message = sentMessages()[0];
        assert.equal(message.to, 'owner@example.test', 'the address is normalized before use');
        const code = codeFromMessage(message);

        // The exact correspondence: the digest in the row is the digest of the
        // digits that were emailed, nothing else.
        assert.equal(row.codeHmac, hashVerificationCode(VALID_PEPPER, code));
        assert.equal(row.emailHmac, hashVerificationEmail(VALID_PEPPER, 'owner@example.test'));
        assert.notEqual(row.codeHmac, code);

        // The raw document, bypassing Mongoose: nothing plaintext is stored.
        const raw = await EmailVerificationChallenge.collection.findOne({ _id: row._id });
        assert.deepEqual(
          Object.keys(raw).sort(),
          ['__v', '_id', 'attempts', 'codeHmac', 'createdAt', 'emailHmac', 'expiresAt', 'lastSentAt', 'updatedAt', 'uid', 'usedAt'].sort()
        );
        for (const value2 of Object.values(raw)) {
          assert.notEqual(value2, code, 'the plaintext code must not be stored');
          assert.notEqual(value2, 'owner@example.test', 'the plaintext email must not be stored');
          assert.notEqual(value2, VALID_PEPPER, 'the pepper must not be stored');
        }

        // AD-18: one event, and a record with nothing but its allowlisted fields.
        const records = logRecords(lines);
        const requested = records.filter((r) => r.type === EMAIL_VERIFICATION_LOG_EVENTS.CODE_REQUESTED);
        assert.equal(requested.length, 1);
        assert.deepEqual(Object.keys(requested[0]).sort(), ['level', 'message', 'ts', 'type']);
        assert.equal(records.filter((r) => r.type === EMAIL_VERIFICATION_LOG_EVENTS.FAILED).length, 0);
        for (const line of lines) {
          assert.ok(!line.includes(code));
          assert.ok(!line.includes('owner@example.test'));
          assert.ok(!line.includes(uid));
          assert.ok(!line.includes(VALID_PEPPER));
        }
      })
    );
  });

  it('supersedes in place: the same _id, with attempts and usedAt reset', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('supersede');
        clearSentMessages();
        assert.equal((await request(uid)).error, null);
        const first = await rowFor(uid);

        await EmailVerificationChallenge.updateOne(
          { uid },
          { $set: { attempts: 3, usedAt: new Date(Date.now() - 1_000) } }
        );
        await ageCooldown(uid, COOLDOWN_MS + 1_000);

        assert.equal((await request(uid)).error, null);
        const second = await rowFor(uid);

        assert.ok(second._id.equals(first._id), 'the same challenge row is reused');
        assert.equal(await countFor(uid), 1, 'never a second row');
        assert.equal(second.attempts, 0, 'AD-10: a fresh code resets the guess budget');
        assert.equal(second.usedAt, null, 'AD-10: the new challenge is live');
        assert.ok(second.lastSentAt.getTime() > first.lastSentAt.getTime());

        assert.equal(sentMessages().length, 2);
        const code = codeFromMessage(sentMessages()[1]);
        assert.equal(second.codeHmac, hashVerificationCode(VALID_PEPPER, code));
      })
    );
  });

  it('refuses a request inside the cooldown and leaves the row untouched', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('cooldown');
        clearSentMessages();
        assert.equal((await request(uid)).error, null);
        const before = await snapshot(uid);

        const { error, lines } = await request(uid);
        assert.ok(error instanceof EmailVerificationError);
        assert.equal(error.code, EMAIL_VERIFICATION_RATE_LIMITED);
        assert.ok(Number.isInteger(error.retryAfterSeconds));
        assert.ok(
          error.retryAfterSeconds >= 1 && error.retryAfterSeconds <= 60,
          `retryAfterSeconds out of range: ${error.retryAfterSeconds}`
        );

        assert.deepEqual(await snapshot(uid), before, 'the row must be byte-identical');
        assert.equal(sentMessages().length, 1, 'no second send');
        assert.equal(logRecords(lines).length, 0, 'a refusal is not a code request');
      })
    );
  });

  it('admits a challenge exactly one cooldown old, and refuses one a second younger', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const boundary = uniqueUid('boundary');
        const inside = uniqueUid('inside');
        clearSentMessages();
        assert.equal((await request(boundary)).error, null);
        assert.equal((await request(inside)).error, null);

        // Exactly 60s of age: the predicate is $lte, so this is admitted. The
        // comparison is against a floor computed from a `now` read at or after
        // this line, so it cannot flake the other way.
        await EmailVerificationChallenge.updateOne(
          { uid: boundary },
          { $set: { lastSentAt: new Date(Date.now() - COOLDOWN_MS) } }
        );
        // One second short of the window: refused with a one-second remainder.
        await EmailVerificationChallenge.updateOne(
          { uid: inside },
          { $set: { lastSentAt: new Date(Date.now() - (COOLDOWN_MS - 1_000)) } }
        );

        assert.equal((await request(boundary)).error, null, 'exactly one cooldown old is admitted');

        const refused = await request(inside);
        assert.equal(refused.error.code, EMAIL_VERIFICATION_RATE_LIMITED);
        assert.ok(refused.error.retryAfterSeconds >= 1 && refused.error.retryAfterSeconds <= 2);
      })
    );
  });

  it('converges two concurrent supersessions to one row and one send', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('race-stale');
        clearSentMessages();
        assert.equal((await request(uid)).error, null);
        await ageCooldown(uid, COOLDOWN_MS + 5_000);
        clearSentMessages();
        setFakeFirebaseToken(tokenPayload({ uid }));

        const { value: settled } = await captureOutcome(() =>
          Promise.allSettled([
            requestEmailVerificationCode({ idToken: 'a' }),
            requestEmailVerificationCode({ idToken: 'b' }),
          ])
        );

        const won = settled.filter((r) => r.status === 'fulfilled');
        const lost = settled.filter((r) => r.status === 'rejected');
        assert.equal(won.length, 1, 'exactly one request may supersede the row');
        assert.equal(lost.length, 1);
        assert.equal(lost[0].reason.code, EMAIL_VERIFICATION_RATE_LIMITED);
        assert.equal(await countFor(uid), 1, 'one row');
        assert.equal(sentMessages().length, 1, 'at most one send per cooldown window');
      })
    );
  });

  it('converges two concurrent first-time creations to one row and one send', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('race-create');
        clearSentMessages();
        assert.equal(await countFor(uid), 0);
        setFakeFirebaseToken(tokenPayload({ uid }));

        const { value: settled } = await captureOutcome(() =>
          Promise.allSettled([
            requestEmailVerificationCode({ idToken: 'a' }),
            requestEmailVerificationCode({ idToken: 'b' }),
          ])
        );

        const won = settled.filter((r) => r.status === 'fulfilled');
        const lost = settled.filter((r) => r.status === 'rejected');
        assert.equal(won.length, 1, 'the unique uid index lets exactly one insert win');
        assert.equal(lost.length, 1);
        assert.equal(lost[0].reason.code, EMAIL_VERIFICATION_RATE_LIMITED);
        assert.equal(await countFor(uid), 1, 'one row');
        assert.equal(sentMessages().length, 1, 'one send');
      })
    );
  });

  it('leaves the new challenge current after a delivery failure, and cooldown-refuses a retry', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('mailfail');
        clearSentMessages();
        setFakeMailScenario(fakeMailFailure('provider down'));
        setFakeFirebaseToken(tokenPayload({ uid }));

        const { error, lines } = await captureOutcome(() =>
          requestEmailVerificationCode({ idToken: 'tok' })
        );
        assert.ok(error instanceof EmailVerificationError);
        assert.equal(error.code, EMAIL_VERIFICATION_MAIL_FAILED);

        // NO ROLLBACK: the challenge that was minted is the current one.
        const row = await rowFor(uid);
        assert.ok(row, 'the challenge must not be rolled back');
        assert.equal(row.usedAt, null);
        assert.equal(row.attempts, 0);
        const delivered = sentMessages()[0];
        assert.equal(row.codeHmac, hashVerificationCode(VALID_PEPPER, codeFromMessage(delivered)));

        const records = logRecords(lines);
        assert.equal(
          records.filter((r) => r.type === EMAIL_VERIFICATION_LOG_EVENTS.CODE_REQUESTED).length,
          1
        );
        const failed = records.filter((r) => r.type === EMAIL_VERIFICATION_LOG_EVENTS.FAILED);
        assert.equal(failed.length, 1);
        assert.equal(failed[0].reason, 'mail_delivery_failure');
        assert.deepEqual(Object.keys(failed[0]).sort(), ['level', 'message', 'reason', 'ts', 'type']);
        for (const line of lines) {
          assert.ok(!line.includes(uid));
          assert.ok(!line.includes('owner@example.test'));
          assert.ok(!line.includes(VALID_PEPPER));
          assert.ok(!line.includes('provider down'), 'the provider message must not be relayed');
        }

        // The cooldown stays active: an immediate retry is refused, not sent.
        setFakeMailScenario(null);
        clearSentMessages();
        const retry = await captureOutcome(() => requestEmailVerificationCode({ idToken: 'tok' }));
        assert.equal(retry.error.code, EMAIL_VERIFICATION_RATE_LIMITED);
        assert.equal(sentMessages().length, 0, 'the failed send must not be immediately repeated');
      })
    );
  });

  it('leaves an existing challenge untouched when the flow is unconfigured', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('unconfigured');
        clearSentMessages();
        assert.equal((await request(uid)).error, null);
        const before = await snapshot(uid);

        await withEnv(configuredEnv({ [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: undefined }), async () => {
          const { error } = await captureOutcome(() => requestEmailVerificationCode({ idToken: 'tok' }));
          assert.equal(error.code, EMAIL_VERIFICATION_NOT_CONFIGURED);
        });
        await withEnv(configuredEnv({ MAIL_PROVIDER: undefined }), async () => {
          const { error } = await captureOutcome(() => requestEmailVerificationCode({ idToken: 'tok' }));
          assert.equal(error.code, EMAIL_VERIFICATION_NOT_CONFIGURED);
        });

        assert.deepEqual(await snapshot(uid), before, 'neither gate may touch the challenge');
        assert.equal(sentMessages().length, 1, 'no second send');
      })
    );
  });

  it('treats each Firebase uid independently', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const a = uniqueUid('iso-a');
        const b = uniqueUid('iso-b');
        clearSentMessages();
        assert.equal((await request(a)).error, null);
        // b is not subject to a's cooldown.
        assert.equal((await request(b)).error, null);
        assert.equal(await countFor(a), 1);
        assert.equal(await countFor(b), 1);
        assert.equal(sentMessages().length, 2);

        const bRow = await snapshot(b);
        assert.equal((await request(a)).error.code, EMAIL_VERIFICATION_RATE_LIMITED);
        assert.deepEqual(await snapshot(b), bRow, 'a refusal for one uid cannot affect another');
      })
    );
  });

  it('is a no-op for an already-verified identity, even with a live challenge', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('verified');
        clearSentMessages();
        assert.equal((await request(uid)).error, null);
        const before = await snapshot(uid);
        clearSentMessages();

        const { value, error, lines } = await request(uid, { emailVerified: true });
        assert.equal(error, null);
        assert.equal(value, undefined);
        assert.equal(sentMessages().length, 0);
        assert.deepEqual(await snapshot(uid), before);
        assert.equal(logRecords(lines).length, 0, 'the no-op emits no event');
      })
    );
  });

  it('removes both seams in a finally, even when the body’s request fails', async () => {
    assert.equal(hasCustomFirebaseIdTokenVerifier(), false, 'no seam may be installed here');

    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('seam');
        clearSentMessages();
        setFakeMailScenario(fakeMailFailure());
        setFakeFirebaseToken(tokenPayload({ uid }));
        const { error } = await captureOutcome(() => requestEmailVerificationCode({ idToken: 'tok' }));
        assert.equal(error.code, EMAIL_VERIFICATION_MAIL_FAILED);
        assert.equal(hasCustomFirebaseIdTokenVerifier(), true, 'the seam is installed inside the body');
        assert.ok(registeredProviders().includes(FAKE_MAIL_PROVIDER));
      })
    );

    assert.equal(hasCustomFirebaseIdTokenVerifier(), false, 'the verifier seam was removed');
    assert.ok(
      !registeredProviders().includes(FAKE_MAIL_PROVIDER),
      'the mail seam was removed'
    );
  });
});
