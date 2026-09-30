/**
 * Phase 32I — the Google Sign-In flow as `lib/auth.tsx` actually runs it.
 *
 * `__tests__/google-auth.test.ts` pins what `signInWithGoogle` returns. This file
 * pins what the SESSION LAYER does with each outcome, which is a different claim:
 * a Google sign-in must land on exactly the same Inventory AI session as a
 * password login — one exchange endpoint, one `applySession`, one JWT — and the
 * provider must be invisible in the stored session.
 *
 * `REGISTRATION_REQUIRED` is the server's answer when a Google identity has no
 * Inventory AI account. It must propagate as the ordinary `ApiError` it is, so the
 * login screen's existing handler renders it; there is deliberately no
 * Google-specific branch for it, and no fallback path exists to reach instead.
 *
 * WHAT IS REAL HERE: `AuthProvider`, its boot restore, `applySession` and the
 * Google call graph. Only the module boundaries are mocked — the Firebase
 * boundary, the API layer, and SecureStore.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '../lib/client';
import { AuthProvider, useSession } from '../lib/auth';
import { FirebaseAuthError } from '../lib/firebase-auth';

// ---------------------------------------------------------------------------
// The mock seam
// ---------------------------------------------------------------------------

const mockFirebaseSignInWithGoogle = jest.fn();

jest.mock('../lib/firebase-auth', () => ({
  FirebaseAuthError: class FirebaseAuthError extends Error {
    code: string | null;

    constructor(code: string | null, message: string) {
      super(message);
      this.name = 'FirebaseAuthError';
      this.code = code;
    }
  },
  signInWithEmail: jest.fn(),
  signInWithGoogle: (...args: unknown[]) => mockFirebaseSignInWithGoogle(...args),
  ensureFirebaseAccount: jest.fn(),
  signOutOfFirebase: jest.fn(),
}));

const mockIsFirebaseConfigured = jest.fn(() => true);
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
  isFirebaseConfigured: () => mockIsFirebaseConfigured(),
}));

const mockFirebaseExchange = jest.fn();
jest.mock('../lib/api', () => ({
  login: jest.fn(),
  register: jest.fn(),
  firebaseExchange: (...args: unknown[]) => mockFirebaseExchange(...args),
  firebaseRegister: jest.fn(),
  logout: jest.fn(),
  me: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => {}),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ID_TOKEN = 'firebase.id.token';
const APP_TOKEN = 'inventory-ai.jwt';
const USER = { id: 'u1', name: 'Ada', email: 'ada@example.com', role: 'OWNER' as const };
const SESSION = { token: APP_TOKEN, tokenType: 'Bearer', expiresIn: '1d', user: USER };

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

async function mountSignedOut() {
  const view = await renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
  return view;
}

/** Runs a call expected to reject and hands back what it threw. */
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
});

// ---------------------------------------------------------------------------
// Success — the same session as any other sign-in
// ---------------------------------------------------------------------------

describe('signInWithGoogle — success', () => {
  it('exchanges the Firebase ID token for an Inventory AI session', async () => {
    mockFirebaseSignInWithGoogle.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });

    const view = await mountSignedOut();
    let returned: unknown;
    await act(async () => {
      returned = await view.result.current.signInWithGoogle();
    });

    expect(mockFirebaseExchange).toHaveBeenCalledTimes(1);
    const [exchangeArgs] = mockFirebaseExchange.mock.calls[0]!;
    expect(exchangeArgs.idToken).toBe(ID_TOKEN);
    expect(typeof exchangeArgs.deviceLabel).toBe('string');
    expect(exchangeArgs.deviceLabel.length).toBeGreaterThan(0);

    // The stored session is the APPLICATION token, never the Firebase one, and the
    // user comes from the server.
    expect(view.result.current.token).toBe(APP_TOKEN);
    expect(view.result.current.user).toEqual(USER);
    expect(view.result.current.status).toBe('signedIn');
    expect(returned).toEqual(USER);
  });
});

// ---------------------------------------------------------------------------
// Cancellation — no session, no error
// ---------------------------------------------------------------------------

describe('signInWithGoogle — cancellation', () => {
  it('resolves null and leaves the session untouched', async () => {
    mockFirebaseSignInWithGoogle.mockResolvedValue({ kind: 'cancelled' });

    const view = await mountSignedOut();
    let returned: unknown = 'unset';
    await act(async () => {
      returned = await view.result.current.signInWithGoogle();
    });

    expect(returned).toBeNull();
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('signedOut');
    expect(view.result.current.token).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Firebase failure — thrown, never exchanged, never downgraded
// ---------------------------------------------------------------------------

describe('signInWithGoogle — a Firebase failure', () => {
  it('throws FirebaseAuthError and never reaches the exchange', async () => {
    mockFirebaseSignInWithGoogle.mockResolvedValue({
      kind: 'failure',
      code: 'auth/operation-not-allowed',
      message: 'Google sign-in is not enabled. Contact your administrator.',
    });

    const view = await mountSignedOut();
    const caught = await capture(view.result.current.signInWithGoogle());

    expect(caught).toBeInstanceOf(FirebaseAuthError);
    expect((caught as FirebaseAuthError).code).toBe('auth/operation-not-allowed');
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('signedOut');
  });
});

// ---------------------------------------------------------------------------
// Server refusal — REGISTRATION_REQUIRED propagates as an ApiError
// ---------------------------------------------------------------------------

describe('signInWithGoogle — the exchange refuses', () => {
  it('★ surfaces REGISTRATION_REQUIRED with no fallback', async () => {
    mockFirebaseSignInWithGoogle.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });
    mockFirebaseExchange.mockRejectedValue(
      new ApiError(403, 'REGISTRATION_REQUIRED', 'This sign-in is not linked yet.')
    );

    const view = await mountSignedOut();
    const caught = await capture(view.result.current.signInWithGoogle());

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBe('REGISTRATION_REQUIRED');
    expect(view.result.current.status).toBe('signedOut');
    expect(view.result.current.token).toBeNull();
  });

  it('★ surfaces ACCOUNT_DISABLED unchanged', async () => {
    mockFirebaseSignInWithGoogle.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });
    mockFirebaseExchange.mockRejectedValue(
      new ApiError(403, 'ACCOUNT_DISABLED', 'This account is disabled. Contact an administrator.')
    );

    const view = await mountSignedOut();
    const caught = await capture(view.result.current.signInWithGoogle());

    expect((caught as ApiError).code).toBe('ACCOUNT_DISABLED');
    expect(view.result.current.status).toBe('signedOut');
  });
});
