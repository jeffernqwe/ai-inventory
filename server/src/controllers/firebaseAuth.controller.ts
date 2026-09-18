/**
 * Phase 32C — the Firebase authentication HTTP surface.
 *
 * Two PUBLIC routes, and the ONLY place a Firebase domain failure becomes an HTTP
 * status:
 *
 *   POST /api/auth/firebase/exchange — a verified Firebase ID token becomes an
 *                                      Inventory AI application session.
 *   POST /api/auth/firebase/register — a verified Firebase identity with no tenant
 *                                      gets a Business and its OWNER user.
 *
 * WHY THIS IS ITS OWN FILE, following passwordReset.controller.ts: the services
 * this file calls throw two DIFFERENT kinds of error. `firebaseAuth.service.ts`
 * throws `ApiError(status, message, code)`, like every other service, and those
 * propagate untouched. But `verifyFirebaseIdToken` throws the Phase 32B
 * `FirebaseNotConfigured` / `FirebaseTokenError`, which deliberately carry a
 * stable `code` and NO HTTP status — they are domain errors, and something has to
 * translate. Keeping that translation in one small file (rather than teaching
 * `auth.controller.ts` a second convention, or — much worse — letting an
 * unstatused error reach the global handler as a 500) makes the boundary
 * auditable at a glance. The pattern is `mapPasswordResetFailure` and
 * `mapAiFailure`, which do the same job for their layers.
 *
 * WHY THE ROUTES ARE PUBLIC, and why that is not a relaxation: the caller is
 * proving an identity with a Firebase credential precisely BECAUSE they do not
 * hold an Inventory AI JWT — that is what the exchange is for. Requiring
 * `requireAuth` here would make the endpoint able to mint only sessions that
 * already exist. Both routes are rate-limited, and neither reads an identity, a
 * tenant or a role from the request.
 *
 * NEITHER ROUTE LETS A `FIREBASE_*` CODE REACH THE CLIENT'S SESSION-LOSS HANDLER,
 * which is the hazard the Phase 32B error layer warns about. The mobile client
 * reports session loss only when a request CARRIED a token
 * (`if (token && (res.status === 401 || res.status === 403))` in lib/client.ts),
 * and both wrappers for these routes are tokenless by construction. The property
 * is therefore structural, not a promise: a 401 here cannot clear a client's
 * session, because the request that produced it had no session to clear.
 */

import type { Request, Response } from 'express';

import { validateFirebaseExchange, validateFirebaseRegister } from '../utils/validate.ts';
import {
  exchangeFirebaseSession,
  registerBusinessFromFirebase,
} from '../services/firebaseAuth.service.ts';
import { toPublicUser } from '../services/auth.service.ts';
import {
  FirebaseNotConfigured,
  FirebaseTokenError,
  FIREBASE_NOT_CONFIGURED,
  FIREBASE_TOKEN_INVALID,
} from '../services/firebase/index.ts';
import { throwValidation } from '../utils/errors.ts';
import { error as logError } from '../utils/logger.ts';
import ApiError from '../utils/ApiError.ts';
import env from '../config/env.ts';

// ---------------------------------------------------------------------------
// Fixed client-facing copy
// ---------------------------------------------------------------------------

/**
 * Fixed here rather than relayed from the Firebase error layer, for the reason
 * Phase 26B-3 established for mail: an upstream message is an exfiltration
 * surface and an operator-facing string must not reach an unauthenticated caller.
 *
 * It is ALSO deliberately generic across every rejection reason. `FirebaseTokenError`
 * carries an allowlisted `reason` (`auth/id-token-expired`, `auth/argument-error`,
 * ...) for the log; telling the caller WHICH reason applied would let them
 * distinguish an expired token from a forged one, which is information about a
 * credential they do not hold. One message, one code, for all of them — the same
 * shape Phase 26B-2 chose for the six reset-token rejection reasons.
 */
const FIREBASE_TOKEN_INVALID_MESSAGE = 'This sign-in could not be verified. Please sign in again.';

/**
 * The operator case: no usable service account, so no token can be verified at
 * all. A 503, not a 401 — nothing about the CALLER'S credential was rejected and
 * no verification was attempted, exactly as MAIL_NOT_CONFIGURED is a 503 rather
 * than a delivery failure.
 *
 * Unlike the mail layer's equivalent, this one cannot be an enumeration oracle
 * even in principle: it is decided before the request body is even parsed into a
 * token, so every caller gets it identically and it reveals nothing about whether
 * any account exists. The copy still names no environment variable.
 */
const FIREBASE_NOT_CONFIGURED_MESSAGE =
  'Sign-in is temporarily unavailable. Please try again later.';

// ---------------------------------------------------------------------------
// Domain error -> HTTP
// ---------------------------------------------------------------------------

/**
 * The domain-error boundary, in one place. `ApiError`s raised by the service
 * (REGISTRATION_REQUIRED, ACCOUNT_DISABLED, BUSINESS_NOT_ACTIVE, EMAIL_IN_USE,
 * VALIDATION_ERROR) are returned UNCHANGED and propagate exactly as the password
 * login path's do — this function only translates the two Phase 32B classes.
 *
 * Anything unrecognised is returned unchanged as well, so a genuine programming
 * fault still reaches the global handler and becomes a generic 500 whose message
 * is never echoed to the client (`isServerError` in middlewares/errorHandler.ts).
 * Nothing here invents a replacement code.
 *
 * `err` is `unknown` because its only caller is a `catch` clause, following
 * `mapPasswordResetFailure` and `mapAiFailure`.
 */
function mapFirebaseFailure(err: unknown) {
  if (err instanceof FirebaseNotConfigured) {
    logError({
      type: 'firebase_not_configured',
      message: '[firebase] an ID token could not be verified because no service account is configured',
    });
    return new ApiError(503, FIREBASE_NOT_CONFIGURED_MESSAGE, FIREBASE_NOT_CONFIGURED);
  }

  if (err instanceof FirebaseTokenError) {
    // `reason` is the ONLY detail logged, and it is safe to log by construction:
    // `safeTokenReason` admits nothing but a short, plainly-shaped SDK code, so
    // the token the SDK was handed cannot reach this line. No identity is
    // recorded either — the reason is enough to tell a wave of expired tokens
    // from a wave of forged ones, and naming an account here would create the
    // oracle the response refuses to be.
    logError({
      type: 'firebase_token_rejected',
      reason: err.reason,
      message: `[firebase] ID token verification failed (${err.reason})`,
    });
    return new ApiError(401, FIREBASE_TOKEN_INVALID_MESSAGE, FIREBASE_TOKEN_INVALID);
  }

  return err;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/firebase/exchange — public, rate-limited.
 *
 * The response is byte-for-byte the shape `POST /api/auth/login` returns, which is
 * the point of Option B: the mobile session layer stores this token exactly as it
 * stores a password-login token, and `requireAuth` cannot tell the two apart
 * because there is nothing to tell apart — both are the same HS256 application
 * JWT naming a row in the same `sessions` collection.
 *
 * `tokenType` and `expiresIn` restate the login contract rather than deriving it,
 * because they describe THIS response. The token itself only ever comes from
 * `signAccessToken`; the Firebase ID token is consumed by the service and is not
 * a field of anything returned here.
 *
 * `firebaseUid`, `businessId`, `role` and `status` in the body are inert by
 * construction: `validateFirebaseExchange` returns only `idToken` and
 * `deviceLabel`, so there is no variable in this function holding a client-supplied
 * identity to pass by mistake.
 */
export async function firebaseExchange(req: Request, res: Response) {
  const body = req.body ?? {};
  const { problems, idToken, deviceLabel } = validateFirebaseExchange(body);
  if (problems.length > 0) throwValidation(problems);

  let result;
  try {
    result = await exchangeFirebaseSession({ idToken, deviceLabel });
  } catch (err) {
    throw mapFirebaseFailure(err);
  }

  return res.status(200).json({
    token: result.token,
    tokenType: 'Bearer',
    expiresIn: env.jwtExpiresIn,
    user: toPublicUser(result.user),
  });
}

/**
 * POST /api/auth/firebase/register — public, rate-limited.
 *
 * Answers 201 with the public user and business, and NO token, matching
 * `POST /api/auth/register` exactly: registration and session creation are
 * separate steps on both paths, so a client that registers and then fails to
 * exchange is in the same state either way.
 *
 * `businessName` and `name` are read from the body because they are profile data
 * the user types. Neither is an identity: the OWNER role, the ACTIVE status, the
 * `businessId` and the `firebaseUid` are all assigned server-side, and the email
 * comes from the verified token rather than from the request.
 */
export async function firebaseRegister(req: Request, res: Response) {
  const body = req.body ?? {};
  const { problems, idToken, businessName, name } = validateFirebaseRegister(body);
  if (problems.length > 0) throwValidation(problems);

  let result;
  try {
    result = await registerBusinessFromFirebase({ idToken, businessName: businessName!, name });
  } catch (err) {
    throw mapFirebaseFailure(err);
  }

  return res.status(201).json({
    user: toPublicUser(result.user),
    business: {
      id: String(result.business._id),
      name: result.business.name,
      status: result.business.status,
    },
  });
}

export default { firebaseExchange, firebaseRegister };
