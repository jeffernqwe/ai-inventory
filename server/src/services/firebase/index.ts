/**
 * The Firebase service boundary (Phase 32B).
 *
 * This is the only Firebase module the rest of the application imports. Callers —
 * today nothing, in Phase 32C the token-exchange controller — depend on this
 * interface and on the error classes re-exported here, and on nothing else. No
 * caller learns how the app is initialized, which module holds the credential, or
 * that firebase-admin exists.
 *
 * The exported functions are deliberately small:
 *
 *   isFirebaseConfigured()  — may this server verify Firebase ID tokens at all?
 *                             Never throws, and never initializes anything.
 *   firebaseProjectId()     — the configured project id, for a startup log or a
 *                             health line. Never throws, and is '' when disabled.
 *   verifyFirebaseIdToken(idToken)
 *                           — verifies a token and returns the narrowed identity.
 *   updateFirebaseUserEmailVerified(uid)
 *                           — the AUTH-04-B2 write: sets a verified identity's
 *                             `emailVerified` flag, and nothing else.
 *   deleteFirebaseUser(uid) — the account-deletion DELETE: removes the identity so a
 *                             closed account is not still usable at the provider. It
 *                             lives in its own module (`identityDeleter.ts`) because
 *                             the AUTH-04-B2 bridge's guards exist to keep that bridge
 *                             to a single non-destructive field write.
 *
 * Note what this layer does NOT do: it does not issue a session, does not read or
 * write MongoDB, does not know a user exists, and does not decide an HTTP status.
 * Verifying an ID token and establishing an application session are separate
 * steps, and Phase 32B implements only the first; AUTH-04-B2 adds the single
 * Admin WRITE the email-verification flow needs, and still decides no status.
 */

import { firebaseConfig, isFirebaseConfigured as configIsFirebaseConfigured } from '../../config/firebase.ts';
import {
  FirebaseNotConfigured,
  FirebaseTokenError,
  FirebaseUnavailableError,
  FIREBASE_NOT_CONFIGURED,
  FIREBASE_TOKEN_INVALID,
  FIREBASE_UNAVAILABLE,
  classifyFirebaseErrorCode,
  isFirebaseError,
} from './firebaseErrors.ts';
import { getFirebaseAdminApp, isFirebaseAdminAppInitialized, resetFirebaseAdminApp } from './adminApp.ts';
import {
  verifyFirebaseIdToken,
  setFirebaseIdTokenVerifier,
  resetFirebaseIdTokenVerifier,
  isStructurallyJwtShaped,
  assertFirebaseTokenEnvironment,
} from './tokenVerifier.ts';
import type { VerifiedFirebaseIdentity, FirebaseIdTokenVerifier } from './tokenVerifier.ts';
import {
  updateFirebaseUserEmailVerified,
  setFirebaseUserUpdater,
  resetFirebaseUserUpdater,
  hasCustomFirebaseUserUpdater,
} from './userUpdater.ts';
import type { FirebaseEmailVerificationWrite, FirebaseUserUpdater } from './userUpdater.ts';
import {
  deleteFirebaseUser,
  setFirebaseUserDeleter,
  resetFirebaseUserDeleter,
  hasCustomFirebaseUserDeleter,
} from './identityDeleter.ts';
import type { FirebaseUserDeletion, FirebaseUserDeleter } from './identityDeleter.ts';

export {
  FirebaseNotConfigured,
  FirebaseTokenError,
  FirebaseUnavailableError,
  FIREBASE_NOT_CONFIGURED,
  FIREBASE_TOKEN_INVALID,
  FIREBASE_UNAVAILABLE,
  classifyFirebaseErrorCode,
  isFirebaseError,
  getFirebaseAdminApp,
  isFirebaseAdminAppInitialized,
  resetFirebaseAdminApp,
  setFirebaseIdTokenVerifier,
  resetFirebaseIdTokenVerifier,
  verifyFirebaseIdToken,
  isStructurallyJwtShaped,
  assertFirebaseTokenEnvironment,
  updateFirebaseUserEmailVerified,
  deleteFirebaseUser,
  setFirebaseUserUpdater,
  resetFirebaseUserUpdater,
  hasCustomFirebaseUserUpdater,
  setFirebaseUserDeleter,
  resetFirebaseUserDeleter,
  hasCustomFirebaseUserDeleter,
};
export type {
  VerifiedFirebaseIdentity,
  FirebaseIdTokenVerifier,
  FirebaseEmailVerificationWrite,
  FirebaseUserUpdater,
  FirebaseUserDeletion,
  FirebaseUserDeleter,
};

/**
 * True when the environment supplies a complete Firebase service account.
 *
 * Deliberately a pure configuration question and NOT "can an app be built" — the
 * mail layer's `isMailConfigured()` calls its provider selector, which is safe
 * there because selecting a provider constructs nothing. Doing the equivalent
 * here would mean initializing the Admin SDK, and a readiness probe or a startup
 * log line must not have the side effect of building a credential. The config
 * check is also the honest question: it is what an operator controls.
 */
export function isFirebaseConfigured(): boolean {
  return configIsFirebaseConfigured();
}

/** The configured Firebase project id, or '' when Firebase is not configured. */
export function firebaseProjectId(): string {
  return firebaseConfig().projectId;
}

export default {
  isFirebaseConfigured,
  firebaseProjectId,
  verifyFirebaseIdToken,
};
