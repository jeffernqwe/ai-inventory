/**
 * AUTH-06 — the reset-code CONFIRM lifecycle.
 *
 * One exported operation: `confirmPasswordResetCode({ email, code, newPassword })`. It checks a
 * submitted six-digit code against the caller's challenge and — only if the code is correct —
 * replaces the account's password through Firebase, stamps `passwordChangedAt`, and revokes every
 * existing session.
 *
 * THE ORDER OF THE STEPS IS THE DESIGN, and every reordering that looks harmless is not.
 *
 *   1. `now` IS READ ONCE. Every predicate and the `usedAt` stamp derive from one instant, so the
 *      reservation, the expiry check and the consumption cannot disagree about what time it is.
 *
 *   2. THE CONFIGURATION QUESTION COMES BEFORE ANY DATABASE WORK. A server that cannot key a
 *      digest cannot verify anything, so asking it to try would burn an attempt and answer a lie.
 *
 *   3. A BLANK CODE IS REFUSED BEFORE ANY DATABASE WORK, with the same single code as every other
 *      refusal: a client-side formatting bug must never spend an attempt on the person's behalf.
 *
 *   4. ONE ATOMIC RESERVATION. A single conditional `findOneAndUpdate` carries the whole gate —
 *      the address digest, `usedAt: null`, an unexpired `expiresAt`, and `attempts` below the cap
 *      — and its only effect is `$inc: { attempts: 1 }`. No upsert, no transaction, no lock: the
 *      unique `{ emailHmac }` index and single-document atomicity are the mechanism.
 *
 *   5. A MISS IS ONE INDISTINGUISHABLE REFUSAL. Absent, already-used, expired and exhausted all
 *      fail the same predicate and produce the same code, because telling them apart would
 *      describe account state a caller presenting a code is not entitled to.
 *
 *   6. THE DIGEST IS COMPARED AFTER THE RESERVATION, which is the attempt budget: a wrong code has
 *      already spent its attempt, so guessing is bounded to `MAX_ATTEMPTS` submissions per
 *      challenge. The comparison fails closed on anything unusable.
 *
 *   7. THE ACCOUNT IS THE ONE THE CHALLENGE NAMED. `reserved.userId` is read here and nowhere is
 *      the address used to look an account up again — a submitted address can address a challenge
 *      and can never choose an account. A row whose user has since been removed, disabled, or
 *      lost its `firebaseUid` answers the SAME refusal, because it is the same class of fact.
 *
 *   8. THE PASSWORD IS WRITTEN THROUGH THE NEW ADMIN BRIDGE, FIRST, AND FAILS HONESTLY. On failure
 *      the classified domain error propagates unchanged and `usedAt` is NOT set — so the code
 *      stays retryable, at the cost that an outage spends the attempt budget (the AUTH-04 AD-12
 *      ordering, reused rather than re-invented). Nothing is compensated, because the existing
 *      architecture compensates only for inventory.
 *
 *   9/10. THE STAMP AND THE REVOCATION COME NEXT, IN THAT ORDER, AND NEVER BOTH SKIPPED. The
 *      `passwordChangedAt` stamp is what `authenticate.ts` compares a token's `iat` against, and
 *      `revokeAllSessions` closes the same-second hole the integer-second comparison cannot — the
 *      pair `credentialsChanged.service.ts` and 26B's reset both use. THIS is the guarantee a
 *      Firebase-native reset could not give, and the reason the server performs the change.
 *
 *   11. THE REFRESH-TOKEN REVOCATION IS BEST EFFORT. By this point the password has changed and
 *      every Inventory AI session is ended, so failing the request would report a false failure.
 *      A failure is recorded with a fixed reason, so the residual ("a Firebase session may survive
 *      if this failed") is visible to an operator instead of hidden.
 *
 *   12. THE CONSUME IS SEPARATE AND NON-FATAL. Only after the password write succeeds is `usedAt`
 *      stamped, with the predicate `{ _id, usedAt: null }`, and the result is deliberately not
 *      asserted: two concurrent valid confirmations both reach the Admin write, and only one may
 *      transition `usedAt`, so the loser's miss means "already consumed microseconds ago".
 *
 *   13. THE AUDIT ROW IS WRITTEN LAST AND IS NON-FATAL. Unlike the verification flow, a tenant
 *      DOES exist here, so `recordAudit` can be called with a real `businessId` — and it must be,
 *      because a password change is exactly the governance event the audit trail exists for. A
 *      failure to record it does not unsucceed the reset: the password has already changed, and
 *      reporting a failure would invite a second attempt that cannot help.
 *
 * NO PLAINTEXT CODE IS STORED, LOGGED OR RETURNED, and no password is either: the password is an
 * argument that goes to the Admin boundary, and nothing in this module retains it.
 */

import { error as logError, info as logInfo } from '../../utils/logger.ts';
import { normalizeEmail } from '../../utils/validate.ts';
import User from '../../models/user.model.ts';
import PasswordResetChallenge from '../../models/passwordResetChallenge.model.ts';
import {
  INVALID_PASSWORD_RESET_CODE,
  PASSWORD_RESET_CODE_LOG_EVENTS,
  PASSWORD_RESET_CODE_MAX_ATTEMPTS,
  PASSWORD_RESET_CODE_NOT_CONFIGURED,
} from '../../constants/passwordResetCode.ts';
import { isPasswordResetCodeConfigured, passwordResetCodePepper } from '../../config/passwordResetCode.ts';
import { revokeAllSessions } from '../session.service.ts';
import { recordAudit } from '../audit.service.ts';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../constants/audit.ts';
import { revokeFirebaseRefreshTokens, updateFirebaseUserPassword } from '../firebase/passwordUpdater.ts';
import { hashResetCode, hashResetEmail, resetDigestMatches } from './code.ts';
import { PasswordResetCodeError } from './errors.ts';

/**
 * The `{ email, code, newPassword }` a caller submits.
 *
 * All three stay `unknown`: this service is where they are interpreted, so it cannot assume the
 * caller validated them. There is deliberately NO `userId`, `businessId`, `role`, `status` or
 * `firebaseUid` field — the account comes from the challenge row, so a body carrying any of those
 * is inert by construction rather than rejected by a check someone could later delete.
 */
export interface ConfirmPasswordResetCodeInput {
  email?: unknown;
  code?: unknown;
  newPassword?: unknown;
}

const INVALID_CODE_MESSAGE =
  'That password reset code is invalid or has expired. Please request a new one.';

const NOT_CONFIGURED_MESSAGE =
  'Password reset is temporarily unavailable. Please try again later.';

const ACTIVE_STATUS = 'ACTIVE';

function invalidCode() {
  return new PasswordResetCodeError(INVALID_PASSWORD_RESET_CODE, INVALID_CODE_MESSAGE);
}

function notConfigured() {
  return new PasswordResetCodeError(PASSWORD_RESET_CODE_NOT_CONFIGURED, NOT_CONFIGURED_MESSAGE);
}

/** Records a refusal. Fixed event name, no identifier and no value — not the code, not the address. */
function logRefused(reason: string) {
  logError({
    type: PASSWORD_RESET_CODE_LOG_EVENTS.FAILED,
    reason,
    message: '[password-reset-code] a reset code was not accepted',
  });
}

/** Records a completed reset. No address, no uid, no code. */
function logCompleted() {
  logInfo({
    type: PASSWORD_RESET_CODE_LOG_EVENTS.COMPLETED,
    message: '[password-reset-code] a password was reset with an emailed code',
  });
}

/**
 * Records that the password changed but the refresh-token revocation did not complete.
 *
 * A separate event because it is a different operational fact, and a fixed reason because the
 * upstream message may be produced by a library that was handed the credential.
 */
function logRevokeFailed(err: unknown) {
  const reason =
    typeof (err as { reason?: unknown } | null)?.reason === 'string'
      ? String((err as { reason: string }).reason)
      : 'unknown';

  logError({
    type: PASSWORD_RESET_CODE_LOG_EVENTS.REVOKE_FAILED,
    reason,
    message:
      '[password-reset-code] the password changed but Firebase refresh tokens could not be revoked',
  });
}

/**
 * Records a failed audit write. Never throws — see the note at its call site.
 *
 * Carries a fixed reason and no upstream message: the audit layer's error is not a credential, but
 * this is still a record written on an unauthenticated path, and the closed-set reason is what an
 * operator greps for anyway.
 */
function logAuditFailed() {
  logError({
    type: PASSWORD_RESET_CODE_LOG_EVENTS.FAILED,
    reason: 'audit_write_failed',
    message: '[password-reset-code] the audit record could not be written (the reset itself is unaffected)',
  });
}

/**
 * Spend a reset code and replace the account's password.
 *
 * Resolves with `{ changedAt }` on success. Throws:
 *
 *   * `PasswordResetCodeError` `PASSWORD_RESET_CODE_NOT_CONFIGURED` for an unusable pepper;
 *   * `PasswordResetCodeError` `INVALID_PASSWORD_RESET_CODE` for a blank code, a reservation miss,
 *     a digest mismatch, or an account that is no longer writable;
 *   * the unchanged, classified Firebase errors from the Admin bridge — with `usedAt` left unset.
 */
export async function confirmPasswordResetCode({
  email,
  code,
  newPassword,
}: ConfirmPasswordResetCodeInput = {}): Promise<{ changedAt: Date }> {
  // ---- 1. One instant for every predicate and for the `usedAt` stamp. -----------------
  const now = new Date();

  // ---- 2. A server that cannot key a digest cannot verify a code. --------------------
  if (!isPasswordResetCodeConfigured()) throw notConfigured();

  // ---- 3. Refuse a blank code before any database work. ------------------------------
  const raw = typeof code === 'string' ? code.trim() : '';
  if (!raw) {
    logRefused('blank_code');
    throw invalidCode();
  }

  const pepper = passwordResetCodePepper();
  const address = normalizeEmail(email);

  // ---- 4. One atomic reservation. ---------------------------------------------------
  // The whole gate is this predicate — address, liveness, expiry and the attempt cap — and the
  // only effect is one increment. `findOneAndUpdate` runs no schema validators and nothing else is
  // written, so there is no required field to forget. No upsert: a missing challenge must NOT be
  // created by a guess.
  const reserved = await PasswordResetChallenge.findOneAndUpdate(
    {
      emailHmac: hashResetEmail(pepper, address),
      usedAt: null,
      expiresAt: { $gt: now },
      attempts: { $lt: PASSWORD_RESET_CODE_MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },
    { returnDocument: 'after' }
  );

  // ---- 5. A miss is one indistinguishable refusal. ----------------------------------
  if (!reserved) {
    logRefused('invalid_code');
    throw invalidCode();
  }

  // ---- 6. Compare the digest, with the attempt already spent. ------------------------
  if (!resetDigestMatches(reserved.codeHmac, hashResetCode(pepper, raw))) {
    logRefused('invalid_code');
    throw invalidCode();
  }

  // ---- 7. The account is the one the challenge named. -------------------------------
  // Never the submitted address: that value only addressed the challenge.
  const user = await User.findById(reserved.userId);
  if (!user || user.status !== ACTIVE_STATUS) {
    logRefused('account_not_writable');
    throw invalidCode();
  }
  if (typeof user.firebaseUid !== 'string' || user.firebaseUid.trim() === '') {
    logRefused('account_not_writable');
    throw invalidCode();
  }

  // ---- 8. The credential write, first, and it fails honestly. ------------------------
  // The error travels unchanged; no HTTP status is decided here. `usedAt` stays unset, so the
  // code remains retryable at the cost of the attempt already reserved — the AUTH-04 AD-12
  // ordering, stated rather than hidden.
  await updateFirebaseUserPassword(user.firebaseUid, newPassword);

  // ---- 9. The stamp `authenticate.ts` compares a token's `iat` against. --------------
  const changedAt = now;
  await User.updateOne({ _id: user._id }, { $set: { passwordChangedAt: changedAt } });

  // ---- 10. End every session, closing the same-second hole the stamp cannot. --------
  await revokeAllSessions({ userId: user._id, businessId: user.businessId, now });

  // ---- 11. Best effort: invalidate the identity's refresh tokens too. --------------
  // Not fatal — the password has changed and the sessions are gone — but recorded, so the residual
  // is visible rather than assumed away.
  try {
    await revokeFirebaseRefreshTokens(user.firebaseUid);
  } catch (err) {
    logRevokeFailed(err);
  }

  // ---- 12. Consume, non-fatally. ----------------------------------------------------
  // The result is deliberately NOT asserted: a concurrent valid confirmation may already have
  // transitioned `usedAt`, which is the intended behaviour rather than a failure of this request.
  await PasswordResetChallenge.findOneAndUpdate(
    { _id: reserved._id, usedAt: null },
    { $set: { usedAt: now } }
  );

  // ---- 13. The audit row, non-fatal. ------------------------------------------------
  try {
    await recordAudit({
      businessId: user.businessId,
      userId: user._id,
      action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
      entityType: AUDIT_ENTITY_TYPES.USER,
      entityId: user._id,
    });
  } catch {
    logAuditFailed();
  }

  logCompleted();
  return { changedAt };
}

export default { confirmPasswordResetCode };
