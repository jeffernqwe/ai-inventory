/**
 * The password-reset code service boundary.
 *
 * This is the only module the rest of the application imports for the in-app reset flow. Callers
 * depend on these two operations and on the error class re-exported here, and on nothing else:
 * they never learn about the challenge collection, the pepper, the digests, the cooldown or the
 * Admin bridge behind them. The cooldown deliberately has NO accessor any more: it is a silent
 * no-op on a public route (see `request.ts`), because a number that describes the wait would also
 * describe whether the address has an account.
 *
 *   requestPasswordResetCode({ email })                  — resolve `undefined` on every non-error
 *                                                          path, so a controller has nothing to
 *                                                          reflect and enumeration stays
 *                                                          impossible by construction.
 *   confirmPasswordResetCode({ email, code, newPassword })
 *                                                        — resolve `{ changedAt }` after the
 *                                                          password is written and every session
 *                                                          revoked.
 *
 * Note what these do NOT do: they do not decide an HTTP status, do not issue a session, and do not
 * read an Inventory AI JWT. The caller is, by definition, signed out.
 */

export { requestPasswordResetCode } from './request.ts';
export { confirmPasswordResetCode } from './confirm.ts';
export { PasswordResetCodeError } from './errors.ts';

export type { RequestPasswordResetCodeInput } from './request.ts';
export type { ConfirmPasswordResetCodeInput } from './confirm.ts';

import { requestPasswordResetCode } from './request.ts';
import { confirmPasswordResetCode } from './confirm.ts';
import { PasswordResetCodeError } from './errors.ts';

export default {
  requestPasswordResetCode,
  confirmPasswordResetCode,
  PasswordResetCodeError,
};
