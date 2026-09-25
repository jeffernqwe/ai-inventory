/**
 * Google Sign-In — `lib/firebase-auth.ts`.
 *
 * TWO FLOWS, ONE FILE, AND THE SPLIT IS DELIBERATE (Phase C).
 *
 *   • **Sign-in is NATIVE.** `signInWithGoogle` runs through
 *     `lib/firebase-native.ts` on `@react-native-google-signin/google-signin`, which
 *     is Phase C's migration. The cases below prove the module is a thin
 *     classification layer over that boundary — including the negative claim that
 *     matters most: the migrated path touches NONE of the JavaScript SDK's Google
 *     machinery, so a half-finished migration cannot pass by accident.
 *
 *   • **The confirmation is still the BROWSER flow.** `confirmFirebaseSignIn`'s
 *     `google` method still runs the Phase 32I authorization-code + PKCE sequence,
 *     because the disconnect confirmation is Phase D/E work the owner has not
 *     authorised migrating here. Its cases were RETARGETED to that entry point
 *     rather than deleted, so the sequence claims Phase 32I made — the code is
 *     exchanged at Google's token endpoint with the PKCE verifier before any
 *     Firebase credential is built, and PKCE fails closed — are still pinned.
 *
 * PHASE D MOVED THE CONFIRMATION OFF THIS FLOW. Until Phase D the browser sequence served
 * BOTH Google operations, and the exact order of calls was the claim. Since Phase D the
 * confirmation authenticates natively like the sign-in, so the browser cases have been
 * replaced by native ones — and the assertions that matter most here are the NEGATIVE
 * ones: neither operation may touch a browser seam, which is what keeps the retained
 * `acquireGoogleIdToken` helper genuinely unreferenced until Phase F removes it.
 *
 * `googleRedirectUri` is still asserted below. Its only caller is that unreferenced
 * helper, but the VALUE must not drift while it exists: it is the URI registered with
 * Google, and `app/+native-intent.ts` still matches its callback path.
 *
 * WHAT IS NOT MOCKED: `lib/firebase-auth.ts` itself. Every branch, message and
 * call-order claim below is the shipped one.
 */

import { confirmFirebaseSignIn, googleRedirectUri, signInWithGoogle } from '../lib/firebase-auth';

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
}));

// ---------------------------------------------------------------------------
// The mock seam — the browser flow, RETAINED BUT UNREFERENCED SINCE PHASE D
// ---------------------------------------------------------------------------

const mockPromptAsync = jest.fn();
const mockExchangeCodeAsync = jest.fn();
const mockMakeRedirectUri = jest.fn(
  (..._args: unknown[]): string => 'com.inventoryai.app:/oauthredirect'
);
const mockAuthRequestCtor = jest.fn();
// The verifier the mocked `AuthRequest` reports. Settable so a case can prove the
// fail-closed behaviour of a request that somehow produced none (Phase 32I-N, I-1).
let mockCodeVerifier: string | undefined = 'pkce-verifier';

jest.mock('expo-auth-session', () => {
  // A plain constructor (not an arrow) so `new AuthRequest(config)` binds `this`.
  function AuthRequest(
    this: { codeVerifier: string | undefined; promptAsync: unknown },
    config: unknown
  ) {
    mockAuthRequestCtor(config);
    this.codeVerifier = mockCodeVerifier;
    this.promptAsync = mockPromptAsync;
  }
  return {
    AuthRequest,
    ResponseType: { Code: 'code', Token: 'token', IdToken: 'id_token' },
    exchangeCodeAsync: (...args: unknown[]) => mockExchangeCodeAsync(...args),
    makeRedirectUri: (...args: unknown[]) => mockMakeRedirectUri(...args),
  };
});

// THE `firebase/auth` AND `../lib/firebase` MOCKS ARE GONE WITH THE SDK (Phase D). Nothing
// the module under test reaches still touches either, so mocking them would only have
// described a path that no longer exists.

const mockGoogleClientId = jest.fn(() => 'google-client-id');
const mockIsGoogleConfigured = jest.fn(() => true);
jest.mock('../lib/config', () => ({
  googleClientId: () => mockGoogleClientId(),
  // NOT read by the module under test since Phase D removed the import — kept because this
  // mock replaces the WHOLE module, and an omitted export becomes `undefined` for any
  // importer rather than failing loudly here.
  isGoogleConfigured: () => mockIsGoogleConfigured(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GOOGLE_ID_TOKEN = 'google.id.token';
const FIREBASE_ID_TOKEN = 'firebase.id.token';
const REDIRECT_URI = 'com.inventoryai.app:/oauthredirect';

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
  mockGoogleClientId.mockReturnValue('google-client-id');
  mockMakeRedirectUri.mockReturnValue(REDIRECT_URI);
  mockCodeVerifier = 'pkce-verifier';
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

  it('✕ touches none of the JavaScript SDK Google machinery', async () => {
    // THE NEGATIVE CLAIM THIS MIGRATION STANDS ON. If a later change re-routed the
    // sign-in back through the browser flow — or left a half-migrated path that did
    // both — this case fails, because every browser seam is asserted untouched.
    mockNativeSignInWithGoogle.mockResolvedValue({
      kind: 'idToken',
      idToken: FIREBASE_ID_TOKEN,
    });

    await signInWithGoogle();

    expect(mockNativeSignInWithGoogle).toHaveBeenCalledTimes(1);
    expect(mockPromptAsync).not.toHaveBeenCalled();
    expect(mockAuthRequestCtor).not.toHaveBeenCalled();
    expect(mockExchangeCodeAsync).not.toHaveBeenCalled();
    expect(mockMakeRedirectUri).not.toHaveBeenCalled();
  });

  it('reports cancelled when the person closes the sheet, touching nothing else', async () => {
    mockNativeSignInWithGoogle.mockResolvedValue({ kind: 'cancelled' });

    const outcome = await signInWithGoogle();

    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(mockExchangeCodeAsync).not.toHaveBeenCalled();
    expect(mockAuthRequestCtor).not.toHaveBeenCalled();
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
    expect(mockPromptAsync).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// PHASE D — the CONFIRMATION now runs on the same native boundary
// ===========================================================================

describe('confirmFirebaseSignIn with Google — the native path (Phase D)', () => {
  it('authenticates through the boundary and returns only the Firebase token', async () => {
    const outcome = await confirmFirebaseSignIn({ method: 'google' });

    expect(mockNativeSignInWithGoogle).toHaveBeenCalledTimes(1);
    // NOTHING ABOUT THE BROWSER RUNS. This is the phase's claim stated as an absence:
    // no AuthRequest is constructed, no consent prompt opens, no code is exchanged and
    // no credential is built outside the boundary.
    expect(mockAuthRequestCtor).not.toHaveBeenCalled();
    expect(mockPromptAsync).not.toHaveBeenCalled();
    expect(mockExchangeCodeAsync).not.toHaveBeenCalled();
    // Google's token is never in the outcome — only the Firebase token the boundary
    // minted from it, which is what the caller exchanges once.
    expect(JSON.stringify(outcome)).not.toContain(GOOGLE_ID_TOKEN);
    expect(outcome).toEqual({ kind: 'idToken', idToken: FIREBASE_ID_TOKEN });
  });
});

describe('confirmFirebaseSignIn with Google — cancellation is ordinary', () => {
  it('reports cancelled without touching the browser or reaching Firebase', async () => {
    mockNativeSignInWithGoogle.mockResolvedValue({ kind: 'cancelled' });

    const outcome = await confirmFirebaseSignIn({ method: 'google' });

    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(mockPromptAsync).not.toHaveBeenCalled();
    expect(mockExchangeCodeAsync).not.toHaveBeenCalled();
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
  it('reports not-configured without reaching the boundary or the browser', async () => {
    mockIsNativeGoogleConfigured.mockReturnValue(false);

    const outcome = await confirmFirebaseSignIn({ method: 'google' });

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'google/not-configured',
      message: GOOGLE_NOT_CONFIGURED,
    });
    expect(mockNativeSignInWithGoogle).not.toHaveBeenCalled();
    expect(mockPromptAsync).not.toHaveBeenCalled();
  });

  // ONE PREDICATE, SO ONE CASE. The browser era had a second case here — "Firebase itself
  // is absent" — because that path asked `getFirebaseAuth()` and `isGoogleConfigured()`
  // separately. The native gate federates them (`isNativeFirebaseConfigured() &&
  // GOOGLE_WEB_CLIENT_ID`), so "Firebase absent" is already inside the case above and a
  // second test would be asserting the same boolean twice.
});

// ---------------------------------------------------------------------------
// The redirect URI — the value that must be registered with Google
// ---------------------------------------------------------------------------

describe('googleRedirectUri', () => {
  it('uses the native custom-scheme redirect, not the app scheme (Phase 32I-N)', () => {
    expect(googleRedirectUri()).toBe(REDIRECT_URI);
    expect(mockMakeRedirectUri).toHaveBeenCalledWith({ native: REDIRECT_URI });
  });

  it('is the reverse-DNS single-slash form Google requires for Android', () => {
    // The previous value failed Google's documented custom-scheme rules twice over:
    // `inventoryai` has no period, and `//` is a double slash. Both are asserted
    // here so a regression cannot pass unnoticed.
    expect(REDIRECT_URI).toBe('com.inventoryai.app:/oauthredirect');
    expect(REDIRECT_URI).toContain('.');
    expect(REDIRECT_URI).not.toBe('inventoryai://oauthredirect');
    expect(REDIRECT_URI).not.toContain('://');
  });
});

// ---------------------------------------------------------------------------
// PKCE fails closed (Phase 32I-N, finding I-1) — RETIRED IN PHASE D
// ---------------------------------------------------------------------------
//
// This block drove `acquireGoogleIdToken` through `confirmFirebaseSignIn` and asserted that
// a missing or empty `code_verifier` stopped the token-endpoint call before it was made.
// Phase D moved the confirmation to the native library, so that helper has no caller and
// the property has nothing reachable left to assert against — a test of it now would be a
// test of nothing. The helper is retained by owner decision so Phase F can remove the whole
// browser mechanism at once, and the finding it encoded is recorded in the Phase D report.
//
// What survives from the finding is structural: the helper still fails CLOSED in source, and
// it is unreachable from the app, so no empty `code_verifier` can be produced by any path a
// user can take.
