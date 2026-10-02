/**
 * AUTH-04-A — the verification code and its digests. Pure, so every function
 * here is unit-testable without a database, a network or an environment.
 *
 * Three properties are load-bearing and none of them is incidental.
 *
 *   1. THE CODE IS UNGUESSABLE AND CORRECTLY FORMATTED. It comes from the
 *      platform CSPRNG, never from a general-purpose pseudo-random source, and
 *      it is always exactly six decimal digits — including the codes that begin
 *      with a zero, which is a sixth of the code space and which a
 *      number-shaped implementation silently loses.
 *
 *   2. ONLY A KEYED DIGEST IS EVER PERSISTED. The plaintext code leaves this
 *      module exactly once per request, to be put in an email, and is then
 *      forgotten. What is stored is an HMAC-SHA256 digest keyed by the server's
 *      pepper, so a stolen collection yields nothing that can be replayed — and
 *      unlike the password-reset token's unkeyed SHA-256, the key is what makes
 *      that true even against an attacker who can enumerate all 10^6 codes,
 *      which they trivially can.
 *
 *   3. THE TWO DOMAINS CANNOT BE CONFUSED. A code digest and an email digest are
 *      computed over messages that carry different fixed labels, so no value of
 *      one can ever produce the other's digest. This is why a code digest is
 *      never accepted as an email digest, and vice versa.
 *
 * The pepper is a REQUIRED ARGUMENT rather than read here. That keeps these
 * functions pure — the test can call them with any pepper, and there is no
 * hidden dependency on the live environment — and it puts the single place that
 * decides whether the server is configured at all (`config/emailVerification.ts`
 * plus the AUTH-04-B service) rather than scattered across the primitives.
 *
 * There is deliberately no logging in this module. A code, a digest and the
 * pepper all pass through here, so the safest thing it can do is say nothing;
 * AD-18's allowlisted events belong to the endpoints that have something to
 * report, and those are later phases.
 */

import crypto from 'node:crypto';

import {
  EMAIL_VERIFICATION_CODE_DOMAIN,
  EMAIL_VERIFICATION_CODE_LENGTH,
  EMAIL_VERIFICATION_EMAIL_DOMAIN,
} from '../../constants/emailVerification.ts';
import { normalizeEmail } from '../../utils/validate.ts';

/**
 * The size of the code space: 10^6 for six digits.
 *
 * Derived from the length constant rather than written as a literal, so the
 * bound can never disagree with the field the code is padded to. It is the
 * EXCLUSIVE upper bound of the single random draw below.
 */
const VERIFICATION_CODE_SPACE = 10 ** EMAIL_VERIFICATION_CODE_LENGTH;

/**
 * Renders a code-space integer as a fixed-width decimal string.
 *
 * Exported so the leading-zero behaviour is testable DETERMINISTICALLY: asserting
 * that "a code sometimes starts with 0" by sampling is a probabilistic test that
 * would fail roughly once in a very long while, whereas `formatVerificationCode(42)
 * === '000042'` is exact. Padding is also the only reason a code is a string at
 * all — as a number, `000042` and `42` are the same value, and the six-digit
 * contract would be unrepresentable.
 */
export function formatVerificationCode(value: number): string {
  return String(value).padStart(EMAIL_VERIFICATION_CODE_LENGTH, '0');
}

/**
 * A fresh verification code: exactly six decimal digits, uniformly distributed
 * over `000000`–`999999`.
 *
 * ONE draw, not six. `randomInt` is rejection-sampled, so a single uniform draw
 * over the whole space has no modulo bias; six separate digit draws would be six
 * chances to introduce one, and would need their own argument that each digit is
 * unbiased. The upper bound is exclusive, so the reachable values are exactly
 * 0 through 999999.
 *
 * The code is never derived from the uid, the email, the clock or a counter: a
 * code that a caller could predict from anything they know is not a secret.
 */
export function generateVerificationCode(): string {
  return formatVerificationCode(crypto.randomInt(0, VERIFICATION_CODE_SPACE));
}

/**
 * The only form of a code that may ever be persisted or compared (AD-2).
 *
 * `code:` is the domain label — see the header. Hex output matches the encoding
 * `passwordReset.service.ts` already uses for its token digest, and gives a
 * fixed-length, case-insensitive-safe value that a string equality test and a
 * timing-safe comparison can both use directly.
 */
export function hashVerificationCode(pepper: string, code: string): string {
  return keyedDigest(pepper, EMAIL_VERIFICATION_CODE_DOMAIN + String(code));
}

/**
 * The digest of an email, under its own domain label (AD-2).
 *
 * The email is normalized HERE, by the project's single `normalizeEmail`, rather
 * than by the caller. That is the difference between "the two call sites happen
 * to agree about case and whitespace" and "they cannot disagree": a future caller
 * that forgot to normalize would silently produce a digest that never matches,
 * and that failure would look like a bug in the code check rather than a missing
 * `trim()`.
 *
 * A non-string normalizes to `''` and produces a stable digest rather than
 * throwing — the same totality `normalizeEmail` already has, which is what keeps
 * this function usable on an unvalidated value.
 */
export function hashVerificationEmail(pepper: string, email: unknown): string {
  return keyedDigest(pepper, EMAIL_VERIFICATION_EMAIL_DOMAIN + normalizeEmail(email));
}

/**
 * Compares two digests without leaking, through timing, how far a guess got.
 *
 * FAILS CLOSED on anything that is not two non-empty strings of equal length. The
 * length guard is not decoration: the platform's timing-safe comparison THROWS on
 * unequal input lengths, so a helper that omitted it would convert a merely-wrong
 * comparison into a 500.
 *
 * The honest note on how much this buys: both values being compared are keyed
 * HMAC digests, not the code itself, so the byte-by-byte signal is already about
 * a derived value and the confirm path caps guesses at five attempts. The
 * comparison is therefore defence in depth rather than the load-bearing control —
 * but it costs nothing and removes the question.
 */
export function verificationHmacMatches(left: unknown, right: unknown): boolean {
  if (typeof left !== 'string' || typeof right !== 'string') return false;

  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

/**
 * The one place an HMAC is computed. Module-private: every caller above needs a
 * different MESSAGE, and none of them needs to choose the algorithm or the
 * encoding, so exposing this would only offer a way to get those wrong.
 */
function keyedDigest(pepper: string, message: string): string {
  return crypto.createHmac('sha256', String(pepper)).update(message).digest('hex');
}

export default {
  formatVerificationCode,
  generateVerificationCode,
  hashVerificationCode,
  hashVerificationEmail,
  verificationHmacMatches,
};
