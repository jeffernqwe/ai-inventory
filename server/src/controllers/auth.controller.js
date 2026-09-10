import { validateRegister, validateLogin, validateChangePassword, validateMeUpdate } from '../utils/validate.js';
import {
  registerBusinessOwner,
  loginWithPassword,
  changePassword as changePasswordService,
  updateMyName,
  toPublicUser,
} from '../services/auth.service.js';
import ApiError from '../utils/ApiError.js';
import env from '../config/env.js';

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

export default { register, login, me, changePassword, updateMe };
