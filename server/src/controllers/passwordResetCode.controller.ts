/**
 * AUTH-06 — the in-app password-reset code HTTP surface.
 *
 * Two PUBLIC routes, and the ONLY place a reset-code domain failure becomes an HTTP status:
 *
 *   POST /api/auth/password-reset/code     — issue a six-digit reset code by email.
 *   POST /api/auth/password-reset/confirm  — spend that code and replace the password.
 *
 * WHY PUBLIC, AND WHY THAT IS NOT A CONCESSION. The person resetting a password has, by definition,
 * no usable password, so no session can be required without making the route useless. Nothing here
 * names a permission or reads `req.user`; the subject of the write is resolved server-side, from
 * the challenge the code belongs to.
 *
 * ENUMERATION RESISTANCE IS THE INVARIANT, and it is structural rather than reviewed:
 *
 *   * `requestPasswordResetCode` resolves `undefined` on every non-error path, so this controller
 *     has NO field it could reflect. `REQUEST_ACCEPTED` is one module constant returned from every
 *     non-error exit — a code sent, an unknown address, an ineligible account, and a delivery that
 *     failed are all the same bytes.
 *   * Its two refusals are both checked BEFORE the account lookup, so they are reachable
 *     identically for every caller and distinguish nothing: an unusable configuration is a 503, and
 *     an active resend cooldown is a 429.
 *
 * EVERY CALLER-FACING MESSAGE IS A CONTROLLER-OWNED CONSTANT. Nothing from a caught error ever
 * becomes a response field: not the service's message, not a Firebase reason, not an SDK code, not
 * a provider string. These endpoints are reachable without a session, which is exactly why.
 *
 * NOTHING HERE ISSUES A SESSION. A completed reset does not sign anyone in: it ends every existing
 * session and asks the person to sign in with the password they just chose. That is the opposite of
 * a convenience omitted — a reset that minted a session would turn a mailbox compromise into an
 * immediate account takeover.
 */

import type { Request, Response } from 'express';

import {
  validatePasswordResetCodeRequest,
  validatePasswordResetCodeConfirm,
} from '../utils/validate.ts';
import {
  requestPasswordResetCode,
  confirmPasswordResetCode,
  PasswordResetCodeError,
} from '../services/passwordResetCode/index.ts';
import {
  INVALID_PASSWORD_RESET_CODE,
  PASSWORD_RESET_CODE_MAIL_FAILED,
  PASSWORD_RESET_CODE_NOT_CONFIGURED,
} from '../constants/passwordResetCode.ts';
import { throwValidation } from '../utils/errors.ts';
import { error as logError } from '../utils/logger.ts';
import ApiError from '../utils/ApiError.ts';

// ---------------------------------------------------------------------------
// Fixed client-facing copy
// ---------------------------------------------------------------------------

/**
 * THE request response, returned from every non-error exit.
 *
 * The conditional clause is load-bearing rather than polite hedging: no such account, an ineligible
 * account, a discarded delivery failure and a real send all produce this sentence, because they
 * must be indistinguishable.
 */
const REQUEST_ACCEPTED_MESSAGE =
  'If an account exists for that email, a password reset code has been sent.';

/** THE confirm response — the same sentence change-password uses for the same outcome. */
const RESET_COMPLETED_MESSAGE = 'Password changed. Please sign in again.';

/** 503 — the flow cannot run (unusable pepper, or mail cannot be sent at all). */
const NOT_CONFIGURED_MESSAGE =
  'Password reset is temporarily unavailable. Please try again later.';

/**
 * 503 — a minted code could not be delivered.
 *
 * DELIBERATELY UNREACHABLE ON THE REQUEST PATH, and retained as a regression guard. The service
 * detaches the send and handles its rejection itself, so a delivery failure can never arrive here;
 * if a future change reintroduces an awaited delivery path, the failure would start arriving at
 * this mapper again, and without this branch it would fall through as a generic 500 — or, worse,
 * be answered with something only a real address could produce. It is what stops that regression
 * from being silent rather than what serves today's traffic.
 */
const MAIL_FAILED_MESSAGE = 'Password reset is temporarily unavailable. Please try again later.';

/**
 * 400 — one sentence for every refusal the service collapses into one code: wrong, expired,
 * already used and exhausted are intentionally indistinguishable.
 */
const INVALID_CODE_MESSAGE =
  'That password reset code is invalid or has expired. Please request a new one.';

// ---------------------------------------------------------------------------
// Domain error -> HTTP
// ---------------------------------------------------------------------------

/**
 * The domain-error boundary, in one place (mirrors `mapPasswordResetFailure`).
 *
 * Anything not recognised is returned UNCHANGED, so a genuine programming fault still reaches the
 * global handler and becomes a generic 500 whose message is never echoed to the client.
 */
function mapPasswordResetCodeFailure(err: unknown) {
  if (err instanceof PasswordResetCodeError) {
    if (err.code === PASSWORD_RESET_CODE_NOT_CONFIGURED) {
      logError({
        type: 'password_reset_code_not_configured',
        message: '[password-reset-code] the flow is not fully configured, so no code was issued',
      });
      return new ApiError(503, NOT_CONFIGURED_MESSAGE, PASSWORD_RESET_CODE_NOT_CONFIGURED);
    }

    // THERE IS NO COOLDOWN BRANCH, AND ITS ABSENCE IS THE DESIGN. The resend cooldown never
    // reaches this mapper: it resolves as an ordinary 202 with no send (see the service header),
    // because a 429 issued only when a challenge row exists would answer "does this address have
    // an account". The 429 a client can still receive on this route comes from the route
    // limiters, which are keyed on the submitted address and the caller's IP and are therefore
    // identical for both address classes.

    if (err.code === PASSWORD_RESET_CODE_MAIL_FAILED) {
      return new ApiError(503, MAIL_FAILED_MESSAGE, PASSWORD_RESET_CODE_MAIL_FAILED);
    }

    if (err.code === INVALID_PASSWORD_RESET_CODE) {
      return new ApiError(400, INVALID_CODE_MESSAGE, INVALID_PASSWORD_RESET_CODE);
    }

    // An unrecognised code on this class is a programming fault, not a contract.
    return err;
  }

  return err;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/password-reset/code — public, rate-limited per address and per IP.
 *
 * The body is read for `email` only; a `userId`, `businessId`, `role` or `status` in it has no
 * variable to travel through.
 */
export async function passwordResetCodeRequest(req: Request, res: Response) {
  const body = req.body ?? {};
  const { problems, email } = validatePasswordResetCodeRequest(body);
  if (problems.length > 0) throwValidation(problems);

  try {
    // Resolves `undefined` on every non-error path — there is nothing to reflect.
    await requestPasswordResetCode({ email });
  } catch (err) {
    throw mapPasswordResetCodeFailure(err);
  }

  return res.status(202).json({ message: REQUEST_ACCEPTED_MESSAGE });
}

/**
 * POST /api/auth/password-reset/confirm — public, rate-limited per IP.
 *
 * A malformed payload is refused by the VALIDATOR before the service runs, so it cannot spend an
 * attempt and cannot spend the code. A well-formed but wrong code reaches the service, which is the
 * sole owner of the code's semantics.
 */
export async function passwordResetCodeConfirm(req: Request, res: Response) {
  const body = req.body ?? {};
  const { problems, email, code, newPassword } = validatePasswordResetCodeConfirm(body);
  if (problems.length > 0) throwValidation(problems);

  try {
    await confirmPasswordResetCode({ email, code, newPassword });
  } catch (err) {
    throw mapPasswordResetCodeFailure(err);
  }

  return res.status(200).json({ message: RESET_COMPLETED_MESSAGE });
}

export default { passwordResetCodeRequest, passwordResetCodeConfirm };
