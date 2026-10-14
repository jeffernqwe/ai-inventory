/**
 * Phase 32E, migrated in Phase B — `lib/firebase-auth.ts`, the Firebase
 * error-classification layer.
 *
 * THIS FILE TESTS THE DECISION THAT KEEPS THE MIGRATION SAFE. Phase 32E signs in
 * with Firebase first and keeps the legacy password route for accounts that
 * predate Firebase, so the question "when is the legacy route allowed?" is the
 * whole security surface of the phase. Getting it wrong in one direction locks
 * out every existing user; getting it wrong in the other turns any Firebase fault
 * an attacker can induce into a downgrade to the weaker door. The cases below pin
 * both directions.
 *
 * PHASE B SWAPPED THE SEAM, NOT THE ASSERTIONS. The email/password operations now
 * run on the native SDK behind `lib/firebase-native.ts`, so the module under test
 * is mocked at that boundary instead of at `firebase/auth`. Every classification
 * case below is the one Phase 32E wrote and every expected value is unchanged,
 * which is the evidence that the migration preserved behaviour: the codes the
 * native SDK raises (`auth/invalid-credential`, `auth/user-not-found`, …) are the
 * codes the JavaScript SDK raised, so `LEGACY_FALLBACK_CODES` and the whole
 * `FAILURE_MESSAGES` table needed no edit. That parity was established from the
 * installed native error mapping rather than assumed — see the Phase B report.
 *
 * THE FIREBASE SDK IS STILL MOCKED, AND IT HAS TO BE. The real package cannot be
 * loaded under this Jest configuration at all — `__tests__/firebase.test.ts`
 * documents the mechanism in full (it resolves to untransformed ESM that
 * `jest-expo`'s `transformIgnorePatterns` allowlist does not cover). It stays
 * mocked here because the Google and confirmation paths still import it. `lib/firebase`
 * is mocked too, so a case can choose between "Firebase is configured" and "this
 * build has no configuration" without touching `process.env` or the module registry.
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
  currentFirebaseIdToken,
  ensureFirebaseAccount,
  signInWithEmail,
  signOutOfFirebase,
} from '../lib/firebase-auth';

/**
 * The native boundary, mocked. Phase B routes every email/password operation
 * through it, and each case below sets what the native SDK "did" by setting what
 * one of these resolved or rejected with.
 */
const mockNativeSignInWithEmail = jest.fn();
const mockNativeCreateUserWithEmail = jest.fn();
const mockNativeSignOut = jest.fn();
const mockNativeCurrentIdToken = jest.fn();
const mockIsNativeFirebaseConfigured = jest.fn(() => true);

jest.mock('../lib/firebase-native', () => ({
  isNativeFirebaseConfigured: () => mockIsNativeFirebaseConfigured(),
  nativeSignInWithEmail: (...args: unknown[]) => mockNativeSignInWithEmail(...args),
  nativeCreateUserWithEmail: (...args: unknown[]) => mockNativeCreateUserWithEmail(...args),
  nativeSignOut: (...args: unknown[]) => mockNativeSignOut(...args),
  nativeCurrentIdToken: (...args: unknown[]) => mockNativeCurrentIdToken(...args),
  // PHASE 16: the boundary grew the three verification operations. They are listed
  // here even though this suite never drives them, so the mock describes the module
  // it stands in for rather than the subset this file happens to call.
  nativeForceIdToken: jest.fn(async () => null),
  nativeReloadUser: jest.fn(async () => true),
  nativeSendEmailVerification: jest.fn(async () => {}),
}));

// THE `firebase/auth` AND `../lib/firebase` MOCKS ARE GONE (Phase F1). The module under
// test imports neither: every operation reaches Firebase through the mocked
// `lib/firebase-native` boundary above, and the JS SDK boundary it used to read a gate
// from no longer exists. Keeping the mocks would describe a path that is not there.

const EMAIL = 'owner@example.com';
const PASSWORD = 'Password123!';
const ID_TOKEN = 'fake.id.token';

/**
 * The raw text a real Firebase error carries. It names the project and, for the
 * misconfiguration codes, the rejected API key — so no assertion in this file may
 * ever find it in anything a user could read.
 *
 * The SHAPE IS THE NATIVE ONE: React Native Firebase prefixes the code it wraps
 * (`NativeFirebaseError` builds `[auth/<code>] <native message>`), which is why the
 * leak cases below assert against a bracketed prefix as well as the bare text.
 */
const NATIVE_SDK_MESSAGE = '[auth/invalid-api-key] API key not valid: AIzaSyLEAKEDKEY123';
const NATIVE_SDK_MESSAGE_OLD = 'Firebase: Error (auth/whatever). API key not valid: AIzaSyLEAKEDKEY123';

/** A Firebase-shaped rejection: the code this module reads, plus a leaking message. */
function firebaseError(code: string, message: string = NATIVE_SDK_MESSAGE): Error {
  return Object.assign(new Error(message), { code });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsNativeFirebaseConfigured.mockReturnValue(true);
});

// ---------------------------------------------------------------------------
// signInWithEmail — the fallback decision
// ---------------------------------------------------------------------------

describe('signInWithEmail — Firebase first', () => {
  it('returns the ID token when Firebase authenticates', async () => {
    mockNativeSignInWithEmail.mockResolvedValue({ idToken: ID_TOKEN });

    const outcome = await signInWithEmail(EMAIL, PASSWORD);

    expect(outcome).toEqual({ kind: 'idToken', idToken: ID_TOKEN });
    // The native boundary takes the credentials and NOTHING else — no auth handle,
    // no app, no provider. That is what makes the fallback question a policy
    // question rather than a plumbing one.
    expect(mockNativeSignInWithEmail).toHaveBeenCalledWith(EMAIL, PASSWORD);
  });
});

describe('signInWithEmail — the two codes that open the legacy route', () => {
  it('falls back on auth/invalid-credential', async () => {
    mockNativeSignInWithEmail.mockRejectedValue(firebaseError('auth/invalid-credential'));

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
    // server/test/phase32e-firebase-legacy-guard.test.mjs. Phase B checked that the
    // NATIVE SDK raises this same code before relying on it.
    mockNativeSignInWithEmail.mockRejectedValue(firebaseError('auth/user-not-found'));

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
    mockNativeSignInWithEmail.mockRejectedValue(firebaseError(code));

    const outcome = await signInWithEmail(EMAIL, PASSWORD);

    expect(outcome.kind).toBe('failure');
    expect(outcome).not.toHaveProperty('reason');
  });

  it('does not fall back when the ID token cannot be minted', async () => {
    // Authentication succeeded but produced nothing to exchange. The native boundary
    // performs the token mint, so it arrives here as a rejection and is classified by
    // exactly the same rules — which is why "we authenticated but have nothing to
    // exchange" cannot be mistaken for a legacy account.
    mockNativeSignInWithEmail.mockRejectedValue(firebaseError('auth/user-token-expired'));

    const outcome = await signInWithEmail(EMAIL, PASSWORD);

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'auth/user-token-expired',
      message: 'Your session expired. Please sign in again.',
    });
  });

  it('does not fall back when the native boundary itself throws', async () => {
    // The boundary consults the shared gate and then loads the native module, so a
    // build whose Firebase gate is ON but whose native module is absent throws from
    // HERE. Firebase is configured in that state, so the legacy route must stay shut —
    // a containment, not a degradation. A code-less error is the shape such a failure
    // has, and the generic sentence is the right answer to it.
    mockNativeSignInWithEmail.mockRejectedValue(
      new Error('TurboModule registry.getEnforcing: NativeRNFBTurboAuth could not be found')
    );

    const outcome = await signInWithEmail(EMAIL, PASSWORD);

    expect(outcome).toEqual({
      kind: 'failure',
      code: null,
      message: 'Unable to sign in. Please try again.',
    });
  });
});

describe('signInWithEmail — an unconfigured build', () => {
  it('reports not-configured without touching the native boundary', async () => {
    // The pre-32D app: no Firebase project at all. This is not a failure and not
    // a migration case — it is the only path, and it must behave exactly as it
    // did before any boundary existed.
    mockIsNativeFirebaseConfigured.mockReturnValue(false);

    expect(await signInWithEmail(EMAIL, PASSWORD)).toEqual({
      kind: 'legacyFallback',
      reason: 'not-configured',
    });
    expect(mockNativeSignInWithEmail).not.toHaveBeenCalled();
  });
});

describe('signInWithEmail — what a user is allowed to read', () => {
  it('never relays the SDK message', async () => {
    // The exfiltration case. A Firebase message names the project and, for the
    // misconfiguration codes, the rejected API key; an unauthenticated caller must
    // never receive it. The native prefix form is checked too, because that is the
    // shape React Native Firebase actually produces.
    mockNativeSignInWithEmail.mockRejectedValue(firebaseError('auth/invalid-api-key'));

    const outcome = await signInWithEmail(EMAIL, PASSWORD);

    expect(outcome.kind).toBe('failure');
    if (outcome.kind !== 'failure') throw new Error('unreachable');
    expect(outcome.message).not.toContain('AIzaSyLEAKEDKEY123');
    expect(outcome.message).not.toContain('API key not valid');
    expect(outcome.message).not.toContain('Firebase:');
    expect(outcome.message).not.toContain('[auth/');
    expect(outcome.message).toBe('Sign-in is misconfigured. Contact your administrator.');
  });

  it('gives an unrecognised code the generic sentence rather than the raw text', async () => {
    mockNativeSignInWithEmail.mockRejectedValue(firebaseError('auth/some-future-code'));

    const outcome = await signInWithEmail(EMAIL, PASSWORD);

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'auth/some-future-code',
      message: 'Unable to sign in. Please try again.',
    });
  });

  it('treats a rejection with no code as a failure, not a legacy account', async () => {
    // Fail closed: an error this module cannot classify is never assumed to mean
    // "legacy user". A native throw that carries no code is exactly this shape.
    mockNativeSignInWithEmail.mockRejectedValue(new Error(NATIVE_SDK_MESSAGE_OLD));

    expect(await signInWithEmail(EMAIL, PASSWORD)).toEqual({
      kind: 'failure',
      code: null,
      message: 'Unable to sign in. Please try again.',
    });
  });

  it('treats an empty code as absent', async () => {
    mockNativeSignInWithEmail.mockRejectedValue(firebaseError(''));

    expect(await signInWithEmail(EMAIL, PASSWORD)).toEqual({
      kind: 'failure',
      code: null,
      message: 'Unable to sign in. Please try again.',
    });
  });
});

// ---------------------------------------------------------------------------
// The two repaired table entries
// ---------------------------------------------------------------------------

/**
 * `auth/wrong-password` and `auth/missing-email` were both absent from the table,
 * and one of those omissions was invisible in a way that mattered.
 *
 * `auth/invalid-credential` is declared a LEGACY-FALLBACK code, so on a project with
 * email-enumeration protection ON a mistyped password never reaches the table at all
 * — the server answers with its own 401 sentence. With protection OFF the SDK reports
 * `auth/wrong-password` instead, and that code DID reach the table, which had no entry
 * for it: the same credential and the same mistake produced a clear sentence or the
 * generic "Unable to sign in. Please try again." depending on a FIREBASE CONSOLE
 * SETTING rather than on anything the user did. `auth/missing-email` was the same shape
 * of omission sitting beside the `auth/missing-password` entry that was already there.
 */
describe('signInWithEmail — the codes that were reaching the generic sentence', () => {
  it('★ answers a wrong password with the server’s own sentence', async () => {
    mockNativeSignInWithEmail.mockRejectedValue(firebaseError('auth/wrong-password'));

    const outcome = await signInWithEmail(EMAIL, PASSWORD);

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'auth/wrong-password',
      message: 'Invalid email or password',
    });
  });

  it('★ does NOT treat a wrong password as a legacy account', async () => {
    // The security half, and the reason this is not simply "add a row". A wrong
    // password means a Firebase identity EXISTS and the password did not open it —
    // the opposite of "no Firebase identity answers to these credentials". Falling
    // back here would hand every typo to the legacy route, which is precisely the
    // downgrade the fallback list exists to prevent.
    mockNativeSignInWithEmail.mockRejectedValue(firebaseError('auth/wrong-password'));

    const outcome = await signInWithEmail(EMAIL, PASSWORD);

    expect(outcome.kind).not.toBe('legacyFallback');
  });

  it('★ answers an empty address with a sentence that names the field', async () => {
    mockNativeSignInWithEmail.mockRejectedValue(firebaseError('auth/missing-email'));

    const outcome = await signInWithEmail(EMAIL, PASSWORD);

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'auth/missing-email',
      message: 'Enter your email address.',
    });
  });

  it('and an unrecognised code still takes the generic sentence', async () => {
    // The behaviour the two entries above must NOT have changed: a code the table
    // genuinely does not know is still answered generically, and the SDK's own text
    // is still never relayed.
    mockNativeSignInWithEmail.mockRejectedValue(firebaseError('auth/some-future-code'));

    expect(await signInWithEmail(EMAIL, PASSWORD)).toEqual({
      kind: 'failure',
      code: 'auth/some-future-code',
      message: 'Unable to sign in. Please try again.',
    });
  });
});

// ---------------------------------------------------------------------------
// ensureFirebaseAccount — registration and orphan adoption
// ---------------------------------------------------------------------------

describe('ensureFirebaseAccount', () => {
  it('creates the identity and returns its ID token', async () => {
    mockNativeCreateUserWithEmail.mockResolvedValue({ idToken: ID_TOKEN });

    expect(await ensureFirebaseAccount({ email: EMAIL, password: PASSWORD, name: 'Ada' })).toEqual({
      idToken: ID_TOKEN,
    });
    // The profile text is passed THROUGH rather than written here: the display-name
    // write needs the user object the boundary holds, so it happens there and its
    // failure is swallowed there. `firebase-native` has that coverage.
    expect(mockNativeCreateUserWithEmail).toHaveBeenCalledWith(EMAIL, PASSWORD, 'Ada');
  });

  it('adopts an existing identity when the create collides and the password matches', async () => {
    // The designed orphan case (Phase 32A §8.2): Firebase created the account and
    // the server half failed, so the retry must sign into what exists instead of
    // dead-ending. The same password is what proves ownership.
    mockNativeCreateUserWithEmail.mockRejectedValue(firebaseError('auth/email-already-in-use'));
    mockNativeSignInWithEmail.mockResolvedValue({ idToken: ID_TOKEN });

    expect(await ensureFirebaseAccount({ email: EMAIL, password: PASSWORD })).toEqual({
      idToken: ID_TOKEN,
    });
    expect(mockNativeSignInWithEmail).toHaveBeenCalledWith(EMAIL, PASSWORD);
  });

  it('refuses a colliding address whose password does not match', async () => {
    // The branch that keeps adoption from being account takeover: the identity
    // belongs to someone else, so the caller is sent to sign in, not let through.
    mockNativeCreateUserWithEmail.mockRejectedValue(firebaseError('auth/email-already-in-use'));
    mockNativeSignInWithEmail.mockRejectedValue(firebaseError('auth/invalid-credential'));

    await expect(ensureFirebaseAccount({ email: EMAIL, password: PASSWORD })).rejects.toThrow(
      FirebaseAuthError
    );
    await expect(ensureFirebaseAccount({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: 'auth/email-already-in-use',
      message: 'An account with this email already exists. Sign in instead.',
    });
  });

  it('reports a non-collision create failure with safe copy', async () => {
    mockNativeCreateUserWithEmail.mockRejectedValue(firebaseError('auth/invalid-api-key'));

    await expect(ensureFirebaseAccount({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: 'auth/invalid-api-key',
      message: 'Sign-in is misconfigured. Contact your administrator.',
    });
    // And it must not have tried to sign in — this is not a collision.
    expect(mockNativeSignInWithEmail).not.toHaveBeenCalled();
  });

  it('does not adopt when the create failed for a reason other than a collision', async () => {
    // A token that could not be minted on the create path is the sharpest case: the
    // identity was created, so a naive implementation would "adopt" it here and
    // silently paper over the failure. It must be reported instead.
    mockNativeCreateUserWithEmail.mockRejectedValue(firebaseError('auth/user-token-expired'));

    await expect(ensureFirebaseAccount({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: 'auth/user-token-expired',
    });
    expect(mockNativeSignInWithEmail).not.toHaveBeenCalled();
  });

  it('passes the name through untouched, including a blank one', async () => {
    // The trimming decision belongs to the boundary, which is where the write
    // happens; this layer must not invent a second rule for it.
    mockNativeCreateUserWithEmail.mockResolvedValue({ idToken: ID_TOKEN });

    await ensureFirebaseAccount({ email: EMAIL, password: PASSWORD, name: '   ' });

    expect(mockNativeCreateUserWithEmail).toHaveBeenCalledWith(EMAIL, PASSWORD, '   ');
  });

  it('throws rather than silently succeeding when Firebase is not configured', async () => {
    // `lib/auth.tsx` branches on `isFirebaseConfigured()` before calling this, so
    // reaching here unconfigured is a programming fault — and it must be loud,
    // because the alternative is a registration that appears to work.
    mockIsNativeFirebaseConfigured.mockReturnValue(false);

    await expect(ensureFirebaseAccount({ email: EMAIL, password: PASSWORD })).rejects.toThrow(
      FirebaseAuthError
    );
    expect(mockNativeCreateUserWithEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// signOutOfFirebase — total by construction, and now observable
// ---------------------------------------------------------------------------

describe('signOutOfFirebase', () => {
  it('signs the native Firebase session out', async () => {
    mockNativeSignOut.mockResolvedValue(true);

    await expect(signOutOfFirebase()).resolves.toBe(true);

    expect(mockNativeSignOut).toHaveBeenCalledTimes(1);
    // No argument: the account, the token and the business are the server's to
    // determine, and the boundary reaches the native session on its own.
    expect(mockNativeSignOut).toHaveBeenCalledWith();
  });

  it('never throws, and REPORTS a failure instead of swallowing it', async () => {
    // Phase B (owner decision): the durable native session must be observably ended
    // on every sign-out path, so a best-effort call that hid its own failure would be
    // the wrong shape. A `false` is the report — and it is the only thing produced,
    // so no token, key or error text has to be logged to make the failure visible.
    mockNativeSignOut.mockResolvedValue(false);

    await expect(signOutOfFirebase()).resolves.toBe(false);
  });

  it('is a no-op that still reports success when there is nothing to end', async () => {
    // An unconfigured build, or a device with no Firebase session: the boundary
    // answers `true`, because "nothing was signed in" and "signed out" are the same
    // outcome for every caller.
    mockIsNativeFirebaseConfigured.mockReturnValue(false);
    mockNativeSignOut.mockResolvedValue(true);

    await expect(signOutOfFirebase()).resolves.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// currentFirebaseIdToken — the registration credential
// ---------------------------------------------------------------------------

describe('currentFirebaseIdToken', () => {
  it('reads the token from the native session', async () => {
    mockNativeCurrentIdToken.mockResolvedValue(ID_TOKEN);

    await expect(currentFirebaseIdToken()).resolves.toBe(ID_TOKEN);
    expect(mockNativeCurrentIdToken).toHaveBeenCalledTimes(1);
  });

  it('answers null when there is no native session', async () => {
    mockNativeCurrentIdToken.mockResolvedValue(null);

    await expect(currentFirebaseIdToken()).resolves.toBeNull();
  });
});
