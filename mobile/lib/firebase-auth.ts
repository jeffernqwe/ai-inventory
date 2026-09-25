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
 * imports the JavaScript SDK at all. That absence is the phase's deliverable: it is
 * what makes Phase F able to remove `firebase`, `expo-auth-session` and the browser
 * helper below. Nothing about the outcome unions, the codes, the messages or the
 * unlink policy moved with it.
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
// the absence of that import is the phase's central fact rather than an omission. The
// package itself, `lib/firebase.ts` and the browser helper below all REMAIN for Phase
// F, which is the phase that removes them; `lib/firebase.ts` is still imported by
// `lib/firebase-native.ts` for the configuration GATE, so it is not orphaned by this.
import {
  AuthRequest,
  ResponseType,
  exchangeCodeAsync,
  makeRedirectUri,
} from 'expo-auth-session';

import { googleClientId } from './config';
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
// Google Sign-In (Phase 32I) — Authorization Code + PKCE
// ---------------------------------------------------------------------------
//
// THIS IS THE SAME SHAPE AS THE EMAIL/PASSWORD OPERATIONS ABOVE: it ends by
// returning a Firebase ID token, and the caller exchanges it at the one existing
// boundary (`POST /api/auth/firebase/exchange`). No Google-specific server route
// exists or is needed, because the exchange is UID-authoritative and never asks
// which provider minted the identity.
//
// AUTHORIZATION CODE + PKCE, NOT THE IMPLICIT FLOW (owner decision, Phase 32I).
// The authorization code is exchanged at Google's token endpoint for a token
// response that carries the Google `id_token`; the code itself is never a
// Firebase ID token, and nothing here treats it as one. PKCE is what makes the
// exchange safe for a public client, and `AuthRequest` defaults to it — the
// `usePKCE: true` below is written out rather than relied on so the decision is
// visible.
//
// THE GOOGLE ID TOKEN IS A CREDENTIAL FOR FIREBASE, NOT FOR INVENTORY AI. It is
// handed to `GoogleAuthProvider.credential()` and then to `signInWithCredential()`,
// which is what mints the *Firebase* ID token this module returns. The Google
// token itself is never returned, logged, or stored.
//
// BOTH HALVES OF THE OAuth EXCHANGE USE THE SAME `clientId` AND `redirectUri`,
// because Google rejects a token request whose redirect does not match the
// authorization request's. They are computed once per call and passed to both.

/**
 * Google's OIDC endpoints. These are Google's published, stable endpoints — the
 * same pair `expo-auth-session/providers/google` hardcodes — and are not project
 * configuration.
 */
const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
} as const;

const GOOGLE_SCOPES = ['openid', 'email', 'profile'];

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
 * The redirect URI this build will use for the Google OAuth round-trip.
 *
 * Exported so it can be asserted and reported: the value must be registered on the
 * Google OAuth client, and a value nobody can read is a value nobody can register.
 *
 * Phase 32I-N moved this to the NATIVE form so the value can satisfy Google's
 * custom-scheme rules. Google documents the shape as `com.example.app:redirect_uri_path`
 * — reverse-DNS scheme, then a SINGLE slash, then the path — and requires the scheme
 * to contain a period. The previous value, `inventoryai://oauthredirect`, satisfied
 * none of that (no period, a double slash) and was registrable on no client type.
 *
 * `com.inventoryai.app` is the app's own Android package / iOS bundle identifier
 * (app.json), added to `expo.scheme` as a SECOND scheme. `inventoryai` is retained
 * because the password-reset deep link `inventoryai://reset-password` uses it;
 * adding a scheme is additive, so the two coexist.
 *
 * WHY `native` IS ACTUALLY HONOURED HERE — including in a development build:
 * expo-auth-session returns the `native` value verbatim only when
 * `Constants.executionEnvironment` is `Standalone` or `Bare`. The published
 * expo-constants native service hardcodes `"bare"` (Android ConstantsService.kt,
 * iOS EXConstantsService.m), so every CNG/EAS build — development, preview and
 * standalone alike — takes the `native` branch. Only Expo Go reports `storeClient`
 * and therefore ignores `native`, resolving to an `exp://…` URL; that is one more
 * reason Expo Go is not an acceptance environment for this flow.
 */
export function googleRedirectUri(): string {
  return makeRedirectUri({ native: 'com.inventoryai.app:/oauthredirect' });
}

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
 * THE BROWSER FLOW IS STILL HERE, ONE FUNCTION BELOW. `acquireGoogleIdToken` and
 * the Phase 32I discovery constants now serve ONLY `confirmFirebaseSignIn`'s `google`
 * method — the disconnect confirmation — which is Phase D/E work. Nothing was
 * deleted, so the two implementations coexist for one phase by owner decision.
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
 * PHASE F REMOVAL — KEPT DELIBERATELY, AND UNREFERENCED SINCE PHASE D.
 *
 * Phase D moved the Google CONFIRMATION to the native library, so nothing calls this
 * helper any more. It is retained ON PURPOSE, by owner decision: removing the
 * JavaScript SDK and `expo-auth-session` is Phase F's work, and deleting the whole
 * browser mechanism there — in one reviewable change — keeps Phase D a one-commit
 * rollback. The paragraphs below describe what it DID; the caller they name (the
 * confirmation's Google method) no longer exists, and the browser redirect it depends
 * on is why `app/+native-intent.ts` is still needed until Phase F.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Steps 1-3 of the Google flow: consent in the system browser, then the code +
 * PKCE verifier swapped at Google's token endpoint for Google's own `id_token`.
 *
 * RETURNS GOOGLE'S TOKEN, NOT FIREBASE'S. Authenticating with Firebase was the
 * caller's step (`signInWithCredential`), which is what let this helper serve
 * both the sign-in path and the Phase 32L-B confirmation path without either one
 * owning the other's semantics.
 *
 * NEVER THROWS. Every rejection — a thrown `AuthRequest`, a Google `error`
 * result, a missing code, a missing PKCE verifier, a token-endpoint failure — is
 * an outcome, so a caller has one shape to branch on. The PKCE check still fails
 * CLOSED exactly as it did before: no verifier means no token-endpoint call.
 *
 * The suppression below is DELIBERATE AND LOCAL, and it is part of the Phase F marker
 * rather than a workaround: Phase D gave this helper no caller, owner decision 1 keeps it
 * anyway, and a later change that gives it a caller again removes the warning with it.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- PHASE F REMOVAL (Phase D: intentionally unreferenced)
async function acquireGoogleIdToken(): Promise<GoogleIdTokenOutcome> {
  try {
    const clientId = googleClientId();
    const redirectUri = googleRedirectUri();

    const request = new AuthRequest({
      clientId,
      scopes: GOOGLE_SCOPES,
      redirectUri,
      responseType: ResponseType.Code,
      usePKCE: true,
    });

    const result = await request.promptAsync(GOOGLE_DISCOVERY);

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { kind: 'cancelled' };
    }
    if (result.type === 'error') {
      return {
        kind: 'failure',
        code: result.errorCode ?? 'google/oauth-error',
        message: GOOGLE_FAILED_MESSAGE,
      };
    }
    if (result.type !== 'success') {
      return { kind: 'failure', code: `google/${result.type}`, message: GOOGLE_FAILED_MESSAGE };
    }

    const code = result.params.code;
    if (!code) {
      return { kind: 'failure', code: 'google/missing-code', message: GOOGLE_FAILED_MESSAGE };
    }

    // PKCE FAILS CLOSED (Phase 32I-N, finding I-1). `usePKCE: true` above is what
    // makes the library mint the verifier, so in a correctly built request it is
    // present; if it is not, the exchange must NOT be attempted. The previous
    // `request.codeVerifier ?? ''` sent an EMPTY `code_verifier` — a request that
    // Google either rejects outright or, worse, one that could be honoured without
    // the proof PKCE exists to provide. No verifier therefore means no token-endpoint
    // call at all, reported through this module's ordinary failure outcome rather
    // than a new error architecture. The code names the missing input, never a value.
    const codeVerifier = request.codeVerifier;
    if (!codeVerifier) {
      return {
        kind: 'failure',
        code: 'google/missing-code-verifier',
        message: GOOGLE_FAILED_MESSAGE,
      };
    }

    const tokenResponse = await exchangeCodeAsync(
      {
        clientId,
        code,
        redirectUri,
        extraParams: { code_verifier: codeVerifier },
      },
      { tokenEndpoint: GOOGLE_DISCOVERY.tokenEndpoint }
    );

    const googleIdToken = tokenResponse.idToken;
    if (!googleIdToken) {
      return { kind: 'failure', code: 'google/missing-id-token', message: GOOGLE_FAILED_MESSAGE };
    }

    return { kind: 'idToken', idToken: googleIdToken };
  } catch (err) {
    const code = errorCode(err);
    return { kind: 'failure', code, message: describeFirebaseFailure(code, GOOGLE_FAILED_MESSAGE) };
  }
}

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

/** Google's own token, or why it could not be obtained. Internal to this module. */
type GoogleIdTokenOutcome =
  | { kind: 'idToken'; idToken: string }
  | { kind: 'cancelled' }
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
