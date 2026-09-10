import mongoose from 'mongoose';

import User from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';
import { verifyAccessToken } from '../config/jwt.js';
import { assertActiveBusiness } from '../services/business.service.js';

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
 * 403 -> user is DISABLED, or the user's business is missing / not ACTIVE
 *        (SUSPENDED or ARCHIVED revoke existing JWTs immediately — Phase 07B)
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

    const user = await User.findById(userId).select('name email role status businessId passwordChangedAt');
    if (!user) {
      throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
    }
    if (user.status !== 'ACTIVE') {
      throw new ApiError(403, 'This account is disabled', 'ACCOUNT_DISABLED');
    }
    // Phase 15: a password change invalidates every token issued before it.
    // The token's iat is its issue time as integer Unix seconds (jsonwebtoken
    // floors Date.now()/1000 at sign), so the comparison lives at that same
    // granularity with a strict `<`. A token minted in the SAME second as the
    // change (iat === changedAtSec) stays valid — that is exactly the fresh
    // login after a change. Only strictly older-second tokens are rejected.
    if (user.passwordChangedAt) {
      const changedAtSec = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if ((payload?.iat ?? 0) < changedAtSec) {
        throw new ApiError(401, 'Session invalidated — please sign in again', 'SESSION_INVALIDATED');
      }
    }
    // Phase 07B / H2: the token alone is never enough — the tenant must still
    // exist and be ACTIVE. SUSPENDING/ARCHIVING (or deleting) a business
    // immediately revokes every outstanding JWT for its users.
    await assertActiveBusiness(user.businessId);

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
