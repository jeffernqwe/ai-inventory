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
 * THE SEQUENCE IS THE POINT. Phase 32I chose Authorization Code with PKCE,
 * explicitly NOT the implicit `id_token` flow, and that is a claim about the actual
 * order of calls. An authorization code is never treated as a Firebase ID token, and
 * the browser cases would fail if it were.
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
// The mock seam — the browser flow, still used by the CONFIRMATION path
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

const mockGoogleCredential = jest.fn();
const mockSignInWithCredential = jest.fn();

jest.mock('firebase/auth', () => ({
  GoogleAuthProvider: { credential: (...args: unknown[]) => mockGoogleCredential(...args) },
  signInWithCredential: (...args: unknown[]) => mockSignInWithCredential(...args),
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  updateProfile: jest.fn(),
}));

const mockGetFirebaseAuth = jest.fn();
jest.mock('../lib/firebase', () => ({ getFirebaseAuth: () => mockGetFirebaseAuth() }));

const mockGoogleClientId = jest.fn(() => 'google-client-id');
const mockIsGoogleConfigured = jest.fn(() => true);
jest.mock('../lib/config', () => ({
  googleClientId: () => mockGoogleClientId(),
  isGoogleConfigured: () => mockIsGoogleConfigured(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTH = { name: '[DEFAULT]', __fakeAuth: true };
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

function firebaseCredential(idToken: string = FIREBASE_ID_TOKEN) {
  return { user: { getIdToken: jest.fn(async () => idToken) } };
}

/** A successful authorization-code result from the system browser. */
function authorizedCode(code = 'auth-code-123') {
  return { type: 'success', params: { code } };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsNativeGoogleConfigured.mockReturnValue(true);
  mockGetFirebaseAuth.mockReturnValue(AUTH);
  mockIsGoogleConfigured.mockReturnValue(true);
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
    expect(mockGoogleCredential).not.toHaveBeenCalled();
    expect(mockSignInWithCredential).not.toHaveBeenCalled();
  });

  it('reports cancelled when the person closes the sheet, touching nothing else', async () => {
    mockNativeSignInWithGoogle.mockResolvedValue({ kind: 'cancelled' });

    const outcome = await signInWithGoogle();

    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(mockExchangeCodeAsync).not.toHaveBeenCalled();
    expect(mockSignInWithCredential).not.toHaveBeenCalled();
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
// THE BROWSER FLOW — now reached only through the CONFIRMATION path
// ===========================================================================

describe('confirmFirebaseSignIn with Google — the success path', () => {
  it('exchanges the code for a Google token, then authenticates with Firebase', async () => {
    mockPromptAsync.mockResolvedValue(authorizedCode());
    mockExchangeCodeAsync.mockResolvedValue({ idToken: GOOGLE_ID_TOKEN, accessToken: 'at' });
    mockGoogleCredential.mockReturnValue({ __credential: true });
    mockSignInWithCredential.mockResolvedValue(firebaseCredential());

    const outcome = await confirmFirebaseSignIn({ method: 'google' });

    // Order: the authorization code is exchanged FIRST (with the PKCE verifier), and
    // only then is a Firebase credential built from GOOGLE's token.
    expect(mockExchangeCodeAsync).toHaveBeenCalledTimes(1);
    // The verifier travels in `extraParams` as `code_verifier`; it is never a
    // top-level parameter of the request body.
    expect(mockExchangeCodeAsync.mock.calls[0][0]).toMatchObject({
      code: 'auth-code-123',
      extraParams: { code_verifier: 'pkce-verifier' },
    });
    expect(mockGoogleCredential).toHaveBeenCalledWith(GOOGLE_ID_TOKEN);
    expect(mockSignInWithCredential).toHaveBeenCalledTimes(1);

    expect(JSON.stringify(outcome)).not.toContain(GOOGLE_ID_TOKEN);
    expect(outcome).toEqual({ kind: 'idToken', idToken: FIREBASE_ID_TOKEN });
  });
});

describe('confirmFirebaseSignIn with Google — cancellation is ordinary', () => {
  it.each(['cancel', 'dismiss'])('reports cancelled on %s and touches nothing else', async (type) => {
    mockPromptAsync.mockResolvedValue({ type });

    const outcome = await confirmFirebaseSignIn({ method: 'google' });

    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(mockExchangeCodeAsync).not.toHaveBeenCalled();
    expect(mockSignInWithCredential).not.toHaveBeenCalled();
  });
});

describe('confirmFirebaseSignIn with Google — the OAuth step fails', () => {
  it('surfaces the OAuth error code with safe copy and stops before Firebase', async () => {
    mockPromptAsync.mockResolvedValue({
      type: 'error',
      error: 'access_denied',
      errorCode: 'access_denied',
    });

    const outcome = await confirmFirebaseSignIn({ method: 'google' });

    // The GOOGLE sentence, not the confirmation one: a failure produced INSIDE the
    // OAuth step is returned as-is by `confirmFirebaseSignIn`, because that is where
    // its copy was chosen. Only a failure thrown outside the OAuth helper — a refused
    // Firebase credential — takes the confirmation's own wording.
    expect(outcome).toEqual({
      kind: 'failure',
      code: 'access_denied',
      message: GOOGLE_FAILED,
    });
    expect(mockExchangeCodeAsync).not.toHaveBeenCalled();
    expect(mockSignInWithCredential).not.toHaveBeenCalled();
  });

  it('fails when the token response carries no id_token', async () => {
    mockPromptAsync.mockResolvedValue(authorizedCode());
    mockExchangeCodeAsync.mockResolvedValue({ accessToken: 'at' });

    const outcome = await confirmFirebaseSignIn({ method: 'google' });

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'google/missing-id-token',
      message: GOOGLE_FAILED,
    });
    expect(mockSignInWithCredential).not.toHaveBeenCalled();
  });
});

describe('confirmFirebaseSignIn with Google — Firebase refuses the credential', () => {
  it('reports a failure and never relays the SDK message', async () => {
    // `auth/account-exists-with-different-credential` is Firebase's own refusal to
    // merge on an address match — the R-4/R-9 policy expressed by the provider. It
    // is reported as an ordinary failure with no detail.
    mockPromptAsync.mockResolvedValue(authorizedCode());
    mockExchangeCodeAsync.mockResolvedValue({ idToken: GOOGLE_ID_TOKEN });
    mockGoogleCredential.mockReturnValue({});
    mockSignInWithCredential.mockRejectedValue(
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
  it('reports not-configured without opening a browser', async () => {
    mockIsGoogleConfigured.mockReturnValue(false);

    const outcome = await confirmFirebaseSignIn({ method: 'google' });

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'google/not-configured',
      message: GOOGLE_NOT_CONFIGURED,
    });
    expect(mockPromptAsync).not.toHaveBeenCalled();
  });

  it('reports not-configured when Firebase itself is absent', async () => {
    mockGetFirebaseAuth.mockReturnValue(null);

    const outcome = await confirmFirebaseSignIn({ method: 'google' });

    expect(outcome.kind).toBe('failure');
    expect(mockPromptAsync).not.toHaveBeenCalled();
  });
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
// PKCE fails closed (Phase 32I-N, finding I-1)
// ---------------------------------------------------------------------------

describe('confirmFirebaseSignIn with Google — a missing PKCE verifier', () => {
  const missingVerifiers: [string, string | undefined][] = [
    ['missing', undefined],
    ['empty', ''],
  ];

  it.each(missingVerifiers)(
    'refuses to reach the token endpoint when the verifier is %s',
    async (_label, verifier) => {
      mockCodeVerifier = verifier;
      mockPromptAsync.mockResolvedValue(authorizedCode());

      const outcome = await confirmFirebaseSignIn({ method: 'google' });

      expect(outcome).toEqual({
        kind: 'failure',
        code: 'google/missing-code-verifier',
        message: GOOGLE_FAILED,
      });
      // No exchange is attempted, so no empty `code_verifier` can be sent, and
      // nothing downstream runs either.
      expect(mockExchangeCodeAsync).not.toHaveBeenCalled();
      expect(mockGoogleCredential).not.toHaveBeenCalled();
      expect(mockSignInWithCredential).not.toHaveBeenCalled();
    }
  );
});
