/**
 * AUTH-06 (two-step recovery) — the reset-code CONFIRM lifecycle.
 *
 * One exported operation: `confirmPasswordResetCode({ resetToken, newPassword })`. It spends the
 * one-time authorization a successful code verification minted and — only then — replaces the
 * account's password through Firebase, stamps `passwordChangedAt`, and revokes every existing
 * session.
 *
 * WHY IT NO LONGER TAKES A CODE. The code is verified on its own screen, and this step runs after
 * it. Accepting a code here as well would mean two paths to the same write, one of which would
 * have to re-implement the guess budget; and a flow that could complete from this screen alone
 * would be a flow a client could reach by navigation rather than by proof. So the only thing this
 * step accepts is the authorization the verify step issued, and the only way to hold one is to have
 * presented a correct code.
 *
 * THE ORDER OF THE STEPS IS THE DESIGN.
 *
 *   1. `now` IS READ ONCE. Every predicate and the `usedAt` stamp derive from one instant, so the
 *      lookup, the expiry check and the consumption cannot disagree about what time it is.
 *
 *   2. THE CONFIGURATION QUESTION COMES BEFORE ANY DATABASE WORK: without the pepper nothing can be
 *      compared, so trying would answer a lie.
 *
 *   3. A BLANK TOKEN IS REFUSED BEFORE ANY DATABASE WORK, with the one generic code: a client-side
 *      bug must never look like an expired authorization to the person.
 *
 *   4. THE CHALLENGE IS FOUND BY THE AUTHORIZATION'S DIGEST, never by an address. The token is the
 *      only thing the caller supplies, so it is the only thing that can choose a row — and a row is
 *      what names the account. That is the binding the requirement asks for: the authorization
 *      belongs to one challenge, the challenge to one account, and neither can be re-pointed by a
 *      submitted email, a `userId` or a `businessId` (there is no such field here at all).
 *
 *   5. ONE INDISTINGUISHABLE REFUSAL for missing, unknown, expired and already-used authorizations.
 *      Telling them apart would describe account state to a caller who has proved nothing.
 *
 *   6. THE ACCOUNT IS THE ONE THE CHALLENGE NAMED. A row whose user has since been removed,
 *      disabled or lost its `firebaseUid` answers the SAME refusal, because it is the same class of
 *      fact.
 *
 *   7. THE PASSWORD IS WRITTEN THROUGH THE ADMIN BRIDGE, FIRST, AND FAILS HONESTLY. On failure the
 *      classified domain error propagates unchanged and `usedAt` is NOT set — so the authorization
 *      stays usable for its remaining lifetime, at no cost, which is the reason a transient outage
 *      does not force a new email.
 *
 *   8/9. THE STAMP AND THE REVOCATION COME NEXT, IN THAT ORDER, AND NEVER BOTH SKIPPED. The
 *      `passwordChangedAt` stamp is what `authenticate.ts` compares a token's `iat` against, and
 *      `revokeAllSessions` closes the same-second hole the integer-second comparison cannot.
 *
 *   10. THE REFRESH-TOKEN REVOCATION IS BEST EFFORT. By this point the password has changed and
 *       every Inventory AI session is ended, so failing the request would report a false failure.
 *
 *   11. THE CONSUME IS SEPARATE AND NON-FATAL. Only after the password write succeeds is `usedAt`
 *       stamped, with the predicate `{ _id, usedAt: null }`, and the result is deliberately not
 *       asserted: two concurrent valid confirmations both reach the Admin write, and only one may
 *       transition `usedAt`, so the loser's miss means "already consumed microseconds ago". WHAT IS
 *       GUARANTEED is the property that matters: once consumed, the same authorization can never
 *       start a second reset, and a replay is refused by predicate (4).
 *
 *   12. THE AUDIT ROW IS WRITTEN LAST AND IS NON-FATAL, exactly as before: a password change is
 *       the governance event the trail exists for, but reporting a failure after the password has
 *       changed would invite an attempt that cannot help.
 *
 * NOTHING HERE LOGS OR RETURNS A TOKEN, A CODE OR A PASSWORD: the new password is an argument that
 * goes to the Admin boundary, and nothing in this module retains it.
 */

import { error as logError, info as logInfo } from '../../utils/logger.ts';
import User from '../../models/user.model.ts';
import PasswordResetChallenge from '../../models/passwordResetChallenge.model.ts';
import {
  INVALID_PASSWORD_RESET_AUTHORIZATION,
  PASSWORD_RESET_CODE_LOG_EVENTS,
  PASSWORD_RESET_CODE_NOT_CONFIGURED,
} from '../../constants/passwordResetCode.ts';
import { isPasswordResetCodeConfigured, passwordResetCodePepper } from '../../config/passwordResetCode.ts';
import { revokeAllSessions } from '../session.service.ts';
import { recordAudit } from '../audit.service.ts';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../constants/audit.ts';
import { revokeFirebaseRefreshTokens, updateFirebaseUserPassword } from '../firebase/passwordUpdater.ts';
import { hashResetAuthorization } from './code.ts';
import { PasswordResetCodeError } from './errors.ts';

/**
 * The `{ resetToken, newPassword }` a caller submits.
 *
 * Both stay `unknown`: this service is where they are interpreted, so it cannot assume the caller
 * validated them. There is deliberately no `email`, `code`, `userId`, `businessId`, `role` or
 * `firebaseUid` field — the account comes from the challenge the token addresses, so a body
 * carrying any of those is inert by construction rather than rejected by a check someone could
 * later delete.
 */
export interface ConfirmPasswordResetCodeInput {
  resetToken?: unknown;
  newPassword?: unknown;
}

const INVALID_TOKEN_MESSAGE =
  'That verification has expired. Please verify your reset code again.';

const NOT_CONFIGURED_MESSAGE =
  'Password reset is temporarily unavailable. Please try again later.';

const ACTIVE_STATUS = 'ACTIVE';

function invalidToken() {
  return new PasswordResetCodeError(INVALID_PASSWORD_RESET_AUTHORIZATION, INVALID_TOKEN_MESSAGE);
}

function notConfigured() {
  return new PasswordResetCodeError(PASSWORD_RESET_CODE_NOT_CONFIGURED, NOT_CONFIGURED_MESSAGE);
}

/** Records a refusal. Fixed event name, no identifier and no value. */
function logRefused(reason: string) {
  logError({
    type: PASSWORD_RESET_CODE_LOG_EVENTS.FAILED,
    reason,
    message: '[password-reset-code] a reset authorization was not accepted',
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
 * this is still a record written on an unauthenticated path.
 */
function logAuditFailed() {
  logError({
    type: PASSWORD_RESET_CODE_LOG_EVENTS.FAILED,
    reason: 'audit_write_failed',
    message: '[password-reset-code] the audit record could not be written (the reset itself is unaffected)',
  });
}

/**
 * Spend a verified reset authorization and replace the account's password.
 *
 * Resolves with `{ changedAt }` on success. Throws:
 *
 *   * `PasswordResetCodeError` `PASSWORD_RESET_CODE_NOT_CONFIGURED` for an unusable pepper;
 *   * `PasswordResetCodeError` `INVALID_PASSWORD_RESET_AUTHORIZATION` for a blank token, an unknown
 *     token, an expired or already-used one, or an account that is no longer writable;
 *   * the unchanged, classified Firebase errors from the Admin bridge — with `usedAt` left unset.
 */
export async function confirmPasswordResetCode({
  resetToken,
  newPassword,
}: ConfirmPasswordResetCodeInput = {}): Promise<{ changedAt: Date }> {
  // ---- 1. One instant for every predicate and for the `usedAt` stamp. -----------------
  const now = new Date();

  // ---- 2. A server that cannot key a digest cannot verify a token. -------------------
  if (!isPasswordResetCodeConfigured()) throw notConfigured();

  // ---- 3. Refuse a blank token before any database work. -----------------------------
  const raw = typeof resetToken === 'string' ? resetToken.trim() : '';
  if (!raw) {
    logRefused('blank_token');
    throw invalidToken();
  }

  const pepper = passwordResetCodePepper();

  // ---- 4/5. Find the challenge the authorization belongs to, or refuse indistinguishably.
  // `verifiedAt: { $ne: null }` is belt-and-braces: an authorization digest is only ever written
  // by a successful verification, so a row that has one must have passed through that path.
  const challenge = await PasswordResetChallenge.findOne({
    authorizationHmac: hashResetAuthorization(pepper, raw),
    usedAt: null,
    verifiedAt: { $ne: null },
    authorizationExpiresAt: { $gt: now },
  });

  if (!challenge) {
    logRefused('invalid_authorization');
    throw invalidToken();
  }

  // ---- 6. The account is the one the challenge named. -------------------------------
  const user = await User.findById(challenge.userId);
  if (!user || user.status !== ACTIVE_STATUS) {
    logRefused('account_not_writable');
    throw invalidToken();
  }
  if (typeof user.firebaseUid !== 'string' || user.firebaseUid.trim() === '') {
    logRefused('account_not_writable');
    throw invalidToken();
  }

  // ---- 7. The credential write, first, and it fails honestly. -----------------------
  // The error travels unchanged; no HTTP status is decided here. `usedAt` stays unset, so the
  // authorization remains usable for its remaining lifetime.
  await updateFirebaseUserPassword(user.firebaseUid, newPassword);

  // ---- 8. The stamp `authenticate.ts` compares a token's `iat` against. -------------
  const changedAt = now;
  await User.updateOne({ _id: user._id }, { $set: { passwordChangedAt: changedAt } });

  // ---- 9. End every session, closing the same-second hole the stamp cannot. --------
  await revokeAllSessions({ userId: user._id, businessId: user.businessId, now });

  // ---- 10. Best effort: invalidate the identity's refresh tokens too. --------------
  try {
    await revokeFirebaseRefreshTokens(user.firebaseUid);
  } catch (err) {
    logRevokeFailed(err);
  }

  // ---- 11. Consume, non-fatally. ---------------------------------------------------
  // Deliberately not asserted — see the header: a concurrent confirmation may already have
  // transitioned `usedAt`, and that is the intended single-use outcome rather than a failure.
  await PasswordResetChallenge.findOneAndUpdate(
    { _id: challenge._id, usedAt: null },
    { $set: { usedAt: now } }
  );

  // ---- 12. The audit row, non-fatal. -----------------------------------------------
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
