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
 * THE NATIVE BOUNDARY IS MOCKED, AND IT HAS TO BE (Phase D). Since Phase D every
 * confirmation authenticates through `lib/firebase-native.ts`, whose real native modules
 * cannot be loaded under this Jest configuration, so `lib/firebase-native` is mocked and
 * the module under test is NOT — every branch, message and code below is the shipped one,
 * and the failure shapes are CONSTRUCTED (`{ code }` is the only property read).
 *
 * THE LOCAL `firebase/auth` MOCK IS GONE WITH THE SDK. PHASE F1 THEN REMOVED THE BROWSER
 * MECHANISM ITSELF — `acquireGoogleIdToken`, its Google discovery constants,
 * `googleRedirectUri()` and the `expo-auth-session` import — so the `expo-auth-session`
 * mock that used to model those seams is gone with it: there is nothing left to assert
 * against. The structural claim that replaced those negative assertions lives in
 * `phaseF1-retired-dependency-guard.test.ts`. `lib/config` is still mocked, because
 * `lib/api.ts` — imported below for the `firebaseUnlink` cases — reads its URL and timeout.
 */

import { firebaseUnlink } from '../lib/api';
import { confirmFirebaseSignIn, signInWithGoogle } from '../lib/firebase-auth';
import { isNativeGoogleConfigured } from '../lib/firebase-native';

const mockNativeSignInWithEmail = jest.fn();
const mockNativeSignInWithGoogle = jest.fn();
const mockIsNativeFirebaseConfigured = jest.fn(() => true);
const mockIsNativeGoogleConfigured = jest.fn(() => true);

/**
 * PHASE D — THE SEAM IS THE BOUNDARY, NOT THE SDK. Both confirmation methods now enter
 * `lib/firebase-native.ts`, so that is the module to mock. Mocking it also keeps the four
 * exports the module under test reads — two gates, two operations — explicit, so a rename
 * or a dropped export fails here rather than silently changing what is under test.
 */
jest.mock('../lib/firebase-native', () => ({
  isNativeFirebaseConfigured: () => mockIsNativeFirebaseConfigured(),
  isNativeGoogleConfigured: () => mockIsNativeGoogleConfigured(),
  nativeSignInWithEmail: (...args: unknown[]) => mockNativeSignInWithEmail(...args),
  nativeSignInWithGoogle: (...args: unknown[]) => mockNativeSignInWithGoogle(...args),
  // PHASE 16: the boundary grew the three verification operations. They are listed
  // here even though this suite never drives them, so the mock describes the module
  // it stands in for rather than the subset this file happens to call.
  nativeForceIdToken: jest.fn(async () => null),
  nativeReloadUser: jest.fn(async () => true),
  nativeSendEmailVerification: jest.fn(async () => {}),
}));

// Phase F1: the three Google keys that used to be stubbed here (`isGoogleConfigured`,
// `googleClientId`, `googleRedirectUri`) described a browser flow the module under test no
// longer contains — and `googleRedirectUri` never belonged to this module in the first
// place. What remains is exactly what `lib/api.ts` reads.
jest.mock('../lib/config', () => ({
  API_URL: 'http://localhost:4000',
  REQUEST_TIMEOUT_MS: 15000,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMAIL = 'owner@example.com';
const PASSWORD = 'Password123!';
const ID_TOKEN = 'firebase.id.token';

/** A native or Firebase error, as the module reads it — `code` only, never a message. */
const firebaseError = (code: string) => Object.assign(new Error('native text'), { code });

/**
 * A google-signin failure as the boundary would surface it: a code this app owns, plus
 * developer-written text that must never reach a person. The text is modelled on the real
 * Android message so the `not.toContain` assertions below test something that exists.
 */
const nativeGoogleFailure = (code: string) =>
  Object.assign(new Error('DEVELOPER_ERROR: SHA-1 mismatch for com.inventoryai.app'), { code });

beforeEach(() => {
  jest.clearAllMocks();
  // Both gates default ON so a case that cares about a gate sets it itself, and both
  // operations default to a success, which is what every happy-path case expects.
  mockIsNativeFirebaseConfigured.mockReturnValue(true);
  mockIsNativeGoogleConfigured.mockReturnValue(true);
  mockNativeSignInWithEmail.mockResolvedValue({ idToken: ID_TOKEN });
  mockNativeSignInWithGoogle.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });
});

// ---------------------------------------------------------------------------
// The password method
// ---------------------------------------------------------------------------

describe('confirmFirebaseSignIn — the password method', () => {
  it('authenticates with email and password and returns only the token', async () => {
    mockNativeSignInWithEmail.mockResolvedValue({ idToken: ID_TOKEN });

    const outcome = await confirmFirebaseSignIn({
      method: 'password',
      email: EMAIL,
      password: PASSWORD,
    });

    // TWO ARGUMENTS, NOT THREE. The native operation takes the credentials only; the
    // Auth instance is the boundary's business, so the test asserts the shape the
    // module actually uses rather than the shape the SDK used to require.
    expect(mockNativeSignInWithEmail).toHaveBeenCalledWith(EMAIL, PASSWORD);
    // The token is the whole contract — no User, no uid, no providerData, no credential.
    expect(outcome).toEqual({ kind: 'idToken', idToken: ID_TOKEN });
  });

  it('works when there is no Firebase user, which is the cold-start state', async () => {
    // `auth.currentUser === null` after a restart under `inMemoryPersistence`. The call
    // must not depend on it: `reauthenticateWithCredential` would need one and is
    // therefore not used anywhere (see the source guard below).
    mockNativeSignInWithEmail.mockResolvedValue({ idToken: ID_TOKEN });

    const outcome = await confirmFirebaseSignIn({
      method: 'password',
      email: EMAIL,
      password: PASSWORD,
    });

    expect(mockNativeSignInWithEmail).toHaveBeenCalledTimes(1);
    expect(outcome.kind).toBe('idToken');
  });

  it('reports the unambiguous "no password identity here" as wrong-method', async () => {
    mockNativeSignInWithEmail.mockRejectedValue(firebaseError('auth/user-not-found'));

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
    mockNativeSignInWithEmail.mockRejectedValue(firebaseError('auth/invalid-credential'));

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
    mockNativeSignInWithEmail.mockRejectedValue(firebaseError('auth/wrong-password'));

    const outcome = await confirmFirebaseSignIn({
      method: 'password',
      email: EMAIL,
      password: PASSWORD,
    });

    expect(outcome.kind).toBe('failure');
  });

  it('classifies a rate limit through the shared table', async () => {
    mockNativeSignInWithEmail.mockRejectedValue(firebaseError('auth/too-many-requests'));

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
    mockNativeSignInWithEmail.mockRejectedValue(
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
    expect(mockNativeSignInWithEmail).not.toHaveBeenCalled();
  });

  it('answers an unconfigured build without touching the SDK', async () => {
    mockIsNativeFirebaseConfigured.mockReturnValue(false);

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
    expect(mockNativeSignInWithEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The Google method
// ---------------------------------------------------------------------------

describe('confirmFirebaseSignIn — the Google method', () => {
  it('authenticates through the native boundary and returns the Firebase token', async () => {
    const outcome = await confirmFirebaseSignIn({ method: 'google', email: EMAIL });

    // THE BOUNDARY IS THE WHOLE FLOW (Phase D), and since Phase F1 it is the only one:
    // the consent, Google's `id_token` and the Firebase credential all happen inside it,
    // so the token this function returns is the one the boundary minted.
    expect(mockNativeSignInWithGoogle).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ kind: 'idToken', idToken: ID_TOKEN });
  });

  it('reports a closed sheet as cancelled rather than as a fault', async () => {
    mockNativeSignInWithGoogle.mockResolvedValue({ kind: 'cancelled' });

    expect(await confirmFirebaseSignIn({ method: 'google' })).toEqual({ kind: 'cancelled' });
  });

  it('refuses when native Google is not configured for this build', async () => {
    mockIsNativeGoogleConfigured.mockReturnValue(false);

    const outcome = await confirmFirebaseSignIn({ method: 'google', email: EMAIL });

    expect((outcome as { code: string }).code).toBe('google/not-configured');
    // The refusal happens at the GATE, so the native library is never asked.
    expect(mockNativeSignInWithGoogle).not.toHaveBeenCalled();
  });

  it('classifies a native failure with the confirmation sentence, never the native text', async () => {
    mockNativeSignInWithGoogle.mockRejectedValue(nativeGoogleFailure('google/failed'));

    const outcome = await confirmFirebaseSignIn({ method: 'google', email: EMAIL });

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'google/failed',
      message: 'We could not confirm your sign-in. Please try again.',
    });
    // The boundary's own sentence is the only one that may reach a person; a
    // google-signin error's developer text names the app's signing certificate.
    expect((outcome as { message: string }).message).not.toContain('DEVELOPER_ERROR');
    expect((outcome as { message: string }).message).not.toContain('SHA-1');
  });

  // RETIRED IN PHASE D — "fails closed when the PKCE verifier is missing". That case
  // exercised `acquireGoogleIdToken` through this function, and this function no longer
  // calls it. PHASE F1 DELETED THE HELPER, its Google discovery constants and
  // `googleRedirectUri()` outright, so the property has nothing left to apply to; the
  // finding it encoded is recorded in the Phase D report.

  it('keeps the sign-in path on the same boundary as the confirmation', async () => {
    // PHASE C pinned this for SIGN-IN; Phase D extended it to the CONFIRMATION above. Both
    // Google operations run natively, and since Phase F1 that is the only implementation
    // the module has — there is no browser seam left for either one to reach.
    expect(isNativeGoogleConfigured()).toBe(true);

    const outcome = await signInWithGoogle();

    expect(mockNativeSignInWithGoogle).toHaveBeenCalledTimes(1);
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
      mockNativeSignInWithEmail.mockRejectedValue(firebaseError(code));
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
    expect(code).toMatch(/nativeSignInWithEmail\(email,\s*password/);
    expect(source).toMatch(/reauthenticateWithCredential/);
    expect(source).toMatch(/getIdToken\(true\)/);

    expect(code).not.toMatch(/reauthenticateWith/);
    expect(code).not.toMatch(/getIdToken\(\s*true\s*\)/);

    // PHASE D ADDITIONS. The JavaScript SDK must not come back into this module by any
    // route — not as an import, and not through the accessor the confirmation used to
    // reach it. A future "simplification" that reintroduced either would put authentication
    // back on the SDK the migration exists to retire, and this is the only place that
    // would notice.
    expect(code).not.toMatch(/from 'firebase\/auth'/);
    expect(code).not.toMatch(/from 'firebase\/app'/);
    expect(code).not.toMatch(/getFirebaseAuth\(/);
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
