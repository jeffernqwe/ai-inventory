/**
 * Resuming a verified Firebase identity that has no Inventory AI session.
 *
 * THE DEFECT THIS PINS, found by reading the boot path rather than by a crash: a
 * `REGISTRATION_REQUIRED` refusal arms the business-name screen from IN-MEMORY state, and
 * a cold start deliberately restores no session. So a person who was refused, closed the
 * app and reopened it arrived at Login holding a verified Firebase identity that the app
 * could see but could not act on — the form was reachable only by retyping a password
 * Firebase had already accepted.
 *
 * THE RULES THAT MUST SURVIVE THE FIX:
 *
 *   1. The boot probe STILL proves nothing and mints nothing. A verified identity produces
 *      a flag for a control, never a session: `firebaseExchange` must not be called.
 *   2. Only a TAP exchanges. `continueWithPersistedIdentity` is the action the control
 *      calls, and it is the only path here that can produce a token.
 *   3. The tap re-checks verification at the moment of use, so a stale probe cannot
 *      bypass the unverified gate.
 *   4. `REGISTRATION_REQUIRED` still arms the onboarding route — that is the journey the
 *      person lost, and the resume is how they get back to it.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AuthProvider, useSession } from '../lib/auth';

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

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

const ID_TOKEN = 'firebase-id-token';
const USER = { id: 'u1', name: 'Ada', email: 'owner@example.com', role: 'OWNER' as const };

async function mountSignedOut() {
  const view = await renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsFirebaseConfigured.mockReturnValue(true);
  mockSignOutOfFirebase.mockResolvedValue(true);
  mockNativeHasCurrentUser.mockReturnValue(false);
  mockNativeReloadUser.mockResolvedValue(true);
  mockCurrentFirebaseIdToken.mockResolvedValue(ID_TOKEN);
  mockFirebaseExchange.mockResolvedValue({ token: 'jwt', user: USER });
});

describe('the boot probe', () => {
  it('★ reports a verified persisted identity WITHOUT exchanging anything', async () => {
    mockNativeHasCurrentUser.mockReturnValue(true);

    const view = await mountSignedOut();

    await waitFor(() =>
      expect(view.result.current.hasResumableFirebaseIdentity).toBe(true)
    );
    expect(view.result.current.firebaseOnboarding).toBe('none');
    // The rule this fix must not bend: a launch alone opens no session.
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.token).toBeNull();
  });

  it('reports nothing when no identity is present', async () => {
    const view = await mountSignedOut();

    await waitFor(() => expect(view.result.current.hasResumableFirebaseIdentity).toBe(false));
  });

  it('★ keeps an UNVERIFIED identity on the verification road, not the resume one', async () => {
    mockNativeHasCurrentUser.mockReturnValue(true);
    mockNativeReloadUser.mockResolvedValue(false);

    const view = await mountSignedOut();

    await waitFor(() => expect(view.result.current.firebaseOnboarding).toBe('verify-email'));
    expect(view.result.current.hasResumableFirebaseIdentity).toBe(false);
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
  });
});

describe('continueWithPersistedIdentity', () => {
  it('★ exchanges exactly once and signs in with the server session', async () => {
    mockNativeHasCurrentUser.mockReturnValue(true);
    const view = await mountSignedOut();
    await waitFor(() =>
      expect(view.result.current.hasResumableFirebaseIdentity).toBe(true)
    );

    await act(async () => {
      await view.result.current.continueWithPersistedIdentity();
    });

    expect(mockFirebaseExchange).toHaveBeenCalledTimes(1);
    expect(mockFirebaseExchange).toHaveBeenCalledWith({
      idToken: ID_TOKEN,
      deviceLabel: expect.any(String),
    });
    expect(view.result.current.status).toBe('signedIn');
    expect(view.result.current.user).toEqual(USER);
    // The offer is spent once the session exists.
    expect(view.result.current.hasResumableFirebaseIdentity).toBe(false);
  });

  it('★ re-checks verification instead of trusting the probe', async () => {
    mockNativeHasCurrentUser.mockReturnValue(true);
    const view = await mountSignedOut();
    await waitFor(() =>
      expect(view.result.current.hasResumableFirebaseIdentity).toBe(true)
    );

    // The address became unverified between launch and the tap.
    mockNativeReloadUser.mockResolvedValue(false);

    await act(async () => {
      await expect(view.result.current.continueWithPersistedIdentity()).rejects.toMatchObject({
        name: 'FirebaseAuthError',
      });
    });

    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.firebaseOnboarding).toBe('verify-email');
    expect(view.result.current.status).toBe('signedOut');
  });

  it('★ hands REGISTRATION_REQUIRED back to the onboarding route', async () => {
    mockNativeHasCurrentUser.mockReturnValue(true);
    const view = await mountSignedOut();
    await waitFor(() =>
      expect(view.result.current.hasResumableFirebaseIdentity).toBe(true)
    );

    const { ApiError } = jest.requireActual('../lib/client') as {
      ApiError: new (status: number, code: string, message: string) => Error;
    };
    mockFirebaseExchange.mockRejectedValue(
      new ApiError(403, 'REGISTRATION_REQUIRED', 'Please create a business account to continue.')
    );

    await act(async () => {
      await expect(view.result.current.continueWithPersistedIdentity()).rejects.toBeTruthy();
    });

    expect(view.result.current.firebaseRegistrationRequired).toBe(true);
    expect(view.result.current.status).toBe('signedOut');
    // Nothing was minted by a refusal.
    expect(view.result.current.token).toBeNull();
  });

  it('★ a vanished identity clears the offer instead of failing silently', async () => {
    mockNativeHasCurrentUser.mockReturnValue(true);
    const view = await mountSignedOut();
    await waitFor(() =>
      expect(view.result.current.hasResumableFirebaseIdentity).toBe(true)
    );

    mockCurrentFirebaseIdToken.mockResolvedValue(null);

    await act(async () => {
      await expect(view.result.current.continueWithPersistedIdentity()).rejects.toMatchObject({
        code: 'firebase/no-current-user',
      });
    });

    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.hasResumableFirebaseIdentity).toBe(false);
  });
});
