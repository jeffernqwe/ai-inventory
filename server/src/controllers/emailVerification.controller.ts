/**
 * AUTH-04-C — the email-verification code flow's HTTP surface.
 *
 * Two routes, and the ONLY place an email-verification domain failure becomes an
 * HTTP status:
 *
 *   POST /api/auth/email-verification/request — verify a Firebase ID token, then
 *     mint and mail a six-digit code. Pre-session Firebase-authenticated.
 *   POST /api/auth/email-verification/confirm — verify a Firebase ID token, then
 *     check a submitted code and bridge Firebase's `emailVerified = true`.
 *
 * WHY THIS IS ITS OWN FILE, following passwordReset.controller.ts and
 * firebaseAuth.controller.ts: the services this file calls throw two DIFFERENT
 * kinds of error. `requestEmailVerificationCode`/`confirmEmailVerificationCode`
 * throw `EmailVerificationError` (AUTH-04-B3/B4), which carries a stable `code`
 * and deliberately NO HTTP status — it is a domain error. `verifyFirebaseIdToken`
 * throws the Phase 32B `FirebaseNotConfigured` / `FirebaseTokenError` /
 * `FirebaseUnavailableError`, which do the same. Something has to translate, and
 * keeping that translation in one small file — rather than teaching
 * `auth.controller.ts` a second convention, or letting an unstatused error reach
 * the global handler as a 500 — makes the boundary auditable at a glance. The
 * pattern is `mapPasswordResetFailure`, `mapAiFailure` and `mapFirebaseFailure`,
 * which do the same job for their layers.
 *
 * WHY 400 AND NOT 401 FOR A REJECTED FIREBASE TOKEN. This is the one place the
 * AUTH-04 mapping deliberately DIVERGES from `mapFirebaseFailure` (which answers
 * a `FirebaseTokenError` with 401). The mobile client's session-loss rule is
 * `if (token && (res.status === 401 || res.status === 403)) sessionLostHandler?.(error)`
 * — keyed on the STATUS of a response to a request that CARRIED a token. A
 * rejected Firebase credential is a bad REQUEST FIELD, not a dead application
 * session, so shipping it as a 401 would be indistinguishable from an expired
 * Inventory JWT. 400 says what actually happened and falls outside that rule.
 * The design authority records this explicitly (§14C.10 error semantics).
 *
 * `mapAuthenticatedFirebaseFailure` solves a related problem for the AUTHENTICATED
 * Firebase routes, but it is deliberately NOT reused or exported here: its copy is
 * written for the identity-LINK route, and exporting a cross-controller mapper so
 * one phase can borrow its message would make every future controller a consumer of
 * a function named for a route it has nothing to do with. The three domain classes
 * are the shared contract, and each controller layer translates them for its own
 * surface — which is exactly what this file's mapper does.
 *
 * EVERY CALLER-FACING MESSAGE HERE IS A CONTROLLER-OWNED CONSTANT. Nothing from a
 * caught error object ever becomes a response field: not the service's own
 * message, not a Firebase `reason`, not an SDK code, not a provider string. The
 * endpoints are reachable without an Inventory AI session (the same reason
 * passwordReset.controller.ts fixes its copy), so a fixed constant is what makes
 * leakage impossible by construction rather than by review.
 *
 * NOTHING HERE ISSUES A SESSION. Confirmation is not a sign-in: it sets Firebase's
 * `emailVerified` and nothing else, and the Inventory AI session is still created
 * only by `POST /api/auth/firebase/exchange`. Both handlers therefore read no
 * `req.user`, name no permission and require no `requireAuth`.
 */

import type { Request, Response } from 'express';

import {
  validateEmailVerificationRequest,
  validateEmailVerificationConfirm,
} from '../utils/validate.ts';
import {
  requestEmailVerificationCode,
  confirmEmailVerificationCode,
  EmailVerificationError,
} from '../services/emailVerification/index.ts';
import {
  EMAIL_VERIFICATION_NOT_CONFIGURED,
  EMAIL_VERIFICATION_RATE_LIMITED,
  EMAIL_VERIFICATION_MAIL_FAILED,
  INVALID_VERIFICATION_CODE,
} from '../constants/emailVerification.ts';
import {
  FirebaseNotConfigured,
  FirebaseTokenError,
  FirebaseUnavailableError,
  FIREBASE_NOT_CONFIGURED,
  FIREBASE_TOKEN_INVALID,
  FIREBASE_UNAVAILABLE,
} from '../services/firebase/index.ts';
import { throwValidation } from '../utils/errors.ts';
import { error as logError } from '../utils/logger.ts';
import ApiError from '../utils/ApiError.ts';

// ---------------------------------------------------------------------------
// Fixed client-facing copy
// ---------------------------------------------------------------------------

/**
 * THE request response, returned from every non-error exit — including the
 * already-verified no-op below, which sends nothing at all.
 *
 * The conditional clause is therefore LOAD-BEARING rather than polite hedging:
 * AUTH-04-B3 returns early for an identity whose Firebase `email_verified` is
 * already true (AD-14), and the caller must get the same 200 whether a code was
 * mailed or the request was a no-op. A message that asserted a code had been sent
 * would simply be false on that path, and one that varied with the outcome would
 * describe account state the caller has no need to distinguish.
 */
const REQUEST_ACCEPTED_MESSAGE =
  'If that address needs verification, a verification code has been sent.';

/**
 * THE confirm response. Returned for a code that was just accepted AND for the
 * AD-14 short-circuit on an identity that was already verified — in both cases the
 * caller's address IS verified, so one sentence is accurate for both.
 */
const VERIFIED_MESSAGE = 'Email verified.';

/** 503 — the flow cannot run (missing pepper, or mail cannot be sent at all). */
const NOT_CONFIGURED_MESSAGE =
  'Email verification is temporarily unavailable. Please try again later.';

/**
 * 429 — the AD-17 per-identity RESEND COOLDOWN.
 *
 * DELIBERATELY NOT THE ROUTE LIMITER'S SENTENCE. Both refusals are 429s with the same
 * application code, but they are different facts: the limiter means "this IP has made too
 * many requests", while this one means "a code was issued for this identity moments ago".
 * It used to answer both with "Too many verification attempts", which was untrue for the
 * cooldown — the person has usually made one request, and nothing about their attempts was
 * excessive. The sentence now names the action that helps (wait, then request again) and
 * the route limiter's own handler in `middlewares/rateLimit.ts` keeps its own wording, so
 * each refusal describes the thing that actually happened.
 *
 * It says nothing about the identity: not the address, not the uid, not whether a code was
 * delivered. The `Retry-After` this refusal carries is the server's own remaining seconds.
 */
const RESEND_COOLDOWN_MESSAGE =
  'A verification code was requested recently. Please wait a moment before requesting another.';

/** 503 — the code was minted but could not be delivered (AD-17 B). */
const MAIL_FAILED_MESSAGE =
  'The verification email could not be sent. Please try again shortly.';

/**
 * 400 — one sentence for every refusal reason B4 collapses into one code: wrong,
 * expired, already used and exhausted are deliberately indistinguishable.
 */
const INVALID_CODE_MESSAGE =
  'That verification code is invalid or has expired. Please request a new one.';

/**
 * 400 — the Firebase ID token was rejected. Deliberately says nothing about WHY
 * (expired, revoked, forged, disabled, gone), because the SDK reason is exactly the
 * kind of credential detail a caller must not be able to read back, and because
 * "please try again" is the only action that helps in every one of those cases.
 * It does NOT say "sign in again": this route carries no Inventory AI session, so
 * that phrase would import a meaning about session loss that does not apply.
 */
const FIREBASE_TOKEN_INVALID_MESSAGE = 'This verification could not be completed. Please try again.';

/** 503 — no usable Firebase service account, so no token can be verified at all. */
const FIREBASE_NOT_CONFIGURED_MESSAGE =
  'Email verification is temporarily unavailable. Please try again later.';

/** 503 — Firebase/Google could not be reached to verify the credential. */
const FIREBASE_UNAVAILABLE_MESSAGE =
  'We could not complete verification right now. Please try again in a moment.';

// ---------------------------------------------------------------------------
// Domain error -> HTTP
// ---------------------------------------------------------------------------

/**
 * The domain-error boundary, in one place (mirrors `mapFirebaseFailure`).
 *
 * Anything not recognised is returned UNCHANGED, so a genuine programming fault
 * still reaches the global handler and becomes a generic 500 whose message is never
 * echoed to the client (`isServerError` in middlewares/errorHandler.ts). That also
 * covers the `ApiError` AUTH-04-B3 raises for a verified identity that carries no
 * usable email: it is a `400 VALIDATION_ERROR` with an `idToken` field problem, and
 * it propagates exactly as the identical registration failure does.
 *
 * `err` is `unknown` because its only caller is a `catch` clause: nothing about a
 * thrown value is known until the `instanceof` tests below decide.
 *
 * The three Firebase log records mirror `mapFirebaseFailure` deliberately, and they
 * are the reason this mapping is a copy rather than a delegation: `reason` is an
 * allowlisted SDK code (`safeTokenReason`) and never the token, and recording it is
 * what lets an operator tell a wave of expired tokens from a wave of forged ones.
 * No identity, uid, email or address is recorded on any of them.
 */
function mapEmailVerificationFailure(err: unknown) {
  if (err instanceof EmailVerificationError) {
    if (err.code === EMAIL_VERIFICATION_NOT_CONFIGURED) {
      return new ApiError(503, NOT_CONFIGURED_MESSAGE, EMAIL_VERIFICATION_NOT_CONFIGURED);
    }
    if (err.code === EMAIL_VERIFICATION_RATE_LIMITED) {
      return new ApiError(429, RESEND_COOLDOWN_MESSAGE, EMAIL_VERIFICATION_RATE_LIMITED);
    }
    if (err.code === EMAIL_VERIFICATION_MAIL_FAILED) {
      return new ApiError(503, MAIL_FAILED_MESSAGE, EMAIL_VERIFICATION_MAIL_FAILED);
    }
    if (err.code === INVALID_VERIFICATION_CODE) {
      return new ApiError(400, INVALID_CODE_MESSAGE, INVALID_VERIFICATION_CODE);
    }
    // An EmailVerificationError carrying an unrecognised code is a programming
    // fault, not a contract: return it unchanged so it becomes a generic 500
    // rather than being answered with a status this file invented.
    return err;
  }

  if (err instanceof FirebaseNotConfigured) {
    logError({
      type: 'firebase_not_configured',
      message: '[email-verification] a Firebase ID token could not be verified because no service account is configured',
    });
    return new ApiError(503, FIREBASE_NOT_CONFIGURED_MESSAGE, FIREBASE_NOT_CONFIGURED);
  }

  if (err instanceof FirebaseUnavailableError) {
    logError({
      type: 'firebase_unavailable',
      reason: err.reason,
      message: `[email-verification] Firebase ID token verification could not be completed (${err.reason})`,
    });
    return new ApiError(503, FIREBASE_UNAVAILABLE_MESSAGE, FIREBASE_UNAVAILABLE);
  }

  if (err instanceof FirebaseTokenError) {
    logError({
      type: 'firebase_token_rejected',
      reason: err.reason,
      message: `[email-verification] Firebase ID token verification failed (${err.reason})`,
    });
    // 400, NOT 401 — see the module header.
    return new ApiError(400, FIREBASE_TOKEN_INVALID_MESSAGE, FIREBASE_TOKEN_INVALID);
  }

  return err;
}

/**
 * AUTH-04-B3's resend cooldown is a DOMAIN refusal, not a route limiter, so nothing
 * upstream emits `Retry-After` for it — `express-rate-limit`'s draft-7 headers only
 * exist on the AD-19 limiter's 429. The remaining seconds are already computed by
 * B3 (`retryAfterSeconds`, clamped to `[1, 60]`) and are deliberately NOT secret:
 * they describe a wait the caller themselves caused.
 *
 * THE HEADER IS SET HERE RATHER THAN IN THE GLOBAL ERROR HANDLER, and that is the
 * whole point of doing it in this function. Adding a `Retry-After` branch to
 * middlewares/errorHandler.ts would make one endpoint family's transport detail a
 * property of every error in the application, and would put a second, different
 * place in the codebase that decides what a 429 says. Setting it on the response
 * object before the mapped `ApiError` is thrown is enough: the global handler's
 * `res.status(...).json(...)` sends whatever headers the response already carries.
 */
function applyRetryAfter(res: Response, err: unknown): void {
  if (err instanceof EmailVerificationError && typeof err.retryAfterSeconds === 'number') {
    res.set('Retry-After', String(err.retryAfterSeconds));
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/email-verification/request — pre-session Firebase-authenticated,
 * rate-limited per IP.
 *
 * `uid`, `email`, `userId`, `businessId`, `role` and `status` in the body are INERT
 * BY CONSTRUCTION: `validateEmailVerificationRequest` reads only `idToken`, so the
 * handler has no variable holding a client-supplied identity to pass by mistake. The
 * identity is the uid of the token the service verifies.
 */
export async function emailVerificationRequest(req: Request, res: Response) {
  const body = req.body ?? {};
  const { problems, idToken } = validateEmailVerificationRequest(body);
  if (problems.length > 0) throwValidation(problems);

  try {
    // Resolves `undefined` on every non-error path — there is nothing to reflect.
    await requestEmailVerificationCode({ idToken });
  } catch (err) {
    applyRetryAfter(res, err);
    throw mapEmailVerificationFailure(err);
  }

  return res.status(200).json({ message: REQUEST_ACCEPTED_MESSAGE });
}

/**
 * POST /api/auth/email-verification/confirm — pre-session Firebase-authenticated,
 * rate-limited per IP.
 *
 * A blank or absent `code` is refused by the VALIDATOR (`code is required`,
 * `VALIDATION_ERROR`) before the service is called, so a malformed submission can
 * never spend an attempt — the same split `resetPassword` applies to a missing
 * versus an invalid reset token. A PRESENT but wrong code is not shape-checked at
 * all: it reaches AUTH-04-B4, which is the sole owner of the code's semantics and
 * answers one indistinguishable `INVALID_VERIFICATION_CODE` for every refusal
 * reason.
 *
 * NO SESSION IS CREATED. This route proves a Firebase identity and sets Firebase's
 * `emailVerified`; it issues no JWT and writes no session row.
 */
export async function emailVerificationConfirm(req: Request, res: Response) {
  const body = req.body ?? {};
  const { problems, idToken, code } = validateEmailVerificationConfirm(body);
  if (problems.length > 0) throwValidation(problems);

  try {
    await confirmEmailVerificationCode({ idToken, code });
  } catch (err) {
    throw mapEmailVerificationFailure(err);
  }

  return res.status(200).json({ message: VERIFIED_MESSAGE });
}

export default { emailVerificationRequest, emailVerificationConfirm };
