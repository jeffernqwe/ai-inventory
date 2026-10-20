/**
 * AUTH-06 — the in-app six-digit password-reset code flow's own vocabulary.
 *
 * WHY THIS FLOW EXISTS AT ALL. Firebase's console refused every email-template write on this
 * project (`EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`), so any design that routes a reset email through
 * a template we configure is unbuildable — AUTH-05's `GET /auth/reset` page is correct and
 * unreachable. Firebase's own reset email, meanwhile, completes in a browser and revokes nothing.
 * The owner's decision (2026-10-20) is therefore the shape the product already uses for account
 * verification: a six-digit code by email, checked by this server, with the new password typed
 * inside the app.
 *
 * Kept in `constants/` for the reason `constants/emailVerification.ts` gives: these are values WE
 * choose (how long a code lives, how many guesses, what our endpoints answer), not Firebase's
 * protocol and not a schema detail. A model that hardcoded "10 minutes" and a service that
 * hardcoded it again could drift; one definition here cannot.
 *
 * NOTHING HERE IS A SECRET, and nothing here is ever sent to a client. The secret's own NAME lives
 * in the config reader that enforces it — and this flow deliberately reuses the existing
 * `EMAIL_VERIFICATION_CODE_PEPPER` rather than introducing a second required variable. The two
 * flows are separated by DIGEST DOMAIN LABELS (below), not by two secrets: a reset-code digest can
 * never be accepted as a verification-code digest, which is the property that matters, and adding
 * a required environment variable would have been a deployment change for no security gain.
 */

/**
 * The length of a reset code, in decimal digits — the same six the person already meets on the
 * verification screen, so the product has one code experience rather than two.
 */
export const PASSWORD_RESET_CODE_LENGTH = 6;

/**
 * How long a freshly minted code stays usable.
 *
 * Matches the verification flow's window on purpose: the same person reads the same inbox within
 * the same few minutes, and two different lifetimes would be a difference no user could explain.
 */
export const PASSWORD_RESET_CODE_TTL_MINUTES = 10;

/**
 * How many attempts a single challenge allows.
 *
 * Load-bearing in a way the verification flow's cap is not: a code here can hand over an account,
 * and the code space is 10^6. Five attempts per challenge, with supersession resetting the count,
 * bounds a single challenge to a 5-in-10^6 guess — and the 60-second cooldown is what bounds how
 * many challenges an attacker can earn.
 */
export const PASSWORD_RESET_CODE_MAX_ATTEMPTS = 5;

/**
 * The server-enforced resend cooldown, anchored on `lastSentAt`.
 *
 * Enforced in the write predicate, never trusted to a client. It is also the guess budget's real
 * limiter: because supersession resets `attempts`, an attacker's daily guess count is
 * `MAX_ATTEMPTS × (86400 / COOLDOWN)`, not unlimited.
 */
export const PASSWORD_RESET_CODE_RESEND_COOLDOWN_SECONDS = 60;

/** The challenge collection. Named once so the model, the service and the tests agree. */
export const PASSWORD_RESET_CHALLENGE_COLLECTION = 'password_reset_challenges';

/**
 * HMAC domain labels.
 *
 * DELIBERATELY DIFFERENT FROM `EMAIL_VERIFICATION_CODE_DOMAIN` / `..._EMAIL_DOMAIN`, and that is
 * the whole point of having them: the two flows share one pepper, so the labels are the only thing
 * that stops a digest minted for one purpose from being accepted by the other. Distinct fixed
 * prefixes make the two message spaces disjoint — a code and an address can only collide when
 * their labels collide, which they cannot.
 */
export const PASSWORD_RESET_CODE_DOMAIN = 'reset-code:';
export const PASSWORD_RESET_EMAIL_DOMAIN = 'reset-email:';

/**
 * The reset flow cannot run because its configuration is unusable — today, because the code pepper
 * is missing or too short, or mail cannot be sent at all.
 *
 * Answered as a 503, and only for conditions checked BEFORE the account lookup, so it is identical
 * for every caller and therefore distinguishes no account.
 */
export const PASSWORD_RESET_CODE_NOT_CONFIGURED = 'PASSWORD_RESET_CODE_NOT_CONFIGURED';

/**
 * The submitted code was wrong, expired, already used, or the challenge was exhausted.
 *
 * ONE code for all four, deliberately: telling them apart would describe account state a caller
 * presenting a code is not entitled to learn.
 *
 * THERE IS NO COOLDOWN CODE HERE ANY MORE (2026-10-20), and the deletion is the security fix. A
 * `PASSWORD_RESET_CODE_RATE_LIMITED` — answered as a 429 with `Retry-After` — was implemented first
 * and then removed: a challenge row exists only for an ELIGIBLE account, so refusing the second
 * request of an address was a one-request oracle for "this address has an account". The cooldown
 * now resolves as an ordinary 202 with no send (see `services/passwordResetCode/request.ts`), and
 * the only 429 left on either route comes from the route limiters, which answer identically for
 * known and unknown addresses.
 */
export const INVALID_PASSWORD_RESET_CODE = 'INVALID_PASSWORD_RESET_CODE';

/**
 * The code was minted but could not be delivered.
 *
 * NOT answered to the caller: the request path's response is detached from delivery (the Phase 28
 * B1 pattern), so a delivery failure stays a server-side fact. It is declared because the service
 * still reports it — to the log, never to an unauthenticated caller for whom the presence or
 * absence of an account must be indistinguishable.
 */
export const PASSWORD_RESET_CODE_MAIL_FAILED = 'PASSWORD_RESET_CODE_MAIL_FAILED';

/**
 * Structured log events, by explicit allowlist — the AUTH-04 AD-18 rule, kept.
 *
 * Every message carrying one of these names may describe the EVENT and nothing else. Not the code,
 * not the address, not the digests, not the pepper, not a password, not the uid. An operator can
 * count and correlate these; a log aggregator can never be where a live credential is found.
 */
export const PASSWORD_RESET_CODE_LOG_EVENTS = Object.freeze({
  CODE_REQUESTED: 'password_reset_code_requested',
  COMPLETED: 'password_reset_code_completed',
  FAILED: 'password_reset_code_failed',
  REVOKE_FAILED: 'password_reset_code_revoke_failed',
});

export default {
  PASSWORD_RESET_CODE_LENGTH,
  PASSWORD_RESET_CODE_TTL_MINUTES,
  PASSWORD_RESET_CODE_MAX_ATTEMPTS,
  PASSWORD_RESET_CODE_RESEND_COOLDOWN_SECONDS,
  PASSWORD_RESET_CHALLENGE_COLLECTION,
  PASSWORD_RESET_CODE_DOMAIN,
  PASSWORD_RESET_EMAIL_DOMAIN,
  PASSWORD_RESET_CODE_NOT_CONFIGURED,
  INVALID_PASSWORD_RESET_CODE,
  PASSWORD_RESET_CODE_MAIL_FAILED,
  PASSWORD_RESET_CODE_LOG_EVENTS,
};
