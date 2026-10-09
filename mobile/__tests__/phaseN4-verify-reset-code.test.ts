/**
 * N-4 — `verifyPasswordResetCode`, at both layers.
 *
 * The recovery handoff needs to know WHICH ACCOUNT a reset link belongs to before the
 * password changes, because the marker it writes before that moment is a fingerprint of
 * that account. This file pins the two layers that answer it:
 *
 *   `lib/firebase-native.ts`  — the SDK call, gated and passed through untranslated.
 *   `lib/firebase-auth.ts`    — what the answer MEANS: which codes are ordinary, which
 *                               sentence a user may read, and the fact that the email is
 *                               the only account field that ever leaves this layer.
 *
 * WHAT IS REAL HERE: both modules under test. The two native packages and the shared gate
 * are mocked, and the native mock COUNTS ITS OWN LOADS, so "the gate was consulted before
 * the package was evaluated" is observed rather than believed.
 *
 * THE CENTRAL NEGATIVE IS THAT THIS STEP IS READ-ONLY WITH RESPECT TO THE CREDENTIAL. It
 * runs BEFORE the password is changed, and the ordering only means something if the step
 * cannot itself change anything — so `confirmPasswordReset` is asserted never to be called
 * by it, at both layers.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// The mock seam
// ---------------------------------------------------------------------------

/** Counts every evaluation of a native package, so "gated" is observable. */
const mockNativeLoads = { app: 0, auth: 0 };

/** What the fake SDK does next. Set per case, so a case reads as its situation. */
const mockNative = {
  verifyResult: null as string | null,
  verifyError: null as unknown,
};

const mockSendPasswordResetEmail = jest.fn();
const mockConfirmPasswordReset = jest.fn();

jest.mock('@react-native-firebase/app', () => {
  mockNativeLoads.app += 1;
  return { getApp: () => ({ name: '[DEFAULT]' }) };
});

jest.mock('@react-native-firebase/auth', () => {
  mockNativeLoads.auth += 1;
  return {
    getAuth: () => ({ currentUser: null }),
    sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
    confirmPasswordReset: (...args: unknown[]) => mockConfirmPasswordReset(...args),
    verifyPasswordResetCode: async () => {
      if (mockNative.verifyError) throw mockNative.verifyError;
      return mockNative.verifyResult;
    },
  };
});

/** The one gate both boundaries share. */
const mockIsFirebaseConfigured = jest.fn(() => false);

jest.mock('../lib/config', () => ({
  isFirebaseConfigured: mockIsFirebaseConfigured,
  GOOGLE_WEB_CLIENT_ID: '',
}));

type BoundaryModule = typeof import('../lib/firebase-native');
type ClassificationModule = typeof import('../lib/firebase-auth');

/**
 * The real modules, loaded lazily: a top-level `import` is hoisted above the `jest.mock`
 * factories, so the boundary would evaluate `../lib/config` before that mock exists. This
 * is the seam Phase 1 established, reused rather than re-invented.
 */
const boundary = (): BoundaryModule => jest.requireActual<BoundaryModule>('../lib/firebase-native');
const classification = (): ClassificationModule =>
  jest.requireActual<ClassificationModule>('../lib/firebase-auth');

/** A native-shaped failure: the namespaced code plus the native message. */
function nativeError(code: string, message = '[auth/whatever] native text'): Error {
  return Object.assign(new Error(message), { code });
}

const OOB_CODE = 'oob-code-from-the-email';
const EMAIL = 'reset-owner@example.com';

beforeEach(() => {
  mockNativeLoads.app = 0;
  mockNativeLoads.auth = 0;
  mockNative.verifyResult = EMAIL;
  mockNative.verifyError = null;
  mockSendPasswordResetEmail.mockReset();
  mockConfirmPasswordReset.mockReset();
  mockIsFirebaseConfigured.mockReset();
  mockIsFirebaseConfigured.mockReturnValue(false);
});

// ---------------------------------------------------------------------------
// The boundary: gated, and untranslated
// ---------------------------------------------------------------------------

describe('N-4 — the native verb is gated like every other native operation', () => {
  it('loads nothing when the gate is off, and refuses rather than answering', async () => {
    await expect(boundary().nativeVerifyPasswordResetCode(OOB_CODE)).rejects.toThrow();

    expect(mockNativeLoads).toEqual({ app: 0, auth: 0 });
    expect(mockNative.verifyResult).toBe(EMAIL);
  });

  it('hands the code to the SDK and resolves the address it returns', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);

    await expect(boundary().nativeVerifyPasswordResetCode(OOB_CODE)).resolves.toBe(EMAIL);
    expect(mockNativeLoads.auth).toBeGreaterThan(0);
  });

  it('★ passes the address through VERBATIM — normalising is the classification layer’s job', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockNative.verifyResult = '  reset-owner@example.com  ';

    // The boundary is code-agnostic and value-agnostic by design: it adds no opinion the
    // layer above could disagree with. `lib/firebase-auth.ts` does the trimming, once.
    await expect(boundary().nativeVerifyPasswordResetCode(OOB_CODE)).resolves.toBe(
      '  reset-owner@example.com  '
    );
  });

  it('lets the SDK’s own failure through unchanged, code and all', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    const err = nativeError('auth/expired-action-code');
    mockNative.verifyError = err;

    // No classification here: a boundary that "helpfully" mapped a code would move policy
    // into the wrong layer and still pass every behavioural case in this file.
    await expect(boundary().nativeVerifyPasswordResetCode(OOB_CODE)).rejects.toBe(err);
  });

  it('★ never touches the credential: the boundary calls no confirming verb for this step', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    await boundary().nativeVerifyPasswordResetCode(OOB_CODE);

    expect(mockConfirmPasswordReset).not.toHaveBeenCalled();
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('★ performs exactly one SDK call for this step, and it is the read-only one (source shape)', () => {
    // A boundary that also reached for a mutating verb here would break the ordering the
    // marker depends on: the marker is written BEFORE the password changes, which means
    // this step must be incapable of changing it. Asserted on the module's own text
    // because "calls exactly this and nothing else" is not a runtime fact.
    const source = readFileSync(join(__dirname, '..', 'lib', 'firebase-native.ts'), 'utf8');
    const start = source.indexOf('export async function nativeVerifyPasswordResetCode');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('\n}', start));

    expect(body).toContain('auth.verifyPasswordResetCode(instance, oobCode)');
    expect(body.match(/auth\.[a-zA-Z]+/g)).toEqual(['auth.verifyPasswordResetCode']);
    // The code is handed straight over: no second call, no stored copy of it.
    expect(body.match(/oobCode/g)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// The classification layer
// ---------------------------------------------------------------------------

describe('N-4 — the classification layer decides what a code’s answer means', () => {
  it('an unconfigured build fails without opening any other door', async () => {
    const outcome = await classification().verifyFirebasePasswordResetCode(OOB_CODE);

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'firebase/not-configured',
      message: 'Sign-in is misconfigured. Contact your administrator.',
    });
    expect(mockNativeLoads).toEqual({ app: 0, auth: 0 });
  });

  it('resolves the account’s address, trimmed', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockNative.verifyResult = '  Reset-Owner@Example.com \n';

    const outcome = await classification().verifyFirebasePasswordResetCode(OOB_CODE);

    expect(outcome).toEqual({ kind: 'verified', email: 'Reset-Owner@Example.com' });
  });

  it('★ answers an unusable code as ORDINARY, with no message and no failure', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);

    for (const code of [
      'auth/invalid-action-code',
      'auth/expired-action-code',
      'auth/user-not-found',
      // The native spelling of the same fact. See the N-3 suite's dedicated case: the
      // native mapping does not normalise `EMAIL_NOT_FOUND` onto `user-not-found`, so a
      // table listing only the JS SDK's spelling would fail on the platform this app
      // ships — here with an unclassified failure for a link that simply needs replacing.
      'auth/email-not-found',
    ]) {
      mockNative.verifyError = nativeError(code);
      const outcome = await classification().verifyFirebasePasswordResetCode(OOB_CODE);
      expect(outcome).toEqual({ kind: 'invalid-code' });
    }
  });

  it('★ refuses an address the identity layer did not actually supply', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);

    for (const value of ['', '   ', undefined, null]) {
      mockNative.verifyResult = value as string | null;
      const outcome = await classification().verifyFirebasePasswordResetCode(OOB_CODE);
      // A blank address would make both consumers wrong at once — the automatic sign-in
      // would have nothing to send, and the fingerprint would be the hash of nothing,
      // which every other empty case would also match.
      expect(outcome).toEqual({
        kind: 'failure',
        code: 'firebase/no-email',
        message: 'Unable to use this reset link. Please try again.',
      });
    }
  });

  it('★ never relays the SDK’s own words for a fault', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockNative.verifyError = nativeError(
      'auth/network-request-failed',
      'Firebase: Error (auth/network-request-failed) at https://project-1234.firebaseapp.com'
    );

    const outcome = await classification().verifyFirebasePasswordResetCode(OOB_CODE);

    // The SHARED table's sentence, not this step's fallback and never the SDK's text:
    // one fault keeps one sentence whichever operation met it, which is the property
    // that lets a person recognize a connection problem in every flow.
    expect(outcome).toEqual({
      kind: 'failure',
      code: 'auth/network-request-failed',
      message: 'Cannot reach the sign-in service. Check your connection and try again.',
    });
    expect(JSON.stringify(outcome)).not.toContain('project-1234');
    expect(JSON.stringify(outcome)).not.toContain('firebaseapp.com');
  });

  it('falls back to this step’s own sentence for a code the shared table does not know', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockNative.verifyError = nativeError('auth/some-future-code', 'Firebase: internal detail 4242');

    const outcome = await classification().verifyFirebasePasswordResetCode(OOB_CODE);

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'auth/some-future-code',
      message: 'Unable to use this reset link. Please try again.',
    });
    expect(JSON.stringify(outcome)).not.toContain('4242');
  });

  it('★ never redeems the code: the confirming verb is not reachable from this step', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    await classification().verifyFirebasePasswordResetCode(OOB_CODE);

    expect(mockConfirmPasswordReset).not.toHaveBeenCalled();
  });
});
