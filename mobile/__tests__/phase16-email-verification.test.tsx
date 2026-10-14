/**
 * Phase 16 — the email-verification gate, as `lib/auth.tsx` actually runs it.
 *
 * WHY A SEPARATE SUITE. `auth-firebase-flow.test.tsx` pins what the sign-in and sign-up
 * call graph does for a VERIFIED identity. This file pins the other half — the state the
 * phase exists for: a Firebase identity Firebase has authenticated whose address it
 * reports as NOT verified.
 *
 * AUTH-04-F — the verification UX is now the custom SIX-DIGIT CODE flow, so the members
 * under test are `requestVerificationCode` (mints and mails a code server-side) and
 * `confirmVerificationCode(code)` (confirms the code, then reloads, force-refreshes and
 * completes the journey). The claims below are unchanged in spirit and re-pinned on the
 * new shape:
 *
 *   1. NOTHING IS WRITTEN BEFORE VERIFICATION (RG-1/RG-2/RG-3). No tenant, no User, no
 *      session and no exchange — asserted as NEGATIVES, because a positive-only test
 *      would pass for an implementation that wrote everything and showed a screen.
 *   2. THE DECISION IS FIREBASE'S SIGNED CLAIM, READ LIVE (RG-11/L-7). The state comes
 *      from reloading the identity, never from the cached ID token and never from the
 *      provider name.
 *   3. THE POST-VERIFICATION TOKEN IS FORCED-REFRESH (RG-9). A cached token can still
 *      carry `email_verified: false`, so `getIdToken(true)` — and only that — may be
 *      presented to register/exchange. The cached token is used ONLY as the confirm
 *      credential.
 *   4. A FAILED CONFIRM CHANGES NOTHING. A wrong, expired or exhausted code propagates
 *      the server's one refusal and never reloads, mints or exchanges.
 *   5. A FAILURE TO READ THE STATE IS NOT AN ANSWER. A native fault must throw, never
 *      collapse to "not verified", or a network blip would send a verified person down
 *      the verification road.
 *
 * Only the module boundaries are mocked: `lib/firebase-auth`, the native verification
 * boundary, `lib/config`, `lib/api` and SecureStore. The provider, its onboarding state
 * machine and its call graph are the real ones.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';

import { ApiError } from '../lib/client';
import { AuthProvider, useSession } from '../lib/auth';
import { FirebaseAuthError } from '../lib/firebase-auth';

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
  // A real class, so `instanceof` means the same thing on both sides of the seam.
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

// The native boundary is mocked with MOCK-PREFIXED bindings so each case can drive the
// verification state directly. That is the whole point of the file: the answer under test
// is derived from THIS identity — whether one exists, what Firebase says about it, and what
// a forced refresh returns — not from the network.
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMAIL = 'owner@example.com';
const PASSWORD = 'Password123!';
const BUSINESS_NAME = 'Acme Retail';
const NAME = 'Ada';
const ID_TOKEN = 'fake.id.token';
const FORCED_TOKEN = 'forced.refreshed.id.token';
const APP_TOKEN = 'inventory-ai.jwt';
const CODE = '123456';

const USER = { id: 'u1', name: NAME, email: EMAIL, role: 'OWNER' as const };
const SESSION = { token: APP_TOKEN, tokenType: 'Bearer', expiresIn: '1d', user: USER };

/** The code `signIn` attaches to the refusal that routes a person to the verify screen. */
const FIREBASE_VERIFICATION_REQUIRED = 'firebase/verification-required';
const VERIFY_EMAIL_MESSAGE = 'Verify your email address to continue.';
const VERIFY_CHECK_FAILED_MESSAGE =
  'Unable to check your email verification status. Please try again.';
const NO_FIREBASE_TOKEN_MESSAGE = 'Your sign-in could not be refreshed. Please sign in again.';
const NO_FIREBASE_IDENTITY = 'firebase/no-current-user';

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

async function mountSignedOut() {
  const view = await renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
  return view;
}

/** Runs a call expected to reject and returns what it threw, inside `act`. */
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
  mockFirebaseRegister.mockResolvedValue({ user: USER, business: { id: 'b1' } });
  mockLogin.mockResolvedValue(SESSION);
  mockLogout.mockResolvedValue({ message: 'Signed out' });
  mockSignOutOfFirebase.mockResolvedValue(undefined);
  mockRequestEmailVerification.mockResolvedValue({ message: 'sent' });
  mockConfirmEmailVerification.mockResolvedValue({ message: 'Email verified.' });
  // The restart/resume probe runs on every signed-out boot. With no persisted identity it
  // is a no-op that never reloads, so it cannot disturb the cases below; the probe's own
  // four-state behaviour is pinned in its own suite.
  mockNativeHasCurrentUser.mockReturnValue(false);
  mockNativeReloadUser.mockResolvedValue(true);
  mockNativeForceIdToken.mockResolvedValue(FORCED_TOKEN);
});

// ---------------------------------------------------------------------------
// Registration — no tenant, no session, until the address is verified
// ---------------------------------------------------------------------------

describe('signUp — the identity is created, and nothing else', () => {
  it('requests the verification code, and creates NO tenant and NO session', async () => {
    mockEnsureFirebaseAccount.mockResolvedValue({ idToken: ID_TOKEN });

    const view = await mountSignedOut();
    let result: unknown;
    await act(async () => {
      result = await view.result.current.signUp({
        businessName: BUSINESS_NAME,
        name: NAME,
        email: EMAIL,
        password: PASSWORD,
      });
    });

    // The Firebase identity is created FIRST, and the AUTH-04 server mints and mails the
    // code from the token it returns — asserted by call order, not merely by both having
    // been called. The plaintext code never reaches this app.
    expect(mockEnsureFirebaseAccount).toHaveBeenCalledTimes(1);
    expect(mockRequestEmailVerification).toHaveBeenCalledTimes(1);
    expect(mockRequestEmailVerification).toHaveBeenCalledWith({ idToken: ID_TOKEN });
    expect(mockEnsureFirebaseAccount.mock.invocationCallOrder[0]).toBeLessThan(
      mockRequestEmailVerification.mock.invocationCallOrder[0]!
    );

    // RG-1/RG-2/RG-3 — asserted as NEGATIVES. This is the claim the phase rests on: an
    // unverified identity owns no Business and no User, so it can hold no session.
    expect(mockFirebaseRegister).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockLogin).not.toHaveBeenCalled();

    // `null` is the defined answer: "identity created, no session yet".
    expect(result).toBeNull();
    expect(view.result.current.status).toBe('signedOut');
    expect(view.result.current.token).toBeNull();
    expect(view.result.current.firebaseOnboarding).toBe('verify-email');
  });

  it('keeps the profile text in memory, so no route parameter has to carry it', async () => {
    mockEnsureFirebaseAccount.mockResolvedValue({ idToken: ID_TOKEN });

    const view = await mountSignedOut();
    await act(async () => {
      await view.result.current.signUp({
        businessName: BUSINESS_NAME,
        name: NAME,
        email: EMAIL,
        password: PASSWORD,
      });
    });

    // PROFILE TEXT ONLY. There is deliberately no token, uid or email field here — the
    // identity is read from Firebase at the moment of use, and the rest is the server's.
    expect(view.result.current.pendingRegistration).toEqual({
      businessName: BUSINESS_NAME,
      name: NAME,
    });
  });

  it('requests NO verification code when the identity could not be created', async () => {
    mockEnsureFirebaseAccount.mockRejectedValue(
      new FirebaseAuthError(
        'auth/email-already-in-use',
        'An account with this email already exists. Sign in instead.'
      )
    );

    const view = await mountSignedOut();
    await capture(
      view.result.current.signUp({
        businessName: BUSINESS_NAME,
        name: NAME,
        email: EMAIL,
        password: PASSWORD,
      })
    );

    expect(mockRequestEmailVerification).not.toHaveBeenCalled();
    expect(view.result.current.firebaseOnboarding).toBe('none');
    expect(view.result.current.pendingRegistration).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sign-in — the gate runs BEFORE any server call
// ---------------------------------------------------------------------------

describe('signIn — an unverified identity never reaches the exchange', () => {
  it('arms the verify screen and does NOT exchange the token', async () => {
    mockSignInWithEmail.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });
    mockNativeReloadUser.mockResolvedValue(false);

    const view = await mountSignedOut();
    const caught = await capture(view.result.current.signIn({ email: EMAIL, password: PASSWORD }));

    expect(caught).toBeInstanceOf(FirebaseAuthError);
    expect((caught as FirebaseAuthError).code).toBe(FIREBASE_VERIFICATION_REQUIRED);
    expect((caught as Error).message).toBe(VERIFY_EMAIL_MESSAGE);

    // THE POINT OF THE PHASE: the exchange is the step that would answer
    // REGISTRATION_REQUIRED and route this person into business-name onboarding. It
    // must not run at all.
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(mockLogin).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('signedOut');
    expect(view.result.current.firebaseOnboarding).toBe('verify-email');
  });

  it('reads the LIVE state, never the cached ID token (RG-11/L-7)', async () => {
    mockSignInWithEmail.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });
    mockNativeReloadUser.mockResolvedValue(true);

    const view = await mountSignedOut();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    expect(mockNativeReloadUser).toHaveBeenCalledTimes(1);
    // The cached-token accessor is not the gate. A cached token can still carry the
    // pre-verification claim, which is exactly what must not decide this.
    expect(mockCurrentFirebaseIdToken).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('signedIn');
  });

  it('★ a native READ FAULT throws rather than answering "not verified"', async () => {
    mockSignInWithEmail.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });
    mockNativeReloadUser.mockRejectedValue(new Error('network request failed'));

    const view = await mountSignedOut();
    const caught = await capture(view.result.current.signIn({ email: EMAIL, password: PASSWORD }));

    // If this collapsed to `false`, a network blip would send a verified person down
    // the verification road and they could never get past it.
    expect(caught).toBeInstanceOf(FirebaseAuthError);
    expect((caught as Error).message).toBe(VERIFY_CHECK_FAILED_MESSAGE);
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.firebaseOnboarding).toBe('none');
  });

  it('carries no native error text into what a person reads', async () => {
    const NATIVE_TEXT = 'DEVELOPER_ERROR: SHA-1 mismatch for com.inventoryai.app';
    mockSignInWithEmail.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });
    mockNativeReloadUser.mockRejectedValue(new Error(NATIVE_TEXT));

    const view = await mountSignedOut();
    const caught = await capture(view.result.current.signIn({ email: EMAIL, password: PASSWORD }));

    expect((caught as Error).message).not.toContain('DEVELOPER_ERROR');
    expect((caught as Error).message).not.toContain('com.inventoryai.app');
  });
});

describe('the Google flow runs through the same gate', () => {
  it('★ holds an unverified Google identity at the verify screen, with no exchange', async () => {
    mockSignInWithGoogle.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });
    mockNativeReloadUser.mockResolvedValue(false);

    const view = await mountSignedOut();
    const caught = await capture(view.result.current.signInWithGoogle());

    expect((caught as FirebaseAuthError).code).toBe(FIREBASE_VERIFICATION_REQUIRED);
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.firebaseOnboarding).toBe('verify-email');
  });

  it('lets a verified Google identity through unchanged', async () => {
    mockSignInWithGoogle.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });
    mockNativeReloadUser.mockResolvedValue(true);

    const view = await mountSignedOut();
    await act(async () => {
      await view.result.current.signInWithGoogle();
    });

    expect(mockFirebaseExchange).toHaveBeenCalledTimes(1);
    expect(view.result.current.status).toBe('signedIn');
    expect(view.result.current.token).toBe(APP_TOKEN);
  });
});

// ---------------------------------------------------------------------------
// The verify screen's actions, driven through the context
// ---------------------------------------------------------------------------

/** Signs up so the context sits in the verify-email state with a pending tenant. */
async function armVerification(view: Awaited<ReturnType<typeof mountSignedOut>>) {
  mockEnsureFirebaseAccount.mockResolvedValue({ idToken: ID_TOKEN });
  await act(async () => {
    await view.result.current.signUp({
      businessName: BUSINESS_NAME,
      name: NAME,
      email: EMAIL,
      password: PASSWORD,
    });
  });
  expect(view.result.current.firebaseOnboarding).toBe('verify-email');
}

describe('requestVerificationCode', () => {
  it('asks the AUTH-04 server for a fresh code, reading the identity at the moment of use', async () => {
    const view = await mountSignedOut();
    await armVerification(view);
    mockRequestEmailVerification.mockClear();
    mockCurrentFirebaseIdToken.mockResolvedValue(ID_TOKEN);

    await act(async () => {
      await view.result.current.requestVerificationCode();
    });

    // The identity is read HERE, not handed in by a screen, so no screen holds a token.
    expect(mockCurrentFirebaseIdToken).toHaveBeenCalledTimes(1);
    expect(mockRequestEmailVerification).toHaveBeenCalledTimes(1);
    expect(mockRequestEmailVerification).toHaveBeenCalledWith({ idToken: ID_TOKEN });
    // A request does not verify anything and does not move the state machine.
    expect(view.result.current.firebaseOnboarding).toBe('verify-email');
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
  });

  it('★ throws a FirebaseAuthError when no Firebase identity is present', async () => {
    const view = await mountSignedOut();
    await armVerification(view);
    mockRequestEmailVerification.mockClear();
    mockCurrentFirebaseIdToken.mockResolvedValue(null);

    const caught = await capture(view.result.current.requestVerificationCode());

    expect(caught).toBeInstanceOf(FirebaseAuthError);
    expect((caught as FirebaseAuthError).code).toBe(NO_FIREBASE_IDENTITY);
    // Nothing was sent with a null token.
    expect(mockRequestEmailVerification).not.toHaveBeenCalled();
  });

  it('★ propagates the server refusal unchanged, so the screen can read Retry-After', async () => {
    const view = await mountSignedOut();
    await armVerification(view);
    mockRequestEmailVerification.mockClear();
    mockCurrentFirebaseIdToken.mockResolvedValue(ID_TOKEN);
    const limited = new ApiError(429, 'EMAIL_VERIFICATION_RATE_LIMITED', 'Too many requests');
    mockRequestEmailVerification.mockRejectedValue(limited);

    const caught = await capture(view.result.current.requestVerificationCode());

    // The screen renders the cooldown from the server's own number, so this must arrive
    // as the ApiError it is rather than being collapsed to a generic message.
    expect(caught).toBe(limited);
    expect((caught as ApiError).status).toBe(429);
    expect((caught as ApiError).code).toBe('EMAIL_VERIFICATION_RATE_LIMITED');
    expect(view.result.current.firebaseOnboarding).toBe('verify-email');
  });
});

describe('confirmVerificationCode', () => {
  it('confirms the code, and stays on the verify screen while the address is unverified', async () => {
    const view = await mountSignedOut();
    await armVerification(view);
    mockCurrentFirebaseIdToken.mockResolvedValue(ID_TOKEN);
    mockNativeReloadUser.mockResolvedValue(false);

    let result: unknown = 'unset';
    await act(async () => {
      result = await view.result.current.confirmVerificationCode(CODE);
    });

    expect(mockConfirmEmailVerification).toHaveBeenCalledTimes(1);
    expect(mockConfirmEmailVerification).toHaveBeenCalledWith({ idToken: ID_TOKEN, code: CODE });
    expect(mockNativeReloadUser).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
    // Still-unverified is an ORDINARY state, not an error: nothing is written and the
    // person is not moved anywhere.
    expect(mockNativeForceIdToken).not.toHaveBeenCalled();
    expect(mockFirebaseRegister).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.firebaseOnboarding).toBe('verify-email');
    expect(view.result.current.status).toBe('signedOut');
  });

  it('★ a rejected code changes nothing — no reload, no mint, no exchange', async () => {
    const view = await mountSignedOut();
    await armVerification(view);
    mockCurrentFirebaseIdToken.mockResolvedValue(ID_TOKEN);
    // The server answers ONE indistinguishable refusal for wrong, expired, exhausted,
    // absent and already-used codes.
    const invalid = new ApiError(400, 'INVALID_VERIFICATION_CODE', 'That code is not valid.');
    mockConfirmEmailVerification.mockRejectedValue(invalid);

    const caught = await capture(view.result.current.confirmVerificationCode('000000'));

    expect(caught).toBe(invalid);
    expect((caught as ApiError).code).toBe('INVALID_VERIFICATION_CODE');
    // The confirm failed, so nothing downstream may have run.
    expect(mockNativeReloadUser).not.toHaveBeenCalled();
    expect(mockNativeForceIdToken).not.toHaveBeenCalled();
    expect(mockFirebaseRegister).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.firebaseOnboarding).toBe('verify-email');
  });

  it('★ mints a FORCED-refresh token for register/exchange, never the cached one (RG-9)', async () => {
    const view = await mountSignedOut();
    await armVerification(view);
    mockCurrentFirebaseIdToken.mockResolvedValue(ID_TOKEN);
    mockNativeReloadUser.mockResolvedValue(true);

    await act(async () => {
      await view.result.current.confirmVerificationCode(CODE);
    });

    // The CACHED token is only ever the CONFIRM credential; the FORCED token is what the
    // server sees for everything after the address is verified.
    expect(mockConfirmEmailVerification.mock.calls[0]![0].idToken).toBe(ID_TOKEN);
    expect(mockNativeForceIdToken).toHaveBeenCalledTimes(1);
    expect(mockNativeForceIdToken.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockConfirmEmailVerification.mock.invocationCallOrder[0]!
    );
    // The cached accessor is not used for the exchange. A cached token can still carry
    // `email_verified: false`, so presenting it would have the server refuse the very
    // registration this step exists to complete.
    expect(mockFirebaseExchange.mock.calls[0]![0].idToken).toBe(FORCED_TOKEN);
    expect(mockFirebaseExchange.mock.calls[0]![0].idToken).not.toBe(ID_TOKEN);
  });

  it('registers the pending tenant, exchanges, and applies the session in order', async () => {
    const view = await mountSignedOut();
    await armVerification(view);
    mockCurrentFirebaseIdToken.mockResolvedValue(ID_TOKEN);

    await act(async () => {
      await view.result.current.confirmVerificationCode(CODE);
    });

    expect(mockFirebaseRegister).toHaveBeenCalledTimes(1);
    expect(mockFirebaseRegister).toHaveBeenCalledWith({
      idToken: FORCED_TOKEN,
      businessName: BUSINESS_NAME,
      name: NAME,
    });
    expect(mockFirebaseRegister.mock.invocationCallOrder[0]).toBeLessThan(
      mockFirebaseExchange.mock.invocationCallOrder[0]!
    );

    // A session exists ONLY now. It is the same Inventory AI JWT every other route
    // produces, so no session rule changed for this flow.
    expect(view.result.current.status).toBe('signedIn');
    expect(view.result.current.token).toBe(APP_TOKEN);
    // The journey is over, and its in-memory state is gone with it.
    expect(view.result.current.firebaseOnboarding).toBe('none');
    expect(view.result.current.pendingRegistration).toBeNull();
  });

  it('does NOT register a tenant when sign-in was what armed the screen', async () => {
    // An identity that already owns a tenant, but whose address was unverified, arms
    // the screen with NO pending registration. Completing it must resume AT the
    // exchange, not create a second business for the same person.
    const view = await mountSignedOut();
    mockSignInWithEmail.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });
    mockNativeReloadUser.mockResolvedValue(false);
    await capture(view.result.current.signIn({ email: EMAIL, password: PASSWORD }));
    expect(view.result.current.pendingRegistration).toBeNull();

    mockCurrentFirebaseIdToken.mockResolvedValue(ID_TOKEN);
    mockNativeReloadUser.mockResolvedValue(true);
    await act(async () => {
      await view.result.current.confirmVerificationCode(CODE);
    });

    expect(mockFirebaseRegister).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).toHaveBeenCalledTimes(1);
    expect(view.result.current.status).toBe('signedIn');
  });

  it('★ a reload fault after a successful confirm leaves the person on the verify screen', async () => {
    const view = await mountSignedOut();
    await armVerification(view);
    mockCurrentFirebaseIdToken.mockResolvedValue(ID_TOKEN);
    mockNativeReloadUser.mockRejectedValue(new Error('auth/network-request-failed'));

    const caught = await capture(view.result.current.confirmVerificationCode(CODE));

    expect(caught).toBeInstanceOf(FirebaseAuthError);
    expect((caught as Error).message).toBe(VERIFY_CHECK_FAILED_MESSAGE);
    expect(mockNativeForceIdToken).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.firebaseOnboarding).toBe('verify-email');
  });

  it('fails safely when no refreshed token can be minted', async () => {
    const view = await mountSignedOut();
    await armVerification(view);
    mockCurrentFirebaseIdToken.mockResolvedValue(ID_TOKEN);
    mockNativeReloadUser.mockResolvedValue(true);
    mockNativeForceIdToken.mockResolvedValue(null);

    const caught = await capture(view.result.current.confirmVerificationCode(CODE));

    expect(caught).toBeInstanceOf(FirebaseAuthError);
    expect((caught as Error).message).toBe(NO_FIREBASE_TOKEN_MESSAGE);
    // Nothing was sent with a null token, and no half-registration was written.
    expect(mockFirebaseRegister).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.firebaseOnboarding).toBe('verify-email');
  });

  it('routes a REGISTRATION_REQUIRED refusal into the business-name onboarding', async () => {
    // A verified identity with no tenant is the ONE case that still needs the
    // business-name screen — and it is reached only AFTER verification, which is the
    // distinction this phase exists to draw.
    const view = await mountSignedOut();
    mockSignInWithEmail.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });
    mockNativeReloadUser.mockResolvedValue(false);
    await capture(view.result.current.signIn({ email: EMAIL, password: PASSWORD }));

    mockFirebaseExchange.mockRejectedValue(
      new ApiError(403, 'REGISTRATION_REQUIRED', 'No account exists for this identity')
    );
    mockCurrentFirebaseIdToken.mockResolvedValue(ID_TOKEN);
    mockNativeReloadUser.mockResolvedValue(true);

    await capture(view.result.current.confirmVerificationCode(CODE));
    expect(view.result.current.firebaseOnboarding).toBe('register');
    expect(view.result.current.firebaseRegistrationRequired).toBe(true);
  });
});

describe('cancelFirebaseOnboarding', () => {
  it('★ ends the Firebase session and resets the whole journey', async () => {
    const view = await mountSignedOut();
    await armVerification(view);

    await act(async () => {
      await view.result.current.cancelFirebaseOnboarding();
    });

    // The durable Firebase session is ended, not merely forgotten locally.
    expect(mockSignOutOfFirebase).toHaveBeenCalledTimes(1);
    expect(view.result.current.firebaseOnboarding).toBe('none');
    expect(view.result.current.pendingRegistration).toBeNull();
    expect(view.result.current.firebaseRegistrationRequired).toBe(false);
    expect(view.result.current.status).toBe('signedOut');
    expect(view.result.current.token).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The state is in memory, and only in memory
// ---------------------------------------------------------------------------

describe('the onboarding state is never persisted', () => {
  it('writes no verification state to SecureStore', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as { setItemAsync: jest.Mock };

    const view = await mountSignedOut();
    await armVerification(view);

    const written = secureStore.setItemAsync.mock.calls.flat().map(String).join('|');
    expect(written).not.toContain('verify-email');
    expect(written).not.toContain('businessName');
    expect(written).not.toContain(BUSINESS_NAME);
  });

  it('a fresh provider does not resume the journey from storage', async () => {
    const first = await mountSignedOut();
    await armVerification(first);

    // The state belongs to the provider instance and to nothing durable. (With no
    // persisted Firebase identity — `nativeHasCurrentUser` false — the boot probe answers
    // `none`, so a fresh provider is genuinely at rest.)
    const second = await mountSignedOut();
    expect(second.result.current.firebaseOnboarding).toBe('none');
    expect(second.result.current.pendingRegistration).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Source guards — what must NOT have moved
// ---------------------------------------------------------------------------

describe('the frozen modules stayed frozen', () => {
  const MOBILE_ROOT = join(__dirname, '..');
  const read = (relative: string) => readFileSync(join(MOBILE_ROOT, relative), 'utf8');
  // EOL-normalised, so the pin describes the CONTENT rather than the checkout's
  // line-ending configuration.
  const lf = (source: string) => source.replace(/\r\n/g, '\n');
  const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

  it('★ lib/firebase-auth.ts is byte-identical', () => {
    // THE FROZEN MODULE, and the reason the boundary grew instead. The verification
    // journey lives in `lib/auth.tsx` and the native calls live in
    // `lib/firebase-native.ts`, so nothing here had to change. Its CACHED-token
    // accessor is exactly why RG-9 needs a separate forced-refresh call rather than an
    // edit to this file.
    //
    // MOVED ONCE, DELIBERATELY, ON 2026-10-14 — AND NOT BY THIS FEATURE. This pin was
    // written to catch the VERIFICATION journey encroaching on this module, and a
    // whole-file hash cannot tell that apart from an unrelated fix landing in it. The
    // unrelated fix is the one that moved it: two rows were added to the user-facing
    // `FAILURE_MESSAGES` table — `auth/wrong-password` -> "Invalid email or password"
    // (the server's own sentence, word for word) and `auth/missing-email` -> "Enter your
    // email address." — because both codes were falling through to the generic "Unable
    // to sign in. Please try again." for mistakes a person can actually fix. The whole
    // change is `git diff`-visible as +28 lines and 0 deletions, in one hunk, entirely
    // inside that table.
    //
    // WHAT DID *NOT* MOVE, so this pin's real claim still stands: no outcome union, no
    // code classification, no entry of `LEGACY_FALLBACK_CODES`, no policy, and not the
    // cached-token accessor this comment is about. Those are pinned by BEHAVIOUR in
    // `firebase-auth.test.ts` — `the two codes that open the legacy route`, the
    // unconfigured-build case, and `currentFirebaseIdToken`. That is what makes a
    // whole-file hash a scope TRIPWIRE (it forces exactly this deliberation) rather than
    // the thing that actually protects behaviour. Re-freezing it points the tripwire at
    // the next change instead of at this one.
    expect(sha256(lf(read('lib/firebase-auth.ts')))).toBe(
      'bf729373209f08fb1bc4d265c8b9e1b6575c13a8fdd996c59b1d60f551ec6170'
    );
  });

  it('the verify screen carries no credential and reads no route parameter', () => {
    const source = read('app/verify-email.tsx');

    // The identity is read from the Firebase layer inside `lib/auth.tsx` at the moment
    // of use; the profile text comes from the in-memory onboarding state; the code leaves
    // only in the confirm request body. A screen that accepted a token through navigation
    // would put a credential in a route.
    expect(source).not.toMatch(/useLocalSearchParams/);
    expect(source).not.toMatch(/idToken/);
    expect(source).not.toMatch(/firebaseUid/);
    expect(source).not.toMatch(/passwordHash/);
  });

  it('lib/auth.tsx never names the native Firebase packages', () => {
    // The boundary invariant: only `lib/firebase-native.ts` LOADS or NAMES
    // `@react-native-firebase/*`. Becoming a second permitted IMPORTER of the boundary
    // is not the same thing as becoming a second loader of the native package.
    expect(read('lib/auth.tsx')).not.toMatch(/@react-native-firebase/);
  });
});
