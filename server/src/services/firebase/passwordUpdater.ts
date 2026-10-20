/**
 * AUTH-06 — the Firebase credential-write bridge.
 *
 * This module owns exactly TWO writes, and they are the only new Firebase capabilities the reset
 * flow needs:
 *
 *   updateFirebaseUserPassword(uid, password)  — set a Firebase identity's password.
 *   revokeFirebaseRefreshTokens(uid)           — invalidate the identity's refresh tokens.
 *
 * WHY A HARDCODED SINGLE-FIELD PAYLOAD, exactly as `userUpdater.ts` argues for `emailVerified`.
 * `updateFirebaseUserPassword` takes a uid and a password and writes `{ password }` and nothing
 * else. A caller cannot ask this bridge to also write an email, a disabled flag or custom claims,
 * because there is no parameter through which to ask — a structural property rather than a
 * validated one, and widening the write means editing this literal on purpose.
 *
 * WHY THE UID IS THE ACCOUNT'S, NOT THE CALLER'S. The uid here comes from the MongoDB `User` that
 * the challenge recorded when the code was issued — never from a request body, and never from an
 * address the caller supplied at confirm time. The bridge re-guards it anyway, before the Admin app
 * is built, because it is the one argument that decides WHOSE account is touched.
 *
 * WHY THE PASSWORD IS THE WHOLE POINT AND STILL NEVER LEAVES. It arrives as an argument, goes
 * straight to the SDK, and is never stored, logged, returned or attached to an error. This module
 * logs nothing at all for that reason.
 *
 * THE SEAM. Both writes are dispatched through replaceable delegates whose default is the real
 * Admin SDK call, so the layer is testable with no Firebase project, no network and no credentials
 * — the same shape as `FirebaseUserUpdater`. The delegates model the TRANSPORT ONLY: they resolve
 * with the SDK's raw value or reject with the SDK's own error shape, and classify nothing. That
 * keeps classification and narrowing on the outer path, under test on every substituted path.
 *
 * ERRORS. Only the SDK error CODE is read; the upstream message is discarded, because it is
 * produced by a library that was handed the credential. Classification is delegated to
 * `firebaseErrorFromSdkCode`, so an `auth/user-not-found` becomes `FirebaseTokenError`, an
 * `auth/invalid-credential` becomes `FirebaseNotConfigured`, and everything else — including a
 * missing code or a thrown non-Error — becomes `FirebaseUnavailableError`. Nothing here decides an
 * HTTP status.
 */

import { getAuth } from 'firebase-admin/auth';

import { getFirebaseAdminApp } from './adminApp.ts';
import { FirebaseTokenError, firebaseErrorFromSdkCode, isFirebaseError } from './firebaseErrors.ts';

/** The narrow result of the credential write: the uid it was asked to write, and nothing else. */
export interface FirebasePasswordWrite {
  uid: string;
}

/** The seam a test substitutes through for the password write. */
export type FirebasePasswordUpdater = (uid: string, password: string) => Promise<unknown>;

/** The seam a test substitutes through for the refresh-token revocation. */
export type FirebaseTokenRevoker = (uid: string) => Promise<unknown>;

const PASSWORD_NOT_CONFIGURED_MESSAGE =
  'Firebase Admin is not usable on this server (auth/invalid-credential), so the password write cannot be performed.';

const REVOKE_NOT_CONFIGURED_MESSAGE =
  'Firebase Admin is not usable on this server (auth/invalid-credential), so refresh tokens cannot be revoked.';

let passwordDelegate: FirebasePasswordUpdater | null = null;
let revokerDelegate: FirebaseTokenRevoker | null = null;

/** Replaces the password-write delegate. Returns the previous one. `null` restores the SDK. */
export function setFirebasePasswordUpdater(
  delegate: FirebasePasswordUpdater | null
): FirebasePasswordUpdater | null {
  const previous = passwordDelegate;
  passwordDelegate = typeof delegate === 'function' ? delegate : null;
  return previous;
}

export function resetFirebasePasswordUpdater(): void {
  passwordDelegate = null;
}

/** Replaces the refresh-token-revocation delegate. Returns the previous one. */
export function setFirebaseTokenRevoker(
  delegate: FirebaseTokenRevoker | null
): FirebaseTokenRevoker | null {
  const previous = revokerDelegate;
  revokerDelegate = typeof delegate === 'function' ? delegate : null;
  return previous;
}

export function resetFirebaseTokenRevoker(): void {
  revokerDelegate = null;
}

/**
 * The real password transport: Firebase Admin's `updateUser` with the payload fixed to the single
 * field this operation exists to set.
 *
 * It classifies nothing. `getFirebaseAdminApp()` may throw its own `FirebaseNotConfigured`, which
 * the caller passes through untouched.
 */
async function updatePasswordWithAdminSdk(uid: string, password: string): Promise<unknown> {
  const auth = getAuth(getFirebaseAdminApp());

  // ★ THE ONLY FIELD. `password` is not a default and not a parameter of a properties object: it
  //   is the entire operation.
  return auth.updateUser(uid, { password });
}

async function revokeWithAdminSdk(uid: string): Promise<unknown> {
  const auth = getAuth(getFirebaseAdminApp());
  return auth.revokeRefreshTokens(uid);
}

function assertUid(uid: unknown): string {
  if (typeof uid !== 'string' || uid.trim() === '') {
    throw new FirebaseTokenError('missing-uid');
  }
  return uid.trim();
}

/**
 * Sets a Firebase identity's password.
 *
 * Throws `FirebaseTokenError('missing-uid')` for an unusable uid — before the credential build, so
 * a blank value never spends one — and one of the three domain errors for an SDK failure. No HTTP
 * status is decided here.
 */
export async function updateFirebaseUserPassword(
  uid: unknown,
  password: unknown
): Promise<FirebasePasswordWrite> {
  const trimmedUid = assertUid(uid);

  // A non-string password is a programming fault, refused here rather than handed to the SDK:
  // the SDK would reject it with an unrecognisable code and the failure would be reported as an
  // outage. The message never carries the value.
  if (typeof password !== 'string' || password.length === 0) {
    throw new TypeError('updateFirebaseUserPassword requires a non-empty password string.');
  }

  const update = passwordDelegate ?? updatePasswordWithAdminSdk;

  try {
    await update(trimmedUid, password);
  } catch (err) {
    // A domain error from the transport is already the right answer — notably
    // `getFirebaseAdminApp()`'s FirebaseNotConfigured, whose code is ours.
    if (isFirebaseError(err)) throw err;
    throw firebaseErrorFromSdkCode(
      (err as { code?: unknown } | null)?.code,
      PASSWORD_NOT_CONFIGURED_MESSAGE
    );
  }

  return { uid: trimmedUid };
}

/**
 * Revokes an identity's Firebase refresh tokens.
 *
 * Best effort by design at its call site: by the time the reset reaches here the password has
 * already changed and every Inventory AI session has already been revoked, so failing the request
 * would report a false failure. The classified error still propagates so the caller can record why
 * the stronger guarantee did not hold.
 */
export async function revokeFirebaseRefreshTokens(uid: unknown): Promise<{ uid: string }> {
  const trimmedUid = assertUid(uid);
  const revoke = revokerDelegate ?? revokeWithAdminSdk;

  try {
    await revoke(trimmedUid);
  } catch (err) {
    if (isFirebaseError(err)) throw err;
    throw firebaseErrorFromSdkCode(
      (err as { code?: unknown } | null)?.code,
      REVOKE_NOT_CONFIGURED_MESSAGE
    );
  }

  return { uid: trimmedUid };
}

export default {
  updateFirebaseUserPassword,
  revokeFirebaseRefreshTokens,
  setFirebasePasswordUpdater,
  resetFirebasePasswordUpdater,
  setFirebaseTokenRevoker,
  resetFirebaseTokenRevoker,
};
