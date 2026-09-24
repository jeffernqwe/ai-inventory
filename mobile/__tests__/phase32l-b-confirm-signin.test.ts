/**
 * Phase 32L-B — `confirmFirebaseSignIn`, and the API wrapper the disconnect uses.
 *
 * TWO CLAIMS THIS FILE EXISTS TO PIN, both of which would be silent if they broke:
 *
 * 1. A CONFIRMATION IS NOT A SIGN-IN. `signInWithEmail` may answer `legacyFallback`,
 *    which licenses a caller to try the legacy password route. A confirmation must have
 *    no such door — "no Firebase identity answers to these credentials" here means THIS
 *    IS NOT THE ACCOUNT'S METHOD, and the remedy is the other option. The outcome union
 *    therefore has no fallback member, and the cases below hammer several error codes to
 *    prove none of them produces one.
 *
 * 2. `getIdToken(true)` IS NOT A CONFIRMATION, and neither is
 *    `reauthenticateWithCredential`. A forced refresh re-mints a token and moves `iat`
 *    while leaving `auth_time` alone, and `reauthenticateWithCredential` cannot run at
 *    all after a cold start, when `auth.currentUser` is `null` under
 *    `inMemoryPersistence`. The password method therefore uses
 *    `signInWithEmailAndPassword` in BOTH states, and the source guard at the end pins
 *    that no call to the two rejected APIs is ever introduced.
 *
 * THE FIREBASE SDK IS MOCKED, AND IT HAS TO BE: the real package cannot be loaded under
 * this Jest configuration (see `firebase.test.ts`). The module under test is NOT mocked,
 * so every branch, message and code below is the shipped one, and the failure shapes are
 * CONSTRUCTED — `{ code }` is the only property the module reads.
 */

import { firebaseUnlink } from '../lib/api';
import { confirmFirebaseSignIn, signInWithGoogle } from '../lib/firebase-auth';

const mockSignInWithEmailAndPassword = jest.fn();
const mockSignInWithCredential = jest.fn();
const mockGoogleCredential = jest.fn();

jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...args: unknown[]) => mockSignInWithEmailAndPassword(...args),
  signInWithCredential: (...args: unknown[]) => mockSignInWithCredential(...args),
  signInWithEmailAndPasswordRaw: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  updateProfile: jest.fn(),
  signOut: jest.fn(),
  GoogleAuthProvider: {
    credential: (...args: unknown[]) => mockGoogleCredential(...args),
  },
}));

const mockGetFirebaseAuth = jest.fn();

jest.mock('../lib/firebase', () => ({
  getFirebaseAuth: () => mockGetFirebaseAuth(),
}));

const mockIsGoogleConfigured = jest.fn(() => true);
const mockGoogleClientId = jest.fn(() => 'google-client-id');
const mockGoogleRedirectUri = jest.fn(() => 'com.inventoryai.app:/oauthredirect');

jest.mock('../lib/config', () => ({
  isGoogleConfigured: () => mockIsGoogleConfigured(),
  googleClientId: () => mockGoogleClientId(),
  googleRedirectUri: () => mockGoogleRedirectUri(),
  API_URL: 'http://localhost:4000',
  REQUEST_TIMEOUT_MS: 15000,
}));

const mockPromptAsync = jest.fn();
const mockCodeVerifier = { value: 'pkce-verifier' as string | undefined };
const mockExchangeCodeAsync = jest.fn();

jest.mock('expo-auth-session', () => ({
  ResponseType: { Code: 'code' },
  // A constructor is deliberately absent: the module under test passes options it never
  // reads back, and declaring one that ignored them would only be a lint warning.
  AuthRequest: class AuthRequest {
    get codeVerifier(): string | undefined {
      return mockCodeVerifier.value;
    }
    promptAsync(...args: unknown[]) {
      return mockPromptAsync(...args);
    }
  },
  makeRedirectUri: () => 'com.inventoryai.app:/oauthredirect',
  exchangeCodeAsync: (...args: unknown[]) => mockExchangeCodeAsync(...args),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMAIL = 'owner@example.com';
const PASSWORD = 'Password123!';
const ID_TOKEN = 'firebase.id.token';
const GOOGLE_ID_TOKEN = 'google.id.token';

const AUTH = { name: '[DEFAULT]', __fakeAuth: true };

/** A Firebase error, as the module reads it — `code` only, never a message. */
const firebaseError = (code: string) => Object.assign(new Error('sdk text'), { code });

/** The credential the SDK returns for a successful authentication. */
const credentialResult = () => ({
  user: { getIdToken: async () => ID_TOKEN },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetFirebaseAuth.mockReturnValue(AUTH);
  mockIsGoogleConfigured.mockReturnValue(true);
  mockCodeVerifier.value = 'pkce-verifier';
  mockSignInWithCredential.mockResolvedValue(credentialResult());
  mockGoogleCredential.mockReturnValue({ __fakeCredential: true });
  mockPromptAsync.mockResolvedValue({ type: 'success', params: { code: 'auth-code' } });
  mockExchangeCodeAsync.mockResolvedValue({ idToken: GOOGLE_ID_TOKEN });
});

// ---------------------------------------------------------------------------
// The password method
// ---------------------------------------------------------------------------

describe('confirmFirebaseSignIn — the password method', () => {
  it('authenticates with email and password and returns only the token', async () => {
    mockSignInWithEmailAndPassword.mockResolvedValue(credentialResult());

    const outcome = await confirmFirebaseSignIn({
      method: 'password',
      email: EMAIL,
      password: PASSWORD,
    });

    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(AUTH, EMAIL, PASSWORD);
    // The token is the whole contract — no User, no uid, no providerData, no credential.
    expect(outcome).toEqual({ kind: 'idToken', idToken: ID_TOKEN });
  });

  it('works when there is no Firebase user, which is the cold-start state', async () => {
    // `auth.currentUser === null` after a restart under `inMemoryPersistence`. The call
    // must not depend on it: `reauthenticateWithCredential` would need one and is
    // therefore not used anywhere (see the source guard below).
    mockSignInWithEmailAndPassword.mockResolvedValue(credentialResult());

    const outcome = await confirmFirebaseSignIn({
      method: 'password',
      email: EMAIL,
      password: PASSWORD,
    });

    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledTimes(1);
    expect(outcome.kind).toBe('idToken');
  });

  it('reports the unambiguous "no password identity here" as wrong-method', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValue(firebaseError('auth/user-not-found'));

    const outcome = await confirmFirebaseSignIn({
      method: 'password',
      email: EMAIL,
      password: PASSWORD,
    });

    // The remedy is the other option, so this is a STATE and not a failure — it carries
    // no message because the sentence belongs to the screen.
    expect(outcome).toEqual({ kind: 'wrong-method' });
  });

  it('does NOT call a typo the wrong method, because it cannot tell the two apart', async () => {
    // Under email-enumeration protection the SDK collapses "no such user" and "wrong
    // password" into this one code. Calling it `wrong-method` would tell a person with a
    // typo to switch methods, so it stays a failure whose sentence names both remedies.
    mockSignInWithEmailAndPassword.mockRejectedValue(firebaseError('auth/invalid-credential'));

    const outcome = await confirmFirebaseSignIn({
      method: 'password',
      email: EMAIL,
      password: PASSWORD,
    });

    expect(outcome.kind).toBe('failure');
    expect((outcome as { message: string }).message).toMatch(/check your sign-in password/i);
    expect((outcome as { message: string }).message).toMatch(/Confirm with Google/);
  });

  it('treats the unprotected-project form of a bad password the same way', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValue(firebaseError('auth/wrong-password'));

    const outcome = await confirmFirebaseSignIn({
      method: 'password',
      email: EMAIL,
      password: PASSWORD,
    });

    expect(outcome.kind).toBe('failure');
  });

  it('classifies a rate limit through the shared table', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValue(firebaseError('auth/too-many-requests'));

    const outcome = await confirmFirebaseSignIn({
      method: 'password',
      email: EMAIL,
      password: PASSWORD,
    });

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'auth/too-many-requests',
      message: 'Too many attempts. Please wait a moment and try again.',
    });
  });

  it('never relays a raw SDK message', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValue(
      Object.assign(new Error('Firebase: Error (auth/invalid-api-key). The API key abc123 is invalid.'), {
        code: 'auth/invalid-api-key',
      })
    );

    const outcome = await confirmFirebaseSignIn({
      method: 'password',
      email: EMAIL,
      password: PASSWORD,
    });

    // The SDK's text names the project and the rejected key. The CODE is carried (it is
    // safe, and it is what an operator reads in the log), but the MESSAGE must not be the
    // SDK's — that is the whole reason the module owns a message table.
    expect(outcome).toEqual({
      kind: 'failure',
      code: 'auth/invalid-api-key',
      message: 'Sign-in is misconfigured. Contact your administrator.',
    });
    expect((outcome as { message: string }).message).not.toContain('abc123');
  });

  it('answers a missing email with a generic failure rather than reaching Firebase', async () => {
    const outcome = await confirmFirebaseSignIn({ method: 'password', password: PASSWORD });

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'firebase/confirm-missing-email',
      message: 'We could not confirm your sign-in. Please try again.',
    });
    expect(mockSignInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('answers an unconfigured build without touching the SDK', async () => {
    mockGetFirebaseAuth.mockReturnValue(null);

    const outcome = await confirmFirebaseSignIn({
      method: 'password',
      email: EMAIL,
      password: PASSWORD,
    });

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'firebase/not-configured',
      message: 'Sign-in is misconfigured. Contact your administrator.',
    });
    expect(mockSignInWithEmailAndPassword).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The Google method
// ---------------------------------------------------------------------------

describe('confirmFirebaseSignIn — the Google method', () => {
  it('runs the code + PKCE exchange and returns the Firebase token', async () => {
    const outcome = await confirmFirebaseSignIn({ method: 'google', email: EMAIL });

    expect(mockPromptAsync).toHaveBeenCalledTimes(1);
    expect(mockGoogleCredential).toHaveBeenCalledWith(GOOGLE_ID_TOKEN);
    expect(mockSignInWithCredential).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ kind: 'idToken', idToken: ID_TOKEN });
  });

  it('reports a closed sheet as cancelled rather than as a fault', async () => {
    mockPromptAsync.mockResolvedValue({ type: 'dismiss' });

    expect(await confirmFirebaseSignIn({ method: 'google' })).toEqual({ kind: 'cancelled' });
  });

  it('fails closed when the PKCE verifier is missing, without calling the token endpoint', async () => {
    // The Phase 32I-N finding: an empty `code_verifier` is a request Google either
    // rejects or, worse, one honoured without the proof PKCE exists to provide.
    mockCodeVerifier.value = undefined;

    const outcome = await confirmFirebaseSignIn({ method: 'google', email: EMAIL });

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'google/missing-code-verifier',
      message: 'Unable to sign in with Google. Please try again.',
    });
    expect(mockExchangeCodeAsync).not.toHaveBeenCalled();
  });

  it('refuses when Google is not configured for this build', async () => {
    mockIsGoogleConfigured.mockReturnValue(false);

    const outcome = await confirmFirebaseSignIn({ method: 'google', email: EMAIL });

    expect((outcome as { code: string }).code).toBe('google/not-configured');
    expect(mockPromptAsync).not.toHaveBeenCalled();
  });

  it('leaves the sign-in flow unchanged — the same mechanics are shared, not copied', async () => {
    // `signInWithGoogle` must still work after the extraction, and must still answer its
    // own sign-in outcome shapes rather than the confirmation's.
    const outcome = await signInWithGoogle();

    expect(outcome).toEqual({ kind: 'idToken', idToken: ID_TOKEN });
  });
});

// ---------------------------------------------------------------------------
// No fallback, ever
// ---------------------------------------------------------------------------

describe('a confirmation has no legacy door', () => {
  it('never answers with a fallback kind, for any error', async () => {
    const codes = [
      'auth/invalid-credential',
      'auth/user-not-found',
      'auth/wrong-password',
      'auth/user-disabled',
      'auth/network-request-failed',
      'auth/operation-not-allowed',
      'auth/invalid-api-key',
      'auth/internal-error',
      'something/unheard-of',
    ];

    for (const code of codes) {
      mockSignInWithEmailAndPassword.mockRejectedValue(firebaseError(code));
      const outcome = await confirmFirebaseSignIn({
        method: 'password',
        email: EMAIL,
        password: PASSWORD,
      });

      // The union has no `legacyFallback` member at all, so this is a structural claim —
      // but asserting it per code also proves no branch invents one by accident.
      expect(['idToken', 'cancelled', 'wrong-method', 'failure']).toContain(outcome.kind);
    }
  });

  it('pins in source that the two rejected APIs are used nowhere', () => {
    // A structural guard, because both rejections are decisions that would be invisible
    // in a diff: a later "simplification" that swapped in `reauthenticateWithCredential`
    // would break the cold-start flow, and one that swapped in `getIdToken(true)` would
    // silently send a token whose `auth_time` was never refreshed — and the server would
    // refuse it with a 409 the client could not explain.
    const fs = jest.requireActual('fs');
    const source = fs.readFileSync(`${__dirname}/../lib/firebase-auth.ts`, 'utf8');

    // COMMENTS ARE STRIPPED FIRST, because this module DOCUMENTS both rejected APIs by
    // name — a naive whole-file grep would fail on its own explanations. What is asserted
    // is that no CALL to either exists in the code.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line: string) => !/^\s*(\/\/|\*)/.test(line))
      .join('\n');

    // THE GUARD'S OWN GUARD. An empty or mis-pathed read would make every `not.toMatch`
    // below pass for the wrong reason, so the extraction is proved to have real content
    // and to have kept the one call this method actually makes.
    expect(source.length).toBeGreaterThan(1000);
    expect(code).toMatch(/signInWithEmailAndPassword\(auth,\s*email,\s*password/);
    expect(source).toMatch(/reauthenticateWithCredential/);
    expect(source).toMatch(/getIdToken\(true\)/);

    expect(code).not.toMatch(/reauthenticateWith/);
    expect(code).not.toMatch(/getIdToken\(\s*true\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// The API wrapper
// ---------------------------------------------------------------------------

/** The two arguments `apiFetch` passes to `fetch`, so the mock's calls are typed. */
interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body: string;
}

describe('firebaseUnlink', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs the token and the new password to the unlink endpoint as the bearer credential', async () => {
    const fetchMock = jest.fn(async (_url: string, _init: FetchInit) => ({
      status: 200,
      json: async () => ({ unlinked: true, user: { id: 'u1' } }),
    }));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    await firebaseUnlink('session.jwt', { idToken: ID_TOKEN, newPassword: PASSWORD });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:4000/api/auth/firebase/unlink');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer session.jwt');
    expect(JSON.parse(init.body)).toEqual({ idToken: ID_TOKEN, newPassword: PASSWORD });
  });

  it('surfaces the server code and status as an ApiError', async () => {
    const fetchMock = jest.fn(async (_url: string, _init: FetchInit) => ({
      status: 409,
      json: async () => ({ code: 'FIREBASE_REAUTHENTICATION_REQUIRED', error: 'confirm again' }),
    }));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    await expect(
      firebaseUnlink('session.jwt', { idToken: ID_TOKEN, newPassword: PASSWORD })
    ).rejects.toMatchObject({ status: 409, code: 'FIREBASE_REAUTHENTICATION_REQUIRED' });
  });
});
