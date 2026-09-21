/**
 * Phase 32C — the Firebase authentication HTTP surface.
 * Phase 32H — plus the authenticated identity-linking route.
 *
 * Three routes, and the ONLY place a Firebase domain failure becomes an HTTP
 * status:
 *
 *   POST /api/auth/firebase/exchange — a verified Firebase ID token becomes an
 *                                      Inventory AI application session. PUBLIC.
 *   POST /api/auth/firebase/register — a verified Firebase identity with no tenant
 *                                      gets a Business and its OWNER user. PUBLIC.
 *   POST /api/auth/firebase/link     — an AUTHENTICATED account adopts a verified
 *                                      Firebase identity (Phase 32H, below).
 *
 * The third route is the one that does NOT belong with the other two, and the
 * distinction is the whole of Phase 32H: exchange and register answer "who are
 * you?" with no prior session, while link answers "may this account, which has
 * already proved itself, carry this identity?" It is behind `requireAuth`, it reads
 * the account from `req.user` and the identity from the verified token's uid, and
 * it shares this file only so there is ONE translation of a Firebase domain error
 * rather than a second copy free to drift.
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
 * NEITHER PUBLIC ROUTE LETS A `FIREBASE_*` CODE REACH THE CLIENT'S SESSION-LOSS
 * HANDLER, which is the hazard the Phase 32B error layer warns about. The mobile
 * client reports session loss only when a request CARRIED a token
 * (`if (token && (res.status === 401 || res.status === 403))` in lib/client.ts),
 * and both wrappers for these routes are tokenless by construction. The property
 * is therefore structural, not a promise: a 401 here cannot clear a client's
 * session, because the request that produced it had no session to clear.
 *
 * THE LINK ROUTE INVERTS THAT ARGUMENT, WHICH IS WHY ITS ERRORS ARE MAPPED
 * DIFFERENTLY (see mapFirebaseLinkFailure below). It DOES carry a token, so a 401
 * from it would reach that same handler — and a rejected FIREBASE credential would
 * then destroy a perfectly valid Inventory AI session. The route therefore answers
 * a bad ID token with 400 rather than 401: the caller's session is not what failed,
 * their request payload is. The code is unchanged; only the status moves.
 */

import type { Request, Response } from 'express';

import { validateFirebaseExchange, validateFirebaseRegister, validateFirebaseLink } from '../utils/validate.ts';
import {
  exchangeFirebaseSession,
  registerBusinessFromFirebase,
} from '../services/firebaseAuth.service.ts';
import { linkFirebaseIdentity } from '../services/firebaseLink.service.ts';
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

/**
 * The request context the LINK handler reads, following `auth.controller.ts`,
 * `users.controller.ts` and `products.controller.ts`: declaring these fields on
 * Express's global `Request` would let any module read an authoritative-looking
 * `req.user` on a public route — and this file holds two of those, so the hazard
 * is not hypothetical here.
 *
 * Only the link handler is typed with it. The two public handlers keep the plain
 * `Request`, which is itself the statement that they must not read a user.
 *
 * `user` is optional because a handler is registered against Express's
 * `RequestHandler`, whose parameter is a plain `Request`; a required field would
 * make every route registration a type error. The read in the handler asserts with
 * `!` instead, justified by the route table: `routes/auth.routes.ts` registers
 * `/firebase/link` as `requireAuth, firebaseLink`, so the middleware has always run
 * by the time this handler executes.
 */
type AuthenticatedRequest = Request & {
  user?: { id: string; businessId: string };
};

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

/**
 * The link route's copy for the same underlying fact as
 * `FIREBASE_TOKEN_INVALID_MESSAGE`, and it differs by exactly the clause that
 * would otherwise be a lie. "Please sign in again" is correct advice to someone
 * whose only credential was the Firebase token they just presented; on the link
 * route the caller is already signed in to Inventory AI, so telling them to sign
 * in again reads as "your session is gone", which it is not and which the 400
 * below exists to avoid implying.
 *
 * The CODE is shared rather than duplicated. One fact — the ID token could not be
 * verified — keeps one code, so a client branching on codes has one branch
 * regardless of which route produced it; only the status and the sentence move.
 */
const FIREBASE_LINK_TOKEN_INVALID_MESSAGE =
  'This sign-in could not be verified. Please try again.';

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

/**
 * The link route's boundary. Delegates to `mapFirebaseFailure` — so there is still
 * exactly one place a Phase 32B domain error is interpreted — and then moves ONE
 * of its answers.
 *
 * WHY THE 401 BECOMES A 400. The client's session-loss rule keys on the HTTP
 * STATUS of a response to a request that carried a token, not on the code:
 * `if (token && (res.status === 401 || res.status === 403)) sessionLostHandler?.(error)`.
 * This route is authenticated, so every one of its responses is such a response.
 * A rejected Firebase credential is a bad REQUEST FIELD here — the caller's
 * Inventory AI session is untouched and still valid — but shipped as a 401 it
 * would be indistinguishable from a dead application token and would sign the user
 * out over an unrelated failure. 400 says what actually happened and falls outside
 * the rule.
 *
 * WHY IT IS KEYED ON THE CODE AND NOT THE STATUS. `mapFirebaseFailure` also
 * returns `ApiError`s it did not create, unchanged — including this module's own
 * 401 `AUTH_REQUIRED` for an account that vanished between `requireAuth` and the
 * handler. That 401 IS a genuine session problem and must stay a 401, so the
 * adjustment matches `FIREBASE_TOKEN_INVALID` specifically rather than "anything
 * that came back 401".
 *
 * `FirebaseNotConfigured` passes through untouched: its 503 is already outside the
 * rule and already correct, because nothing about the caller's credential was
 * rejected — the server simply cannot verify anything at all.
 */
function mapFirebaseLinkFailure(err: unknown) {
  const mapped = mapFirebaseFailure(err);
  if (mapped instanceof ApiError && mapped.code === FIREBASE_TOKEN_INVALID) {
    return new ApiError(400, FIREBASE_LINK_TOKEN_INVALID_MESSAGE, FIREBASE_TOKEN_INVALID);
  }
  return mapped;
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

/**
 * POST /api/auth/firebase/link — AUTHENTICATED (Phase 32H).
 *
 * Records that the CALLER'S OWN Inventory AI account carries the Firebase identity
 * a verified ID token names. It is the explicit "connect a provider" operation the
 * approved design requires — the one and only way a `firebaseUid` is attached to an
 * existing account — and it is deliberately the narrowest route in this file.
 *
 * THE ACCOUNT AND THE IDENTITY ARE BOTH SERVER-DERIVED, and that is the whole
 * security argument:
 *
 *   - `req.user.id` is the account, put there by `requireAuth` from the MongoDB
 *     document the request's own session resolves to. It is not read from the body,
 *     and `validateFirebaseLink` returns no `userId` field that could carry it.
 *   - the identity is `verifyFirebaseIdToken(idToken).uid` — a value narrowed from
 *     a token whose signature Google verified. `validateFirebaseLink` returns no
 *     `firebaseUid` field either, so a body naming an identity is inert.
 *   - `businessId` comes from `req.user`, never from the request, so this route
 *     cannot be used to reach across tenants; the service additionally never writes
 *     the field, so a link cannot MOVE an account either.
 *   - `role` and `status` are not read on any path, so there is nothing a caller
 *     could supply that would change what the linked account may do.
 *
 * WHY AUTHENTICATED AND NOT PUBLIC. Phase 32F §14A.4 makes an existing session the
 * primary ownership proof for an explicit linking operation: the caller has already
 * demonstrated they hold this account, which is precisely the evidence that was
 * missing in the exchange's email-collision refusal. Requiring `requireAuth` is not
 * a convenience — it IS the proof, and it is why this route may do what
 * `registerBusinessFromFirebase` must refuse.
 *
 * THE RESPONSE NAMES NOTHING SENSITIVE. `user` is `toPublicUser`'s allowlist and
 * carries no `firebaseUid`, so the route reports which account was linked and never
 * the identity attached to it. `linked` distinguishes the CASE A no-op from a real
 * attachment without either being an error: both are 200, because "this identity is
 * already yours" is the successful answer to an idempotent request, not a failure.
 *
 * A conflict — the identity belongs to another account, or this account already
 * owns a different one — is a 409 whose single code and single message do not say
 * which. See the service for why the two are deliberately indistinguishable to the
 * caller and separated only in the audit trail and the server log.
 */
export async function firebaseLink(req: AuthenticatedRequest, res: Response) {
  const body = req.body ?? {};
  const { problems, idToken } = validateFirebaseLink(body);
  if (problems.length > 0) throwValidation(problems);

  let result;
  try {
    result = await linkFirebaseIdentity({
      userId: req.user!.id,
      businessId: req.user!.businessId,
      idToken,
    });
  } catch (err) {
    throw mapFirebaseLinkFailure(err);
  }

  return res.status(200).json({
    linked: result.linked,
    user: toPublicUser(result.user),
  });
}

export default { firebaseExchange, firebaseRegister, firebaseLink };
