/**
 * Google Sign-In — `lib/firebase-auth.ts`.
 *
 * SIGN-IN AND THE DISCONNECT CONFIRMATION BOTH RUN NATIVELY (Phases C and D).
 *
 * `signInWithGoogle` and `confirmFirebaseSignIn`'s `google` method both run through
 * `lib/firebase-native.ts` on `@react-native-google-signin/google-signin`. The cases
 * below prove the module is a thin classification layer over that boundary, and they
 * still pin the claims the browser era made where those claims survive: the Firebase
 * token is the only thing that leaves, a native failure is classified rather than
 * relayed, and an unconfigured build never reaches the boundary at all.
 *
 * PHASE F1 DELETED THE BROWSER FLOW AND THE ASSERTIONS THAT DESCRIBED IT. Until F1 this
 * file also mocked `expo-auth-session` and asserted, negatively, that neither operation
 * touched a browser seam — a claim that kept the retained `acquireGoogleIdToken` helper
 * provably unreachable. The helper, its constants, `googleRedirectUri()` and this
 * module's `expo-auth-session` import are gone, so those assertions had nothing left to
 * describe. The claim they protected is now made once, structurally, in
 * `phaseF1-retired-dependency-guard.test.ts`, which proves no module under `lib/` or
 * `app/` imports the retired packages at all.
 *
 * WHAT IS NOT MOCKED: `lib/firebase-auth.ts` itself. Every branch, message and code
 * claim below is the shipped one.
 */

import { confirmFirebaseSignIn, signInWithGoogle } from '../lib/firebase-auth';

// ---------------------------------------------------------------------------
// The mock seam — Phase C: the native boundary
// ---------------------------------------------------------------------------

const mockNativeSignInWithGoogle = jest.fn();
const mockIsNativeGoogleConfigured = jest.fn(() => true);

jest.mock('../lib/firebase-native', () => ({
  isNativeFirebaseConfigured: jest.fn(() => true),
  isNativeGoogleConfigured: () => mockIsNativeGoogleConfigured(),
  nativeCreateUserWithEmail: jest.fn(),
  nativeCurrentIdToken: jest.fn(),
  nativeSignInWithEmail: jest.fn(),
  nativeSignInWithGoogle: (...args: unknown[]) => mockNativeSignInWithGoogle(...args),
  nativeSignOut: jest.fn(),
  // PHASE 16: the boundary grew the three verification operations. They are listed
  // here even though this suite never drives them, so the mock describes the module
  // it stands in for rather than the subset this file happens to call.
  nativeForceIdToken: jest.fn(async () => null),
  nativeReloadUser: jest.fn(async () => true),
  nativeSendEmailVerification: jest.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GOOGLE_ID_TOKEN = 'google.id.token';
const FIREBASE_ID_TOKEN = 'firebase.id.token';

const GOOGLE_FAILED = 'Unable to sign in with Google. Please try again.';
const GOOGLE_NOT_CONFIGURED =
  'Google sign-in is not configured for this build. Contact your administrator.';
const CONFIRM_FAILED = 'We could not confirm your sign-in. Please try again.';

/** The raw text a real Firebase error carries — names the project and the key. */
const SDK_MESSAGE = 'Firebase: Error (auth/whatever). API key not valid: AIzaSyLEAKEDKEY123';

function firebaseError(code: string): Error {
  return Object.assign(new Error(SDK_MESSAGE), { code });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsNativeGoogleConfigured.mockReturnValue(true);
  mockNativeSignInWithGoogle.mockResolvedValue({ kind: 'idToken', idToken: FIREBASE_ID_TOKEN });
});

// ===========================================================================
// PHASE C — native sign-in
// ===========================================================================

describe('signInWithGoogle — the native path (Phase C)', () => {
  it('returns the Firebase token the boundary minted, and nothing else', async () => {
    mockNativeSignInWithGoogle.mockResolvedValue({
      kind: 'idToken',
      idToken: FIREBASE_ID_TOKEN,
    });

    const outcome = await signInWithGoogle();

    expect(outcome).toEqual({ kind: 'idToken', idToken: FIREBASE_ID_TOKEN });
    expect(JSON.stringify(outcome)).not.toContain(GOOGLE_ID_TOKEN);
  });

  it('calls the boundary exactly once and returns its token verbatim', async () => {
    // Phase F1: this case used to assert the browser seams were untouched. Those seams
    // no longer exist, so what is left to pin is that the boundary is the ONLY source of
    // the token — one call, and the value passes through unaltered.
    mockNativeSignInWithGoogle.mockResolvedValue({
      kind: 'idToken',
      idToken: FIREBASE_ID_TOKEN,
    });

    const outcome = await signInWithGoogle();

    expect(mockNativeSignInWithGoogle).toHaveBeenCalledTimes(1);
    expect(mockNativeSignInWithGoogle).toHaveBeenCalledWith();
    expect(outcome).toEqual({ kind: 'idToken', idToken: FIREBASE_ID_TOKEN });
  });

  it('reports cancelled when the person closes the sheet, touching nothing else', async () => {
    mockNativeSignInWithGoogle.mockResolvedValue({ kind: 'cancelled' });

    const outcome = await signInWithGoogle();

    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(mockNativeSignInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('classifies a native failure by its code and never relays the native text', async () => {
    mockNativeSignInWithGoogle.mockRejectedValue(
      Object.assign(new Error('DEVELOPER_ERROR: SHA-1 mismatch for com.inventoryai.app'), {
        code: 'google/play-services-unavailable',
      })
    );

    const outcome = await signInWithGoogle();

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'google/play-services-unavailable',
      message: GOOGLE_FAILED,
    });
    // The native description is discarded, and an unrecognised code still gets our
    // sentence rather than a developer message.
    expect(outcome.kind === 'failure' && outcome.message).not.toContain('DEVELOPER_ERROR');
    expect(outcome.kind === 'failure' && outcome.message).not.toContain('SHA-1');
    expect(outcome.kind === 'failure' && outcome.message).not.toContain('com.inventoryai.app');
  });

  it('surfaces an unknown code as a failure with the generic sentence', async () => {
    mockNativeSignInWithGoogle.mockRejectedValue(
      Object.assign(new Error('something native'), { code: 'google/failed' })
    );

    const outcome = await signInWithGoogle();

    expect(outcome).toEqual({ kind: 'failure', code: 'google/failed', message: GOOGLE_FAILED });
  });

  it('reports not-configured without calling the boundary at all', async () => {
    mockIsNativeGoogleConfigured.mockReturnValue(false);

    const outcome = await signInWithGoogle();

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'google/not-configured',
      message: GOOGLE_NOT_CONFIGURED,
    });
    expect(mockNativeSignInWithGoogle).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// PHASE D — the CONFIRMATION now runs on the same native boundary
// ===========================================================================

describe('confirmFirebaseSignIn with Google — the native path (Phase D)', () => {
  it('authenticates through the boundary and returns only the Firebase token', async () => {
    const outcome = await confirmFirebaseSignIn({ method: 'google' });

    expect(mockNativeSignInWithGoogle).toHaveBeenCalledTimes(1);
    // Google's token is never in the outcome — only the Firebase token the boundary
    // minted from it, which is what the caller exchanges once.
    expect(JSON.stringify(outcome)).not.toContain(GOOGLE_ID_TOKEN);
    expect(outcome).toEqual({ kind: 'idToken', idToken: FIREBASE_ID_TOKEN });
  });
});

describe('confirmFirebaseSignIn with Google — cancellation is ordinary', () => {
  it('reports cancelled without reaching Firebase', async () => {
    mockNativeSignInWithGoogle.mockResolvedValue({ kind: 'cancelled' });

    const outcome = await confirmFirebaseSignIn({ method: 'google' });

    expect(outcome).toEqual({ kind: 'cancelled' });
  });
});

describe('confirmFirebaseSignIn with Google — a native failure is classified, never relayed', () => {
  it('keeps the code for the operator and shows the confirmation sentence', async () => {
    mockNativeSignInWithGoogle.mockRejectedValue(
      firebaseError('google/play-services-unavailable')
    );

    const outcome = await confirmFirebaseSignIn({ method: 'google' });

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'google/play-services-unavailable',
      message: CONFIRM_FAILED,
    });
    // The raw text names the project and a rejected key; none of it may travel, and the
    // confirmation's own sentence is the one that does.
    expect((outcome as { message: string }).message).not.toContain('AIzaSyLEAKEDKEY123');
    expect((outcome as { message: string }).message).not.toContain('Firebase:');
  });

  it('gives an unrecognised code the confirmation sentence too', async () => {
    mockNativeSignInWithGoogle.mockRejectedValue(
      Object.assign(new Error('something native'), { code: 'google/unheard-of' })
    );

    const outcome = await confirmFirebaseSignIn({ method: 'google' });

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'google/unheard-of',
      message: CONFIRM_FAILED,
    });
  });
});

describe('confirmFirebaseSignIn with Google — Firebase refuses the credential', () => {
  it('reports a failure and never relays the SDK message', async () => {
    // `auth/account-exists-with-different-credential` is Firebase's own refusal to
    // merge on an address match — the R-4/R-9 policy expressed by the provider. It is
    // reported as an ordinary failure with no detail. Phase D moved the authentication
    // into the boundary, so the code arrives from there rather than from a direct
    // `signInWithCredential` call, and the classification is unchanged.
    mockNativeSignInWithGoogle.mockRejectedValue(
      firebaseError('auth/account-exists-with-different-credential')
    );

    const outcome = await confirmFirebaseSignIn({ method: 'google' });

    expect(outcome.kind).toBe('failure');
    if (outcome.kind !== 'failure') throw new Error('unreachable');
    expect(outcome.code).toBe('auth/account-exists-with-different-credential');
    expect(outcome.message).not.toContain('AIzaSyLEAKEDKEY123');
    expect(outcome.message).not.toContain('Firebase:');
    expect(outcome.message).toBe(CONFIRM_FAILED);
  });
});

describe('confirmFirebaseSignIn with Google — an unconfigured build', () => {
  it('reports not-configured without reaching the boundary', async () => {
    mockIsNativeGoogleConfigured.mockReturnValue(false);

    const outcome = await confirmFirebaseSignIn({ method: 'google' });

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'google/not-configured',
      message: GOOGLE_NOT_CONFIGURED,
    });
    expect(mockNativeSignInWithGoogle).not.toHaveBeenCalled();
  });

  // ONE PREDICATE, SO ONE CASE. The browser era had a second case here — "Firebase itself
  // is absent" — because that path asked `getFirebaseAuth()` and `isGoogleConfigured()`
  // separately. The native gate federates them (`isNativeFirebaseConfigured() &&
  // GOOGLE_WEB_CLIENT_ID`), so "Firebase absent" is already inside the case above and a
  // second test would be asserting the same boolean twice.
});

// ---------------------------------------------------------------------------
// The redirect URI and the PKCE fail-closed property — BOTH RETIRED
// ---------------------------------------------------------------------------
//
// Phase F1 removed `googleRedirectUri()` together with the browser helper that was its
// only caller, so the two blocks that lived here are gone rather than skipped:
//
//   • `describe('googleRedirectUri')` pinned the value that had to be registered with
//     Google and asserted `makeRedirectUri` was called with it. There is no redirect URI
//     for this build any more — native Google Sign-In does not use one — so there is
//     nothing to register and no value to assert.
//
//   • The PKCE "fails closed" block (Phase 32I-N, finding I-1) was retired in Phase D,
//     when the confirmation moved to the native library. The finding it encoded is
//     recorded in the Phase D report.
//
// The structural claim that replaced them lives in `phaseF1-retired-dependency-guard.test.ts`.
