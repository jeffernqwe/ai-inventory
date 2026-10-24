/**
 * The Firebase Admin identity-DELETE bridge (account deletion, 2026-10-24).
 *
 * WHY THIS IS ITS OWN MODULE AND NOT A SECOND FUNCTION IN `userUpdater.ts`. The
 * AUTH-04-B2 bridge owns exactly one write — the `emailVerified` flag — and its guards
 * exist to keep it that narrow: they assert that `updateUser` appears nowhere else in
 * that module, that no second field can be written through it, and that "deleteUser"
 * is a word the bridge does not contain. Adding a destructive operation beside a
 * flag-setter would blur two very different authorities and break the property those
 * guards were written to protect, so the delete has its own module, its own delegate
 * and its own narrow result.
 *
 * WHAT IT DOES, AND NOTHING MORE. `deleteFirebaseUser(uid)` removes a Firebase
 * identity. It takes no options and no field list, so a caller cannot ask for
 * anything else through it. It reads the SDK error CODE and nothing else, exactly
 * like the update bridge, and it narrows the result to `{ uid, deleted }`.
 *
 * ALREADY-GONE IS A SUCCESS. `auth/user-not-found` means the identity this call was
 * asked to remove does not exist, which is the state the caller wanted. It is reported
 * as `deleted: false` so the audit row can say whether THIS request removed it, and it
 * is not an error: account deletion must be idempotent, and a retry after a crash
 * between the provider call and the MongoDB tombstone would otherwise never converge.
 *
 * THE SEAM. Like the verifier and the updater, the transport is replaceable, so the
 * whole layer is testable with no Firebase project and no credentials. The delegate
 * models the TRANSPORT ONLY — it resolves with the SDK's resolved value or rejects with
 * the SDK's own error shape — and classification happens on the OUTER path, so it is
 * exercised on every substituted path too.
 *
 * It logs nothing, for the same reason the other Firebase modules do not: the value
 * being handled identifies an identity in a security-sensitive operation, and the
 * cheapest guarantee is to have no logging call at all.
 */

import { getAuth } from 'firebase-admin/auth';

import { getFirebaseAdminApp } from './adminApp.ts';
import { FirebaseTokenError, firebaseErrorFromSdkCode, isFirebaseError } from './firebaseErrors.ts';

/** The narrow result of a provider identity deletion. */
export interface FirebaseUserDeletion {
  uid: string;
  deleted: boolean;
}

/** The seam a test substitutes through: the transport, and only the transport. */
export type FirebaseUserDeleter = (uid: string) => Promise<unknown>;

/** The message the not-configured class carries for a DELETE. */
const DELETE_NOT_CONFIGURED_MESSAGE =
  'Firebase Admin is not usable on this server (auth/invalid-credential), so the Firebase identity cannot be deleted.';

/**
 * The SDK code that means "this identity is already gone". Named in one place rather
 * than compared as a bare string, so the vocabulary stays closed and a reader can see
 * why the comparison exists.
 */
const USER_NOT_FOUND_CODE = 'auth/user-not-found';

let deleterDelegate: FirebaseUserDeleter | null = null;

/** Replaces the delete delegate. Returns the previous delegate so a test can restore it. */
export function setFirebaseUserDeleter(
  delegate: FirebaseUserDeleter | null
): FirebaseUserDeleter | null {
  const previous = deleterDelegate;
  deleterDelegate = typeof delegate === 'function' ? delegate : null;
  return previous;
}

/** Restores the real Firebase Admin implementation. */
export function resetFirebaseUserDeleter(): void {
  deleterDelegate = null;
}

/** True while a substituted delete delegate is installed. */
export function hasCustomFirebaseUserDeleter(): boolean {
  return deleterDelegate !== null;
}

/**
 * The real transport: `admin.auth().deleteUser(uid)`.
 *
 * It classifies nothing. `getFirebaseAdminApp()` may throw its own
 * `FirebaseNotConfigured`, which the caller passes through untouched, and an SDK
 * rejection travels up in the SDK's own shape for the caller to classify.
 */
async function deleteUserWithAdminSdk(uid: string): Promise<unknown> {
  const auth = getAuth(getFirebaseAdminApp());
  await auth.deleteUser(uid);
  return { uid };
}

/**
 * Deletes a Firebase identity so the account cannot be signed into through Firebase
 * again once its Inventory AI account is gone.
 *
 * Throws `FirebaseTokenError('missing-uid')` for a blank or non-string uid — the same
 * reason the verifier and updater use, so the vocabulary stays closed — before the
 * transport is reached, so a blank uid never spends a credential build.
 *
 * An identity that is already gone resolves `{ uid, deleted: false }`. Every other
 * failure is one of the three domain errors and no HTTP status is decided here.
 */
export async function deleteFirebaseUser(uid: unknown): Promise<FirebaseUserDeletion> {
  if (typeof uid !== 'string' || uid.trim() === '') {
    throw new FirebaseTokenError('missing-uid');
  }

  const trimmedUid = uid.trim();
  const remove = deleterDelegate ?? deleteUserWithAdminSdk;

  try {
    await remove(trimmedUid);
  } catch (err) {
    if (isFirebaseError(err)) {
      // `auth/user-not-found` arrives as a FirebaseTokenError because that is the only
      // class the shared classifier produces for it. The reason is an allowlisted label,
      // never the raw upstream message.
      if (err instanceof FirebaseTokenError && err.reason === USER_NOT_FOUND_CODE) {
        return { uid: trimmedUid, deleted: false };
      }
      throw err;
    }

    throw firebaseErrorFromSdkCode(
      (err as { code?: unknown } | null)?.code,
      DELETE_NOT_CONFIGURED_MESSAGE
    );
  }

  return { uid: trimmedUid, deleted: true };
}

export default {
  deleteFirebaseUser,
  setFirebaseUserDeleter,
  resetFirebaseUserDeleter,
  hasCustomFirebaseUserDeleter,
};
