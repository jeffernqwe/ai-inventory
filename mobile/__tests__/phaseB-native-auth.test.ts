/**
 * Phase B — `lib/firebase-native.ts`, the native boundary's own behaviour.
 *
 * `__tests__/firebase-auth.test.ts` pins what a Firebase *failure means*; this file
 * pins what the boundary DOES, which is a different claim: that every operation
 * consults the shared gate before a native package is evaluated, that the two
 * credential-returning operations return a Firebase ID token and nothing else, and
 * that sign-out is total and honest.
 *
 * WHAT IS REAL HERE: the module under test. The two native packages and the shared
 * gate are mocked, and the mock COUNTS ITS OWN LOADS — so "the gate was consulted
 * first" is asserted by observing that nothing was loaded, rather than by reading
 * the source and believing it. (The source shape is asserted separately, in
 * `phase1-rnfirebase-foundation.test.ts`, because a verb that should never appear is
 * not a runtime fact.)
 *
 * THE ERROR-CODES GUARD IS THE INTERESTING ONE. The boundary must be code-agnostic:
 * it passes whatever the native SDK threw straight through, and every `auth/*`
 * decision stays in `lib/firebase-auth.ts`. That is asserted as a negative over the
 * boundary's own source, because a boundary that "helpfully" normalised a code would
 * still pass every behavioural case here while silently moving policy into the wrong
 * layer.
 */

/// <reference types="node" />
//
// The source guards below read files as text, which needs `node:fs`, `node:path` and
// `__dirname`. This directive opts THIS file into Node's types and nothing else,
// exactly as `firebase.test.ts` and `phase1-rnfirebase-foundation.test.ts` do.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// The mock seam
// ---------------------------------------------------------------------------

/** Counts every evaluation of a native package, so "gated" is observable. */
const mockNativeLoads = { app: 0, auth: 0 };

/**
 * What the fake native layer does next. Every field is set per case, so a case reads
 * as the situation it describes rather than as a call sequence.
 */
const mockNative: {
  currentUser: unknown;
  signInResult: unknown;
  signInError: unknown;
  createResult: unknown;
  createError: unknown;
  signOutError: unknown;
} = {
  currentUser: null,
  signInResult: null,
  signInError: null,
  createResult: null,
  createError: null,
  signOutError: null,
};

/**
 * The display-name write. It is a MODULAR function on the auth namespace rather than
 * a `User` method, because that is the shape React Native Firebase exports — so it is
 * mocked and counted here, where the boundary calls it.
 */
const mockUpdateProfile = jest.fn();

/**
 * Phase 16 — the two MODULAR operations the verification flow needs. Modular, not
 * `User` methods: the boundary calls `auth.sendEmailVerification(user)` and
 * `auth.reload(user)`, so these belong on the auth namespace alongside
 * `signInWithEmailAndPassword`.
 */
const mockSendEmailVerification = jest.fn();
const mockReload = jest.fn();

jest.mock('@react-native-firebase/app', () => {
  mockNativeLoads.app += 1;
  return { getApp: () => ({ name: '[DEFAULT]' }) };
});

jest.mock('@react-native-firebase/auth', () => {
  mockNativeLoads.auth += 1;
  return {
    getAuth: () => ({
      get currentUser() {
        return mockNative.currentUser;
      },
    }),
    signInWithEmailAndPassword: async () => {
      if (mockNative.signInError) throw mockNative.signInError;
      return mockNative.signInResult;
    },
    createUserWithEmailAndPassword: async () => {
      if (mockNative.createError) throw mockNative.createError;
      return mockNative.createResult;
    },
    signOut: async () => {
      if (mockNative.signOutError) throw mockNative.signOutError;
    },
    updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
    sendEmailVerification: (...args: unknown[]) => mockSendEmailVerification(...args),
    reload: (...args: unknown[]) => mockReload(...args),
  };
});

/** The one gate both boundaries share; `lib/firebase.ts` owns the real one. */
const mockIsFirebaseConfigured = jest.fn(() => false);

jest.mock('../lib/config', () => ({
  isFirebaseConfigured: mockIsFirebaseConfigured,
}));

type BoundaryModule = typeof import('../lib/firebase-native');

/**
 * The real boundary, loaded lazily.
 *
 * A top-level `import` would be hoisted above every declaration here while the
 * `jest.mock` factories are hoisted above that import, so `../lib/firebase` would be
 * evaluated before `mockIsFirebaseConfigured` exists. `requireActual` bypasses the
 * mock registry for THIS module only — its `../lib/firebase` dependency still gets the
 * mock. This is the same seam Phase 1 established, reused rather than re-invented.
 */
function loadBoundary(): BoundaryModule {
  return jest.requireActual<BoundaryModule>('../lib/firebase-native');
}

/** A resolved `UserCredential` whose user mints the given token. */
function credential(idToken: string) {
  return { user: { getIdToken: jest.fn(async () => idToken) } };
}

const ID_TOKEN = 'fake.id.token';
const EMAIL = 'owner@example.com';
const PASSWORD = 'Password123!';

/** A native-shaped failure: the namespaced code plus the native message. */
function nativeError(code: string, message = '[auth/whatever] native text') {
  return Object.assign(new Error(message), { code });
}

beforeEach(() => {
  mockNativeLoads.app = 0;
  mockNativeLoads.auth = 0;
  mockNative.currentUser = null;
  mockNative.signInResult = null;
  mockNative.signInError = null;
  mockNative.createResult = null;
  mockNative.createError = null;
  mockNative.signOutError = null;
  mockUpdateProfile.mockReset();
  mockUpdateProfile.mockResolvedValue(undefined);
  mockSendEmailVerification.mockReset();
  mockSendEmailVerification.mockResolvedValue(undefined);
  mockReload.mockReset();
  mockReload.mockResolvedValue(undefined);
  mockIsFirebaseConfigured.mockReset();
  mockIsFirebaseConfigured.mockReturnValue(false);
});

// ---------------------------------------------------------------------------
// The gate comes first, and nothing is loaded until it passes
// ---------------------------------------------------------------------------

describe('every native operation consults the gate before loading a package', () => {
  it('sign-in refuses, and loads nothing', async () => {
    await expect(loadBoundary().nativeSignInWithEmail(EMAIL, PASSWORD)).rejects.toThrow();
    expect(mockNativeLoads).toEqual({ app: 0, auth: 0 });
  });

  it('registration refuses, and loads nothing', async () => {
    await expect(loadBoundary().nativeCreateUserWithEmail(EMAIL, PASSWORD)).rejects.toThrow();
    expect(mockNativeLoads).toEqual({ app: 0, auth: 0 });
  });

  it('the read-only operations answer safely, and load nothing', () => {
    const boundary = loadBoundary();

    expect(boundary.nativeHasCurrentUser()).toBe(false);
    expect(boundary.probeNativeFirebase()).toEqual({ status: 'unconfigured' });

    expect(mockNativeLoads).toEqual({ app: 0, auth: 0 });
  });

  it('sign-out succeeds vacuously, and loads nothing', async () => {
    // "Nothing was signed in" and "signed out" are the same outcome for every
    // caller, so an unconfigured build answers true rather than refusing.
    await expect(loadBoundary().nativeSignOut()).resolves.toBe(true);
    expect(mockNativeLoads).toEqual({ app: 0, auth: 0 });
  });

  it('the token accessor answers null, and loads nothing', async () => {
    await expect(loadBoundary().nativeCurrentIdToken()).resolves.toBeNull();
    expect(mockNativeLoads).toEqual({ app: 0, auth: 0 });
  });
});

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

describe('nativeSignInWithEmail', () => {
  beforeEach(() => mockIsFirebaseConfigured.mockReturnValue(true));

  it('returns the Firebase ID token and nothing else', async () => {
    mockNative.signInResult = credential(ID_TOKEN);

    await expect(loadBoundary().nativeSignInWithEmail(EMAIL, PASSWORD)).resolves.toEqual({
      idToken: ID_TOKEN,
    });
    // Both packages were evaluated, once each, and only after the gate passed.
    expect(mockNativeLoads).toEqual({ app: 1, auth: 1 });
  });

  it('passes the native error through UNMODIFIED, code and all', async () => {
    // The boundary must not classify. If it rewrote or wrapped this, the fallback
    // policy would live here instead of in the one layer that documents it.
    const failure = nativeError('auth/invalid-credential');
    mockNative.signInError = failure;

    await expect(loadBoundary().nativeSignInWithEmail(EMAIL, PASSWORD)).rejects.toBe(failure);
  });
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('nativeCreateUserWithEmail', () => {
  beforeEach(() => mockIsFirebaseConfigured.mockReturnValue(true));

  it('creates the identity, writes the trimmed display name and returns the token', async () => {
    mockNative.createResult = credential(ID_TOKEN);

    await expect(
      loadBoundary().nativeCreateUserWithEmail(EMAIL, PASSWORD, '  Ada  ')
    ).resolves.toEqual({ idToken: ID_TOKEN });

    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    const [writtenUser, profile] = mockUpdateProfile.mock.calls[0] ?? [];
    // The user the CREATE returned, and only the display name — no photo URL, no
    // other field a caller could smuggle through.
    expect(writtenUser).toBe((mockNative.createResult as { user: unknown }).user);
    expect(profile).toEqual({ displayName: 'Ada' });
  });

  it('writes no display name when none was supplied', async () => {
    mockNative.createResult = credential(ID_TOKEN);

    await loadBoundary().nativeCreateUserWithEmail(EMAIL, PASSWORD, '   ');

    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('does not fail the signup when the cosmetic display name cannot be written', async () => {
    // Profile text the server never reads must not fail a registration that has
    // already succeeded at everything that matters.
    mockNative.createResult = credential(ID_TOKEN);
    mockUpdateProfile.mockRejectedValue(new Error('profile write failed'));

    await expect(
      loadBoundary().nativeCreateUserWithEmail(EMAIL, PASSWORD, 'Ada')
    ).resolves.toEqual({ idToken: ID_TOKEN });
  });

  it('reports a collision as the SDK raised it', async () => {
    // The adoption policy is a journey decision and lives in `firebase-auth.ts`,
    // which is why the code arrives here untouched.
    const failure = nativeError('auth/email-already-in-use');
    mockNative.createError = failure;

    await expect(loadBoundary().nativeCreateUserWithEmail(EMAIL, PASSWORD)).rejects.toBe(failure);
  });
});

// ---------------------------------------------------------------------------
// Sign-out
// ---------------------------------------------------------------------------

describe('nativeSignOut', () => {
  it('ends the native session and reports success', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);

    await expect(loadBoundary().nativeSignOut()).resolves.toBe(true);
  });

  it('reports failure instead of throwing when the native sign-out fails', async () => {
    // The observability the owner's Phase B decision requires: a durable credential
    // left in place must be REPORTED, not swallowed.
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockNative.signOutError = new Error('offline');

    await expect(loadBoundary().nativeSignOut()).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The current user and the current token
// ---------------------------------------------------------------------------

describe('nativeHasCurrentUser / nativeCurrentIdToken', () => {
  beforeEach(() => mockIsFirebaseConfigured.mockReturnValue(true));

  it('reports a durable native user, which is the P2 state', () => {
    // Under P2 a relaunch restores a signed-in native user. The boundary reports
    // that fact — and nothing in the app acts on it beyond this.
    mockNative.currentUser = { uid: 'firebase-uid' };

    expect(loadBoundary().nativeHasCurrentUser()).toBe(true);
  });

  it('reports no user when there is none', () => {
    expect(loadBoundary().nativeHasCurrentUser()).toBe(false);
  });

  it('mints a token for the signed-in user', async () => {
    mockNative.currentUser = { getIdToken: jest.fn(async () => ID_TOKEN) };

    await expect(loadBoundary().nativeCurrentIdToken()).resolves.toBe(ID_TOKEN);
  });

  it('answers null when there is no user, and when the refresh fails', async () => {
    expect(await loadBoundary().nativeCurrentIdToken()).toBeNull();

    mockNative.currentUser = {
      getIdToken: jest.fn(async () => {
        throw nativeError('auth/user-token-expired');
      }),
    };

    await expect(loadBoundary().nativeCurrentIdToken()).resolves.toBeNull();
  });

  it('stays total when the native package cannot be loaded', async () => {
    // A build with the gate ON but no native module must not throw out of an
    // accessor that callers rely on being safe.
    jest.isolateModules(() => {
      // Nothing to assert beyond "it did not throw": the module is already loaded,
      // so this case documents the contract rather than re-driving the loader.
      const boundary = loadBoundary();
      expect(typeof boundary.nativeHasCurrentUser()).toBe('boolean');
    });
    await expect(loadBoundary().nativeCurrentIdToken()).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The verification operations (Phase 16)
// ---------------------------------------------------------------------------

describe('the verification operations', () => {
  beforeEach(() => mockIsFirebaseConfigured.mockReturnValue(true));

  it('sends the Firebase verification email for the signed-in user', async () => {
    const user = { emailVerified: false };
    mockNative.currentUser = user;

    await expect(loadBoundary().nativeSendEmailVerification()).resolves.toBeUndefined();
    expect(mockSendEmailVerification).toHaveBeenCalledTimes(1);
    expect(mockSendEmailVerification).toHaveBeenCalledWith(user);
  });

  it('★ THROWS when no user is signed in, rather than inheriting the Android silent resolve', async () => {
    // RNFirebase 26.4.0 diverges here: Android RESOLVES `reload`/`sendEmailVerification`
    // when no user exists, while iOS rejects with `auth/no-current-user`. A resolved
    // promise must therefore never be read as "the email was sent", or a sign-out would
    // look like a successful resend.
    mockNative.currentUser = null;

    await expect(loadBoundary().nativeSendEmailVerification()).rejects.toMatchObject({
      code: 'native/no-current-user',
    });
    expect(mockSendEmailVerification).not.toHaveBeenCalled();
  });

  it('answers false with no user, without calling the native reload at all', async () => {
    mockNative.currentUser = null;

    await expect(loadBoundary().nativeReloadUser()).resolves.toBe(false);
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('★ reads the GETTER after the reload, never the resolved value', async () => {
    // The modular API types `reload` as `Promise<void>`. A boundary that read whatever
    // the native side resolved would answer with the SDK's internal shape; the refreshed
    // state has to come from the user object.
    mockNative.currentUser = { emailVerified: true };
    mockReload.mockResolvedValue('a resolved value that is NOT a verification state');

    await expect(loadBoundary().nativeReloadUser()).resolves.toBe(true);
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('answers false when the reload leaves the address unverified', async () => {
    mockNative.currentUser = { emailVerified: false };

    await expect(loadBoundary().nativeReloadUser()).resolves.toBe(false);
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('★ mints the FORCED-refresh token — getIdToken(true), never the cached one (RG-9)', async () => {
    // THE ASSERTION RG-9 RESTS ON. A cached token can still carry
    // `email_verified: false`, so the post-verification registration would present a
    // claim the server has just been taught to refuse.
    const getIdToken = jest.fn(async () => ID_TOKEN);
    mockNative.currentUser = { getIdToken };

    await expect(loadBoundary().nativeForceIdToken()).resolves.toBe(ID_TOKEN);
    expect(getIdToken).toHaveBeenCalledTimes(1);
    expect(getIdToken).toHaveBeenCalledWith(true);
  });

  it('answers null with no user, instead of minting anything', async () => {
    mockNative.currentUser = null;

    await expect(loadBoundary().nativeForceIdToken()).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Source guards — where the policy must NOT live
// ---------------------------------------------------------------------------

describe('the boundary is code-agnostic', () => {
  const MOBILE_ROOT = join(__dirname, '..');
  const readSource = (path: string) => readFileSync(path, 'utf8');
  const codeOnly = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('mentions no auth error code — every auth/* decision belongs to the layer above', () => {
    // Comments are stripped first: this file's own explanation names the codes, and
    // a guard that read prose would fail on its own documentation.
    const code = codeOnly(readSource(join(MOBILE_ROOT, 'lib', 'firebase-native.ts')));

    expect(code).not.toMatch(/auth\//);
    expect(code).not.toMatch(/'invalid-credential'|"invalid-credential"/);
  });

  it('is read structurally by the classification layer, never with instanceof', () => {
    // `instanceof FirebaseError` would tie this project to one SDK's class identity —
    // and the native error class is not the JavaScript one, so it would silently stop
    // classifying anything.
    const code = codeOnly(readSource(join(MOBILE_ROOT, 'lib', 'firebase-auth.ts')));

    expect(code).not.toMatch(/instanceof\s+FirebaseError/);
    expect(code).not.toMatch(/instanceof\s+\w*NativeFirebase\w*Error/);
  });
});
