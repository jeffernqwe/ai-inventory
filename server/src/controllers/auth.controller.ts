import type { Request, Response } from 'express';

import {
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateMeUpdate,
  validateLogout,
  validateAccountDeletion,
} from '../utils/validate.ts';
import {
  registerBusinessOwner,
  loginWithPassword,
  changePassword as changePasswordService,
  updateMyName,
  toPublicUser,
} from '../services/auth.service.ts';
import {
  listActiveSessions,
  revokeSessionById,
  revokeSessionByJti,
  revokeAllSessions,
  toPublicSession,
} from '../services/session.service.ts';
import { deleteOwnAccount } from '../services/accountDeletion.service.ts';
import ApiError from '../utils/ApiError.ts';
import env from '../config/env.ts';
import { accessTokenExpiresAt } from '../config/jwt.ts';
import {
  FirebaseNotConfigured,
  FirebaseTokenError,
  FirebaseUnavailableError,
  FIREBASE_NOT_CONFIGURED,
  FIREBASE_TOKEN_INVALID,
  FIREBASE_UNAVAILABLE,
} from '../services/firebase/index.ts';

/**
 * The request context this controller reads, following `users.controller.ts`,
 * `products.controller.ts` and `audit.controller.ts`: declaring these fields on
 * Express's global `Request` would let any module read an authoritative-looking
 * `req.user` on a public route.
 *
 * `user` and `auth` are optional for the same reason they are optional in
 * `middlewares/authenticate.ts`: a handler is registered against Express's
 * `RequestHandler`, whose parameter is a plain `Request`; required fields would
 * make that `Request` unassignable and every route registration a type error.
 * The reads below assert them with `!` instead, which is justified by the route
 * table — every route below the public block in `routes/auth.routes.ts` is
 * registered `requireAuth, controller`, so the middleware has always run by the
 * time these handlers execute. Optional chaining was NOT used: it would silently
 * pass `undefined` on where the code would previously have thrown, which is a
 * behaviour change.
 */
type AuthenticatedRequest = Request & {
  user?: { id: string; businessId: string };
  auth?: { sessionId: string; jti: string };
};

/**
 * POST /api/auth/register
 * Creates a Business + OWNER user. Returns 201 with public user/business.
 * No token is issued here — the client logs in next (spec §45 flow).
 */
export async function register(req: AuthenticatedRequest, res: Response) {
  const body = req.body ?? {};
  const problems = validateRegister(body);
  if (problems.length > 0) {
    const err = new ApiError(400, 'Validation failed', 'VALIDATION_ERROR');
    err.fields = problems;
    throw err;
  }

  const { user, business } = await registerBusinessOwner({
    businessName: body.businessName,
    name: body.name,
    email: body.email,
    password: body.password,
  });

  return res.status(201).json({
    user: toPublicUser(user),
    business: { id: String(business._id), name: business.name, status: business.status },
  });
}

/**
 * POST /api/auth/login
 * Returns { token, tokenType, expiresIn, user } on success.
 *
 * `deviceLabel` is an optional, cosmetic hint from the client ("Pixel 7"), shown
 * back in the session list so a user can tell their devices apart. It is coerced
 * rather than validated: a malformed label must never be able to fail a login.
 */
export async function login(req: AuthenticatedRequest, res: Response) {
  const body = req.body ?? {};
  const problems = validateLogin(body);
  if (problems.length > 0) {
    const err = new ApiError(400, 'Validation failed', 'VALIDATION_ERROR');
    err.fields = problems;
    throw err;
  }

  const { token, user, session } = await loginWithPassword({
    email: body.email,
    password: body.password,
    deviceLabel: body.deviceLabel,
  });

  // AUTH-03: `expiresIn` is retained, and two ABSOLUTE instants are added so the
  // client can compute its authentication horizon as
  // `min(tokenExpiresAt, sessionExpiresAt)`. They are the earlier boundary wins:
  // the JWT lives ~1h, but the session's 14-day cap can end BEFORE it does. Adding
  // them is purely additive — no existing consumer reads a response it can no
  // longer parse.
  return res.status(200).json({
    token,
    tokenType: 'Bearer',
    expiresIn: env.jwtExpiresIn,
    tokenExpiresAt: accessTokenExpiresAt(token),
    sessionExpiresAt: session.expiresAt,
    user: toPublicUser(user),
  });
}

/**
 * GET /api/auth/me
 * Protected by requireAuth. req.user is the server-authoritative current user.
 */
export async function me(req: AuthenticatedRequest, res: Response) {
  return res.status(200).json({ user: req.user });
}

/**
 * POST /api/auth/change-password (Phase 15). Protected by requireAuth. Verifies
 * the current password, replaces the hash, and stamps passwordChangedAt —
 * which revokes every previously issued token (401 SESSION_INVALIDATED). The
 * client signs in again with the new password.
 */
export async function changePassword(req: AuthenticatedRequest, res: Response) {
  const body = req.body ?? {};
  const problems = validateChangePassword(body);
  if (problems.length > 0) {
    const err = new ApiError(400, 'Validation failed', 'VALIDATION_ERROR');
    err.fields = problems;
    throw err;
  }
  await changePasswordService(req.user!.id, {
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
  });
  return res.status(200).json({ message: 'Password changed. Please sign in again.' });
}

/**
 * PATCH /api/auth/me (Phase 15). Protected by requireAuth. Updates ONLY the
 * caller's name; identity is taken exclusively from the authenticated session.
 * Unknown fields are rejected by the validator, never silently ignored.
 */
export async function updateMe(req: AuthenticatedRequest, res: Response) {
  const body = req.body ?? {};
  const { problems, name } = validateMeUpdate(body);
  if (problems.length > 0) {
    const err = new ApiError(400, 'Validation failed', 'VALIDATION_ERROR');
    err.fields = problems;
    throw err;
  }
  // `name` is `string | undefined` (the `requiredString` shape), so `!` is the
  // assertion, exactly as `users.controller.ts` asserts the same field from the
  // same helper: reaching this line means `problems` was empty, and therefore
  // that `requiredString` reported no problem with the value it returned. It is
  // erased at runtime.
  const user = await updateMyName(req.user!.id, name!);
  return res.status(200).json({ user: toPublicUser(user) });
}

/**
 * POST /api/auth/logout (Phase 26A). Protected by requireAuth. Revokes the
 * session this request was authenticated with — identified exclusively by the
 * token's own `jti`, so a client cannot name a session, a user or a business to
 * sign out. With `{ "all": true }` it instead ends every open session the
 * authenticated user has, this one included ("sign out everywhere").
 *
 * Idempotent by design: signing out an already-ended session still answers 200,
 * because the caller's goal (that session is dead) is satisfied either way.
 */
export async function logout(req: AuthenticatedRequest, res: Response) {
  const body = req.body ?? {};
  const { problems, all } = validateLogout(body);
  if (problems.length > 0) {
    const err = new ApiError(400, 'Validation failed', 'VALIDATION_ERROR');
    err.fields = problems;
    throw err;
  }

  if (all) {
    const sessionsRevoked = await revokeAllSessions({
      userId: req.user!.id,
      businessId: req.user!.businessId,
    });
    return res.status(200).json({ message: 'Signed out on all devices', sessionsRevoked });
  }

  await revokeSessionByJti({
    userId: req.user!.id,
    businessId: req.user!.businessId,
    jti: req.auth!.jti,
  });
  return res.status(200).json({ message: 'Signed out' });
}

/**
 * GET /api/auth/sessions (Phase 26A). Protected by requireAuth. Lists the
 * caller's own open sessions, newest first, each marked `current` when it is the
 * one making the request. Scoped by `req.user.id` alone — no userId or
 * businessId is read from the request, so another user's sessions are not
 * filtered out here, they are never queried. The DTO is a strict allowlist and
 * never carries a token or a jti.
 */
export async function listSessions(req: AuthenticatedRequest, res: Response) {
  const sessions = await listActiveSessions(req.user!.id);
  return res.status(200).json({
    sessions: sessions.map((session) => toPublicSession(session, req.auth!.jti)),
  });
}

/**
 * DELETE /api/auth/sessions/:id (Phase 26A). Protected by requireAuth. Ends one
 * session belonging to the caller; `req.user.id` is part of the lookup, so
 * another user's session is unreachable and answers the same 404 as an unknown
 * id. Nothing is read from the request body.
 */
export async function revokeSession(req: AuthenticatedRequest, res: Response) {
  const session = await revokeSessionById({
    userId: req.user!.id,
    businessId: req.user!.businessId,
    sessionId: req.params.id,
  });
  return res.status(200).json({ message: 'Session ended', id: String(session._id) });
}

/**
 * Maps a Firebase failure raised by account deletion to a response.
 *
 * THE TOKEN CASE IS A 400, NOT A 401, and that is the same rule the authenticated
 * Firebase boundary follows: the client clears its session on a 401/403, and a
 * rejected Firebase credential must never sign somebody out — least of all on the
 * screen where they are already asking to destroy the account. A 503 for the other
 * two keeps an operator misconfiguration and a Google outage distinct, exactly as
 * every other Firebase route answers them.
 */
function mapAccountDeletionFirebaseFailure(err: unknown): never {
  if (err instanceof FirebaseNotConfigured) {
    throw new ApiError(
      503,
      'Account deletion is temporarily unavailable because this server cannot reach its identity provider.',
      FIREBASE_NOT_CONFIGURED
    );
  }
  if (err instanceof FirebaseUnavailableError) {
    throw new ApiError(
      503,
      'Account deletion could not be completed just now. Please try again in a moment.',
      FIREBASE_UNAVAILABLE
    );
  }
  if (err instanceof FirebaseTokenError) {
    throw new ApiError(400, 'Please sign in again to confirm this deletion.', FIREBASE_TOKEN_INVALID);
  }
  throw err;
}

/**
 * DELETE /api/auth/me (account deletion).
 *
 * AUTHENTICATED, and the authentication is the ownership proof: the account deleted
 * is always `req.user.id`, so there is no id in the request that could aim this at
 * another person. It names NO permission for the same reason the session routes do
 * not — it is a self-service capability on the caller's own account, not an
 * authority over anybody else's.
 *
 * The response is deliberately thin: `{ deleted: true }` and nothing else. No
 * tombstone-shaped user is echoed, so the endpoint cannot be used to read back what
 * was stored.
 */
export async function deleteMe(req: AuthenticatedRequest, res: Response) {
  const { problems, confirmation, currentPassword, idToken } = validateAccountDeletion(
    req.body ?? {}
  );
  if (problems.length > 0) {
    const err = new ApiError(400, 'Validation failed', 'VALIDATION_ERROR');
    err.fields = problems;
    throw err;
  }

  try {
    const result = await deleteOwnAccount({
      userId: req.user!.id,
      confirmation: confirmation as string,
      currentPassword,
      idToken,
    });

    return res.status(200).json({ deleted: true, changed: result.changed });
  } catch (err) {
    return mapAccountDeletionFirebaseFailure(err);
  }
}

export default {
  register,
  login,
  me,
  changePassword,
  updateMe,
  logout,
  listSessions,
  revokeSession,
  deleteMe,
};
