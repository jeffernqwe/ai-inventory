/**
 * Phase 32E — the Firebase sign-in flow as `lib/auth.tsx` actually runs it.
 *
 * `__tests__/firebase-auth.test.ts` pins which Firebase outcomes mean what. This
 * file pins what the session layer DOES with each of them, which is a different
 * claim: the classification is only worth anything if the legacy route is
 * genuinely unreachable from a Firebase fault, and "unreachable" is a property of
 * the call graph rather than of a return value. Every "does not fall back" case
 * below therefore asserts a NEGATIVE — that `api.login` was never called — and
 * not merely that an error surfaced.
 *
 * WHAT IS REAL HERE: `AuthProvider`, its boot restore, its session persistence,
 * `applySession`, `endSession` and the sign-in/sign-up call graph. Only the module
 * boundaries are mocked — the Firebase boundary (both halves), the API layer, and
 * SecureStore.
 *
 * `lib/firebase` is mocked rather than `process.env`-driven because
 * `isFirebaseConfigured()` is a build-time fact this provider branches on, and a
 * case must be able to choose the build without resetting the module registry.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '../lib/client';
import { AuthProvider, useSession } from '../lib/auth';
import { FirebaseAuthError } from '../lib/firebase-auth';

// ---------------------------------------------------------------------------
// The mock seam
// ---------------------------------------------------------------------------

const mockSignInWithEmail = jest.fn();
const mockEnsureFirebaseAccount = jest.fn();
const mockSignOutOfFirebase = jest.fn();

jest.mock('../lib/firebase-auth', () => ({
  // A real class, so `instanceof` in the provider's own code and in these
  // assertions both mean something.
  FirebaseAuthError: class FirebaseAuthError extends Error {
    code: string | null;

    constructor(code: string | null, message: string) {
      super(message);
      this.name = 'FirebaseAuthError';
      this.code = code;
    }
  },
  signInWithEmail: (...args: unknown[]) => mockSignInWithEmail(...args),
  ensureFirebaseAccount: (...args: unknown[]) => mockEnsureFirebaseAccount(...args),
  signOutOfFirebase: (...args: unknown[]) => mockSignOutOfFirebase(...args),
}));

const mockIsFirebaseConfigured = jest.fn(() => true);

jest.mock('../lib/config', () => ({
  isFirebaseConfigured: () => mockIsFirebaseConfigured(),
}));

const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockFirebaseExchange = jest.fn();
const mockFirebaseRegister = jest.fn();
const mockLogout = jest.fn();
const mockMe = jest.fn();

jest.mock('../lib/api', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  register: (...args: unknown[]) => mockRegister(...args),
  firebaseExchange: (...args: unknown[]) => mockFirebaseExchange(...args),
  firebaseRegister: (...args: unknown[]) => mockFirebaseRegister(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
  me: (...args: unknown[]) => mockMe(...args),
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => {}),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMAIL = 'owner@example.com';
const PASSWORD = 'Password123!';
const BUSINESS_NAME = 'Acme Retail';
const NAME = 'Ada';
const ID_TOKEN = 'fake.id.token';
const APP_TOKEN = 'inventory-ai.jwt';

const USER = { id: 'u1', name: NAME, email: EMAIL, role: 'OWNER' as const };
const SESSION = { token: APP_TOKEN, tokenType: 'Bearer', expiresIn: '1d', user: USER };

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

/** A mounted provider, already settled out of its 'loading' boot state. */
async function mountSignedOut() {
  const view = await renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
  return view;
}

/**
 * Runs a call that is expected to reject and hands back what it threw.
 *
 * `expect(...).rejects` cannot be used inside `act` without the rejection being
 * reported as an unhandled one, and the thrown value is what these cases assert
 * on, so it is captured explicitly.
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
  mockIsFirebaseConfigured.mockReturnValue(true);
  mockFirebaseExchange.mockResolvedValue(SESSION);
  mockLogin.mockResolvedValue(SESSION);
  mockLogout.mockResolvedValue({ message: 'Signed out' });
  mockSignOutOfFirebase.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Sign in — Firebase first
// ---------------------------------------------------------------------------

describe('signIn — Firebase first', () => {
  it('exchanges the ID token for an Inventory AI session', async () => {
    mockSignInWithEmail.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });

    const view = await mountSignedOut();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    expect(mockFirebaseExchange).toHaveBeenCalledTimes(1);
    const [exchangeArgs] = mockFirebaseExchange.mock.calls[0]!;
    expect(exchangeArgs.idToken).toBe(ID_TOKEN);
    // A cosmetic label, but it must actually be a string — the server coerces it
    // and the session list renders it.
    expect(typeof exchangeArgs.deviceLabel).toBe('string');
    expect(exchangeArgs.deviceLabel.length).toBeGreaterThan(0);

    // The stored session is the APPLICATION token, never the Firebase one.
    expect(view.result.current.token).toBe(APP_TOKEN);
    expect(view.result.current.user).toEqual(USER);
    expect(view.result.current.status).toBe('signedIn');
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('never sends the Firebase ID token to the legacy login route', async () => {
    // The two credentials are different kinds of thing. A regression that passed
    // the Firebase token along as if it were a password would be invisible to a
    // response-only assertion, so the argument itself is checked.
    mockSignInWithEmail.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });

    const view = await mountSignedOut();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    expect(mockLogin).not.toHaveBeenCalled();
    expect(JSON.stringify(mockLogin.mock.calls)).not.toContain(ID_TOKEN);
  });
});

// ---------------------------------------------------------------------------
// Sign in — the legacy route, and only where it is allowed
// ---------------------------------------------------------------------------

describe('signIn — the legacy fallback', () => {
  it('uses the password route when Firebase has no such identity', async () => {
    mockSignInWithEmail.mockResolvedValue({ kind: 'legacyFallback', reason: 'invalid-credential' });

    const view = await mountSignedOut();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockLogin.mock.calls[0]![0]).toMatchObject({ email: EMAIL, password: PASSWORD });
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('signedIn');
  });

  it('uses the password route unchanged in a build with no Firebase at all', async () => {
    // The pre-32D behaviour, which must stay byte-identical: this is the state of
    // the repository today and every existing account depends on it.
    mockSignInWithEmail.mockResolvedValue({ kind: 'legacyFallback', reason: 'not-configured' });

    const view = await mountSignedOut();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(view.result.current.status).toBe('signedIn');
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
  });

  it('★ does not fall back when Firebase itself failed', async () => {
    // The security property. A broken or blocked Firebase must not become a way
    // into the password route, or an outage would be a downgrade anyone could
    // trigger.
    const failure = new FirebaseAuthError(
      'auth/invalid-api-key',
      'Sign-in is misconfigured. Contact your administrator.'
    );
    mockSignInWithEmail.mockResolvedValue({
      kind: 'failure',
      code: failure.code,
      message: failure.message,
    });

    const view = await mountSignedOut();
    const caught = await capture(view.result.current.signIn({ email: EMAIL, password: PASSWORD }));

    expect((caught as Error).message).toBe(failure.message);
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('signedOut');
  });

  it('★ does not fall back when the exchange refuses the session', async () => {
    // A backend refusal is the server's decision. Reaching for the password route
    // here would ask the server the same question through a door it just shut.
    mockSignInWithEmail.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });
    mockFirebaseExchange.mockRejectedValue(
      new ApiError(403, 'ACCOUNT_DISABLED', 'This account is disabled. Contact an administrator.')
    );

    const view = await mountSignedOut();
    const caught = await capture(view.result.current.signIn({ email: EMAIL, password: PASSWORD }));

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBe('ACCOUNT_DISABLED');
    expect(mockLogin).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('signedOut');
  });

  it('★ does not fall back when the exchange says REGISTRATION_REQUIRED', async () => {
    mockSignInWithEmail.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });
    mockFirebaseExchange.mockRejectedValue(
      new ApiError(403, 'REGISTRATION_REQUIRED', 'This sign-in is not linked yet.')
    );

    const view = await mountSignedOut();
    const caught = await capture(view.result.current.signIn({ email: EMAIL, password: PASSWORD }));

    expect((caught as ApiError).code).toBe('REGISTRATION_REQUIRED');
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('★ surfaces FIREBASE_SIGN_IN_REQUIRED from the legacy route', async () => {
    // The server's refusal of a Firebase-linked account still holding a bcrypt
    // hash. It reaches the screen as an ordinary ApiError, which is what the login
    // screen's existing error path renders — no client-side detection is involved,
    // and none would be trusted if it were.
    mockSignInWithEmail.mockResolvedValue({ kind: 'legacyFallback', reason: 'invalid-credential' });
    mockLogin.mockRejectedValue(
      new ApiError(403, 'FIREBASE_SIGN_IN_REQUIRED', 'This account signs in with Firebase.')
    );

    const view = await mountSignedOut();
    const caught = await capture(view.result.current.signIn({ email: EMAIL, password: PASSWORD }));

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBe('FIREBASE_SIGN_IN_REQUIRED');
    expect(view.result.current.status).toBe('signedOut');
  });
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('signUp', () => {
  it('creates the Firebase identity, the tenant and the session, in that order', async () => {
    mockEnsureFirebaseAccount.mockResolvedValue({ idToken: ID_TOKEN });
    mockFirebaseRegister.mockResolvedValue({ user: USER, business: { id: 'b1' } });

    const view = await mountSignedOut();
    await act(async () => {
      await view.result.current.signUp({
        businessName: BUSINESS_NAME,
        name: NAME,
        email: EMAIL,
        password: PASSWORD,
      });
    });

    expect(mockEnsureFirebaseAccount).toHaveBeenCalledWith({
      email: EMAIL,
      password: PASSWORD,
      name: NAME,
    });
    expect(mockFirebaseRegister).toHaveBeenCalledWith({
      idToken: ID_TOKEN,
      businessName: BUSINESS_NAME,
      name: NAME,
    });
    expect(mockFirebaseExchange.mock.calls[0]![0].idToken).toBe(ID_TOKEN);
    // No password account and no password login are involved on this path.
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockLogin).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('signedIn');
    expect(view.result.current.token).toBe(APP_TOKEN);
  });

  it('uses the legacy registration path unchanged when Firebase is absent', async () => {
    mockIsFirebaseConfigured.mockReturnValue(false);
    mockRegister.mockResolvedValue({ user: USER });
    // The legacy path signs in through the same Firebase-first `signIn`, which in
    // this build reports not-configured and takes the password route.
    mockSignInWithEmail.mockResolvedValue({ kind: 'legacyFallback', reason: 'not-configured' });

    const view = await mountSignedOut();
    await act(async () => {
      await view.result.current.signUp({
        businessName: BUSINESS_NAME,
        name: NAME,
        email: EMAIL,
        password: PASSWORD,
      });
    });

    expect(mockRegister).toHaveBeenCalledWith({
      businessName: BUSINESS_NAME,
      name: NAME,
      email: EMAIL,
      password: PASSWORD,
    });
    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockEnsureFirebaseAccount).not.toHaveBeenCalled();
    expect(mockFirebaseRegister).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('signedIn');
  });

  it('stops before the server when the Firebase identity cannot be created', async () => {
    mockEnsureFirebaseAccount.mockRejectedValue(
      new FirebaseAuthError(
        'auth/email-already-in-use',
        'An account with this email already exists. Sign in instead.'
      )
    );

    const view = await mountSignedOut();
    const caught = await capture(
      view.result.current.signUp({
        businessName: BUSINESS_NAME,
        name: NAME,
        email: EMAIL,
        password: PASSWORD,
      })
    );

    expect((caught as Error).message).toBe('An account with this email already exists. Sign in instead.');
    // Nothing was written: no tenant, no session.
    expect(mockFirebaseRegister).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('signedOut');
  });

  it('stops before the exchange when the tenant cannot be created', async () => {
    mockEnsureFirebaseAccount.mockResolvedValue({ idToken: ID_TOKEN });
    mockFirebaseRegister.mockRejectedValue(
      new ApiError(409, 'EMAIL_IN_USE', 'An account with this email already exists')
    );

    const view = await mountSignedOut();
    const caught = await capture(
      view.result.current.signUp({
        businessName: BUSINESS_NAME,
        name: NAME,
        email: EMAIL,
        password: PASSWORD,
      })
    );

    expect((caught as ApiError).code).toBe('EMAIL_IN_USE');
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('signedOut');
  });
});

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------

describe('signOut', () => {
  it('ends the Firebase session as well as the Inventory AI one', async () => {
    mockSignInWithEmail.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });

    const view = await mountSignedOut();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    await act(async () => {
      await view.result.current.signOut();
    });

    expect(mockLogout).toHaveBeenCalledWith(APP_TOKEN, { all: false });
    expect(mockSignOutOfFirebase).toHaveBeenCalledTimes(1);
    expect(view.result.current.token).toBeNull();
    expect(view.result.current.user).toBeNull();
    expect(view.result.current.status).toBe('signedOut');
  });

  it('still signs out of Firebase when the server cannot be reached', async () => {
    mockSignInWithEmail.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });
    mockLogout.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server.'));

    const view = await mountSignedOut();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    await act(async () => {
      await view.result.current.signOut();
    });

    expect(mockSignOutOfFirebase).toHaveBeenCalledTimes(1);
    expect(view.result.current.status).toBe('signedOut');
  });

  it('keeps sign-out-everywhere a single revoking call', async () => {
    mockSignInWithEmail.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });

    const view = await mountSignedOut();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    await act(async () => {
      await view.result.current.signOutEverywhere();
    });

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockLogout).toHaveBeenCalledWith(APP_TOKEN, { all: true });
    expect(mockSignOutOfFirebase).toHaveBeenCalledTimes(1);
  });
});
