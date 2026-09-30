/**
 * Phase 32M — `connectFirebase` in `lib/auth.tsx`, as it actually runs.
 *
 * WHAT THIS SUITE IS PROTECTING. The server's linking boundary (Phase 32H) is
 * already complete, tested and authoritative; this phase only makes it reachable
 * from the app. So the properties worth pinning are the CLIENT's obligations to
 * that boundary, not the boundary itself:
 *
 *   * the request carries ONLY `{ idToken }` — no id, uid, businessId, role or
 *     email is ever sent, and both the account and the identity are server-derived;
 *   * connect is NOT a sign-in: the Inventory AI token is unchanged, no exchange
 *     runs, and the session the caller already holds is the ownership proof;
 *   * a refusal never becomes session loss — a 409 conflict and a 400 rejected
 *     provider credential both leave the caller signed in, because the client's
 *     session-loss rule keys on 401/403 and the server answers 400 deliberately;
 *   * the device's Firebase session is left consistent with the outcome: kept on a
 *     success, ended on a refusal, untouched on a cancellation;
 *   * a duplicate request cannot start a second consent sheet or a second request.
 *
 * WHAT IS REAL HERE: `AuthProvider`, its boot restore, `applySession` and the
 * whole `connectFirebase` call graph. Only the module boundaries are mocked — the
 * Firebase module, the API layer, `lib/config` and SecureStore. The server is a
 * mock, so this file proves the CLIENT's contract against
 * `POST /api/auth/firebase/link`, not the server's behaviour (which
 * `server/test/phase32h-firebase-linking.test.mjs` owns).
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
const mockSignInWithGoogle = jest.fn();
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
  signInWithGoogle: (...args: unknown[]) => mockSignInWithGoogle(...args),
  ensureFirebaseAccount: jest.fn(),
  signOutOfFirebase: (...args: unknown[]) => mockSignOutOfFirebase(...args),
  currentFirebaseIdToken: jest.fn(),
  confirmFirebaseSignIn: jest.fn(),
}));

const mockFirebaseExchange = jest.fn();
const mockFirebaseLink = jest.fn();
const mockLogin = jest.fn();
const mockLogout = jest.fn();
const mockMe = jest.fn();

jest.mock('../lib/api', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  firebaseExchange: (...args: unknown[]) => mockFirebaseExchange(...args),
  firebaseLink: (...args: unknown[]) => mockFirebaseLink(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
  me: (...args: unknown[]) => mockMe(...args),
  register: jest.fn(),
  firebaseRegister: jest.fn(),
}));

// PHASE 16: `lib/auth.tsx` now reaches the verification boundary DIRECTLY, not only
// through `lib/firebase-auth`. The seam is mocked here for the same reason the others
// are: only module boundaries are mocked, and an unmocked boundary would load the real
// native packages. `nativeReloadUser` answers TRUE by default because these suites
// exercise an already-verified identity; the unverified road has its own suite.
jest.mock('../lib/firebase-native', () => ({
  nativeForceIdToken: jest.fn(async () => 'forced.firebase.id.token'),
  nativeReloadUser: jest.fn(async () => true),
  nativeSendEmailVerification: jest.fn(async () => {}),
}));
jest.mock('../lib/config', () => ({
  isFirebaseConfigured: () => true,
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => {}),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

const EMAIL = 'owner@example.com';
const PASSWORD = 'Password123!';
const APP_TOKEN = 'inventory-ai.jwt';
const GOOGLE_ID_TOKEN = 'google.to.firebase.id.token';

/** A password account with no Firebase identity: exactly what Connect is offered to. */
const USER = {
  id: 'u1',
  name: 'Ada',
  email: EMAIL,
  role: 'OWNER' as const,
  status: 'ACTIVE',
  authMethods: { password: true, firebase: false },
};

/** The same account as the server returns it once the identity is attached. */
const LINKED_USER = { ...USER, authMethods: { password: true, firebase: true } };

const SESSION = { token: APP_TOKEN, tokenType: 'Bearer', expiresIn: '1d', user: USER };

const conflict = () =>
  new ApiError(
    409,
    'FIREBASE_IDENTITY_CONFLICT',
    'This sign-in cannot be connected to this account. Please contact an administrator.'
  );
const tokenInvalid = () =>
  new ApiError(400, 'FIREBASE_TOKEN_INVALID', 'This sign-in could not be verified. Please try again.');

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

/** A mounted provider, settled into `signedIn` through the Firebase exchange path. */
async function mountSignedIn() {
  mockSignInWithEmail.mockResolvedValue({ kind: 'idToken', idToken: 'email.id.token' });
  const view = await renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
  await act(async () => {
    await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
  });
  await waitFor(() => expect(view.result.current.status).toBe('signedIn'));
  return view;
}

/**
 * Runs a call expected to reject and hands back what it threw.
 *
 * The same helper the disconnect suite uses, for the same reason:
 * `expect(...).rejects` inside `act` would be reported as an unhandled rejection,
 * and the thrown value is what the negative cases assert on.
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
  // `clearAllMocks` keeps implementations, and one case below installs its own, so
  // the two mocks that matter are reset outright before their defaults are set.
  jest.clearAllMocks();
  mockSignInWithGoogle.mockReset();
  mockFirebaseLink.mockReset();

  mockFirebaseExchange.mockResolvedValue(SESSION);
  mockLogin.mockResolvedValue(SESSION);
  mockLogout.mockResolvedValue({ message: 'Signed out' });
  mockSignOutOfFirebase.mockResolvedValue(true);
  mockSignInWithGoogle.mockResolvedValue({ kind: 'idToken', idToken: GOOGLE_ID_TOKEN });
  mockFirebaseLink.mockResolvedValue({ linked: true, user: LINKED_USER });
});

// ---------------------------------------------------------------------------
// The request, and what it is allowed to carry
// ---------------------------------------------------------------------------

describe('connectFirebase — the link request', () => {
  it('sends ONLY the ID token, with the session token as the bearer credential', async () => {
    const view = await mountSignedIn();

    await act(async () => {
      await view.result.current.connectFirebase();
    });

    expect(mockFirebaseLink).toHaveBeenCalledTimes(1);
    const [token, body] = mockFirebaseLink.mock.calls[0]!;
    expect(token).toBe(APP_TOKEN);
    expect(body).toEqual({ idToken: GOOGLE_ID_TOKEN });
    // The account is the session and the identity is the verified token's uid. A body
    // carrying an id, a uid, a tenant, a role or an email would be asking the server to
    // read the linkage from the client — which is exactly what it refuses to do.
    expect(Object.keys(body)).toEqual(['idToken']);
  });

  it('is NOT a sign-in: the token is unchanged and no exchange runs', async () => {
    const view = await mountSignedIn();
    // The mount's own sign-in performed exactly one exchange.
    expect(mockFirebaseExchange).toHaveBeenCalledTimes(1);

    await act(async () => {
      await view.result.current.connectFirebase();
    });

    expect(view.result.current.token).toBe(APP_TOKEN);
    expect(mockFirebaseExchange).toHaveBeenCalledTimes(1);
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('applies the account the server returns, so the capability block is current', async () => {
    const view = await mountSignedIn();
    expect(view.result.current.user?.authMethods?.firebase).toBe(false);

    await act(async () => {
      await view.result.current.connectFirebase();
    });

    // Applied from the response rather than re-fetched: the server's own DTO is the
    // authority, and this is what removes the Connect action in the same commit.
    expect(view.result.current.user?.authMethods?.firebase).toBe(true);
    expect(view.result.current.user?.email).toBe(EMAIL);
    expect(mockMe).not.toHaveBeenCalled();
  });

  it('treats the idempotent already-linked answer as the success it is', async () => {
    // CASE A: the account already carries this identity, so the server answers
    // `linked: false`. From the caller's side the account signs in with Google
    // afterwards either way, so this is reported as a success, not a refusal.
    mockFirebaseLink.mockResolvedValue({ linked: false, user: LINKED_USER });
    const view = await mountSignedIn();

    let outcome: unknown;
    await act(async () => {
      outcome = await view.result.current.connectFirebase();
    });

    expect(outcome).toEqual({ kind: 'linked' });
    expect(view.result.current.user?.authMethods?.firebase).toBe(true);
  });

  it('leaves the Firebase identity signed in once the link succeeded', async () => {
    const view = await mountSignedIn();

    await act(async () => {
      await view.result.current.connectFirebase();
    });

    // The identity now IS this account's, so the durable native session is the
    // consistent state — not something to tear down.
    expect(mockSignOutOfFirebase).not.toHaveBeenCalled();
  });

  it('runs the Firebase step BEFORE the request, so a cancellation sends nothing', async () => {
    mockSignInWithGoogle.mockResolvedValue({ kind: 'cancelled' });
    const view = await mountSignedIn();

    let outcome: unknown;
    await act(async () => {
      outcome = await view.result.current.connectFirebase();
    });

    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(mockFirebaseLink).not.toHaveBeenCalled();
    expect(mockSignOutOfFirebase).not.toHaveBeenCalled();
    await waitFor(() => expect(view.result.current.status).toBe('signedIn'));
  });

  it('throws a FirebaseAuthError, and sends nothing, when Firebase itself failed', async () => {
    mockSignInWithGoogle.mockResolvedValue({
      kind: 'failure',
      code: 'auth/network-request-failed',
      message: 'Cannot reach the sign-in service. Check your connection and try again.',
    });
    const view = await mountSignedIn();

    const thrown = await capture(view.result.current.connectFirebase());

    expect(thrown).toBeInstanceOf(FirebaseAuthError);
    expect((thrown as FirebaseAuthError).code).toBe('auth/network-request-failed');
    // There was no credential to attach, so there is no request to make.
    expect(mockFirebaseLink).not.toHaveBeenCalled();
  });

  it('starts only one attempt when two are asked for at once', async () => {
    // The screen's `busy` flag covers the ordinary double tap, but a duplicate handler
    // or a second screen reading the same session would bypass it — so the claim lives
    // in the one layer every attempt passes through.
    let releaseGoogle: (value: unknown) => void = () => {};
    mockSignInWithGoogle.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseGoogle = resolve;
        })
    );

    const view = await mountSignedIn();

    let first: unknown;
    let second: unknown;
    await act(async () => {
      const firstCall = view.result.current.connectFirebase();
      second = await view.result.current.connectFirebase();
      releaseGoogle({ kind: 'idToken', idToken: GOOGLE_ID_TOKEN });
      first = await firstCall;
    });

    // The loser is told nothing was started rather than given an error it did not cause
    // — and it opened no second consent sheet.
    expect(second).toEqual({ kind: 'in-flight' });
    expect(first).toEqual({ kind: 'linked' });
    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
    expect(mockFirebaseLink).toHaveBeenCalledTimes(1);
  });

  it('throws when there is no Inventory AI session to attach the identity to', async () => {
    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));

    const thrown = await capture(view.result.current.connectFirebase());

    expect(thrown).toBeInstanceOf(FirebaseAuthError);
    expect((thrown as FirebaseAuthError).code).toBe('firebase/no-session');
    // The route is authenticated, so no credential is even requested without a session.
    expect(mockSignInWithGoogle).not.toHaveBeenCalled();
    expect(mockFirebaseLink).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Refusals — and the session that must survive them
// ---------------------------------------------------------------------------

describe('connectFirebase — refusals are not session loss', () => {
  it('propagates the conflict unchanged and keeps the caller signed in', async () => {
    mockFirebaseLink.mockRejectedValue(conflict());
    const view = await mountSignedIn();

    const thrown = await capture(view.result.current.connectFirebase());

    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).status).toBe(409);
    expect((thrown as ApiError).code).toBe('FIREBASE_IDENTITY_CONFLICT');
    await waitFor(() => expect(view.result.current.status).toBe('signedIn'));
    expect(view.result.current.token).toBe(APP_TOKEN);
    // The account did not change: nothing was linked.
    expect(view.result.current.user?.authMethods?.firebase).toBe(false);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('keeps the session for a rejected provider credential answered as 400', async () => {
    // The server moved this code off 401 precisely so it could not be read as a dead
    // session; the client's session-loss rule keys on 401/403, so it never fires here.
    mockFirebaseLink.mockRejectedValue(tokenInvalid());
    const view = await mountSignedIn();

    const thrown = await capture(view.result.current.connectFirebase());

    expect((thrown as ApiError).status).toBe(400);
    await waitFor(() => expect(view.result.current.status).toBe('signedIn'));
    expect(view.result.current.token).toBe(APP_TOKEN);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('releases the in-flight claim after a refusal, so a retry is possible', async () => {
    mockFirebaseLink.mockRejectedValueOnce(conflict());
    const view = await mountSignedIn();

    await capture(view.result.current.connectFirebase());

    // A stuck claim would make every later attempt answer `in-flight` forever.
    mockFirebaseLink.mockResolvedValue({ linked: true, user: LINKED_USER });
    let outcome: unknown;
    await act(async () => {
      outcome = await view.result.current.connectFirebase();
    });

    expect(outcome).toEqual({ kind: 'linked' });
    expect(mockFirebaseLink).toHaveBeenCalledTimes(2);
  });
});
