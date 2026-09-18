/**
 * Firebase ID-token verification (Phase 32B).
 *
 * This is the ONLY place in the server where a Firebase identity enters the
 * system, and therefore the only place a `uid` can be trusted. Everything
 * downstream — the exchange endpoint (Phase 32C), the MongoDB mapping, RBAC —
 * consumes the value this module returns and must never read a `uid`, a role or a
 * businessId from a request body.
 *
 * Two things make that guarantee hold:
 *
 *   NARROWING — the raw decoded token is never handed out. `verifyFirebaseIdToken`
 *     returns a four-field allowlisted shape, so a caller cannot accidentally
 *     depend on some other claim, and adding one becomes a deliberate edit here
 *     rather than a convenience read somewhere else. Narrowing runs on EVERY
 *     path, including the test seam (see below), which is what keeps it under
 *     test — it is security-relevant code that could otherwise only ever be
 *     exercised against a live Firebase project.
 *
 *   THE SEAM — verification is dispatched through a replaceable delegate, so the
 *     whole layer is testable with no Firebase project, no network and no
 *     credentials. This mirrors the mail provider registry
 *     (services/mail/providers/index.ts): the real implementation is the default,
 *     and a test substitutes through the same entry point production uses.
 *
 * `checkRevoked` is FALSE, matching the approved Phase 32A design. The consequence
 * is deliberate and recorded there: a Firebase account disabled or deleted on
 * Google's side still verifies, so Firebase-side revocation is not enforced at
 * exchange time. That is consistent with Option B, where the authority for
 * whether a principal may act is the MongoDB user record — `status`, `businessId`
 * and the business lifecycle are all checked from the database, per request, by
 * requireAuth and the exchange that issues the session. Passing true here would
 * add a network call to Google on every sign-in and would NOT replace those
 * checks. Revisiting this is a Phase 32C decision, not a Phase 32B one.
 */

import { getAuth } from 'firebase-admin/auth';

import { getFirebaseAdminApp } from './adminApp.ts';
import { FirebaseTokenError, safeTokenReason } from './firebaseErrors.ts';

/**
 * The verified identity, and nothing else.
 *
 * `email` is nullable because the Firebase claim is: a phone-auth or
 * anonymous token carries no email. Both providers Phase 32 intends to offer
 * (email/password and Google) always supply one, so in practice this is non-null
 * — but the type states what the token can actually contain rather than what our
 * chosen providers happen to send, and deciding what to do about a null email is
 * the exchange endpoint's call (Phase 32C), not this layer's.
 *
 * `email` is lowercased to match the `users.email` field, which Mongoose stores
 * with `lowercase: true`. Normalizing here means the mapping cannot miss a match
 * because Google capitalized a letter.
 */
export interface VerifiedFirebaseIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  signInProvider: string | null;
}

/**
 * The seam a test substitutes through.
 *
 * It returns the SDK's DECODED TOKEN payload — the shape
 * `admin.auth().verifyIdToken()` resolves to — deliberately typed `unknown`,
 * because turning that into a `VerifiedFirebaseIdentity` is the security-relevant
 * step and it must run for a substituted verifier exactly as it does for the real
 * one. A delegate that returned an already-narrowed identity would take the
 * `uid`/`email`/`email_verified` handling out of test coverage entirely, and
 * nothing else in this codebase can exercise it.
 */
export type FirebaseIdTokenVerifier = (idToken: string) => Promise<unknown>;

let verifierDelegate: FirebaseIdTokenVerifier | null = null;

/**
 * Replaces the verifier. Returns the previous delegate so a test can restore it.
 * Passing null restores the real Firebase Admin implementation.
 */
export function setFirebaseIdTokenVerifier(
  delegate: FirebaseIdTokenVerifier | null
): FirebaseIdTokenVerifier | null {
  const previous = verifierDelegate;
  verifierDelegate = typeof delegate === 'function' ? delegate : null;
  return previous;
}

/** Restores the real Firebase Admin implementation. */
export function resetFirebaseIdTokenVerifier(): void {
  verifierDelegate = null;
}

export function hasCustomFirebaseIdTokenVerifier(): boolean {
  return verifierDelegate !== null;
}

/**
 * Narrows a decoded token to `VerifiedFirebaseIdentity`.
 *
 * A token with no usable `uid` is rejected rather than passed on with an empty
 * one: `uid` is the join key to the MongoDB user, so an identity without it could
 * only ever resolve to nothing, and failing here keeps that from looking like a
 * lookup miss downstream.
 *
 * `email_verified` is compared `=== true` so a missing, non-boolean or truthy
 * non-boolean claim reads as unverified. The field decides whether an account is
 * considered verified, so the failure direction must be "not verified".
 */
function toVerifiedIdentity(decoded: unknown): VerifiedFirebaseIdentity {
  const token = (decoded ?? {}) as Record<string, unknown>;

  const uid = typeof token.uid === 'string' ? token.uid.trim() : '';
  if (!uid) {
    throw new FirebaseTokenError('missing-uid');
  }

  const rawEmail = typeof token.email === 'string' ? token.email.trim().toLowerCase() : '';

  // `sign_in_provider` is nested one level down in the decoded token; both levels
  // are checked so a differently-shaped payload yields null rather than a throw.
  const firebaseClaim = (token.firebase ?? {}) as Record<string, unknown>;
  const provider =
    typeof firebaseClaim.sign_in_provider === 'string' ? firebaseClaim.sign_in_provider.trim() : '';

  return {
    uid,
    email: rawEmail || null,
    emailVerified: token.email_verified === true,
    signInProvider: provider || null,
  };
}

/**
 * The real implementation: Firebase Admin's verifier, returning the decoded token
 * for `toVerifiedIdentity` to narrow.
 *
 * Only the upstream CODE is read, and only through the allowlist in
 * firebaseErrors. The upstream message is discarded: it is produced by a library
 * that was handed the token, and relaying it is the one way a token could reach a
 * log line. The code is a fixed string, never an echo of the input.
 */
async function verifyWithAdminSdk(idToken: string): Promise<unknown> {
  const auth = getAuth(getFirebaseAdminApp());

  try {
    return await auth.verifyIdToken(idToken, /* checkRevoked */ false);
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    throw new FirebaseTokenError(safeTokenReason(code));
  }
}

/**
 * Verifies a Firebase ID token and returns the narrowed identity.
 *
 * Throws FirebaseTokenError when the token is rejected, and FirebaseNotConfigured
 * when the server has no usable Firebase service account. It never returns a
 * partial or unverified identity, and it never throws anything else — a caller
 * can handle this exhaustively without a catch-all.
 */
export async function verifyFirebaseIdToken(idToken: unknown): Promise<VerifiedFirebaseIdentity> {
  if (typeof idToken !== 'string' || idToken.trim() === '') {
    throw new FirebaseTokenError('missing-token');
  }

  const verify = verifierDelegate ?? verifyWithAdminSdk;
  return toVerifiedIdentity(await verify(idToken));
}

export default {
  verifyFirebaseIdToken,
  setFirebaseIdTokenVerifier,
  resetFirebaseIdTokenVerifier,
  hasCustomFirebaseIdTokenVerifier,
};
