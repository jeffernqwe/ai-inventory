import mongoose from 'mongoose';

import User from '../models/user.model.ts';
import ApiError from '../utils/ApiError.ts';
import { verifyAccessToken } from '../config/jwt.js';
import { assertActiveBusiness } from '../services/business.service.js';
import {
  findActiveSessionByJti,
  touchSession,
  SESSION_REVOKED_CODE,
  SESSION_REVOKED_MESSAGE,
} from '../services/session.service.js';

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
 * Phase 26A: a token must also name a live server-side session. The token's
 * `jti` is looked up in `sessions`, and the request is refused unless that row
 * exists, is not revoked, and has not expired. This is what makes sign-out real
 * (the row is revoked and every token naming it dies at once) and what makes one
 * device revocable without touching the others. The session row holds no
 * authorization data, so this check adds revocation and nothing else — role and
 * business still come from the loaded user.
 *
 * req.auth = { sessionId, jti } is the session context, kept separate from
 * req.user so the public user DTO is unchanged by this phase.
 *
 * 401 -> missing / malformed / invalid / expired token, token with no jti, a
 *        revoked/expired/unknown session, or user no longer exists
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

    // Phase 26A: a token with no jti cannot name a session, so it is rejected
    // before any lookup. This is the compatibility break that invalidates every
    // pre-26A token: those tokens were the whole session and can never be
    // revoked, so they are not accepted at all. Checked here, next to the other
    // token-shape checks, so the reject path costs no query.
    const jti = payload?.jti;
    if (typeof jti !== 'string' || jti.length === 0) {
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
    // Phase 26A: the session must still be live. One lookup answers all four
    // requirements (exists, not revoked, not expired, belongs to this user);
    // a null result is a single "no" that does not distinguish the reasons.
    // The ownership comparison is redundant with the token's own `sub` — a
    // forged jti cannot be paired with another user's row — but it is checked
    // explicitly so a session can never authorize a request as a different user.
    const session = await findActiveSessionByJti(jti);
    if (!session || String(session.userId) !== String(user._id)) {
      throw new ApiError(401, SESSION_REVOKED_MESSAGE, SESSION_REVOKED_CODE);
    }
    // Phase 07B / H2: the token alone is never enough — the tenant must still
    // exist and be ACTIVE. SUSPENDING/ARCHIVING (or deleting) a business
    // immediately revokes every outstanding JWT for its users.
    await assertActiveBusiness(user.businessId);

    // Best-effort, throttled: records that this session was used. Deliberately
    // after every rejection point, so a refused request never refreshes it.
    await touchSession(session);

    req.user = {
      id: String(user._id),
      businessId: String(user.businessId),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    };
    req.auth = { sessionId: String(session._id), jti };
    return next();
  } catch (err) {
    return next(err);
  }
}

export default requireAuth;
