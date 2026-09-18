/**
 * Firebase error layer, mirroring services/mail/mailErrors.ts (Phase 32B).
 *
 * Two distinct conditions, two distinct codes:
 *
 *   FIREBASE_NOT_CONFIGURED — an operator problem. No Firebase service account
 *     is configured, so no ID token can be verified. Nothing was attempted.
 *   FIREBASE_TOKEN_INVALID — a caller problem. The ID token was rejected by
 *     verification: expired, wrong audience, wrong issuer, bad signature, or
 *     malformed.
 *
 * Both codes are namespaced FIREBASE_* on purpose, and deliberately share no
 * spelling with any authentication or session code (AUTH_REQUIRED, INVALID_TOKEN,
 * SESSION_REVOKED, ...). An ID token rejected here is NOT a refused session, and
 * nothing downstream may treat the two alike — in particular, a caller must never
 * let FIREBASE_* reach the client's session-loss handler, which clears a session
 * on 401/403. `isFirebaseError()` is the check that boundary uses.
 *
 * Like the mail layer, neither class carries an HTTP status. Turning one into a
 * status is the controller's job (Phase 32C), which keeps this layer free of any
 * decision about how a caller is answered.
 */

export const FIREBASE_NOT_CONFIGURED = 'FIREBASE_NOT_CONFIGURED';
export const FIREBASE_TOKEN_INVALID = 'FIREBASE_TOKEN_INVALID';

export class FirebaseNotConfigured extends Error {
  declare code: string;

  constructor(message = 'Firebase is not configured on this server.') {
    super(message);
    this.name = 'FirebaseNotConfigured';
    this.code = FIREBASE_NOT_CONFIGURED;
  }
}

/**
 * A rejected Firebase ID token.
 *
 * `reason` is a coarse, ALLOWLISTED label derived from the SDK's error code, for
 * server-side logging and diagnosis. It is the only detail this error carries,
 * and it exists because the raw upstream error must not be relayed: the same
 * reasoning that makes the mail layer discard Resend's free-text message applies
 * here — an upstream error is an exfiltration surface, and the value being
 * handled is a live credential.
 *
 * The label can never carry a TOKEN. `safeTokenReason` admits only lowercase
 * letters, digits, `/`, `_` and `-`, up to 64 characters. That excludes the `.`
 * that separates a token's segments, so a whole token can never match; and any
 * real token is far past the length bound anyway, so the two barriers are
 * independent. Both are asserted in the Phase 32B suite.
 *
 * Stated precisely, because the looser version of this claim is false: a SINGLE
 * base64url segment DOES satisfy the shape rule — the allowlist excludes `.`, not
 * the base64url alphabet. That is not a credential and cannot be replayed as one
 * (a segment carries no signature), and the only call site passes an SDK error
 * code such as `auth/id-token-expired`, never a token or part of one. The
 * guarantee this class needs — that no live credential reaches a log line — holds
 * regardless.
 */
export class FirebaseTokenError extends Error {
  declare code: string;
  declare reason: string;

  constructor(reason = 'unknown', message = 'The Firebase ID token could not be verified.') {
    super(message);
    this.name = 'FirebaseTokenError';
    this.code = FIREBASE_TOKEN_INVALID;
    this.reason = reason;
  }
}

/**
 * Coerces an upstream error code into a safe label.
 *
 * Anything that is not a short, plainly-shaped string becomes 'unknown' rather
 * than being passed through. This is the property the class comment above
 * depends on: it is not that today's codes happen to be safe, but that no code
 * which is not safely shaped can survive this function.
 */
export function safeTokenReason(raw: unknown): string {
  return typeof raw === 'string' && /^[a-z0-9/_-]{1,64}$/i.test(raw) ? raw : 'unknown';
}

export function isFirebaseError(err: unknown): boolean {
  return err instanceof FirebaseNotConfigured || err instanceof FirebaseTokenError;
}

export default {
  FirebaseNotConfigured,
  FirebaseTokenError,
  FIREBASE_NOT_CONFIGURED,
  FIREBASE_TOKEN_INVALID,
  safeTokenReason,
  isFirebaseError,
};
