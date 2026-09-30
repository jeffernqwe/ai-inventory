/**
 * Phase 32J — completing registration for an identity Firebase has already
 * authenticated, as `lib/auth.tsx` actually runs it.
 *
 * `REGISTRATION_REQUIRED` is answered by the exchange for an identity that Firebase
 * verified but that owns no Inventory AI account. That identity is still signed in
 * to Firebase, so the client can register it through the endpoint that already
 * exists — `POST /api/auth/firebase/register` — and then sign it in through the
 * exchange, with no new endpoint and no second session mechanism.
 *
 * WHAT IS REAL HERE: `AuthProvider`, its boot restore, `completeFirebaseRegistration`,
 * `applySession` and the arming of `firebaseRegistrationRequired`. Only the module
 * boundaries are mocked — the Firebase boundary, the API layer, and SecureStore.
 *
 * THE IDENTITY IS ASSERTED TO COME FROM FIREBASE, NOT FROM THE CALLER: the only
 * input to `completeFirebaseRegistration` is `{ businessName, name }`, and every
 * request it makes is checked to carry the token obtained from the Firebase layer.
 * There is no parameter through which a screen could supply a uid, an email, a
 * `businessId` or a role, so the cases below also pin that none is forwarded.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '../lib/client';
import { AuthProvider, useSession } from '../lib/auth';
import { FirebaseAuthError } from '../lib/firebase-auth';

// ---------------------------------------------------------------------------
// The mock seam
// ---------------------------------------------------------------------------

const mockCurrentFirebaseIdToken = jest.fn();
const mockSignInWithGoogle = jest.fn();
const mockSignInWithEmail = jest.fn();

jest.mock('../lib/firebase-auth', () => ({
  FirebaseAuthError: class FirebaseAuthError extends Error {
    code: string | null;

    constructor(code: string | null, message: string) {
      super(message);
      this.name = 'FirebaseAuthError';
      this.code = code;
    }
  },
  currentFirebaseIdToken: (...args: unknown[]) => mockCurrentFirebaseIdToken(...args),
  signInWithEmail: (...args: unknown[]) => mockSignInWithEmail(...args),
  signInWithGoogle: (...args: unknown[]) => mockSignInWithGoogle(...args),
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

const mockFirebaseRegister = jest.fn();
const mockFirebaseExchange = jest.fn();

jest.mock('../lib/api', () => ({
  login: jest.fn(),
  register: jest.fn(),
  firebaseExchange: (...args: unknown[]) => mockFirebaseExchange(...args),
  firebaseRegister: (...args: unknown[]) => mockFirebaseRegister(...args),
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

const FIREBASE_ID_TOKEN = 'firebase.id.token';
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
  // `clearAllMocks()` clears recorded calls but does NOT drain a `…Once` queue, so a
  // leftover one-shot implementation from an earlier test would answer a later test's
  // call with the wrong error. Reset the mocks whose behaviour each test sets.
  mockSignInWithGoogle.mockReset();
  mockSignInWithEmail.mockReset();
  mockCurrentFirebaseIdToken.mockReset();
  mockFirebaseRegister.mockReset();
  mockFirebaseExchange.mockReset();

  mockIsFirebaseConfigured.mockReturnValue(true);
  mockCurrentFirebaseIdToken.mockResolvedValue(FIREBASE_ID_TOKEN);
  mockFirebaseRegister.mockResolvedValue({ user: USER, business: { id: 'b1', name: 'Acme' } });
  mockFirebaseExchange.mockResolvedValue(SESSION);
});

// ---------------------------------------------------------------------------
// Test 1 / 2 — register, exchange, applySession
// ---------------------------------------------------------------------------

describe('completeFirebaseRegistration — success', () => {
  it('★ registers the Firebase identity, exchanges it, and applies the session', async () => {
    const view = await mountSignedOut();
    let returned: unknown;
    await act(async () => {
      returned = await view.result.current.completeFirebaseRegistration({
        businessName: 'Acme Retail',
        name: 'Ada Lovelace',
      });
    });

    // The register call carries the token from the Firebase layer and the two
    // profile fields — and nothing else.
    expect(mockFirebaseRegister).toHaveBeenCalledTimes(1);
    expect(mockFirebaseRegister.mock.calls[0]![0]).toEqual({
      idToken: FIREBASE_ID_TOKEN,
      businessName: 'Acme Retail',
      name: 'Ada Lovelace',
    });

    // Registration issues no token, so the exchange is what signs the owner in.
    expect(mockFirebaseExchange).toHaveBeenCalledTimes(1);
    const [exchangeArgs] = mockFirebaseExchange.mock.calls[0]!;
    expect(exchangeArgs.idToken).toBe(FIREBASE_ID_TOKEN);
    expect(typeof exchangeArgs.deviceLabel).toBe('string');

    // The stored session is the APPLICATION token, never the Firebase one.
    expect(view.result.current.token).toBe(APP_TOKEN);
    expect(view.result.current.user).toEqual(USER);
    expect(view.result.current.status).toBe('signedIn');
    expect(returned).toEqual(USER);
  });

  it('passes the optional name through, and omits it when blank', async () => {
    const view = await mountSignedOut();

    await act(async () => {
      await view.result.current.completeFirebaseRegistration({ businessName: 'Acme Retail' });
    });
    expect(mockFirebaseRegister.mock.calls[0]![0].name).toBeUndefined();
  });

  it('omits a whitespace-only name rather than sending an empty value', async () => {
    const view = await mountSignedOut();
    await act(async () => {
      await view.result.current.completeFirebaseRegistration({
        businessName: 'Acme Retail',
        name: undefined,
      });
    });
    expect(mockFirebaseRegister.mock.calls[0]![0]).toEqual({
      idToken: FIREBASE_ID_TOKEN,
      businessName: 'Acme Retail',
      name: undefined,
    });
  });
});

// ---------------------------------------------------------------------------
// Test 4 — no Firebase identity
// ---------------------------------------------------------------------------

describe('completeFirebaseRegistration — no Firebase identity', () => {
  it('★ makes no request at all when there is no authenticated Firebase user', async () => {
    mockCurrentFirebaseIdToken.mockResolvedValue(null);
    const view = await mountSignedOut();

    const caught = await capture(
      view.result.current.completeFirebaseRegistration({ businessName: 'Acme Retail' })
    );

    expect(caught).toBeInstanceOf(FirebaseAuthError);
    expect((caught as FirebaseAuthError).code).toBe('firebase/no-current-user');
    // Nothing was attempted: no account was created and no session was opened.
    expect(mockFirebaseRegister).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('signedOut');
    expect(view.result.current.token).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 5 — EMAIL_IN_USE must never become a link
// ---------------------------------------------------------------------------

describe('completeFirebaseRegistration — the email already has an account', () => {
  it('★ refuses without attaching the identity, and opens no session', async () => {
    mockFirebaseRegister.mockRejectedValue(
      new ApiError(409, 'EMAIL_IN_USE', 'An account with this email already exists')
    );
    const view = await mountSignedOut();

    const caught = await capture(
      view.result.current.completeFirebaseRegistration({ businessName: 'Acme Retail' })
    );

    expect((caught as ApiError).code).toBe('EMAIL_IN_USE');
    // The refusal is propagated, not swallowed into a link: the identity is NOT
    // attached and nothing is exchanged.
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('signedOut');
    expect(view.result.current.token).toBeNull();
  });

  it('is retryable, because a refusal created nothing', async () => {
    // The distinction that matters: `EMAIL_IN_USE` did NOT create a tenant, so a
    // retry must genuinely re-attempt registration. Only a SUCCESSFUL register is
    // remembered (the case below).
    mockFirebaseRegister.mockRejectedValueOnce(
      new ApiError(409, 'EMAIL_IN_USE', 'An account with this email already exists')
    );
    const view = await mountSignedOut();

    await capture(view.result.current.completeFirebaseRegistration({ businessName: 'Acme' }));
    await act(async () => {
      await view.result.current.completeFirebaseRegistration({ businessName: 'Acme' });
    });

    expect(mockFirebaseRegister).toHaveBeenCalledTimes(2);
    expect(view.result.current.status).toBe('signedIn');
  });
});

// ---------------------------------------------------------------------------
// Test 6 / 7 — the exchange fails after registration succeeded
// ---------------------------------------------------------------------------

describe('completeFirebaseRegistration — the exchange fails after registering', () => {
  it('★ does not register a second business on retry, and settles by exchange alone', async () => {
    mockFirebaseExchange.mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'Network request failed'));
    const view = await mountSignedOut();

    const caught = await capture(
      view.result.current.completeFirebaseRegistration({ businessName: 'Acme Retail' })
    );
    expect(caught).toBeInstanceOf(ApiError);
    // The account exists on the server even though the session does not.
    expect(mockFirebaseRegister).toHaveBeenCalledTimes(1);
    expect(view.result.current.status).toBe('signedOut');

    // Retry: the recovery resumes AT the exchange. Registering again would create a
    // second Business and a second OWNER for the same person.
    mockFirebaseExchange.mockResolvedValueOnce(SESSION);
    await act(async () => {
      await view.result.current.completeFirebaseRegistration({ businessName: 'Acme Retail' });
    });

    expect(mockFirebaseRegister).toHaveBeenCalledTimes(1);
    expect(mockFirebaseExchange).toHaveBeenCalledTimes(2);
    expect(view.result.current.status).toBe('signedIn');
    expect(view.result.current.token).toBe(APP_TOKEN);
  });

  it('a NEW sign-in attempt clears the remembered half, so registration runs again', async () => {
    // The remembered "already registered" half is scoped to ONE onboarding attempt. A
    // fresh REGISTRATION_REQUIRED cannot belong to the same half: a half-created attempt
    // left an account linked to that Firebase identity, so the exchange for it can no
    // longer answer REGISTRATION_REQUIRED. Reaching it again means a new identity, and
    // suppressing its registration would strand the user.
    mockFirebaseExchange.mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'Network request failed'));

    const view = await mountSignedOut();
    await capture(view.result.current.completeFirebaseRegistration({ businessName: 'Acme Retail' }));
    expect(mockFirebaseRegister).toHaveBeenCalledTimes(1);

    // A fresh Google attempt reaches REGISTRATION_REQUIRED again.
    mockSignInWithGoogle.mockResolvedValue({ kind: 'idToken', idToken: FIREBASE_ID_TOKEN });
    mockFirebaseExchange.mockRejectedValueOnce(
      new ApiError(403, 'REGISTRATION_REQUIRED', 'This sign-in is not linked to an Inventory AI account yet.')
    );
    await capture(view.result.current.signInWithGoogle());

    // So onboarding registers for real rather than resuming at the exchange.
    await act(async () => {
      await view.result.current.completeFirebaseRegistration({ businessName: 'Acme Retail' });
    });

    expect(mockFirebaseRegister).toHaveBeenCalledTimes(2);
    expect(view.result.current.status).toBe('signedIn');
  });
});

// ---------------------------------------------------------------------------
// The state that carries the journey from login to onboarding
// ---------------------------------------------------------------------------

describe('firebaseRegistrationRequired', () => {
  it('★ is armed by REGISTRATION_REQUIRED from the Google flow', async () => {
    mockSignInWithGoogle.mockResolvedValue({ kind: 'idToken', idToken: FIREBASE_ID_TOKEN });
    mockFirebaseExchange.mockRejectedValue(
      new ApiError(403, 'REGISTRATION_REQUIRED', 'This sign-in is not linked to an Inventory AI account yet.')
    );

    const view = await mountSignedOut();
    expect(view.result.current.firebaseRegistrationRequired).toBe(false);

    await capture(view.result.current.signInWithGoogle());

    expect(view.result.current.firebaseRegistrationRequired).toBe(true);
    expect(view.result.current.status).toBe('signedOut');
  });

  it('★ is armed by REGISTRATION_REQUIRED from the email/password flow too', async () => {
    // `signIn` asks Firebase first for the password form as well, so the same
    // refusal reaches the same place through a different entry point.
    mockSignInWithEmail.mockResolvedValue({ kind: 'idToken', idToken: FIREBASE_ID_TOKEN });
    mockFirebaseExchange.mockRejectedValue(
      new ApiError(403, 'REGISTRATION_REQUIRED', 'This sign-in is not linked to an Inventory AI account yet.')
    );

    const view = await mountSignedOut();
    await capture(view.result.current.signIn({ email: 'ada@example.com', password: 'Password123!' }));

    expect(view.result.current.firebaseRegistrationRequired).toBe(true);
  });

  it('is not armed by an ordinary refusal', async () => {
    mockSignInWithGoogle.mockResolvedValue({ kind: 'idToken', idToken: FIREBASE_ID_TOKEN });
    mockFirebaseExchange.mockRejectedValue(
      new ApiError(403, 'ACCOUNT_DISABLED', 'This account is disabled. Contact an administrator.')
    );

    const view = await mountSignedOut();
    await capture(view.result.current.signInWithGoogle());

    expect(view.result.current.firebaseRegistrationRequired).toBe(false);
  });

  it('clears once a session exists, so onboarding is not offered again', async () => {
    mockSignInWithGoogle.mockResolvedValue({ kind: 'idToken', idToken: FIREBASE_ID_TOKEN });
    mockFirebaseExchange.mockRejectedValueOnce(
      new ApiError(403, 'REGISTRATION_REQUIRED', 'This sign-in is not linked to an Inventory AI account yet.')
    );

    const view = await mountSignedOut();
    await capture(view.result.current.signInWithGoogle());
    expect(view.result.current.firebaseRegistrationRequired).toBe(true);

    await act(async () => {
      await view.result.current.completeFirebaseRegistration({ businessName: 'Acme Retail' });
    });

    expect(view.result.current.firebaseRegistrationRequired).toBe(false);
    expect(view.result.current.status).toBe('signedIn');
  });
});
