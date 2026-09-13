import {
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateMeUpdate,
  validateLogout,
} from '../utils/validate.ts';
import {
  registerBusinessOwner,
  loginWithPassword,
  changePassword as changePasswordService,
  updateMyName,
  toPublicUser,
} from '../services/auth.service.js';
import {
  listActiveSessions,
  revokeSessionById,
  revokeSessionByJti,
  revokeAllSessions,
  toPublicSession,
} from '../services/session.service.js';
import ApiError from '../utils/ApiError.ts';
import env from '../config/env.ts';

/**
 * POST /api/auth/register
 * Creates a Business + OWNER user. Returns 201 with public user/business.
 * No token is issued here — the client logs in next (spec §45 flow).
 */
export async function register(req, res) {
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
export async function login(req, res) {
  const body = req.body ?? {};
  const problems = validateLogin(body);
  if (problems.length > 0) {
    const err = new ApiError(400, 'Validation failed', 'VALIDATION_ERROR');
    err.fields = problems;
    throw err;
  }

  const { token, user } = await loginWithPassword({
    email: body.email,
    password: body.password,
    deviceLabel: body.deviceLabel,
  });

  return res.status(200).json({
    token,
    tokenType: 'Bearer',
    expiresIn: env.jwtExpiresIn,
    user: toPublicUser(user),
  });
}

/**
 * GET /api/auth/me
 * Protected by requireAuth. req.user is the server-authoritative current user.
 */
export async function me(req, res) {
  return res.status(200).json({ user: req.user });
}

/**
 * POST /api/auth/change-password (Phase 15). Protected by requireAuth. Verifies
 * the current password, replaces the hash, and stamps passwordChangedAt —
 * which revokes every previously issued token (401 SESSION_INVALIDATED). The
 * client signs in again with the new password.
 */
export async function changePassword(req, res) {
  const body = req.body ?? {};
  const problems = validateChangePassword(body);
  if (problems.length > 0) {
    const err = new ApiError(400, 'Validation failed', 'VALIDATION_ERROR');
    err.fields = problems;
    throw err;
  }
  await changePasswordService(req.user.id, {
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
export async function updateMe(req, res) {
  const body = req.body ?? {};
  const { problems, name } = validateMeUpdate(body);
  if (problems.length > 0) {
    const err = new ApiError(400, 'Validation failed', 'VALIDATION_ERROR');
    err.fields = problems;
    throw err;
  }
  const user = await updateMyName(req.user.id, name);
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
export async function logout(req, res) {
  const body = req.body ?? {};
  const { problems, all } = validateLogout(body);
  if (problems.length > 0) {
    const err = new ApiError(400, 'Validation failed', 'VALIDATION_ERROR');
    err.fields = problems;
    throw err;
  }

  if (all) {
    const sessionsRevoked = await revokeAllSessions({
      userId: req.user.id,
      businessId: req.user.businessId,
    });
    return res.status(200).json({ message: 'Signed out on all devices', sessionsRevoked });
  }

  await revokeSessionByJti({
    userId: req.user.id,
    businessId: req.user.businessId,
    jti: req.auth.jti,
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
export async function listSessions(req, res) {
  const sessions = await listActiveSessions(req.user.id);
  return res.status(200).json({
    sessions: sessions.map((session) => toPublicSession(session, req.auth.jti)),
  });
}

/**
 * DELETE /api/auth/sessions/:id (Phase 26A). Protected by requireAuth. Ends one
 * session belonging to the caller; `req.user.id` is part of the lookup, so
 * another user's session is unreachable and answers the same 404 as an unknown
 * id. Nothing is read from the request body.
 */
export async function revokeSession(req, res) {
  const session = await revokeSessionById({
    userId: req.user.id,
    businessId: req.user.businessId,
    sessionId: req.params.id,
  });
  return res.status(200).json({ message: 'Session ended', id: String(session._id) });
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
};
