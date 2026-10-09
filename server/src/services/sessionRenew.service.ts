/**
 * AUTH-03 — Inventory session renewal.
 *
 * Renewal is the operation that keeps a live Inventory session alive as its ~1h
 * access token approaches expiry, WITHOUT making the session itself longer-lived
 * or harder to withdraw. It is deliberately narrow: a caller who already holds a
 * valid Inventory JWT presents a fresh Firebase ID token, and gets back a NEW
 * access token for the SAME session.
 *
 * THE CENTRAL PROPERTY: the renewed JWT names the EXISTING session. The `jti` is
 * supplied by `requireAuth` (`req.auth.jti`) and is passed straight back into
 * `signAccessToken`, so:
 *
 *   * the session `_id` is unchanged,
 *   * the session `jti` is unchanged,
 *   * `session.expiresAt` is NEVER written — the 14-day absolute cap (AUTH-02)
 *     remains anchored at session creation, so renewing a token can never make a
 *     session immortal,
 *   * no row is created (`createSessionForToken`/`newSessionId` are never called),
 *   * no audit row is written per renewal (`recordAudit` is never called) — a
 *     renewal is a routine, high-frequency event and recording every one would
 *     flood the ADMIN-readable trail for no security benefit.
 *
 * WHY THE SERVICE LOOKS THE SESSION UP ITSELF. `requireAuth` already proved the
 * session is live, but it does not expose the session document (it publishes only
 * `{ sessionId, jti }` on `req.auth`), because `GET /api/auth/me` answers
 * `{ user: req.user }` verbatim and the middleware must not grow a field that
 * would be published to a client. The renewal service therefore performs its OWN
 * active-session lookup by the authenticated `jti` (`findActiveSessionByJti`,
 * the same liveness filter `requireAuth` uses). The document it returns is the
 * AUTHORITATIVE session, and its `expiresAt` is what the HTTP layer returns as
 * `sessionExpiresAt`. `authenticate.ts` is not modified.
 *
 * THE FIREBASE IDENTITY IS THE ONLY IDENTITY INPUT, and it comes from the AUTH-01
 * verify boundary (`verifyFirebaseIdToken`), which already performs
 * `checkRevoked: true`, signature verification and an issuer/audience assertion.
 * This module never reads a uid, a businessId, a role or a session id from a
 * request body — the validator that feeds it returns only `{ problems, idToken }`,
 * so those fields are inert by construction rather than by a check that could be
 * removed.
 *
 * TWO REFUSALS, IN A LOAD-BEARING ORDER:
 *
 *   1. UID MISMATCH (409 FIREBASE_IDENTITY_CONFLICT). The verified uid must EQUAL
 *      the uid already on the account. A token for a different Firebase identity
 *      cannot renew this session. The email is never consulted — it is not an
 *      identity key anywhere in this architecture.
 *   2. UNVERIFIED EMAIL (400 EMAIL_NOT_VERIFIED). Email verification is required
 *      before a session is created OR RENEWED. The status is 400 rather than
 *      401/403 on purpose (see `constants/firebase.ts`): a 401/403 here would trip
 *      the client's session-loss rule and sign the user out, retroactively
 *      terminating a live session, which the target architecture forbids. The gate
 *      applies only at issuance and renewal boundaries — `requireAuth` grows no
 *      `emailVerified` branch, so an already-live session is not killed mid-flight.
 *
 * TENANT ISOLATION AND JWT CLAIMS ARE UNCHANGED. `businessId` and `role` are read
 * only from the loaded User (for nothing — this module never writes them), and the
 * new token carries exactly `sub, jti, iat, exp, iss, aud`. No role, businessId or
 * permission becomes a claim, and no durable auth state is introduced: renewal
 * reuses the existing session row and the existing JWT mechanism, with no custom
 * refresh token.
 */

import User from '../models/user.model.ts';
import ApiError from '../utils/ApiError.ts';
import { signAccessToken } from '../config/jwt.ts';
import { EMAIL_NOT_VERIFIED } from '../constants/firebase.ts';
import { verifyFirebaseIdToken } from './firebase/index.ts';
import { FIREBASE_IDENTITY_CONFLICT_CODE } from './firebaseLink.service.ts';
import {
  findActiveSessionByJti,
  SESSION_REVOKED_CODE,
  SESSION_REVOKED_MESSAGE,
} from './session.service.ts';

/** The inputs `renewInventorySession` takes from the HTTP layer. */
type RenewPayload = {
  /** `req.user.id` — the authenticated account. Never read from the body. */
  userId: string;
  /** `req.auth.jti` — the session the request was authenticated with. */
  jti: string;
  /** The raw Firebase ID token from the body; verified by the AUTH-01 boundary. */
  idToken: unknown;
};

/**
 * One generic conflict message, matching `firebaseLink.service.ts`'s copy: it
 * names no account, business, role or Firebase UID. The client branches on the
 * CODE, so the wording is for a human and leaks nothing.
 */
const FIREBASE_IDENTITY_CONFLICT_MESSAGE =
  'This sign-in cannot be connected to this account. Please contact an administrator.';

/**
 * Fixed copy for an unverified identity. It tells the user the truthful next step
 * (verify the address) without naming a provider, a claim or an environment.
 */
const EMAIL_NOT_VERIFIED_MESSAGE =
  'Please verify your email address before continuing.';

/**
 * Re-issues an access token for the caller's EXISTING session.
 *
 * Returns `{ token, session, user }`. `session` is the authoritative existing
 * document (its `expiresAt` is the cap the caller must not outlive); `user` is the
 * loaded account (the HTTP layer projects it through `toPublicUser`, which never
 * exposes `firebaseUid`).
 */
export async function renewInventorySession({ userId, jti, idToken }: RenewPayload) {
  // 1. The identity, established ONLY here. Throws the AUTH-01 domain errors
  //    (FirebaseTokenError / FirebaseUnavailableError / FirebaseNotConfigured),
  //    which the controller maps — they are not ApiErrors.
  const identity = await verifyFirebaseIdToken(idToken);

  // 2. The authoritative existing session, by the authenticated jti. A null
  //    (raced past the cap, or revoked mid-request) is reported exactly as
  //    requireAuth reports it, so the client sees one code for "that session is
  //    gone". The userId comparison prevents a session belonging to another
  //    account from ever being renewed with this request's identity.
  const session = await findActiveSessionByJti(jti);
  if (!session || String(session.userId) !== String(userId)) {
    throw new ApiError(401, SESSION_REVOKED_MESSAGE, SESSION_REVOKED_CODE);
  }

  // 3. The account, loaded only to obtain `firebaseUid` — which `requireAuth`
  //    deliberately does not publish (see the module header). `null` means the
  //    account vanished between authentication and this handler; it is an
  //    authentication problem, not a conflict.
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
  }

  // 4. UID-ONLY identity match. The email is NEVER a join key here (or anywhere).
  if (!user.firebaseUid || user.firebaseUid !== identity.uid) {
    throw new ApiError(409, FIREBASE_IDENTITY_CONFLICT_MESSAGE, FIREBASE_IDENTITY_CONFLICT_CODE);
  }

  // 5. Verification boundary for renewal. 400, never 401/403 (see the header).
  if (identity.emailVerified !== true) {
    throw new ApiError(400, EMAIL_NOT_VERIFIED_MESSAGE, EMAIL_NOT_VERIFIED);
  }

  // 6. A NEW token for the SAME session. `jti` is passed through unchanged; no
  //    session row is created and `expiresAt` is not touched.
  const token = signAccessToken(user._id, jti);
  return { token, session, user };
}

export default { renewInventorySession };
