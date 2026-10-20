// AUTH-04-B5 — the email-verification feature's server hardening close-out.
//
// THIS SUITE IS A DECLARATION GUARD, NOT A BEHAVIOURAL ONE. The behavioural half
// of AUTH-04 already exists: `phaseAUTH04A-*` owns the primitives and the model,
// `phaseAUTH04B1-*` the mail surface, `phaseAUTH04B2-*` the Admin bridge,
// `phaseAUTH04B3-*` the request lifecycle and `phaseAUTH04B4-*` the confirm
// lifecycle. Each guards its own slice. What none of them can see is the SET:
// which modules constitute the feature, and whether a later phase can add one or
// drift an invariant without the whole feature noticing.
//
// So every module AUTH-04 introduced or reuses is DECLARED here by path, and the
// properties that must hold across the feature are asserted over that
// declaration. Adding an AUTH-04 module without declaring it fails; declaring an
// exemption that has stopped being true fails. There is deliberately no
// route/behaviour assertion and no database: this file reads source only, so it
// belongs in PURE_UNIT and runs in every mode.
//
// WHY SOURCE AND NOT BEHAVIOUR, FOR THESE PROPERTIES. "No plaintext code is ever
// logged" cannot be proven by any single call — it is a property of the absence
// of a logging call in a module that handles the code. "The comparison uses the
// timing-safe helper" is a property of which function is called, not of one run.
// Reading the shipped text and asserting the shape is the guard that fails on the
// INTRODUCTION of a defect rather than on its use, exactly as the Phase 22/23/26B
// and Phase A declaration guards already do.
//
// COMMENTS ARE STRIPPED BEFORE ANY ASSERTION. These modules document the
// forbidden thing they must not do — `confirm.ts` explains why it never compares
// `emailHmac`, the mail transport calls out the `console.error` it will not make
// — so a guard searching the raw text would fail on its own documentation. Every
// check below therefore runs against comment-stripped CODE, and the two checks
// that could be satisfied by a string literal strip literals as well.

import { it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { unitSuite } from './testEnv.mjs';
import { readSource, listSourceFiles } from './sourceFiles.mjs';
import {
  EMAIL_VERIFICATION_LOG_EVENTS,
  INVALID_VERIFICATION_CODE,
  EMAIL_VERIFICATION_NOT_CONFIGURED,
  EMAIL_VERIFICATION_MAIL_FAILED,
  EMAIL_VERIFICATION_RATE_LIMITED,
} from '../src/constants/emailVerification.ts';
import {
  EMAIL_VERIFICATION_CODE_PEPPER_ENV,
  EMAIL_VERIFICATION_PEPPER_MIN_LENGTH,
} from '../src/config/emailVerification.ts';

// ---------------------------------------------------------------------------
// The declared module set — the feature, named in one place
// ---------------------------------------------------------------------------

/** Resolves a path relative to `server/src/`. */
const SRC = new URL('../src/', import.meta.url);
const src = (relative) => new URL(relative, SRC);

/**
 * The modules AUTH-04 introduces or reuses. Deliberately the FULL surface: the
 * challenge domain, its configuration, its model, the mail template and the
 * Firebase Admin bridge — so a property asserted "over the feature" is asserted
 * over every file that handles a code, a digest or the pepper.
 */
const AUTH04_MODULES = [
  'services/emailVerification/code.ts',
  'services/emailVerification/errors.ts',
  'services/emailVerification/request.ts',
  'services/emailVerification/confirm.ts',
  'services/emailVerification/index.ts',
  'config/emailVerification.ts',
  'constants/emailVerification.ts',
  'models/emailVerificationChallenge.model.ts',
  'services/mail/templates/emailVerification.ts',
  'services/firebase/userUpdater.ts',
];

/** The shared mail boundary the verification email is delivered through. */
const MAIL_SURFACE = [
  'services/mail/index.ts',
  'services/mail/mailConfig.ts',
  'services/mail/mailErrors.ts',
  'services/mail/providers/index.ts',
  'services/mail/providers/brevoProvider.ts',
];

/** The Firebase boundary modules AUTH-04 relies on for the email-verified write. */
const FIREBASE_SURFACE = [
  'services/firebase/firebaseErrors.ts',
  'services/firebase/index.ts',
];

/** Every module this guard covers, deduplicated and in declaration order. */
const ALL_MODULES = [...new Set([...AUTH04_MODULES, ...MAIL_SURFACE, ...FIREBASE_SURFACE])];

/** Raw source text, by declaration path. Reading a missing path throws — by design. */
const SOURCE = new Map(ALL_MODULES.map((p) => [p, readSource(src(p))]));

/** Strips block comments and whole-line line comments, so prose cannot satisfy a guard. */
function codeOnly(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/** The comment-stripped code of a declared module. */
const CODE = new Map(ALL_MODULES.map((p) => [p, codeOnly(SOURCE.get(p))]));
const code = (p) => CODE.get(p);

/** Replaces every string literal with an empty one, so a word in copy cannot match. */
function withoutStrings(text) {
  return text
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""')
    .replace(/`[^`]*`/g, '``');
}

/**
 * Every `findOneAndUpdate(...)` call body, parens matched rather than guessed at,
 * so a call's predicate can be inspected without pinning the whitespace around it.
 */
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

const REQUEST = 'services/emailVerification/request.ts';
const CONFIRM = 'services/emailVerification/confirm.ts';
const CODE_MODULE = 'services/emailVerification/code.ts';
const MODEL = 'models/emailVerificationChallenge.model.ts';

/** The two modules allowed to emit the AD-18 allowlisted events. */
const LOGGING_ALLOWED = new Set([REQUEST, CONFIRM]);

// ---------------------------------------------------------------------------

unitSuite('AUTH-04-B5 — email-verification hardening (declaration guards)', () => {
  // -------------------------------------------------------------------------
  // Coverage — the declaration is complete and concrete
  // -------------------------------------------------------------------------

  it('★ declares every shipped module of the feature, and the set is exactly the directory', () => {
    // A module missing from the declaration is a module every other guard here
    // silently ignores, so this is the check that keeps the rest honest.
    const dir = fileURLToPath(new URL('services/emailVerification/', SRC));
    const onDisk = listSourceFiles(dir).slice().sort();
    const declared = AUTH04_MODULES.filter((p) =>
      p.startsWith('services/emailVerification/')
    )
      .map((p) => p.split('/').pop())
      .sort();

    assert.deepEqual(declared, onDisk, 'a new emailVerification module must be declared in this file');
    assert.equal(ALL_MODULES.length, 17, 'the declared cover set changed size');
  });

  it('reads every declared module as non-trivial source', () => {
    for (const p of ALL_MODULES) {
      assert.ok(SOURCE.get(p).length > 0, `${p} must exist and be non-empty`);
    }
  });

  // -------------------------------------------------------------------------
  // No logging from the primitives or the mail surface
  // -------------------------------------------------------------------------

  it('★ only the two lifecycle modules log, and they do it through the shared logger', () => {
    for (const p of ALL_MODULES) {
      const text = code(p);
      if (LOGGING_ALLOWED.has(p)) {
        assert.match(text, /from '\.\.\/\.\.\/utils\/logger\.ts'/, `${p} must use the shared logger`);
        assert.ok(!/console\./.test(text), `${p} must not use the console directly`);
        continue;
      }
      // A primitive, the model, the config, the template or the mail/Firebase
      // boundary: none of them may log, because each handles a code, a digest, a
      // pepper or a credential-adjacent identifier.
      assert.ok(!/console\./.test(text), `${p} must not use the console`);
      assert.ok(!/\blogger\s*\./.test(text), `${p} must not call the logger`);
      assert.ok(!/utils\/logger/.test(text), `${p} must not import the logger at all`);
    }
  });

  it('keeps the code out of every log record, by identifier and by value', () => {
    // The object literal handed to the logger, so a word inside the human copy
    // (which legitimately contains "code") cannot satisfy or break the guard.
    const banned = /\b(uid|code|pepper|idToken|token|codeHmac|emailHmac|businessId|email)\b/;
    for (const p of [REQUEST, CONFIRM]) {
      const bodies = code(p).match(/log(?:Info|Error)\(\{[\s\S]*?\}\)/g) ?? [];
      assert.ok(bodies.length > 0, `${p} must log through the allowlisted events`);
      for (const body of bodies) {
        const identifiers = withoutStrings(body);
        const match = banned.exec(identifiers);
        assert.equal(match, null, `${p}: a log record must not carry ${match && match[0]}`);
      }
      // A reason is passed as an identifier from a frozen set, never interpolated
      // from a value — the one route a template literal could smuggle one through.
      assert.ok(!/reason:\s*['"]/.test(code(p)), `${p}: reasons must come from the frozen set`);
      assert.ok(!/`\$\{reason\}/.test(code(p)), `${p}: a reason must not be interpolated`);
    }
  });

  // -------------------------------------------------------------------------
  // The challenge stores no plaintext, and only keyed digests
  // -------------------------------------------------------------------------

  it('★ the challenge model declares no plaintext code, no address and no pepper', () => {
    const model = code(MODEL);
    assert.ok(!/\bcode\s*:\s*\{/.test(model), 'the challenge must not declare a plaintext code field');
    assert.ok(!/\bemail\s*:\s*\{/.test(model), 'the challenge must not store the plaintext address');
    assert.ok(!/\bpepper\b/.test(model), 'the challenge must not carry the pepper');
    // The only two digests, and both are keyed HMACs (AD-2).
    assert.match(model, /codeHmac:\s*\{/);
    assert.match(model, /emailHmac:\s*\{/);
  });

  it('keeps the challenge indexes exactly as Phase A shipped them', () => {
    const model = code(MODEL);
    // One explicit index (the TTL on expiresAt) plus the path-option `unique: true`
    // on uid. A second explicit index would be a new read/write cost no service needs.
    assert.equal((model.match(/Schema\.index\(/g) ?? []).length, 1, 'exactly the TTL index');
    assert.equal((model.match(/unique:\s*true/g) ?? []).length, 1, 'exactly the uid unique index');
    assert.match(model, /expireAfterSeconds:\s*0/);
  });

  // -------------------------------------------------------------------------
  // CSPRNG, keyed HMAC, timing-safe comparison — the code primitives
  // -------------------------------------------------------------------------

  it('★ generates the code with the CSPRNG and never a general-purpose random source', () => {
    assert.match(code(CODE_MODULE), /crypto\.randomInt\(/);
    for (const p of ALL_MODULES) {
      assert.ok(!/Math\.random/.test(code(p)), `${p} must not use Math.random`);
    }
  });

  it('★ keys the digests with the domain-separated HMAC, and only in the primitive module', () => {
    const primitives = code(CODE_MODULE);
    assert.match(primitives, /createHmac\('sha256'/);
    assert.match(primitives, /EMAIL_VERIFICATION_CODE_DOMAIN/);
    assert.match(primitives, /EMAIL_VERIFICATION_EMAIL_DOMAIN/);
    // An unkeyed digest of a 10^6 space would be a lookup table.
    for (const p of ALL_MODULES) {
      assert.ok(!/createHash/.test(code(p)), `${p} must not use an unkeyed digest`);
      if (p !== CODE_MODULE) {
        assert.ok(!/createHmac/.test(code(p)), `${p} must reuse the primitive, not re-implement it`);
      }
    }
  });

  it('★ compares digests with the fail-closed, timing-safe helper and nowhere else', () => {
    assert.match(code(CONFIRM), /verificationHmacMatches\(/);
    assert.match(code(CODE_MODULE), /crypto\.timingSafeEqual/);
    for (const p of ALL_MODULES) {
      if (p !== CODE_MODULE) {
        assert.ok(!/timingSafeEqual/.test(code(p)), `${p} must not compare raw bytes itself`);
      }
    }
  });

  // -------------------------------------------------------------------------
  // The pepper stays server-only
  // -------------------------------------------------------------------------

  it('★ reads the pepper in exactly the two lifecycle modules, and exposes it nowhere', () => {
    for (const p of [REQUEST, CONFIRM]) {
      assert.match(code(p), /emailVerificationConfig\(\)/, `${p} must resolve the pepper from config`);
    }
    // No HTTP surface exists in this feature yet, so nothing may touch a response
    // object at all — a pepper can therefore not be reflected.
    for (const p of AUTH04_MODULES) {
      assert.ok(!/\bres\s*\./.test(code(p)), `${p} must not touch an HTTP response`);
    }
    // The two operations report success as an empty resolution (AUTH-04-C owns the
    // envelope), so there is no field a handler could accidentally reflect.
    assert.match(code(REQUEST), /Promise<void>/);
    assert.match(code(CONFIRM), /Promise<void>/);
  });

  it('carries the pepper variable name and its length bound from one place', () => {
    assert.equal(EMAIL_VERIFICATION_CODE_PEPPER_ENV, 'EMAIL_VERIFICATION_CODE_PEPPER');
    assert.equal(typeof EMAIL_VERIFICATION_PEPPER_MIN_LENGTH, 'number');
    // The name is read by the config module and restated in no other module.
    const readers = ALL_MODULES.filter((p) => /EMAIL_VERIFICATION_CODE_PEPPER_ENV/.test(code(p)));
    assert.deepEqual(readers, ['config/emailVerification.ts']);
  });

  // -------------------------------------------------------------------------
  // Identity is the Firebase uid, never an email and never the User model
  // -------------------------------------------------------------------------

  it('★ never resolves an account by email, and never imports the User model', () => {
    for (const p of ALL_MODULES) {
      const text = code(p);
      assert.ok(!/models\/user/.test(text), `${p} must not import the User model`);
      assert.ok(
        !/\bUser\s*\.\s*(findOne|find|findById|exists|findOneAndUpdate|aggregate|count)\b/.test(text),
        `${p} must not query the User collection`
      );
      assert.ok(!/findOne\(\s*\{\s*email\b/.test(text), `${p} must not look an identity up by address`);
    }
  });

  // -------------------------------------------------------------------------
  // No new transaction/lock/upsert/index behaviour in the lifecycle
  // -------------------------------------------------------------------------

  it('uses no transaction, no lock, no upsert and no new index in either lifecycle', () => {
    for (const p of [REQUEST, CONFIRM]) {
      for (const forbidden of ['upsert', 'startSession', 'withTransaction', 'ensureIndexes', '.index(']) {
        assert.ok(!code(p).includes(forbidden), `${p} must not use ${forbidden}`);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Supersession resets usedAt; confirmation never unsets it
  // -------------------------------------------------------------------------

  it('★ keeps B3 supersession live (`usedAt: null`) and free of a dangling reset', () => {
    const request = code(REQUEST);
    assert.match(request, /usedAt:\s*null/, 'a superseded challenge must be live');
    assert.ok(!/usedAt:\s*undefined/.test(request), 'a reset must be an explicit null');
  });

  it('★ keeps B4 fail-closed: confirmation never unsets `usedAt`', () => {
    assert.ok(!/\$unset/.test(code(CONFIRM)), 'confirmation must never unset a field');
  });

  it('★ keeps B4’s literal AD-12 consume predicate, still not bound to the digest', () => {
    const calls = findOneAndUpdateCalls(code(CONFIRM));
    assert.equal(calls.length, 2, 'exactly two conditional writes are expected');
    const consume = calls[1];
    assert.match(consume, /\{\s*_id:\s*reserved\._id,\s*usedAt:\s*null\s*\}/, 'the locked predicate');
    assert.ok(!consume.includes('codeHmac'), 'the consume predicate must NOT be bound to the digest');
    assert.match(consume, /\$set:\s*\{\s*usedAt:\s*now\s*\}/, 'the consume stamps the one `now`');
  });

  // -------------------------------------------------------------------------
  // Allowlisted events and closed failure-reason sets
  // -------------------------------------------------------------------------

  it('★ pins the four allowlisted events and their exact names', () => {
    assert.deepEqual(Object.keys(EMAIL_VERIFICATION_LOG_EVENTS).sort(), [
      'BRIDGE_FAILED',
      'CODE_REQUESTED',
      'COMPLETED',
      'FAILED',
    ]);
    assert.deepEqual(Object.values(EMAIL_VERIFICATION_LOG_EVENTS).sort(), [
      'email_verification_bridge_failed',
      'email_verification_code_requested',
      'email_verification_completed',
      'email_verification_failed',
    ]);
    for (const p of [REQUEST, CONFIRM]) {
      assert.match(code(p), /EMAIL_VERIFICATION_LOG_EVENTS\./, `${p} must name events by the allowlist`);
      assert.ok(
        !/['"]email_verification_/.test(code(p)),
        `${p} must not spell an event name inline`
      );
    }
  });

  it('keeps each lifecycle’s failure reasons a fixed, closed set', () => {
    const confirmReasons = [
      'blank_code',
      'invalid_code',
      'firebase_token_invalid',
      'firebase_not_configured',
      'firebase_unavailable',
      'firebase_unknown',
    ];
    const confirm = code(CONFIRM);
    const block = confirm.slice(
      confirm.indexOf('FAILURE_REASONS = Object.freeze({'),
      confirm.indexOf('});', confirm.indexOf('FAILURE_REASONS = Object.freeze({'))
    );
    for (const reason of confirmReasons) {
      assert.ok(block.includes(`'${reason}'`), `confirm: ${reason} must be declared`);
    }
    for (const reason of ['mail_not_configured', 'mail_delivery_failure', 'mail_dispatch_error']) {
      assert.ok(code(REQUEST).includes(`'${reason}'`), `request: ${reason} must be declared`);
    }
  });

  it('pins the four stable AUTH-04 error codes', () => {
    assert.equal(INVALID_VERIFICATION_CODE, 'INVALID_VERIFICATION_CODE');
    assert.equal(EMAIL_VERIFICATION_NOT_CONFIGURED, 'EMAIL_VERIFICATION_NOT_CONFIGURED');
    assert.equal(EMAIL_VERIFICATION_MAIL_FAILED, 'EMAIL_VERIFICATION_MAIL_FAILED');
    assert.equal(EMAIL_VERIFICATION_RATE_LIMITED, 'EMAIL_VERIFICATION_RATE_LIMITED');
  });

  // -------------------------------------------------------------------------
  // No raw or provider error message reaches anything
  // -------------------------------------------------------------------------

  it('★ never reads, stringifies or interpolates an upstream error message', () => {
    for (const p of ALL_MODULES) {
      const text = code(p);
      assert.ok(!/\.\s*message\b/.test(text), `${p} must not read an upstream .message`);
      assert.ok(!/String\(\s*err\b/.test(text), `${p} must not stringify a thrown error`);
      assert.ok(!/`\$\{err/.test(text), `${p} must not interpolate a thrown error`);
    }
    // Classification is by CODE only, through the shared helpers.
    assert.match(code('services/firebase/userUpdater.ts'), /firebaseErrorFromSdkCode\(/);
    assert.match(code('services/firebase/firebaseErrors.ts'), /safeTokenReason\(/);
  });

  // -------------------------------------------------------------------------
  // The legacy verification gates are untouched
  // -------------------------------------------------------------------------

  it('★ preserves exactly two legacy `emailVerified !== true` gates', () => {
    const auth = codeOnly(readSource(src('services/firebaseAuth.service.ts')));
    const gates = auth.match(/emailVerified !== true/g) ?? [];
    assert.equal(gates.length, 2, 'the exchange and register gates must remain exactly two');
  });

  // -------------------------------------------------------------------------
  // The one deliberate divergence, pinned as intentional
  // -------------------------------------------------------------------------

  it('★ pins B3’s O-3 ApiError(400) as intentional, and keeps B4 free of it', () => {
    // O-3: a verified identity carrying no email reuses the register path's
    // `ApiError`/`VALIDATION_ERROR` convention rather than inventing an AUTH-04
    // code. That is the ONE place a B-layer module decides an HTTP status, and it
    // is deliberate — this guard exists so it stays deliberate rather than being
    // "cleaned up" into a second error vocabulary without a decision.
    assert.match(
      code(REQUEST),
      /new ApiError\(400,\s*'Validation failed',\s*VALIDATION_ERROR_CODE\)/
    );
    const constructors = ALL_MODULES.filter((p) => /new ApiError\(/.test(code(p)));
    assert.deepEqual(constructors, [REQUEST], 'request.ts must remain the only ApiError site');
    // Its counterpart is status-free: the confirm path decides no status at all.
    assert.ok(!/ApiError/.test(code(CONFIRM)), 'confirm.ts must construct no transport error');
    assert.ok(!CONFIRM.includes('ApiError'));
  });
});
