/**
 * N-3 — Firebase-native password recovery, in the two layers that own it.
 *
 * TWO CLAIMS, TESTED WHERE EACH LIVES.
 *
 *   1. THE BOUNDARY (`lib/firebase-native.ts`) performs the SDK calls and nothing else:
 *      it consults the shared gate before a native package is evaluated, it sends the
 *      app's own deep link and package identifiers, it hands the action code straight
 *      through, and it hands nothing back. "Nothing back" is asserted rather than
 *      described, because a reset that returned the new password, the code or a token
 *      would be a credential leaving the layer that exists to confine them.
 *
 *   2. THE CLASSIFICATION (`lib/firebase-auth.ts`) decides what a Firebase failure
 *      MEANS and what a user may read. Two decisions here are security properties rather
 *      than wording, and both are pinned by a case: a missing or disabled account is
 *      reported as SENT (enumeration resistance, the invariant the custom 26B endpoint
 *      was built to hold), and a confirmation failure is NEVER a licence to call the
 *      custom server endpoint.
 *
 * WHAT IS REAL HERE: both modules under test. The two native packages and the shared
 * gate are mocked, and the mock counts its own loads, so "the gate was consulted first"
 * is observed rather than read out of the source. The SDK's own words are checked too:
 * every failure case asserts the sentence a user would see, and the `Error` the fake SDK
 * throws carries text that must never reach it.
 *
 * WHY THE SETTINGS ARE COMPARED TO `app.json`. The deep link is three build-level facts
 * (`expo.scheme`, `android.package`, `ios.bundleIdentifier`) that JavaScript cannot read
 * at runtime, so the boundary declares them. This file is what stops the declaration and
 * the build config from drifting: change the scheme or the package and this suite fails,
 * instead of the app silently mailing a link it cannot receive.
 */

/// <reference types="node" />
//
// The `app.json` drift guard below reads a file as text, which needs `node:fs`,
// `node:path` and `__dirname`; this directive opts THIS file into Node's types and
// nothing else, exactly as the Phase 1 and Phase B suites do for the same reason.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// The mock seam
// ---------------------------------------------------------------------------

/** Counts every evaluation of a native package, so "gated" is observable. */
const mockNativeLoads = { app: 0, auth: 0 };

/** What the fake native layer does next. Set per case, so a case reads as a situation. */
const mockNativeBehaviour: { sendError: unknown; confirmError: unknown } = {
  sendError: null,
  confirmError: null,
};

// Rest parameters rather than none: the fake SDK records whatever the boundary passes,
// and spreading those calls into it is what lets the boundary surface be asserted.
const mockSendPasswordResetEmail = jest.fn(async (..._args: unknown[]): Promise<void> => {
  if (mockNativeBehaviour.sendError) throw mockNativeBehaviour.sendError;
});

const mockConfirmPasswordReset = jest.fn(async (..._args: unknown[]): Promise<void> => {
  if (mockNativeBehaviour.confirmError) throw mockNativeBehaviour.confirmError;
});

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
 * Loaded lazily and through `requireActual`, for the reason the Phase 1 suite records:
 * a top-level import is hoisted above the `jest.mock` factories, so the boundary would
 * evaluate `../lib/config` before `mockIsFirebaseConfigured` exists.
 */
const boundary = (): BoundaryModule => jest.requireActual<BoundaryModule>('../lib/firebase-native');
const classification = (): ClassificationModule =>
  jest.requireActual<ClassificationModule>('../lib/firebase-auth');

/**
 * A Firebase error as the SDK raises it: an object carrying a namespaced `code`. The
 * classification layer reads the code structurally, never with `instanceof`, which is
 * why a plain object is the right stand-in.
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

const APP = JSON.parse(
  readFileSync(join(__dirname, '..', 'app.json'), 'utf8')
) as AppConfig;

/** What `ActionCodeSettings` must contain, derived from the build config rather than restated. */
const EXPECTED_ACTION_CODE_SETTINGS = {
  url: `${APP.expo.scheme[0]}://reset-password`,
  handleCodeInApp: true,
  android: { packageName: APP.expo.android.package, installApp: true },
  iOS: { bundleId: APP.expo.ios.bundleIdentifier },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockNativeLoads.app = 0;
  mockNativeLoads.auth = 0;
  mockNativeBehaviour.sendError = null;
  mockNativeBehaviour.confirmError = null;
  mockIsFirebaseConfigured.mockReturnValue(false);
});

// ---------------------------------------------------------------------------
// The boundary
// ---------------------------------------------------------------------------

describe('N-3 — the native boundary performs the SDK calls', () => {
  it('refuses to send when the gate is off, and loads no native package', async () => {
    // The gate is a property of the build, not a runtime fault: an unconfigured build
    // must not evaluate a native module, and the caller must see a rejection rather
    // than a silent success that claimed mail was sent.
    await expect(boundary().nativeSendPasswordResetEmail('user@example.com')).rejects.toThrow();
    expect(mockNativeLoads).toEqual({ app: 0, auth: 0 });
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('sends the app’s own deep link and package identifiers', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);

    await boundary().nativeSendPasswordResetEmail('user@example.com');

    expect(mockSendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const [instance, email, settings] = mockSendPasswordResetEmail.mock.calls[0] as unknown[];
    // The instance is the mock's own Auth object; what matters is the address and the
    // settings that decide where the emailed link points.
    expect(instance).toEqual({ currentUser: null });
    expect(email).toBe('user@example.com');
    expect(settings).toEqual(EXPECTED_ACTION_CODE_SETTINGS);
  });

  it('fails the build-config drift guard rather than mailing an unreceivable link', () => {
    // The guard's own guard: if the app's scheme stopped being the one the boundary
    // declares, the expectation above would be comparing two copies of the same wrong
    // string. This case makes the derived values visible, so a change to `app.json`
    // shows up here first.
    expect(EXPECTED_ACTION_CODE_SETTINGS.url).toBe('inventoryai://reset-password');
    expect(EXPECTED_ACTION_CODE_SETTINGS.android.packageName).toBe('com.inventoryai.app');
    expect(EXPECTED_ACTION_CODE_SETTINGS.iOS.bundleId).toBe('com.inventoryai.app');
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

  it('never answers with a credential, for either operation', async () => {
    // A reset that returned the code, the new password or a token would defeat the
    // boundary. Both operations are `Promise<void>`, asserted here rather than trusted.
    mockIsFirebaseConfigured.mockReturnValue(true);

    await expect(boundary().nativeSendPasswordResetEmail('user@example.com')).resolves.toBeUndefined();
    await expect(
      boundary().nativeConfirmPasswordReset('oob-code-1', 'a-new-password')
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The classification layer — what a failure means, and what a user may read
// ---------------------------------------------------------------------------

describe('N-3 — the request: Firebase first, the custom flow only when unconfigured', () => {
  it('licenses the custom flow ONLY when this build has no Firebase configuration', async () => {
    mockIsFirebaseConfigured.mockReturnValue(false);

    await expect(classification().sendFirebasePasswordResetEmail('user@example.com')).resolves.toEqual({
      kind: 'legacyFallback',
    });
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('reports a configured send as sent', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);

    await expect(classification().sendFirebasePasswordResetEmail('user@example.com')).resolves.toEqual({
      kind: 'sent',
    });
  });

  it.each(['auth/user-not-found', 'auth/user-disabled'])(
    'reports %s as sent, so a missing or disabled account cannot be discovered',
    async (code) => {
      mockIsFirebaseConfigured.mockReturnValue(true);
      mockNativeBehaviour.sendError = firebaseError(code);

      // The enumeration-resistance invariant, moved into the client. With Firebase's
      // email-enumeration protection OFF these codes identify an address; reporting
      // them as a failure would rebuild the oracle the server's uniform 202 avoids.
      await expect(classification().sendFirebasePasswordResetEmail('user@example.com')).resolves.toEqual({
        kind: 'sent',
      });
    }
  );

  it('also reports the NATIVE spelling `auth/email-not-found` as sent', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockNativeBehaviour.sendError = firebaseError('auth/email-not-found');

    // THE DEFECT THIS CASE PINS, AND IT IS A DEFECT OF ASSUMING NORMALISATION.
    //
    // The Identity Toolkit answers `EMAIL_NOT_FOUND` for an address with no account. The
    // JavaScript SDK maps that onto `auth/user-not-found`, so a list containing only the
    // JS spelling is complete FOR THE JS SDK. The native Android mapping does not map it:
    // it lowercases and de-hyphenates whatever it was given, and its explicit rewrite
    // table has no entry for `EMAIL_NOT_FOUND` — so the native client sees
    // `auth/email-not-found`, a code this module used to have no wording for. That made
    // the send fail with the generic sentence for exactly the accounts that have no
    // Firebase identity (the legacy population), which is simultaneously a wrong message
    // and a rebuilt enumeration oracle, since only a real account would have succeeded.
    //
    // It is asserted as its own case rather than folded into the table above so that the
    // reason survives: a future reader must not "tidy" it away as a duplicate of
    // `user-not-found`, because the two are the same fact only under the JS SDK.
    await expect(classification().sendFirebasePasswordResetEmail('user@example.com')).resolves.toEqual({
      kind: 'sent',
    });
  });

  it('puts a malformed address on the email input, in our own words', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockNativeBehaviour.sendError = firebaseError('auth/invalid-email');

    const outcome = await classification().sendFirebasePasswordResetEmail('not-an-email');

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'auth/invalid-email',
      message: 'Enter a valid email address.',
      field: 'email',
    });
  });

  it.each(['auth/unauthorized-continue-uri', 'auth/invalid-continue-uri'])(
    'names %s as a configuration fault, not as something to retry',
    async (code) => {
      // THE OPEN GATE'S OWN ERROR SURFACE. If this project does not allow the app's
      // custom-scheme continue URL, the send fails with one of these — and that is the
      // one outcome where "please try again" would be wrong advice.
      mockIsFirebaseConfigured.mockReturnValue(true);
      mockNativeBehaviour.sendError = firebaseError(code);

      const outcome = await classification().sendFirebasePasswordResetEmail('user@example.com');

      expect(outcome).toEqual({
        kind: 'failure',
        code,
        message: 'Password reset is not available right now. Contact your administrator.',
      });
    }
  );

  it('never reports a Firebase fault as a legacy fallback', async () => {
    // THE DOWNGRADE GUARD. A configured-but-broken Firebase must not licence the custom
    // endpoint, or anyone who can induce an outage could choose the weaker mail path.
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockNativeBehaviour.sendError = firebaseError('auth/network-request-failed');

    const outcome = await classification().sendFirebasePasswordResetEmail('user@example.com');

    expect(outcome.kind).toBe('failure');
    expect(outcome).toMatchObject({
      message: 'Cannot reach the sign-in service. Check your connection and try again.',
    });
  });

  it('uses its own sentence for a code it has no wording for, never the SDK’s', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockNativeBehaviour.sendError = firebaseError('auth/something-new');

    const outcome = await classification().sendFirebasePasswordResetEmail('user@example.com');

    expect(outcome).toMatchObject({
      kind: 'failure',
      message: 'Unable to send the reset link. Please try again.',
    });
    expect(JSON.stringify(outcome)).not.toContain('Firebase: Error');
  });
});

describe('N-3 — the confirmation: an action code is a Firebase credential only', () => {
  it('reports a redeemed code as reset', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);

    await expect(
      classification().confirmFirebasePasswordReset({ oobCode: 'oob-code-1', newPassword: 'a-new-password' })
    ).resolves.toEqual({ kind: 'reset' });
  });

  it.each(['auth/invalid-action-code', 'auth/expired-action-code', 'auth/user-not-found'])(
    'collapses %s into one unusable-link state',
    async (code) => {
      mockIsFirebaseConfigured.mockReturnValue(true);
      mockNativeBehaviour.confirmError = firebaseError(code);

      // `user-not-found` belongs here rather than with the request's indistinguishable
      // codes: at this point the person is holding a code, so the link is unusable and
      // the remedy is a new one. `email-not-found` is listed alongside it for the same
      // native-spelling reason the request path lists it.
      await expect(
        classification().confirmFirebasePasswordReset({ oobCode: 'oob-code-1', newPassword: 'a-new-password' })
      ).resolves.toEqual({ kind: 'invalid-code' });
    }
  );

  it('collapses the native spelling `auth/email-not-found` into that same unusable-link state', async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockNativeBehaviour.confirmError = firebaseError('auth/email-not-found');

    // The two steps must agree about which links are dead: a code that reads as `sent`
    // when the link is requested cannot read as an unclassified failure when the same
    // link is opened.
    await expect(
      classification().confirmFirebasePasswordReset({ oobCode: 'oob-code-1', newPassword: 'a-new-password' })
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

    // A password the SDK rejects is not a spent link: telling the person to request a
    // new one would send them to the wrong remedy.
    expect(outcome).toMatchObject({
      kind: 'failure',
      code: 'auth/weak-password',
      message: 'Choose a password with at least 6 characters.',
    });
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
    // THE STRUCTURAL FORM OF "NO FALLBACK". The classification layer cannot call the
    // custom reset endpoint because it does not import the API module at all — so a
    // future branch that tried to would have to add an import first.
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
    // A behaviour test runs in ONE value of `__DEV__`, so the production half of the
    // claim is asserted where it lives. The user's sentence may not change in a release
    // bundle, which it cannot if the extra element is never rendered there.
    const code = codeOf(read('app/forgot-password.tsx'));

    expect(code).toMatch(/__DEV__ && diagnostic/);
  });

  it('keeps the native packages confined to the boundary', () => {
    // The Phase 1 and Phase D suites walk the whole tree for this; repeating it here is
    // what makes the claim local to the phase that added two SDK verbs, rather than
    // something a reader has to know to go looking for.
    for (const rel of ['app/forgot-password.tsx', 'app/reset-password.tsx', 'lib/firebase-auth.ts']) {
      expect(read(rel)).not.toMatch(/@react-native-firebase/);
    }
  });
});
