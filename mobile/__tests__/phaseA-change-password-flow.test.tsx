/**
 * Phase A (F-1) — the Firebase CREDENTIAL-CHANGE orchestration in 'lib/auth.tsx'.
 *
 * THE PHASE'S SECURITY PROPERTY IS AN ORDERING AND AN ABSENCE, not a value. What is
 * asserted here is that the credential change runs BEFORE the bridge that records it,
 * that the app's own session is never the one the bridge destroys, and — the claim the
 * whole phase exists for — that NOTHING in this flow detaches the account's Firebase
 * identity, so the mapping the server resolves is the same one it had before.
 *
 * WHAT IS REAL HERE: 'AuthProvider', its boot restore, 'applySession', 'persistToken',
 * and the whole 'changeFirebasePassword' call graph. Only the module boundaries are
 * mocked — the Firebase module, the native boundary, the API layer and SecureStore. The
 * server is a mock, so this file proves the CLIENT's contract against the shipped server
 * sequence; the server's own behaviour, and the guarantee that no source path can clear
 * the identity, are owned by 'server/test/phaseA-credential-authority.test.mjs'.
 *
 * WHAT CANNOT BE PROVEN HERE, AND IS NOT CLAIMED. There is no live Firebase project in
 * this environment, so 'the new password signs in' and 'the old one no longer does' are
 * Firebase's own outcomes. What is pinned instead is the client half that makes them
 * true: the native 'updatePassword' is called with the new password and only the new
 * password, and the verified identity presented after the change is the SAME one
 * presented before it, so the exchange cannot resolve a different account.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '../lib/client';
import { AuthProvider, useSession } from '../lib/auth';

// ---------------------------------------------------------------------------
// The mock seam
// ---------------------------------------------------------------------------

const mockSignInWithEmail = jest.fn();
const mockCurrentFirebaseIdToken = jest.fn();
const mockConfirmFirebaseSignIn = jest.fn();
const mockSignOutOfFirebase = jest.fn();
const mockIsFirebaseConfigured = jest.fn(() => true);

jest.mock('../lib/firebase-auth', () => ({
  // A real class, so 'instanceof' in the provider's own code and in these assertions
  // both mean something.
  FirebaseAuthError: class FirebaseAuthError extends Error {
    code: string | null;

    constructor(code: string | null, message: string) {
      super(message);
      this.name = 'FirebaseAuthError';
      this.code = code;
    }
  },
  signInWithEmail: (...args: unknown[]) => mockSignInWithEmail(...args),
  signInWithGoogle: jest.fn(),
  ensureFirebaseAccount: jest.fn(),
  signOutOfFirebase: (...args: unknown[]) => mockSignOutOfFirebase(...args),
  currentFirebaseIdToken: (...args: unknown[]) => mockCurrentFirebaseIdToken(...args),
  confirmFirebaseSignIn: (...args: unknown[]) => mockConfirmFirebaseSignIn(...args),
}));

const mockFirebaseExchange = jest.fn();
const mockCredentialsChanged = jest.fn();
const mockFirebaseRegister = jest.fn();
const mockLogin = jest.fn();
const mockLogout = jest.fn();
const mockMe = jest.fn();

jest.mock('../lib/api', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  firebaseExchange: (...args: unknown[]) => mockFirebaseExchange(...args),
  credentialsChanged: (...args: unknown[]) => mockCredentialsChanged(...args),
  firebaseRegister: (...args: unknown[]) => mockFirebaseRegister(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
  me: (...args: unknown[]) => mockMe(...args),
  register: jest.fn(),
}));

/**
 * The native boundary. 'nativeUpdatePassword' is the operation Phase A added, and it is
 * the ONLY thing in this flow that touches a credential — so it is also the only seam
 * that can prove what was sent to it.
 */
const mockNativeUpdatePassword = jest.fn();

jest.mock('../lib/firebase-native', () => ({
  nativeUpdatePassword: (...args: unknown[]) => mockNativeUpdatePassword(...args),
  nativeForceIdToken: jest.fn(async () => 'forced.firebase.id.token'),
  nativeReloadUser: jest.fn(async () => true),
  nativeSendEmailVerification: jest.fn(async () => {}),
}));

jest.mock('../lib/config', () => ({
  isFirebaseConfigured: () => mockIsFirebaseConfigured(),
}));

/** The token writer, typed by its two arguments: (storage key, token). */
const mockPersistToken = jest.fn(async (_key: string, _token: string) => {});

jest.mock('expo-secure-store', () => ({
  setItemAsync: (key: string, token: string) => mockPersistToken(key, token),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMAIL = 'owner@example.com';
const PASSWORD = 'Password123!';
const NEW_PASSWORD = 'BrandNewPass1!';
const ID_TOKEN = 'fake.id.token';
const CONFIRMED_TOKEN = 'confirmed.id.token';
const TEMP_APP_TOKEN = 'inventory-ai.temporary.jwt';
const FINAL_APP_TOKEN = 'inventory-ai.final.jwt';

/** A Firebase-linked account: its password lives at Firebase, so 'password' is false. */
const USER = {
  id: 'u1',
  name: 'Ada',
  email: EMAIL,
  role: 'OWNER' as const,
  status: 'ACTIVE' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  authMethods: { password: false, firebase: true },
};

const TEMP_SESSION = { token: TEMP_APP_TOKEN, tokenType: 'Bearer', expiresIn: '1d', user: USER };
const FINAL_SESSION = { token: FINAL_APP_TOKEN, tokenType: 'Bearer', expiresIn: '1d', user: USER };

const CHANGE_INPUT = {
  method: 'password' as const,
  email: EMAIL,
  password: PASSWORD,
  newPassword: NEW_PASSWORD,
};

/** The two recency refusals, built with the real ApiError the client uses. */
const reauthRequired = () =>
  new ApiError(409, 'FIREBASE_REAUTHENTICATION_REQUIRED', 'Please confirm your sign-in again.');
const conflict = () =>
  new ApiError(409, 'FIREBASE_IDENTITY_CONFLICT', 'This sign-in cannot be connected.');

/** The shape Firebase throws when the credential is too old to change (native mapping). */
function nativeRecencyError(): Error {
  const err = new Error('This operation is sensitive and requires recent authentication.');
  err.name = 'NativeFirebaseError';
  (err as { code?: string }).code = 'auth/requires-recent-login';
  return err;
}

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

/**
 * A mounted provider, settled into 'signedIn' through the Firebase path.
 *
 * SIGNING IN CONSUMES AN EXCHANGE AND PERSISTS A TOKEN OF ITS OWN, so both seams are
 * settled again afterwards: the token writer's calls are cleared, and the exchange queue
 * is replaced with the change flow's own two answers. Without that, a case asserting
 * 'exactly one exchange' or 'exactly one persist' would be counting the sign-in's.
 */
async function mountSignedIn() {
  mockSignInWithEmail.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });
  const view = await renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
  await act(async () => {
    await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
  });
  await waitFor(() => expect(view.result.current.status).toBe('signedIn'));

  mockPersistToken.mockClear();
  queueChangeExchanges();
  return view;
}

/**
 * The change flow's two exchanges, in order — the temporary session first, the one the
 * app keeps second. The request is identical both times by design, so their ORDER is the
 * only thing that distinguishes them.
 */
function queueChangeExchanges(): void {
  mockFirebaseExchange.mockReset();
  mockFirebaseExchange.mockResolvedValueOnce(TEMP_SESSION).mockResolvedValueOnce(FINAL_SESSION);
}

/**
 * Runs a call expected to reject and hands back what it threw.
 *
 * 'expect(...).rejects' inside 'act' would be reported as an unhandled rejection, and
 * the thrown value is what the negative cases assert on.
 */
async function capture(promise: Promise<unknown>): Promise<unknown> {
  let caught: unknown;
  await act(async () => {
    try {
      await promise;
    } catch (err) {
      caught = err;
    }
  });
  return caught;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPersistToken.mockResolvedValue(undefined);
  mockIsFirebaseConfigured.mockReturnValue(true);
  mockLogin.mockResolvedValue(FINAL_SESSION);
  mockLogout.mockResolvedValue({ message: 'Signed out' });
  mockSignOutOfFirebase.mockResolvedValue(undefined);
  mockNativeUpdatePassword.mockResolvedValue(undefined);
  mockCredentialsChanged.mockResolvedValue({ changedAt: '2026-01-01T00:00:00.000Z' });
  // The ordinary case: the screen has just confirmed, so a live Firebase user exists and
  // the token it mints carries that confirmation's 'auth_time'.
  mockCurrentFirebaseIdToken.mockResolvedValue(CONFIRMED_TOKEN);
  mockConfirmFirebaseSignIn.mockResolvedValue({ kind: 'idToken', idToken: CONFIRMED_TOKEN });
  // A default for the sign-in's own exchange; 'mountSignedIn' queues this flow's two
  // answers once that has been consumed. The reset matters: 'clearAllMocks' clears calls
  // but NOT a 'mockResolvedValueOnce' queue, so a leftover pair from a case that bailed
  // early would otherwise be consumed by the NEXT case's sign-in.
  mockFirebaseExchange.mockReset();
  mockFirebaseExchange.mockResolvedValue(FINAL_SESSION);
});

// ---------------------------------------------------------------------------
// Required cases 1 and 2 — what is sent, and in what order
// ---------------------------------------------------------------------------

describe('changeFirebasePassword — the credential change itself', () => {
  it('calls the native updatePassword with the NEW password, never the confirmation password', async () => {
    const view = await mountSignedIn();

    await act(async () => {
      await view.result.current.changeFirebasePassword(CHANGE_INPUT);
    });

    expect(mockNativeUpdatePassword).toHaveBeenCalledTimes(1);
    expect(mockNativeUpdatePassword).toHaveBeenCalledWith(NEW_PASSWORD);
    // THE CONFIRMATION PASSWORD IS A SEPARATE CREDENTIAL. It proves the person may act on
    // the account; it must never become the account's password.
    expect(mockNativeUpdatePassword).not.toHaveBeenCalledWith(PASSWORD);
  });

  it('runs updatePassword BEFORE the bridge, and swaps the session LAST', async () => {
    const order: string[] = [];
    const view = await mountSignedIn();

    // Recording starts after the mount, and the queued pair is dropped with it: signing
    // in performs an exchange of its own, and a queued 'mockResolvedValueOnce' takes
    // precedence over an implementation, so the recorder below would never be reached.
    mockFirebaseExchange.mockReset();
    mockCurrentFirebaseIdToken.mockImplementation(async () => {
      order.push('id-token');
      return CONFIRMED_TOKEN;
    });
    mockNativeUpdatePassword.mockImplementation(async () => {
      order.push('updatePassword');
    });
    mockFirebaseExchange.mockImplementation(async () => {
      order.push('exchange');
      return order.filter((step) => step === 'exchange').length === 1 ? TEMP_SESSION : FINAL_SESSION;
    });
    mockCredentialsChanged.mockImplementation(async () => {
      order.push('credentialsChanged');
      return { changedAt: '2026-01-01T00:00:00.000Z' };
    });
    mockPersistToken.mockImplementation(async () => {
      order.push('applySession');
    });

    await act(async () => {
      await view.result.current.changeFirebasePassword(CHANGE_INPUT);
    });

    // THE ORDER IS THE CONTRACT. The bridge exists to record a change that has ALREADY
    // happened, so reversing the first two would revoke every session for a password that
    // never changed; and the final exchange must be last, because the bridge revokes every
    // session the account holds — including the temporary one it is called with.
    expect(order).toEqual([
      'id-token',
      'updatePassword',
      'id-token',
      'exchange',
      'credentialsChanged',
      'exchange',
      'applySession',
    ]);
  });

  it('presents the SAME verified identity to both exchanges, so no other account can resolve', async () => {
    const view = await mountSignedIn();

    await act(async () => {
      await view.result.current.changeFirebasePassword(CHANGE_INPUT);
    });

    expect(mockFirebaseExchange).toHaveBeenCalledTimes(2);
    const first = mockFirebaseExchange.mock.calls[0]?.[0];
    const second = mockFirebaseExchange.mock.calls[1]?.[0];
    expect(first).toEqual({ idToken: CONFIRMED_TOKEN, deviceLabel: expect.any(String) });
    expect(second).toEqual(first);
    // The uid lives inside the verified token and nowhere else, so the client cannot name
    // one — which is what makes 'the same firebaseUid' a property of the request's shape.
    expect(Object.keys(first as Record<string, unknown>).sort()).toEqual(['deviceLabel', 'idToken']);
  });
});

// ---------------------------------------------------------------------------
// Required case 3 — the recency refusal offers confirm-again and costs no session
// ---------------------------------------------------------------------------

describe('changeFirebasePassword — the recency refusal', () => {
  it('maps the native auth/requires-recent-login to reauth-required without touching the session', async () => {
    mockNativeUpdatePassword.mockRejectedValue(nativeRecencyError());
    const view = await mountSignedIn();

    let outcome: unknown;
    await act(async () => {
      outcome = await view.result.current.changeFirebasePassword(CHANGE_INPUT);
    });

    expect(outcome).toEqual({ kind: 'reauth-required' });
    // NOTHING ELSE HAPPENED: no session was minted, none was recorded as changed, and the
    // person is still signed in on the token they arrived with. A recency refusal is an
    // instruction to confirm again, not session loss.
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(mockCredentialsChanged).not.toHaveBeenCalled();
    expect(mockSignOutOfFirebase).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('signedIn');
    expect(view.result.current.token).toBe(FINAL_APP_TOKEN);
  });

  it('maps the 409 FIREBASE_REAUTHENTICATION_REQUIRED to reauth-required and keeps the session', async () => {
    mockCredentialsChanged.mockRejectedValue(reauthRequired());
    const view = await mountSignedIn();

    let outcome: unknown;
    await act(async () => {
      outcome = await view.result.current.changeFirebasePassword(CHANGE_INPUT);
    });

    expect(outcome).toEqual({ kind: 'reauth-required' });
    // The temporary session was minted and then abandoned; the app's own session was never
    // touched, which is the entire reason the temporary one exists.
    expect(mockFirebaseExchange).toHaveBeenCalledTimes(1);
    expect(view.result.current.status).toBe('signedIn');
    expect(view.result.current.token).toBe(FINAL_APP_TOKEN);
  });

  it('does not answer reauth-required a second time — the retry flag is the cap', async () => {
    mockCredentialsChanged.mockRejectedValue(reauthRequired());
    const view = await mountSignedIn();

    const caught = await capture(
      view.result.current.changeFirebasePassword(CHANGE_INPUT, { retry: true })
    );

    // A retried refusal is terminal, so it propagates rather than looping the person
    // through a third confirmation.
    expect(caught).toBeInstanceOf(ApiError);
    expect(mockFirebaseExchange).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Required case 4 — a failure modifies nothing
// ---------------------------------------------------------------------------

describe('changeFirebasePassword — a failure changes nothing', () => {
  it('propagates a terminal credential failure and never reaches the server', async () => {
    const failure = new Error('The password must be at least 6 characters.');
    mockNativeUpdatePassword.mockRejectedValue(failure);
    const view = await mountSignedIn();

    const caught = await capture(view.result.current.changeFirebasePassword(CHANGE_INPUT));

    expect(caught).toBe(failure);
    // NO SERVER CALL AND NO LOCAL SWAP: the credential never changed, so there is nothing
    // to record and nothing to re-authenticate.
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(mockCredentialsChanged).not.toHaveBeenCalled();
    expect(mockPersistToken).not.toHaveBeenCalled();
    expect(mockSignOutOfFirebase).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('signedIn');
    expect(view.result.current.token).toBe(FINAL_APP_TOKEN);
  });

  it('propagates a terminal bridge failure without applying the final session', async () => {
    mockCredentialsChanged.mockRejectedValue(conflict());
    const view = await mountSignedIn();

    const caught = await capture(view.result.current.changeFirebasePassword(CHANGE_INPUT));

    expect(caught).toBeInstanceOf(ApiError);
    // The final exchange is never reached, so the app is not handed a session the server
    // has not agreed to.
    expect(mockFirebaseExchange).toHaveBeenCalledTimes(1);
    expect(mockPersistToken).not.toHaveBeenCalled();
    expect(view.result.current.token).toBe(FINAL_APP_TOKEN);
  });
});

// ---------------------------------------------------------------------------
// Required cases 5, 6 and 7 — the identity survives and the session is the live one
// ---------------------------------------------------------------------------

describe('changeFirebasePassword — success', () => {
  it('reports changed and applies the FINAL session, not the temporary one', async () => {
    const view = await mountSignedIn();

    let outcome: unknown;
    await act(async () => {
      outcome = await view.result.current.changeFirebasePassword(CHANGE_INPUT);
    });

    expect(outcome).toEqual({ kind: 'changed' });
    expect(view.result.current.status).toBe('signedIn');
    expect(view.result.current.token).toBe(FINAL_APP_TOKEN);
    // The account is the same account — same id, same role — because the server answered
    // with the user it already had.
    expect(view.result.current.user?.id).toBe(USER.id);
    expect(view.result.current.user?.role).toBe(USER.role);
    // The temporary session is never persisted, so a crash between the two exchanges
    // cannot leave the app holding a token the bridge has already revoked.
    expect(mockPersistToken).toHaveBeenCalledTimes(1);
    // Two arguments: the storage key, then the token — the bridge's temporary token must
    // never be the one that lands here.
    expect(mockPersistToken).toHaveBeenCalledWith(expect.any(String), FINAL_APP_TOKEN);
    // The bridge revoked every session server-side, so a logout here would be a guaranteed
    // 401 that the client's session-loss rule would then act on.
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('never signs the account out of Firebase — the identity STAYS attached', async () => {
    const view = await mountSignedIn();

    await act(async () => {
      await view.result.current.changeFirebasePassword(CHANGE_INPUT);
    });

    // THE PHASE'S CENTRAL NEGATIVE. Detaching the Firebase session here is what the old
    // disconnect flow did, and it is precisely what made the stale Firebase password
    // survivable: the identity stayed valid at Firebase while the server forgot it.
    expect(mockSignOutOfFirebase).not.toHaveBeenCalled();
  });

  it('does not arm Firebase registration and never calls the registration endpoint', async () => {
    const view = await mountSignedIn();

    await act(async () => {
      await view.result.current.changeFirebasePassword(CHANGE_INPUT);
    });

    // The account is known to the server under the SAME verified identity it has always
    // had, so the exchange can never answer REGISTRATION_REQUIRED for it — which is the
    // dead end the old flow produced by making the identity resolve to no user at all.
    expect(view.result.current.firebaseRegistrationRequired).toBe(false);
    expect(mockFirebaseRegister).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Required case 9 (client half) — the client cannot express an unlink
// ---------------------------------------------------------------------------

const MOBILE_ROOT = join(__dirname, '..');
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

const readSource = (path: string): string => readFileSync(path, 'utf8');

/** Every source file under the given directory, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.includes(path.slice(path.lastIndexOf('.'))) ? [path] : [];
  });
}

/**
 * Strips block and line comments. Line comments are only stripped when they start a
 * line, so a '//' inside a string is left alone. This exists because the guards below
 * assert that certain identifiers never appear, and this module's own header names the
 * removed capability in order to explain where it went.
 */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the client holds no way to clear the Firebase identity', () => {
  it('names no unlink endpoint anywhere in lib/', () => {
    // 'lib/' is the whole client boundary: a screen can only reach the server through it,
    // so if no module there can express a detach then no screen can either.
    const offenders = sourceFiles(join(MOBILE_ROOT, 'lib')).filter((path) =>
      codeOnly(readSource(path)).includes('firebase/unlink')
    );

    expect(offenders).toEqual([]);
  });

  it('never names firebaseUid at all — the client has no concept of the mapping', () => {
    const sources = [
      ...sourceFiles(join(MOBILE_ROOT, 'lib')),
      ...sourceFiles(join(MOBILE_ROOT, 'app')),
    ];
    const offenders = sources.filter((path) => codeOnly(readSource(path)).includes('firebaseUid'));

    expect(offenders).toEqual([]);
  });

  it('sends the bridge a body carrying exactly one key', () => {
    // 'validateCredentialsChanged' reads 'idToken' and nothing else, and the wrapper is
    // the only shape the client can construct.
    const source = codeOnly(readSource(join(MOBILE_ROOT, 'lib', 'api.ts')));
    const start = source.indexOf('export function credentialsChanged');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('});', start));

    expect(body).toContain('body: { idToken }');
    expect(body).not.toContain('firebaseUid');
    expect(body).not.toContain('userId');
    expect(body).not.toContain('businessId');
  });
});
