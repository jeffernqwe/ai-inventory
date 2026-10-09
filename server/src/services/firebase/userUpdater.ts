/**
 * The Firebase Admin user-record write bridge (AUTH-04-B2).
 *
 * This module owns exactly ONE write: setting a Firebase identity's
 * `emailVerified` flag to `true` after Inventory AI has itself verified the
 * address with its own 6-digit code (AUTH-04). It is the only module in the server
 * that calls `updateUser`, and it is the ONLY new Firebase capability AUTH-04
 * introduces.
 *
 * WHY THE PAYLOAD IS HARDCODED. `updateFirebaseUserEmailVerified(uid)` takes no
 * properties object, no options and no field list. A caller therefore cannot ask
 * this bridge to write a second field — not `email`, not `disabled`, not
 * `customClaims`, not `password` — because there is no parameter through which to
 * ask. That is a structural property rather than a validated one: there is no
 * check that could be deleted or bypassed, and widening the write requires editing
 * this literal, in one place, on purpose.
 *
 * WHY THE UID IS THE CALLER'S. The `uid` this module writes comes from
 * `verifyFirebaseIdToken()` — a verified token's own uid — and from nowhere else.
 * The bridge re-guards it anyway (before the Admin app is even built) because it
 * is the one argument that decides WHOSE account is touched, and a blank or
 * non-string value must never reach the SDK. It deliberately does NOT read an
 * email, a `businessId`, a role or any other request value: the write's whole
 * authority is the uid, and the write's whole effect is one boolean.
 *
 * WHY IT RETURNS SO LITTLE. The SDK resolves with a full `UserRecord` — email,
 * disabled flag, custom claims, password/token metadata. None of that is returned.
 * The result is narrowed to `{ uid, emailVerified }`, so no caller can begin
 * depending on a field this operation has no business exposing, and adding one
 * becomes a deliberate edit here rather than an accidental read downstream. This
 * mirrors `tokenVerifier.ts`'s allowlisted identity: what crosses the boundary is
 * chosen, not inherited from the SDK.
 *
 * THE SEAM, AND WHERE THE SECURITY-RELEVANT WORK SITS. Like
 * `FirebaseIdTokenVerifier`, the write is dispatched through a replaceable
 * delegate whose default is the real Admin SDK call, so the whole layer is
 * testable with no Firebase project, no network and no credentials. The delegate
 * models the TRANSPORT ONLY: it resolves with the SDK's raw record, or rejects with
 * the SDK's own error shape (an Error carrying a `code`), and it classifies
 * nothing. Classification and narrowing therefore happen on the OUTER path — after
 * the delegate returns or throws — which is what keeps them under test on every
 * substituted path instead of only on the real one. A delegate that rejects with
 * one of this layer's own domain errors is passed through untouched rather than
 * re-classified, which is how `getFirebaseAdminApp()`'s `FirebaseNotConfigured`
 * survives the round trip.
 *
 * ERRORS. Only the SDK error CODE is read; the upstream message is discarded,
 * because it is produced by a library that was handed the credential and can echo
 * what it was given. Classification is delegated to `firebaseErrorFromSdkCode` in
 * `firebaseErrors.ts`, so an `auth/user-not-found` or `auth/user-disabled` becomes
 * a `FirebaseTokenError`, an `auth/invalid-credential` becomes
 * `FirebaseNotConfigured`, and everything else — including a missing or non-string
 * code, or a thrown non-Error — becomes `FirebaseUnavailableError`. Nothing here
 * decides an HTTP status.
 *
 * This module logs nothing, for the same reason the mail layer and `adminApp.ts`
 * log nothing: the value being handled is a credential-adjacent identifier in a
 * security-sensitive operation, and the cheapest guarantee is to have no logging
 * call at all.
 */

import { getAuth } from 'firebase-admin/auth';

import { getFirebaseAdminApp } from './adminApp.ts';
import { FirebaseTokenError, firebaseErrorFromSdkCode, isFirebaseError } from './firebaseErrors.ts';

/**
 * The narrow result of the one Admin write this server performs.
 *
 * `uid` is the value the caller supplied — the verified token's own uid, and the
 * only account this call could have touched. The SDK's record has a uid too, and
 * it is deliberately not what is surfaced: echoing the identifier the CALLER was
 * authorised to write keeps this shape independent of anything the record carries.
 *
 * `emailVerified` is the flag AS THE SDK REPORTS IT, coerced to a boolean. It is a
 * report, not a judgement: whether a record that does not read back `true` should
 * fail the confirmation is AUTH-04-B4's decision, and this bridge does not make it
 * (O-4).
 */
export interface FirebaseEmailVerificationWrite {
  uid: string;
  emailVerified: boolean;
}

/**
 * The seam a test substitutes through.
 *
 * It models the transport, so it resolves with the SDK's raw resolved value — the
 * `UserRecord` shape `admin.auth().updateUser()` resolves to — and rejects with the
 * SDK's own error shape. Deliberately typed `unknown`, because narrowing that value
 * and classifying that rejection are the parts worth testing, and both must run for
 * a substituted delegate exactly as they do for the real one.
 */
export type FirebaseUserUpdater = (uid: string) => Promise<unknown>;

/** The message the not-configured class carries for a WRITE, rather than a sign-in. */
const WRITE_NOT_CONFIGURED_MESSAGE =
  'Firebase Admin is not usable on this server (auth/invalid-credential), so the email-verification write cannot be performed.';

let updaterDelegate: FirebaseUserUpdater | null = null;

/**
 * Replaces the write delegate. Returns the previous delegate so a test can restore
 * it. Passing null restores the real Firebase Admin implementation.
 */
export function setFirebaseUserUpdater(
  delegate: FirebaseUserUpdater | null
): FirebaseUserUpdater | null {
  const previous = updaterDelegate;
  updaterDelegate = typeof delegate === 'function' ? delegate : null;
  return previous;
}

/** Restores the real Firebase Admin implementation. */
export function resetFirebaseUserUpdater(): void {
  updaterDelegate = null;
}

/** True while a substituted delegate is installed. */
export function hasCustomFirebaseUserUpdater(): boolean {
  return updaterDelegate !== null;
}

/**
 * The real transport: Firebase Admin's `updateUser`, with the write payload fixed
 * to the single field this operation exists to set.
 *
 * It classifies nothing. `getFirebaseAdminApp()` may throw its own
 * `FirebaseNotConfigured`, which the caller passes through untouched, and an SDK
 * rejection travels up in the SDK's own shape for the caller to classify — the one
 * place any of this is decided.
 */
async function updateUserWithAdminSdk(uid: string): Promise<unknown> {
  const auth = getAuth(getFirebaseAdminApp());

  // ★ THE ONLY WRITE, AND THE ONLY FIELD. `emailVerified: true` is not a default
  //   and not a parameter: it is the entire operation.
  return auth.updateUser(uid, { emailVerified: true });
}

/**
 * Narrows the SDK's record to `{ uid, emailVerified }`.
 *
 * Anything that is not the boolean `true` reads as `false` — a missing,
 * non-boolean or truthy-non-boolean value must never be reported as a completed
 * verification. That direction is deliberate: the flag is what the AUTH-04 flow
 * treats as the address being verified, so the failure direction is "not verified".
 */
function toEmailVerificationWrite(record: unknown, uid: string): FirebaseEmailVerificationWrite {
  const source = (record ?? {}) as Record<string, unknown>;
  return { uid, emailVerified: source.emailVerified === true };
}

/**
 * Sets a Firebase identity's `emailVerified` flag to `true`.
 *
 * Throws `FirebaseTokenError` when `uid` is missing, blank or not a string — the
 * same `missing-uid` reason `tokenVerifier.ts` uses for a token that carries no
 * uid, so the vocabulary stays closed and a caller can handle it exhaustively. The
 * guard runs before the transport, so a blank uid never spends a credential build.
 *
 * Throws one of the three domain errors for an SDK failure, and nothing else. No
 * HTTP status is decided here.
 */
export async function updateFirebaseUserEmailVerified(
  uid: unknown
): Promise<FirebaseEmailVerificationWrite> {
  if (typeof uid !== 'string' || uid.trim() === '') {
    throw new FirebaseTokenError('missing-uid');
  }

  const trimmedUid = uid.trim();
  const update = updaterDelegate ?? updateUserWithAdminSdk;

  let record: unknown;
  try {
    record = await update(trimmedUid);
  } catch (err) {
    // A domain error from the transport is already the right answer — notably
    // `getFirebaseAdminApp()`'s FirebaseNotConfigured, whose code is ours and would
    // otherwise be misread as an unrecognised SDK code.
    if (isFirebaseError(err)) throw err;

    // Classification reads the CODE and nothing else: the upstream message is
    // produced by a library that was handed the credential and is discarded here.
    throw firebaseErrorFromSdkCode(
      (err as { code?: unknown } | null)?.code,
      WRITE_NOT_CONFIGURED_MESSAGE
    );
  }

  return toEmailVerificationWrite(record, trimmedUid);
}

export default {
  updateFirebaseUserEmailVerified,
  setFirebaseUserUpdater,
  resetFirebaseUserUpdater,
  hasCustomFirebaseUserUpdater,
};
