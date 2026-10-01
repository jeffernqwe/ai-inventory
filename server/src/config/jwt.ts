import jwt from 'jsonwebtoken';
import type { SignOptions, VerifyOptions } from 'jsonwebtoken';

import env from './env.ts';
import ApiError from '../utils/ApiError.ts';

/**
 * JWT access-token helpers. Tokens carry the user id (`sub`), the id of the
 * server-side session they belong to (`jti`), the standard `iat`/`exp`, and the
 * application `iss`/`aud`. Role/business context is never embedded as a claim:
 * protected requests reload the user from the database so authorization always
 * reflects current state (see middlewares/authenticate.ts).
 *
 * Phase 26A: `jti` is MANDATORY. Without it a token cannot name a session, so
 * it could not be revoked — which is exactly the gap the phase closes. It is
 * required as an argument rather than defaulted, so a caller that forgets it
 * fails loudly at the point of minting instead of silently producing an
 * unrevocable token.
 *
 * AUTH-02: the token is short-lived (~1 hour) and names its issuer/audience.
 * Signature + expiry + issuer + audience are all enforced by jsonwebtoken
 * itself (see `verifyAccessToken`); nothing here trusts a decoded claim.
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
  iss?: string;
  aud?: string;
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

/**
 * The verification options every access-token check shares. `issuer`/`audience`
 * are passed to jsonwebtoken rather than compared by hand, so the library — not
 * this module — decides whether a token belongs to this application. `overrides`
 * exists for the one expiry-ignoring classification path below; it cannot relax
 * the algorithm, issuer or audience, because those are spread first and only
 * `ignoreExpiration` is ever supplied.
 */
function verificationOptions(overrides: VerifyOptions = {}): VerifyOptions {
  return {
    algorithms: ['HS256'],
    issuer: env.jwtIssuer,
    audience: env.jwtAudience,
    ...overrides,
  };
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
    issuer: env.jwtIssuer,
    audience: env.jwtAudience,
  });
}

/**
 * Reads the claims of an ALREADY-TRUSTED token without verifying it — used
 * right after signing, to read back the `jti` the library embedded. Never use
 * this to authenticate a request: `verifyAccessToken` is the only entry point
 * for an untrusted token.
 *
 * AUTH-02: still decode-only, and still trusted-input-only. The session row no
 * longer derives its `expiresAt` from the token, so nothing here needs the
 * resolved `exp` any more.
 */
export function decodeAccessToken(token: string): AccessTokenClaims | null {
  return jwt.decode(token) as AccessTokenClaims | null;
}

/**
 * Verifies signature, expiration, issuer and audience. Returns the decoded
 * payload or throws a jsonwebtoken error (expired / invalid signature /
 * malformed / wrong issuer / wrong audience).
 *
 * The algorithm is pinned to HS256 (Phase 07G). jsonwebtoken already restricts a
 * string secret to HMAC, but naming the algorithm explicitly removes any
 * algorithm-confusion risk if the secret type ever changes and makes the
 * accepted algorithm part of the contract rather than an implementation detail.
 *
 * AUTH-02: `issuer`/`audience` are enforced here by jsonwebtoken. A token minted
 * before this phase carries neither, so it is rejected — deliberately, as a
 * one-time re-login, rather than accepted on a compatibility path.
 */
export function verifyAccessToken(token: string): AccessTokenClaims {
  if (!env.jwtSecret) {
    throw new ApiError(500, 'JWT_SECRET is not configured', 'AUTH_NOT_CONFIGURED');
  }
  return jwt.verify(token, env.jwtSecret, verificationOptions()) as AccessTokenClaims;
}

/**
 * AUTH-02 — the expiry-ignoring re-verification, used ONLY to classify an
 * already-rejected expired token (see middlewares/authenticate.ts).
 *
 * This is NOT a way to accept a token: it is only ever reached AFTER
 * `verifyAccessToken` threw `TokenExpiredError`, and its result is used to look
 * a session up and pick which 401 to answer. It still performs a FULL
 * cryptographic verification of the signature, algorithm, issuer and audience —
 * `ignoreExpiration` is the only relaxation — so a token that fails any of those
 * (a forged signature, a wrong/missing issuer or audience) throws here too and
 * is classified `INVALID_TOKEN`, never `SESSION_EXPIRED`.
 */
export function verifyAccessTokenIgnoringExpiry(token: string): AccessTokenClaims {
  if (!env.jwtSecret) {
    throw new ApiError(500, 'JWT_SECRET is not configured', 'AUTH_NOT_CONFIGURED');
  }
  return jwt.verify(token, env.jwtSecret, verificationOptions({ ignoreExpiration: true })) as AccessTokenClaims;
}

/**
 * AUTH-02 — recognizes ONLY an expired-but-otherwise-valid token.
 *
 * jsonwebtoken checks `nbf`, then `exp`, then audience, then issuer; a
 * `TokenExpiredError` is therefore thrown only AFTER the signature and
 * algorithm have already been verified. It is also a SUBCLASS of
 * `JsonWebTokenError`, so a generic `instanceof JsonWebTokenError` test would
 * swallow it — callers must ask this question first. `NotBeforeError` and
 * `JsonWebTokenError` are deliberately NOT matched here; they stay
 * `INVALID_TOKEN`.
 */
export function isTokenExpiredError(err: unknown): boolean {
  return err instanceof jwt.TokenExpiredError;
}

/**
 * AUTH-03 — the ABSOLUTE expiry of a JUST-SIGNED access token, as an ISO string,
 * or `null` when the token carries no usable `exp`.
 *
 * The client needs an absolute instant rather than the `expiresIn` duration, so it
 * can compute its authentication horizon as `min(tokenExpiresAt, sessionExpiresAt)`
 * (the session cap can end BEFORE the token does near the 14-day boundary). The
 * value is read by decoding the token this server just minted — trusted input by
 * construction, so `decodeAccessToken` is the right helper and no secret or
 * re-verification is involved. Deriving it here keeps every endpoint's `exp`
 * reading identical instead of parsing `env.jwtExpiresIn` in each controller.
 *
 * The token itself only ever comes from `signAccessToken`, so `exp` is always a
 * number in practice; `null` is the honest answer for the impossible case rather
 * than a fabricated instant.
 */
export function accessTokenExpiresAt(token: string): string | null {
  const payload = decodeAccessToken(token);
  if (typeof payload?.exp !== 'number') return null;
  return new Date(payload.exp * 1000).toISOString();
}

export default {
  signAccessToken,
  verifyAccessToken,
  verifyAccessTokenIgnoringExpiry,
  isTokenExpiredError,
  decodeAccessToken,
  accessTokenExpiresAt,
};
