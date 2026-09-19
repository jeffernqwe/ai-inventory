/**
 * Phase 32E — `lib/firebase-auth.ts`, the Firebase error-classification layer.
 *
 * THIS FILE TESTS THE DECISION THAT KEEPS THE MIGRATION SAFE. Phase 32E signs in
 * with Firebase first and keeps the legacy password route for accounts that
 * predate Firebase, so the question "when is the legacy route allowed?" is the
 * whole security surface of the phase. Getting it wrong in one direction locks
 * out every existing user; getting it wrong in the other turns any Firebase fault
 * an attacker can induce into a downgrade to the weaker door. The cases below pin
 * both directions.
 *
 * THE FIREBASE SDK IS MOCKED, AND IT HAS TO BE. The real package cannot be loaded
 * under this Jest configuration at all — `__tests__/firebase.test.ts` documents
 * the mechanism in full (it resolves to untransformed ESM that `jest-expo`'s
 * `transformIgnorePatterns` allowlist does not cover). `lib/firebase` is mocked
 * too, so a case can choose between "Firebase is configured" and "this build has
 * no configuration" without touching `process.env` or the module registry.
 *
 * WHAT IS NOT MOCKED: the module under test. Every code path, every message and
 * every branch below is the shipped one.
 *
 * THE FAILURE SHAPES ARE CONSTRUCTED, not taken from the SDK. `{ code }` is the
 * only property this module reads, and building the errors here is what lets the
 * cases prove the negative — that the SDK's own `message`, which carries project
 * ids and a rejected API key, never reaches a user.
 */

import {
  FirebaseAuthError,
  ensureFirebaseAccount,
  signInWithEmail,
  signOutOfFirebase,
} from '../lib/firebase-auth';

const mockSignInWithEmailAndPassword = jest.fn();
const mockCreateUserWithEmailAndPassword = jest.fn();
const mockUpdateProfile = jest.fn();
const mockFirebaseSignOut = jest.fn();

jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...args: unknown[]) => mockSignInWithEmailAndPassword(...args),
  createUserWithEmailAndPassword: (...args: unknown[]) => mockCreateUserWithEmailAndPassword(...args),
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
  signOut: (...args: unknown[]) => mockFirebaseSignOut(...args),
}));

const mockGetFirebaseAuth = jest.fn();

jest.mock('../lib/firebase', () => ({
  getFirebaseAuth: () => mockGetFirebaseAuth(),
}));

/** The value the mocked boundary hands back when Firebase IS configured. */
const AUTH = { name: '[DEFAULT]', __fakeAuth: true };

const EMAIL = 'owner@example.com';
const PASSWORD = 'Password123!';
const ID_TOKEN = 'fake.id.token';

/**
 * The raw text a real Firebase error carries. It names the project and, for the
 * misconfiguration codes, the rejected API key — so no assertion in this file may
 * ever find it in anything a user could read.
 */
const SDK_MESSAGE = 'Firebase: Error (auth/whatever). API key not valid: AIzaSyLEAKEDKEY123';

/** A Firebase-shaped rejection: the code this module reads, plus a leaking message. */
function firebaseError(code: string, message: string = SDK_MESSAGE): Error {
  return Object.assign(new Error(message), { code });
}

/** A resolved `UserCredential` whose user mints the given token. */
function credentialFor(idToken: string = ID_TOKEN) {
  return { user: { getIdToken: jest.fn(async () => idToken) } };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetFirebaseAuth.mockReturnValue(AUTH);
});

// ---------------------------------------------------------------------------
// signInWithEmail — the fallback decision
// ---------------------------------------------------------------------------

describe('signInWithEmail — Firebase first', () => {
  it('returns the ID token when Firebase authenticates', async () => {
    mockSignInWithEmailAndPassword.mockResolvedValue(credentialFor());

    const outcome = await signInWithEmail(EMAIL, PASSWORD);

    expect(outcome).toEqual({ kind: 'idToken', idToken: ID_TOKEN });
    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(AUTH, EMAIL, PASSWORD);
  });
});

describe('signInWithEmail — the two codes that open the legacy route', () => {
  it('falls back on auth/invalid-credential', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValue(firebaseError('auth/invalid-credential'));

    expect(await signInWithEmail(EMAIL, PASSWORD)).toEqual({
      kind: 'legacyFallback',
      reason: 'invalid-credential',
    });
  });

  it('falls back on auth/user-not-found as well', async () => {
    // The deviation from the brief, and the reason for it: with Firebase's email
    // enumeration protection OFF, a legacy-only account produces this code rather
    // than invalid-credential. Handling only the brief's single code would lock
    // out every pre-Firebase user on such a project, so both are accepted. The
    // safety of accepting the extra code rests on the server, not here — see
    // server/test/phase32e-firebase-legacy-guard.test.mjs.
    mockSignInWithEmailAndPassword.mockRejectedValue(firebaseError('auth/user-not-found'));

    expect(await signInWithEmail(EMAIL, PASSWORD)).toEqual({
      kind: 'legacyFallback',
      reason: 'invalid-credential',
    });
  });
});

describe('signInWithEmail — everything else refuses to fall back', () => {
  // The list is the phase's central security property: NONE of these may open the
  // legacy door, because each is a state that is either an outage, a policy
  // refusal, or something an attacker can try to induce.
  const NO_FALLBACK: [string, string][] = [
    ['a wrong password reported under the old SDK code', 'auth/wrong-password'],
    ['a disabled Firebase user', 'auth/user-disabled'],
    ['a rate limit', 'auth/too-many-requests'],
    ['a dropped connection', 'auth/network-request-failed'],
    ['a rejected API key', 'auth/invalid-api-key'],
    ['a project with email/password disabled', 'auth/operation-not-allowed'],
    ['a malformed configuration', 'auth/configuration-not-found'],
    ['an internal SDK error', 'auth/internal-error'],
  ];

  it.each(NO_FALLBACK)('does not fall back on %s', async (_label, code) => {
    mockSignInWithEmailAndPassword.mockRejectedValue(firebaseError(code));

    const outcome = await signInWithEmail(EMAIL, PASSWORD);

    expect(outcome.kind).toBe('failure');
    expect(outcome).not.toHaveProperty('reason');
  });

  it('does not fall back when the ID token cannot be minted', async () => {
    // Authentication succeeded but produced nothing to exchange. Classified by the
    // same rules, so it is a failure rather than a legacy account — which is why
    // `getIdToken()` is inside the try.
    mockSignInWithEmailAndPassword.mockResolvedValue({
      user: { getIdToken: jest.fn(async () => Promise.reject(firebaseError('auth/user-token-expired'))) },
    });

    const outcome = await signInWithEmail(EMAIL, PASSWORD);

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'auth/user-token-expired',
      message: 'Your session expired. Please sign in again.',
    });
  });

  it('does not fall back when the boundary itself throws', async () => {
    // getFirebaseAuth() can throw auth/already-initialized after a Fast Refresh of
    // lib/firebase.ts. Firebase IS configured in that state, so the legacy route
    // must stay shut — a containment, not a degradation.
    mockGetFirebaseAuth.mockImplementation(() => {
      throw firebaseError('auth/already-initialized');
    });

    const outcome = await signInWithEmail(EMAIL, PASSWORD);

    expect(outcome.kind).toBe('failure');
    expect(mockSignInWithEmailAndPassword).not.toHaveBeenCalled();
  });
});

describe('signInWithEmail — an unconfigured build', () => {
  it('reports not-configured without touching the SDK', async () => {
    // The pre-32D app: no Firebase project at all. This is not a failure and not
    // a migration case — it is the only path, and it must behave exactly as it
    // did before the boundary existed.
    mockGetFirebaseAuth.mockReturnValue(null);

    expect(await signInWithEmail(EMAIL, PASSWORD)).toEqual({
      kind: 'legacyFallback',
      reason: 'not-configured',
    });
    expect(mockSignInWithEmailAndPassword).not.toHaveBeenCalled();
  });
});

describe('signInWithEmail — what a user is allowed to read', () => {
  it('never relays the SDK message', async () => {
    // The exfiltration case. A Firebase message names the project and, for the
    // misconfiguration codes, the rejected API key; an unauthenticated caller must
    // never receive it.
    mockSignInWithEmailAndPassword.mockRejectedValue(firebaseError('auth/invalid-api-key'));

    const outcome = await signInWithEmail(EMAIL, PASSWORD);

    expect(outcome.kind).toBe('failure');
    if (outcome.kind !== 'failure') throw new Error('unreachable');
    expect(outcome.message).not.toContain('AIzaSyLEAKEDKEY123');
    expect(outcome.message).not.toContain('API key not valid');
    expect(outcome.message).not.toContain('Firebase:');
    expect(outcome.message).toBe('Sign-in is misconfigured. Contact your administrator.');
  });

  it('gives an unrecognised code the generic sentence rather than the raw text', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValue(firebaseError('auth/some-future-code'));

    const outcome = await signInWithEmail(EMAIL, PASSWORD);

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'auth/some-future-code',
      message: 'Unable to sign in. Please try again.',
    });
  });

  it('treats a rejection with no code as a failure, not a legacy account', async () => {
    // Fail closed: an error this module cannot classify is never assumed to mean
    // "legacy user".
    mockSignInWithEmailAndPassword.mockRejectedValue(new Error(SDK_MESSAGE));

    expect(await signInWithEmail(EMAIL, PASSWORD)).toEqual({
      kind: 'failure',
      code: null,
      message: 'Unable to sign in. Please try again.',
    });
  });

  it('treats an empty code as absent', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValue(firebaseError(''));

    expect(await signInWithEmail(EMAIL, PASSWORD)).toEqual({
      kind: 'failure',
      code: null,
      message: 'Unable to sign in. Please try again.',
    });
  });
});

// ---------------------------------------------------------------------------
// ensureFirebaseAccount — registration and orphan adoption
// ---------------------------------------------------------------------------

describe('ensureFirebaseAccount', () => {
  it('creates the identity and returns its ID token', async () => {
    const credential = credentialFor();
    mockCreateUserWithEmailAndPassword.mockResolvedValue(credential);

    expect(await ensureFirebaseAccount({ email: EMAIL, password: PASSWORD, name: 'Ada' })).toEqual({
      idToken: ID_TOKEN,
    });
    expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(AUTH, EMAIL, PASSWORD);
    expect(mockUpdateProfile).toHaveBeenCalledWith(credential.user, { displayName: 'Ada' });
  });

  it('adopts an existing identity when the create collides and the password matches', async () => {
    // The designed orphan case (Phase 32A §8.2): Firebase created the account and
    // the server half failed, so the retry must sign into what exists instead of
    // dead-ending. The same password is what proves ownership.
    mockCreateUserWithEmailAndPassword.mockRejectedValue(firebaseError('auth/email-already-in-use'));
    mockSignInWithEmailAndPassword.mockResolvedValue(credentialFor());

    expect(await ensureFirebaseAccount({ email: EMAIL, password: PASSWORD })).toEqual({
      idToken: ID_TOKEN,
    });
    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(AUTH, EMAIL, PASSWORD);
  });

  it('refuses a colliding address whose password does not match', async () => {
    // The branch that keeps adoption from being account takeover: the identity
    // belongs to someone else, so the caller is sent to sign in, not let through.
    mockCreateUserWithEmailAndPassword.mockRejectedValue(firebaseError('auth/email-already-in-use'));
    mockSignInWithEmailAndPassword.mockRejectedValue(firebaseError('auth/invalid-credential'));

    await expect(ensureFirebaseAccount({ email: EMAIL, password: PASSWORD })).rejects.toThrow(
      FirebaseAuthError
    );
    await expect(ensureFirebaseAccount({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: 'auth/email-already-in-use',
      message: 'An account with this email already exists. Sign in instead.',
    });
  });

  it('reports a non-collision create failure with safe copy', async () => {
    mockCreateUserWithEmailAndPassword.mockRejectedValue(firebaseError('auth/invalid-api-key'));

    await expect(ensureFirebaseAccount({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: 'auth/invalid-api-key',
      message: 'Sign-in is misconfigured. Contact your administrator.',
    });
    // And it must not have tried to sign in — this is not a collision.
    expect(mockSignInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('does not fail the signup when the cosmetic display name cannot be written', async () => {
    const credential = credentialFor();
    mockCreateUserWithEmailAndPassword.mockResolvedValue(credential);
    mockUpdateProfile.mockRejectedValue(new Error('profile write failed'));

    expect(await ensureFirebaseAccount({ email: EMAIL, password: PASSWORD, name: 'Ada' })).toEqual({
      idToken: ID_TOKEN,
    });
  });

  it('makes no profile write when no name was supplied', async () => {
    mockCreateUserWithEmailAndPassword.mockResolvedValue(credentialFor());

    await ensureFirebaseAccount({ email: EMAIL, password: PASSWORD, name: '   ' });

    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('throws rather than silently succeeding when Firebase is not configured', async () => {
    // `lib/auth.tsx` branches on `isFirebaseConfigured()` before calling this, so
    // reaching here unconfigured is a programming fault — and it must be loud,
    // because the alternative is a registration that appears to work.
    mockGetFirebaseAuth.mockReturnValue(null);

    await expect(ensureFirebaseAccount({ email: EMAIL, password: PASSWORD })).rejects.toThrow(
      FirebaseAuthError
    );
  });
});

// ---------------------------------------------------------------------------
// signOutOfFirebase — total by construction
// ---------------------------------------------------------------------------

describe('signOutOfFirebase', () => {
  it('signs the Firebase session out', async () => {
    mockFirebaseSignOut.mockResolvedValue(undefined);

    await signOutOfFirebase();

    expect(mockFirebaseSignOut).toHaveBeenCalledWith(AUTH);
  });

  it('never throws when the SDK does', async () => {
    // Sign-out has to complete on a device with no network and no valid SDK state;
    // the local Inventory AI session is cleared by the caller regardless.
    mockFirebaseSignOut.mockRejectedValue(new Error('offline'));

    await expect(signOutOfFirebase()).resolves.toBeUndefined();
  });

  it('is a no-op when Firebase is not configured', async () => {
    mockGetFirebaseAuth.mockReturnValue(null);

    await expect(signOutOfFirebase()).resolves.toBeUndefined();
    expect(mockFirebaseSignOut).not.toHaveBeenCalled();
  });
});
