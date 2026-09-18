/**
 * A fake Firebase ID-token verifier, installed through the real seam.
 *
 * The production verifier dispatches through `setFirebaseIdTokenVerifier`, so this
 * file exercises the SAME entry point the exchange endpoint will use, and the
 * narrowing in `toVerifiedIdentity` — uid extraction, email lowercasing,
 * `email_verified` mapping — runs on every case here exactly as it does in
 * production. That is the point: the delegate returns a DECODED-TOKEN-SHAPED
 * payload, not an already-narrowed identity, so substituting the verifier does not
 * take the security-relevant narrowing out of coverage.
 *
 * No network, no Firebase project, no credentials.
 *
 * Usage:
 *   registerFakeFirebaseVerifier();
 *   setFakeFirebaseToken({ uid: 'abc', email: 'Owner@Example.test', email_verified: true });
 *   ...
 *   verifiedTokens();                       // what reached the verifier
 *   deregisterFakeFirebaseVerifier();       // always, in a finally
 */

import crypto from 'node:crypto';

import {
  setFirebaseIdTokenVerifier,
  resetFirebaseIdTokenVerifier,
} from '../../src/services/firebase/tokenVerifier.ts';
import { FirebaseTokenError } from '../../src/services/firebase/firebaseErrors.ts';

let payload = null;
let failure = null;
let seen = [];

/** The decoded-token payload the fake resolves with. `null` is a bare valid token. */
export function setFakeFirebaseToken(next) {
  payload = next ?? {};
  failure = null;
}

/** Rejects with FirebaseTokenError, as the real verifier does for a bad token. */
export function setFakeFirebaseFailure(reason = 'auth/id-token-expired') {
  failure = reason;
}

/**
 * Installs the fake. Returns the token-payload setter for convenience.
 *
 * The recorded token is pushed BEFORE the scenario runs, so a test can still see
 * what was attempted when the case is a rejection.
 */
export function registerFakeFirebaseVerifier() {
  setFirebaseIdTokenVerifier(async (idToken) => {
    seen.push(idToken);
    if (failure) throw new FirebaseTokenError(failure);
    return payload ?? {};
  });
}

export function deregisterFakeFirebaseVerifier() {
  resetFirebaseIdTokenVerifier();
  payload = null;
  failure = null;
  seen = [];
}

/** Every token string handed to the verifier, in order. */
export function verifiedTokens() {
  return seen.slice();
}

export function clearVerifiedTokens() {
  seen = [];
}

/**
 * A real RSA private key in PKCS#8 PEM form, generated per call.
 *
 * Real rather than a placeholder because `firebase-admin`'s `cert()` PARSES the
 * key when the app is initialized — a stub string would make an initialization
 * test fail for the wrong reason. Generating one costs a few milliseconds and
 * touches nothing outside the process: `initializeApp` with a credential makes no
 * network call, so this exercises the whole config → credential → app path
 * offline.
 */
export function generateTestPrivateKey() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return privateKey;
}

/**
 * A well-formed service-account object, as Firebase Console issues one.
 *
 * The field names match the downloaded JSON exactly (snake_case), because the
 * point of these tests is that config/firebase.ts reads THAT shape.
 */
export function fakeServiceAccount({
  projectId = 'inventory-ai-test',
  // Deliberately NOT in the `<project>.iam.gserviceaccount.com` shape a real
  // service account uses. Nothing validates the format, and a fixture that reads
  // like a live credential is a false positive for anyone scanning the repo for
  // leaked secrets — this repository contains none, and should not look like it
  // might.
  clientEmail = 'firebase-adminsdk-test@example.test',
  privateKey = generateTestPrivateKey(),
} = {}) {
  return {
    type: 'service_account',
    project_id: projectId,
    private_key_id: 'test-key-id',
    private_key: privateKey,
    client_email: clientEmail,
    client_id: '1234567890',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/test',
  };
}

/** The service account serialized the way Firebase Console downloads it. */
export function fakeServiceAccountJson(options) {
  return JSON.stringify(fakeServiceAccount(options));
}

/** The same JSON, base64-encoded — the single-line transport form. */
export function fakeServiceAccountJsonBase64(options) {
  return Buffer.from(fakeServiceAccountJson(options), 'utf8').toString('base64');
}

export default {
  registerFakeFirebaseVerifier,
  deregisterFakeFirebaseVerifier,
  setFakeFirebaseToken,
  setFakeFirebaseFailure,
  verifiedTokens,
  clearVerifiedTokens,
  generateTestPrivateKey,
  fakeServiceAccount,
  fakeServiceAccountJson,
  fakeServiceAccountJsonBase64,
};
