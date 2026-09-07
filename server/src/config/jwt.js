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
    expiresIn: env.jwtExpiresIn,
  });
}

/**
 * Verifies signature + expiration. Returns the decoded payload or throws a
 * jsonwebtoken error (expired / invalid signature / malformed).
 */
export function verifyAccessToken(token) {
  if (!env.jwtSecret) {
    throw new ApiError(500, 'JWT_SECRET is not configured', 'AUTH_NOT_CONFIGURED');
  }
  return jwt.verify(token, env.jwtSecret);
}

export default { signAccessToken, verifyAccessToken };
