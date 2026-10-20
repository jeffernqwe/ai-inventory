/**
 * AUTH-04-F — the custom SIX-DIGIT email-verification code flow, driven through the real
 * `AuthProvider`.
 *
 * `phase16-email-verification.test.tsx` pins the Phase 16 gate (an unverified identity
 * writes nothing and never reaches the exchange) and the renamed members. THIS file pins
 * the AUTH-04-F additions as a coherent journey, with the server's own failure taxonomy:
 *
 *   1. THE FULL JOURNEY. Register -> request a code -> confirm it -> reload -> forced
 *      refresh -> register the tenant -> exchange -> session, in that order, and the
 *      session is the same Inventory AI JWT every other route produces.
 *   2. A FAILED CONFIRM WRITES NOTHING. A wrong, expired or exhausted code is ONE server
 *      refusal and no reload, mint, register or exchange may follow it.
 *   3. THE SERVER'S FAILURE TAXONOMY IS PROPAGATED, NOT FLATTENED. `EMAIL_VERIFICATION_*`
 *      and `FIREBASE_TOKEN_INVALID` arrive as the `ApiError`s they are, so a screen can
 *      render the specific reason; and because neither call carries an Inventory AI token,
 *      a 400 `FIREBASE_TOKEN_INVALID` can never be mistaken for session loss.
 *   4. CONFIGURATION / DELIVERY FAILURES MINT NOTHING. A 503 `..._NOT_CONFIGURED` leaves
 *      the person signed out with no session.
 *
 * Only the module boundaries are mocked. The provider, its onboarding state machine and
 * its call graph are the real ones.
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
const CODE = '654321';

const USER = { id: 'u1', name: NAME, email: EMAIL, role: 'OWNER' as const };
const SESSION = { token: APP_TOKEN, tokenType: 'Bearer', expiresIn: '1d', user: USER };

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

async function mountSignedOut() {
  const view = await renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
  return view;
}

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
  mockSignOutOfFirebase.mockResolvedValue(undefined);
  mockRequestEmailVerification.mockResolvedValue({ message: 'sent' });
  mockConfirmEmailVerification.mockResolvedValue({ message: 'Email verified.' });
  mockNativeHasCurrentUser.mockReturnValue(false);
  mockNativeReloadUser.mockResolvedValue(true);
  mockNativeForceIdToken.mockResolvedValue(FORCED_TOKEN);
});

// ---------------------------------------------------------------------------
// The full journey
// ---------------------------------------------------------------------------

describe('registration -> code -> session', () => {
  it('★ walks the whole journey in order and ends with an Inventory AI session', async () => {
    mockEnsureFirebaseAccount.mockResolvedValue({ idToken: ID_TOKEN });
    mockCurrentFirebaseIdToken.mockResolvedValue(ID_TOKEN);

    const view = await mountSignedOut();

    // 1. Registration creates the Firebase identity and asks the server for a code.
    await act(async () => {
      await view.result.current.signUp({
        businessName: BUSINESS_NAME,
        name: NAME,
        email: EMAIL,
        password: PASSWORD,
      });
    });
    expect(view.result.current.firebaseOnboarding).toBe('verify-email');
    expect(view.result.current.token).toBeNull();

    // 2. Confirm the code; the context reloads, force-refreshes, registers and exchanges.
    await act(async () => {
      await view.result.current.confirmVerificationCode(CODE);
    });

    // The order is the operation. Each step must precede the next.
    expect(mockEnsureFirebaseAccount.mock.invocationCallOrder[0]).toBeLessThan(
      mockRequestEmailVerification.mock.invocationCallOrder[0]!
    );
    expect(mockRequestEmailVerification.mock.invocationCallOrder[0]).toBeLessThan(
      mockConfirmEmailVerification.mock.invocationCallOrder[0]!
    );
    expect(mockConfirmEmailVerification.mock.invocationCallOrder[0]).toBeLessThan(
      mockNativeForceIdToken.mock.invocationCallOrder[0]!
    );
    expect(mockNativeForceIdToken.mock.invocationCallOrder[0]).toBeLessThan(
      mockFirebaseRegister.mock.invocationCallOrder[0]!
    );
    expect(mockFirebaseRegister.mock.invocationCallOrder[0]).toBeLessThan(
      mockFirebaseExchange.mock.invocationCallOrder[0]!
    );

    // And the session is the SAME Inventory AI JWT every other route produces.
    expect(view.result.current.status).toBe('signedIn');
    expect(view.result.current.token).toBe(APP_TOKEN);
    expect(view.result.current.firebaseOnboarding).toBe('none');
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('★ never mints a session before the code is confirmed', async () => {
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

    // Identity exists, code is in flight — and there is still NO session, NO tenant and
    // NO exchange. Asserted as negatives because that is the whole point of the gate.
    expect(view.result.current.status).toBe('signedOut');
    expect(view.result.current.token).toBeNull();
    expect(mockFirebaseRegister).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Failure taxonomy
// ---------------------------------------------------------------------------

describe('a failed confirm writes nothing', () => {
  async function armed() {
    const view = await mountSignedOut();
    mockEnsureFirebaseAccount.mockResolvedValue({ idToken: ID_TOKEN });
    await act(async () => {
      await view.result.current.signUp({
        businessName: BUSINESS_NAME,
        name: NAME,
        email: EMAIL,
        password: PASSWORD,
      });
    });
    mockCurrentFirebaseIdToken.mockResolvedValue(ID_TOKEN);
    return view;
  }

  it('★ an invalid code propagates as the server refusal and changes nothing', async () => {
    const view = await armed();
    // Firebase still reports the address UNVERIFIED — the ordinary wrong-code case. The
    // refusal is checked against Firebase before it is reported (see the recovery case
    // below), so the reload DOES run; it must decide nothing else.
    mockNativeReloadUser.mockResolvedValue(false);
    const invalid = new ApiError(400, 'INVALID_VERIFICATION_CODE', 'That code is not valid.');
    mockConfirmEmailVerification.mockRejectedValue(invalid);

    const caught = await capture(view.result.current.confirmVerificationCode('000000'));

    expect(caught).toBe(invalid);
    expect((caught as ApiError).code).toBe('INVALID_VERIFICATION_CODE');
    expect(mockNativeReloadUser).toHaveBeenCalledTimes(1);
    expect(mockNativeForceIdToken).not.toHaveBeenCalled();
    expect(mockFirebaseRegister).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('signedOut');
    expect(view.result.current.token).toBeNull();
  });

  it('★ a code the server already spent can still finish the journey', async () => {
    const view = await armed();
    // THE DEAD END THIS CLOSES. The server consumes the challenge as part of a successful
    // confirmation, so any failure AFTER that write — this response being lost, the reload,
    // the forced refresh, registration, the exchange — leaves the person holding a code the
    // server now refuses. Retrying it could only produce "invalid or has expired", and a
    // new code is a silent no-op for an already-verified identity. So when the refusal
    // arrives, Firebase is asked: it reports the address verified, because the code did its
    // job, and the journey continues exactly as the success path would have.
    mockConfirmEmailVerification.mockRejectedValue(
      new ApiError(400, 'INVALID_VERIFICATION_CODE', 'That code is not valid.')
    );
    mockNativeReloadUser.mockResolvedValue(true);

    await act(async () => {
      await view.result.current.confirmVerificationCode(CODE);
    });

    expect(mockConfirmEmailVerification).toHaveBeenCalledTimes(1);
    expect(mockNativeForceIdToken).toHaveBeenCalledTimes(1);
    expect(mockFirebaseRegister).toHaveBeenCalledTimes(1);
    expect(mockFirebaseExchange).toHaveBeenCalledTimes(1);
    expect(view.result.current.status).toBe('signedIn');
    expect(view.result.current.token).toBe(APP_TOKEN);
  });

  it('★ a validation refusal is preserved with its field problems', async () => {
    const view = await armed();
    mockNativeReloadUser.mockResolvedValue(false);
    mockConfirmEmailVerification.mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Check the form.', [
        { field: 'code', message: 'That code is too long.' },
      ])
    );

    const caught = await capture(view.result.current.confirmVerificationCode('1234567'));

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBe('VALIDATION_ERROR');
    expect((caught as ApiError).fields?.[0]?.field).toBe('code');
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
  });

  it('★ a bad Firebase credential is a 400, never a session-loss 401/403', async () => {
    const view = await armed();
    // The AUTH-04 endpoints are PRE-SESSION, so this call carries no Inventory AI token.
    // `lib/client.ts` reports session loss only for a token-bearing 401/403, which is why
    // this is deliberately answered 400 — an unrelated provider failure must not sign a
    // person out.
    const badToken = new ApiError(400, 'FIREBASE_TOKEN_INVALID', 'Your sign-in has expired.');
    mockNativeReloadUser.mockResolvedValue(false);
    mockConfirmEmailVerification.mockRejectedValue(badToken);

    const caught = await capture(view.result.current.confirmVerificationCode(CODE));

    expect((caught as ApiError).status).toBe(400);
    expect((caught as ApiError).code).toBe('FIREBASE_TOKEN_INVALID');
    expect(view.result.current.status).toBe('signedOut');
    expect(mockSignOutOfFirebase).not.toHaveBeenCalled();
  });
});

describe('configuration and delivery failures mint nothing', () => {
  it('★ a 503 NOT_CONFIGURED on request leaves the person signed out', async () => {
    const view = await mountSignedOut();
    mockEnsureFirebaseAccount.mockResolvedValue({ idToken: ID_TOKEN });
    await act(async () => {
      await view.result.current.signUp({
        businessName: BUSINESS_NAME,
        name: NAME,
        email: EMAIL,
        password: PASSWORD,
      });
    });
    mockRequestEmailVerification.mockClear();
    mockCurrentFirebaseIdToken.mockResolvedValue(ID_TOKEN);
    mockRequestEmailVerification.mockRejectedValue(
      new ApiError(503, 'EMAIL_VERIFICATION_NOT_CONFIGURED', 'Not configured.')
    );

    const caught = await capture(view.result.current.requestVerificationCode());

    expect((caught as ApiError).code).toBe('EMAIL_VERIFICATION_NOT_CONFIGURED');
    expect(view.result.current.status).toBe('signedOut');
    expect(view.result.current.token).toBeNull();
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
  });

  it('★ a 503 MAIL_FAILED on confirm mints no session and no tenant', async () => {
    const view = await mountSignedOut();
    mockEnsureFirebaseAccount.mockResolvedValue({ idToken: ID_TOKEN });
    await act(async () => {
      await view.result.current.signUp({
        businessName: BUSINESS_NAME,
        name: NAME,
        email: EMAIL,
        password: PASSWORD,
      });
    });
    mockCurrentFirebaseIdToken.mockResolvedValue(ID_TOKEN);
    mockNativeReloadUser.mockResolvedValue(false);
    mockConfirmEmailVerification.mockRejectedValue(
      new ApiError(503, 'EMAIL_VERIFICATION_MAIL_FAILED', 'Could not send mail.')
    );

    const caught = await capture(view.result.current.confirmVerificationCode(CODE));

    expect((caught as ApiError).code).toBe('EMAIL_VERIFICATION_MAIL_FAILED');
    expect(mockFirebaseRegister).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('signedOut');
  });

  it('★ a missing Firebase identity is a FirebaseAuthError, not a network call', async () => {
    const view = await mountSignedOut();
    mockCurrentFirebaseIdToken.mockResolvedValue(null);

    const caught = await capture(view.result.current.requestVerificationCode());

    expect(caught).toBeInstanceOf(FirebaseAuthError);
    expect((caught as FirebaseAuthError).code).toBe('firebase/no-current-user');
    expect(mockRequestEmailVerification).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Option B — the INITIAL code request fails during signUp
// ---------------------------------------------------------------------------

/**
 * AUTH-04-F (Option B) — when the Firebase identity is created but the FIRST
 * `requestEmailVerification` fails, the person must enter the verification journey
 * immediately instead of being stranded on /register. The same three failure classes the
 * audit covered, each pinned on the exact `signUp()` path.
 */
describe('signUp — the initial code request fails (Option B)', () => {
  const FAILURES = [
    {
      label: '429 EMAIL_VERIFICATION_RATE_LIMITED',
      status: 429,
      code: 'EMAIL_VERIFICATION_RATE_LIMITED',
      message: 'Too many verification attempts. Please wait a moment and try again.',
    },
    {
      label: '503 EMAIL_VERIFICATION_NOT_CONFIGURED',
      status: 503,
      code: 'EMAIL_VERIFICATION_NOT_CONFIGURED',
      message: 'Email verification is temporarily unavailable. Please try again later.',
    },
    {
      label: '503 EMAIL_VERIFICATION_MAIL_FAILED',
      status: 503,
      code: 'EMAIL_VERIFICATION_MAIL_FAILED',
      message: 'The verification email could not be sent. Please try again shortly.',
    },
  ];

  for (const failure of FAILURES) {
    it(`★ ${failure.label} — arms the journey, keeps the context, writes nothing`, async () => {
      mockEnsureFirebaseAccount.mockResolvedValue({ idToken: ID_TOKEN });
      mockRequestEmailVerification.mockRejectedValue(
        new ApiError(failure.status, failure.code, failure.message)
      );

      const view = await mountSignedOut();
      let result: unknown = 'unset';
      await act(async () => {
        result = await view.result.current.signUp({
          businessName: BUSINESS_NAME,
          name: NAME,
          email: EMAIL,
          password: PASSWORD,
        });
      });

      // 1 & 3 — the verification journey is armed and the SAME in-memory registration
      // context the success path would carry is preserved.
      expect(view.result.current.firebaseOnboarding).toBe('verify-email');
      expect(view.result.current.pendingRegistration).toEqual({
        businessName: BUSINESS_NAME,
        name: NAME,
      });
      // 4 — the failure is surfaced safely, using the server's own client-safe sentence.
      expect(view.result.current.verificationEntryError).toBe(failure.message);
      // ...and NO code is claimed to be in flight: the send failed, so the screen must not
      // present a countdown for mail that was never accepted.
      expect(view.result.current.verificationCodeIssuedAt).toBeNull();

      // 12 — no Inventory AI JWT/session, and nothing written server-side. Negatives,
      // because a positive-only assertion would pass for an implementation that wrote.
      expect(result).toBeNull();
      expect(view.result.current.status).toBe('signedOut');
      expect(view.result.current.token).toBeNull();
      expect(mockFirebaseRegister).not.toHaveBeenCalled();
      expect(mockFirebaseExchange).not.toHaveBeenCalled();
      expect(mockRegister).not.toHaveBeenCalled();
      expect(mockLogin).not.toHaveBeenCalled();

      // 5/6/8 — the failure is NOT auto-resent: exactly one attempt, the initial one, and
      // the identity helper ran once, so no duplicate Firebase account was created.
      expect(mockRequestEmailVerification).toHaveBeenCalledTimes(1);
      expect(mockRequestEmailVerification).toHaveBeenCalledWith({ idToken: ID_TOKEN });
      expect(mockEnsureFirebaseAccount).toHaveBeenCalledTimes(1);
    });
  }

  it('★ the entry reason is one-shot and clears when the person acts', async () => {
    mockEnsureFirebaseAccount.mockResolvedValue({ idToken: ID_TOKEN });
    mockRequestEmailVerification.mockRejectedValue(
      new ApiError(503, 'EMAIL_VERIFICATION_MAIL_FAILED', 'The verification email could not be sent.')
    );

    const view = await mountSignedOut();
    await act(async () => {
      await view.result.current.signUp({
        businessName: BUSINESS_NAME,
        name: NAME,
        email: EMAIL,
        password: PASSWORD,
      });
    });
    expect(view.result.current.verificationEntryError).toBeTruthy();

    await act(async () => {
      view.result.current.clearVerificationEntryError();
    });
    expect(view.result.current.verificationEntryError).toBeNull();
    // Clearing it changes nothing about the journey or the session.
    expect(view.result.current.firebaseOnboarding).toBe('verify-email');
    expect(view.result.current.status).toBe('signedOut');
  });

  it('★ an explicit resend from the verify screen creates NO second Firebase account', async () => {
    mockEnsureFirebaseAccount.mockResolvedValue({ idToken: ID_TOKEN });
    mockRequestEmailVerification.mockRejectedValueOnce(
      new ApiError(503, 'EMAIL_VERIFICATION_NOT_CONFIGURED', 'Temporarily unavailable.')
    );

    const view = await mountSignedOut();
    await act(async () => {
      await view.result.current.signUp({
        businessName: BUSINESS_NAME,
        name: NAME,
        email: EMAIL,
        password: PASSWORD,
      });
    });

    // The person now presses Send on the verify screen. That path reads the live Firebase
    // identity and never calls `ensureFirebaseAccount`, so it cannot create another account.
    mockCurrentFirebaseIdToken.mockResolvedValue(ID_TOKEN);
    mockRequestEmailVerification.mockResolvedValue({ message: 'sent' });
    await act(async () => {
      await view.result.current.requestVerificationCode();
    });

    expect(mockEnsureFirebaseAccount).toHaveBeenCalledTimes(1);
    expect(mockRequestEmailVerification).toHaveBeenCalledTimes(2);
    expect(view.result.current.firebaseOnboarding).toBe('verify-email');
    expect(view.result.current.status).toBe('signedOut');
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
  });

  it('★ the success path is unchanged — a resolving request arms with NO entry reason', async () => {
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

    expect(view.result.current.firebaseOnboarding).toBe('verify-email');
    // A successful send has nothing to explain, so no stale reason can linger.
    expect(view.result.current.verificationEntryError).toBeNull();
    // ...and the send is RECORDED, so the verify screen can say a code is in flight and
    // start its countdown from the server's own window instead of offering a send that
    // could only be refused. No timestamp is invented for a journey that sent nothing.
    expect(view.result.current.verificationCodeIssuedAt).toEqual(expect.any(Number));
  });
});
