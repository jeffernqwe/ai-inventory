import jwt from 'jsonwebtoken';

import env from './env.js';
import ApiError from '../utils/ApiError.js';

/**
 * JWT access-token helpers. Tokens carry only the user id (`sub`) plus the
 * standard `iat`/`exp`. Role/business context is never embedded as a claim:
 * protected requests reload the user from the database so authorization always
 * reflects current state (see middlewares/authenticate.js).
 */

export function signAccessToken(userId) {
  if (!env.jwtSecret) {
    throw new ApiError(500, 'JWT_SECRET is not configured', 'AUTH_NOT_CONFIGURED');
  }
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, {
    algorithm: 'HS256', // explicit: a string secret means HMAC — say which one
    expiresIn: env.jwtExpiresIn,
  });
}

/**
 * Verifies signature + expiration. Returns the decoded payload or throws a
 * jsonwebtoken error (expired / invalid signature / malformed).
 *
 * The algorithm is pinned to HS256 (Phase 07G). jsonwebtoken already restricts a
 * string secret to HMAC, but naming the algorithm explicitly removes any
 * algorithm-confusion risk if the secret type ever changes and makes the
 * accepted algorithm part of the contract rather than an implementation detail.
 */
export function verifyAccessToken(token) {
  if (!env.jwtSecret) {
    throw new ApiError(500, 'JWT_SECRET is not configured', 'AUTH_NOT_CONFIGURED');
  }
  return jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
}

export default { signAccessToken, verifyAccessToken };
