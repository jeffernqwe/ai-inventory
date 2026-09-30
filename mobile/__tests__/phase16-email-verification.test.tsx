/**
 * Phase 16 — the email-verification gate, as `lib/auth.tsx` actually runs it.
 *
 * WHY A SEPARATE SUITE. `auth-firebase-flow.test.tsx` pins what the sign-in and sign-up
 * call graph does for a VERIFIED identity. This file pins the other half — the state the
 * phase exists for: a Firebase identity Firebase has authenticated whose address it
 * reports as NOT verified.
 *
 * THE CLAIMS THAT MATTER, each chosen because the wrong implementation would still look
 * right under a weaker test:
 *
 *   1. NOTHING IS WRITTEN BEFORE VERIFICATION (RG-1/RG-2/RG-3). No tenant, no User, no
 *      session and no exchange — asserted as NEGATIVES, because a positive-only test
 *      would pass for an implementation that wrote everything and showed a screen.
 *   2. THE DECISION IS FIREBASE'S SIGNED CLAIM, READ LIVE (RG-11/L-7). The state comes
 *      from reloading the identity, never from the cached ID token and never from the
 *      provider name.
 *   3. THE POST-VERIFICATION TOKEN IS FORCED-REFRESH (RG-9). A cached token can still
 *      carry `email_verified: false`, so `getIdToken(true)` — and only that — may be
 *      presented to the server.
 *   4. A FAILURE TO READ THE STATE IS NOT AN ANSWER. A native fault must throw, never
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
// is derived from these three, not from the network.
const mockNativeSendEmailVerification = jest.fn();
const mockNativeReloadUser = jest.fn();
const mockNativeForceIdToken = jest.fn();

jest.mock('../lib/firebase-native', () => ({
  nativeSendEmailVerification: (...args: unknown[]) => mockNativeSendEmailVerification(...args),
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
const mockFirebaseUnlink = jest.fn();

jest.mock('../lib/api', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  register: (...args: unknown[]) => mockRegister(...args),
  firebaseExchange: (...args: unknown[]) => mockFirebaseExchange(...args),
  firebaseRegister: (...args: unknown[]) => mockFirebaseRegister(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
  me: (...args: unknown[]) => mockMe(...args),
  credentialsChanged: (...args: unknown[]) => mockCredentialsChanged(...args),
  firebaseLink: (...args: unknown[]) => mockFirebaseLink(...args),
  firebaseUnlink: (...args: unknown[]) => mockFirebaseUnlink(...args),
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

const USER = { id: 'u1', name: NAME, email: EMAIL, role: 'OWNER' as const };
const SESSION = { token: APP_TOKEN, tokenType: 'Bearer', expiresIn: '1d', user: USER };

/** The code `signIn` attaches to the refusal that routes a person to the verify screen. */
const FIREBASE_VERIFICATION_REQUIRED = 'firebase/verification-required';
const VERIFY_EMAIL_MESSAGE = 'Verify your email address to continue.';
const VERIFY_CHECK_FAILED_MESSAGE =
  'Unable to check your email verification status. Please try again.';
const RESEND_VERIFICATION_FAILED_MESSAGE =
  'Unable to send the verification email. Please try again.';
const NO_FIREBASE_TOKEN_MESSAGE = 'Your sign-in could not be refreshed. Please sign in again.';

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
  mockNativeSendEmailVerification.mockResolvedValue(undefined);
  mockNativeReloadUser.mockResolvedValue(true);
  mockNativeForceIdToken.mockResolvedValue(FORCED_TOKEN);
});

// ---------------------------------------------------------------------------
// Registration — no tenant, no session, until the address is verified
// ---------------------------------------------------------------------------

describe('signUp — the identity is created, and nothing else', () => {
  it('sends the verification email, and creates NO tenant and NO session', async () => {
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

    // The Firebase identity is created FIRST, and the verification email is sent from
    // it — asserted by call order, not merely by both having been called.
    expect(mockEnsureFirebaseAccount).toHaveBeenCalledTimes(1);
    expect(mockNativeSendEmailVerification).toHaveBeenCalledTimes(1);
    expect(mockEnsureFirebaseAccount.mock.invocationCallOrder[0]).toBeLessThan(
      mockNativeSendEmailVerification.mock.invocationCallOrder[0]!
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

  it('sends NO verification email when the identity could not be created', async () => {
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

    expect(mockNativeSendEmailVerification).not.toHaveBeenCalled();
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

describe('resendVerificationEmail', () => {
  it('asks Firebase to send the message again', async () => {
    const view = await mountSignedOut();
    await armVerification(view);
    mockNativeSendEmailVerification.mockClear();

    await act(async () => {
      await view.result.current.resendVerificationEmail();
    });

    expect(mockNativeSendEmailVerification).toHaveBeenCalledTimes(1);
    // The journey is unchanged: a resend does not verify anything and does not move
    // the state machine.
    expect(view.result.current.firebaseOnboarding).toBe('verify-email');
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
  });

  it('★ maps a native fault to a safe message, with no native text', async () => {
    const view = await mountSignedOut();
    await armVerification(view);
    mockNativeSendEmailVerification.mockRejectedValue(
      new Error('auth/too-many-requests: 500 attempts exceeded')
    );

    const caught = await capture(view.result.current.resendVerificationEmail());

    expect(caught).toBeInstanceOf(FirebaseAuthError);
    expect((caught as Error).message).toBe(RESEND_VERIFICATION_FAILED_MESSAGE);
    expect((caught as Error).message).not.toContain('too-many-requests');
    expect(view.result.current.firebaseOnboarding).toBe('verify-email');
  });
});

describe('completeEmailVerification', () => {
  it('reloads, and stays on the verify screen while the address is unverified', async () => {
    const view = await mountSignedOut();
    await armVerification(view);
    mockNativeReloadUser.mockResolvedValue(false);

    let result: unknown = 'unset';
    await act(async () => {
      result = await view.result.current.completeEmailVerification();
    });

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

  it('★ mints a FORCED-refresh token, never the cached one (RG-9)', async () => {
    const view = await mountSignedOut();
    await armVerification(view);
    mockNativeReloadUser.mockResolvedValue(true);

    await act(async () => {
      await view.result.current.completeEmailVerification();
    });

    expect(mockNativeForceIdToken).toHaveBeenCalledTimes(1);
    // The cached accessor is not used ANYWHERE on this road. A cached token can still
    // carry `email_verified: false`, so presenting it would have the server refuse the
    // very registration this step exists to complete.
    expect(mockCurrentFirebaseIdToken).not.toHaveBeenCalled();
    // And the FORCED token is what both server calls actually receive.
    expect(mockFirebaseExchange.mock.calls[0]![0].idToken).toBe(FORCED_TOKEN);
    expect(mockFirebaseExchange.mock.calls[0]![0].idToken).not.toBe(ID_TOKEN);
  });

  it('registers the pending tenant, exchanges, and applies the session in order', async () => {
    const view = await mountSignedOut();
    await armVerification(view);

    await act(async () => {
      await view.result.current.completeEmailVerification();
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

    mockNativeReloadUser.mockResolvedValue(true);
    await act(async () => {
      await view.result.current.completeEmailVerification();
    });

    expect(mockFirebaseRegister).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).toHaveBeenCalledTimes(1);
    expect(view.result.current.status).toBe('signedIn');
  });

  it('★ a reload fault leaves the person on the verify screen', async () => {
    const view = await mountSignedOut();
    await armVerification(view);
    mockNativeReloadUser.mockRejectedValue(new Error('auth/network-request-failed'));

    const caught = await capture(view.result.current.completeEmailVerification());

    expect(caught).toBeInstanceOf(FirebaseAuthError);
    expect((caught as Error).message).toBe(VERIFY_CHECK_FAILED_MESSAGE);
    expect(mockNativeForceIdToken).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.firebaseOnboarding).toBe('verify-email');
  });

  it('fails safely when no refreshed token can be minted', async () => {
    const view = await mountSignedOut();
    await armVerification(view);
    mockNativeReloadUser.mockResolvedValue(true);
    mockNativeForceIdToken.mockResolvedValue(null);

    const caught = await capture(view.result.current.completeEmailVerification());

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
    mockNativeReloadUser.mockResolvedValue(true);

    await capture(view.result.current.completeEmailVerification());
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

    // The state belongs to the provider instance and to nothing durable.
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
    // journey lives in `lib/auth.tsx` and the three native calls live in
    // `lib/firebase-native.ts`, so nothing here had to change. Its CACHED-token
    // accessor is exactly why RG-9 needs a separate forced-refresh call rather than an
    // edit to this file.
    expect(sha256(lf(read('lib/firebase-auth.ts')))).toBe(
      '8e81f10f2cc42306cb6d178b369c1cc07f4a76eef332ba76de3f2dac8ddf04d4'
    );
  });

  it('the verify screen carries no credential and reads no route parameter', () => {
    const source = read('app/verify-email.tsx');

    // The identity is read from the Firebase layer inside `lib/auth.tsx` at the moment
    // of use; the profile text comes from the in-memory onboarding state. A screen that
    // accepted a token through navigation would put a credential in a route.
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
