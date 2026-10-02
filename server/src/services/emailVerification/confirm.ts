/**
 * AUTH-04-B4 — the email-verification challenge CONFIRM lifecycle.
 *
 * One exported operation: `confirmEmailVerificationCode({ idToken, code })`. It
 * checks a submitted six-digit code against the caller's own challenge, and — only
 * if the code is correct — sets Firebase's `emailVerified` flag through the
 * AUTH-04-B2 bridge. It adds no HTTP surface (that is AUTH-04-C), no limiter (D),
 * no mobile change (F) and no session: §14C.10 states that confirmation creates no
 * Inventory AI JWT, which is still minted only by `POST /api/auth/firebase/exchange`.
 *
 * THE ORDER OF THE STEPS IS THE DESIGN, and every reordering that looks harmless is
 * not.
 *
 *   1. `now` IS READ ONCE. Every predicate and the `usedAt` stamp derive from one
 *      instant, so the reservation, the expiry check and the consumption cannot
 *      disagree about what time it is. It is read first, as locked.
 *
 *   2. THE FIREBASE ID TOKEN IS VERIFIED FIRST AND ITS ERRORS PROPAGATE UNCHANGED.
 *      The uid this operation acts on comes from the verified identity and from
 *      nowhere else — there is no `uid`, `email`, `userId`, `businessId` or `role`
 *      on the input type, so those keys are INERT rather than validated-and-
 *      rejected. No catch, no remap, no log-and-continue: the three Firebase error
 *      classes are the whole contract, and a layer that rewrote one would be
 *      deciding an HTTP status outside the controller that owns that decision.
 *
 *   3. AN ALREADY-VERIFIED IDENTITY SHORT-CIRCUITS TO SUCCESS (AD-14), BEFORE THE
 *      CONFIGURATION QUESTION, BEFORE ANY DATABASE WORK AND BEFORE ANY MUTATION.
 *      The claim is read from the signed token, so a caller who has already
 *      completed verification — or who re-submits after refreshing their identity
 *      — gets an idempotent success that touches nothing. This is also why a
 *      *sequential* repeat is safe when the client force-refreshes after a
 *      successful confirmation, which the mobile flow does.
 *
 *   4. THE CODE IS NORMALIZED, AND A BLANK ONE IS REFUSED BEFORE ANY DATABASE
 *      WORK. A non-string normalizes to `''`, exactly as `resetPassword` treats a
 *      blank token, so a client-side formatting bug can never spend an attempt on
 *      the user's behalf. It is refused with the SAME single code as every other
 *      code failure, so nothing about the challenge is revealed by the answer.
 *
 *   5. THE PEPPER MUST BE USABLE (AD-3), AND THAT CHECK PRECEDES THE RESERVATION.
 *      A server that cannot key a digest cannot verify anything, so asking it to
 *      try would burn an attempt and answer a lie.
 *
 *   6. ONE ATOMIC RESERVATION (AD-11). A single conditional `findOneAndUpdate`
 *      carries the whole gate — the uid, `usedAt: null`, an unexpired
 *      `expiresAt`, and `attempts` below the cap — and its only effect is
 *      `$inc: { attempts: 1 }`. There is NO upsert, no transaction and no lock:
 *      the unique `{uid}` index and single-document atomicity are the mechanism,
 *      exactly as the request path already relies on.
 *
 *   7. A MISS IS ONE INDISTINGUISHABLE REFUSAL. Absent, already-used, expired and
 *      exhausted all fail the same predicate and produce the same
 *      `INVALID_VERIFICATION_CODE`, because telling them apart would describe
 *      account state a caller presenting a code is not entitled to.
 *
 *   8. THE DIGEST IS COMPARED WITH THE EXISTING PRIMITIVES, AFTER THE RESERVATION.
 *      This ordering is the attempt budget: a wrong code has already spent its
 *      attempt, which is what bounds guessing to `EMAIL_VERIFICATION_MAX_ATTEMPTS`
 *      submissions per challenge. The comparison uses the allowlisted
 *      `hashVerificationCode` and the timing-safe, fail-closed
 *      `verificationHmacMatches`; nothing here re-implements either.
 *
 *      `emailHmac` IS DELIBERATELY NEVER COMPARED (OD-8). The challenge is bound
 *      by uid, and the address digest exists so the row is not a second,
 *      unprotected copy of the address — not as a second key. Verifying an address
 *      against it here would be a rule the AUTH-04 contract does not state.
 *
 *   9/10. THE FIREBASE WRITE RUNS FIRST, AND FAILS HONESTLY (AD-12/AD-15). The
 *      bridge is AUTH-04-B2's `updateFirebaseUserEmailVerified` and is reused, not
 *      re-implemented. On failure the classified domain error propagates unchanged,
 *      `usedAt` is NOT set, `attempts` is NOT compensated, and `COMPLETED` is NOT
 *      emitted. The consequence is stated rather than hidden: the code remains
 *      retryable, and a Firebase outage spends the attempt budget, so the user may
 *      have to request a new code. There is no compensating write, because the
 *      existing architecture compensates only for inventory (Phase 07A) and a
 *      60-second cooldown makes recovery cheap.
 *
 *   11/12. THE CONSUME IS A SEPARATE, NON-FATAL WRITE (AD-12/AD-13). Only after a
 *      successful Firebase write is `usedAt` stamped, using the LOCKED predicate
 *      `{ _id, usedAt: null }` and `$set: { usedAt: now }`. The result is
 *      deliberately NOT asserted: two concurrent valid confirmations both reach
 *      the idempotent Admin write, and only one may transition `usedAt`, so the
 *      loser's miss means "already consumed microseconds ago" — not an error. The
 *      predicate is NOT bound to `codeHmac` (OD-3); a supersession landing inside
 *      this narrow window can therefore stamp the newer challenge, a benign
 *      bookkeeping artifact recorded in the audit rather than patched here.
 *
 *   13. SUCCESS RETURNS NOTHING. No uid, email, code, expiry, attempt count,
 *      cooldown, session or challenge data reaches a caller; AUTH-04-C owns the
 *      response envelope.
 *
 * `usedAt` IS NEVER UNSET HERE. A B3 supersession may reset it to `null` (AD-10),
 * but a confirmation only ever sets it (AD-12), so a spent challenge stays spent
 * and a partially completed confirmation is never replayable.
 *
 * NO AUDIT ROW IS WRITTEN (OD-6). `recordAudit` requires a `businessId`, and no
 * tenant exists at confirmation time — the identity is still unverified — so
 * AD-18 is satisfied by the structured logger alone, exactly as the request path
 * records.
 */

import { error as logError, info as logInfo } from '../../utils/logger.ts';
import EmailVerificationChallenge from '../../models/emailVerificationChallenge.model.ts';
import {
  EMAIL_VERIFICATION_LOG_EVENTS,
  EMAIL_VERIFICATION_MAX_ATTEMPTS,
  EMAIL_VERIFICATION_NOT_CONFIGURED,
  INVALID_VERIFICATION_CODE,
} from '../../constants/emailVerification.ts';
import {
  emailVerificationConfig,
  isEmailVerificationConfigured,
} from '../../config/emailVerification.ts';
import {
  FirebaseNotConfigured,
  FirebaseTokenError,
  FirebaseUnavailableError,
  updateFirebaseUserEmailVerified,
  verifyFirebaseIdToken,
} from '../firebase/index.ts';
import { hashVerificationCode, verificationHmacMatches } from './code.ts';
import { EmailVerificationError } from './errors.ts';

/**
 * The `{ idToken, code }` a caller submits.
 *
 * BOTH STAY `unknown`, and there is deliberately NO `uid`, `email`, `userId`,
 * `businessId`, `role` or `status` field. The account is the verified identity's
 * own uid and the code is the only caller-supplied value, so a body carrying
 * anything else is inert by construction rather than rejected by a check someone
 * could later delete.
 */
export interface ConfirmEmailVerificationCodeInput {
  idToken?: unknown;
  code?: unknown;
}

/** Caller-facing. Says nothing about which of the refusal reasons applied. */
const INVALID_CODE_MESSAGE =
  'That verification code is invalid or has expired. Please request a new one.';

/** Operator-facing and deliberately free of any environment variable name. */
const NOT_CONFIGURED_MESSAGE =
  'Email verification is unavailable on this server because it is not fully configured.';

function invalidCode() {
  return new EmailVerificationError(INVALID_VERIFICATION_CODE, INVALID_CODE_MESSAGE);
}

function notConfigured() {
  return new EmailVerificationError(EMAIL_VERIFICATION_NOT_CONFIGURED, NOT_CONFIGURED_MESSAGE);
}

// ---------------------------------------------------------------------------
// AD-18 logging — fixed event names, closed-set reasons, no values
// ---------------------------------------------------------------------------

/**
 * The closed set of reasons a confirmation can record.
 *
 * FIXED STRINGS, chosen by `instanceof` or by which branch was taken — never
 * derived from an input, an identifier or an upstream message. The set is
 * deliberately small and frozen so a future change must add a reason on purpose
 * rather than interpolate one by accident.
 */
const FAILURE_REASONS = Object.freeze({
  /** The submitted value was not a non-empty string — a client-side malformation. */
  BLANK_CODE: 'blank_code',
  /** The challenge was absent, used, expired or exhausted, or the code was wrong. */
  INVALID_CODE: 'invalid_code',
  /** The Admin bridge rejected the identity (`auth/user-not-found`, `.../user-disabled`). */
  FIREBASE_TOKEN_INVALID: 'firebase_token_invalid',
  /** The Admin bridge had no usable credential (`auth/invalid-credential`). */
  FIREBASE_NOT_CONFIGURED: 'firebase_not_configured',
  /** The Admin bridge could not be reached, or failed unrecognisably. */
  FIREBASE_UNAVAILABLE: 'firebase_unavailable',
  /** A thrown value that is not one of this layer's domain errors — a programming fault. */
  FIREBASE_UNKNOWN: 'firebase_unknown',
});

/**
 * Records a refused confirmation.
 *
 * CARRIES NO IDENTIFIER AND NO VALUE. Not the uid, not the email, not the
 * submitted code, not the stored digest, not the pepper and not the Firebase ID
 * token. `reason` is one of the two closed-set CODE reasons; the outcome and a
 * fixed human message are the entire record. That is the point of AD-18's
 * allowlist: an operator can count and correlate refusals, and a log aggregator
 * can never become the place a live credential is found.
 */
function logCodeRefused(reason: string) {
  logError({
    type: EMAIL_VERIFICATION_LOG_EVENTS.FAILED,
    reason,
    message: '[email-verification] a verification code was not accepted',
  });
}

/**
 * Classifies an Admin-bridge failure into the closed reason set.
 *
 * CLASSIFIES; IT DOES NOT ECHO. The bridge already discards the upstream message
 * (an SDK error is produced by a library that was handed the credential), so
 * relaying it here would reintroduce the one leak that boundary exists to close.
 * An unrecognised throw is `firebase_unknown` — a programming fault reported as
 * itself, so it cannot be mistaken for a provider outage the provider never saw.
 */
function bridgeFailureReason(err: unknown): string {
  if (err instanceof FirebaseTokenError) return FAILURE_REASONS.FIREBASE_TOKEN_INVALID;
  if (err instanceof FirebaseNotConfigured) return FAILURE_REASONS.FIREBASE_NOT_CONFIGURED;
  if (err instanceof FirebaseUnavailableError) return FAILURE_REASONS.FIREBASE_UNAVAILABLE;
  return FAILURE_REASONS.FIREBASE_UNKNOWN;
}

/**
 * Records that the code was correct but Firebase's write did not complete.
 *
 * A distinct event from a code refusal because it is a different operational fact:
 * the caller's code was right, and the failure is server-side. `BRIDGE_FAILED` is
 * the name AD-18 reserves for exactly this.
 */
function logBridgeFailed(reason: string) {
  logError({
    type: EMAIL_VERIFICATION_LOG_EVENTS.BRIDGE_FAILED,
    reason,
    message: '[email-verification] Firebase email verification could not be recorded',
  });
}

/**
 * Records a completed confirmation.
 *
 * No uid and no email: the event says the flow finished, and an operator counting
 * completions needs no identifier to do it. Nothing else is writable here, because
 * nothing else is known to be safe.
 */
function logCompleted() {
  logInfo({
    type: EMAIL_VERIFICATION_LOG_EVENTS.COMPLETED,
    message: '[email-verification] email verification was completed',
  });
}

// ---------------------------------------------------------------------------
// The confirm lifecycle
// ---------------------------------------------------------------------------

/**
 * Verify a submitted code for the identity a Firebase ID token proves, and set
 * Firebase's `emailVerified` flag when it is correct.
 *
 * Resolves with `undefined` on success. Throws:
 *
 *   * the unchanged Firebase verification errors (step 2);
 *   * `EmailVerificationError` `INVALID_VERIFICATION_CODE` for a blank code, a
 *     reservation miss, or a digest mismatch;
 *   * `EmailVerificationError` `EMAIL_VERIFICATION_NOT_CONFIGURED` when the pepper
 *     is unusable (before any reservation);
 *   * the unchanged, classified Firebase Admin errors from the bridge, with
 *     `usedAt` left unset.
 */
export async function confirmEmailVerificationCode({
  idToken,
  code,
}: ConfirmEmailVerificationCodeInput = {}): Promise<void> {
  // ---- 1. One instant for every predicate and for the `usedAt` stamp. -------
  const now = new Date();

  // ---- 2. Identity first, and its errors unchanged. ------------------------
  // No try/catch: a rewritten verification error would decide an HTTP status
  // outside the controller that owns that decision. The uid comes from HERE and
  // from nowhere else.
  const identity = await verifyFirebaseIdToken(idToken);

  // ---- 3. Already verified: an idempotent success, before everything else. --
  // Returned BEFORE the configuration question and before any challenge access,
  // so a caller who has already completed verification can never be answered with
  // a configuration failure, and nothing is minted, reserved or consumed (AD-14).
  if (identity.emailVerified === true) return;

  // ---- 4. Normalize the code; refuse a blank one before any database work. --
  // Mirrors `resetPassword`'s blank-token guard: a malformed submission must not
  // spend an attempt, and it is indistinguishable from a wrong code to the caller.
  const raw = typeof code === 'string' ? code.trim() : '';
  if (!raw) {
    logCodeRefused(FAILURE_REASONS.BLANK_CODE);
    throw invalidCode();
  }

  // ---- 5. The pepper must be usable before anything is reserved. -----------
  // A server that cannot key a digest cannot verify a code, so answering by
  // trying would burn an attempt and report a false result. Placed BEFORE the
  // reservation for exactly that reason.
  if (!isEmailVerificationConfigured()) throw notConfigured();

  // ---- 6. One atomic reservation. ------------------------------------------
  // The whole gate is this predicate — identity, liveness, expiry and the attempt
  // cap — and the only effect is one increment. `findOneAndUpdate` does not run
  // schema validators and nothing else is written, so there is no required field
  // to forget. No upsert: a missing challenge must NOT be created by a guess.
  const reserved = await EmailVerificationChallenge.findOneAndUpdate(
    {
      uid: identity.uid,
      usedAt: null,
      expiresAt: { $gt: now },
      attempts: { $lt: EMAIL_VERIFICATION_MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },
    { returnDocument: 'after' }
  );

  // ---- 7. A miss is one indistinguishable refusal. -------------------------
  // Absent, already used, expired and exhausted all fail here and answer the same
  // way, because telling them apart would describe account state a caller
  // presenting a code is not entitled to learn (OD-9: one closed-set reason).
  if (!reserved) {
    logCodeRefused(FAILURE_REASONS.INVALID_CODE);
    throw invalidCode();
  }

  // ---- 8. Compare the digest, with the attempt already spent. --------------
  // `verificationHmacMatches` fails closed on anything unusable, so a stored value
  // that is not a comparable digest can never be judged equal.
  const { pepper } = emailVerificationConfig();
  if (!verificationHmacMatches(reserved.codeHmac, hashVerificationCode(pepper, raw))) {
    logCodeRefused(FAILURE_REASONS.INVALID_CODE);
    throw invalidCode();
  }

  // ---- 9/10. Firebase write first; fail honestly, restore nothing. ---------
  // The bridge is AUTH-04-B2's and is reused. On failure `usedAt` is NOT set and
  // `attempts` is NOT compensated, so the code stays retryable until the budget
  // runs out — the locked AD-12/OD-4 ordering. The error travels unchanged, and
  // no HTTP status is decided here.
  try {
    await updateFirebaseUserEmailVerified(identity.uid);
  } catch (err) {
    logBridgeFailed(bridgeFailureReason(err));
    throw err;
  }

  // ---- 11. Consume second, non-fatally (AD-12/AD-13). ----------------------
  // The LOCKED predicate, deliberately NOT bound to `codeHmac` (OD-3). The result
  // is not asserted: a miss here is a concurrent valid confirmation that already
  // transitioned `usedAt`, which is the intentional AD-13 behaviour rather than a
  // failure of this request. The Firebase write has already succeeded in both
  // cases, so the caller is answered success either way.
  await EmailVerificationChallenge.findOneAndUpdate(
    { _id: reserved._id, usedAt: null },
    { $set: { usedAt: now } }
  );

  // ---- 12. The flow completed. ---------------------------------------------
  logCompleted();

  // ---- 13. Nothing to return. AUTH-04-C owns the success envelope. ---------
}

export default {
  confirmEmailVerificationCode,
};
