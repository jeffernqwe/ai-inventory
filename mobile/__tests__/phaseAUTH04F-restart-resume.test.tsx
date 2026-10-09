/**
 * AUTH-04-F — the READ-ONLY restart/resume probe (owner-ratified Option A).
 *
 * On every SIGNED-OUT launch, `lib/auth.tsx` asks the persisted native Firebase identity
 * where the person belongs. This file pins that decision and — more importantly — the
 * things it must never do.
 *
 * THE PROBE PROVES NOTHING AND MINTS NOTHING. For all four states it must:
 *
 *   * never sign in (no session, no token, status stays `signedOut`);
 *   * never exchange a Firebase ID token, even a VERIFIED one — a verified identity is
 *     sent to Login and must be signed in by the person, not by the probe;
 *   * never mint or apply an Inventory AI session;
 *   * never clear or sign out the durable Firebase identity, not even on failure;
 *   * never automatically retry — the unreachable state's Try Again is user-driven.
 *
 * THE FOUR STATES (plus the two defensive fallbacks):
 *
 *   no Firebase configuration          -> Login        ('none')
 *   no persisted identity              -> Login        ('none')
 *   persisted identity, verified       -> Login        ('none', user-driven)
 *   persisted identity, unverified     -> verify-email
 *   identity present, state unreadable -> verify-unreachable
 *
 * Only the module boundaries are mocked; the provider and the probe are the real ones.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AuthProvider, useSession } from '../lib/auth';

// ---------------------------------------------------------------------------
// The mock seam
// ---------------------------------------------------------------------------

const mockSignInWithEmail = jest.fn();
const mockSignInWithGoogle = jest.fn();
const mockEnsureFirebaseAccount = jest.fn();
const mockSignOutOfFirebase = jest.fn();
const mockCurrentFirebaseIdToken = jest.fn();
const mockConfirmFirebaseSignIn = jest.fn();

jest.mock('../lib/firebase-auth', () => ({
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
  ensureFirebaseAccount: (...args: unknown[]) => mockEnsureFirebaseAccount(...args),
  signOutOfFirebase: (...args: unknown[]) => mockSignOutOfFirebase(...args),
  currentFirebaseIdToken: (...args: unknown[]) => mockCurrentFirebaseIdToken(...args),
  confirmFirebaseSignIn: (...args: unknown[]) => mockConfirmFirebaseSignIn(...args),
}));

const mockNativeHasCurrentUser = jest.fn();
const mockNativeReloadUser = jest.fn();
const mockNativeForceIdToken = jest.fn();

jest.mock('../lib/firebase-native', () => ({
  nativeHasCurrentUser: (...args: unknown[]) => mockNativeHasCurrentUser(...args),
  nativeReloadUser: (...args: unknown[]) => mockNativeReloadUser(...args),
  nativeForceIdToken: (...args: unknown[]) => mockNativeForceIdToken(...args),
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
const mockCredentialsChanged = jest.fn();
const mockFirebaseLink = jest.fn();
const mockRequestEmailVerification = jest.fn();
const mockConfirmEmailVerification = jest.fn();

jest.mock('../lib/api', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  register: (...args: unknown[]) => mockRegister(...args),
  firebaseExchange: (...args: unknown[]) => mockFirebaseExchange(...args),
  firebaseRegister: (...args: unknown[]) => mockFirebaseRegister(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
  me: (...args: unknown[]) => mockMe(...args),
  credentialsChanged: (...args: unknown[]) => mockCredentialsChanged(...args),
  firebaseLink: (...args: unknown[]) => mockFirebaseLink(...args),
  requestEmailVerification: (...args: unknown[]) => mockRequestEmailVerification(...args),
  confirmEmailVerification: (...args: unknown[]) => mockConfirmEmailVerification(...args),
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => {}),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => {}),
}));

const secureStore = jest.requireMock('expo-secure-store') as {
  setItemAsync: jest.Mock;
  getItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

/** Boots a signed-out provider and waits for the status to settle. */
async function mountSignedOut() {
  const view = await renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
  return view;
}

/** Asserts the probe wrote nothing durable and opened no session. */
function expectNoSessionAndNoSignOut(view: Awaited<ReturnType<typeof mountSignedOut>>) {
  expect(view.result.current.status).toBe('signedOut');
  expect(view.result.current.token).toBeNull();
  expect(view.result.current.user).toBeNull();
  expect(mockFirebaseExchange).not.toHaveBeenCalled();
  expect(mockFirebaseRegister).not.toHaveBeenCalled();
  expect(mockRequestEmailVerification).not.toHaveBeenCalled();
  expect(mockConfirmEmailVerification).not.toHaveBeenCalled();
  expect(mockNativeForceIdToken).not.toHaveBeenCalled();
  // The durable Firebase identity is neither cleared nor signed out by a probe.
  expect(mockSignOutOfFirebase).not.toHaveBeenCalled();
  expect(secureStore.setItemAsync).not.toHaveBeenCalled();
  expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsFirebaseConfigured.mockReturnValue(true);
  mockSignOutOfFirebase.mockResolvedValue(undefined);
  mockFirebaseExchange.mockResolvedValue({ token: 'x', user: { id: 'u1' } });
  mockNativeHasCurrentUser.mockReturnValue(false);
  mockNativeReloadUser.mockResolvedValue(true);
  mockNativeForceIdToken.mockResolvedValue('forced');
});

// ---------------------------------------------------------------------------
// The four states
// ---------------------------------------------------------------------------

describe('the resume probe — Login states', () => {
  it('no Firebase configuration -> Login, and the identity is never consulted', async () => {
    mockIsFirebaseConfigured.mockReturnValue(false);

    const view = await mountSignedOut();
    // Give the boot effect a turn to complete.
    await act(async () => {});

    expect(view.result.current.firebaseOnboarding).toBe('none');
    expect(mockNativeHasCurrentUser).not.toHaveBeenCalled();
    expect(mockNativeReloadUser).not.toHaveBeenCalled();
    expectNoSessionAndNoSignOut(view);
  });

  it('no persisted identity -> Login, without asking Firebase to reload', async () => {
    mockNativeHasCurrentUser.mockReturnValue(false);

    const view = await mountSignedOut();
    await waitFor(() => expect(mockNativeHasCurrentUser).toHaveBeenCalled());

    expect(view.result.current.firebaseOnboarding).toBe('none');
    expect(mockNativeReloadUser).not.toHaveBeenCalled();
    expectNoSessionAndNoSignOut(view);
  });

  it('★ a VERIFIED identity -> Login, and is NEVER auto-exchanged', async () => {
    mockNativeHasCurrentUser.mockReturnValue(true);
    mockNativeReloadUser.mockResolvedValue(true);

    const view = await mountSignedOut();
    await waitFor(() => expect(mockNativeReloadUser).toHaveBeenCalledTimes(1));

    // The ratified rule: only a user-driven sign-in may open a session. The probe reads
    // the state and stops.
    expect(view.result.current.firebaseOnboarding).toBe('none');
    expect(mockNativeForceIdToken).not.toHaveBeenCalled();
    expectNoSessionAndNoSignOut(view);
  });
});

describe('the resume probe — verification states', () => {
  it('an unverified identity -> the verify screen', async () => {
    mockNativeHasCurrentUser.mockReturnValue(true);
    mockNativeReloadUser.mockResolvedValue(false);

    const view = await mountSignedOut();
    await waitFor(() => expect(view.result.current.firebaseOnboarding).toBe('verify-email'));

    expect(mockNativeReloadUser).toHaveBeenCalledTimes(1);
    // Being routed to the verify screen mints nothing: the person still has no session.
    expectNoSessionAndNoSignOut(view);
  });

  it('★ an unreadable identity -> the unreachable state, and the identity survives', async () => {
    mockNativeHasCurrentUser.mockReturnValue(true);
    mockNativeReloadUser.mockRejectedValue(new Error('auth/network-request-failed'));

    const view = await mountSignedOut();
    await waitFor(() =>
      expect(view.result.current.firebaseOnboarding).toBe('verify-unreachable')
    );

    // The probe failed, but it neither cleared the durable identity nor retried on its own.
    expect(mockNativeReloadUser).toHaveBeenCalledTimes(1);
    expectNoSessionAndNoSignOut(view);
  });

  it('an identity probe that itself faults -> Login, never a verification screen', async () => {
    mockNativeHasCurrentUser.mockImplementation(() => {
      throw new Error('native module unavailable');
    });

    const view = await mountSignedOut();
    await act(async () => {});

    // A fault while asking whether an identity exists cannot confirm one, so the safe
    // answer is Login.
    expect(view.result.current.firebaseOnboarding).toBe('none');
    expect(mockNativeReloadUser).not.toHaveBeenCalled();
    expectNoSessionAndNoSignOut(view);
  });
});

// ---------------------------------------------------------------------------
// Try Again is user-driven
// ---------------------------------------------------------------------------

describe('retryVerificationResume', () => {
  async function mountUnreachable() {
    mockNativeHasCurrentUser.mockReturnValue(true);
    mockNativeReloadUser.mockRejectedValueOnce(new Error('offline'));
    const view = await mountSignedOut();
    await waitFor(() =>
      expect(view.result.current.firebaseOnboarding).toBe('verify-unreachable')
    );
    return view;
  }

  it('★ does NOT auto-retry — only a user action re-runs the probe', async () => {
    const view = await mountUnreachable();

    // Time passing changes nothing: there is no loop.
    await act(async () => {});
    expect(view.result.current.firebaseOnboarding).toBe('verify-unreachable');
    expect(mockNativeReloadUser).toHaveBeenCalledTimes(1);
  });

  it('re-runs the probe and moves to Login once the state reads verified', async () => {
    const view = await mountUnreachable();
    mockNativeReloadUser.mockResolvedValue(true);

    await act(async () => {
      await view.result.current.retryVerificationResume();
    });

    expect(view.result.current.firebaseOnboarding).toBe('none');
    // Even a retry that reads a verified identity does not open a session.
    expectNoSessionAndNoSignOut(view);
  });

  it('stays unreachable while the state is still unreadable', async () => {
    const view = await mountUnreachable();
    mockNativeReloadUser.mockRejectedValue(new Error('still offline'));

    await act(async () => {
      await view.result.current.retryVerificationResume();
    });

    expect(view.result.current.firebaseOnboarding).toBe('verify-unreachable');
    expectNoSessionAndNoSignOut(view);
  });
});
