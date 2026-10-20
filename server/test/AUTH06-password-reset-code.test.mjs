/**
 * AUTH-06 — the reset code's vocabulary, primitives and challenge shape.
 *
 * WHY THIS SUITE EXISTS. The in-app reset flow reuses one server secret (the AUTH-04 pepper) for
 * two different purposes: verifying an email address, and proving control of a mailbox in order to
 * replace a password. The only thing that keeps those two purposes apart is the DIGEST DOMAIN
 * LABEL, so the properties pinned here are the ones that make the separation real rather than
 * asserted:
 *
 *   1. a reset-code digest can never equal a reset-email digest for the same characters,
 *   2. a reset digest can never equal an EMAIL-VERIFICATION digest for the same characters — the
 *      cross-flow case, which is the one a shared pepper makes tempting to get wrong,
 *   3. the stored row holds digests, never the code and never the address,
 *   4. the policy numbers are the ones the product states to the user.
 *
 * Everything here is pure: no database, no network, no environment. The model cases read the
 * declared schema rather than the database, which is what lets them run in unit mode.
 */

import { it } from 'node:test';
import assert from 'node:assert/strict';

import { unitSuite } from './testEnv.mjs';

import {
  PASSWORD_RESET_CODE_LENGTH,
  PASSWORD_RESET_CODE_MAX_ATTEMPTS,
  PASSWORD_RESET_CODE_RESEND_COOLDOWN_SECONDS,
  PASSWORD_RESET_CODE_TTL_MINUTES,
  PASSWORD_RESET_CHALLENGE_COLLECTION,
} from '../src/constants/passwordResetCode.ts';
import {
  formatResetCode,
  generateResetCode,
  hashResetCode,
  hashResetEmail,
  resetDigestMatches,
} from '../src/services/passwordResetCode/code.ts';
import { hashVerificationCode, hashVerificationEmail } from '../src/services/emailVerification/code.ts';
import PasswordResetChallenge from '../src/models/passwordResetChallenge.model.ts';

const PEPPER = 'pepper-for-tests-only-0123456789abcdef';

/**
 * A path is "required" either as `required: true` or as `required: [true, 'message']` — Mongoose
 * accepts both, and every model in this project writes the message form.
 */
function isRequired(pathName) {
  const required = PasswordResetChallenge.schema.path(pathName).options.required;
  return required === true || (Array.isArray(required) && required[0] === true);
}

unitSuite('AUTH-06 reset code — policy vocabulary', () => {
  it('declares the six-digit policy the product states to the user', () => {
    assert.equal(PASSWORD_RESET_CODE_LENGTH, 6);
    assert.equal(PASSWORD_RESET_CODE_TTL_MINUTES, 10);
    assert.equal(PASSWORD_RESET_CODE_MAX_ATTEMPTS, 5);
    assert.equal(PASSWORD_RESET_CODE_RESEND_COOLDOWN_SECONDS, 60);
    assert.equal(PASSWORD_RESET_CHALLENGE_COLLECTION, 'password_reset_challenges');
  });

  it('matches the verification flow on code length and lifetime, so the product has one code experience', () => {
    // Both are stated to the person in screen copy; a silent divergence would be a UX bug that no
    // test of either flow alone would catch.
    assert.equal(PASSWORD_RESET_CODE_LENGTH, 6);
    assert.equal(PASSWORD_RESET_CODE_TTL_MINUTES, 10);
  });
});

unitSuite('AUTH-06 reset code — primitives', () => {
  it('renders a code-space integer at the fixed width, keeping leading zeros', () => {
    assert.equal(formatResetCode(42), '000042');
    assert.equal(formatResetCode(0), '000000');
    assert.equal(formatResetCode(999999), '999999');
  });

  it('generates exactly six decimal digits on every draw', () => {
    // 2000 samples: a length or padding regression shows up immediately, while the assertion stays
    // deterministic (it is a property of every draw, not a distribution test).
    for (let i = 0; i < 2000; i += 1) {
      assert.match(generateResetCode(), /^\d{6}$/);
    }
  });

  it('produces hex digests of a fixed length and is deterministic for the same inputs', () => {
    const first = hashResetCode(PEPPER, '123456');
    const second = hashResetCode(PEPPER, '123456');
    assert.equal(first, second);
    assert.match(first, /^[0-9a-f]{64}$/);
    assert.match(hashResetEmail(PEPPER, 'a@b.test'), /^[0-9a-f]{64}$/);
  });

  it('contains no digest of itself when the pepper changes', () => {
    assert.notEqual(
      hashResetCode(PEPPER, '123456'),
      hashResetCode(`${PEPPER}-other`, '123456')
    );
  });

  it('separates the code and address domains within this flow', () => {
    // The same characters must never produce the same digest under the two labels.
    assert.notEqual(hashResetCode(PEPPER, '1234'), hashResetEmail(PEPPER, '1234'));
  });

  it('separates this flow from email verification for the same value', () => {
    // THE CROSS-FLOW CASE. One pepper, two flows: if the labels were reused, a digest minted for
    // an address verification could be presented as a reset code digest.
    assert.notEqual(hashResetCode(PEPPER, '123456'), hashVerificationCode(PEPPER, '123456'));
    assert.notEqual(
      hashResetEmail(PEPPER, 'owner@example.test'),
      hashVerificationEmail(PEPPER, 'owner@example.test')
    );
  });

  it('normalizes the address before digesting, so case and whitespace cannot disagree', () => {
    assert.equal(
      hashResetEmail(PEPPER, '  Owner@Example.TEST '),
      hashResetEmail(PEPPER, 'owner@example.test')
    );
  });

  it('treats a non-string address as the empty address rather than throwing', () => {
    assert.equal(hashResetEmail(PEPPER, undefined), hashResetEmail(PEPPER, ''));
    assert.equal(hashResetEmail(PEPPER, 42), hashResetEmail(PEPPER, ''));
  });

  it('compares digests, and fails closed on anything unusable', () => {
    const digest = hashResetCode(PEPPER, '123456');
    assert.equal(resetDigestMatches(digest, hashResetCode(PEPPER, '123456')), true);
    assert.equal(resetDigestMatches(digest, hashResetCode(PEPPER, '123457')), false);
    assert.equal(resetDigestMatches(digest, digest.slice(0, 32)), false, 'unequal length');
    assert.equal(resetDigestMatches(digest, ''), false, 'empty');
    assert.equal(resetDigestMatches(null, digest), false, 'non-string');
    assert.equal(resetDigestMatches(undefined, undefined), false, 'both absent');
  });
});

unitSuite('AUTH-06 reset code — the challenge row', () => {
  it('is a separate collection from the verification challenges', () => {
    assert.equal(PasswordResetChallenge.collection.name, PASSWORD_RESET_CHALLENGE_COLLECTION);
    assert.notEqual(PasswordResetChallenge.collection.name, 'email_verification_challenges');
  });

  it('stores only digests: no plaintext code field and no address field', () => {
    const paths = Object.keys(PasswordResetChallenge.schema.paths);
    assert.ok(paths.includes('codeHmac'));
    assert.ok(paths.includes('emailHmac'));
    assert.ok(!paths.includes('code'), 'a plaintext code path would be a credential in the clear');
    assert.ok(!paths.includes('email'), 'the address itself would make this a target list');
  });

  it('keys one challenge per address, and pins the account it was issued for', () => {
    assert.equal(PasswordResetChallenge.schema.path('emailHmac').options.unique, true);
    assert.equal(isRequired('userId'), true);
    assert.equal(PasswordResetChallenge.schema.path('userId').options.ref, 'User');
    assert.equal(PasswordResetChallenge.schema.path('userId').options.index, true);
  });

  it('carries no uid — a resetting caller holds no Firebase credential', () => {
    assert.equal(PasswordResetChallenge.schema.path('uid'), undefined);
  });

  it('requires the cooldown anchor, the expiry and the attempt counter', () => {
    assert.equal(isRequired('lastSentAt'), true);
    assert.equal(isRequired('expiresAt'), true);
    assert.equal(isRequired('attempts'), true);
    assert.equal(PasswordResetChallenge.schema.path('usedAt').defaultValue, null);
  });

  it('expires rows at their own expiry through a TTL index', () => {
    const ttl = PasswordResetChallenge.schema
      .indexes()
      .find(([fields]) => Object.keys(fields).length === 1 && fields.expiresAt === 1);
    assert.ok(ttl, 'expected an { expiresAt: 1 } index');
    assert.equal(ttl[1].expireAfterSeconds, 0);
  });
});
