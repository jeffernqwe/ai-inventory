import mongoose from 'mongoose';

import User from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';
import { verifyAccessToken } from '../config/jwt.js';

/**
 * Authentication middleware. Extracts a Bearer token, verifies signature and
 * expiration, then reloads the user from the database to attach an
 * AUTHORITATIVE request context.
 *
 * req.user = { id, businessId, name, email, role, status }
 *   - businessId and role always come from the database for this request, never
 *     from token claims or the client (a user demoted/disabled is rejected
 *     immediately).
 *   - passwordHash is never loaded here.
 *
 * 401 -> missing / malformed / invalid / expired token, or user no longer exists
 * 403 -> user is DISABLED
 */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new ApiError(401, 'Invalid or expired token', 'INVALID_TOKEN');
    }

    const userId = payload?.sub;
    if (!userId || !mongoose.isValidObjectId(userId)) {
      throw new ApiError(401, 'Invalid or expired token', 'INVALID_TOKEN');
    }

    const user = await User.findById(userId).select('name email role status businessId');
    if (!user) {
      throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
    }
    if (user.status !== 'ACTIVE') {
      throw new ApiError(403, 'This account is disabled', 'ACCOUNT_DISABLED');
    }

    req.user = {
      id: String(user._id),
      businessId: String(user.businessId),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

export default requireAuth;
