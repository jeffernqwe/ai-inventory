// AUTH-04-A — the email-verification code primitives, the pepper configuration
// boundary, and the `email_verification_challenges` model.
//
// AUTH-04-A ships NO endpoint: nothing in the running server mints, mails or
// checks a code yet. What it ships is the reusable half later phases stand on,
// so this suite pins the properties that make that half safe to build on.
//
//   * THE CODE IS FORMATTED AND UNGUESSABLE. Six decimal digits, uniformly drawn
//     from the platform CSPRNG, with leading zeros preserved — a sixth of the
//     code space that a number-shaped implementation silently loses, and the
//     failure mode is invisible because `42` looks like a code.
//   * AD-2 IS PINNED AS A LITERAL, NOT AS A DEPENDENCY. The expected digests are
//     computed here from the literal strings `'code:'` and `'email:'`, never from
//     the module's own constants, so a change to the implementation's label (or
//     to the algorithm or the encoding) has to fail this file rather than agree
//     with it. Separate cases assert the exported constants still equal those
//     literals.
//   * NOTHING PLAINTEXT IS PERSISTED. The model is asserted to have no field a
//     code, an email or a pepper could live in, and the DB half reads the RAW
//     document back to prove it.
//   * THE INDEXES ARE EXACTLY TWO. One unique `{ uid: 1 }`, one TTL
//     `{ expiresAt: 1 }`, and deliberately nothing else — a distinctness check,
//     because the tempting extras (`{ emailHmac: 1 }`, a compound uid index) are
//     precisely what a later "optimisation" would add.
//   * A FIREBASE-CONFIGURED ENVIRONMENT NEEDS THE PEPPER; an unconfigured one
//     must not gain a new production failure. Both directions are asserted, in
//     the same file, because either alone is a half-truth.
//
// Registered MIXED in run-tests.mjs: the primitive, config and schema-declaration
// cases need no database; the model and index cases need MongoDB and are proven
// against what the database actually built, not only what the schema says.

import 'dotenv/config';

import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ensureDb, disconnectDb } from './helpers.mjs';
import { unitSuite, dbSuite } from './testEnv.mjs';
import { fakeServiceAccountJson } from './fakes/firebaseVerifier.mjs';

import {
  EMAIL_VERIFICATION_CHALLENGE_COLLECTION,
  EMAIL_VERIFICATION_CODE_DOMAIN,
  EMAIL_VERIFICATION_CODE_LENGTH,
  EMAIL_VERIFICATION_EMAIL_DOMAIN,
  EMAIL_VERIFICATION_LOG_EVENTS,
  EMAIL_VERIFICATION_MAIL_FAILED,
  EMAIL_VERIFICATION_MAX_ATTEMPTS,
  EMAIL_VERIFICATION_NOT_CONFIGURED,
  EMAIL_VERIFICATION_RATE_LIMITED,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
  EMAIL_VERIFICATION_TTL_MINUTES,
  INVALID_VERIFICATION_CODE,
} from '../src/constants/emailVerification.ts';

import {
  EMAIL_VERIFICATION_CODE_PEPPER_ENV,
  EMAIL_VERIFICATION_PEPPER_MIN_LENGTH,
  emailVerificationConfig,
  emailVerificationPepperProblems,
  isEmailVerificationConfigured,
} from '../src/config/emailVerification.ts';

import {
  formatVerificationCode,
  generateVerificationCode,
  hashVerificationCode,
  hashVerificationEmail,
  verificationHmacMatches,
} from '../src/services/emailVerification/code.ts';

import { isEmailVerificationConfigured as serviceIsEmailVerificationConfigured } from '../src/services/emailVerification/index.ts';

import { validateProductionConfig } from '../src/config/validateConfig.ts';
import { FIREBASE_SERVICE_ACCOUNT_JSON } from '../src/config/firebase.ts';
import EmailVerificationChallenge from '../src/models/emailVerificationChallenge.model.ts';

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

/** A valid pepper comfortably over the minimum, and obviously a test value. */
const VALID_PEPPER = 'inventory-ai-auth04a-test-pepper-value';

/** Shorter than the minimum, so the length rule has something to reject. */
const SHORT_PEPPER = 'too-short';

/** A pepped value distinctive enough to search for anywhere it must not appear. */
const SECRET_MARKER = 'auth04a_do_not_leak_this_pepper_material';

/** A Firebase configuration that satisfies `isFirebaseConfigured`. */
const FIREBASE_ON = { [FIREBASE_SERVICE_ACCOUNT_JSON]: fakeServiceAccountJson() };

/** The rest of a valid production environment, so only the pepper is under test. */
const PROD_BASE = {
  MONGODB_URI: 'mongodb://localhost:27017/inventory_ai_test',
  JWT_SECRET: 'a'.repeat(48),
  AI_PROVIDER: '',
};

/** Reads a source file relative to this test file, for the structural guards. */
const source = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const CODE_SOURCE = '../src/services/emailVerification/code.ts';
const PEPPER_CONFIG_SOURCE = '../src/config/emailVerification.ts';

/** The problems `validateProductionConfig` reports about the pepper, and only those. */
const pepperProblems = (values) =>
  validateProductionConfig({ ...PROD_BASE, ...values }).filter(
    (p) => p.variable === EMAIL_VERIFICATION_CODE_PEPPER_ENV
  );

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

unitSuite('AUTH-04-A — verification code generation', () => {
  it('is always exactly six decimal digits', () => {
    for (let i = 0; i < 2000; i += 1) {
      const code = generateVerificationCode();
      assert.equal(typeof code, 'string');
      assert.equal(code.length, EMAIL_VERIFICATION_CODE_LENGTH);
      assert.match(code, /^\d{6}$/, `not six digits: ${JSON.stringify(code)}`);
    }
  });

  it('preserves leading zeros — deterministically, via the pad width', () => {
    // The exact case a number-shaped implementation loses: 42 is a valid code
    // only as '000042'. Asserted on the formatter so it cannot be probabilistic.
    assert.equal(formatVerificationCode(0), '000000');
    assert.equal(formatVerificationCode(42), '000042');
    assert.equal(formatVerificationCode(999999), '999999');
  });

  it('can actually draw a code below the first leading-zero boundary', () => {
    // Complements the formatter case: this proves the RANDOM DRAW reaches the
    // leading-zero region at all, rather than the formatter merely being able to
    // render one. 2000 draws land outside 0–99999 with probability ~0.9^2000.
    let sawLeadingZero = false;
    for (let i = 0; i < 2000 && !sawLeadingZero; i += 1) {
      sawLeadingZero = generateVerificationCode().startsWith('0');
    }
    assert.ok(sawLeadingZero, 'no code below 100000 was drawn in 2000 attempts');
  });

  it('stays inside the code space and is not a constant', () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i += 1) {
      const code = generateVerificationCode();
      assert.ok(code >= '000000' && code <= '999999', `out of range: ${code}`);
      seen.add(code);
    }
    assert.ok(seen.size > 1000, `generation looks constant; only ${seen.size} distinct codes in 2000`);
  });

  it('comes from the CSPRNG, and never from the general-purpose PRNG', () => {
    const text = source(CODE_SOURCE);
    assert.ok(text.includes('randomInt'), 'the code must be drawn with crypto.randomInt');
    // A structural guard rather than a statistical one: no sampling test can
    // prove the SOURCE of a value, but a source scan can prove the wrong one is
    // absent.
    assert.ok(
      !text.includes('Math.random'),
      'the code must never come from the non-cryptographic global PRNG'
    );
  });

  it('does not hash without a key', () => {
    // The password-reset token is an unkeyed SHA-256 of 256 random bits, which is
    // fine for THAT value. It would be catastrophic here: a 6-digit space under
    // an unkeyed digest is a precomputed lookup table.
    assert.ok(!source(CODE_SOURCE).includes('createHash'), 'the code digest must be keyed');
  });
});

// ---------------------------------------------------------------------------
// HMAC and comparison
// ---------------------------------------------------------------------------

unitSuite('AUTH-04-A — verification digests', () => {
  it('pins the AD-2 message format exactly, from literals', () => {
    // Computed independently of the module's own constants and of its call
    // shape: a changed domain label, algorithm or encoding must fail HERE.
    assert.equal(
      hashVerificationCode(VALID_PEPPER, '000042'),
      crypto.createHmac('sha256', VALID_PEPPER).update('code:' + '000042').digest('hex')
    );
    assert.equal(
      hashVerificationEmail(VALID_PEPPER, 'user@example.com'),
      crypto.createHmac('sha256', VALID_PEPPER).update('email:' + 'user@example.com').digest('hex')
    );
  });

  it('declares the two domain labels the format above assumes', () => {
    assert.equal(EMAIL_VERIFICATION_CODE_DOMAIN, 'code:');
    assert.equal(EMAIL_VERIFICATION_EMAIL_DOMAIN, 'email:');
  });

  it('is deterministic for the same pepper and input', () => {
    assert.equal(
      hashVerificationCode(VALID_PEPPER, '123456'),
      hashVerificationCode(VALID_PEPPER, '123456')
    );
    assert.equal(
      hashVerificationEmail(VALID_PEPPER, 'owner@example.com'),
      hashVerificationEmail(VALID_PEPPER, 'owner@example.com')
    );
  });

  it('produces a fixed-length hex digest, so equality is a simple comparison', () => {
    assert.match(hashVerificationCode(VALID_PEPPER, '000000'), /^[0-9a-f]{64}$/);
    assert.match(hashVerificationEmail(VALID_PEPPER, 'owner@example.com'), /^[0-9a-f]{64}$/);
  });

  it('separates the two domains, including at the ambiguous boundary', () => {
    // The trivial case: the same value in each domain.
    assert.notEqual(
      hashVerificationCode(VALID_PEPPER, 'foo'),
      hashVerificationEmail(VALID_PEPPER, 'foo')
    );
    // The SHARP case: a code crafted to look like an already-labelled message.
    // With naive concatenation and no distinct labels these would collide.
    assert.notEqual(
      hashVerificationCode(VALID_PEPPER, 'email:' + 'foo'),
      hashVerificationEmail(VALID_PEPPER, 'foo')
    );
    assert.notEqual(
      hashVerificationEmail(VALID_PEPPER, 'code:' + '000042'),
      hashVerificationCode(VALID_PEPPER, '000042')
    );
  });

  it('changes with the code, and with the pepper', () => {
    assert.notEqual(
      hashVerificationCode(VALID_PEPPER, '000000'),
      hashVerificationCode(VALID_PEPPER, '000001')
    );
    assert.notEqual(
      hashVerificationCode(VALID_PEPPER, '123456'),
      hashVerificationCode(SHORT_PEPPER, '123456')
    );
    assert.notEqual(
      hashVerificationEmail(VALID_PEPPER, 'owner@example.com'),
      hashVerificationEmail(SHORT_PEPPER, 'owner@example.com')
    );
  });

  it('normalizes the email itself, so no call site can forget to', () => {
    assert.equal(
      hashVerificationEmail(VALID_PEPPER, '  OWNER@Example.COM '),
      hashVerificationEmail(VALID_PEPPER, 'owner@example.com')
    );
    // Total over a non-string, rather than throwing: normalizeEmail yields ''.
    assert.equal(
      hashVerificationEmail(VALID_PEPPER, undefined),
      hashVerificationEmail(VALID_PEPPER, '')
    );
    assert.equal(
      hashVerificationEmail(VALID_PEPPER, 42),
      hashVerificationEmail(VALID_PEPPER, '')
    );
    assert.equal(
      hashVerificationEmail(VALID_PEPPER, ' A@B.CO '),
      hashVerificationEmail(VALID_PEPPER, 'a@b.co')
    );
  });

  it('compares digests safely, and fails closed on anything unusable', () => {
    const digest = hashVerificationCode(VALID_PEPPER, '123456');
    assert.equal(verificationHmacMatches(digest, digest), true);
    assert.equal(verificationHmacMatches(digest, hashVerificationCode(VALID_PEPPER, '654321')), false);
    // Unequal lengths throw in the platform primitive, so the guard is load-bearing.
    assert.equal(verificationHmacMatches(digest, digest.slice(0, 32)), false);
    assert.equal(verificationHmacMatches('', ''), false);
    assert.equal(verificationHmacMatches(digest, ''), false);
    assert.equal(verificationHmacMatches(digest, null), false);
    assert.equal(verificationHmacMatches(undefined, digest), false);
    assert.equal(verificationHmacMatches(digest, 42), false);
    assert.equal(verificationHmacMatches(null, undefined), false);
  });

  it('keeps the primitives and the pepper config free of logging', () => {
    // No code, digest, email or pepper may reach a log through these modules.
    // AD-18's allowlisted events belong to the endpoints that report something,
    // and those are later phases — so this is the weakest form of the rule and
    // the one that has to hold first.
    for (const file of [CODE_SOURCE, PEPPER_CONFIG_SOURCE]) {
      const text = source(file);
      assert.ok(!text.includes('console.'), `${file} must not log`);
      assert.ok(!text.includes('logger.'), `${file} must not log`);
    }
  });
});

// ---------------------------------------------------------------------------
// Pepper configuration
// ---------------------------------------------------------------------------

unitSuite('AUTH-04-A — pepper configuration', () => {
  it('reads the pepper lazily and trims it', () => {
    assert.equal(emailVerificationConfig({}).pepper, '');
    assert.equal(emailVerificationConfig({ [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: '  abc  ' }).pepper, 'abc');
    assert.equal(
      emailVerificationConfig({ [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: '   ' }).pepper,
      ''
    );
    // Non-string values are total: they read as absent, never as "[object Object]".
    assert.equal(emailVerificationConfig({ [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: 42 }).pepper, '');
  });

  it('reports NO pepper problem when Firebase is not configured', () => {
    // THE additive property. This is the case that would stop every existing
    // deployment from booting if it got the answer wrong.
    assert.deepEqual(emailVerificationPepperProblems({}), []);
    assert.deepEqual(emailVerificationPepperProblems({ [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: '' }), []);
    assert.deepEqual(emailVerificationPepperProblems({ ...PROD_BASE }), []);
  });

  it('requires the pepper once Firebase IS configured', () => {
    const missing = emailVerificationPepperProblems({ ...FIREBASE_ON });
    assert.equal(missing.length, 1);
    assert.equal(missing[0].variable, EMAIL_VERIFICATION_CODE_PEPPER_ENV);
    assert.ok(missing[0].message.includes(EMAIL_VERIFICATION_CODE_PEPPER_ENV));

    // Empty and whitespace-only are ONE case, not two.
    const empty = emailVerificationPepperProblems({ ...FIREBASE_ON, [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: '' });
    assert.deepEqual(empty.map((p) => p.variable), [EMAIL_VERIFICATION_CODE_PEPPER_ENV]);
    const blank = emailVerificationPepperProblems({ ...FIREBASE_ON, [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: '   ' });
    assert.deepEqual(blank.map((p) => p.variable), [EMAIL_VERIFICATION_CODE_PEPPER_ENV]);
  });

  it('enforces the minimum length at the boundary and one character below it', () => {
    const atBoundary = 'x'.repeat(EMAIL_VERIFICATION_PEPPER_MIN_LENGTH);
    const below = 'x'.repeat(EMAIL_VERIFICATION_PEPPER_MIN_LENGTH - 1);

    assert.deepEqual(emailVerificationPepperProblems({ ...FIREBASE_ON, [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: atBoundary }), []);

    const short = emailVerificationPepperProblems({ ...FIREBASE_ON, [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: below });
    assert.equal(short.length, 1);
    assert.equal(short[0].variable, EMAIL_VERIFICATION_CODE_PEPPER_ENV);
    assert.ok(short[0].message.includes(String(EMAIL_VERIFICATION_PEPPER_MIN_LENGTH)));
  });

  it('accepts a pepper with any characters, and imposes no alphabet rule', () => {
    // A pepper is an opaque secret with no external format, so an alphabet rule
    // could only ever reject a valid value.
    // Each value clears the minimum LENGTH after trimming; none of them has a
    // shape, an encoding or an alphabet in common with the others.
    for (const value of [
      'x'.repeat(32),
      '!@#$%^&*()_+-=[]{}|;:,.<>/?~`'.repeat(2),
      '   spaced   pepper   value   here   ok   ',
    ]) {
      assert.deepEqual(
        emailVerificationPepperProblems({ ...FIREBASE_ON, [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: value }),
        []
      );
    }
  });

  it('never puts the pepper value in a problem', () => {
    const cases = [
      { ...FIREBASE_ON, [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: SECRET_MARKER },
      { ...FIREBASE_ON, [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: SECRET_MARKER.slice(0, 5) },
      { ...FIREBASE_ON, [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: `  ${SECRET_MARKER.slice(0, 5)}  ` },
    ];
    for (const values of cases) {
      const rendered = JSON.stringify(emailVerificationPepperProblems(values));
      assert.ok(!rendered.includes(SECRET_MARKER), `a problem must never carry a value; got ${rendered}`);
      assert.ok(
        !rendered.includes(SECRET_MARKER.slice(0, 5)),
        `a problem must never carry part of a value; got ${rendered}`
      );
    }
  });

  it('answers the configured predicate for Firebase AND pepper together', () => {
    assert.equal(isEmailVerificationConfigured({}), false, 'no Firebase -> the flow cannot run');
    assert.equal(
      isEmailVerificationConfigured({ [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: VALID_PEPPER }),
      false,
      'a pepper without Firebase is not enough'
    );
    assert.equal(isEmailVerificationConfigured({ ...FIREBASE_ON }), false, 'Firebase without a pepper is not enough');
    assert.equal(
      isEmailVerificationConfigured({ ...FIREBASE_ON, [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: SHORT_PEPPER }),
      false
    );
    assert.equal(
      isEmailVerificationConfigured({ ...FIREBASE_ON, [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: VALID_PEPPER }),
      true
    );
  });

  it('exposes the same answer through the service boundary, with no second opinion', () => {
    assert.equal(typeof serviceIsEmailVerificationConfigured(), 'boolean');
    assert.equal(serviceIsEmailVerificationConfigured(), isEmailVerificationConfigured());
  });
});

// ---------------------------------------------------------------------------
// Production configuration integration
// ---------------------------------------------------------------------------

unitSuite('AUTH-04-A — production config validation', () => {
  it('adds NO production failure for an environment without Firebase', () => {
    // The regression guard: this bag was valid before AUTH-04-A and must remain
    // valid, or shipping this phase would break every deployment that never
    // enables the flow.
    assert.deepEqual(validateProductionConfig({ ...PROD_BASE }), []);
    assert.deepEqual(pepperProblems({}), []);
    assert.deepEqual(pepperProblems({ [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: VALID_PEPPER }), []);
  });

  it('fails fast for a Firebase-configured production environment with no pepper', () => {
    const problems = pepperProblems({ ...FIREBASE_ON });
    assert.equal(problems.length, 1);
    assert.equal(problems[0].variable, EMAIL_VERIFICATION_CODE_PEPPER_ENV);
    assert.ok(problems[0].message.includes(EMAIL_VERIFICATION_CODE_PEPPER_ENV));
  });

  it('fails fast for a Firebase-configured production environment with a short pepper', () => {
    const problems = pepperProblems({ ...FIREBASE_ON, [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: SHORT_PEPPER });
    assert.equal(problems.length, 1);
    assert.equal(problems[0].variable, EMAIL_VERIFICATION_CODE_PEPPER_ENV);
    assert.ok(!problems[0].message.includes(SHORT_PEPPER), 'the rejected value must not be echoed');
  });

  it('accepts a fully configured production environment', () => {
    assert.deepEqual(
      validateProductionConfig({ ...PROD_BASE, ...FIREBASE_ON, [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: VALID_PEPPER }),
      []
    );
  });

  it('stays silent about the pepper while Firebase is only PARTIALLY configured', () => {
    // The operator must be told to fix the service account first; naming a second
    // variable that is irrelevant until then reads like a disagreement.
    const values = { ...PROD_BASE, FIREBASE_PROJECT_ID: 'inventory-ai-test' };
    const problems = validateProductionConfig(values);
    assert.ok(problems.some((p) => p.variable === 'FIREBASE_CLIENT_EMAIL'));
    assert.ok(problems.some((p) => p.variable === 'FIREBASE_PRIVATE_KEY'));
    assert.deepEqual(pepperProblems(values), []);
  });

  it('keeps naming variables rather than values', () => {
    const values = { ...FIREBASE_ON, [EMAIL_VERIFICATION_CODE_PEPPER_ENV]: SECRET_MARKER.slice(0, 8) };
    const rendered = JSON.stringify(validateProductionConfig(values));
    assert.ok(!rendered.includes(SECRET_MARKER.slice(0, 8)), `a validator must never echo a value: ${rendered}`);
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

unitSuite('AUTH-04-A — declared policy vocabulary', () => {
  it('pins the locked flow policy', () => {
    assert.equal(EMAIL_VERIFICATION_CODE_LENGTH, 6);
    assert.equal(EMAIL_VERIFICATION_TTL_MINUTES, 10);
    assert.equal(EMAIL_VERIFICATION_MAX_ATTEMPTS, 5);
    assert.equal(EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS, 60);
    assert.equal(EMAIL_VERIFICATION_CHALLENGE_COLLECTION, 'email_verification_challenges');
  });

  it('declares four distinct error codes and four log events', () => {
    const codes = new Set([
      EMAIL_VERIFICATION_NOT_CONFIGURED,
      INVALID_VERIFICATION_CODE,
      EMAIL_VERIFICATION_MAIL_FAILED,
      EMAIL_VERIFICATION_RATE_LIMITED,
    ]);
    assert.equal(codes.size, 4, 'the four codes must be distinct strings');
    for (const code of codes) assert.match(code, /^[A-Z_]+$/);

    const events = Object.values(EMAIL_VERIFICATION_LOG_EVENTS);
    assert.equal(events.length, 4);
    assert.equal(new Set(events).size, 4);
    for (const event of events) assert.match(event, /^[a-z_]+$/);
  });
});

// ---------------------------------------------------------------------------
// Model declaration (no database)
// ---------------------------------------------------------------------------

unitSuite('AUTH-04-A — challenge model declaration', () => {
  const schema = EmailVerificationChallenge.schema;

  it('targets the approved collection', () => {
    assert.equal(EmailVerificationChallenge.collection.collectionName, EMAIL_VERIFICATION_CHALLENGE_COLLECTION);
  });

  it('declares exactly the approved fields and nothing more', () => {
    const declared = new Set(Object.keys(schema.paths));
    for (const field of ['uid', 'codeHmac', 'emailHmac', 'lastSentAt', 'expiresAt', 'attempts', 'usedAt']) {
      assert.ok(declared.has(field), `${field} must be declared`);
    }
    // The fields whose absence IS the design: a plaintext code, the address, the
    // pepper, and any tenant/session/authorization context.
    for (const forbidden of [
      'code',
      'plainCode',
      'email',
      'pepper',
      'token',
      'tokenHash',
      'businessId',
      'userId',
      'role',
      'status',
      'sessionId',
      'jti',
    ]) {
      assert.ok(!declared.has(forbidden), `${forbidden} must NOT exist on this model`);
    }
  });

  it('requires the fields a challenge cannot exist without', () => {
    for (const field of ['uid', 'codeHmac', 'emailHmac', 'lastSentAt', 'expiresAt', 'attempts']) {
      assert.equal(schema.path(field).isRequired, true, `${field} must be required`);
    }
    // usedAt is nullable by design: null means "still live".
    assert.notEqual(schema.path('usedAt').isRequired, true);
  });

  it('makes uid the indexed identity, and trims it', () => {
    const uid = schema.path('uid');
    assert.equal(uid.options.unique, true, 'unique on the path is what declares the index');
    assert.equal(uid.options.trim, true);
  });

  it('leaves the digest fields NOT unique', () => {
    // A unique index on a 10^6 digest space would reject a legitimate mint with
    // E11000. This is the one place the neighbouring password-reset token's
    // declaration must NOT be copied.
    assert.notEqual(schema.path('codeHmac').options.unique, true);
    assert.notEqual(schema.path('emailHmac').options.unique, true);
  });

  it('defaults attempts to 0 with no upper bound declared, and usedAt to null', () => {
    const defaultOf = (name) => {
      const path = schema.path(name);
      return Object.prototype.hasOwnProperty.call(path.options, 'default')
        ? path.options.default
        : path.defaultValue;
    };
    assert.equal(defaultOf('attempts'), 0);
    assert.equal(defaultOf('usedAt'), null);
    // The cap lives in constants/ and is enforced by the reservation predicate.
    // findOneAndUpdate does not run schema validators, so a `max` here would be
    // inert while reading like enforcement.
    assert.equal(schema.path('attempts').options.max, undefined);
  });

  it('declares EXACTLY the two approved indexes', () => {
    const signature = (key) =>
      Object.entries(key)
        .map(([field, direction]) => `${field}:${direction}`)
        .join(', ');

    const declared = schema.indexes();
    const signatures = declared.map(([key]) => signature(key)).sort();

    assert.deepEqual(
      signatures,
      ['expiresAt:1', 'uid:1'],
      `exactly two indexes are approved; declared: ${JSON.stringify(signatures)}`
    );

    const uidIndex = declared.find(([key]) => signature(key) === 'uid:1');
    assert.equal(uidIndex[1].unique, true, 'the uid index must be unique');

    const ttlIndex = declared.find(([key]) => signature(key) === 'expiresAt:1');
    assert.equal(ttlIndex[1].expireAfterSeconds, 0, 'the expiresAt index must be the TTL index');

    // The tempting extras, asserted absent rather than merely not written.
    for (const unwanted of ['codeHmac:1', 'emailHmac:1', 'uid:1, usedAt:1', 'uid:1, lastSentAt:1']) {
      assert.ok(!signatures.includes(unwanted), `${unwanted} must not be declared`);
    }
  });

  it('uses Mongoose timestamps rather than hand-declared ones', () => {
    assert.equal(schema.options.timestamps, true);
    assert.equal(schema.options.collection, EMAIL_VERIFICATION_CHALLENGE_COLLECTION);
  });
});

// ---------------------------------------------------------------------------
// Model behaviour (real MongoDB)
// ---------------------------------------------------------------------------

const dbOk = await ensureDb();

dbSuite('AUTH-04-A — challenge model against MongoDB', dbOk, () => {
  /** Every row this suite creates, so cleanup touches nothing else. */
  const createdIds = [];

  const uniqueUid = (label) => `auth04a-${process.pid}-${Date.now()}-${label}`;

  async function makeChallenge(overrides = {}) {
    const row = await EmailVerificationChallenge.create({
      uid: overrides.uid ?? uniqueUid(`${createdIds.length}`),
      codeHmac: hashVerificationCode(VALID_PEPPER, '123456'),
      emailHmac: hashVerificationEmail(VALID_PEPPER, 'owner@example.com'),
      lastSentAt: new Date(),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MINUTES * 60_000),
      ...overrides,
    });
    createdIds.push(row._id);
    return row;
  }

  before(async () => {
    if (!dbOk) return;
    // Make the declared indexes real before asserting on what the database does.
    // ensureIndexes creates what is missing and drops nothing.
    await EmailVerificationChallenge.ensureIndexes();
  });

  after(async () => {
    if (!dbOk) return;
    if (createdIds.length) await EmailVerificationChallenge.deleteMany({ _id: { $in: createdIds } });
    await disconnectDb();
  });

  it('stores a challenge with the documented defaults', async () => {
    const row = await makeChallenge();
    const reread = await EmailVerificationChallenge.findById(row._id);
    assert.equal(reread.attempts, 0);
    assert.equal(reread.usedAt, null);
    assert.ok(reread.createdAt instanceof Date);
    assert.ok(reread.expiresAt instanceof Date);
  });

  it('lets many distinct uids coexist', async () => {
    const rows = [await makeChallenge(), await makeChallenge(), await makeChallenge()];
    assert.equal(
      await EmailVerificationChallenge.countDocuments({ _id: { $in: rows.map((r) => r._id) } }),
      3
    );
  });

  it('refuses a DUPLICATE uid — the one-active-challenge rule, enforced by the index', async () => {
    const uid = uniqueUid('duplicate');
    await makeChallenge({ uid });
    await assert.rejects(
      () => makeChallenge({ uid }),
      (err) => err.code === 11000,
      'a second challenge for the same uid must be rejected, not accumulated'
    );
  });

  it('has actually BUILT both declared indexes in MongoDB', async () => {
    // The strongest form of the claim: not what the schema says, but what the
    // database holds. A declaration that never built would leave both the
    // duplicate-uid trap and the TTL sweep missing while every declaration
    // assertion above still passed.
    const live = await EmailVerificationChallenge.collection.indexes();

    const uidIndex = live.find((index) => JSON.stringify(index.key) === JSON.stringify({ uid: 1 }));
    assert.ok(uidIndex, `no live uid index; built: ${live.map((i) => i.name).join(', ')}`);
    assert.equal(uidIndex.unique, true);

    const ttlIndex = live.find(
      (index) => JSON.stringify(index.key) === JSON.stringify({ expiresAt: 1 })
    );
    assert.ok(ttlIndex, `no live expiresAt index; built: ${live.map((i) => i.name).join(', ')}`);
    assert.equal(ttlIndex.expireAfterSeconds, 0, 'the expiresAt index must be a TTL index');

    // MongoDB always builds `_id_`, so the "no extras" claim is made about the
    // indexes the MODEL declares rather than about every index that exists.
    const declaredLive = live.filter((index) => index.name !== '_id_');
    assert.equal(
      declaredLive.length,
      2,
      `no extra index may be built; built: ${live.map((i) => i.name).join(', ')}`
    );
  });

  it('persists no plaintext code — read back from the raw document', async () => {
    const code = '000042';
    const row = await makeChallenge({
      codeHmac: hashVerificationCode(VALID_PEPPER, code),
      emailHmac: hashVerificationEmail(VALID_PEPPER, 'raw-check@example.com'),
    });

    // Bypasses Mongoose's projection entirely: this is the document as stored.
    const raw = await EmailVerificationChallenge.collection.findOne({ _id: row._id });
    assert.ok(raw, 'the row must exist');

    // The structural half: no stored field could hold a code or an address.
    assert.deepEqual(Object.keys(raw).sort(), [
      '__v',
      '_id',
      'attempts',
      'codeHmac',
      'createdAt',
      'emailHmac',
      'expiresAt',
      'lastSentAt',
      'uid',
      'updatedAt',
      'usedAt',
    ].sort());

    // The value half: the digest is present, and the code is not.
    assert.equal(raw.codeHmac, hashVerificationCode(VALID_PEPPER, code));
    assert.notEqual(raw.codeHmac, code);
    for (const value of Object.values(raw)) {
      assert.notEqual(value, code, 'the plaintext code must not appear in the stored document');
      assert.notEqual(value, 'raw-check@example.com', 'the plaintext email must not be stored');
      assert.notEqual(value, VALID_PEPPER, 'the pepper must not be stored');
    }
  });

  it('rejects a negative attempt count', async () => {
    await assert.rejects(
      () => makeChallenge({ attempts: -1 }),
      (err) => err.name === 'ValidationError',
      'attempts must never be negative'
    );
  });
});
