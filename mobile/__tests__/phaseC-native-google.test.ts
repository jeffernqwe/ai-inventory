/**
 * Phase C — `lib/firebase-native.ts`, the native Google Sign-In boundary.
 *
 * WHAT THIS FILE PROVES, AND WHY IT IS AT THIS LAYER. The Google sign-in operation
 * lives behind the boundary so that exactly one module names the native packages and
 * exactly one module decides what a Firebase failure means. Everything asserted here
 * is a property of that boundary and would be untestable from above it: that the gate
 * is consulted before a package is evaluated, that the Web client ID — not a platform
 * client ID — is what gets configured, that cancellation is recognised in BOTH of the
 * shapes this library uses, that a failure is reduced to a code this app owns with the
 * native text discarded, and that nothing but the token leaves.
 *
 * THE NATIVE PACKAGES ARE MOCKED, THE BOUNDARY IS NOT. `jest.requireActual` loads the
 * real module; the two packages it reaches through `require()` are replaced, and the
 * load counter makes "the gate ran first" observable rather than assumed. This is the
 * seam Phase 1 established and Phase B reused — re-invented nowhere.
 *
 * NO TOKEN IS EVER LOGGED, and that is asserted rather than promised: the source guard
 * at the bottom fails if the boundary gains a `console.*` call at all, so a future
 * debugging line cannot quietly start printing credentials.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// The mock seam
// ---------------------------------------------------------------------------

/** Counts every evaluation of the Google package, so "gated" is observable. */
const mockGoogleLoads = { count: 0 };

/** What the fake Google library does next. Set per case, so a case reads as its situation. */
const mockGoogle: {
  signInResponse: unknown;
  signInError: unknown;
} = {
  signInResponse: null,
  signInError: null,
};

const mockConfigure = jest.fn();
const mockGoogleCredentialNative = jest.fn();
const mockNativeSignInWithCredential = jest.fn();

jest.mock('@react-native-google-signin/google-signin', () => {
  mockGoogleLoads.count += 1;
  return {
    statusCodes: {
      SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
      IN_PROGRESS: 'IN_PROGRESS',
      PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
      SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
      NULL_PRESENTER: 'NULL_PRESENTER',
    },
    GoogleSignin: {
      configure: (...args: unknown[]) => mockConfigure(...args),
      signIn: async () => {
        if (mockGoogle.signInError) throw mockGoogle.signInError;
        return mockGoogle.signInResponse;
      },
    },
    // The library's own predicates, reproduced with the same semantics: a failure is
    // recognised by a string `code`, a cancellation by `type: 'cancelled'`, a success
    // by `type: 'success'`.
    // Written as two statements on purpose. The one-line form — a `typeof` check on
    // `?.code` compared directly against the type name — is read by the server's
    // Phase 23 client-code guard as the client comparing a server code, and reports a
    // phantom code that no server can emit: a false positive in a guard this phase
    // must not touch. Separating the read from the comparison keeps the fixture's
    // intent and the guard's harvest distinct.
    isErrorWithCode: (error: unknown) => {
      const failureCode = (error as { code?: unknown } | null)?.code;
      return typeof failureCode === 'string';
    },
    isCancelledResponse: (response: unknown) =>
      (response as { type?: unknown } | null)?.type === 'cancelled',
    isSuccessResponse: (response: unknown) =>
      (response as { type?: unknown } | null)?.type === 'success',
  };
});

jest.mock('@react-native-firebase/app', () => ({
  getApp: () => ({ name: '[DEFAULT]' }),
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: () => ({ __fakeAuth: true }),
  GoogleAuthProvider: {
    credential: (...args: unknown[]) => mockGoogleCredentialNative(...args),
  },
  signInWithCredential: (...args: unknown[]) => mockNativeSignInWithCredential(...args),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  updateProfile: jest.fn(),
}));

/** The Firebase gate the boundary shares with the configuration module. */
const mockIsFirebaseConfigured = jest.fn(() => true);

/** The Web client ID, which is the second half of the native Google gate. */
let mockGoogleWebClientId = 'web-client-id.apps.googleusercontent.com';

// ONE factory for `../lib/config` (Phase F1). Both gate values live there now, and Jest
// rejects a second `jest.mock` of the same path, so the two factories are merged rather
// than declared twice.
jest.mock('../lib/config', () => ({
  isFirebaseConfigured: mockIsFirebaseConfigured,
  get GOOGLE_WEB_CLIENT_ID() {
    return mockGoogleWebClientId;
  },
}));

type BoundaryModule = typeof import('../lib/firebase-native');

/** The real boundary, loaded lazily — see the note in `phaseB-native-auth.test.ts`. */
function loadBoundary(): BoundaryModule {
  return jest.requireActual<BoundaryModule>('../lib/firebase-native');
}

/**
 * The boundary with a FRESH module registry.
 *
 * A package the boundary reaches through `require()` is evaluated once per module
 * registry, not once per call, so a load count asserted after any earlier case has
 * already loaded it would read a meaningless zero. Resetting the registry first is
 * what makes "the gate ran before the package was evaluated" a real observation
 * rather than a coincidence of test order.
 */
function loadFreshBoundary(): BoundaryModule {
  jest.resetModules();
  mockGoogleLoads.count = 0;
  return jest.requireActual<BoundaryModule>('../lib/firebase-native');
}

const GOOGLE_ID_TOKEN = 'google.id.token';
const FIREBASE_ID_TOKEN = 'firebase.id.token';

/** The raw text a native/library error can carry — activity, package, developer copy. */
const NATIVE_MESSAGE = 'DEVELOPER_ERROR: status code 10, com.inventoryai.app (SHA-1 mismatch)';

function nativeFailure(code: string): Error {
  return Object.assign(new Error(NATIVE_MESSAGE), { code });
}

/** A successful native sign-in response, in this library's shape. */
function successResponse(idToken: string | null = GOOGLE_ID_TOKEN) {
  return {
    type: 'success',
    data: {
      user: { id: 'g-1', email: 'owner@example.com', name: 'Owner' },
      scopes: ['openid', 'email', 'profile'],
      idToken,
      serverAuthCode: null,
    },
  };
}

beforeEach(() => {
  mockGoogleLoads.count = 0;
  mockGoogle.signInResponse = null;
  mockGoogle.signInError = null;
  mockConfigure.mockReset();
  mockGoogleCredentialNative.mockReset();
  mockGoogleCredentialNative.mockReturnValue({ __credential: true });
  mockNativeSignInWithCredential.mockReset();
  mockNativeSignInWithCredential.mockResolvedValue({
    user: { getIdToken: jest.fn(async () => FIREBASE_ID_TOKEN) },
  });
  mockIsFirebaseConfigured.mockReset();
  mockIsFirebaseConfigured.mockReturnValue(true);
  mockGoogleWebClientId = 'web-client-id.apps.googleusercontent.com';
});

// ---------------------------------------------------------------------------
// The gate — two conditions, both real, and neither loadable before it passes
// ---------------------------------------------------------------------------

describe('isNativeGoogleConfigured', () => {
  it('is true only when Firebase AND a Web client ID are both present', () => {
    const boundary = loadBoundary();

    expect(boundary.isNativeGoogleConfigured()).toBe(true);

    mockIsFirebaseConfigured.mockReturnValue(false);
    expect(boundary.isNativeGoogleConfigured()).toBe(false);

    mockIsFirebaseConfigured.mockReturnValue(true);
    mockGoogleWebClientId = '';
    expect(boundary.isNativeGoogleConfigured()).toBe(false);
  });

  it('loads no package merely by being asked', () => {
    loadBoundary().isNativeGoogleConfigured();
    expect(mockGoogleLoads.count).toBe(0);
  });
});

describe('the gate comes before the Google package is evaluated', () => {
  it('refuses without Firebase, and loads nothing', async () => {
    const boundary = loadFreshBoundary();
    mockIsFirebaseConfigured.mockReturnValue(false);

    await expect(boundary.nativeSignInWithGoogle()).rejects.toMatchObject({
      code: 'google/not-configured',
    });

    // The counts are the assertion: the Google package was never evaluated, so the
    // gate genuinely ran first rather than merely being described as running first.
    expect(mockGoogleLoads.count).toBe(0);
    expect(mockConfigure).not.toHaveBeenCalled();
  });

  it('refuses without a Web client ID, and loads nothing', async () => {
    const boundary = loadFreshBoundary();
    mockGoogleWebClientId = '';

    await expect(boundary.nativeSignInWithGoogle()).rejects.toMatchObject({
      code: 'google/not-configured',
    });
    expect(mockGoogleLoads.count).toBe(0);
    expect(mockConfigure).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The success path — and the exact sequence
// ---------------------------------------------------------------------------

describe('nativeSignInWithGoogle — success', () => {
  it('configures the WEB client, then authenticates the Google token with Firebase', async () => {
    mockGoogle.signInResponse = successResponse();

    const result = await loadBoundary().nativeSignInWithGoogle();

    // The Web client ID and the openid scope are the two things that make this work
    // at all: a platform client ID cannot mint an id_token, and without `openid`
    // Google returns no id_token to mint a Firebase credential from.
    expect(mockConfigure).toHaveBeenCalledTimes(1);
    expect(mockConfigure).toHaveBeenCalledWith({
      webClientId: 'web-client-id.apps.googleusercontent.com',
      scopes: ['openid', 'email', 'profile'],
    });

    // The credential is built from GOOGLE's token and handed to Firebase. An
    // authorization code never appears, because this flow has none.
    expect(mockGoogleCredentialNative).toHaveBeenCalledWith(GOOGLE_ID_TOKEN);
    expect(mockNativeSignInWithCredential).toHaveBeenCalledTimes(1);
    expect(mockNativeSignInWithCredential.mock.calls[0][1]).toEqual({ __credential: true });

    // The result carries the FIREBASE token and nothing else — no uid, no email, no
    // provider data, no credential object. Asserted as an exact object so a future
    // field cannot be added without this line failing.
    expect(result).toEqual({ kind: 'idToken', idToken: FIREBASE_ID_TOKEN });
    expect(JSON.stringify(result)).not.toContain(GOOGLE_ID_TOKEN);
  });

  it('loads the Google package exactly once, after the gate has passed', async () => {
    const boundary = loadFreshBoundary();
    mockGoogle.signInResponse = successResponse();

    await boundary.nativeSignInWithGoogle();

    expect(mockGoogleLoads.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Cancellation — ordinary, and recognised in both shapes the library uses
// ---------------------------------------------------------------------------

describe('nativeSignInWithGoogle — the person closes the sheet', () => {
  it('reports cancelled when the library REJECTS with SIGN_IN_CANCELLED', async () => {
    // The Android shape: dismissing the sheet arrives as a rejection.
    mockGoogle.signInError = nativeFailure('SIGN_IN_CANCELLED');

    const result = await loadBoundary().nativeSignInWithGoogle();

    expect(result).toEqual({ kind: 'cancelled' });
    expect(mockNativeSignInWithCredential).not.toHaveBeenCalled();
    expect(mockGoogleCredentialNative).not.toHaveBeenCalled();
  });

  it('reports cancelled when the library RESOLVES with a cancelled response', async () => {
    // The typed shape: the same outcome delivered as a value.
    mockGoogle.signInResponse = { type: 'cancelled', data: null };

    const result = await loadBoundary().nativeSignInWithGoogle();

    expect(result).toEqual({ kind: 'cancelled' });
    expect(mockNativeSignInWithCredential).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Failure — reduced to a code we own, with the native text discarded
// ---------------------------------------------------------------------------

describe('nativeSignInWithGoogle — failures are mapped, never relayed', () => {
  it.each([
    ['IN_PROGRESS', 'google/in-progress'],
    ['PLAY_SERVICES_NOT_AVAILABLE', 'google/play-services-unavailable'],
    ['SIGN_IN_REQUIRED', 'google/sign-in-required'],
  ])('maps %s to %s', async (nativeCode, expected) => {
    mockGoogle.signInError = nativeFailure(nativeCode);

    await expect(loadBoundary().nativeSignInWithGoogle()).rejects.toMatchObject({
      code: expected,
    });
  });

  it('collapses an unrecognised failure to google/failed', async () => {
    mockGoogle.signInError = nativeFailure('SOMETHING_NEW_IN_A_FUTURE_VERSION');

    await expect(loadBoundary().nativeSignInWithGoogle()).rejects.toMatchObject({
      code: 'google/failed',
    });
  });

  it('never puts the native message in the error it throws', async () => {
    mockGoogle.signInError = nativeFailure('PLAY_SERVICES_NOT_AVAILABLE');

    // Typed as the thrown shape, not as the union: this call is expected to reject, and
    // the cast names that expectation rather than widening every property read below.
    const error = (await loadBoundary()
      .nativeSignInWithGoogle()
      .catch((err: unknown) => err)) as Error & { code?: unknown };

    expect(error.message).not.toContain(NATIVE_MESSAGE);
    expect(error.message).not.toContain('DEVELOPER_ERROR');
    expect(error.message).not.toContain('SHA-1');
    expect(error.message).not.toContain('com.inventoryai.app');
    // The code is kept for the operator; the sentence is ours.
    expect(error.code).toBe('google/play-services-unavailable');
  });

  it('refuses a success response that carries no Google id_token', async () => {
    mockGoogle.signInResponse = successResponse(null);

    await expect(loadBoundary().nativeSignInWithGoogle()).rejects.toMatchObject({
      code: 'google/missing-id-token',
    });
    expect(mockNativeSignInWithCredential).not.toHaveBeenCalled();
  });

  it('refuses an unrecognised response shape rather than guessing', async () => {
    mockGoogle.signInResponse = { type: 'somethingElse', data: null };

    await expect(loadBoundary().nativeSignInWithGoogle()).rejects.toMatchObject({
      code: 'google/unexpected-response',
    });
  });
});

// ---------------------------------------------------------------------------
// Source guards — the properties that cannot be observed behaviourally
// ---------------------------------------------------------------------------

describe('the boundary stays a boundary', () => {
  const boundarySource = readFileSync(
    join(__dirname, '..', 'lib', 'firebase-native.ts'),
    'utf8'
  );

  it('contains no console call, so a token has nowhere to be printed', () => {
    expect(boundarySource).not.toMatch(/\bconsole\s*\./);
  });

  // The listener prohibition is asserted by `phase1-rnfirebase-foundation.test.ts`,
  // which strips comments before matching — this module's own header NAMES the
  // forbidden verbs in order to explain why they are forbidden, so a raw-source
  // `not.toContain` here would fail on the explanation rather than on a call.

  it('builds the Firebase credential only from Google\'s token, never from a code', () => {
    // The native flow has no authorization code at all; `code` appears nowhere near
    // the credential construction.
    expect(boundarySource).toContain('GoogleAuthProvider.credential(googleIdToken)');
    expect(boundarySource).not.toContain('exchangeCodeAsync');
  });
});
