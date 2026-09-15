/**
 * Phase 26B-3 — the password-recovery HTTP surface.
 *
 * Two unauthenticated routes, and the ONLY place a password-recovery domain
 * failure becomes an HTTP status:
 *
 *   POST /api/auth/forgot-password  — issue a single-use reset link by email.
 *   POST /api/auth/reset-password   — spend that link, once, to replace a password.
 *
 * WHY THIS IS ITS OWN FILE. Every other controller calls a service that throws
 * `ApiError(status, message, code)` and lets it propagate. Phase 26B-2's service
 * deliberately does NOT: it is the domain layer, so it carries a stable `code`
 * and no HTTP status, and something has to translate. Keeping that translation
 * in one small file — rather than teaching `auth.controller.js` a second
 * convention — makes the boundary auditable at a glance. The pattern is
 * `mapAiFailure` in ai.controller.js, which does the same job for the AI layer.
 *
 * ENUMERATION RESISTANCE IS THE INVARIANT HERE, and it is enforced structurally:
 *
 *   * `requestPasswordReset` returns `undefined` on every non-error path (26B-2),
 *     so this controller has NO field it could reflect. `REQUEST_ACCEPTED` below
 *     is a single module constant returned from every non-error exit.
 *   * A MAIL DELIVERY FAILURE IS ANSWERED WITH THAT SAME 202. The service can
 *     only reach the send after it has found a live, ACTIVE user in an active
 *     business — so a 503 there would be reachable ONLY for an address that
 *     exists, making it an account-existence oracle. The failure is therefore
 *     logged server-side and swallowed (approved decision D1, option B).
 *
 *     PHASE 28 B1 moved WHERE that happens, not whether: the service now detaches
 *     the send, so a delivery failure is caught and logged inside
 *     `logDetachedMailFailure` and never reaches this file. The 202 this
 *     controller returns is unchanged and still returned uniformly. The
 *     `MailDeliveryError` branch in `forgotPassword` is intentionally retained as
 *     a regression guard — see the comment at its call site for why deleting it
 *     would be the dangerous choice.
 *   * `MAIL_NOT_CONFIGURED` REMAINS A 503, because the service checks mail
 *     configuration BEFORE it looks the account up — every caller gets it
 *     identically, so it distinguishes nothing. Its client-facing copy is FIXED
 *     here rather than relayed, so no environment-variable name, provider name
 *     or transport detail reaches an unauthenticated caller (decision D2b).
 *
 * The service contract is consumed exactly as 26B-2 built it: no TTL, code,
 * message, audit action or token semantic is redefined here, and the domain
 * layer still carries no HTTP status.
 */

import {
  requestPasswordReset,
  resetPassword as resetPasswordService,
  PasswordResetError,
  VALIDATION_ERROR_CODE,
} from '../services/passwordReset.service.js';
import { validateForgotPassword, validateResetPassword } from '../utils/validate.ts';
import { MailNotConfigured, MailDeliveryError } from '../services/mail/index.ts';
import { throwValidation } from '../utils/errors.ts';
import { error as logError } from '../utils/logger.ts';
import ApiError from '../utils/ApiError.ts';

// ---------------------------------------------------------------------------
// Fixed client-facing copy
// ---------------------------------------------------------------------------

/**
 * THE response for the request path. Every non-error exit returns this exact
 * string, so "we sent you a link" and "no such account" cannot be told apart.
 * One constant, referenced from every path, so no future branch can quietly
 * start answering something more specific.
 */
const REQUEST_ACCEPTED_MESSAGE =
  'If an account exists for that email, a password reset link has been sent.';

/**
 * Fixed copy for the one mail failure a caller may see. It deliberately does not
 * repeat the mail layer's own message: that text names the environment
 * variables that are missing (`MAIL_PROVIDER`, `RESEND_API_KEY`, `MAIL_FROM`),
 * which is operator-facing detail appearing on an unauthenticated endpoint. The
 * operational reason is logged instead — see `logMailFailure`.
 */
const MAIL_NOT_CONFIGURED_MESSAGE =
  'Password reset is temporarily unavailable. Please try again later.';

/**
 * Deliberately NOT reachable from the request path — see the module comment and
 * `forgotPassword`. It exists so that if the reset path ever gains a mail step,
 * a `MAIL_*` code becomes a namespaced 503 rather than an unhandled 500.
 */
const MAIL_UNAVAILABLE_MESSAGE =
  'Password reset is temporarily unavailable. Please try again later.';

// Identical to change-password's message on purpose: the client shows one string
// for "your password changed, sign in again" whichever route produced it.
const RESET_COMPLETED_MESSAGE = 'Password changed. Please sign in again.';

// ---------------------------------------------------------------------------
// Domain error -> HTTP
// ---------------------------------------------------------------------------

/**
 * The domain-error boundary, in one place (mirrors `mapAiFailure`).
 *
 * Anything not recognised is returned UNCHANGED, so it propagates to the global
 * error handler and becomes a generic 500 whose message is never echoed to the
 * client (`isServerError` in middlewares/errorHandler.js). Nothing here invents
 * a replacement code — `INVALID_RESET_TOKEN`, `VALIDATION_ERROR`,
 * `MAIL_NOT_CONFIGURED` and `MAIL_UNAVAILABLE` are the codes 26B-1/26B-2 emit,
 * passed through as-is.
 */
function mapPasswordResetFailure(err) {
  if (err instanceof PasswordResetError) {
    if (err.code === VALIDATION_ERROR_CODE) {
      const mapped = new ApiError(400, 'Validation failed', VALIDATION_ERROR_CODE);
      if (Array.isArray(err.problems)) mapped.fields = err.problems;
      return mapped;
    }
    // INVALID_RESET_TOKEN: one code and one message for all six rejection
    // reasons, straight from the service — the controller does not narrow it.
    return new ApiError(400, err.message, err.code);
  }

  if (err instanceof MailNotConfigured) {
    logMailFailure(err, 'mail_not_configured');
    return new ApiError(503, MAIL_NOT_CONFIGURED_MESSAGE, err.code);
  }

  if (err instanceof MailDeliveryError) {
    logMailFailure(err, 'mail_delivery_failure');
    return new ApiError(503, MAIL_UNAVAILABLE_MESSAGE, err.code);
  }

  return err;
}

/**
 * Server-side record of a mail failure.
 *
 * This is what replaces the client-visible signal the request path gives up, so
 * it must carry the operational reason — the mail layer's error messages are
 * built from safe facts only (an HTTP status, a provider error name, "could not
 * be reached") and never a response body, a request payload or the reset URL.
 *
 * `userId` is deliberately ABSENT: this route is unauthenticated, so there is no
 * `req.user` — the same reason errorHandler's own requestContext omits it. The
 * account the failure concerned is not recorded either: a log naming it would be
 * the enumeration oracle the HTTP response refuses to be, and logs travel
 * further than responses do.
 */
function logMailFailure(err, type) {
  logError({
    type,
    message: `[password-reset] the recovery email could not be sent: ${err.message}`,
  });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/forgot-password — public, rate-limited.
 *
 * `userId`, `businessId`, `role` and `status` in the body are inert by
 * construction: the validator reads only `email`, and the service takes only
 * `{ email }`. The account is found from the submitted address alone.
 */
export async function forgotPassword(req, res) {
  const body = req.body ?? {};
  const { problems, email } = validateForgotPassword(body);
  if (problems.length > 0) throwValidation(problems);

  try {
    // Returns undefined on every non-error path — there is nothing to reflect.
    await requestPasswordReset({ email });
  } catch (err) {
    if (err instanceof MailDeliveryError) {
      // ★ RETAINED AS A REGRESSION GUARD (Phase 28 B1). This branch is
      //   deliberately NOT dead code to be deleted, and it is expected to be
      //   UNREACHABLE: since B1 the service detaches the send and handles its
      //   rejection itself (`logDetachedMailFailure`), so a delivery failure can
      //   no longer propagate to this frame. It is kept because if a future
      //   change ever reintroduces an awaited delivery path, the failure would
      //   start arriving HERE again — and without this branch it would fall
      //   through to `mapPasswordResetFailure`, answering a MAIL_* 503 for an
      //   address that exists. That is precisely the account-existence oracle
      //   decision D1 chose to avoid, so the guard is what stops the regression
      //   from being silent rather than what serves today's traffic.
      //
      //   ★ D1 (option B), the original reasoning, which still holds for any
      //   caller that reaches this line: by the time a delivery failure can be
      //   thrown the service has already found a live account, so answering 503
      //   would tell an attacker which addresses exist. The operator learns about
      //   it from the log record; the caller is answered exactly as an unknown
      //   address would be.
      logMailFailure(err, 'mail_delivery_failure');
      return res.status(202).json({ message: REQUEST_ACCEPTED_MESSAGE });
    }
    throw mapPasswordResetFailure(err);
  }

  return res.status(202).json({ message: REQUEST_ACCEPTED_MESSAGE });
}

/**
 * POST /api/auth/reset-password — public, rate-limited.
 *
 * `confirmPassword` is checked by the validator BEFORE this function calls the
 * service, and the validator does not return it — so a mistyped confirmation can
 * never spend a valid reset token, and there is no variable here to pass by
 * mistake. The service sees `{ token, newPassword }` and nothing else.
 */
export async function resetPassword(req, res) {
  const body = req.body ?? {};
  const { problems, token, newPassword } = validateResetPassword(body);
  if (problems.length > 0) throwValidation(problems);

  try {
    await resetPasswordService({ token, newPassword });
  } catch (err) {
    throw mapPasswordResetFailure(err);
  }

  return res.status(200).json({ message: RESET_COMPLETED_MESSAGE });
}

export default { forgotPassword, resetPassword };
