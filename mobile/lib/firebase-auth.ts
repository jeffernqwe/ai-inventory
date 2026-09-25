/**
 * Phase 32E — Firebase email/password sign-in, behind the Firebase boundaries.
 *
 * This module owns the email/password operations and — more importantly — the
 * DECISION ABOUT WHAT A FIREBASE FAILURE MEANS. `lib/auth.tsx` is the only
 * importer, and no screen sees a Firebase error.
 *
 * PHASE B: THE EMAIL/PASSWORD OPERATIONS NOW RUN ON THE NATIVE SDK. Sign-in,
 * registration, sign-out and ID-token access go through `lib/firebase-native.ts`
 * (React Native Firebase), which is the only module that names the native packages,
 * so every shipped email/password path now authenticates natively with native
 * durable persistence (owner decision P2).
 *
 * PHASE C moved Google SIGN-IN to the same boundary. PHASE D moves the last two
 * operations — the disconnect CONFIRMATION's password and Google methods — so that
 * every authentication this app performs now runs natively, and this module no longer
 * imports the JavaScript SDK at all. That absence was the phase's deliverable, and
 * PHASE F1 COLLECTED IT: `firebase`, `lib/firebase.ts`, `expo-auth-session` and the
 * browser helper are now removed rather than merely unused. Nothing about the outcome
 * unions, the codes, the messages or the unlink policy moved with either change.
 *
 * WHAT DID NOT CHANGE, AND IS THE POINT OF THE PHASE: the exported names, the outcome
 * unions, the two fallback codes, the message table, the registration/adoption policy
 * and every sentence a user can read. The native SDK reports the SAME namespaced
 * codes the JS SDK does (`auth/invalid-credential`, `auth/user-not-found`, …) —
 * verified from the installed native error mapping rather than assumed — so the
 * classification below is unchanged and only its source moved.
 *
 * THIS MODULE IS NOT A SECURITY BOUNDARY, and nothing here should be read as one.
 * It decides which server endpoint to call next; it never decides who may sign in.
 * That is enforced by `loginWithPassword`'s `firebaseUid` guard and by
 * `exchangeFirebaseSession`, both of which read state the client cannot forge. A
 * client that took the "wrong" branch here would be refused by the server, not
 * admitted by it — which is why the ambiguity resolved below is a convenience
 * question rather than an authorization one.
 *
 * THREE OUTCOMES, and why the last two must not be conflated:
 *
 *   idToken         Firebase authenticated and produced an ID token to exchange.
 *   legacyFallback  The caller may try `POST /api/auth/login`. Two reasons reach
 *                   it, and they are different in kind:
 *                     'not-configured'     this BUILD has no Firebase
 *                                          configuration at all (Phase 32D
 *                                          decision 7 — all four
 *                                          EXPO_PUBLIC_FIREBASE_* absent). Firebase
 *                                          is off here and the app must behave as
 *                                          it did before Phase 32D, so the legacy
 *                                          path is not a fallback but the only
 *                                          path. This is the state of the
 *                                          repository today.
 *                     'invalid-credential' Firebase is ON and refused these
 *                                          credentials with a code that can only
 *                                          mean "no Firebase identity answers to
 *                                          them" — the expected answer for an
 *                                          account that predates Firebase.
 *   failure         Firebase is ON and failed for any other reason. THE CALLER
 *                   MUST NOT FALL BACK. A configured-but-broken Firebase
 *                   (`auth/invalid-api-key`, `auth/operation-not-allowed`), a
 *                   disabled account, a network fault and a rate limit are all
 *                   states an attacker can attempt to induce, and treating any of
 *                   them as "try the other door" would turn an outage into a
 *                   downgrade path. `not-configured` is deliberately NOT one of
 *                   these: it is a property of the build, not a condition an
 *                   attacker can create at runtime.
 *
 * WHY `auth/user-not-found` IS ALSO A FALLBACK CODE, although Phase 32E's brief
 * named only `auth/invalid-credential`. Both are the same signal under different
 * project settings: with email-enumeration protection ON (the default for a new
 * Firebase project) the SDK collapses "no such user" and "wrong password" into
 * `auth/invalid-credential`, and with it OFF it reports `auth/user-not-found`
 * separately. Handling only the first would lock out every legacy account on a
 * project with protection disabled — the exact failure Phase 32A §9.2 forbids —
 * and handling both costs nothing, because "there is no Firebase identity for this
 * address" is by definition the legacy case. The security question is not decided
 * here either way: if a Firebase-linked account is somehow reached through this
 * branch, the server's `firebaseUid` guard refuses it.
 */

// THERE IS DELIBERATELY NO `import … from 'firebase/auth'` HERE ANY MORE (Phase D).
// Every operation in this module authenticates through `lib/firebase-native.ts`, and
// the absence of that import is the phase's central fact rather than an omission.
//
// PHASE F1 REMOVED THE LAST ONE. The browser authorization-code + PKCE helper
// (`acquireGoogleIdToken`), its Google discovery constants, `googleRedirectUri()` and
// this module's `expo-auth-session` import are all gone, together with
// `lib/firebase.ts` and the `firebase` package. This module now imports no Firebase
// SDK and no browser SDK at all, and `lib/config.ts` is the only configuration module
// either boundary reaches.
import {
  isNativeFirebaseConfigured,
  isNativeGoogleConfigured,
  nativeCreateUserWithEmail,
  nativeCurrentIdToken,
  nativeSignInWithEmail,
  nativeSignInWithGoogle,
  nativeSignOut,
} from './firebase-native';

// ---------------------------------------------------------------------------
// Codes and copy
// ---------------------------------------------------------------------------

/**
 * The codes that mean "no Firebase identity answers to these credentials", and
 * therefore that the legacy path may be tried. See the module comment for why
 * this is a set of two rather than the one code the brief named.
 */
const LEGACY_FALLBACK_CODES: readonly string[] = [
  'auth/invalid-credential',
  'auth/user-not-found',
];

/** The account exists in Firebase, so it cannot be created again. */
const EMAIL_ALREADY_IN_USE = 'auth/email-already-in-use';

const MISCONFIGURED_MESSAGE = 'Sign-in is misconfigured. Contact your administrator.';
const DEFAULT_FAILURE_MESSAGE = 'Unable to sign in. Please try again.';
const EMAIL_TAKEN_MESSAGE = 'An account with this email already exists. Sign in instead.';

/**
 * Firebase error code -> the sentence a user is allowed to read.
 *
 * THE SDK'S OWN `message` IS NEVER USED, and that is the point of this table. A
 * Firebase message is written for a developer: it names the project, the auth
 * domain and — for the misconfiguration codes — the API key that was rejected.
 * Relaying it would put build configuration in front of a user and, on a shared
 * screen, in front of whoever is standing behind them. The same reasoning keeps
 * the API key out of `lib/config.ts` and behind `EXPO_PUBLIC_*` inlining; this is
 * that decision applied to errors. The test suite asserts that no SDK message
 * reaches an outcome.
 *
 * A code with no entry here is not an error to report as unknown — it is simply
 * one this table has no better wording for, so it takes the generic sentence.
 */
const FAILURE_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/weak-password': 'Choose a password with at least 6 characters.',
  // Deliberately the same sentence the server's ACCOUNT_DISABLED uses, so a user
  // cannot tell which side disabled them.
  'auth/user-disabled': 'This account is disabled. Contact an administrator.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed':
    'Cannot reach the sign-in service. Check your connection and try again.',
  'auth/operation-not-allowed':
    'Email sign-in is not enabled for this app. Contact your administrator.',
  'auth/invalid-api-key': MISCONFIGURED_MESSAGE,
  'auth/configuration-not-found': MISCONFIGURED_MESSAGE,
  // A token that expired between sign-in and the exchange, or a user record that
  // was deleted mid-flight. Neither is actionable by the user beyond retrying.
  'auth/user-token-expired': 'Your session expired. Please sign in again.',
};

/**
 * The code on a Firebase error, or `null`.
 *
 * Read structurally rather than with `instanceof FirebaseError`. The SDK cannot
 * be loaded under this project's Jest configuration at all (see
 * `__tests__/firebase.test.ts` for why), so it is mocked in the tests — and an
 * `instanceof` against a real class would make every case depend on the mock's
 * constructor identity, which is a fact about the test seam rather than about
 * this code.
 */
function errorCode(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code ? code : null;
}

/**
 * The sentence to show for a Firebase failure code. Never the SDK's own text.
 *
 * The table is shared by every flow, but the sentence for a code the table has no
 * entry for is the CALLER's, because "Unable to sign in." is the wrong thing to
 * read after tapping a Google button. Passing `fallback` keeps one classification
 * table while letting each entry point finish the sentence for its own method.
 */
function describeFirebaseFailure(
  code: string | null,
  fallback: string = DEFAULT_FAILURE_MESSAGE
): string {
  if (!code) return fallback;
  const known = FAILURE_MESSAGES[code];
  if (known) return known;
  // The API-key codes are spelled several ways across SDK versions and all carry
  // the rejected key in their message, so they are matched by shape instead.
  if (code.includes('api-key') || code.includes('api_key')) return MISCONFIGURED_MESSAGE;
  return fallback;
}

/**
 * A Firebase operation failed and the caller MUST NOT fall back to the legacy
 * path. Carries the SDK code for the log and a safe sentence for the user; it
 * never carries the SDK's message.
 *
 * It is deliberately NOT an `ApiError`: status is a claim about an HTTP response,
 * and nothing here produced one. `lib/client.ts` refuses to treat a request
 * without a token as session loss, and a `FirebaseAuthError` never went near the
 * network at all — so the screens' `err.message` path is the whole contract this
 * type needs.
 */
export class FirebaseAuthError extends Error {
  readonly code: string | null;

  constructor(code: string | null, message: string) {
    super(message);
    this.name = 'FirebaseAuthError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

/**
 * `signInWithEmail`'s result. A discriminated union rather than thrown errors
 * because two of these states are ORDINARY — an unconfigured build and a legacy
 * account are not failures, and modelling them as exceptions would push a
 * routine migration path into a `catch` block, where it is easy to widen by
 * accident into "any error falls back".
 */
export type FirebaseSignInOutcome =
  | { kind: 'idToken'; idToken: string }
  | { kind: 'legacyFallback'; reason: 'not-configured' | 'invalid-credential' }
  | { kind: 'failure'; code: string | null; message: string };

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Signs in with email and password. Never throws: every failure is an outcome,
 * so the caller's branches are exhaustive and reviewable at a glance.
 *
 * THE NATIVE CALL IS INSIDE THE TRY, and that is load-bearing twice over. A failure
 * to mint a token (an expired user record, a dropped connection) is then classified
 * by exactly the same rules as a failure to authenticate, so "we authenticated but
 * have nothing to exchange" cannot be mistaken for a legacy account. And a native
 * module that could not be loaded at all is covered too: it arrives here as an
 * ordinary `failure`, which does not fall back — the safe direction, because a build
 * whose Firebase gate is ON but whose native module is missing is broken, not
 * unconfigured.
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<FirebaseSignInOutcome> {
  // THE GATE CHECK IS OUTSIDE THE TRY (Phase B). "This build has no Firebase
  // configuration" is a property of the build, not a condition an attacker can create
  // at runtime, so it is the one state allowed to open the legacy door — and keeping
  // it out of the try is what stops it from ever being confused with a fault.
  if (!isNativeFirebaseConfigured()) {
    return { kind: 'legacyFallback', reason: 'not-configured' };
  }

  // Everything the native boundary can do is INSIDE the try, so a native module that
  // failed to load, a token that could not be minted and a refused credential are all
  // classified by exactly the same rules — and none of them can be mistaken for a
  // legacy account. This is the property Phase 32E introduced and Phase B preserves.
  try {
    const { idToken } = await nativeSignInWithEmail(email, password);
    return { kind: 'idToken', idToken };
  } catch (err) {
    const code = errorCode(err);
    if (code && LEGACY_FALLBACK_CODES.includes(code)) {
      return { kind: 'legacyFallback', reason: 'invalid-credential' };
    }
    return { kind: 'failure', code, message: describeFirebaseFailure(code) };
  }
}

/**
 * Ensures a Firebase identity exists for these credentials, and returns its ID
 * token. Throws {@link FirebaseAuthError} if it cannot.
 *
 * THE ADOPTION BRANCH IS THE ORPHAN RECOVERY PATH, and it is why this is not
 * simply a native create call. Registration is two systems, not one:
 * Firebase creates the account first, and the server creates the MongoDB user
 * second (Phase 32C). If the second half fails — a dropped connection at exactly
 * the wrong moment — a Firebase account exists with no tenant, which Phase 32A
 * §8.2 calls the designed orphan case and expects signup to adopt on retry.
 *
 * A plain create would not adopt it: the retry would hit
 * `auth/email-already-in-use` and dead-end, leaving the user with an account they
 * can sign into but never register. So the existing identity is signed into
 * instead — which REQUIRES THE SAME PASSWORD, and therefore proves the caller is
 * the person who created it. That is the whole safety argument for this branch: it
 * is not "the email exists, let them in", it is "here is the credential, so this
 * is your account". If the password does not match, the user is told to sign in
 * rather than being let through.
 *
 * The display name is set AFTER the identity exists and its failure is swallowed:
 * it is profile text the server does not read (the `name` the server stores comes
 * from the register request body), so a cosmetic write must not fail a signup that
 * has already succeeded at everything that matters. Phase B moved that write into
 * the native boundary, which is now the layer that has the user object; the ADOPTION
 * path no longer repeats it, because the attempt that created the identity already
 * applied it and the value is unread by both the server and the UI.
 *
 * The caller checks the build's configuration before reaching this — see
 * `lib/auth.tsx` — so the gate branch below is a programming fault, not a state
 * an unconfigured build can arrive in.
 */
export async function ensureFirebaseAccount({
  email,
  password,
  name,
}: {
  email: string;
  password: string;
  name?: string;
}): Promise<{ idToken: string }> {
  if (!isNativeFirebaseConfigured()) {
    throw new FirebaseAuthError(null, MISCONFIGURED_MESSAGE);
  }

  try {
    return await nativeCreateUserWithEmail(email, password, name);
  } catch (err) {
    const code = errorCode(err);
    if (code !== EMAIL_ALREADY_IN_USE) {
      throw new FirebaseAuthError(code, describeFirebaseFailure(code));
    }
    // The adoption branch, unchanged in policy: the identity already exists, so
    // signing into it with the SAME password is what proves the caller is the person
    // who created it. A token that could not be minted on the create path is NOT a
    // collision, so it is reported above rather than falling through to here.
    try {
      return await nativeSignInWithEmail(email, password);
    } catch {
      // The address is taken and this password does not open it, so it belongs to
      // someone else. Reported as the taken address it is — the sign-in screen is
      // where the owner of that account belongs, and it is linked from here.
      throw new FirebaseAuthError(EMAIL_ALREADY_IN_USE, EMAIL_TAKEN_MESSAGE);
    }
  }
}

/**
 * Ends the Firebase session, if there is one. Never throws.
 *
 * Called from the single central sign-out in `lib/auth.tsx`, so all ~20 sign-out
 * call sites in the app reach it without any of them knowing Firebase exists — and,
 * since Phase B, also from that file's session-loss handler (owner decision: a
 * token-bearing 401/403 ends the durable native session too, so a server-side
 * eviction cannot leave a live Firebase identity behind).
 *
 * UNDER P2 THIS IS NO LONGER HYGIENE. The native session is DURABLE (owner decision
 * P2, superseding the Phase 32D `inMemoryPersistence` decision this function was
 * written under), so skipping this call would leave a persisted Firebase credential
 * on the device after Inventory AI had ended the session. It stays TOTAL regardless —
 * sign-out must complete on a device with no network, and the local Inventory AI
 * session is cleared by the caller whatever this returns.
 *
 * IT RETURNS WHETHER THE ATTEMPT SUCCEEDED, where it previously returned nothing.
 * That is the observability the owner's Phase B decision requires: a best-effort
 * operation that swallowed its failure would leave a durable credential in place with
 * no way to tell, and a boolean is the smallest thing that reports it — no token, no
 * key and no error text is logged to achieve it. The return type is widened, never
 * narrowed, so every existing call site (which ignores the value) is unaffected.
 */
export async function signOutOfFirebase(): Promise<boolean> {
  return nativeSignOut();
}

/**
 * A fresh Firebase ID token for the identity that is ALREADY signed in, or `null`
 * when there is no such identity. Phase 32J.
 *
 * THIS IS THE CREDENTIAL FOR FIREBASE REGISTRATION, and it is deliberately read
 * from the Firebase Auth layer rather than carried anywhere. The onboarding flow
 * begins when `POST /api/auth/firebase/exchange` answers `REGISTRATION_REQUIRED`,
 * i.e. AFTER `signInWithCredential` / `signInWithEmailAndPassword` has already
 * authenticated someone — so the identity the user must register is the one the
 * SDK is currently holding, and `currentUser` is the only source of it. Nothing
 * about it travels through navigation, storage or a screen: a route parameter
 * carrying a token would put a credential in a URL, and a `firebaseUid` supplied
 * by the UI is not identity authority anyway (the server reads the uid from the
 * verified token's payload and ignores anything else).
 *
 * `getIdToken()` with no argument returns the cached token and transparently
 * refreshes it when it is near expiry, so a long sign-in is not punished.
 *
 * UNDER P2 THE SESSION IS DURABLE, so — unlike when this function was written under
 * the Phase 32D `inMemoryPersistence` decision — a COLD START CAN answer a token.
 * That is exactly why nothing may infer an authenticated Inventory AI session from
 * it: `lib/auth.tsx` restores from SecureStore alone and never exchanges because a
 * native user exists, and the onboarding screen still refuses to resume without the
 * in-memory registration flag it was armed with.
 *
 * TOTAL BY DESIGN, and it collapses two causes into one answer on purpose. "No
 * current user" and "the refresh request failed" are different facts, but they
 * have exactly one consequence here — this device cannot produce a registration
 * credential right now — and the caller already has to handle that consequence
 * as a single safe outcome. Returning `null` for both keeps the caller to one
 * branch and keeps a raw SDK error from reaching a screen. It never fabricates,
 * reconstructs or guesses a token; it returns `null` or a real one.
 */
export async function currentFirebaseIdToken(): Promise<string | null> {
  return nativeCurrentIdToken();
}

// ---------------------------------------------------------------------------
// Google Sign-In (Phase 32I) — native consent since Phase C
// ---------------------------------------------------------------------------
//
// THIS IS THE SAME SHAPE AS THE EMAIL/PASSWORD OPERATIONS ABOVE: it ends by
// returning a Firebase ID token, and the caller exchanges it at the one existing
// boundary (`POST /api/auth/firebase/exchange`). No Google-specific server route
// exists or is needed, because the exchange is UID-authoritative and never asks
// which provider minted the identity.
//
// THE CONSENT SHEET IS NATIVE, AND THE BROWSER ROUND-TRIP IS GONE (Phase C, Phase F1).
// `lib/firebase-native.ts` opens Google's own sheet and wraps the returned `id_token`
// with `GoogleAuthProvider.credential()` + `signInWithCredential()`, which is what
// mints the *Firebase* ID token this module returns. The authorization-code + PKCE
// round-trip through the system browser — and the `redirectUri` it needed — was
// retired in Phase F1, so there is no redirect URI to register and no
// `expo-auth-session` import left in this module.
//
// THE GOOGLE ID TOKEN IS A CREDENTIAL FOR FIREBASE, NOT FOR INVENTORY AI. It is
// wrapped into a Firebase credential and is never returned, logged, or stored here.

const GOOGLE_NOT_CONFIGURED_MESSAGE =
  'Google sign-in is not configured for this build. Contact your administrator.';
const GOOGLE_FAILED_MESSAGE = 'Unable to sign in with Google. Please try again.';

/**
 * The codes the PASSWORD confirmation method reads as its own failure.
 *
 * All three mean "these credentials did not open a password identity here":
 * `auth/invalid-credential` is the collapsed form the SDK reports when email
 * enumeration protection is ON, and `auth/wrong-password` is the separate form it
 * reports when that protection is OFF. Both answer the same sentence, because the
 * module cannot tell a typo from a different method and does not pretend to.
 *
 * `auth/user-not-found` is deliberately NOT in this list — it is unambiguous, and
 * `confirmFirebaseSignIn` maps it to `wrong-method` instead.
 */
const PASSWORD_METHOD_CODES: readonly string[] = [
  'auth/invalid-credential',
  'auth/wrong-password',
];

/**
 * `signInWithGoogle`'s result.
 *
 * A discriminated union for the same reason `FirebaseSignInOutcome` is one:
 * cancellation is ORDINARY, not a failure, and modelling it as a thrown error
 * would push a routine user action into a `catch` block. There is deliberately no
 * `legacyFallback` member: Google has no legacy path to fall back to, and adding
 * one would be a way in that the email flow's rules do not describe.
 */
export type GoogleSignInOutcome =
  | { kind: 'idToken'; idToken: string }
  | { kind: 'cancelled' }
  | { kind: 'failure'; code: string | null; message: string };

/**
 * Signs in with Google. Never throws: every outcome is a value.
 *
 * PHASE C MOVED THIS OPERATION TO THE NATIVE SDK, and the outcome contract did not
 * move with it. `NativeGoogleSignInResult` is `idToken | cancelled`, which maps one
 * to one onto this function's `idToken | cancelled`; a real failure is a throw and
 * is classified exactly as before. Callers — `lib/auth.tsx`'s `googleSignIn` and the
 * login screen behind it — are unchanged, because they already branch on this union
 * and nothing else.
 *
 * WHAT `lib/firebase-native.ts` DOES, IN ORDER: configure the library with the Web
 * client ID, open the native consent sheet, read Google's `id_token`, wrap it with
 * `GoogleAuthProvider.credential`, authenticate with `signInWithCredential`, and
 * return a fresh **Firebase** ID token. Steps 4-6 used to live here; they moved so
 * that this module keeps ONLY the decision about what a failure means — the same
 * split the email/password operations got in Phase B.
 *
 * THE GATE IS CHECKED OUTSIDE THE TRY, as in `signInWithEmail`: "this build has no
 * Web client ID" is a property of the build, not a condition a runtime fault can
 * produce, so it must not be confusable with one. It is also deliberately the
 * NATIVE predicate rather than `isGoogleConfigured()` — see its comment in the
 * boundary for why the two questions differ.
 *
 * A missing configuration is a `failure`, never a silent downgrade — there is no
 * other door to downgrade to. Every thrown error is classified by the same table
 * the email flow uses, so a native or Firebase fault surfaces as safe copy and its
 * code is kept for the operator but never shown.
 *
 * THE BROWSER FLOW IS NO LONGER HERE (Phase F1). Until then this module also carried
 * `acquireGoogleIdToken`, the authorization-code + PKCE helper Phase D left
 * unreferenced; it, its Google discovery constants and `googleRedirectUri()` were
 * removed together with `lib/firebase.ts` and the `firebase` package. Every Google
 * operation — sign-in and the disconnect confirmation alike — has run through the
 * native library since Phases C and D, so no caller was lost.
 */
export async function signInWithGoogle(): Promise<GoogleSignInOutcome> {
  if (!isNativeGoogleConfigured()) {
    return {
      kind: 'failure',
      code: 'google/not-configured',
      message: GOOGLE_NOT_CONFIGURED_MESSAGE,
    };
  }

  try {
    const outcome = await nativeSignInWithGoogle();
    if (outcome.kind === 'cancelled') return { kind: 'cancelled' };
    return { kind: 'idToken', idToken: outcome.idToken };
  } catch (err) {
    const code = errorCode(err);
    return { kind: 'failure', code, message: describeFirebaseFailure(code, GOOGLE_FAILED_MESSAGE) };
  }
}

/**
 * ────────────────────────────────────────────────────────────────────────────
 * PHASE F1 — REMOVED.
 *
 * `acquireGoogleIdToken` (the authorization-code + PKCE helper), its Google discovery
 * constants, `googleRedirectUri()` and this module's `expo-auth-session` import were
 * deleted here, together with `lib/firebase.ts` and the `firebase` package. Since
 * Phase C no Google operation had used them: sign-in and the disconnect confirmation
 * both run through `lib/firebase-native.ts`. They were kept through Phases D/E only so
 * that this removal could be one reviewable change, and owner decision G-2 accepts that
 * git history is now the rollback mechanism.
 *
 * The PKCE fail-closed finding they encoded (Phase 32I-N, I-1) is recorded in the
 * Phase D report. There is no browser flow left for it to apply to, and no redirect
 * URI to register with Google for this build.
 * ────────────────────────────────────────────────────────────────────────────
 */

// ---------------------------------------------------------------------------
// Confirm sign-in (Phase 32L-B)
// ---------------------------------------------------------------------------
//
// THE DISCONNECT FLOW'S "CONFIRM YOUR SIGN-IN" STEP, and NOT a second sign-in
// path. Firebase owns the authentication authority for a Firebase-linked
// account (Phase 32K), and the server additionally requires a RECENT
// authentication — the signed `auth_time` claim, within 300 s — before it will
// detach the identity (Phase 32L-A). Confirming the sign-in is how a client
// produces that freshness.
//
// WHY THIS IS NOT `signInWithEmail` / `signInWithGoogle` REUSED. Three
// differences, each of which would be a bug if flattened away:
//
//   1. NO LEGACY FALLBACK. `signInWithEmail` may answer `legacyFallback`, which
//      licenses the caller to try `POST /api/auth/login`. A confirmation has no
//      such door: "no Firebase identity answers to these credentials" here means
//      THIS IS NOT THE ACCOUNT'S METHOD, and the remedy is the OTHER confirmation
//      option — never a downgrade to the password route. Returning an outcome
//      whose variants do not include a fallback is how that is enforced by the
//      type rather than by a comment.
//   2. NO `currentUser` REQUIREMENT. The Inventory AI session is restored from
//      `expo-secure-store` on boot, and the JavaScript SDK instance this path uses
//      is pinned to `inMemoryPersistence` (Phase 32D), so after a COLD START this
//      app is `signedIn` with that instance's `auth.currentUser === null`.
//      `reauthenticateWithCredential` cannot run in that state — it needs a
//      `User` — which is why the password method uses
//      `signInWithEmailAndPassword` instead. That call needs no prior Firebase
//      session and produces the same fresh `auth_time`; it is the one path that
//      works in BOTH states, so it is the only one used. (Phase B migrates the
//      SIGN-IN operations to the native SDK and deliberately leaves this
//      confirmation path alone; re-deriving it under durable persistence is a
//      Phase D/E obligation, recorded in the P2 decision §6.3.)
//   3. A NARROWER ANSWER. Callers need a token, so that is all this returns — no
//      `User`, no uid, no `providerData`, no credential object. Nothing about the
//      identity leaves this module except the one thing the server consumes.
//
// NO PROVIDER DISCOVERY, AND NO EMAIL AS A JOIN KEY. The email below is the
// ACCOUNT'S OWN address, supplied by the session layer from the authenticated
// user's public record. It is never compared to anything, never used to find an
// account, and never resolved against Firebase to learn which providers exist
// (Firebase's only such API, `fetchSignInMethodsForEmail`, is deprecated in the
// installed SDK and discouraged for security reasons). The identity question is
// decided ONLY by the server, which compares the verified token's uid to the
// account's stored `firebaseUid` and refuses a mismatch with 409.

/** Which way the person confirmed. Chosen by them; never discovered. */
export type FirebaseConfirmMethod = 'google' | 'password';

/**
 * What {@link confirmFirebaseSignIn} answers.
 *
 * `cancelled` and `wrong-method` are ORDINARY STATES, not failures — a person who
 * closes the Google sheet changed their mind, and a person who chose the wrong
 * option needs to be pointed at the other one rather than told something broke.
 * Neither carries a message because both are product copy, which the screen owns.
 * Only `failure` carries one, and it is always this module's own safe sentence —
 * never the SDK's.
 */
export type ConfirmSignInOutcome =
  | { kind: 'idToken'; idToken: string }
  | { kind: 'cancelled' }
  | { kind: 'wrong-method' }
  | { kind: 'failure'; code: string | null; message: string };

/**
 * The password method's copy. It names BOTH remedies on purpose.
 *
 * With Firebase's email-enumeration protection ON (the default for a new
 * project) the SDK collapses "no such user" and "wrong password" into
 * `auth/invalid-credential`, so this module genuinely cannot tell which happened.
 * Asserting either one would be a guess, and guessing wrongly sends the person
 * down the wrong path. Naming both options is the honest sentence, and it also
 * points at the other confirmation option without claiming that is the problem.
 */
const CONFIRM_PASSWORD_MESSAGE =
  'That did not confirm this account. Check your sign-in password, or choose Confirm with Google.';

/** The generic confirmation sentence, for a fault this module has no better wording for. */
const CONFIRM_FAILED_MESSAGE = 'We could not confirm your sign-in. Please try again.';

/**
 * The code that means "this address has no Firebase password identity".
 *
 * It is reported as `wrong-method` rather than as a failure because it is
 * UNAMBIGUOUS: Firebase says there is no password credential here, so the
 * remedy is the other option. `auth/invalid-credential` deliberately does NOT
 * map here — under enumeration protection it also means "wrong password", and
 * treating it as "wrong method" would tell a person with a typo to switch
 * methods.
 */
const NO_PASSWORD_IDENTITY = 'auth/user-not-found';

/**
 * Confirms the sign-in of the identity that owns this account, and returns a
 * fresh Firebase ID token.
 *
 * PHASE D: BOTH METHODS NOW RUN ON THE NATIVE SDK, through the two boundary functions
 * the sign-in paths already use — `nativeSignInWithEmail` for the password method and
 * `nativeSignInWithGoogle` for the Google method. No THIRD abstraction was introduced
 * to do it, and none is needed: a confirmation is a real authentication, which is
 * exactly what those two perform. Before this phase the Google method ran the Phase 32I
 * authorization-code + PKCE flow in the system browser and the password method ran the
 * JavaScript SDK directly; both were the last JS-SDK authentication in the app.
 *
 * THE FOUR OUTCOMES ARE UNCHANGED. `wrong-method` is still reachable in principle and
 * still password-only; the Google method still answers `idToken` or `cancelled` and
 * classifies every fault through the same table. What changed is only WHERE the
 * credential is authenticated.
 *
 * NEVER THROWS, and never reaches the network for anything but Firebase. `email`
 * is the account's own address and is REQUIRED only for the password method,
 * because `signInWithEmailAndPassword` takes one and there is no other source for
 * it in the cold-start state this function exists to survive.
 *
 * The returned token is the ONLY artifact. Its `auth_time` is now, which is the
 * whole point: `getIdToken(true)` re-mints a token and moves `iat`, but leaves
 * `auth_time` alone, so a forced refresh is NOT a confirmation and must never be
 * substituted for one.
 */
export async function confirmFirebaseSignIn({
  method,
  email,
  password,
}: {
  method: FirebaseConfirmMethod;
  email?: string;
  password?: string;
}): Promise<ConfirmSignInOutcome> {
  if (method === 'google') {
    // PHASE D — NATIVE, AND THE GATE MOVED WITH IT. `isGoogleConfigured()` asked "is
    // there a client ID for THIS PLATFORM", which was the right question while the
    // system browser performed the consent; the native library needs a **Web** OAuth
    // client on every platform, so the predicate is now `isNativeGoogleConfigured()` —
    // the same one `signInWithGoogle` uses. It is checked OUTSIDE the try for the reason
    // all three operations check their gate there: an unconfigured build is a property
    // of the build, not a condition a runtime fault can produce, so it must not be
    // confusable with one. The code and the sentence are unchanged.
    if (!isNativeGoogleConfigured()) {
      return { kind: 'failure', code: 'google/not-configured', message: GOOGLE_NOT_CONFIGURED_MESSAGE };
    }

    try {
      // NO CONTRACT MOVED. `NativeGoogleSignInResult` is `idToken | cancelled`, which
      // maps one to one onto this function's own two ordinary outcomes, and a real
      // failure is a THROW that the table below classifies exactly as it classified the
      // browser flow's failures — so `ConfirmSignInOutcome` is unchanged and the screen
      // keeps the single branch it already had. A silent consent (GMS reuses the account
      // it has already been granted) still counts as a confirmation by owner decision 3:
      // the credential was really authenticated and the token's `auth_time` is really
      // fresh, which is what the server's rule reads.
      const outcome = await nativeSignInWithGoogle();
      if (outcome.kind === 'cancelled') return { kind: 'cancelled' };
      return { kind: 'idToken', idToken: outcome.idToken };
    } catch (err) {
      const code = errorCode(err);
      return { kind: 'failure', code, message: describeFirebaseFailure(code, CONFIRM_FAILED_MESSAGE) };
    }
  }

  // The password method. The email is the account's own; a missing one is a
  // programming fault in the caller rather than anything a person can cause, so
  // it is answered with the generic sentence instead of a new error class.
  if (!email) {
    return { kind: 'failure', code: 'firebase/confirm-missing-email', message: CONFIRM_FAILED_MESSAGE };
  }

  // THE GATE, ANSWERED WITH THE SAME CODE AND THE SAME SENTENCE THE JS SDK PATH USED.
  // `getFirebaseAuth()` returning `null` and the native boundary refusing to load mean
  // the same thing, so the contract is preserved rather than re-invented.
  if (!isNativeFirebaseConfigured()) {
    return { kind: 'failure', code: 'firebase/not-configured', message: MISCONFIGURED_MESSAGE };
  }

  try {
    // PHASE D — NATIVE, AND THE METHOD DID NOT CHANGE WITH IT. `signInWithEmailAndPassword`
    // is still what confirms — never `reauthenticateWithCredential` — for the reason the
    // block comment above gives: the reauthenticate verb cannot run after a cold start,
    // and surviving one is exactly what this function exists for. `nativeSignInWithEmail`
    // performs that same sign-in and then mints the token, so the `auth_time` on the
    // token is THIS authentication's, which is the property the server's 300-second rule
    // reads. A forced refresh is still not a confirmation and is still not used.
    //
    // THE EMAIL IS THE ACCOUNT'S OWN — supplied by the screen from `user.email`, shown
    // read-only and never typed (see `app/(app)/disconnect-firebase.tsx`). That is the
    // invariant that keeps a confirmation from authenticating a DIFFERENT identity into
    // the durable native store, and the native path inherits it rather than restating it.
    const { idToken } = await nativeSignInWithEmail(email, password ?? '');
    return { kind: 'idToken', idToken };
  } catch (err) {
    const code = errorCode(err);
    if (code === NO_PASSWORD_IDENTITY) return { kind: 'wrong-method' };
    if (code && PASSWORD_METHOD_CODES.includes(code)) {
      return { kind: 'failure', code, message: CONFIRM_PASSWORD_MESSAGE };
    }
    return { kind: 'failure', code, message: describeFirebaseFailure(code, CONFIRM_FAILED_MESSAGE) };
  }
}

export default {
  signInWithEmail,
  signInWithGoogle,
  ensureFirebaseAccount,
  signOutOfFirebase,
  currentFirebaseIdToken,
  confirmFirebaseSignIn,
  FirebaseAuthError,
};
