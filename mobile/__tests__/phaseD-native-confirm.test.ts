/**
 * Phase D — the confirmation migration, viewed from the BOUNDARY.
 *
 * WHAT THIS FILE EXISTS TO PIN, and why each claim would be silent if it broke:
 *
 * 1. BOTH CONFIRMATION METHODS AUTHENTICATE NATIVELY. Until Phase D the password method
 *    called the JavaScript SDK directly and the Google method ran authorization-code +
 *    PKCE in the system browser. Both now go through `lib/firebase-native.ts` — the same
 *    two functions the sign-in paths use — and this file asserts the CALL, so a change
 *    that quietly re-pointed either one back at the SDK fails here.
 *
 * 2. THE BROWSER MECHANISM IS GONE (Phase F1). This file used to model `expo-auth-session`
 *    and assert, negatively, that neither method touched a browser seam — the claim that
 *    kept the retained `acquireGoogleIdToken` helper provably unreachable. Phase F1 deleted
 *    that helper, its constants, `googleRedirectUri()` and the `expo-auth-session` import,
 *    so there is no seam left to assert against and nothing to model. The claim is now made
 *    once, structurally, in `phaseF1-retired-dependency-guard.test.ts`.
 *
 * 3. THE OUTCOME CONTRACT IS UNCHANGED. `ConfirmSignInOutcome` still has exactly four
 *    members, `wrong-method` is still password-only, and every failure still carries this
 *    module's own sentence rather than the SDK's or the native library's.
 *
 * 4. THE LAST JAVASCRIPT-SDK REFERENCE IS GONE. Two source guards assert it structurally,
 *    because an import reappearing is invisible in behaviour until it is too late: the
 *    module must not import `firebase/auth`, must not reach `lib/firebase`'s accessor, and
 *    must never substitute `reauthenticateWithCredential` or `getIdToken(true)` for a real
 *    authentication — the second would move `iat` and leave `auth_time` alone, and the
 *    server's 300-second rule would refuse the token with a 409 the client could not
 *    explain. (Phase F1 removed `lib/firebase.ts` itself, so the accessor guard is now
 *    guarding against a module that no longer exists — kept as forward defence.)
 *
 * MEASURED FINDING RECORDED HERE (Phase D experiment). The project has Firebase email
 * enumeration protection ON: a read-only probe of `accounts:signInWithPassword` answered
 * `INVALID_LOGIN_CREDENTIALS` both for an address with no Firebase identity and for a wrong
 * password on one that has, while a malformed address still answered `INVALID_EMAIL`. So
 * the collapsed code is what arrives natively in both cases, and `auth/user-not-found` — the
 * single code that maps to `wrong-method` — is not produced by this project. The case below
 * pins the CONTRACT (`user-not-found` in, `wrong-method` out) because the contract is what
 * must not drift; the reachability consequence is a UX note, not a security one, and it is
 * identical before and after Phase D.
 *
 * THE BOUNDARY IS MOCKED, AND IT HAS TO BE: the real native modules cannot be loaded under
 * this Jest configuration. `lib/firebase-auth.ts` is NOT mocked, so every branch, message
 * and code asserted below is the shipped one.
 */

import { confirmFirebaseSignIn, signInWithGoogle } from '../lib/firebase-auth';

const mockNativeSignInWithEmail = jest.fn();
const mockNativeSignInWithGoogle = jest.fn();
const mockIsNativeFirebaseConfigured = jest.fn(() => true);
const mockIsNativeGoogleConfigured = jest.fn(() => true);

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMAIL = 'owner@example.com';
const PASSWORD = 'Password123!';
const ID_TOKEN = 'firebase.id.token';

const MISCONFIGURED = 'Sign-in is misconfigured. Contact your administrator.';
const CONFIRM_FAILED = 'We could not confirm your sign-in. Please try again.';
const CONFIRM_PASSWORD =
  'That did not confirm this account. Check your sign-in password, or choose Confirm with Google.';

/** The native text a real failure carries — names the certificate and the app. */
const NATIVE_TEXT = 'DEVELOPER_ERROR: SHA-1 mismatch for com.inventoryai.app';

const nativeError = (code: string) => Object.assign(new Error(NATIVE_TEXT), { code });

beforeEach(() => {
  jest.clearAllMocks();
  mockIsNativeFirebaseConfigured.mockReturnValue(true);
  mockIsNativeGoogleConfigured.mockReturnValue(true);
  mockNativeSignInWithEmail.mockResolvedValue({ idToken: ID_TOKEN });
  mockNativeSignInWithGoogle.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });
});

// ---------------------------------------------------------------------------
// The password method
// ---------------------------------------------------------------------------

describe('Phase D — password confirmation runs on the native boundary', () => {
  it('authenticates with the account’s own email and password, and returns only the token', async () => {
    const outcome = await confirmFirebaseSignIn({ method: 'password', email: EMAIL, password: PASSWORD });

    // TWO ARGUMENTS. The Auth instance is the boundary's business now, and the EMAIL is the
    // account's own — supplied by the screen from `user.email` and never typed, which is the
    // invariant that stops a confirmation authenticating a different identity into the
    // durable native store.
    expect(mockNativeSignInWithEmail).toHaveBeenCalledWith(EMAIL, PASSWORD);
    expect(mockNativeSignInWithEmail).toHaveBeenCalledTimes(1);
    // The token is the whole contract — no User, no uid, no providerData, no credential.
    expect(outcome).toEqual({ kind: 'idToken', idToken: ID_TOKEN });
  });

  it('keeps the unambiguous "no password identity here" as wrong-method', async () => {
    mockNativeSignInWithEmail.mockRejectedValue(nativeError('auth/user-not-found'));

    const outcome = await confirmFirebaseSignIn({ method: 'password', email: EMAIL, password: PASSWORD });

    // The remedy is the other option, so this is a STATE and not a failure: it carries no
    // message because the sentence belongs to the screen. See the header for the measured
    // reachability note — the contract is what this case protects.
    expect(outcome).toEqual({ kind: 'wrong-method' });
  });

  it('does NOT call a typo the wrong method, because it cannot tell the two apart', async () => {
    mockNativeSignInWithEmail.mockRejectedValue(nativeError('auth/invalid-credential'));

    const outcome = await confirmFirebaseSignIn({ method: 'password', email: EMAIL, password: PASSWORD });

    expect(outcome).toEqual({ kind: 'failure', code: 'auth/invalid-credential', message: CONFIRM_PASSWORD });
  });

  it('never relays the native or SDK text, which names the certificate and the app', async () => {
    mockNativeSignInWithEmail.mockRejectedValue(nativeError('auth/invalid-api-key'));

    const outcome = await confirmFirebaseSignIn({ method: 'password', email: EMAIL, password: PASSWORD });

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'auth/invalid-api-key',
      message: MISCONFIGURED,
    });
    expect((outcome as { message: string }).message).not.toContain('DEVELOPER_ERROR');
    expect((outcome as { message: string }).message).not.toContain('com.inventoryai.app');
  });

  it('refuses at the gate when the build has no Firebase configuration', async () => {
    mockIsNativeFirebaseConfigured.mockReturnValue(false);

    const outcome = await confirmFirebaseSignIn({ method: 'password', email: EMAIL, password: PASSWORD });

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'firebase/not-configured',
      message: MISCONFIGURED,
    });
    expect(mockNativeSignInWithEmail).not.toHaveBeenCalled();
  });

  it('answers a missing email without reaching the boundary', async () => {
    const outcome = await confirmFirebaseSignIn({ method: 'password', password: PASSWORD });

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'firebase/confirm-missing-email',
      message: CONFIRM_FAILED,
    });
    expect(mockNativeSignInWithEmail).not.toHaveBeenCalled();
  });

  it('has no legacy door: never answers with a fallback kind, for any code', async () => {
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
      mockNativeSignInWithEmail.mockRejectedValue(nativeError(code));
      const outcome = await confirmFirebaseSignIn({ method: 'password', email: EMAIL, password: PASSWORD });
      // The union has no `legacyFallback` member at all, so this is structural — but
      // asserting it per code also proves no branch invents one by accident.
      expect(['idToken', 'cancelled', 'wrong-method', 'failure']).toContain(outcome.kind);
    }
  });
});

// ---------------------------------------------------------------------------
// The Google method
// ---------------------------------------------------------------------------

describe('Phase D — Google confirmation runs on the native boundary', () => {
  it('authenticates natively and returns only the Firebase token', async () => {
    const outcome = await confirmFirebaseSignIn({ method: 'google', email: EMAIL });

    expect(mockNativeSignInWithGoogle).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ kind: 'idToken', idToken: ID_TOKEN });
  });

  it('reports a closed sheet as cancelled rather than as a fault', async () => {
    mockNativeSignInWithGoogle.mockResolvedValue({ kind: 'cancelled' });

    expect(await confirmFirebaseSignIn({ method: 'google' })).toEqual({ kind: 'cancelled' });
  });

  it('keeps the native code for the operator and shows the confirmation sentence', async () => {
    mockNativeSignInWithGoogle.mockRejectedValue(nativeError('google/play-services-unavailable'));

    const outcome = await confirmFirebaseSignIn({ method: 'google', email: EMAIL });

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'google/play-services-unavailable',
      message: CONFIRM_FAILED,
    });
    expect((outcome as { message: string }).message).not.toContain('DEVELOPER_ERROR');
  });

  it('refuses at the gate when this build cannot do native Google', async () => {
    mockIsNativeGoogleConfigured.mockReturnValue(false);

    const outcome = await confirmFirebaseSignIn({ method: 'google', email: EMAIL });

    expect(outcome).toEqual({
      kind: 'failure',
      code: 'google/not-configured',
      message: 'Google sign-in is not configured for this build. Contact your administrator.',
    });
    expect(mockNativeSignInWithGoogle).not.toHaveBeenCalled();
  });

  it('keeps the SIGN-IN path on the same boundary, so both Google operations match', async () => {
    // The confirmation and the sign-in must not drift apart: Phase C moved one and Phase D
    // the other, and this is the case that says they ended up in the same place.
    const outcome = await signInWithGoogle();

    expect(mockNativeSignInWithGoogle).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ kind: 'idToken', idToken: ID_TOKEN });
  });
});

// ---------------------------------------------------------------------------
// Source guards — the claims a behaviour test cannot see
// ---------------------------------------------------------------------------

describe('Phase D — the module’s shape, pinned in source', () => {
  const fs = jest.requireActual('fs');
  const read = (rel: string): string => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');

  /** Comments stripped, so a file's own explanations cannot satisfy or trip a guard. */
  const codeOf = (source: string): string =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line: string) => !/^\s*(\/\/|\*)/.test(line))
      .join('\n');

  it('imports no JavaScript Firebase SDK, and reaches no accessor that would', () => {
    const source = read('lib/firebase-auth.ts');
    const code = codeOf(source);

    // THE GUARD'S OWN GUARD: an empty or mis-pathed read would make every `not.toMatch`
    // below pass for the wrong reason.
    expect(source.length).toBeGreaterThan(1000);
    expect(code).toMatch(/nativeSignInWithGoogle\(\)/);
    expect(code).toMatch(/nativeSignInWithEmail\(email,\s*password/);

    expect(code).not.toMatch(/from 'firebase\/auth'/);
    expect(code).not.toMatch(/from 'firebase\/app'/);
    expect(code).not.toMatch(/getFirebaseAuth\(/);
  });

  it('never substitutes a reauthentication shortcut for a real authentication', () => {
    const code = codeOf(read('lib/firebase-auth.ts'));

    // Both rejections are decisions that would be invisible in a diff. A
    // `reauthenticateWithCredential` cannot run after a cold start, and `getIdToken(true)`
    // moves `iat` while leaving `auth_time` alone — the server would refuse the token with a
    // 409 the client could not explain.
    expect(code).not.toMatch(/reauthenticateWith/);
    expect(code).not.toMatch(/getIdToken\(\s*true\s*\)/);
  });

  it('keeps the native packages confined to the one boundary module', () => {
    const walk = (dir: string): string[] => {
      const entries: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) entries.push(...walk(full));
        else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) entries.push(full);
      }
      return entries;
    };

    const owning = ['lib/firebase-native.ts'];
    const offenders = walk(`${__dirname}/..`)
      .filter((file) => !file.includes('node_modules'))
      .filter((file) => !file.includes('__tests__'))
      .filter((file) => /@react-native-firebase\/|@react-native-google-signin\//.test(fs.readFileSync(file, 'utf8')))
      .map((file) => file.split(/[\\/]/).slice(-2).join('/'))
      .filter((file) => !owning.includes(file));

    expect(offenders).toEqual([]);
  });

  it('logs nothing, so a token has nowhere to be printed', () => {
    const code = codeOf(read('lib/firebase-auth.ts'));

    expect(code).not.toMatch(/console\./);
    expect(code).not.toMatch(/console\b/);
  });

  it('takes the password-confirmation email from the authenticated session, never from input', () => {
    // THE DURABLE-PERSISTENCE INVARIANT, pinned where it can be seen. The screen must not
    // offer an editable email for a confirmation; the address it sends is the account's own.
    const screen = codeOf(read('app/(app)/disconnect-firebase.tsx'));

    expect(screen).toMatch(/const email = user\?\.email;/);
    expect(screen).not.toMatch(/setEmail/);
  });
});
