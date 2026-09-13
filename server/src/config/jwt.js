import jwt from 'jsonwebtoken';

import env from './env.ts';
import ApiError from '../utils/ApiError.ts';

/**
 * JWT access-token helpers. Tokens carry the user id (`sub`), the id of the
 * server-side session they belong to (`jti`), and the standard `iat`/`exp`.
 * Role/business context is never embedded as a claim: protected requests reload
 * the user from the database so authorization always reflects current state
 * (see middlewares/authenticate.js).
 *
 * Phase 26A: `jti` is MANDATORY. Without it a token cannot name a session, so
 * it could not be revoked — which is exactly the gap the phase closes. It is
 * required as an argument rather than defaulted, so a caller that forgets it
 * fails loudly at the point of minting instead of silently producing an
 * unrevocable token.
 */

export function signAccessToken(userId, jti) {
  if (!env.jwtSecret) {
    throw new ApiError(500, 'JWT_SECRET is not configured', 'AUTH_NOT_CONFIGURED');
  }
  if (typeof jti !== 'string' || jti.length === 0) {
    throw new ApiError(500, 'A session id is required to sign an access token', 'SESSION_ID_REQUIRED');
  }
  return jwt.sign({ sub: String(userId), jti }, env.jwtSecret, {
    algorithm: 'HS256', // explicit: a string secret means HMAC — say which one
    expiresIn: env.jwtExpiresIn,
  });
}

/**
 * Reads the claims of an ALREADY-TRUSTED token without verifying it — used
 * right after signing, to read back the `jti` and the resolved `exp` that the
 * library computed from `expiresIn`. Never use this to authenticate a request:
 * `verifyAccessToken` is the only entry point for an untrusted token.
 */
export function decodeAccessToken(token) {
  return jwt.decode(token);
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

export default { signAccessToken, verifyAccessToken, decodeAccessToken };
