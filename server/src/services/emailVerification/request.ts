/**
 * AUTH-04-B3 — the email-verification challenge REQUEST lifecycle.
 *
 * One exported operation: `requestEmailVerificationCode({ idToken })`. It mints a
 * six-digit code for a verified Firebase identity, makes it the identity's current
 * challenge, and emails it. Nothing else — there is no HTTP surface here (that is
 * AUTH-04-C), no confirmation and no Firebase email-verified write (AUTH-04-B4),
 * and no session.
 *
 * THE ORDER OF THE TWELVE STEPS IS THE DESIGN, and several reorderings that look
 * harmless are not.
 *
 *   1. THE FIREBASE ID TOKEN IS VERIFIED FIRST, AND ITS ERRORS PROPAGATE
 *      UNCHANGED. No catch, no remap, no "log and continue": the verification
 *      error classes (`FirebaseTokenError`, `FirebaseUnavailableError`,
 *      `FirebaseNotConfigured`) are the whole contract for "who is this", and a
 *      layer that rewrote one would be deciding an HTTP status outside the
 *      controller that owns that decision.
 *
 *   2. AN ALREADY-VERIFIED IDENTITY SHORT-CIRCUITS BEFORE EVERYTHING ELSE (O-2).
 *      `emailVerified === true` returns immediately — before the pepper and mail
 *      configuration questions, before any challenge read or write, before a code
 *      is generated and before any email. Asking a configured server whether it
 *      is configured, for a caller who needs nothing, would turn a clean no-op
 *      into a 503.
 *
 *   3. A MISSING FIREBASE EMAIL REUSES THE REGISTER PATH'S CONVENTION (O-3): the
 *      existing `ApiError`/`VALIDATION_ERROR` shape with one problem under
 *      `idToken`, so the client fixes it the same way it fixes the identical
 *      registration failure. No new AUTH-04 error code is invented for it.
 *
 *   4/5. THE TWO CONFIGURATION QUESTIONS COME BEFORE THE CHALLENGE IS TOUCHED.
 *      The pepper check asks `isEmailVerificationConfigured()` (Firebase AND a
 *      usable pepper — the flow cannot key a code without either), and the mail
 *      check asks `isMailConfigured()`. Both leave an EXISTING challenge
 *      completely untouched and mint nothing, because a server that cannot
 *      deliver a code must not accumulate challenge state it can never hand out.
 *
 *   6. THE CODE IS MINTED IN MEMORY ONLY. New code, its keyed digest, the email's
 *      keyed digest and the expiry. The plaintext code never reaches storage.
 *
 *   7/8. THE CHALLENGE IS MADE CURRENT BY ONE CONDITIONAL `findOneAndUpdate`
 *      USING THE EXISTING `{ uid }` UNIQUE INDEX — no new index, no transaction
 *      and no lock. The predicate carries the resend cooldown, so an update
 *      either supersedes an existing challenge in place or matches nothing. A
 *      miss is then resolved by reading the row: PRESENT means the cooldown is
 *      still active and the request is refused with the accurate remaining
 *      seconds; ABSENT means this is the identity's first challenge, and the
 *      insert path is attempted. A concurrent creator loses the race on the
 *      unique index (E11000), which is read with the repository's existing
 *      `duplicateKeyField()` precedent and resolved to the same cooldown refusal.
 *      So concurrent callers CONVERGE to one row and at most one send per
 *      cooldown window — the property the unique index, not the read, provides.
 *
 *   9/10/11. LOG, THEN SEND, THEN FAIL HONESTLY. `CODE_REQUESTED` is emitted
 *      once the challenge is durably current. The send is AWAITED (the opposite
 *      of Phase 28 B1's password-reset detach) because the caller must know
 *      whether the code reached the recipient before it reports. A delivery
 *      failure DOES NOT ROLL BACK: the new challenge stays current and its
 *      cooldown stays active — so the caller cannot immediately re-request and
 *      hammer the provider — and the operator gets a safe `FAILED` record.
 *
 *   12. SUCCESS RETURNS NOTHING (`Promise<void>`). There is no uid, no email, no
 *      expiry, no attempt count, no cooldown and no challenge data for a handler
 *      to reflect by accident; AUTH-04-C owns the fixed success envelope.
 *
 * THE 60-SECOND COOLDOWN IS THE GUESS BUDGET, NOT MERELY A RATE LIMIT. Because
 * supersession resets `attempts` to 0, a caller can obtain a fresh guess budget
 * by waiting out the cooldown: at most ~1440 code requests per day against a
 * 10^6 code space. That is accepted by design (AD-9), and it is why the cooldown
 * is enforced here, server-side, in the write predicate rather than trusted to a
 * client.
 *
 * `usedAt` IS RESET TO `null` HERE ON SUPERSESSION, AND THAT IS NOT A CONTRADICTION
 * of AUTH-04's fail-closed consumption rule. AD-10 (supersession) and AD-12
 * (consumption) are different operations: superseding a challenge replaces it, so
 * the new row is live; consuming one (AUTH-04-B4) must NEVER unset `usedAt`,
 * because a spent challenge staying spent is what prevents replay. This phase
 * pins the first; the B4 suite pins the second.
 *
 * Nothing here writes an audit row. `recordAudit` requires a `businessId`, and no
 * tenant exists yet — the identity is still unverified — so AD-18 is satisfied by
 * the structured logger alone, exactly as the design records.
 */

import ApiError from '../../utils/ApiError.ts';
import { error as logError, info as logInfo } from '../../utils/logger.ts';
import { normalizeEmail } from '../../utils/validate.ts';
import EmailVerificationChallenge from '../../models/emailVerificationChallenge.model.ts';
import {
  EMAIL_VERIFICATION_LOG_EVENTS,
  EMAIL_VERIFICATION_MAIL_FAILED,
  EMAIL_VERIFICATION_NOT_CONFIGURED,
  EMAIL_VERIFICATION_RATE_LIMITED,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
  EMAIL_VERIFICATION_TTL_MINUTES,
} from '../../constants/emailVerification.ts';
import {
  emailVerificationConfig,
  isEmailVerificationConfigured,
} from '../../config/emailVerification.ts';
import { verifyFirebaseIdToken } from '../firebase/index.ts';
import { duplicateKeyField } from '../firebaseAuth.service.ts';
import {
  MailDeliveryError,
  MailNotConfigured,
  isMailConfigured,
  sendEmailVerificationEmail,
} from '../mail/index.ts';
import { generateVerificationCode, hashVerificationCode, hashVerificationEmail } from './code.ts';
import { EmailVerificationError } from './errors.ts';

/** The `{ idToken }` a caller submits. `unknown`, because the verifier is what decides. */
export interface RequestEmailVerificationCodeInput {
  idToken?: unknown;
}

/** The project-wide validation code, reused rather than re-declared — see O-3. */
const VALIDATION_ERROR_CODE = 'VALIDATION_ERROR';

/** Operator-facing and deliberately free of any environment variable name. */
const NOT_CONFIGURED_MESSAGE =
  'Email verification is unavailable on this server because it is not fully configured.';

/** Caller-facing. Says a code was issued and could not be delivered, and nothing more. */
const MAIL_FAILED_MESSAGE =
  'The verification email could not be sent. Please request a new code shortly.';

/** Caller-facing. Deliberately does not name the identity or the remaining seconds. */
const RATE_LIMITED_MESSAGE =
  'A verification code was requested recently. Please wait before requesting another.';

// ---------------------------------------------------------------------------
// Cooldown arithmetic (O-1/O-5) — pure, so the boundary is testable exactly
// ---------------------------------------------------------------------------

/**
 * The cooldown seconds still remaining for a challenge last sent at `lastSentAt`,
 * measured at `now`.
 *
 * DERIVED FROM `lastSentAt`, and that is what makes the answer honest and NOT
 * secret: it is a function of a value the caller already caused, and it can be
 * stated in a `Retry-After` header without disclosing anything about the account.
 *
 * CLAMPED INTO `[1, EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS]`.
 *
 *   * The lower bound of 1 rather than 0: this function is only reached when the
 *     conditional update MISSED while a row exists, i.e. the cooldown is meant to
 *     be active. In the only situation where the raw remainder could be <= 0 — a
 *     race in which the window expired between the update and this read — saying
 *     "wait 0 seconds" would invite an immediate retry into a row that is already
 *     being superseded. Reporting one second is the safe, honest floor.
 *   * The upper bound is the cooldown itself: a `lastSentAt` in the future (clock
 *     skew, or a hand-edited row) must not be able to yield a `Retry-After` larger
 *     than the policy window.
 *
 * A `lastSentAt` that is not a usable Date cannot occur on a stored row
 * (`lastSentAt` is required), but the function is TOTAL anyway: it answers the
 * full cooldown rather than `NaN`, because an error path is the last place a
 * numeric field should become `NaN`.
 */
export function retryAfterSecondsFor(lastSentAt: unknown, now: Date): number {
  const sentAt = lastSentAt instanceof Date ? lastSentAt.getTime() : NaN;
  if (!Number.isFinite(sentAt)) return EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS;

  const remainingMs = sentAt + EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000 - now.getTime();
  const seconds = Math.ceil(remainingMs / 1000);
  return Math.min(EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS, Math.max(1, seconds));
}

function notConfigured() {
  return new EmailVerificationError(EMAIL_VERIFICATION_NOT_CONFIGURED, NOT_CONFIGURED_MESSAGE);
}

function rateLimited(lastSentAt: unknown, now: Date) {
  return new EmailVerificationError(EMAIL_VERIFICATION_RATE_LIMITED, RATE_LIMITED_MESSAGE, {
    retryAfterSeconds: retryAfterSecondsFor(lastSentAt, now),
  });
}

function mailFailed() {
  return new EmailVerificationError(EMAIL_VERIFICATION_MAIL_FAILED, MAIL_FAILED_MESSAGE);
}

// ---------------------------------------------------------------------------
// AD-18 structured logging — event names by allowlist, values by nothing
// ---------------------------------------------------------------------------

/**
 * Records that a code became the identity's current challenge.
 *
 * CARRIES NO IDENTIFIER AND NO VALUE. Not the uid, not the email, not the code,
 * not either HMAC, not the pepper, not the Firebase ID token. The event name and
 * a fixed human message are the entire record — which is the point of AD-18's
 * allowlist: an operator can count and correlate these, and a log aggregator can
 * never be the place a live credential is found. `BRIDGE_FAILED` deliberately
 * does not appear here; the Firebase write is AUTH-04-B4.
 */
function logCodeRequested() {
  logInfo({
    type: EMAIL_VERIFICATION_LOG_EVENTS.CODE_REQUESTED,
    message: '[email-verification] a verification code was issued',
  });
}

/**
 * Records that the code was minted but not delivered.
 *
 * The `reason` is a CLOSED-SET fixed string, chosen by `instanceof`, exactly as
 * `passwordReset.service.ts` does. The underlying error's message is deliberately
 * NOT relayed here: the mail layer builds its messages from safe facts, but this
 * is the record an operator reads, and one template/programming fault could carry
 * request-derived text. Classifying instead of echoing keeps the record honest
 * without making it a second transport.
 *
 * No uid and no email: this path is reached with a verified identity in scope, so
 * naming it would put a person's address in a log for a failure that does not
 * need it.
 */
function logCodeFailed(err: unknown) {
  let reason = 'mail_dispatch_error';
  if (err instanceof MailNotConfigured) reason = 'mail_not_configured';
  else if (err instanceof MailDeliveryError) reason = 'mail_delivery_failure';

  logError({
    type: EMAIL_VERIFICATION_LOG_EVENTS.FAILED,
    reason,
    message: '[email-verification] the verification code could not be delivered',
  });
}

// ---------------------------------------------------------------------------
// The request lifecycle
// ---------------------------------------------------------------------------

/**
 * Issue a verification code for the identity a Firebase ID token proves.
 *
 * Resolves with `undefined` on success (see the module header). Throws:
 *
 *   * the unchanged Firebase verification errors (step 1);
 *   * `ApiError` 400 `VALIDATION_ERROR` with an `idToken` problem when the
 *     verified identity carries no usable email (step 3);
 *   * `EmailVerificationError` `EMAIL_VERIFICATION_NOT_CONFIGURED` when the flow
 *     or mail delivery is unconfigured (steps 4/5);
 *   * `EmailVerificationError` `EMAIL_VERIFICATION_RATE_LIMITED`, carrying
 *     `retryAfterSeconds`, when the cooldown is still active (step 8);
 *   * `EmailVerificationError` `EMAIL_VERIFICATION_MAIL_FAILED` when the code
 *     could not be delivered, with the new challenge left current (step 11).
 */
export async function requestEmailVerificationCode({
  idToken,
}: RequestEmailVerificationCodeInput = {}): Promise<void> {
  // ---- 1. Identity first, and its errors unchanged. ------------------------
  // No try/catch: a rewritten verification error would decide an HTTP status
  // outside the controller that owns that decision.
  const identity = await verifyFirebaseIdToken(idToken);

  const now = new Date();

  // ---- 2. Already verified: a clean no-op, before anything else (O-2). -----
  // Returned BEFORE the configuration questions below, so a caller who needs
  // nothing can never be answered with a configuration failure.
  if (identity.emailVerified === true) return;

  // ---- 3. The verified identity must name an address (O-3). ----------------
  // Reuses the register path's `VALIDATION_ERROR` + `idToken` convention rather
  // than inventing an AUTH-04 code for a condition the client fixes the same way.
  const email = normalizeEmail(identity.email);
  if (!email) {
    const err = new ApiError(400, 'Validation failed', VALIDATION_ERROR_CODE);
    err.fields = [
      {
        field: 'idToken',
        message: 'the verified Firebase identity carries no email address',
      },
    ];
    throw err;
  }

  // ---- 4. The pepper must be usable before anything is keyed. --------------
  // Leaves any existing challenge completely untouched.
  if (!isEmailVerificationConfigured()) throw notConfigured();

  // ---- 5. Mail must be deliverable before anything is minted. --------------
  // Same code: to the caller, "this server cannot key a code" and "this server
  // cannot send one" are the same temporary operational fault, and neither
  // touches the existing challenge. A code minted here could never be delivered,
  // and would put the identity into a cooldown window for an email that cannot
  // arrive.
  if (!isMailConfigured()) throw notConfigured();

  // ---- 6. Mint in memory. The plaintext code never leaves this function. ---
  const { pepper } = emailVerificationConfig();
  const code = generateVerificationCode();
  const codeHmac = hashVerificationCode(pepper, code);
  const emailHmac = hashVerificationEmail(pepper, email);
  const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MINUTES * 60_000);
  // The cooldown floor: a row whose `lastSentAt` is at or before this instant has
  // waited out the full window. `findOneAndUpdate` does not run schema validators,
  // so every required field is set EXPLICITLY below — nothing is left to a default.
  const cooldownFloor = new Date(
    now.getTime() - EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000
  );
  const currentChallenge = {
    codeHmac,
    emailHmac,
    expiresAt,
    attempts: 0,
    usedAt: null,
    lastSentAt: now,
  };

  // ---- 7. One conditional update: supersede in place, or match nothing. ----
  // The `{ uid }` unique index is the only identity this row has, and no new
  // index is added for the cooldown: the predicate is evaluated per matched
  // document, which is exactly the one row a uid resolves to.
  const superseded = await EmailVerificationChallenge.findOneAndUpdate(
    { uid: identity.uid, lastSentAt: { $lte: cooldownFloor } },
    { $set: currentChallenge },
    { returnDocument: 'after' }
  );

  // ---- 8. Resolve a miss: cooldown refusal, or the first-challenge insert. --
  if (!superseded) {
    const existing = await EmailVerificationChallenge.findOne({ uid: identity.uid });
    if (existing) throw rateLimited(existing.lastSentAt, now);

    // The identity has no challenge yet. The insert can still lose a race: two
    // concurrent first requests both see no row and both insert, and the unique
    // index lets exactly one win. The loser reads the E11000 the same way the
    // rest of the repository does and converges to the same cooldown refusal,
    // so the pair leaves ONE row and at most ONE send.
    try {
      await EmailVerificationChallenge.create({ uid: identity.uid, ...currentChallenge });
    } catch (err) {
      if (duplicateKeyField(err) === 'uid') {
        const raced = await EmailVerificationChallenge.findOne({ uid: identity.uid });
        if (raced) throw rateLimited(raced.lastSentAt, now);
      }
      throw err;
    }
  }

  // ---- 9. The challenge is durably current: record the event. --------------
  logCodeRequested();

  // ---- 10/11. Deliver, and fail honestly without rolling anything back. ----
  // AWAITED deliberately (see the module header). On failure the new challenge
  // stays current — the digest, the expiry and the cooldown are all still true —
  // because restoring the previous challenge would hand back a code the user was
  // never shown, and clearing `lastSentAt` would let the caller immediately
  // re-request and hammer a provider that has just failed.
  try {
    await sendEmailVerificationEmail({
      to: email,
      code,
      expiresInMinutes: EMAIL_VERIFICATION_TTL_MINUTES,
    });
  } catch (err) {
    logCodeFailed(err);
    throw mailFailed();
  }

  // ---- 12. Nothing to return. AUTH-04-C owns the success envelope. ---------
}

export default {
  requestEmailVerificationCode,
  retryAfterSecondsFor,
};
