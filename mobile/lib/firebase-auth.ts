/**
 * Phase 32E — Firebase email/password sign-in, behind the Phase 32D boundary.
 *
 * This module is the second half of the Firebase boundary `lib/firebase.ts`
 * opened: that file owns the app instance and the persistence decision, and this
 * one owns the email/password operations and — more importantly — the DECISION
 * ABOUT WHAT A FIREBASE FAILURE MEANS. `lib/auth.tsx` is the only importer, and
 * no screen sees a Firebase error.
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

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';

import { getFirebaseAuth } from './firebase';

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

/** The sentence to show for a Firebase failure code. Never the SDK's own text. */
function describeFirebaseFailure(code: string | null): string {
  if (!code) return DEFAULT_FAILURE_MESSAGE;
  const known = FAILURE_MESSAGES[code];
  if (known) return known;
  // The API-key codes are spelled several ways across SDK versions and all carry
  // the rejected key in their message, so they are matched by shape instead.
  if (code.includes('api-key') || code.includes('api_key')) return MISCONFIGURED_MESSAGE;
  return DEFAULT_FAILURE_MESSAGE;
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
 * THE BOUNDARY CALL IS INSIDE THE TRY, and that is load-bearing twice over. A
 * failure to mint a token (an expired user record, a dropped connection) is then
 * classified by exactly the same rules as a failure to authenticate, so "we
 * authenticated but have nothing to exchange" cannot be mistaken for a legacy
 * account. And `getFirebaseAuth()` — which initializes the SDK on first use — is
 * covered too: its one throw, `auth/already-initialized`, is a development-time
 * artifact of Fast Refresh (see the note in `lib/firebase.ts`) and arrives here
 * as an ordinary `failure`, which does not fall back.
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<FirebaseSignInOutcome> {
  try {
    const auth = getFirebaseAuth();
    if (!auth) return { kind: 'legacyFallback', reason: 'not-configured' };

    const credential = await signInWithEmailAndPassword(auth, email, password);
    const idToken = await credential.user.getIdToken();
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
 * simply `createUserWithEmailAndPassword`. Registration is two systems, not one:
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
 * has already succeeded at everything that matters.
 *
 * The caller checks the build's configuration before reaching this — see
 * `lib/auth.tsx` — so the `null` branch below is a programming fault, not a state
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
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new FirebaseAuthError(null, MISCONFIGURED_MESSAGE);
  }

  let user;
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    user = credential.user;
  } catch (err) {
    const code = errorCode(err);
    if (code !== EMAIL_ALREADY_IN_USE) {
      throw new FirebaseAuthError(code, describeFirebaseFailure(code));
    }
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      user = credential.user;
    } catch {
      // The address is taken and this password does not open it, so it belongs to
      // someone else. Reported as the taken address it is — the sign-in screen is
      // where the owner of that account belongs, and it is linked from here.
      throw new FirebaseAuthError(EMAIL_ALREADY_IN_USE, EMAIL_TAKEN_MESSAGE);
    }
  }

  const trimmed = (name ?? '').trim();
  if (trimmed) {
    try {
      await updateProfile(user, { displayName: trimmed });
    } catch {
      // Cosmetic only — see the note above.
    }
  }

  try {
    return { idToken: await user.getIdToken() };
  } catch (err) {
    const code = errorCode(err);
    throw new FirebaseAuthError(code, describeFirebaseFailure(code));
  }
}

/**
 * Ends the Firebase session, if there is one. Never throws.
 *
 * Called from the single central sign-out in `lib/auth.tsx`, so all ~20 sign-out
 * call sites in the app reach it without any of them knowing Firebase exists.
 * Making it total is deliberate: sign-out must complete on a device with no
 * network, and this is not a network operation anyway — with `inMemoryPersistence`
 * it clears the in-process copy, so there is no durable Firebase credential to
 * revoke. That is the Phase 32D decision this function inherits rather than makes.
 */
export async function signOutOfFirebase(): Promise<void> {
  try {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await firebaseSignOut(auth);
  } catch {
    // Best effort: the local Inventory AI session is cleared regardless.
  }
}

export default {
  signInWithEmail,
  ensureFirebaseAccount,
  signOutOfFirebase,
  FirebaseAuthError,
};
