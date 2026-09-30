/**
 * Phase 1 (RNFirebase foundation) / Phase B (native email and password) / Phase C / N-3
 * (native Google Sign-In) — the React Native Firebase (native SDK) boundary.
 *
 * ONE HALF OF A PAIR, AND — SINCE PHASE B — THE AUTHENTICATING HALF. `lib/firebase.ts`
 * is the Firebase *JavaScript* SDK boundary and is deliberately unchanged: the Google
 * sign-in flow (Phase 32I) and the disconnect confirmation (Phase 32L-B) still run
 * through it, because native Google is Phase C and migrating them here would be work
 * this phase was not authorised to do. This module is the *native* boundary, and
 * Phase B is the phase that gives it email/password sign-in, registration, sign-out
 * and ID-token access — so every shipped email/password path now authenticates through
 * the native SDK, with native durable persistence (owner decision P2, which supersedes
 * the Phase 32D `inMemoryPersistence` decision for this implementation).
 *
 * THE ONLY MODULE THAT NAMES THE NATIVE PACKAGES. Every other module — including
 * `lib/firebase-auth.ts`, which is the only importer — reaches Firebase through the
 * functions below. That is a property of the code rather than a convention:
 * `__tests__/phase1-rnfirebase-foundation.test.ts` fails if any other file under
 * `app/` or `lib/` mentions `@react-native-firebase`, and it pins that this module is
 * the only place an authentication verb may appear.

 * TWO MODULES REACH THIS BOUNDARY (Phase 16): `lib/firebase-auth.ts`, which owns the
 * Firebase operations and the decision about what a failure means, and `lib/auth.tsx`,
 * which owns the email-verification JOURNEY. The Phase 1 guard names exactly those two
 * as the permitted importers, and no screen may ever appear in that list.
 *
 * GATED, AND THE GATE IS CHECKED BEFORE EITHER NATIVE PACKAGE IS LOADED.
 * `isNativeFirebaseConfigured()` is the same all-or-nothing `EXPO_PUBLIC_FIREBASE_*`
 * gate the JS SDK uses — not a second flag, because an app configured for Firebase is
 * configured for both boundaries. With the four values unset, `loadNativeFirebase()`
 * returns `null` before the first `require()`, so importing this file cannot change
 * how the app runs and no native module is evaluated at all.
 *
 * LAZY, FOR THE SAME REASON PHASE 1 RECORDED. The native modules are reached through
 * Metro's synchronous `require()` INSIDE the loader, once the gate has passed, rather
 * than through a static import. A static import would evaluate
 * `@react-native-firebase/app` as soon as any importer is bundled, which in a build
 * that does not contain the native module (Expo Go, the Jest environment) throws
 * before a single line of app code runs; and a dynamic `import()` is not a portable
 * answer, because Expo's own Metro documentation warns it is generally unavailable
 * with Hermes enabled. The guards permit exactly two `require()` call sites and two
 * erased type queries, which is why the loader below is the only place either package
 * appears.
 *
 * NO CACHE, AND WHY THAT IS SAFE HERE. `getAuth()` is idempotent in React Native
 * Firebase — it returns the shared instance for the app — so there is nothing to
 * memoize and none of the `auth/already-initialized` hazard of the kind
 * `lib/firebase.ts` records for `initializeAuth`. The only per-call cost is the two
 * `require()`s, which Metro and Jest cache after the first evaluation.
 *
 * WHAT IT NEVER DOES. It never hands a Firebase ID token to a screen, never stores
 * one, never logs one, and never makes one the API bearer credential — the Inventory
 * AI JWT stays the only bearer (owner decision, and the Phase 32A Option B freeze).
 * The token it returns leaves this module only for `lib/firebase-auth.ts`, which
 * passes it straight to `POST /api/auth/firebase/exchange`, where it is consumed once.
 * It attaches no auth-state listener: state is PULLED, never pushed, so a durable
 * native `currentUser` can never sign anyone into the Inventory AI app by itself.
 *
 * PHASE B DELIBERATELY DOES NOT USE. `setPersistence` (it throws on React Native
 * Firebase, by design — P2 §3), `reauthenticateWith*`, `onAuthStateChanged`,
 * `onIdTokenChanged`, the provider link/unlink operations, the email-link verb
 * and the account-mutation verbs. Each is either a later phase's work or forbidden
 * outright, and the guards enumerate them so that "not yet" cannot drift into
 * "accidentally". N-3 IS THE ONE RELAXATION SINCE: owner decision L-7 hands password
 * recovery to Firebase, so `sendPasswordResetEmail` and `confirmPasswordReset` are now
 * this boundary's own operations and the guard names them as permitted rather than as
 * risks. `sendSignInLinkToEmail` and every other group here remain forbidden.
 *
 * PHASE C ADDS A THIRD NATIVE PACKAGE, AND ONLY FOR SIGN-IN.
 * `@react-native-google-signin/google-signin` performs the native Google consent
 * step and hands back a Google `id_token`; this module exchanges that for a Firebase
 * credential and then for a Firebase ID token, so the caller's input is unchanged.
 * The browser (authorization-code + PKCE) flow is deliberately NOT deleted: it is
 * still what `confirmFirebaseSignIn`'s `google` method uses for the DISCONNECT
 * confirmation, which Phase D/E owns. Both therefore coexist for one phase, and the
 * guards keep the native package confined to this file exactly as they keep
 * `@react-native-firebase` confined.
 */

import { GOOGLE_WEB_CLIENT_ID, isFirebaseConfigured } from './config';

/**
 * `require` is not part of this project's TypeScript program: `tsconfig.json` pins
 * `"types": ["jest"]` so no ambient package leaks in. The declaration below is
 * scoped to this file and exists only so the lazy loader can be written at all —
 * Metro and Jest both provide a real `require` at runtime.
 */
declare const require: (id: string) => unknown;

/** Bounded so a native error cannot dump a stack or a path into a caller's UI. */
const MAX_REASON_LENGTH = 200;

export type NativeFirebaseStatus =
  /** The `EXPO_PUBLIC_FIREBASE_*` gate is not satisfied: nothing was loaded. */
  | 'unconfigured'
  /** The native modules loaded and Firebase Auth initialized. */
  | 'available'
  /** The gate passed but the native modules could not be loaded or initialized. */
  | 'unavailable';

export type NativeFirebaseProbe = {
  status: NativeFirebaseStatus;
  /**
   * Why the boundary is `'unavailable'`, as a single bounded line. Present only
   * for that status: the module-load and module-init failures it reports carry no
   * credential, no token and no configuration value, which is why it is safe to
   * surface, and why it is truncated and stripped of newlines.
   */
  reason?: string;
  /**
   * Whether a Firebase Auth user is already persisted on the device. Read from
   * `auth.currentUser`, never from a listener. Phase 1 expected `false`; under P2
   * durable persistence a signed-in device reports `true` after a relaunch, which
   * is exactly the state the Phase B tests and the device run observe.
   */
  hasCurrentUser?: boolean;
};

/** A single bounded line: no newlines, no stack, never longer than the cap. */
function reasonFrom(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const firstLine = (raw.split('\n')[0] ?? '').trim();
  return firstLine.length > MAX_REASON_LENGTH ? `${firstLine.slice(0, MAX_REASON_LENGTH)}…` : firstLine;
}

/**
 * Whether the native boundary is enabled at all.
 *
 * Delegates to the one gate the app already uses, rather than adding a second
 * environment variable: an app configured for Firebase is configured for both
 * boundaries, and a second flag would be a second thing to get wrong.
 */
export function isNativeFirebaseConfigured(): boolean {
  return isFirebaseConfigured();
}

// ---------------------------------------------------------------------------
// The native module namespaces, typed by their own declarations
// ---------------------------------------------------------------------------
//
// Declared with a `typeof import(...)` TYPE query rather than an
// `import ... from '@react-native-firebase/...'` statement, and the difference is
// load-bearing twice over. A static import would evaluate the native package as
// soon as this module is bundled — before the gate could ever be consulted — which
// is the failure the lazy loader exists to prevent; and the boundary's own guards
// forbid that shape outright. A type query is erased by the compiler, so it costs
// nothing at runtime and cannot be mistaken for a real import. These two aliases are
// the only place either package name appears besides the two `require()` calls.

type NativeAppModule = typeof import('@react-native-firebase/app');
type NativeAuthModule = typeof import('@react-native-firebase/auth');
type NativeAuth = ReturnType<NativeAuthModule['getAuth']>;
type NativeGoogleSigninModule = typeof import('@react-native-google-signin/google-signin');

type LoadedNativeFirebase = {
  /** The module namespace, so operations call the modular API exactly as documented. */
  auth: NativeAuthModule;
  /** The shared Auth instance for the default app. */
  instance: NativeAuth;
};

/**
 * The one place either native package is evaluated.
 *
 * Returns `null` — never throws — when the gate is off, so "this build has no
 * Firebase configuration" stays a state a caller can branch on rather than an error
 * it has to catch, the shape `isMailConfigured()` takes on the server (Phase 26B-1)
 * and `getFirebaseAuth()` takes in `lib/firebase.ts`. A `require()` that fails
 * because the native module is absent from the build DOES throw, and that is
 * deliberate: it is a broken build, not an unconfigured one, and the callers below
 * classify it as an ordinary failure rather than as a legacy-account signal.
 */
function loadNativeFirebase(): LoadedNativeFirebase | null {
  if (!isNativeFirebaseConfigured()) return null;
  const app = require('@react-native-firebase/app') as NativeAppModule;
  const auth = require('@react-native-firebase/auth') as NativeAuthModule;
  return { auth, instance: auth.getAuth(app.getApp()) };
}

/**
 * The Google Sign-In namespace, or `null` when native Google cannot run.
 *
 * The SAME two rules the loader above follows, for the same reasons: the gate is
 * consulted before the package is evaluated, so an unconfigured build never loads
 * it; and the module is reached through Metro's synchronous `require()` rather than
 * a static import, so a build without the native module cannot throw at bundle
 * evaluation time.
 */
function loadNativeGoogleSignin(): NativeGoogleSigninModule | null {
  if (!isNativeGoogleConfigured()) return null;
  return require('@react-native-google-signin/google-signin') as NativeGoogleSigninModule;
}

/**
 * The loaded boundary, or a throw.
 *
 * Exists so the signing operations below read as their own logic rather than as a
 * null check each. The throw is defensive: `lib/firebase-auth.ts` consults
 * `isNativeFirebaseConfigured()` before calling any of them, so a gate that is off
 * is already answered there — but a boundary that silently returned a token-less
 * success would be far worse than one that refuses loudly, so it refuses loudly.
 */
function requireNativeFirebase(): LoadedNativeFirebase {
  const loaded = loadNativeFirebase();
  if (!loaded) throw new NativeFirebaseUnconfiguredError();
  return loaded;
}

/**
 * Thrown when a signing operation is attempted while the gate is off. Carries a
 * fixed code and no detail, so it can never echo a configuration value, and it is
 * not exported: no caller needs to name it, and a caller that branched on it would
 * be duplicating the gate check it already performs.
 */
class NativeFirebaseUnconfiguredError extends Error {
  readonly code = 'native/unconfigured';
  constructor() {
    super('Firebase is not configured for this build.');
    this.name = 'NativeFirebaseUnconfiguredError';
  }
}

// ---------------------------------------------------------------------------
// The probe (Phase 1, unchanged)
// ---------------------------------------------------------------------------

/**
 * Loads the native Firebase modules and initializes Firebase Auth, once the gate
 * has passed.
 *
 * Never throws and never returns a credential: a build with no native module (or a
 * misconfigured one) degrades to `{ status: 'unavailable', reason }`, which is the
 * behaviour a caller can branch on. Phase 1's acceptance criterion — and now Phase
 * B's device observability — is `hasCurrentUser`, which reports whether the native
 * SDK restored a durable session rather than assuming it did.
 */
export function probeNativeFirebase(): NativeFirebaseProbe {
  if (!isNativeFirebaseConfigured()) return { status: 'unconfigured' };

  try {
    const { instance } = requireNativeFirebase();
    return { status: 'available', hasCurrentUser: instance.currentUser !== null };
  } catch (error) {
    return { status: 'unavailable', reason: reasonFrom(error) };
  }
}

// ---------------------------------------------------------------------------
// The native operations (Phase B)
// ---------------------------------------------------------------------------
//
// EVERY ONE OF THESE CONSULTS THE GATE FIRST, and none of them can leak a token
// upwards: the two that return one return it to `lib/firebase-auth.ts` alone, which
// is the only importer. The token is never a parameter, never a return value of
// anything a screen can reach, never persisted and never logged.
//
// The MODULAR API is used throughout (`signInWithEmailAndPassword(auth, ...)`)
// rather than the instance methods, because that is the shape the previous
// implementation used and the shape React Native Firebase documents as mirroring the
// firebase-js-sdk — so the swap is an import change and not a rewrite.

/**
 * Whether a Firebase Auth user is already signed in on this device.
 *
 * Read-only and total: `false` when the gate is off, when the native module cannot
 * be loaded, and when nobody is signed in. It exists so the durable-session state is
 * OBSERVABLE — by the device run and by the reconciliation tests — rather than
 * inferred, and so nothing needs an auth-state listener to learn it.
 */
export function nativeHasCurrentUser(): boolean {
  try {
    const loaded = loadNativeFirebase();
    return loaded ? loaded.instance.currentUser !== null : false;
  } catch {
    return false;
  }
}

/**
 * Signs in with email and password and returns a fresh Firebase ID token.
 *
 * Throws whatever the native SDK throws. That is intentional: the error objects
 * carry a namespaced `code` (`auth/invalid-credential`, `auth/user-not-found`, …)
 * and `lib/firebase-auth.ts` is the layer that decides what a code means. Reading the
 * error here would put the fallback policy in two places.
 */
export async function nativeSignInWithEmail(
  email: string,
  password: string
): Promise<{ idToken: string }> {
  const { auth, instance } = requireNativeFirebase();
  const credential = await auth.signInWithEmailAndPassword(instance, email, password);
  return { idToken: await credential.user.getIdToken() };
}

/**
 * Creates a Firebase identity for these credentials and returns its ID token.
 *
 * The display name is written here, after the identity exists, and its failure is
 * swallowed: it is profile text the server never reads (the `name` the server stores
 * comes from the register request body), so a cosmetic write must not fail a signup
 * that has already succeeded at everything that matters. This is the same
 * arrangement the previous implementation had, moved one layer down.
 *
 * The ORPHAN-ADOPTION branch is deliberately NOT here. It is a policy about the
 * caller's journey — "this address is taken, so sign into what exists with the same
 * password" — and it lives beside the other journey decisions in
 * `lib/firebase-auth.ts`, which is also where its safety argument is written down.
 * This function therefore reports `auth/email-already-in-use` as the SDK raised it.
 */
export async function nativeCreateUserWithEmail(
  email: string,
  password: string,
  name?: string
): Promise<{ idToken: string }> {
  const { auth, instance } = requireNativeFirebase();
  const credential = await auth.createUserWithEmailAndPassword(instance, email, password);
  const user = credential.user;

  const trimmed = (name ?? '').trim();
  if (trimmed) {
    try {
      // The MODULAR form, because React Native Firebase's `User` type exposes no
      // `updateProfile` method — the operation is a top-level function that takes the
      // user, exactly as it is in the firebase-js-sdk's modular API.
      await auth.updateProfile(user, { displayName: trimmed });
    } catch {
      // Cosmetic only — see the note above.
    }
  }

  return { idToken: await user.getIdToken() };
}

/**
 * Ends the durable Firebase session, and reports whether it could.
 *
 * NEVER THROWS, and that is what makes it safe to call from paths that must not fail:
 * the central sign-out runs it after the local session is already gone, and the
 * session-loss handler runs it after the Inventory AI session is already cleared. A
 * device with no network, or a build with no native module, simply answers `false`.
 *
 * THE RETURN VALUE IS THE OBSERVABILITY (owner decision, Phase B requirement 5). A
 * best-effort operation that swallowed its failure entirely would leave a durable
 * credential in place with no way to tell; returning a boolean means the outcome is
 * reported rather than assumed — a test can force the failure and assert `false`, and
 * no token, no key and no error text is ever logged to achieve it. `true` is returned
 * when there was nothing to end, because "no Firebase session exists" and "the
 * session was ended" are the same outcome for every caller.
 */
export async function nativeSignOut(): Promise<boolean> {
  try {
    const loaded = loadNativeFirebase();
    if (!loaded) return true;
    await loaded.auth.signOut(loaded.instance);
    return true;
  } catch {
    return false;
  }
}

/**
 * A fresh Firebase ID token for the identity that is already signed in, or `null`.
 *
 * `getIdToken()` with no argument returns the cached token and transparently
 * refreshes it near expiry, so a long-lived session is not punished. Under P2 the
 * session is durable, so this can answer after a cold start — which is precisely why
 * its consumers must never treat a token as an authenticated Inventory AI session.
 *
 * TOTAL BY DESIGN: "no current user", "the gate is off" and "the refresh failed" all
 * answer `null`. They are different facts with one consequence here — this device
 * cannot produce a credential right now — and collapsing them keeps every caller to a
 * single safe branch. It never fabricates or reconstructs a token.
 */
export async function nativeCurrentIdToken(): Promise<string | null> {
  try {
    const loaded = loadNativeFirebase();
    const user = loaded?.instance.currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// The native operations (N-3) — Firebase-native password recovery
// ---------------------------------------------------------------------------
//
// THE PHASE 1 VERB GUARD IS DELIBERATELY RELAXED FOR EXACTLY THESE TWO VERBS.
// `sendPasswordResetEmail` and `confirmPasswordReset` were forbidden while recovery
// belonged to the server (Phases 26B/27) and no Firebase flow had been authorised.
// Owner decision L-7 hands password recovery to Firebase, so they are now operations
// of this boundary; `phase1-rnfirebase-foundation.test.ts` names them as permitted,
// and every other forbidden group there is untouched.
//
// NEITHER OPERATION HANDS A CREDENTIAL UPWARD. The request answers nothing at all on
// success — Firebase composes and sends the mail — and the confirmation consumes the
// one-time code it is given and returns no user, no token and no session. The
// `oobCode` therefore enters as an argument, goes straight to the SDK, and is never
// stored, returned, logged, or attached to anything this module exports. That is the
// property the reset screen leans on when it keeps the code in route params for as
// long as the screen is mounted and nowhere else.
//
// THE DEEP LINK IS DECLARED RATHER THAN DERIVED, because nothing in JavaScript can
// read it at runtime: it is three build-level facts that live in `app.json`
// (`expo.scheme`, `android.package`, `ios.bundleIdentifier`). The N-3 suite pins the
// constants below against that file, so a scheme or package change fails a test
// instead of silently producing a reset link the app cannot receive.

/** `expo.scheme` plus the reset route. Pinned against `app.json` by the N-3 suite. */
const PASSWORD_RESET_DEEP_LINK = 'inventoryai://reset-password';

/** `android.package` / `ios.bundleIdentifier`. Pinned against `app.json` too. */
const APP_ANDROID_PACKAGE = 'com.inventoryai.app';
const APP_IOS_BUNDLE_ID = 'com.inventoryai.app';

/**
 * Sends Firebase's own password-reset email for this address.
 *
 * WHAT THE SETTINGS ASK FIREBASE TO DO, AND WHAT IS STILL NOT KNOWN ABOUT IT. They are
 * the design authority's prescription (design §14C.4): the emailed link should return
 * control to the app carrying the one-time code rather than landing on Firebase's
 * hosted page. Whether Firebase's hosted action handler honours that for a PASSWORD
 * RESET is the open gate L-17/B-2, and nothing here may be read as having settled it.
 * If it does not, the link opens the hosted page in a browser and the code never
 * reaches this app — a question about Firebase's behaviour, not a fault in this
 * function.
 *
 * It answers `void` and throws whatever the SDK threw, exactly like the Phase B
 * operations: the classification layer above decides what a code means, and a second
 * opinion here would split that decision in two.
 */
export async function nativeSendPasswordResetEmail(email: string): Promise<void> {
  const { auth, instance } = requireNativeFirebase();
  await auth.sendPasswordResetEmail(instance, email, {
    url: PASSWORD_RESET_DEEP_LINK,
    handleCodeInApp: true,
    android: { packageName: APP_ANDROID_PACKAGE, installApp: true },
    iOS: { bundleId: APP_IOS_BUNDLE_ID },
  });
}

/**
 * Checks a password-reset code and resolves with the ACCOUNT'S EMAIL (N-4).
 *
 * WHY THIS EXISTS. The approved N-4 sequence has the reset screen establish a recovery
 * marker BEFORE the password changes, and the marker is a fingerprint of the reset
 * account — so the screen has to learn which account the code belongs to. Typing the
 * address again is the only alternative, and it is strictly worse: it can disagree with
 * the account the code actually belongs to, and it makes the marker wrong (or absent) for
 * anyone who mistypes it.
 *
 * IT DOES NOT CONSUME THE CODE, and that is the documented pairing rather than an
 * assumption: Firebase's own handling of an action link is to read the `oobCode`, verify
 * it to learn/display which account it is for, and THEN call `confirmPasswordReset` with
 * the same code. A destructive verify would make that documented sequence impossible.
 * The claim is nevertheless on the open gate L-17 — the live check that this returns the
 * right address without spending the code is recorded as an explicit device-test
 * requirement (design §14C.3.9 M-10), because nothing here has been exercised against a
 * real project.
 *
 * IF IT EVER WERE DESTRUCTIVE THE FAILURE IS SAFE AND RETRYABLE: the following
 * `confirmPasswordReset` would answer `auth/invalid-action-code`, which the reset screen
 * already renders as "this link is invalid or has expired" — a dead link the person
 * replaces, never a security hole.
 *
 * THE EMAIL IS NOT A CREDENTIAL AND IS NOT AN IDENTITY. It leaves this module only to
 * become (a) the address of the automatic sign-in that follows a reset and (b) half of a
 * non-secret local fingerprint. It never authorizes anything: the server resolves the
 * account from the signed-in session and the verified uid, exactly as it does for every
 * other request. Nothing here stores, logs or returns anything else about the account.
 */
export async function nativeVerifyPasswordResetCode(oobCode: string): Promise<string> {
  const { auth, instance } = requireNativeFirebase();
  return await auth.verifyPasswordResetCode(instance, oobCode);
}

/**
 * Completes a Firebase password reset with the one-time code from the email.
 *
 * IT CONSUMES THE CODE, and that is the whole of the single-use guarantee. Firebase's
 * action code is time-limited and is invalidated by the reset itself, so a second call
 * with the same code cannot succeed; this function deliberately keeps no state of its
 * own to enforce that, because a local opinion about a server-side credential could
 * only be wrong.
 *
 * The new password is the last thing the caller hands over, and nothing here retains
 * it: no variable in this module holds it once the SDK call has returned, and no part
 * of it is returned, echoed or logged.
 */
export async function nativeConfirmPasswordReset(
  oobCode: string,
  newPassword: string
): Promise<void> {
  const { auth, instance } = requireNativeFirebase();
  await auth.confirmPasswordReset(instance, oobCode, newPassword);
}

// ---------------------------------------------------------------------------
// The native operations (Phase 16) — email verification
// ---------------------------------------------------------------------------
//
// THE THREE OPERATIONS THE VERIFICATION FLOW NEEDS. They live here rather than in
// `lib/firebase-auth.ts` because that module is frozen work and stays byte-identical,
// so the boundary grows the native calls it needs and the JOURNEY lives in
// `lib/auth.tsx`. Nothing here makes a policy decision: each function performs one SDK
// call and reports what actually happened.
//
// NO RESOLVED PROMISE IS TREATED AS PROOF OF ANYTHING (RNFirebase 26.4.0 divergence).
// Android resolves `reload`/`sendEmailVerification` when no user is signed in
// (`promiseNoUser(promise, false)` -> `resolve(null)`), while iOS rejects with
// `auth/no-current-user`. Each function below checks `instance.currentUser` itself, so
// the answer does not depend on which platform produced it.

/**
 * Thrown when a user-scoped native operation runs with no signed-in user.
 *
 * The code is this boundary's OWN — it belongs to the `native/*` namespace the other
 * boundary errors already use, not to a Firebase `auth/*` code. That distinction is
 * deliberate and guarded: the boundary must never mirror, hardcode or classify a
 * Firebase code, because classification is the layer above's job. Spelling it
 * `auth/no-current-user` to look like the one iOS rejects with would have both
 * hardcoded an `auth/*` string here and implied a platform dependency this function
 * exists to avoid — Android's silent resolve is why `currentUser` is checked locally.
 * It is not exported: no caller needs to name it, and a caller branching on it would
 * be duplicating the check the function already performs.
 */
class NativeNoCurrentUserError extends Error {
  readonly code = 'native/no-current-user';
  constructor() {
    super('No user is currently signed in.');
    this.name = 'NativeNoCurrentUserError';
  }
}

/**
 * Sends Firebase's own email-verification message for the signed-in user.
 *
 * THROWS when there is no current user, on both platforms, rather than inheriting
 * Android's silent resolve: a resolved call then means the message was really sent.
 * The caller classifies the thrown code through the shared error set.
 */
/**
 * Sets a NEW Firebase password for the signed-in identity. THIS IS THE CREDENTIAL
 * OPERATION (Phase A / F-1).
 *
 * Firebase owns the password for a Firebase-linked account, so changing it is a
 * Firebase-native call and never a request to this application's own API. Nothing is
 * returned, because the operation either happened or threw — there is no value to
 * report beyond that, and inventing one would invite a caller to treat an SDK result
 * as an authorization fact.
 *
 * THROWS when there is no current user, on both platforms, for the reason
 * `nativeSendEmailVerification` records: Android resolves user-scoped calls with no
 * user while iOS rejects them, so the check is made here and the answer does not
 * depend on the platform. Otherwise it throws the SDK's own error and CLASSIFIES
 * NOTHING — `auth/requires-recent-login`, `auth/weak-password`,
 * `auth/network-request-failed` and the rest are the caller's to read, because
 * deciding what a code means is `lib/firebase-auth.ts`'s job and mirroring a code
 * here would put that decision in two places.
 *
 * THE MODULAR FORM, because React Native Firebase exposes this operation as a
 * top-level function taking the user rather than as a method on it — the same shape
 * `updateProfile` above uses for the same reason.
 */
export async function nativeUpdatePassword(newPassword: string): Promise<void> {
  const { auth, instance } = requireNativeFirebase();
  const user = instance.currentUser;
  if (!user) throw new NativeNoCurrentUserError();
  await auth.updatePassword(user, newPassword);
}

export async function nativeSendEmailVerification(): Promise<void> {
  const { auth, instance } = requireNativeFirebase();
  const user = instance.currentUser;
  if (!user) throw new NativeNoCurrentUserError();
  await auth.sendEmailVerification(user);
}

/**
 * Reloads the signed-in user's profile from Firebase and answers whether the address
 * is now VERIFIED.
 *
 * THE GETTER IS READ AFTER THE RELOAD, never the resolved value: the modular API
 * types `reload` as `Promise<void>` even though the native side resolves a user, so
 * the refreshed state is read from `instance.currentUser.emailVerified`.
 *
 * Answers `false` when there is no current user rather than throwing, because "no
 * identity on this device" is a definite not-verified answer the screen renders
 * exactly as it renders a still-unverified one.
 */
export async function nativeReloadUser(): Promise<boolean> {
  const { auth, instance } = requireNativeFirebase();
  const user = instance.currentUser;
  if (!user) return false;
  await auth.reload(user);
  return instance.currentUser?.emailVerified === true;
}

/**
 * A FORCED-refresh Firebase ID token, or `null` when there is none to mint.
 *
 * RG-9 REQUIRES THIS SPECIFICALLY: `getIdToken()` with no argument returns the CACHED
 * token, which can still carry the pre-verification `email_verified: false`, so the
 * post-verification registration must present a token minted after the reload.
 * `getIdToken(true)` re-mints it.
 */
export async function nativeForceIdToken(): Promise<string | null> {
  const { instance } = requireNativeFirebase();
  const user = instance.currentUser;
  if (!user) return null;
  return user.getIdToken(true);
}

// The native operations (Phase C) — Google Sign-In
// ---------------------------------------------------------------------------
//
// THE SAME SHAPE AS THE PHASE B OPERATIONS ABOVE: gate first, lazy load, and a
// result carrying only what `lib/firebase-auth.ts` needs. It ends by returning a
// FIREBASE ID token, which the caller exchanges once at the one existing boundary
// (`POST /api/auth/firebase/exchange`), exactly as the browser flow did before it.
// No Google-specific server route exists or is needed, because the exchange is
// UID-authoritative and never asks which provider minted the identity.
//
// THE GOOGLE ID TOKEN IS A CREDENTIAL FOR FIREBASE, NOT FOR INVENTORY AI. It is
// consumed by `GoogleAuthProvider.credential()` two lines after it is received and
// is never returned, persisted, logged or handed to a screen — the same standing
// the browser flow's Google token had.
//
// IT REPLACES THE BROWSER FLOW FOR **SIGN-IN ONLY**. `confirmFirebaseSignIn`'s
// `google` method still runs the Phase 32I authorization-code + PKCE sequence,
// because the disconnect confirmation is Phase D/E work the owner has not
// authorised migrating here. Both implementations therefore coexist for one phase,
// and neither is dead code.

/**
 * The scopes the native flow requests. `openid` is the one that makes Google return
 * an `id_token` at all — `email` and `profile` are what the person sees on the
 * consent sheet — and they are written out rather than relied on as the library's
 * defaults so the requirement is visible at the call site.
 */
const NATIVE_GOOGLE_SCOPES: readonly string[] = ['openid', 'email', 'profile'];

/**
 * What {@link nativeSignInWithGoogle} answers.
 *
 * A discriminated union for the same reason `FirebaseSignInOutcome` is one:
 * cancellation is ORDINARY, not a failure — the person closed the sheet — and
 * modelling it as a thrown error would push a routine action into a `catch`.
 * There is deliberately no `failure` member: a genuine failure is a THROW, so the
 * classification layer above sees exactly one shape for each case.
 */
export type NativeGoogleSignInResult =
  | { kind: 'idToken'; idToken: string }
  | { kind: 'cancelled' };

/**
 * Whether native Google Sign-In can run at all.
 *
 * TWO CONDITIONS, AND BOTH ARE REAL. The Google library needs a **Web** OAuth client
 * ID — the value Firebase injects into the Android build as `default_web_client_id` —
 * because only a web client mints an `id_token` from a native sign-in; an Android
 * client ID in that slot is a build fault, not a degraded mode. And the Firebase
 * boundary must be configured, because a Google identity is only useful once
 * `signInWithCredential` has turned it into a Firebase ID token.
 *
 * DELIBERATELY NOT `isGoogleConfigured()` FROM `lib/config.ts`. That predicate
 * answers "is there a client ID for THIS PLATFORM", which is the right question for
 * the browser flow (which uses the Android client on Android). This one asks the
 * narrower question the native flow needs, and the two must not be conflated: on a
 * build with only the Android client set, the browser flow works and this one must
 * refuse rather than configure the library with the wrong client.
 */
export function isNativeGoogleConfigured(): boolean {
  return isNativeFirebaseConfigured() && Boolean(GOOGLE_WEB_CLIENT_ID);
}

/**
 * Raised when native Google Sign-In cannot complete, carrying a code this app owns.
 *
 * THE NATIVE MESSAGE IS DISCARDED, NOT RELAYED, and the fixed sentence is what
 * replaces it. google-signin's errors can carry a developer-written description and,
 * on Android, activity and package detail; none of that belongs in front of a user,
 * and the classification layer above branches on `code` alone. `code` is the only
 * field a caller may read — the same shape `FirebaseAuthError` has, so
 * `lib/firebase-auth.ts` needs no second branch.
 */
class NativeGoogleSignInError extends Error {
  readonly code: string;
  constructor(code: string) {
    super('Google sign-in could not be completed.');
    this.code = code;
    this.name = 'NativeGoogleSignInError';
  }
}

/** The loaded Google namespace, or a throw. Mirrors `requireNativeFirebase`. */
function requireNativeGoogleSignin(): NativeGoogleSigninModule {
  const loaded = loadNativeGoogleSignin();
  if (!loaded) throw new NativeGoogleSignInError('google/not-configured');
  return loaded;
}

/**
 * Google Sign-In's failure code, reduced to a closed set this app owns.
 *
 * EVERY BRANCH IS A CODE WE CHOSE. google-signin reports failures through
 * `statusCodes`, whose values are Android status codes rendered as strings, and the
 * library's own `isErrorWithCode` is the documented way to tell one from an
 * arbitrary throw. Anything unrecognised becomes `google/failed`, so an unexpected
 * or future failure can never smuggle native text upward — the code is kept for the
 * operator, the sentence shown is always ours.
 */
function mapGoogleSignInFailure(
  google: NativeGoogleSigninModule,
  code: string | null
): string {
  if (code === google.statusCodes.IN_PROGRESS) return 'google/in-progress';
  if (code === google.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
    return 'google/play-services-unavailable';
  }
  if (code === google.statusCodes.SIGN_IN_REQUIRED) return 'google/sign-in-required';
  return 'google/failed';
}

/**
 * Signs in with Google natively and returns a fresh **Firebase** ID token.
 *
 * THE SEQUENCE, and each step is the library's own call rather than a
 * reimplementation:
 *
 *   1. `GoogleSignin.configure` pins the **Web** client ID the library must use.
 *   2. `GoogleSignin.signIn` opens the native consent UI.
 *   3. The response carries Google's `id_token`.
 *   4. `GoogleAuthProvider.credential` wraps it as a Firebase credential.
 *   5. `signInWithCredential` authenticates with Firebase.
 *   6. `getIdToken()` returns the token the caller exchanges.
 *
 * CANCELLATION IS CHECKED TWICE ON PURPOSE. On Android the person dismissing the
 * sheet arrives as a REJECTION carrying `SIGN_IN_CANCELLED`, while the typed
 * `cancelled` RESPONSE is what this version of the library documents; handling only
 * the second would turn every dismissal into a visible error, and handling only the
 * first would break on the version that answers instead of throwing. Both are
 * matched, and neither is treated as a fault.
 *
 * THROWS `NativeGoogleSignInError` FOR EVERY REAL FAILURE, never a raw library error,
 * so no native message can reach the layer above. It returns nothing but the token —
 * no uid, no email, no credential object — because the server derives the identity
 * from the token's verified payload and the app has no use for anything else.
 */
export async function nativeSignInWithGoogle(): Promise<NativeGoogleSignInResult> {
  // THE GOOGLE GATE IS CONSULTED FIRST, so every unconfigured state reports the code
  // that names the operation the caller actually attempted. `requireNativeFirebase`
  // would otherwise throw `native/unconfigured` first, which is true but less useful
  // — and unreachable in practice anyway, since `isNativeGoogleConfigured()` already
  // requires the Firebase gate, so reaching it here means the two disagreed.
  const google = requireNativeGoogleSignin();
  const { auth, instance } = requireNativeFirebase();

  google.GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    scopes: [...NATIVE_GOOGLE_SCOPES],
  });

  let response: Awaited<ReturnType<NativeGoogleSigninModule['GoogleSignin']['signIn']>>;
  try {
    response = await google.GoogleSignin.signIn();
  } catch (error) {
    const code = google.isErrorWithCode(error) ? String(error.code) : null;
    if (code === google.statusCodes.SIGN_IN_CANCELLED) return { kind: 'cancelled' };
    throw new NativeGoogleSignInError(mapGoogleSignInFailure(google, code));
  }

  if (google.isCancelledResponse(response)) return { kind: 'cancelled' };
  if (!google.isSuccessResponse(response)) {
    throw new NativeGoogleSignInError('google/unexpected-response');
  }

  const googleIdToken = response.data.idToken;
  if (!googleIdToken) throw new NativeGoogleSignInError('google/missing-id-token');

  const credential = auth.GoogleAuthProvider.credential(googleIdToken);
  const userCredential = await auth.signInWithCredential(instance, credential);
  return { kind: 'idToken', idToken: await userCredential.user.getIdToken() };
}
