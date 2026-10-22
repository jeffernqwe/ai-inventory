import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';

import User from '../models/user.model.ts';
import ApiError from '../utils/ApiError.ts';
import { verifyAccessToken, verifyAccessTokenIgnoringExpiry, isTokenExpiredError } from '../config/jwt.ts';
import { assertActiveBusiness } from '../services/business.service.ts';
import { authMethodsFor } from '../services/auth.service.ts';
import {
  findActiveSessionByJti,
  touchSession,
  SESSION_REVOKED_CODE,
  SESSION_REVOKED_MESSAGE,
  SESSION_EXPIRED_CODE,
  SESSION_EXPIRED_MESSAGE,
} from '../services/session.service.ts';

/**
 * Authentication middleware. Extracts a Bearer token, verifies signature and
 * expiration, then reloads the user from the database to attach an
 * AUTHORITATIVE request context.
 *
 * req.user = { id, businessId, name, email, role, status, authMethods }
 *   - businessId and role always come from the database for this request, never
 *     from token claims or the client (a user demoted/disabled is rejected
 *     immediately).
 *   - passwordHash is never loaded here.
 *   - Phase 32K: `firebaseUid` IS now loaded, but it is never published — it
 *     exists only so `authMethods` can be derived from it. See below.
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
 *
 * AUTH-02 — the 401s are distinguishable, because the client must treat a
 * recoverable expiry differently from a terminal invalidation:
 *
 *   AUTH_REQUIRED       no/malformed Authorization header
 *   INVALID_TOKEN       forged / malformed / wrong-algorithm / wrong-or-missing
 *                       issuer / wrong-or-missing audience / invalid exp
 *   SESSION_EXPIRED     EXPIRED token whose session is still live (recoverable:
 *                       the Firebase identity is untouched)
 *   SESSION_REVOKED     live or expired token naming a missing/revoked/expired
 *                       session (terminal)
 *   SESSION_INVALIDATED a live token older than passwordChangedAt (Phase 15)
 *
 * The expiry classification is deliberately precise and never over-claims:
 * `TokenExpiredError` is asked about FIRST (it is a subclass of
 * `JsonWebTokenError`), and even then a second, expiry-ignoring — but still
 * cryptographically complete, issuer/audience-validating — verification must
 * succeed before a session is consulted. Anything else is INVALID_TOKEN.
 */

/**
 * The request context this middleware ATTACHES. Local and structural, matching
 * the pattern the other middleware use: these fields exist only because this
 * function ran, so declaring them on Express's global `Request` would let any
 * module read an authoritative-looking `req.user` on a public route.
 *
 * The fields are the ones the doc block above promises, and `name`/`email` are
 * optional only because this middleware does not read them back — every field
 * it writes is always populated.
 */
type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    businessId: string;
    name?: string;
    email?: string;
    role: string;
    status?: string;
    /** Phase 32K/L — the provider-neutral capability block (see `authMethodsFor`). */
    authMethods?: { password: boolean; firebase: boolean };
  };
  auth?: { sessionId: string; jti: string };
};

/**
 * AUTH-02 — decides which 401 an EXPIRED-but-genuine token deserves.
 *
 * Reached only from the `TokenExpiredError` branch above. The second
 * verification ignores ONLY the expiration: it still verifies the signature and
 * validates algorithm/issuer/audience, so a token that fails any of those
 * (including a legacy pre-AUTH-02 token that carries no `iss`/`aud`) is refused
 * as INVALID_TOKEN here rather than being reported as an expiry. `ignoreExpiration`
 * is the sole relaxation, and the result is used ONLY to pick a rejection code —
 * it never authorizes the request.
 *
 * A usable `jti` is required before any session is consulted: a token with no
 * session id (the pre-26A shape) can never name a session, so it stays
 * INVALID_TOKEN. When a session IS found it must be live (exists, not revoked,
 * not past its 14-day cap) — that is SESSION_EXPIRED, the recoverable case. A
 * missing or revoked/expired session is the terminal SESSION_REVOKED.
 */
async function expiredTokenRejection(token: string): Promise<ApiError> {
  let claims;
  try {
    claims = verifyAccessTokenIgnoringExpiry(token);
  } catch {
    // A wrong/missing issuer or audience, or any other failure, is not an
    // expiry — never classify it as one.
    return new ApiError(401, 'Invalid or expired token', 'INVALID_TOKEN');
  }
  const jti = claims?.jti;
  if (typeof jti !== 'string' || jti.length === 0) {
    return new ApiError(401, 'Invalid or expired token', 'INVALID_TOKEN');
  }
  const session = await findActiveSessionByJti(jti);
  if (!session) {
    return new ApiError(401, SESSION_REVOKED_MESSAGE, SESSION_REVOKED_CODE);
  }
  return new ApiError(401, SESSION_EXPIRED_MESSAGE, SESSION_EXPIRED_CODE);
}

/**
 * AUTH-03 FIX (2026-10-22) — the renewal route's authentication.
 *
 * WHY THIS EXISTS. `POST /api/auth/renew` is the client's SECOND chance: when a request
 * is refused with `SESSION_EXPIRED`, `lib/client.ts` calls this route with the very token
 * that was just refused and retries once. Behind plain `requireAuth` that call was
 * answered `SESSION_EXPIRED` again — the same middleware refused the expired token
 * before the renewal handler could look at it — so recovery could never succeed. The
 * consequence was measured on a phone on 2026-10-21: a live 14-day session whose ~1h
 * access token had expired was told "Session expired — please sign in again", and the
 * only way on was a fresh sign-in.
 *
 * WHAT IS RELAXED, AND WHAT IS NOT. Exactly one thing: `exp`. The signature, algorithm,
 * issuer and audience are still verified (by `verifyAccessTokenIgnoringExpiry`), so a
 * forged or foreign token is refused as INVALID_TOKEN; the `jti` is still required; the
 * user must still exist and be ACTIVE; the password-change rule still applies; and the
 * named session must still be live. Every one of those rejections is the same code and
 * the same status `requireAuth` gives — only expiry stops being fatal.
 *
 * WHY IT IS SAFE TO RELAX IT HERE. This middleware is used by ONE route, which grants no
 * data access: it verifies a FRESH Firebase identity (AUTH-01, `checkRevoked: true`),
 * requires the verified uid to equal the account's `firebaseUid`, and returns a token for
 * the SAME session — the `jti` is passed through unchanged, the 14-day cap is untouched,
 * and no row is created. A stolen expired JWT is therefore not enough: without the
 * Firebase ID token for that account it can mint nothing, and with that token the holder
 * could have opened a session at the public exchange anyway. Renewal is the STRICTER of
 * the two routes for this reason — it cannot outlive or replace the session it names, so
 * sign-out-everywhere still kills it.
 */
async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  options: { allowExpired: boolean },
) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    let payload;
    try {
      // The one relaxation this middleware can make; see `authenticate`'s caller below.
      payload = options.allowExpired ? verifyAccessTokenIgnoringExpiry(token) : verifyAccessToken(token);
    } catch (err) {
      // AUTH-02: ask about EXPIRY FIRST. `TokenExpiredError` extends
      // `JsonWebTokenError`, so a generic check would swallow it — and an
      // expired token is the one failure the client may recover from. Reaching
      // here means jsonwebtoken already verified the signature and algorithm,
      // so the token is genuine; only its `exp` is past.
      if (isTokenExpiredError(err)) {
        throw await expiredTokenRejection(token);
      }
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

    // Phase 32K: `firebaseUid` is selected ONLY so `authMethods` below can be
    // derived from it, and only that derived boolean leaves this middleware. The
    // uid itself is deliberately not published on `req.user`: it is the identity
    // join key the Firebase design keeps server-side, and this middleware runs on
    // EVERY route, so putting it here would expose it far more widely than the
    // DTO that legitimately needed it.
    const user = await User.findById(userId).select('name email role status businessId passwordChangedAt firebaseUid');
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
      // Phase 32K: GET /api/auth/me answers `{ user: req.user }`, and the client
      // reads the user object from BOTH here and `toPublicUser`. Deriving the
      // capability in the one shared helper is what keeps those two surfaces from
      // disagreeing about whether local password management applies.
      authMethods: authMethodsFor(user),
    };
    req.auth = { sessionId: String(session._id), jti };
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Ordinary authentication: an expired token is a refusal, as it must be. */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  return authenticate(req, res, next, { allowExpired: false });
}

/**
 * Renewal authentication: the token being REPLACED may already have expired, which is the
 * only case in which the client calls it (see the block above). Not exported from the
 * middleware barrel and not used by any other route — a source guard in
 * `phaseAUTH03-session-renewal.test.mjs` fails if it is mounted anywhere but `/renew`.
 */
export async function requireAuthForRenewal(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  return authenticate(req, res, next, { allowExpired: true });
}

export default requireAuth;
