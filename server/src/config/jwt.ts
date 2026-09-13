import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';

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

/**
 * The claims this server signs and reads back. Deliberately narrower than
 * jsonwebtoken's own `JwtPayload`, which carries an `[key: string]: any` index
 * signature — under that type a typo such as `payload.jit` type-checks silently
 * as `any`, which is the one class of mistake these helpers exist to prevent.
 * Role and business are absent here on purpose: they are never claims.
 */
export type AccessTokenClaims = {
  sub?: string;
  jti?: string;
  iat?: number;
  exp?: number;
};

/**
 * `env.jwtExpiresIn` is an operator-supplied string in jsonwebtoken's own
 * timespan format. The library's type demands its `StringValue` literal union
 * (a type-level grammar of that format), which a runtime string cannot satisfy.
 * The cast asserts a contract that is already enforced at runtime rather than
 * adding one: `validateProductionConfig` probes the value with a throwaway
 * signature at boot, and jsonwebtoken itself rejects a malformed one at sign
 * time. Nothing about the value changes here.
 */
function tokenLifetime(): SignOptions['expiresIn'] {
  return env.jwtExpiresIn as SignOptions['expiresIn'];
}

export function signAccessToken(userId: unknown, jti: string): string {
  if (!env.jwtSecret) {
    throw new ApiError(500, 'JWT_SECRET is not configured', 'AUTH_NOT_CONFIGURED');
  }
  if (typeof jti !== 'string' || jti.length === 0) {
    throw new ApiError(500, 'A session id is required to sign an access token', 'SESSION_ID_REQUIRED');
  }
  return jwt.sign({ sub: String(userId), jti }, env.jwtSecret, {
    algorithm: 'HS256', // explicit: a string secret means HMAC — say which one
    expiresIn: tokenLifetime(),
  });
}

/**
 * Reads the claims of an ALREADY-TRUSTED token without verifying it — used
 * right after signing, to read back the `jti` and the resolved `exp` that the
 * library computed from `expiresIn`. Never use this to authenticate a request:
 * `verifyAccessToken` is the only entry point for an untrusted token.
 *
 * The assertion is the same contract `verifyAccessToken` states: a token this
 * server signed carries an object payload, never a bare string.
 */
export function decodeAccessToken(token: string): AccessTokenClaims | null {
  return jwt.decode(token) as AccessTokenClaims | null;
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
export function verifyAccessToken(token: string): AccessTokenClaims {
  if (!env.jwtSecret) {
    throw new ApiError(500, 'JWT_SECRET is not configured', 'AUTH_NOT_CONFIGURED');
  }
  return jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] }) as AccessTokenClaims;
}

export default { signAccessToken, verifyAccessToken, decodeAccessToken };
