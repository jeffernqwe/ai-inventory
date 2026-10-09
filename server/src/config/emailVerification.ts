/**
 * AUTH-04-A — email-verification code-pepper configuration, read lazily from the
 * environment at call time.
 *
 * Reading `process.env` on every access (rather than caching at module load) is
 * the same pattern as `services/mail/mailConfig.ts` and `config/firebase.ts`,
 * and it matters for the same reasons: node:test can switch the environment
 * between test files, and an absent or unusable pepper can never prevent the
 * server from booting — the AUTH-04 flow simply answers
 * 503 `EMAIL_VERIFICATION_NOT_CONFIGURED` until an operator fixes it.
 *
 * This module deliberately imports nothing that touches the network, the
 * database or the Admin SDK. It is pure environment parsing, which is what lets
 * `config/validateConfig.ts` (and the production-config suite) stay fast and
 * dependency-free, and what lets `emailVerificationPepperProblems` be a pure
 * function of a values bag rather than of the live process.
 *
 * The pepper value itself is server-side ONLY. It is never returned in a
 * response, never sent to the mobile application and never written to a log —
 * and, like the Firebase private key, no problem message produced here may carry
 * it or any part of it.
 */

import { isFirebaseConfigured } from './firebase.ts';

/**
 * The pepper's environment variable name.
 *
 * Declared here rather than in `constants/emailVerification.ts` for the same
 * reason `FIREBASE_SERVICE_ACCOUNT_JSON` is declared in `config/firebase.ts`:
 * a secret's NAME belongs next to the code that reads it, while the flow's
 * POLICY (code length, TTL, attempt cap, cooldown) belongs in `constants/`.
 */
export const EMAIL_VERIFICATION_CODE_PEPPER_ENV = 'EMAIL_VERIFICATION_CODE_PEPPER';

/**
 * The pepper's minimum length, mirroring `JWT_SECRET_MIN_LENGTH`.
 *
 * WHY A MINIMUM EXISTS AND WHY IT IS NOT COSMETIC. The code space is only
 * 10^6, so if the challenge collection leaks, an attacker who also guesses the
 * pepper can recover every code by brute force — the pepper is the only thing
 * standing between a stolen database and a live code. A short pepper makes that
 * joint search cheap; 32 characters makes it useless.
 *
 * There is deliberately NO character-class rule. A pepper is an opaque secret
 * with no external format, so any alphabet rule could only ever reject a valid
 * value — the same argument the reset-token and Firebase-ID-token validators
 * already make. Length is the one property that measurably weakens the HMAC.
 */
export const EMAIL_VERIFICATION_PEPPER_MIN_LENGTH = 32;

/**
 * One problem with the email-verification configuration. Structurally identical
 * to `ConfigProblem` in `config/validateConfig.ts` and to `ServiceAccountProblem`
 * in `config/firebase.ts`, so these spread straight into the production
 * validator's problem list. `message` names the VARIABLE and never carries its
 * value.
 */
export interface EmailVerificationProblem {
  variable: string;
  message: string;
}

/** What a resolved email-verification configuration looks like. */
export interface EmailVerificationConfig {
  pepper: string;
}

function trimmed(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Resolves the pepper from the environment.
 *
 * Never throws: an absent or unusable pepper resolves to `''`, which is how
 * `isEmailVerificationConfigured()` answers false without a caller handling an
 * exception. There is deliberately NO default and NO fallback — a built-in
 * pepper would be exactly the unkeyed fallback AD-3 forbids, and it would be a
 * committed secret.
 */
export function emailVerificationConfig(
  values: Record<string, string | undefined> = process.env
): EmailVerificationConfig {
  return { pepper: trimmed(values?.[EMAIL_VERIFICATION_CODE_PEPPER_ENV]) };
}

/**
 * True when this server may run the AUTH-04 flow: Firebase must be configured
 * (the flow verifies a Firebase ID token before anything else) AND the pepper
 * must be usable.
 *
 * A pure configuration question, and deliberately not "can the Admin SDK be
 * built" — a readiness probe or a startup log line must not have the side effect
 * of constructing a credential, the reasoning `services/firebase/index.ts`
 * already applies to `isFirebaseConfigured()`.
 */
export function isEmailVerificationConfigured(
  values: Record<string, string | undefined> = process.env
): boolean {
  return emailVerificationPepperProblems(values).length === 0 && isFirebaseConfigured(values);
}

/**
 * The pepper problems in `values` (defaults to `process.env`).
 *
 * THE GATE IS FIREBASE, AND THAT ORDERING IS THE WHOLE CONTRACT.
 *
 *   * Firebase NOT configured -> [] (no problem, whatever the pepper says).
 *     This is the additive property: every existing deployment, and every
 *     environment that never enables the AUTH-04 flow, must keep booting. A
 *     check that fired for an unconfigured Firebase would add a new
 *     production failure to deployments that were valid the day before.
 *   * Firebase configured, pepper missing/empty/whitespace -> a problem. In
 *     production this fails fast at startup rather than surfacing as a 503 on the
 *     first user who tries to verify their email.
 *   * Firebase configured, pepper too short -> a problem.
 *
 * A PARTIALLY configured Firebase is the one subtle case, and it is deliberately
 * silent here: `isFirebaseConfigured` is false for a half-supplied service
 * account, so this returns [] and the operator sees only the existing Firebase
 * problems. Reporting a missing pepper alongside "your service account is
 * incomplete" would name a second variable that is irrelevant until the first is
 * fixed, and would make the two checks look like they disagree.
 *
 * `''` and whitespace-only are ONE case, not two: `trim()` collapses them, so
 * "empty" is defined once and there is no second branch to get wrong.
 *
 * Messages name the VARIABLE only. No value, and no part of a value, is ever
 * included — a validation failure must never print the credential it rejected.
 */
export function emailVerificationPepperProblems(
  values: Record<string, string | undefined> = process.env
): EmailVerificationProblem[] {
  if (!isFirebaseConfigured(values)) return [];

  const pepper = trimmed(values?.[EMAIL_VERIFICATION_CODE_PEPPER_ENV]);

  if (!pepper) {
    return [
      {
        variable: EMAIL_VERIFICATION_CODE_PEPPER_ENV,
        message:
          `Missing required environment variable: ${EMAIL_VERIFICATION_CODE_PEPPER_ENV} ` +
          `(a Firebase service account is configured, so the AUTH-04 email-verification flow ` +
          `needs the code pepper — it is required, and there is deliberately no unkeyed fallback)`,
      },
    ];
  }

  if (pepper.length < EMAIL_VERIFICATION_PEPPER_MIN_LENGTH) {
    return [
      {
        variable: EMAIL_VERIFICATION_CODE_PEPPER_ENV,
        message:
          `${EMAIL_VERIFICATION_CODE_PEPPER_ENV} must be at least ` +
          `${EMAIL_VERIFICATION_PEPPER_MIN_LENGTH} characters. A short pepper makes the ` +
          `6-digit code space brute-forceable if the challenge collection ever leaks.`,
      },
    ];
  }

  return [];
}

export default {
  EMAIL_VERIFICATION_CODE_PEPPER_ENV,
  EMAIL_VERIFICATION_PEPPER_MIN_LENGTH,
  emailVerificationConfig,
  isEmailVerificationConfigured,
  emailVerificationPepperProblems,
};
