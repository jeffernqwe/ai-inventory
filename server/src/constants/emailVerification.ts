/**
 * AUTH-04-A — the email-verification code flow's own vocabulary.
 *
 * Kept in `constants/` rather than inside the model or the service for the same
 * reason `constants/firebase.ts` is: these are values WE choose (how long a code
 * lives, how many guesses it allows, what our own endpoints answer), not
 * Firebase's protocol and not a schema detail. A model that hardcoded "10
 * minutes" and a service that hardcoded it again could drift; one definition
 * here cannot.
 *
 * The secret's own NAME and its minimum length deliberately do NOT live here —
 * they live in `config/emailVerification.ts`, next to the reader that enforces
 * them, exactly as `JWT_SECRET_MIN_LENGTH` lives in `config/validateConfig.ts`
 * and `FIREBASE_SERVICE_ACCOUNT_JSON` in `config/firebase.ts`. The rule is:
 * flow policy here, secret names and bounds in `config/`.
 *
 * Nothing in this file is a secret, and nothing here is ever sent to a client.
 * The code, its HMACs and the pepper exist only at runtime — see
 * `services/emailVerification/code.ts`.
 */

/**
 * The length of a verification code, in decimal digits.
 *
 * Also the pad width, so "six digits" is stated once: `000042` is a code of
 * length 6, not a number 42 that lost its leading zeros.
 */
export const EMAIL_VERIFICATION_CODE_LENGTH = 6;

/** How long a freshly minted code stays usable (AD-7). */
export const EMAIL_VERIFICATION_TTL_MINUTES = 10;

/**
 * How many attempts a single challenge allows (AD-8).
 *
 * The reservation predicate in the later confirm path compares against this
 * value; the schema deliberately does NOT carry a matching `max` validator,
 * because `findOneAndUpdate` does not run schema validators and an inert bound
 * is worse than an absent one.
 */
export const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;

/**
 * The server-enforced resend cooldown (AD-9), anchored on `lastSentAt`.
 *
 * Enforced by the write path in a later phase, not by the client.
 */
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;

/**
 * The challenge collection (AD-5).
 *
 * Exported as a constant so the model, a future service and the declaration
 * tests all name the same collection rather than three copies of one string.
 */
export const EMAIL_VERIFICATION_CHALLENGE_COLLECTION = 'email_verification_challenges';

/**
 * HMAC domain labels (AD-2).
 *
 * Domain separation is what stops a code digest and an email digest from ever
 * being the same value, so a digest computed for one purpose can never be
 * accepted for the other. Both messages are `label + value` with distinct,
 * fixed labels, and a code is exactly six digits — so two messages can only be
 * equal when their labels are equal, which means no delimiter or prefix
 * ambiguity is reachable.
 *
 * The labels are constants rather than inline literals because the confirm path
 * must recompute a digest with the SAME label it was minted under; a literal
 * typed twice is a literal that can be mistyped once.
 */
export const EMAIL_VERIFICATION_CODE_DOMAIN = 'code:';
export const EMAIL_VERIFICATION_EMAIL_DOMAIN = 'email:';

/**
 * The error codes this flow can emit. Stable strings, because the mobile client
 * branches on them: renaming one silently downgrades a specific, friendly client
 * message to a generic failure.
 *
 * They are declared here ahead of the endpoints that emit them (AUTH-04-B/C) so
 * the vocabulary is fixed once. AUTH-04-A itself throws none of them — it has no
 * route, no controller and no service that answers a request.
 */

/**
 * The verification flow cannot run because its configuration is unusable —
 * today, because `EMAIL_VERIFICATION_CODE_PEPPER` is missing or too short.
 *
 * Deliberately separate from the Firebase codes: "this server cannot key a code"
 * and "this server cannot verify a Firebase token" are different operational
 * faults with different remedies, and collapsing them would send an operator to
 * the wrong one. There is no unkeyed fallback (AD-3).
 */
export const EMAIL_VERIFICATION_NOT_CONFIGURED = 'EMAIL_VERIFICATION_NOT_CONFIGURED';

/**
 * The submitted code was wrong, expired, or the challenge was exhausted.
 *
 * ONE code for all three, deliberately: telling them apart would let a caller
 * distinguish "that code exists but is old" from "no code was ever issued",
 * which is account state they are not entitled to.
 */
export const INVALID_VERIFICATION_CODE = 'INVALID_VERIFICATION_CODE';

/**
 * The code was minted but could not be delivered (AD-17 B).
 *
 * Distinct from `EMAIL_VERIFICATION_NOT_CONFIGURED`: a misconfiguration is knowable
 * before anything is minted, whereas this is a provider failure AFTER a challenge
 * became current. The distinction is what lets the delivery path leave the new
 * challenge in place with no rollback while still reporting honestly.
 */
export const EMAIL_VERIFICATION_MAIL_FAILED = 'EMAIL_VERIFICATION_MAIL_FAILED';

/** The caller exceeded a limiter's budget (AD-19). */
export const EMAIL_VERIFICATION_RATE_LIMITED = 'EMAIL_VERIFICATION_RATE_LIMITED';

/**
 * Structured log events, by explicit allowlist (AD-18).
 *
 * The allowlist is the point: an operator needs to know what happened, and a
 * free-form log call is how a code, an HMAC, an email, the pepper or a Firebase
 * ID token ends up in a log aggregator it must never reach. Every message
 * carrying one of these names may describe the EVENT and nothing else.
 *
 * Declared here in AUTH-04-A; the calls that use them arrive with the endpoints
 * that have something to report.
 */
export const EMAIL_VERIFICATION_LOG_EVENTS = Object.freeze({
  CODE_REQUESTED: 'email_verification_code_requested',
  COMPLETED: 'email_verification_completed',
  FAILED: 'email_verification_failed',
  BRIDGE_FAILED: 'email_verification_bridge_failed',
});

export default {
  EMAIL_VERIFICATION_CODE_LENGTH,
  EMAIL_VERIFICATION_TTL_MINUTES,
  EMAIL_VERIFICATION_MAX_ATTEMPTS,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
  EMAIL_VERIFICATION_CHALLENGE_COLLECTION,
  EMAIL_VERIFICATION_CODE_DOMAIN,
  EMAIL_VERIFICATION_EMAIL_DOMAIN,
  EMAIL_VERIFICATION_NOT_CONFIGURED,
  INVALID_VERIFICATION_CODE,
  EMAIL_VERIFICATION_MAIL_FAILED,
  EMAIL_VERIFICATION_RATE_LIMITED,
  EMAIL_VERIFICATION_LOG_EVENTS,
};
