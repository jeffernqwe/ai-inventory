/**
 * A fake Firebase Admin user updater, installed through the real seam (AUTH-04-B2).
 *
 * The production bridge dispatches through `setFirebaseUserUpdater`, so this file
 * exercises the SAME entry point the challenge service will use, and the narrowing
 * in `toEmailVerificationWrite` — the `{ uid, emailVerified }` shape and the
 * `=== true` coercion — runs on every case here exactly as it does in production.
 * That is the point: the delegate resolves with an SDK-SHAPED record, not an
 * already-narrowed value, so substituting the transport does not take the
 * security-relevant narrowing out of coverage.
 *
 * Errors are thrown in the SDK's own shape — an Error carrying a `code` property —
 * because the bridge must classify from the code alone. A fake that threw our
 * domain errors would test nothing: it would hand the bridge the answer.
 *
 * No network, no Firebase project, no credentials, and no Admin app is built.
 *
 * Usage:
 *   registerFakeFirebaseUserUpdater();
 *   setFakeFirebaseUserRecord({ emailVerified: true });   // optional; default
 *   ...
 *   updatedUids();                                        // what reached the write
 *   deregisterFakeFirebaseUserUpdater();                  // always, in a finally
 */

import {
  setFirebaseUserUpdater,
  resetFirebaseUserUpdater,
} from '../../src/services/firebase/userUpdater.ts';

let record = null;
let failure = null;
let seen = [];

/** An SDK-shaped `UserRecord`, including fields the bridge must NOT surface. */
export function fakeUserRecord({
  uid = 'fake-uid',
  emailVerified = true,
  email = 'owner@inventory-ai.test',
  disabled = false,
  customClaims = { role: 'OWNER' },
  metadata = { lastSignInTime: 'Wed, 01 Oct 2026 00:00:00 GMT' },
} = {}) {
  return { uid, emailVerified, email, disabled, customClaims, metadata };
}

/** The record the delegate resolves with. `null` restores the default success. */
export function setFakeFirebaseUserRecord(next) {
  record = next ?? null;
  failure = null;
}

/**
 * Makes the delegate reject with the SDK's shape: an Error whose `code` is the
 * upstream auth/app code. `message` is set to a HOSTILE string by default, so any
 * test that reads a thrown error can prove the upstream text was discarded.
 */
export function setFakeFirebaseUpdateFailure(
  code = 'auth/internal-error',
  message = 'updateUser failed'
) {
  failure = { code, message };
  record = null;
}

/** Makes the delegate throw an arbitrary non-Error value: an SDK-shape violation. */
export function setFakeFirebaseUpdateThrow(value) {
  failure = { thrown: value };
  record = null;
}

/**
 * Installs the fake. The uid is recorded BEFORE the scenario runs, so a test can
 * still see what was attempted when the case is a rejection.
 */
export function registerFakeFirebaseUserUpdater() {
  setFirebaseUserUpdater(async (uid) => {
    seen.push(uid);
    if (failure) {
      if (Object.prototype.hasOwnProperty.call(failure, 'thrown')) throw failure.thrown;
      const err = new Error(failure.message);
      if (failure.code !== undefined) err.code = failure.code;
      throw err;
    }
    return record ?? fakeUserRecord({ uid, emailVerified: true });
  });
}

export function deregisterFakeFirebaseUserUpdater() {
  resetFirebaseUserUpdater();
  record = null;
  failure = null;
  seen = [];
}

/** Every uid handed to the write, in order. */
export function updatedUids() {
  return seen.slice();
}

export function clearUpdatedUids() {
  seen = [];
}

export default {
  registerFakeFirebaseUserUpdater,
  deregisterFakeFirebaseUserUpdater,
  setFakeFirebaseUserRecord,
  setFakeFirebaseUpdateFailure,
  setFakeFirebaseUpdateThrow,
  fakeUserRecord,
  updatedUids,
  clearUpdatedUids,
};
