/**
 * AUTH-06 — the reset-code flow's configuration question, read lazily at call time.
 *
 * WHY IT DOES NOT INTRODUCE A SECOND SECRET. The flow needs a pepper to key its digests, and the
 * server already has one that production deployments are required to set. Adding
 * `PASSWORD_RESET_CODE_PEPPER` would have made an existing, working deployment fail a validation
 * it had passed the day before, for no security gain: the two flows are separated by DIGEST DOMAIN
 * LABELS (`reset-code:` / `reset-email:` versus `code:` / `email:`), which is the property that
 * actually matters. The labels are constants, so the separation cannot be misconfigured.
 *
 * WHY FIREBASE IS NOT PART OF THIS CHECK. `isEmailVerificationConfigured()` requires Firebase as
 * well, because its flow verifies an ID token before anything else. This flow's request path does
 * no Firebase work at all — a person resetting a password holds no Firebase credential — so gating
 * the request on Firebase would refuse a mail it could perfectly well deliver. The credential
 * WRITE is where Firebase becomes necessary, and that gate belongs to the Admin bridge, which
 * answers `FirebaseNotConfigured` and is mapped to the same 503. So: the request path is gated on
 * the pepper and on mail; the confirm path is gated on the pepper and on the bridge.
 *
 * Reading `process.env` on every access (rather than caching at module load) matches
 * `config/emailVerification.ts` and `services/mail/mailConfig.ts`: node:test switches the
 * environment between files, and an absent pepper must never prevent the server from booting.
 *
 * This module imports nothing that touches the network, the database or the Admin SDK, which is
 * what keeps `config/validateConfig.ts` fast and its checks pure.
 */

import {
  emailVerificationConfig,
  EMAIL_VERIFICATION_CODE_PEPPER_ENV,
  EMAIL_VERIFICATION_PEPPER_MIN_LENGTH,
} from './emailVerification.ts';

/** The variable this flow reads, named once so a message can never drift from the reader. */
export const PASSWORD_RESET_CODE_PEPPER_ENV = EMAIL_VERIFICATION_CODE_PEPPER_ENV;

/** The pepper's minimum length, shared with the verification flow for the same reason. */
export const PASSWORD_RESET_PEPPER_MIN_LENGTH = EMAIL_VERIFICATION_PEPPER_MIN_LENGTH;

/**
 * The pepper, or `''` when it is absent or unusable.
 *
 * Never throws, and there is deliberately no default: a built-in pepper would be a committed
 * secret, and a reset code keyed by a known value is a code anyone can compute from a stolen row.
 */
export function passwordResetCodePepper(
  values: Record<string, string | undefined> = process.env
): string {
  const pepper = emailVerificationConfig(values).pepper;
  return pepper.length >= PASSWORD_RESET_PEPPER_MIN_LENGTH ? pepper : '';
}

/**
 * True when this server may key a reset code.
 *
 * A pure configuration question, and deliberately not "can the Admin SDK be built" — a readiness
 * probe must not have the side effect of constructing a credential.
 */
export function isPasswordResetCodeConfigured(
  values: Record<string, string | undefined> = process.env
): boolean {
  return passwordResetCodePepper(values) !== '';
}

export default {
  PASSWORD_RESET_CODE_PEPPER_ENV,
  PASSWORD_RESET_PEPPER_MIN_LENGTH,
  passwordResetCodePepper,
  isPasswordResetCodeConfigured,
};
