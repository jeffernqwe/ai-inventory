/**
 * Phase 32I — `lib/firebase-auth.ts`, Google Sign-In (Authorization Code + PKCE).
 *
 * THE FLOW IS THE POINT. Owner decision for Phase 32I was Authorization Code with
 * PKCE, explicitly NOT the implicit `id_token` flow. That is a claim about the
 * actual sequence of calls, so the cases below assert the sequence itself: the
 * authorization code is exchanged at Google's token endpoint (with the PKCE
 * verifier) for a Google `id_token`, and only THEN is a Firebase credential built
 * and a Firebase user authenticated. An authorization code is never treated as a
 * Firebase ID token, and this file would fail if it were.
 *
 * PHASE 32I-N ADDED TWO CLAIMS THIS FILE PINS. The redirect is the NATIVE custom
 * scheme `com.inventoryai.app:/oauthredirect`, not the old app-scheme
 * `inventoryai://oauthredirect`. And PKCE FAILS CLOSED (finding I-1): a missing or
 * empty `codeVerifier` must stop before the token endpoint rather than send an
 * empty verifier.
 *
 * THE FIREBASE AND OAUTH SDKS ARE MOCKED. The real `firebase` package cannot be
 * loaded under this Jest configuration at all (see `__tests__/firebase.test.ts`
 * for the mechanism), and `expo-auth-session` reaches native modules the same way.
 * `lib/config` and `lib/firebase` are mocked so a case can choose "configured" and
 * "no Firebase" without touching `process.env` or the module registry.
 *
 * WHAT IS NOT MOCKED: `lib/firebase-auth.ts` itself. Every branch, message and
 * call-order claim below is the shipped one.
 */

import { googleRedirectUri, signInWithGoogle } from '../lib/firebase-auth';

// ---------------------------------------------------------------------------
// The mock seam
// ---------------------------------------------------------------------------

const mockPromptAsync = jest.fn();
const mockExchangeCodeAsync = jest.fn();
const mockMakeRedirectUri = jest.fn((..._args: unknown[]): string => 'com.inventoryai.app:/oauthredirect');
const mockAuthRequestCtor = jest.fn();
// The verifier the mocked `AuthRequest` reports. Settable so a case can prove the
// fail-closed behaviour of a request that somehow produced none (Phase 32I-N, I-1).
let mockCodeVerifier: string | undefined = 'pkce-verifier';

jest.mock('expo-auth-session', () => {
  // A plain constructor (not an arrow) so `new AuthRequest(config)` binds `this`.
  // The config is recorded so a case can assert what the request was built with;
  // `promptAsync` and `codeVerifier` are the two members the module reads.
  function AuthRequest(
    this: { codeVerifier: string | undefined; promptAsync: unknown },
    config: unknown
  ) {
    mockAuthRequestCtor(config);
    this.codeVerifier = mockCodeVerifier;
    // The mock itself is the method, so its calls are recorded and its resolved
    // value is what the module awaits.
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
  mockGetFirebaseAuth.mockReturnValue(AUTH);
  mockIsGoogleConfigured.mockReturnValue(true);
  mockGoogleClientId.mockReturnValue('google-client-id');
  mockMakeRedirectUri.mockReturnValue(REDIRECT_URI);
  mockCodeVerifier = 'pkce-verifier';
});

// ---------------------------------------------------------------------------
// The success path — and its exact order
// ---------------------------------------------------------------------------

describe('signInWithGoogle — the success path', () => {
  it('exchanges the code for a Google token, then authenticates with Firebase', async () => {
    mockPromptAsync.mockResolvedValue(authorizedCode());
    mockExchangeCodeAsync.mockResolvedValue({ idToken: GOOGLE_ID_TOKEN, accessToken: 'at' });
    mockGoogleCredential.mockReturnValue({ __credential: true });
    mockSignInWithCredential.mockResolvedValue(firebaseCredential());

    const outcome = await signInWithGoogle();

    expect(outcome).toEqual({ kind: 'idToken', idToken: FIREBASE_ID_TOKEN });
  });

  it('builds the request as Authorization Code + PKCE, never implicit', async () => {
    mockPromptAsync.mockResolvedValue(authorizedCode());
    mockExchangeCodeAsync.mockResolvedValue({ idToken: GOOGLE_ID_TOKEN });
    mockGoogleCredential.mockReturnValue({});
    mockSignInWithCredential.mockResolvedValue(firebaseCredential());

    await signInWithGoogle();

    expect(mockAuthRequestCtor).toHaveBeenCalledTimes(1);
    expect(mockAuthRequestCtor.mock.calls[0]![0]).toMatchObject({
      clientId: 'google-client-id',
      redirectUri: REDIRECT_URI,
      responseType: 'code',
      usePKCE: true,
    });
  });

  it('sends the PKCE verifier and the same redirect when exchanging the code', async () => {
    // Google rejects a token request whose redirect does not match the
    // authorization request's, and PKCE requires the verifier — so both are
    // checked on the exchange call, not assumed.
    mockPromptAsync.mockResolvedValue(authorizedCode('the-code'));
    mockExchangeCodeAsync.mockResolvedValue({ idToken: GOOGLE_ID_TOKEN });
    mockGoogleCredential.mockReturnValue({});
    mockSignInWithCredential.mockResolvedValue(firebaseCredential());

    await signInWithGoogle();

    expect(mockExchangeCodeAsync).toHaveBeenCalledTimes(1);
    expect(mockExchangeCodeAsync.mock.calls[0]![0]).toMatchObject({
      clientId: 'google-client-id',
      code: 'the-code',
      redirectUri: REDIRECT_URI,
      extraParams: { code_verifier: 'pkce-verifier' },
    });
    // The token endpoint, not the authorization endpoint.
    expect(mockExchangeCodeAsync.mock.calls[0]![1]).toEqual({
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
    });
  });

  it('hands the GOOGLE token to Firebase and never the reverse', async () => {
    mockPromptAsync.mockResolvedValue(authorizedCode());
    mockExchangeCodeAsync.mockResolvedValue({ idToken: GOOGLE_ID_TOKEN });
    const credential = { __credential: true };
    mockGoogleCredential.mockReturnValue(credential);
    mockSignInWithCredential.mockResolvedValue(firebaseCredential());

    await signInWithGoogle();

    expect(mockGoogleCredential).toHaveBeenCalledWith(GOOGLE_ID_TOKEN);
    expect(mockSignInWithCredential).toHaveBeenCalledWith(AUTH, credential);
  });

  it('never returns or leaks the Google ID token', async () => {
    // The Google token is a credential for Firebase, not for Inventory AI. It must
    // not appear in what the caller receives.
    mockPromptAsync.mockResolvedValue(authorizedCode());
    mockExchangeCodeAsync.mockResolvedValue({ idToken: GOOGLE_ID_TOKEN });
    mockGoogleCredential.mockReturnValue({});
    mockSignInWithCredential.mockResolvedValue(firebaseCredential());

    const outcome = await signInWithGoogle();

    expect(JSON.stringify(outcome)).not.toContain(GOOGLE_ID_TOKEN);
    expect(outcome).toEqual({ kind: 'idToken', idToken: FIREBASE_ID_TOKEN });
  });
});

// ---------------------------------------------------------------------------
// Cancellation — ordinary, not an error
// ---------------------------------------------------------------------------

describe('signInWithGoogle — the user changes their mind', () => {
  it.each(['cancel', 'dismiss'])('reports cancelled on %s and touches nothing else', async (type) => {
    mockPromptAsync.mockResolvedValue({ type });

    const outcome = await signInWithGoogle();

    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(mockExchangeCodeAsync).not.toHaveBeenCalled();
    expect(mockSignInWithCredential).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// OAuth failure — the browser returned an error
// ---------------------------------------------------------------------------

describe('signInWithGoogle — the OAuth step fails', () => {
  it('surfaces the OAuth error code with safe copy and stops before Firebase', async () => {
    mockPromptAsync.mockResolvedValue({
      type: 'error',
      error: 'access_denied',
      errorCode: 'access_denied',
    });

    const outcome = await signInWithGoogle();

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'access_denied',
      message: 'Unable to sign in with Google. Please try again.',
    });
    expect(mockExchangeCodeAsync).not.toHaveBeenCalled();
    expect(mockSignInWithCredential).not.toHaveBeenCalled();
  });

  it('fails when the token response carries no id_token', async () => {
    mockPromptAsync.mockResolvedValue(authorizedCode());
    mockExchangeCodeAsync.mockResolvedValue({ accessToken: 'at' });

    const outcome = await signInWithGoogle();

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'google/missing-id-token',
      message: 'Unable to sign in with Google. Please try again.',
    });
    expect(mockSignInWithCredential).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Firebase failure — the same classification table as email/password
// ---------------------------------------------------------------------------

describe('signInWithGoogle — Firebase refuses the credential', () => {
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

    const outcome = await signInWithGoogle();

    expect(outcome.kind).toBe('failure');
    if (outcome.kind !== 'failure') throw new Error('unreachable');
    expect(outcome.code).toBe('auth/account-exists-with-different-credential');
    expect(outcome.message).not.toContain('AIzaSyLEAKEDKEY123');
    expect(outcome.message).not.toContain('Firebase:');
    expect(outcome.message).toBe('Unable to sign in with Google. Please try again.');
  });
});

// ---------------------------------------------------------------------------
// Not configured — fail closed, with nothing to fall back to
// ---------------------------------------------------------------------------

describe('signInWithGoogle — an unconfigured build', () => {
  it('reports not-configured without opening a browser', async () => {
    mockIsGoogleConfigured.mockReturnValue(false);

    const outcome = await signInWithGoogle();

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'google/not-configured',
      message: 'Google sign-in is not configured for this build. Contact your administrator.',
    });
    expect(mockPromptAsync).not.toHaveBeenCalled();
  });

  it('reports not-configured when Firebase itself is absent', async () => {
    mockGetFirebaseAuth.mockReturnValue(null);

    const outcome = await signInWithGoogle();

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

describe('signInWithGoogle — a missing PKCE verifier', () => {
  const missingVerifiers: [string, string | undefined][] = [
    ['missing', undefined],
    ['empty', ''],
  ];

  it.each(missingVerifiers)(
    'refuses to reach the token endpoint when the verifier is %s',
    async (_label, verifier) => {
      mockCodeVerifier = verifier;
      mockPromptAsync.mockResolvedValue(authorizedCode());

      const outcome = await signInWithGoogle();

      expect(outcome).toEqual({
        kind: 'failure',
        code: 'google/missing-code-verifier',
        message: 'Unable to sign in with Google. Please try again.',
      });
      // No exchange is attempted, so no empty `code_verifier` can be sent, and
      // nothing downstream runs either.
      expect(mockExchangeCodeAsync).not.toHaveBeenCalled();
      expect(mockGoogleCredential).not.toHaveBeenCalled();
      expect(mockSignInWithCredential).not.toHaveBeenCalled();
    }
  );
});
