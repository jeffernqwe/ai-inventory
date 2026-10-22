/**
 * The password-reset code service boundary.
 *
 * This is the only module the rest of the application imports for the in-app reset flow. Callers
 * depend on these three operations and on the error class re-exported here, and on nothing else:
 * they never learn about the challenge collection, the pepper, the digests, the cooldown or the
 * Admin bridge behind them. The cooldown deliberately has NO accessor: it is a silent no-op on a
 * public route (see `request.ts`), because a number that describes the wait would also describe
 * whether the address has an account.
 *
 *   requestPasswordResetCode({ email })                  — resolve `undefined` on every non-error
 *                                                          path, so a controller has nothing to
 *                                                          reflect and enumeration stays
 *                                                          impossible by construction.
 *   verifyPasswordResetCode({ email, code })             — resolve `{ resetToken, expiresInSeconds }`
 *                                                          when the code is correct. The token is
 *                                                          the ONLY thing that authorizes the
 *                                                          password write.
 *   confirmPasswordResetCode({ resetToken, newPassword })
 *                                                        — resolve `{ changedAt }` after the
 *                                                          password is written and every session
 *                                                          revoked.
 *
 * THE TWO-STEP SPLIT IS A SECURITY BOUNDARY, NOT A UI PREFERENCE. The code is proved on the first
 * step and spent there; the second step carries a short-lived, single-use authorization whose digest
 * is bound to the challenge, which is bound to the account. A client cannot reach the password write
 * by navigating to the second screen, because the screen holds nothing the server will accept
 * without having verified a code first.
 *
 * Note what these do NOT do: they do not decide an HTTP status, do not issue a session, and do not
 * read an Inventory AI JWT. The caller is, by definition, signed out.
 */

export { requestPasswordResetCode } from './request.ts';
export { verifyPasswordResetCode } from './verify.ts';
export { confirmPasswordResetCode } from './confirm.ts';
export { PasswordResetCodeError } from './errors.ts';

export type { RequestPasswordResetCodeInput } from './request.ts';
export type { VerifyPasswordResetCodeInput } from './verify.ts';
export type { ConfirmPasswordResetCodeInput } from './confirm.ts';

import { requestPasswordResetCode } from './request.ts';
import { verifyPasswordResetCode } from './verify.ts';
import { confirmPasswordResetCode } from './confirm.ts';
import { PasswordResetCodeError } from './errors.ts';

export default {
  requestPasswordResetCode,
  verifyPasswordResetCode,
  confirmPasswordResetCode,
  PasswordResetCodeError,
};
