/**
 * N-3 — Firebase-native password recovery, in the two layers that own what is LEFT of it.
 *
 * AUTH-06 REMOVED THE SENDING HALF (2026-10-20), and this suite changed with it rather than
 * being deleted, because the remaining half still holds a credential and still makes a
 * decision that is a security property rather than a wording.
 *
 *   1. THE BOUNDARY (`lib/firebase-native.ts`) performs the SDK call and nothing else: it
 *      consults the shared gate before a native package is evaluated, it hands the action
 *      code straight through, and it hands nothing back. "Nothing back" is asserted rather
 *      than described, because a reset that returned the new password, the code or a token
 *      would be a credential leaving the layer that exists to confine them.
 *
 *   2. THE CLASSIFICATION (`lib/firebase-auth.ts`) decides what a Firebase failure MEANS and
 *      what a user may read. The decision pinned here is that a confirmation failure is NEVER
 *      a licence to call the custom server endpoint.
 *
 * WHAT IS NO LONGER TESTED HERE, AND WHERE IT WENT. The request half — Firebase first, the
 * custom endpoint only on an unconfigured build, `auth/user-not-found` answered as sent, no
 * second attempt on any failure — described a capability that no longer exists. The app does
 * not ask Firebase to mail a reset link at all; the SERVER mints a six-digit code and mails it
 * through Brevo (AUTH-06), and the flow's enumeration resistance and cooldown live in
 * `server/test/AUTH06-*`. A client-side retry that delivered two emails for one request went
 * with the request that made it possible. Its replacement guard is at the bottom of this file:
 * the module must not grow a sender back, and the forgot-password screen must not reach
 * Firebase at all.
 *
 * WHAT IS REAL HERE: both modules under test. The two native packages and the shared gate are
 * mocked, and the mock counts its own loads, so "the gate was consulted first" is observed
 * rather than read out of the source. The SDK's own words are checked too: every failure case
 * asserts the sentence a user would see, and the `Error` the fake SDK throws carries text that
 * must never reach it.
 *
 * WHY THE SCHEME IS COMPARED TO `app.json`. The deep link is two build-level facts
 * (`expo.scheme` and the server page's own constant) that JavaScript cannot reconcile at
 * runtime, so this file is what stops the declaration and the build config from drifting:
 * change the scheme and this suite fails, instead of every already-mailed link becoming a dead
 * end that nobody notices until someone tries to recover an account.
 */

/// <reference types="node" />
//
// The drift guard below reads files as text, which needs `node:fs`, `node:path` and
// `__dirname`; this directive opts THIS file into Node's types and nothing else, exactly as
// the Phase 1 and Phase B suites do for the same reason.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// The mock seam
// ---------------------------------------------------------------------------

/** Counts every evaluation of a native package, so "gated" is observable. */
const mockNativeLoads = { app: 0, auth: 0 };

/** What the fake SDK does next. Set per case, so a case reads as a situation. */
const mockNativeBehaviour: { confirmError: unknown } = { confirmError: null };

const mockConfirmPasswordReset = jest.fn(async (..._args: unknown[]): Promise<void> => {
  if (mockNativeBehaviour.confirmError) throw mockNativeBehaviour.confirmError;
});

jest.mock('@react-native-firebase/app', () => {
  mockNativeLoads.app += 1;
  return { getApp: () => ({ name: '[DEFAULT]' }) };
});

jest.mock('@react-native-firebase/auth', () => {
  mockNativeLoads.auth += 1;
  // `sendPasswordResetEmail` is deliberately ABSENT rather than present and unused: the
  // boundary no longer reaches it, and a fake that offers it would let a reintroduced call
  // pass unnoticed.
  return {
    getAuth: () => ({ currentUser: null }),
    confirmPasswordReset: (...args: unknown[]) => mockConfirmPasswordReset(...args),
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
 * Loaded lazily and through `requireActual`, for the reason the Phase 1 suite records: a
 * top-level import is hoisted above the `jest.mock` factories, so the boundary would evaluate
 * `../lib/config` before `mockIsFirebaseConfigured` exists.
 */
const boundary = (): BoundaryModule => jest.requireActual<BoundaryModule>('../lib/firebase-native');
const classification = (): ClassificationModule =>
  jest.requireActual<ClassificationModule>('../lib/firebase-auth');

/**
 * A Firebase error as the SDK raises it: an object carrying a namespaced `code`. The
 * classification layer reads the code structurally, never with `instanceof`, which is why a
 * plain object is the right stand-in.
 */
function firebaseError(code: string): Error {
  return Object.assign(new Error(`Firebase: Error (${code}).`), { code });
}

// ---------------------------------------------------------------------------
// The build config the declared deep link must match
// ---------------------------------------------------------------------------

type AppConfig = {
  expo: {
    scheme: string[];
    android: { package: string };
    ios: { bundleIdentifier: string };
  };
};

const APP = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8')) as AppConfig;

/**
 * The server page an already-mailed link lands on (AUTH-05, 2026-10-20).
 *
 * Read as TEXT rather than imported: it is a server module (`node:crypto`, `process`), it is
 * compiled by a different tsconfig, and importing it here would test the server from the app.
 * What has to agree between the two sides is one string, so one string is read.
 */
const SERVER_RESET_PAGE = readFileSync(
  join(__dirname, '..', '..', 'server', 'src', 'pages', 'resetPasswordLink.ts'),
  'utf8'
);

beforeEach(() => {
  jest.clearAllMocks();
  mockNativeLoads.app = 0;
  mockNativeLoads.auth = 0;
  mockNativeBehaviour.confirmError = null;
  mockIsFirebaseConfigured.mockReturnValue(false);
});

// ---------------------------------------------------------------------------
// The boundary
// ---------------------------------------------------------------------------

describe('N-3 — the native boundary redeems the code and nothing more', () => {
  it('refuses to redeem when the gate is off, and loads no native package', async () => {
    // The gate is a property of the build, not a runtime fault: an unconfigured build must
    // not evaluate a native module, and the caller must see a rejection rather than a silent
    // success that claimed a credential had been replaced.
    await expect(
      boundary().nativeConfirmPasswordReset('oob-code-1', 'a-new-password')
    ).rejects.toThrow();
    expect(mockNativeLoads).toEqual({ app: 0, auth: 0 });
    expect(mockConfirmPasswordReset).not.toHaveBeenCalled();
  });

  it('★ agrees with the server page on the scheme, so an emailed link can still open the app', () => {
    // THE DRIFT THIS FEATURE CAN ACTUALLY SUFFER. A link sent before AUTH-06 still reaches
    // the app through a page on the server, which hardcodes
    // `inventoryai://reset-password`; `app.json` declares the scheme the app can actually
    // receive. If one moves without the other, those links are dead ends. Neither file is
    // imported here: two strings are compared.
    expect(APP.expo.scheme).toEqual(['inventoryai']);

    const declared = SERVER_RESET_PAGE.match(/const APP_RESET_DEEP_LINK = '([^']+)'/);
    expect(declared).not.toBeNull();
    expect(declared![1]).toBe(`${APP.expo.scheme[0]}://reset-password`);
  });

  it('hands the code and the new password to the SDK and returns nothing', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);

    await expect(
      boundary().nativeConfirmPasswordReset('oob-code-1', 'a-new-password')
    ).resolves.toBeUndefined();

    expect(mockConfirmPasswordReset).toHaveBeenCalledTimes(1);
    const [instance, code, newPassword] = mockConfirmPasswordReset.mock.calls[0] as unknown[];
    expect(instance).toEqual({ currentUser: null });
    expect(code).toBe('oob-code-1');
    expect(newPassword).toBe('a-new-password');
  });
});

// ---------------------------------------------------------------------------
// The classification layer — what a failure means, and what a user may read
// ---------------------------------------------------------------------------

describe('N-3 — the confirmation: an action code is a Firebase credential only', () => {
  it('reports a redeemed code as reset', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);

    await expect(
      classification().confirmFirebasePasswordReset({
        oobCode: 'oob-code-1',
        newPassword: 'a-new-password',
      })
    ).resolves.toEqual({ kind: 'reset' });
  });

  it.each(['auth/invalid-action-code', 'auth/expired-action-code', 'auth/user-not-found'])(
    'collapses %s into one unusable-link state',
    async (code) => {
      mockIsFirebaseConfigured.mockReturnValue(true);
      mockNativeBehaviour.confirmError = firebaseError(code);

      // At this point the person is holding a code, so the link is unusable and the remedy is
      // a new one. `user-not-found` belongs here rather than among a request path's
      // indistinguishable codes: the question is no longer "does this address have an account"
      // but "can this code be redeemed", and the answer is no.
      await expect(
        classification().confirmFirebasePasswordReset({
          oobCode: 'oob-code-1',
          newPassword: 'a-new-password',
        })
      ).resolves.toEqual({ kind: 'invalid-code' });
    }
  );

  it('collapses the native spelling `auth/email-not-found` into that same unusable-link state', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockNativeBehaviour.confirmError = firebaseError('auth/email-not-found');

    // The Identity Toolkit answers `EMAIL_NOT_FOUND` for an address with no account. The
    // JavaScript SDK normalises that onto `user-not-found`; the NATIVE Android mapping
    // lowercases and de-hyphenates what it was given and does not rewrite it, so the native
    // client sees `auth/email-not-found`. Listing one spelling and not the other would turn a
    // spent link into an unclassified failure — the same "assumed normalisation" defect the
    // request half used to have, now only able to affect redemption.
    await expect(
      classification().confirmFirebasePasswordReset({
        oobCode: 'oob-code-1',
        newPassword: 'a-new-password',
      })
    ).resolves.toEqual({ kind: 'invalid-code' });
  });

  it('fails when the build has no Firebase, without touching anything else', async () => {
    mockIsFirebaseConfigured.mockReturnValue(false);

    const outcome = await classification().confirmFirebasePasswordReset({
      oobCode: 'oob-code-1',
      newPassword: 'a-new-password',
    });

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'firebase/not-configured',
      message: 'Sign-in is misconfigured. Contact your administrator.',
    });
    expect(mockConfirmPasswordReset).not.toHaveBeenCalled();
  });

  it('keeps a policy failure separate from an unusable link', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockNativeBehaviour.confirmError = firebaseError('auth/weak-password');

    const outcome = await classification().confirmFirebasePasswordReset({
      oobCode: 'oob-code-1',
      newPassword: 'short',
    });

    // A password the SDK rejects is not a spent link: telling the person to request a new one
    // would send them to the wrong remedy.
    expect(outcome).toMatchObject({
      kind: 'failure',
      code: 'auth/weak-password',
      message: 'Choose a password with at least 6 characters.',
    });
  });

  it('uses its own sentence for a code it has no wording for, never the SDK’s', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockNativeBehaviour.confirmError = firebaseError('auth/something-new');

    const outcome = await classification().confirmFirebasePasswordReset({
      oobCode: 'oob-code-1',
      newPassword: 'a-new-password',
    });

    expect(outcome).toMatchObject({
      kind: 'failure',
      message: 'Unable to reset the password. Please try again.',
    });
    expect(JSON.stringify(outcome)).not.toContain('Firebase: Error');
  });
});

// ---------------------------------------------------------------------------
// Source guards — the claims a behaviour test cannot see
// ---------------------------------------------------------------------------

describe('N-3 — where the policy must NOT live', () => {
  const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

  /** Comments stripped, so a file's own explanations cannot satisfy a guard. */
  const codeOf = (source: string): string =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join('\n');

  it('lets a confirmation failure reach no server endpoint', () => {
    // THE STRUCTURAL FORM OF "NO FALLBACK". The classification layer cannot call the custom
    // reset endpoint because it does not import the API module at all — so a future branch
    // that tried to would have to add an import first.
    const code = codeOf(read('lib/firebase-auth.ts'));

    expect(code).not.toMatch(/from '\.\/api'/);
    expect(code).not.toMatch(/resetPassword\(/);
  });

  it('holds the action code in no module-level state', () => {
    // The boundary passes the code through; nothing named for it may be assigned.
    const code = codeOf(read('lib/firebase-native.ts'));

    expect(code).not.toMatch(/let\s+\w*[oO]obCode/);
    expect(code).not.toMatch(/=\s*undefined;[\s\S]*[oO]obCode/);
  });

  it('logs nothing, so a code or a password has nowhere to be printed', () => {
    for (const rel of ['lib/firebase-native.ts', 'lib/firebase-auth.ts']) {
      const code = codeOf(read(rel));
      expect(code).not.toMatch(/console\./);
      expect(code).not.toMatch(/console\b/);
    }
  });

  it('renders the request-failure diagnostic only under `__DEV__`', () => {
    // A behaviour test runs in ONE value of `__DEV__`, so the production half of the claim is
    // asserted where it lives. The user's sentence may not change in a release bundle, which
    // it cannot if the extra element is never rendered there.
    const code = codeOf(read('app/forgot-password.tsx'));

    expect(code).toMatch(/__DEV__ && diagnostic/);
  });

  it('keeps the native packages confined to the boundary', () => {
    // The Phase 1 and Phase D suites walk the whole tree for this; repeating it here is what
    // makes the claim local to the phase that added the SDK verbs a reader has to go looking
    // for.
    for (const rel of ['app/forgot-password.tsx', 'app/reset-password.tsx', 'lib/firebase-auth.ts']) {
      expect(read(rel)).not.toMatch(/@react-native-firebase/);
    }
  });

  it('★ has NO sender any more, and the screen that asks for a code does not reach Firebase', () => {
    // AUTH-06, PINNED RATHER THAN LEFT TO MEMORY. The removal is what makes the request path
    // one route with one mail provider; a reintroduced sender would restore a second, weaker
    // path that mails a browser form and revokes nothing. Both halves are asserted because
    // either one alone can be satisfied while the other is wrong: the module could keep an
    // unused export, or the screen could reach the SDK directly.
    const classificationCode = codeOf(read('lib/firebase-auth.ts'));
    const nativeCode = codeOf(read('lib/firebase-native.ts'));
    const forgotScreen = codeOf(read('app/forgot-password.tsx'));

    expect(classificationCode).not.toMatch(/sendFirebasePasswordResetEmail/);
    expect(nativeCode).not.toMatch(/sendPasswordResetEmail/);
    expect(forgotScreen).not.toMatch(/firebase/i);
    expect(forgotScreen).toMatch(/requestPasswordResetCode/);
  });
});
