/**
 * AUTH-06 (two-step recovery) — the reset-code VERIFY lifecycle.
 *
 * One exported operation: `verifyPasswordResetCode({ email, code })`. It checks a submitted
 * six-digit code against the caller's challenge and, only if the code is correct, mints the
 * one-time RESET AUTHORIZATION the new-password screen presents. It writes no password, issues no
 * session, and returns nothing but that authorization and its lifetime.
 *
 * WHY THIS IS A SEPARATE STEP RATHER THAN A UI DETAIL. The person now types the code on one screen
 * and the password on another, so something has to carry "this code was checked" between them. A
 * client boolean or a navigation flag would be a promise the client makes to itself, and the server
 * would still have to be willing to change a password for anyone who asked — which is exactly the
 * bypass this step removes. The carrier is therefore a server-minted, single-use, short-lived
 * credential whose digest lives on the challenge row, and the confirm step will not write a
 * password without it.
 *
 * THE ORDER OF THE STEPS IS THE DESIGN, and every reordering that looks harmless is not.
 *
 *   1. `now` IS READ ONCE, so the reservation, the expiry checks and the issued lifetime cannot
 *      disagree about what time it is.
 *
 *   2. THE CONFIGURATION QUESTION COMES BEFORE ANY DATABASE WORK. A server that cannot key a
 *      digest cannot verify anything, so trying would burn an attempt and answer a lie.
 *
 *   3. A BLANK CODE IS REFUSED BEFORE ANY DATABASE WORK, with the same single code as every other
 *      refusal: a client-side formatting bug must never spend an attempt on the person's behalf.
 *
 *   4. ONE ATOMIC RESERVATION, exactly as the single-step confirm performed it: a conditional
 *      `findOneAndUpdate` carrying the address digest, `usedAt: null`, `verifiedAt: null`, an
 *      unexpired `expiresAt` and `attempts` below the cap, whose only effect is `$inc: attempts`.
 *      `verifiedAt: null` in that predicate is what makes a code NON-REUSABLE: once a verification
 *      has succeeded, the row can never satisfy it again.
 *
 *   5. A MISS IS ONE INDISTINGUISHABLE REFUSAL — absent, already used, already verified, expired
 *      and exhausted all fail the same predicate and produce the same code, because telling them
 *      apart would describe account state a caller presenting a code is not entitled to.
 *
 *   6. THE DIGEST IS COMPARED AFTER THE RESERVATION, which is the attempt budget: a wrong code has
 *      already spent its attempt, so guessing is bounded to `MAX_ATTEMPTS` submissions per
 *      challenge. The comparison fails closed on anything unusable.
 *
 *   7. THE AUTHORIZATION IS MINTED IN MEMORY AND ONLY ITS DIGEST IS STORED, under its own domain
 *      label, so it can never be mistaken for a code digest or for an email-verification digest.
 *      The promotion is a second CONDITIONAL update (`verifiedAt: null`) rather than an
 *      unconditional write: two concurrent correct submissions must not each walk away with a
 *      distinct live authorization, and the loser must not be told it succeeded.
 *
 *   8. THE ROW'S `expiresAt` IS PUSHED FORWARD TO COVER THE AUTHORIZATION. The collection has a TTL
 *      index on `expiresAt`; without this the sweep could delete the row (and with it the only
 *      record of the authorization) while the person was still typing their new password.
 *
 * THE CODE IS NOT CONSUMED HERE (`usedAt` stays null), and that is deliberate: the TTL on the
 * authorization, not the code's own lifetime, decides how long the second step may take, and a
 * failed password write in step two must leave the authorization usable rather than forcing a new
 * email. What IS consumed is the code itself, by `verifiedAt` — replaying it is refused.
 */

import { error as logError, info as logInfo } from '../../utils/logger.ts';
import { normalizeEmail } from '../../utils/validate.ts';
import PasswordResetChallenge from '../../models/passwordResetChallenge.model.ts';
import {
  INVALID_PASSWORD_RESET_CODE,
  PASSWORD_RESET_AUTHORIZATION_TTL_MINUTES,
  PASSWORD_RESET_CODE_LOG_EVENTS,
  PASSWORD_RESET_CODE_MAX_ATTEMPTS,
  PASSWORD_RESET_CODE_NOT_CONFIGURED,
} from '../../constants/passwordResetCode.ts';
import { isPasswordResetCodeConfigured, passwordResetCodePepper } from '../../config/passwordResetCode.ts';
import {
  generateResetAuthorization,
  hashResetAuthorization,
  hashResetCode,
  hashResetEmail,
  resetDigestMatches,
} from './code.ts';
import { PasswordResetCodeError } from './errors.ts';

/**
 * The `{ email, code }` a caller submits.
 *
 * Both stay `unknown`: this service is where they are interpreted, so it cannot assume the caller
 * validated them. There is deliberately no `userId`, `businessId`, `role` or `firebaseUid` field —
 * the account is the one the challenge names, so a body carrying any of those is inert.
 */
export interface VerifyPasswordResetCodeInput {
  email?: unknown;
  code?: unknown;
}

const INVALID_CODE_MESSAGE =
  'That password reset code is invalid or has expired. Please request a new one.';

const NOT_CONFIGURED_MESSAGE =
  'Password reset is temporarily unavailable. Please try again later.';

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

/** Records a successful verification. No address, no uid, no code and no authorization. */
function logVerified() {
  logInfo({
    type: PASSWORD_RESET_CODE_LOG_EVENTS.CODE_VERIFIED,
    message: '[password-reset-code] a reset code was verified',
  });
}

/**
 * Verify a reset code and mint the one-time authorization for the password step.
 *
 * Resolves with `{ resetToken, expiresInSeconds }` when the code is correct. Throws:
 *
 *   * `PasswordResetCodeError` `PASSWORD_RESET_CODE_NOT_CONFIGURED` for an unusable pepper;
 *   * `PasswordResetCodeError` `INVALID_PASSWORD_RESET_CODE` for a blank code, a reservation miss
 *     or a digest mismatch.
 *
 * The returned token is a credential and is never logged. It lives only long enough to be handed
 * to the next screen.
 */
export async function verifyPasswordResetCode({
  email,
  code,
}: VerifyPasswordResetCodeInput = {}): Promise<{
  resetToken: string;
  expiresInSeconds: number;
}> {
  // ---- 1. One instant for the reservation and the issued lifetime. --------------------
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

  // ---- 4. One atomic reservation, with `verifiedAt: null` making the code single-use. --
  const reserved = await PasswordResetChallenge.findOneAndUpdate(
    {
      emailHmac: hashResetEmail(pepper, address),
      usedAt: null,
      verifiedAt: null,
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

  // ---- 7. Mint the authorization; only its digest is stored. ------------------------
  // A fresh CSPRNG value, never derived from the code: seeing one reset must not let a
  // caller compute another, and comparing digests (not values) is what the confirm path does.
  const resetToken = generateResetAuthorization();
  const authorizationExpiresAt = new Date(
    now.getTime() + PASSWORD_RESET_AUTHORIZATION_TTL_MINUTES * 60_000
  );

  const promoted = await PasswordResetChallenge.findOneAndUpdate(
    { _id: reserved._id, verifiedAt: null, usedAt: null },
    {
      $set: {
        verifiedAt: now,
        authorizationHmac: hashResetAuthorization(pepper, resetToken),
        authorizationExpiresAt,
      },
      // See step 8: the TTL index must not delete a row whose authorization is still live.
      $max: { expiresAt: authorizationExpiresAt },
    }
  );

  // Lost a race with a concurrent correct submission: the code was already spent by that one,
  // and this caller must not receive a second live authorization for the same code.
  if (!promoted) {
    logRefused('already_verified');
    throw invalidCode();
  }

  logVerified();

  // ---- 9. The token leaves only to the caller that just proved the code. -------------
  return {
    resetToken,
    expiresInSeconds: PASSWORD_RESET_AUTHORIZATION_TTL_MINUTES * 60,
  };
}

export default { verifyPasswordResetCode };
