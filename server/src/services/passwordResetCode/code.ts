/**
 * AUTH-06 — the reset code and its digests. Pure, so every function here is unit-testable without
 * a database, a network or an environment.
 *
 * WHY A SECOND COPY OF FOUR SMALL FUNCTIONS. `services/emailVerification/code.ts` does the same
 * arithmetic with the labels `code:` and `email:` baked into its constants, and those labels are
 * part of the AUTH-04 contract its suite pins. Sharing the module would mean either parameterising
 * its labels — putting a caller-controlled value inside the one place that is supposed to be a
 * constant — or minting reset digests under the verification flow's labels, which would make a
 * digest interchangeable between two different flows that share one pepper. Neither is acceptable,
 * so the primitives are duplicated under `reset-code:` / `reset-email:` and the duplication is
 * stated here rather than discovered later.
 *
 * THE THREE PROPERTIES ARE THE SAME THREE the verification primitives hold:
 *
 *   1. The code is unguessable and correctly formatted: one CSPRNG draw over the whole space
 *      (rejection-sampled, so no modulo bias), padded to the fixed width so a leading zero
 *      survives.
 *   2. Only a KEYED digest is persisted. A stolen collection yields nothing replayable, and
 *      nothing brute-forceable — an unkeyed digest of a 10^6 space would be a lookup table.
 *   3. The two domains cannot be confused — here by construction, because the labels differ from
 *      the verification flow's as well as from each other.
 *
 * The pepper is a REQUIRED ARGUMENT rather than read here, exactly as the verification primitives
 * take it, which keeps these functions pure and puts the only "is this server configured" decision
 * in one config reader.
 *
 * No logging: a code, a digest and the pepper all pass through here.
 */

import crypto from 'node:crypto';

import {
  PASSWORD_RESET_AUTHORIZATION_DOMAIN,
  PASSWORD_RESET_CODE_DOMAIN,
  PASSWORD_RESET_CODE_LENGTH,
  PASSWORD_RESET_EMAIL_DOMAIN,
} from '../../constants/passwordResetCode.ts';
import { normalizeEmail } from '../../utils/validate.ts';

/** 10^6 for six digits, derived from the length so the bound cannot disagree with the padding. */
const RESET_CODE_SPACE = 10 ** PASSWORD_RESET_CODE_LENGTH;

/**
 * Renders a code-space integer as a fixed-width decimal string.
 *
 * Exported so the leading-zero behaviour is testable DETERMINISTICALLY: asserting that "a code
 * sometimes starts with 0" by sampling would be a probabilistic test, whereas
 * `formatResetCode(42) === '000042'` is exact.
 */
export function formatResetCode(value: number): string {
  return String(value).padStart(PASSWORD_RESET_CODE_LENGTH, '0');
}

/**
 * A fresh reset code: exactly six decimal digits, uniformly distributed over `000000`–`999999`.
 *
 * Never derived from the address, the user id, the clock or a counter — a code a caller could
 * predict from anything they know is not a secret.
 */
export function generateResetCode(): string {
  return formatResetCode(crypto.randomInt(0, RESET_CODE_SPACE));
}

/** The only form of a code that may ever be persisted or compared. */
export function hashResetCode(pepper: string, code: string): string {
  return keyedDigest(pepper, PASSWORD_RESET_CODE_DOMAIN + String(code));
}

/**
 * The digest of an address, under its own domain label.
 *
 * The address is normalized HERE by the project's single `normalizeEmail`, not by the caller: that
 * is the difference between "the two call sites happen to agree about case and whitespace" and
 * "they cannot disagree". A non-string normalizes to `''` and produces a stable digest rather than
 * throwing, which is what keeps this usable on an unvalidated value.
 */
export function hashResetEmail(pepper: string, email: unknown): string {
  return keyedDigest(pepper, PASSWORD_RESET_EMAIL_DOMAIN + normalizeEmail(email));
}

/**
 * A fresh reset authorization: 32 random bytes as base64url (43 characters).
 *
 * THIS IS THE CREDENTIAL THE SECOND STEP PRESENTS, and it is not derived from the code, the
 * address or the account — a caller who saw one reset cannot compute another. Only its keyed
 * digest is stored, so a stolen collection yields nothing to present.
 */
export function generateResetAuthorization(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** The only form of an authorization that may ever be persisted or compared. */
export function hashResetAuthorization(pepper: string, token: string): string {
  return keyedDigest(pepper, PASSWORD_RESET_AUTHORIZATION_DOMAIN + String(token));
}

/**
 * Compares two digests without leaking, through timing, how far a guess got.
 *
 * FAILS CLOSED on anything that is not two non-empty strings of equal length — the platform's
 * timing-safe comparison THROWS on unequal lengths, so omitting the guard would turn a merely
 * wrong comparison into a 500.
 */
export function resetDigestMatches(left: unknown, right: unknown): boolean {
  if (typeof left !== 'string' || typeof right !== 'string') return false;

  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

/** The one place a reset HMAC is computed. Module-private, so no caller chooses the algorithm. */
function keyedDigest(pepper: string, message: string): string {
  return crypto.createHmac('sha256', String(pepper)).update(message).digest('hex');
}

export default {
  formatResetCode,
  generateResetCode,
  hashResetCode,
  hashResetEmail,
  generateResetAuthorization,
  hashResetAuthorization,
  resetDigestMatches,
};
