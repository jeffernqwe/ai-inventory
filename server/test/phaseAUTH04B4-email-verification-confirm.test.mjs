// AUTH-04-B4 — the email-verification challenge CONFIRM lifecycle.
//
// One operation, `confirmEmailVerificationCode({ idToken, code })`, and this suite
// pins the properties that make it safe:
//
//   * THE STEP ORDER IS THE DESIGN. The Firebase ID token is verified first and
//     its errors propagate UNCHANGED; an already-verified identity short-circuits
//     to success before the configuration question and before ANY database work;
//     a blank code is refused before any database work; the pepper gate precedes
//     the reservation; the attempt is reserved before the digest is compared; and
//     the Firebase write precedes the consume (AD-12).
//   * THE ATTEMPT IS THE BUDGET. A wrong code SPENDS an attempt; a reservation
//     miss (absent, used, expired, exhausted) is ONE indistinguishable refusal.
//   * THE CONSUME IS NON-FATAL. `{ _id, usedAt: null }` and `$set: { usedAt: now }`,
//     never bound to `codeHmac`; a miss is the intentional AD-13 concurrency result.
//   * `usedAt` IS NEVER UNSET, and `attempts` is never compensated on a Firebase
//     failure — so the same code stays retryable and a spent challenge stays spent.
//   * AD-18 LOGGING IS BY ALLOWLIST with closed-set reasons: no uid, email, code,
//     Hmac, pepper, ID token or upstream provider message is ever in a record.
//   * NO AUDIT ROW IS WRITTEN — no tenant exists at confirmation time.
//
// Registered MIXED in run-tests.mjs: the error-propagation, pre-flight, boundary
// and source-guard cases need no database; the lifecycle, concurrency and
// persistence cases need MongoDB.

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
import {
  registerFakeFirebaseUserUpdater,
  deregisterFakeFirebaseUserUpdater,
  setFakeFirebaseUserRecord,
  setFakeFirebaseUpdateFailure,
  fakeUserRecord,
  updatedUids,
  clearUpdatedUids,
} from './fakes/firebaseUserUpdater.mjs';

import { hasCustomFirebaseIdTokenVerifier } from '../src/services/firebase/tokenVerifier.ts';
import { hasCustomFirebaseUserUpdater } from '../src/services/firebase/userUpdater.ts';

import { confirmEmailVerificationCode } from '../src/services/emailVerification/confirm.ts';
import { confirmEmailVerificationCode as boundaryConfirm } from '../src/services/emailVerification/index.ts';
import { EmailVerificationError } from '../src/services/emailVerification/errors.ts';
import {
  hashVerificationCode,
  hashVerificationEmail,
} from '../src/services/emailVerification/code.ts';

import {
  EMAIL_VERIFICATION_LOG_EVENTS,
  EMAIL_VERIFICATION_MAX_ATTEMPTS,
  EMAIL_VERIFICATION_NOT_CONFIGURED,
  EMAIL_VERIFICATION_TTL_MINUTES,
  INVALID_VERIFICATION_CODE,
} from '../src/constants/emailVerification.ts';
import { EMAIL_VERIFICATION_CODE_PEPPER_ENV } from '../src/config/emailVerification.ts';
import {
  FirebaseNotConfigured,
  FirebaseTokenError,
  FirebaseUnavailableError,
  FIREBASE_NOT_CONFIGURED,
  FIREBASE_TOKEN_INVALID,
  FIREBASE_UNAVAILABLE,
} from '../src/services/firebase/firebaseErrors.ts';
import EmailVerificationChallenge from '../src/models/emailVerificationChallenge.model.ts';
import AuditLog from '../src/models/auditLog.model.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A valid pepper comfortably over the minimum, and obviously a test value. */
const VALID_PEPPER = 'inventory-ai-auth04b4-test-pepper-value';

/** A second, equally valid pepper — for proving the digest is keyed. */
const OTHER_PEPPER = 'inventory-ai-auth04b4-other-pepper-value';

const USER_EMAIL = 'owner@inventory-ai.test';

/** The digits a seeded challenge is minted for. */
const CODE = '246810';

/** A code that cannot match `CODE` and is not a truncation of it. */
const WRONG_CODE = '135790';

/** Built once: generating an RSA key per case would only slow the suite down. */
const FIREBASE_JSON = fakeServiceAccountJson();

/** Every environment variable this lifecycle reads; all others are cleared. */
const ENV_KEYS = [
  EMAIL_VERIFICATION_CODE_PEPPER_ENV,
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
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

/** Registers the two Firebase seams, and removes them in a `finally`. */
async function withSeams({ verifier = true, updater = true } = {}, fn) {
  if (verifier) registerFakeFirebaseVerifier();
  if (updater) registerFakeFirebaseUserUpdater();
  try {
    return await fn();
  } finally {
    if (verifier) deregisterFakeFirebaseVerifier();
    if (updater) deregisterFakeFirebaseUserUpdater();
  }
}

/** A fully configured server: a usable pepper and a Firebase service account. */
function configuredEnv(extra = {}) {
  return {
    [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: VALID_PEPPER,
    FIREBASE_SERVICE_ACCOUNT_JSON: FIREBASE_JSON,
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

/** The records of one event type. */
function recordsOfType(lines, type) {
  return logRecords(lines).filter((record) => record.type === type);
}

// ---------------------------------------------------------------------------
// Unit — Firebase verification errors propagate unchanged (step 2)
// ---------------------------------------------------------------------------

unitSuite('AUTH-04-B4 — Firebase errors propagate unchanged', () => {
  it('rejects a missing or empty idToken with the verifier\u2019s own error', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        for (const idToken of [undefined, null, '', '   ', 42]) {
          const { error } = await captureOutcome(() =>
            confirmEmailVerificationCode({ idToken, code: CODE })
          );
          assert.ok(error instanceof FirebaseTokenError, `expected FirebaseTokenError for ${String(idToken)}`);
          assert.equal(error.code, FIREBASE_TOKEN_INVALID);
          assert.equal(error.reason, 'missing-token');
          assert.ok(!(error instanceof EmailVerificationError), 'the verifier error must not be remapped');
        }
        assert.equal(updatedUids().length, 0, 'no Firebase write may be attempted without an identity');
      })
    );
  });

  it('propagates an expired, an invalid and a revoked token unchanged', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        for (const reason of ['auth/id-token-expired', 'auth/invalid-credential', 'auth/id-token-revoked']) {
          setFakeFirebaseFailure(reason);
          const { error } = await captureOutcome(() =>
            confirmEmailVerificationCode({ idToken: 'tok', code: CODE })
          );
          assert.ok(error instanceof FirebaseTokenError, `expected a token error for ${reason}`);
          assert.equal(error.code, FIREBASE_TOKEN_INVALID);
          assert.equal(error.reason, reason, 'the classified reason must survive unchanged');
        }
        assert.equal(updatedUids().length, 0);
      })
    );
  });

  it('propagates an unconfigured Firebase before the flow\u2019s own config gate', async () => {
    await withEnv({}, () =>
      withSeams({ verifier: false }, async () => {
        const { error } = await captureOutcome(() =>
          confirmEmailVerificationCode({ idToken: 'a.b.c', code: CODE })
        );
        assert.ok(error instanceof FirebaseNotConfigured, 'expected FirebaseNotConfigured');
        assert.equal(error.code, FIREBASE_NOT_CONFIGURED);
        assert.ok(!(error instanceof EmailVerificationError), 'no flow error may replace it');
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Unit — pre-flight: short-circuit, code normalization, configuration
// ---------------------------------------------------------------------------

unitSuite('AUTH-04-B4 — pre-flight contract', () => {
  it('returns immediately for an already-verified identity, with nothing configured', async () => {
    // The strongest form of AD-14: NO pepper and NO Firebase config. If the
    // short-circuit sat after either the config gate or any database work this
    // would fail instead of resolving.
    await withEnv({}, () =>
      withSeams({}, async () => {
        setFakeFirebaseToken(tokenPayload({ uid: 'auth04b4-unit-verified', emailVerified: true }));
        const { value, error, lines } = await captureOutcome(() =>
          confirmEmailVerificationCode({ idToken: 'tok', code: CODE })
        );
        assert.equal(error, null, 'an already-verified identity must not fail on configuration');
        assert.equal(value, undefined, 'the short-circuit returns nothing');
        assert.equal(updatedUids().length, 0, 'no Firebase write may be attempted');
        assert.equal(lines.join(''), '', 'the no-op logs nothing');
      })
    );
  });

  it('short-circuits before the code is even considered', async () => {
    // Pins the ordering of the short-circuit above step 4: a blank code would
    // otherwise be a refusal.
    await withEnv({}, () =>
      withSeams({}, async () => {
        setFakeFirebaseToken(tokenPayload({ uid: 'auth04b4-unit-verified-blank', emailVerified: true }));
        for (const code of ['', null, undefined, '   ']) {
          const { value, error } = await captureOutcome(() =>
            confirmEmailVerificationCode({ idToken: 'tok', code })
          );
          assert.equal(error, null, `an already-verified identity must succeed with code ${String(code)}`);
          assert.equal(value, undefined);
        }
        assert.equal(updatedUids().length, 0);
      })
    );
  });

  it('refuses a blank or non-string code with the one code failure', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        setFakeFirebaseToken(tokenPayload({ uid: 'auth04b4-unit-blank' }));
        const messages = new Set();
        for (const code of ['', '   ', null, undefined, 42, {}, []]) {
          const { error } = await captureOutcome(() =>
            confirmEmailVerificationCode({ idToken: 'tok', code })
          );
          assert.ok(error instanceof EmailVerificationError, `expected a flow error for ${String(code)}`);
          assert.equal(error.code, INVALID_VERIFICATION_CODE);
          assert.ok(typeof error.message === 'string' && error.message.length > 0);
          messages.add(error.message);
        }
        // One message for every shape of a blank code, so nothing is disclosed.
        assert.equal(messages.size, 1, 'the refusal message must not vary');
        assert.equal(updatedUids().length, 0, 'a blank code must not reach Firebase');
      })
    );
  });

  it('refuses with EMAIL_VERIFICATION_NOT_CONFIGURED when the pepper is unusable', async () => {
    await withEnv(configuredEnv({ [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: undefined }), () =>
      withSeams({}, async () => {
        setFakeFirebaseToken(tokenPayload({ uid: 'auth04b4-unit-nopepper' }));
        const { error, lines } = await captureOutcome(() =>
          confirmEmailVerificationCode({ idToken: 'tok', code: CODE })
        );
        assert.ok(error instanceof EmailVerificationError);
        assert.equal(error.code, EMAIL_VERIFICATION_NOT_CONFIGURED);
        assert.ok(!error.message.includes(EMAIL_VERIFICATION_CODE_PEPPER_ENV), 'no variable name may be echoed');
        assert.equal(updatedUids().length, 0);
        assert.equal(lines.join(''), '', 'no code was compared, so no event is emitted');
      })
    );
  });

  it('exposes the operation through the service boundary', () => {
    assert.equal(typeof boundaryConfirm, 'function');
    assert.equal(boundaryConfirm, confirmEmailVerificationCode, 'one implementation, not a copy');
  });
});

// ---------------------------------------------------------------------------
// Unit — source guards (mechanism, not behaviour)
// ---------------------------------------------------------------------------

const CONFIRM_SRC = readSource(new URL('../src/services/emailVerification/confirm.ts', import.meta.url));
const FIREBASE_AUTH_SRC = readSource(new URL('../src/services/firebaseAuth.service.ts', import.meta.url));

/** The same source with comments removed, so prose cannot satisfy a guard. */
function codeOnly(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

const CONFIRM_CODE = codeOnly(CONFIRM_SRC);

/** Every `findOneAndUpdate(...)` call body, parens balanced for the call shape used. */
function findOneAndUpdateCalls(text) {
  const calls = [];
  let index = text.indexOf('findOneAndUpdate(');
  while (index >= 0) {
    const start = text.indexOf('(', index);
    let depth = 0;
    let end = -1;
    for (let i = start; i < text.length; i += 1) {
      if (text[i] === '(') depth += 1;
      else if (text[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) break;
    calls.push(text.slice(start, end + 1));
    index = text.indexOf('findOneAndUpdate(', end);
  }
  return calls;
}

unitSuite('AUTH-04-B4 — source guards', () => {
  it('runs the locked steps in order', () => {
    const order = [
      'new Date()',
      'verifyFirebaseIdToken(',
      'identity.emailVerified === true',
      "typeof code === 'string'",
      'isEmailVerificationConfigured(',
      'findOneAndUpdate(',
      'verificationHmacMatches(',
      'updateFirebaseUserEmailVerified(',
      'logCompleted();',
    ];
    const positions = order.map((needle) => {
      const at = CONFIRM_CODE.indexOf(needle);
      assert.ok(at >= 0, `confirm.ts must contain ${needle}`);
      return at;
    });
    for (let i = 1; i < positions.length; i += 1) {
      assert.ok(
        positions[i] > positions[i - 1],
        `${order[i]} must follow ${order[i - 1]} in the source`
      );
    }
  });

  it('reserves an attempt with the locked AD-11 predicate and nothing else', () => {
    const [reservation] = findOneAndUpdateCalls(CONFIRM_CODE);
    assert.ok(reservation, 'a reservation call must exist');
    for (const required of ['uid: identity.uid', 'usedAt: null', 'expiresAt:', 'attempts:']) {
      assert.ok(reservation.includes(required), `the reservation must filter on ${required}`);
    }
    assert.ok(reservation.includes('$lt: EMAIL_VERIFICATION_MAX_ATTEMPTS'), 'the cap must come from the constant');
    assert.ok(/\$inc:\s*\{\s*attempts:\s*1\s*\}/.test(reservation), 'the only effect is one increment');
    assert.ok(!reservation.includes('$set'), 'the reservation must not set anything');
  });

  it('consumes with the literal AD-12 predicate, never bound to codeHmac', () => {
    const calls = findOneAndUpdateCalls(CONFIRM_CODE);
    assert.equal(calls.length, 2, 'exactly two conditional writes are expected');
    const consume = calls[1];
    assert.ok(/\{\s*_id:\s*reserved\._id,\s*usedAt:\s*null\s*\}/.test(consume), 'the locked predicate');
    assert.ok(!consume.includes('codeHmac'), 'the consume predicate must NOT be bound to the digest');
    assert.ok(/\$set:\s*\{\s*usedAt:\s*now\s*\}/.test(consume), 'the consume sets usedAt to the one `now`');
    assert.ok(!/\$unset/.test(CONFIRM_CODE), 'nothing may unset a field');
  });

  it('never compares emailHmac, and never uses an unkeyed digest', () => {
    assert.ok(!CONFIRM_CODE.includes('emailHmac'), 'the address digest is not a confirmation key');
    assert.ok(!CONFIRM_CODE.includes('createHash'), 'the digest must stay keyed');
    assert.ok(!CONFIRM_CODE.includes('Math.random'));
  });

  it('logs nothing itself, and only through the allowlisted events', () => {
    assert.ok(!CONFIRM_CODE.includes('console.'), 'confirm.ts must not use the console directly');
    assert.ok(CONFIRM_CODE.includes('EMAIL_VERIFICATION_LOG_EVENTS.COMPLETED'));
    assert.ok(CONFIRM_CODE.includes('EMAIL_VERIFICATION_LOG_EVENTS.FAILED'));
    assert.ok(CONFIRM_CODE.includes('EMAIL_VERIFICATION_LOG_EVENTS.BRIDGE_FAILED'));
    assert.ok(
      !CONFIRM_CODE.includes('EMAIL_VERIFICATION_LOG_EVENTS.CODE_REQUESTED'),
      'the request path owns that event'
    );
  });

  it('keeps every logged field identifier free of secret material', () => {
    // The OBJECT literal handed to the logger, so a word inside the human copy
    // (which legitimately contains "code") cannot satisfy or break the guard.
    const bodies = CONFIRM_CODE.match(/log(?:Info|Error)\(\{[\s\S]*?\}\)/g) ?? [];
    assert.equal(bodies.length, 3, 'exactly three log call sites are expected');
    // The reason is passed as an identifier, never interpolated from a value.
    assert.ok(!CONFIRM_CODE.includes('`${reason}'), 'a reason must not be interpolated into a message');
    const banned = /\b(uid|code|pepper|idToken|token|codeHmac|emailHmac|businessId|email)\b/;
    for (const body of bodies) {
      const identifiers = body
        .replace(/'[^']*'/g, "''")
        .replace(/"[^"]*"/g, '""')
        .replace(/`[^`]*`/g, '``');
      const match = banned.exec(identifiers);
      assert.equal(match, null, `a log record must not carry ${match && match[0]}: ${identifiers}`);
    }
  });

  it('declares a fixed, closed set of failure reasons', () => {
    const expected = [
      'blank_code',
      'invalid_code',
      'firebase_token_invalid',
      'firebase_not_configured',
      'firebase_unavailable',
      'firebase_unknown',
    ];
    const block = CONFIRM_CODE.slice(
      CONFIRM_CODE.indexOf('FAILURE_REASONS = Object.freeze({'),
      CONFIRM_CODE.indexOf('});', CONFIRM_CODE.indexOf('FAILURE_REASONS = Object.freeze({'))
    );
    for (const reason of expected) {
      assert.ok(block.includes(`'${reason}'`), `${reason} must be a declared reason`);
    }
    // A reason is never written inline at a call site: every one comes from the
    // frozen set, so a log record cannot carry a value.
    assert.ok(!/reason:\s*['"]/.test(CONFIRM_CODE), 'reasons must come from the frozen set');
    assert.ok(!CONFIRM_CODE.includes('String(err'), 'an upstream message must not be stringified');
  });

  it('writes no audit row, and cannot: no tenant exists yet', () => {
    assert.ok(!CONFIRM_CODE.includes('recordAudit'));
    assert.ok(!CONFIRM_CODE.includes('AUDIT_ACTIONS'));
    assert.ok(!CONFIRM_CODE.includes('businessId'));
  });

  it('uses no transaction, no lock, no new index and no upsert', () => {
    for (const forbidden of ['upsert', 'startSession', 'withTransaction', 'ensureIndexes', '.index(']) {
      assert.ok(!CONFIRM_CODE.includes(forbidden), `confirm.ts must not use ${forbidden}`);
    }
  });

  it('decides no HTTP status and reads no identity from a request body', () => {
    assert.ok(!/\bstatus\b/.test(CONFIRM_CODE), 'the domain layer decides no status');
    assert.ok(!CONFIRM_CODE.includes('ApiError'), 'no transport error may be constructed here');
    for (const clientField of ['firebaseUid', 'userId', 'role', 'sessionId', 'status']) {
      assert.ok(!CONFIRM_CODE.includes(clientField), `${clientField} must not be read on this path`);
    }
    assert.ok(CONFIRM_CODE.includes('idToken?: unknown'), 'the input is idToken');
    assert.ok(CONFIRM_CODE.includes('code?: unknown'), 'and code, and nothing else');
  });

  it('is fail-closed on the verified claim, and preserves the two existing gates', () => {
    assert.ok(CONFIRM_CODE.includes('identity.emailVerified === true'));
    assert.ok(!CONFIRM_CODE.includes('emailVerified !== false'), 'must not admit a non-boolean claim');
    const gates = FIREBASE_AUTH_SRC.match(/emailVerified !== true/g) ?? [];
    assert.equal(gates.length, 2, 'firebaseAuth.service.ts must keep exactly its two gates');
  });
});

// ---------------------------------------------------------------------------
// Database — the confirm lifecycle against real MongoDB
// ---------------------------------------------------------------------------

const dbOk = await ensureDb();

const TTL_MS = EMAIL_VERIFICATION_TTL_MINUTES * 60_000;

/** No identifier or credential of a case may appear in any captured log line. */
function assertNoSecrets(lines, { uid, code } = {}) {
  const secrets = [uid, code, USER_EMAIL, VALID_PEPPER, OTHER_PEPPER].filter(Boolean);
  for (const line of lines) {
    for (const secret of secrets) {
      assert.ok(!line.includes(secret), `a log line must never carry ${secret}: ${line}`);
    }
  }
}

dbSuite('AUTH-04-B4 — confirm lifecycle against MongoDB', dbOk, () => {
  let uidSeq = 0;
  const uniqueUid = (label) => `auth04b4-${process.pid}-${label}-${++uidSeq}`;

  /**
   * Seeds a challenge directly, so the confirm suite never depends on the mail
   * seam or on the request path. `lastSentAt` and `expiresAt` derive from ONE
   * instant, so their distance is exactly the TTL.
   */
  async function seedChallenge({ uid, code = CODE, expiresInMs = TTL_MS, attempts = 0, usedAt = null }) {
    const now = new Date();
    return EmailVerificationChallenge.create({
      uid,
      codeHmac: hashVerificationCode(VALID_PEPPER, code),
      emailHmac: hashVerificationEmail(VALID_PEPPER, USER_EMAIL),
      lastSentAt: now,
      expiresAt: new Date(now.getTime() + expiresInMs),
      attempts,
      usedAt,
    });
  }

  function confirmCall(uid, code, { emailVerified = false } = {}) {
    setFakeFirebaseToken(tokenPayload({ uid, emailVerified }));
    return confirmEmailVerificationCode({ idToken: 'fake-id-token', code });
  }

  function confirm(uid, code, options) {
    return captureOutcome(() => confirmCall(uid, code, options));
  }

  const rowFor = (uid) => EmailVerificationChallenge.findOne({ uid });

  before(async () => {
    if (!dbOk) return;
    await EmailVerificationChallenge.ensureIndexes();
  });

  after(async () => {
    if (!dbOk) return;
    await EmailVerificationChallenge.deleteMany({ uid: /^auth04b4-/ });
    await disconnectDb();
  });

  it('accepts the correct code: one attempt spent, usedAt stamped, one Firebase write', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('ok');
        await seedChallenge({ uid });
        clearUpdatedUids();

        const { value, error, lines } = await confirm(uid, CODE);
        assert.equal(error, null);
        assert.equal(value, undefined, 'success resolves with nothing');
        assert.deepEqual(updatedUids(), [uid], 'the VERIFIED uid is the one written');

        const row = await rowFor(uid);
        assert.equal(row.attempts, 1, 'exactly one attempt was spent');
        assert.ok(row.usedAt instanceof Date, 'the challenge was consumed');
        assert.equal(row.codeHmac, hashVerificationCode(VALID_PEPPER, CODE), 'the digest is untouched');
        assert.equal(row.expiresAt.getTime() - row.lastSentAt.getTime(), TTL_MS);

        const completed = recordsOfType(lines, EMAIL_VERIFICATION_LOG_EVENTS.COMPLETED);
        assert.equal(completed.length, 1);
        assert.deepEqual(Object.keys(completed[0]).sort(), ['level', 'message', 'ts', 'type']);
        assert.equal(recordsOfType(lines, EMAIL_VERIFICATION_LOG_EVENTS.FAILED).length, 0);
        assert.equal(recordsOfType(lines, EMAIL_VERIFICATION_LOG_EVENTS.BRIDGE_FAILED).length, 0);
        assertNoSecrets(lines, { uid, code: CODE });
      })
    );
  });

  it('spends an attempt on a wrong code and leaves usedAt null', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('wrong');
        await seedChallenge({ uid });
        clearUpdatedUids();

        const { error, lines } = await confirm(uid, WRONG_CODE);
        assert.ok(error instanceof EmailVerificationError);
        assert.equal(error.code, INVALID_VERIFICATION_CODE);
        assert.equal(updatedUids().length, 0, 'a wrong code must not reach Firebase');

        const row = await rowFor(uid);
        assert.equal(row.attempts, 1, 'the attempt is spent even though the code was wrong');
        assert.equal(row.usedAt, null, 'a wrong code never consumes the challenge');

        const failed = recordsOfType(lines, EMAIL_VERIFICATION_LOG_EVENTS.FAILED);
        assert.equal(failed.length, 1);
        assert.equal(failed[0].reason, 'invalid_code');
        assert.deepEqual(Object.keys(failed[0]).sort(), ['level', 'message', 'reason', 'ts', 'type']);
        assert.equal(recordsOfType(lines, EMAIL_VERIFICATION_LOG_EVENTS.COMPLETED).length, 0);
        assertNoSecrets(lines, { uid, code: WRONG_CODE });
      })
    );
  });

  it('answers absent, used, expired and exhausted challenges with ONE indistinguishable code', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const cases = {
          absent: null,
          used: { usedAt: new Date() },
          expired: { expiresInMs: -1_000 },
          exhausted: { attempts: EMAIL_VERIFICATION_MAX_ATTEMPTS },
        };
        const messages = new Set();

        for (const [label, options] of Object.entries(cases)) {
          const uid = uniqueUid(`miss-${label}`);
          if (options) await seedChallenge({ uid, ...options });
          clearUpdatedUids();

          const { error } = await confirm(uid, CODE);
          assert.ok(error instanceof EmailVerificationError, `expected a flow error for ${label}`);
          assert.equal(error.code, INVALID_VERIFICATION_CODE, label);
          assert.equal(updatedUids().length, 0, `${label} must not reach Firebase`);
          messages.add(error.message);

          // A miss never increments: the reservation simply did not match.
          if (label === 'used') assert.equal((await rowFor(uid)).attempts, 0);
          if (label === 'exhausted') {
            assert.equal((await rowFor(uid)).attempts, EMAIL_VERIFICATION_MAX_ATTEMPTS);
          }
        }

        assert.equal(messages.size, 1, 'the four refusals must be textually identical');
      })
    );
  });

  it('admits the fifth submission and refuses the sixth', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const allowed = uniqueUid('attempts-4');
        await seedChallenge({ uid: allowed, attempts: EMAIL_VERIFICATION_MAX_ATTEMPTS - 1 });
        assert.equal((await confirm(allowed, CODE)).error, null, 'one below the cap must be admitted');
        assert.equal((await rowFor(allowed)).attempts, EMAIL_VERIFICATION_MAX_ATTEMPTS);

        const refused = uniqueUid('attempts-5');
        await seedChallenge({ uid: refused, attempts: EMAIL_VERIFICATION_MAX_ATTEMPTS });
        const { error } = await confirm(refused, CODE);
        assert.equal(error.code, INVALID_VERIFICATION_CODE, 'at the cap must be refused');
        const row = await rowFor(refused);
        assert.equal(row.attempts, EMAIL_VERIFICATION_MAX_ATTEMPTS, 'a refused submission does not increment');
        assert.equal(row.usedAt, null);
      })
    );
  });

  it('admits an unexpired challenge and refuses an expired one', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const live = uniqueUid('expiry-live');
        await seedChallenge({ uid: live, expiresInMs: 60_000 });
        assert.equal((await confirm(live, CODE)).error, null);

        const dead = uniqueUid('expiry-dead');
        await seedChallenge({ uid: dead, expiresInMs: -1_000 });
        const { error } = await confirm(dead, CODE);
        assert.equal(error.code, INVALID_VERIFICATION_CODE, 'an expired challenge must be refused');
        const row = await rowFor(dead);
        assert.equal(row.attempts, 0, 'an expired challenge spends no attempt');
        assert.equal(row.usedAt, null);
      })
    );
  });

  it('matches the stored digest only for the exact code under the CURRENT pepper', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('digest');
        await seedChallenge({ uid });

        // A different pepper means a different digest: same code, still refused.
        await withEnv(configuredEnv({ [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: OTHER_PEPPER }), async () => {
          const { error } = await confirm(uid, CODE);
          assert.equal(error.code, INVALID_VERIFICATION_CODE, 'the digest is keyed by the pepper');
        });
        const afterMismatch = await rowFor(uid);
        assert.equal(afterMismatch.attempts, 1, 'a mismatched digest still spends its attempt');
        assert.equal(afterMismatch.usedAt, null);

        // The right pepper and the right code then succeed.
        assert.equal((await confirm(uid, CODE)).error, null);
        const row = await rowFor(uid);
        assert.equal(row.attempts, 2);
        assert.ok(row.usedAt instanceof Date);
      })
    );
  });

  it('lets two concurrent valid confirmations both succeed with one usedAt transition', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('race-valid');
        await seedChallenge({ uid });
        clearUpdatedUids();
        setFakeFirebaseToken(tokenPayload({ uid }));

        const { value: settled, lines } = await captureOutcome(() =>
          Promise.allSettled([
            confirmEmailVerificationCode({ idToken: 'a', code: CODE }),
            confirmEmailVerificationCode({ idToken: 'b', code: CODE }),
          ])
        );

        const won = settled.filter((r) => r.status === 'fulfilled');
        const lost = settled.filter((r) => r.status === 'rejected');
        assert.ok(won.length >= 1, 'at least one confirmation must succeed');
        for (const result of lost) {
          assert.equal(result.reason.code, INVALID_VERIFICATION_CODE, 'only an already-consumed challenge may lose');
        }

        const row = await rowFor(uid);
        // AD-13: `usedAt` transitions exactly once. Only the winner's consume
        // matches `{ _id, usedAt: null }`; the loser's miss is not an error, and
        // no branch unsets or moves the stamp.
        assert.ok(row.usedAt instanceof Date, 'the challenge was consumed');
        // Every success spent exactly one attempt; a reservation miss spends none.
        assert.equal(row.attempts, won.length, 'one attempt per successful confirmation');
        assert.equal(updatedUids().length, won.length, 'one idempotent write per success');
        assert.equal(
          recordsOfType(lines, EMAIL_VERIFICATION_LOG_EVENTS.COMPLETED).length,
          won.length
        );
      })
    );
  });

  it('spends its own attempt on a concurrent invalid confirmation', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('race-mixed');
        await seedChallenge({ uid });
        clearUpdatedUids();
        setFakeFirebaseToken(tokenPayload({ uid }));

        const { value: settled, lines } = await captureOutcome(() =>
          Promise.allSettled([
            confirmEmailVerificationCode({ idToken: 'a', code: CODE }),
            confirmEmailVerificationCode({ idToken: 'b', code: WRONG_CODE }),
          ])
        );

        const won = settled.filter((r) => r.status === 'fulfilled');
        const lost = settled.filter((r) => r.status === 'rejected');
        assert.equal(won.length, 1, 'only the correct code may succeed');
        assert.equal(lost.length, 1);
        assert.equal(lost[0].reason.code, INVALID_VERIFICATION_CODE);

        const row = await rowFor(uid);
        // Both reservations are dispatched before either resolves, so both spend
        // an attempt — the invalid one on its own behalf.
        assert.equal(row.attempts, 2, 'the invalid submission consumes its own attempt');
        assert.ok(row.usedAt instanceof Date);
        assert.equal(updatedUids().length, 1);
        const failed = recordsOfType(lines, EMAIL_VERIFICATION_LOG_EVENTS.FAILED);
        assert.equal(failed.length, 1);
        assert.equal(failed[0].reason, 'invalid_code');
      })
    );
  });

  it('propagates an Admin failure, leaves usedAt null, and keeps the same code retryable', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('admin-fail');
        await seedChallenge({ uid });
        clearUpdatedUids();
        setFakeFirebaseUpdateFailure('auth/internal-error');

        const first = await confirm(uid, CODE);
        assert.ok(first.error instanceof FirebaseUnavailableError, 'a transient Admin failure stays transient');
        assert.equal(first.error.code, FIREBASE_UNAVAILABLE);

        let row = await rowFor(uid);
        assert.equal(row.attempts, 1, 'the attempt is spent (OD-4: no compensation)');
        assert.equal(row.usedAt, null, 'usedAt must NOT be set when the Firebase write fails');

        const bridge = recordsOfType(first.lines, EMAIL_VERIFICATION_LOG_EVENTS.BRIDGE_FAILED);
        assert.equal(bridge.length, 1);
        assert.equal(bridge[0].reason, 'firebase_unavailable');
        assert.deepEqual(Object.keys(bridge[0]).sort(), ['level', 'message', 'reason', 'ts', 'type']);
        assert.equal(recordsOfType(first.lines, EMAIL_VERIFICATION_LOG_EVENTS.COMPLETED).length, 0);
        assertNoSecrets(first.lines, { uid, code: CODE });

        // The same code works once Firebase recovers: nothing was consumed.
        setFakeFirebaseUserRecord(fakeUserRecord({ uid, emailVerified: true }));
        clearUpdatedUids();
        const second = await confirm(uid, CODE);
        assert.equal(second.error, null, 'a recovered bridge must accept the same code');
        row = await rowFor(uid);
        assert.equal(row.attempts, 2);
        assert.ok(row.usedAt instanceof Date);
        assert.deepEqual(updatedUids(), [uid]);
      })
    );
  });

  it('classifies a terminal and a not-configured Admin rejection', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const terminal = uniqueUid('admin-terminal');
        await seedChallenge({ uid: terminal });
        setFakeFirebaseUpdateFailure('auth/user-not-found');
        const first = await confirm(terminal, CODE);
        assert.ok(first.error instanceof FirebaseTokenError);
        assert.equal(first.error.code, FIREBASE_TOKEN_INVALID);
        assert.equal((await rowFor(terminal)).usedAt, null);
        assert.equal(
          recordsOfType(first.lines, EMAIL_VERIFICATION_LOG_EVENTS.BRIDGE_FAILED)[0].reason,
          'firebase_token_invalid'
        );

        const unconfigured = uniqueUid('admin-nocfg');
        await seedChallenge({ uid: unconfigured });
        setFakeFirebaseUpdateFailure('auth/invalid-credential');
        const second = await confirm(unconfigured, CODE);
        assert.ok(second.error instanceof FirebaseNotConfigured);
        assert.equal(second.error.code, FIREBASE_NOT_CONFIGURED);
        assert.equal((await rowFor(unconfigured)).usedAt, null);
        assert.equal(
          recordsOfType(second.lines, EMAIL_VERIFICATION_LOG_EVENTS.BRIDGE_FAILED)[0].reason,
          'firebase_not_configured'
        );
      })
    );
  });

  it('exhausts the budget under repeated Admin failures, and then never reaches Firebase', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('budget');
        await seedChallenge({ uid, attempts: EMAIL_VERIFICATION_MAX_ATTEMPTS - 2 });
        clearUpdatedUids();
        setFakeFirebaseUpdateFailure('auth/internal-error');

        for (let i = 0; i < 2; i += 1) {
          const { error } = await confirm(uid, CODE);
          assert.equal(error.code, FIREBASE_UNAVAILABLE, `attempt ${i + 1}`);
        }
        const row = await rowFor(uid);
        assert.equal(row.attempts, EMAIL_VERIFICATION_MAX_ATTEMPTS, 'the budget is exhausted');
        assert.equal(row.usedAt, null);
        assert.equal(updatedUids().length, 2);

        const third = await confirm(uid, CODE);
        assert.equal(third.error.code, INVALID_VERIFICATION_CODE, 'an exhausted challenge cannot reserve');
        assert.equal(updatedUids().length, 2, 'the bridge is never reached once exhausted');
      })
    );
  });

  it('refuses a stale-token repeat and never unsets usedAt (OD-1)', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('repeat');
        await seedChallenge({ uid });
        assert.equal((await confirm(uid, CODE)).error, null);

        const consumed = await rowFor(uid);
        assert.ok(consumed.usedAt instanceof Date);
        const stamp = consumed.usedAt.getTime();

        clearUpdatedUids();
        // The same stale token and the same correct code — a spent challenge is
        // NOT re-accepted (OD-1), and no branch unsets `usedAt`.
        const repeat = await confirm(uid, CODE);
        assert.ok(repeat.error instanceof EmailVerificationError);
        assert.equal(repeat.error.code, INVALID_VERIFICATION_CODE);
        assert.equal(updatedUids().length, 0, 'a spent challenge must not reach Firebase');
        assert.equal(recordsOfType(repeat.lines, EMAIL_VERIFICATION_LOG_EVENTS.COMPLETED).length, 0);

        const final = await rowFor(uid);
        assert.equal(final.usedAt.getTime(), stamp, 'usedAt is neither unset nor moved');
        assert.equal(final.attempts, 1, 'a reservation miss spends no attempt');

        // With a REFRESHED identity the repeat is an idempotent success (AD-14).
        const refreshed = await confirm(uid, CODE, { emailVerified: true });
        assert.equal(refreshed.error, null, 'an already-verified identity must succeed');
        assert.equal((await rowFor(uid)).attempts, 1, 'nothing is reserved for it');
      })
    );
  });

  it('refuses a blank code without touching the challenge or the bridge', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('blank');
        await seedChallenge({ uid, attempts: 2 });
        clearUpdatedUids();

        for (const code of ['', '   ', null, undefined, 42, {}]) {
          const { error } = await confirm(uid, code);
          assert.equal(error.code, INVALID_VERIFICATION_CODE, `code ${String(code)}`);
        }
        const row = await rowFor(uid);
        assert.equal(row.attempts, 2, 'a blank code never reserves an attempt');
        assert.equal(row.usedAt, null);
        assert.equal(updatedUids().length, 0);

        // And it is the same refusal when no challenge exists at all.
        const none = uniqueUid('blank-none');
        const { error } = await confirm(none, '');
        assert.equal(error.code, INVALID_VERIFICATION_CODE);
      })
    );
  });

  it('refuses an unusable pepper before any attempt is reserved', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('nopepper');
        await seedChallenge({ uid, attempts: 1 });
        clearUpdatedUids();

        await withEnv(configuredEnv({ [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: undefined }), async () => {
          const { error, lines } = await confirm(uid, CODE);
          assert.equal(error.code, EMAIL_VERIFICATION_NOT_CONFIGURED);
          assert.equal(lines.join(''), '', 'a configuration failure emits no event');
        });

        const row = await rowFor(uid);
        assert.equal(row.attempts, 1, 'the challenge is untouched');
        assert.equal(row.usedAt, null);
        assert.equal(updatedUids().length, 0);
      })
    );
  });

  it('writes no audit row on success or on failure', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('audit');
        await seedChallenge({ uid });
        const before = await AuditLog.countDocuments({});

        assert.equal((await confirm(uid, CODE)).error, null);
        setFakeFirebaseUpdateFailure('auth/internal-error');
        await confirm(uid, CODE); // the refusal path

        assert.equal(
          await AuditLog.countDocuments({}),
          before,
          'confirmation must not write the governance trail'
        );
      })
    );
  });

  it('confirms only its own uid', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const a = uniqueUid('iso-a');
        const b = uniqueUid('iso-b');
        await seedChallenge({ uid: a });
        await seedChallenge({ uid: b });
        clearUpdatedUids();

        assert.equal((await confirm(a, CODE)).error, null);
        const untouched = await rowFor(b);
        assert.equal(untouched.attempts, 0, 'another uid is untouched');
        assert.equal(untouched.usedAt, null);

        assert.equal((await confirm(b, CODE)).error, null);
        assert.deepEqual(updatedUids(), [a, b]);
      })
    );
  });

  it('is a no-op for an already-verified identity, even with a live challenge', async () => {
    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        const uid = uniqueUid('verified');
        await seedChallenge({ uid, attempts: 2 });
        clearUpdatedUids();

        const { value, error, lines } = await confirm(uid, CODE, { emailVerified: true });
        assert.equal(error, null);
        assert.equal(value, undefined);

        const row = await rowFor(uid);
        assert.equal(row.attempts, 2);
        assert.equal(row.usedAt, null);
        assert.equal(updatedUids().length, 0);
        assert.equal(lines.join(''), '', 'the no-op emits no event');
      })
    );
  });

  it('removes both seams in a finally, even when the body fails', async () => {
    assert.equal(hasCustomFirebaseIdTokenVerifier(), false, 'no verifier seam may be installed here');
    assert.equal(hasCustomFirebaseUserUpdater(), false, 'no updater seam may be installed here');

    await withEnv(configuredEnv(), () =>
      withSeams({}, async () => {
        assert.equal(hasCustomFirebaseIdTokenVerifier(), true);
        assert.equal(hasCustomFirebaseUserUpdater(), true);
        const uid = uniqueUid('seam');
        await seedChallenge({ uid });
        setFakeFirebaseUpdateFailure('auth/internal-error');
        const { error } = await confirm(uid, CODE);
        assert.equal(error.code, FIREBASE_UNAVAILABLE);
      })
    );

    assert.equal(hasCustomFirebaseIdTokenVerifier(), false, 'the verifier seam was removed');
    assert.equal(hasCustomFirebaseUserUpdater(), false, 'the updater seam was removed');
  });
});
