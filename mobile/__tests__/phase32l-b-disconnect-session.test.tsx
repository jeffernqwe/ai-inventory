/**
 * Phase 32L-B — the DISCONNECT orchestration in `lib/auth.tsx`, as it actually runs.
 *
 * THE PHASE'S SECURITY PROPERTY IS AN ORDERING, NOT A VALUE, so most of what is
 * asserted here is a NEGATIVE or a SEQUENCE: that the Firebase session is ended only
 * AFTER the server answered 200, that `api.logout` is NEVER called once the server
 * has already revoked the session in the same transition, that a terminal refusal
 * neither tears anything down nor triggers a confirmation, and that a freshness
 * refusal is HANDED BACK after one request — so the caller, not this frame, performs
 * the second confirmation and supplies the second password.
 *
 * WHAT IS REAL HERE: `AuthProvider`, its boot restore, `applySession`, `endSession`,
 * `sessionLostRef`, and the whole `disconnectFirebase` / `confirmFirebaseSignIn` call
 * graph. Only the module boundaries are mocked — the Firebase module, the API layer,
 * `lib/firebase`, and SecureStore. The server is a mock, so this file proves the
 * CLIENT's contract against `POST /api/auth/firebase/unlink`, not the server's own
 * behaviour (which `server/test/phase32l-firebase-unlink.test.mjs` owns).
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
const mockSignOutOfFirebase = jest.fn();
const mockCurrentFirebaseIdToken = jest.fn();
const mockConfirmFirebaseSignIn = jest.fn();

jest.mock('../lib/firebase-auth', () => ({
  // A real class, so `instanceof` in the provider's own code and in these assertions
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
const mockLogin = jest.fn();
const mockLogout = jest.fn();
const mockMe = jest.fn();
const mockFirebaseUnlink = jest.fn();

jest.mock('../lib/api', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  firebaseExchange: (...args: unknown[]) => mockFirebaseExchange(...args),
  firebaseUnlink: (...args: unknown[]) => mockFirebaseUnlink(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
  me: (...args: unknown[]) => mockMe(...args),
  register: jest.fn(),
  firebaseRegister: jest.fn(),
}));

const mockIsFirebaseConfigured = jest.fn(() => true);

jest.mock('../lib/firebase', () => ({
  isFirebaseConfigured: () => mockIsFirebaseConfigured(),
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
const NEW_PASSWORD = 'BrandNewPass1!';
const SECOND_PASSWORD = 'TypedAgain2@';
const ID_TOKEN = 'fake.id.token';
const CONFIRMED_TOKEN = 'confirmed.id.token';
const APP_TOKEN = 'inventory-ai.jwt';

const USER = {
  id: 'u1',
  name: 'Ada',
  email: EMAIL,
  role: 'OWNER' as const,
  // A Firebase-linked account: the account that can be disconnected.
  authMethods: { password: false, firebase: true },
};
const SESSION = { token: APP_TOKEN, tokenType: 'Bearer', expiresIn: '1d', user: USER };

const CONFIRM_INPUT = {
  method: 'password' as const,
  email: EMAIL,
  password: PASSWORD,
  newPassword: NEW_PASSWORD,
};

/** The server's unlink refusals, built with the real ApiError the client uses. */
const notLinked = () => new ApiError(409, 'FIREBASE_IDENTITY_NOT_LINKED', 'not connected');
const conflict = () => new ApiError(409, 'FIREBASE_IDENTITY_CONFLICT', 'cannot be connected');
const reauthRequired = () =>
  new ApiError(409, 'FIREBASE_REAUTHENTICATION_REQUIRED', 'confirm your sign-in again');
const tokenInvalid = () => new ApiError(400, 'FIREBASE_TOKEN_INVALID', 'could not be verified');
const businessInactive = () => new ApiError(403, 'BUSINESS_NOT_ACTIVE', 'business is not active');
const disabled = () => new ApiError(403, 'ACCOUNT_DISABLED', 'This account is disabled');

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

/** A mounted provider, settled into `signedIn` through the Firebase path. */
async function mountSignedIn() {
  mockSignInWithEmail.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });
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
 * The same helper `auth-firebase-flow.test.tsx` uses, for the same reason:
 * `expect(...).rejects` inside `act` would be reported as an unhandled rejection, and
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
  mockIsFirebaseConfigured.mockReturnValue(true);
  mockFirebaseExchange.mockResolvedValue(SESSION);
  mockLogin.mockResolvedValue(SESSION);
  mockLogout.mockResolvedValue({ message: 'Signed out' });
  mockSignOutOfFirebase.mockResolvedValue(undefined);
  mockFirebaseUnlink.mockResolvedValue({ unlinked: true, user: USER });
  // The ordinary reauth-first case: the screen has just confirmed, so a live Firebase
  // user exists and its token carries the confirmation's `auth_time`.
  mockCurrentFirebaseIdToken.mockResolvedValue(CONFIRMED_TOKEN);
  mockConfirmFirebaseSignIn.mockResolvedValue({ kind: 'idToken', idToken: CONFIRMED_TOKEN });
});

// ---------------------------------------------------------------------------
// The happy path, and the ordering that makes it the happy path
// ---------------------------------------------------------------------------

describe('disconnectFirebase — success', () => {
  it('calls the unlink endpoint with the session token and only the two fields it accepts', async () => {
    const view = await mountSignedIn();

    await act(async () => {
      await view.result.current.disconnectFirebase(CONFIRM_INPUT);
    });

    expect(mockFirebaseUnlink).toHaveBeenCalledTimes(1);
    const [token, body] = mockFirebaseUnlink.mock.calls[0]!;
    expect(token).toBe(APP_TOKEN);
    expect(body).toEqual({ idToken: CONFIRMED_TOKEN, newPassword: NEW_PASSWORD });
    // The confirmation password is a SEPARATE credential from the new one and must
    // never be part of the request that establishes the new one.
    expect(Object.keys(body)).toEqual(['idToken', 'newPassword']);
  });

  it('reports the success as an outcome, so a caller can tell it from a refusal', async () => {
    const view = await mountSignedIn();

    let outcome: unknown;
    await act(async () => {
      outcome = await view.result.current.disconnectFirebase(CONFIRM_INPUT);
    });

    expect(outcome).toEqual({ kind: 'unlinked' });
  });

  it('ends the Firebase session AFTER the server succeeded, and clears the local session', async () => {
    const view = await mountSignedIn();

    await act(async () => {
      await view.result.current.disconnectFirebase(CONFIRM_INPUT);
    });

    expect(mockSignOutOfFirebase).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
    expect(view.result.current.token).toBeNull();
    expect(view.result.current.user).toBeNull();
  });

  it('sends the unlink request BEFORE ending the Firebase session', async () => {
    const order: string[] = [];
    mockFirebaseUnlink.mockImplementation(async () => {
      order.push('unlink');
      return { unlinked: true, user: USER };
    });
    mockSignOutOfFirebase.mockImplementation(async () => {
      order.push('firebase-signout');
    });

    const view = await mountSignedIn();
    await act(async () => {
      await view.result.current.disconnectFirebase(CONFIRM_INPUT);
    });

    // The server is authoritative, so nothing local may happen first. Ending the
    // Firebase session before the 200 would leave the person signed out of Firebase
    // while Inventory AI still held the mapping.
    expect(order).toEqual(['unlink', 'firebase-signout']);
  });

  it('never calls api.logout — the unlink already revoked every session server-side', async () => {
    const view = await mountSignedIn();

    await act(async () => {
      await view.result.current.disconnectFirebase(CONFIRM_INPUT);
    });

    // The regression this guards: a leftover `api.logout` here would be a guaranteed
    // 401 against an already-revoked token, which the client's session-loss rule
    // would then act on as if the session had just died.
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('does not end the Firebase session when the unlink is refused', async () => {
    mockFirebaseUnlink.mockRejectedValue(notLinked());
    const view = await mountSignedIn();

    await capture(view.result.current.disconnectFirebase(CONFIRM_INPUT));

    expect(mockSignOutOfFirebase).not.toHaveBeenCalled();
    await waitFor(() => expect(view.result.current.status).toBe('signedIn'));
  });
});

// ---------------------------------------------------------------------------
// The one retry — and why it is the CALLER's to make
// ---------------------------------------------------------------------------
//
// A freshness refusal is answered in ONE request and handed straight back. Nothing
// is retried in here, and nothing is confirmed in here, because the remedy needs a
// password this frame is already holding: performing the second confirmation inside
// it would keep that credential alive across a browser round-trip that can background
// or kill the app. The caller confirms, collects a new password, and comes back with
// `retry`, which is the cap that makes a third attempt impossible.

describe('disconnectFirebase — the freshness refusal', () => {
  it('hands the refusal back after ONE request, without confirming or retrying', async () => {
    mockFirebaseUnlink.mockRejectedValue(reauthRequired());
    const view = await mountSignedIn();

    let outcome: unknown;
    await act(async () => {
      outcome = await view.result.current.disconnectFirebase(CONFIRM_INPUT);
    });

    expect(outcome).toEqual({ kind: 'reauth-required' });
    expect(mockFirebaseUnlink).toHaveBeenCalledTimes(1);
    // A second request here would be this layer retrying with the password and the
    // token the server has just refused — the two things the refusal is about.
    expect(mockConfirmFirebaseSignIn).not.toHaveBeenCalled();
  });

  it('tears nothing down for a refusal that asks only for a fresher confirmation', async () => {
    mockFirebaseUnlink.mockRejectedValue(reauthRequired());
    const view = await mountSignedIn();

    await act(async () => {
      await view.result.current.disconnectFirebase(CONFIRM_INPUT);
    });

    expect(mockSignOutOfFirebase).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
    await waitFor(() => expect(view.result.current.status).toBe('signedIn'));
  });

  it('sends the FRESH confirmation on the retry, and the password typed for it', async () => {
    // The refusal is a statement about the token's `auth_time`, so resending the same
    // token would be refused identically — the retry would be pointless. After the
    // caller confirms again a live Firebase user exists once more, so
    // `currentFirebaseIdToken` is what picks the new token up. The password is a second
    // credential for the same reason: this call was given its own.
    mockCurrentFirebaseIdToken.mockResolvedValue('stale.token');
    mockFirebaseUnlink
      .mockRejectedValueOnce(reauthRequired())
      .mockResolvedValueOnce({ unlinked: true, user: USER });

    const view = await mountSignedIn();
    await act(async () => {
      await view.result.current.disconnectFirebase(CONFIRM_INPUT);
    });

    // In between, the caller performs the confirmation the refusal asked for.
    mockCurrentFirebaseIdToken.mockResolvedValue('fresh.token');

    let outcome: unknown;
    await act(async () => {
      outcome = await view.result.current.disconnectFirebase(
        { ...CONFIRM_INPUT, newPassword: SECOND_PASSWORD },
        { retry: true }
      );
    });

    expect(outcome).toEqual({ kind: 'unlinked' });
    expect(mockFirebaseUnlink.mock.calls[0]![1].idToken).toBe('stale.token');
    expect(mockFirebaseUnlink.mock.calls[1]![1].idToken).toBe('fresh.token');
    expect(mockFirebaseUnlink.mock.calls[0]![1].newPassword).toBe(NEW_PASSWORD);
    expect(mockFirebaseUnlink.mock.calls[1]![1].newPassword).toBe(SECOND_PASSWORD);
    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
    expect(mockSignOutOfFirebase).toHaveBeenCalledTimes(1);
  });

  it('treats a freshness refusal on the retry as terminal — no third attempt', async () => {
    mockFirebaseUnlink.mockRejectedValue(reauthRequired());
    const view = await mountSignedIn();

    await act(async () => {
      await view.result.current.disconnectFirebase(CONFIRM_INPUT);
    });

    const thrown = await capture(
      view.result.current.disconnectFirebase(CONFIRM_INPUT, { retry: true })
    );

    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).code).toBe('FIREBASE_REAUTHENTICATION_REQUIRED');
    // Two requests in total: the attempt and its one retry. A third would be the loop.
    expect(mockFirebaseUnlink).toHaveBeenCalledTimes(2);
    // And a `retry` call is never answered with `reauth-required`, so no caller can ask
    // again: the cap is a property of this layer rather than of the screen's state.
    expect(mockConfirmFirebaseSignIn).not.toHaveBeenCalled();
    await waitFor(() => expect(view.result.current.status).toBe('signedIn'));
  });

  it('does not retry the terminal refusals', async () => {
    for (const refusal of [notLinked(), conflict(), tokenInvalid(), businessInactive()]) {
      jest.clearAllMocks();
      mockFirebaseExchange.mockResolvedValue(SESSION);
      mockCurrentFirebaseIdToken.mockResolvedValue(CONFIRMED_TOKEN);
      mockFirebaseUnlink.mockRejectedValue(refusal);

      const view = await mountSignedIn();
      await capture(view.result.current.disconnectFirebase(CONFIRM_INPUT));

      expect(mockFirebaseUnlink).toHaveBeenCalledTimes(1);
      // Nothing was refused for freshness, so nothing needed demanding again.
      expect(mockConfirmFirebaseSignIn).not.toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// Cold start, and when a confirmation is required at all
// ---------------------------------------------------------------------------

describe('disconnectFirebase — the cold-start state', () => {
  it('confirms when there is no Firebase user to read a token from', async () => {
    // `inMemoryPersistence` means a restarted app is signed in to Inventory AI with
    // `auth.currentUser === null`.
    mockCurrentFirebaseIdToken.mockResolvedValue(null);

    const view = await mountSignedIn();
    await act(async () => {
      await view.result.current.disconnectFirebase(CONFIRM_INPUT);
    });

    expect(mockConfirmFirebaseSignIn).toHaveBeenCalledTimes(1);
    const [confirmArgs] = mockConfirmFirebaseSignIn.mock.calls[0]!;
    expect(confirmArgs).toEqual({ method: 'password', email: EMAIL, password: PASSWORD });
    expect(mockFirebaseUnlink.mock.calls[0]![1].idToken).toBe(CONFIRMED_TOKEN);
  });

  it('reuses the already-confirmed token when one exists', async () => {
    const view = await mountSignedIn();
    await act(async () => {
      await view.result.current.disconnectFirebase(CONFIRM_INPUT);
    });

    // Reauth-first: the screen has just confirmed, so no second prompt is needed.
    expect(mockConfirmFirebaseSignIn).not.toHaveBeenCalled();
    expect(mockFirebaseUnlink.mock.calls[0]![1].idToken).toBe(CONFIRMED_TOKEN);
  });

  it('throws a FirebaseAuthError when a required confirmation does not produce a token', async () => {
    mockCurrentFirebaseIdToken.mockResolvedValue(null);
    mockConfirmFirebaseSignIn.mockResolvedValue({ kind: 'wrong-method' });

    const view = await mountSignedIn();
    const thrown = await capture(view.result.current.disconnectFirebase(CONFIRM_INPUT));

    expect(thrown).toBeInstanceOf(FirebaseAuthError);
    expect((thrown as FirebaseAuthError).code).toBe('firebase/confirm-wrong-method');
    // A confirmation that never happened means no request is sent at all.
    expect(mockFirebaseUnlink).not.toHaveBeenCalled();
  });

  it('throws rather than signing out when there is no Inventory AI session', async () => {
    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));

    const thrown = await capture(view.result.current.disconnectFirebase(CONFIRM_INPUT));

    expect(thrown).toBeInstanceOf(FirebaseAuthError);
    expect((thrown as FirebaseAuthError).code).toBe('firebase/no-session');
    expect(mockFirebaseUnlink).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Session survival — the property that makes the 409s usable
// ---------------------------------------------------------------------------

describe('disconnectFirebase — what does NOT end the session', () => {
  it('keeps the session for the terminal 409 refusals', async () => {
    for (const refusal of [notLinked(), conflict()]) {
      jest.clearAllMocks();
      mockFirebaseExchange.mockResolvedValue(SESSION);
      mockCurrentFirebaseIdToken.mockResolvedValue(CONFIRMED_TOKEN);
      mockFirebaseUnlink.mockRejectedValue(refusal);

      const view = await mountSignedIn();
      await capture(view.result.current.disconnectFirebase(CONFIRM_INPUT));

      await waitFor(() => expect(view.result.current.status).toBe('signedIn'));
      expect(mockLogout).not.toHaveBeenCalled();
    }
  });

  it('keeps the session for the freshness refusal, which resolves rather than throws', async () => {
    mockFirebaseUnlink.mockRejectedValue(reauthRequired());
    const view = await mountSignedIn();

    let outcome: unknown;
    await act(async () => {
      outcome = await view.result.current.disconnectFirebase(CONFIRM_INPUT);
    });

    expect(outcome).toEqual({ kind: 'reauth-required' });
    await waitFor(() => expect(view.result.current.status).toBe('signedIn'));
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('keeps the session for a rejected Firebase token answered as 400', async () => {
    // The server moved this code off 401 precisely so it could not be read as a dead
    // session. If it ever regressed, this case would catch it.
    mockFirebaseUnlink.mockRejectedValue(tokenInvalid());
    const view = await mountSignedIn();

    await capture(view.result.current.disconnectFirebase(CONFIRM_INPUT));

    await waitFor(() => expect(view.result.current.status).toBe('signedIn'));
  });

  it('keeps the session for an inactive business answered as 403', async () => {
    // A 403 reaches the client's session-loss handler but is deliberately not a
    // session error, so the session must survive it.
    mockFirebaseUnlink.mockRejectedValue(businessInactive());
    const view = await mountSignedIn();

    await capture(view.result.current.disconnectFirebase(CONFIRM_INPUT));

    await waitFor(() => expect(view.result.current.status).toBe('signedIn'));
  });

  it('propagates a genuinely dead session instead of swallowing it', async () => {
    // The other direction, so the cases above are proved to be about the CODE rather
    // than about the refusal being ignored wholesale.
    //
    // WHO ACTS ON IT IS DELIBERATELY NOT THIS LAYER. A dead session is detected and
    // cleared by `lib/client.ts`, which fires its handler when a tokened request is
    // refused 401/403, and it has already cleared the session by the time the error
    // arrives here. All this layer owes is to hand the error on so the screen's
    // `isSessionError` branch can do its part, so that is what is asserted — the
    // refusals above are the ones proved to be ignored, and this one is proved not to
    // be.
    mockFirebaseUnlink.mockRejectedValue(disabled());
    const view = await mountSignedIn();

    const thrown = await capture(view.result.current.disconnectFirebase(CONFIRM_INPUT));

    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).status).toBe(403);
    expect((thrown as ApiError).code).toBe('ACCOUNT_DISABLED');
  });
});

// ---------------------------------------------------------------------------
// The confirmation pass-through
// ---------------------------------------------------------------------------

describe('confirmFirebaseSignIn (session surface)', () => {
  it('returns the Firebase outcome unchanged and sends the account email', async () => {
    mockConfirmFirebaseSignIn.mockResolvedValue({ kind: 'idToken', idToken: CONFIRMED_TOKEN });
    const view = await mountSignedIn();

    let outcome: unknown;
    await act(async () => {
      outcome = await view.result.current.confirmFirebaseSignIn({
        method: 'password',
        email: EMAIL,
        password: PASSWORD,
      });
    });

    expect(outcome).toEqual({ kind: 'idToken', idToken: CONFIRMED_TOKEN });
    expect(mockConfirmFirebaseSignIn).toHaveBeenCalledWith({
      method: 'password',
      email: EMAIL,
      password: PASSWORD,
    });
  });

  it('passes the ordinary non-failure states through rather than throwing them', async () => {
    for (const state of [{ kind: 'cancelled' }, { kind: 'wrong-method' }]) {
      mockConfirmFirebaseSignIn.mockResolvedValue(state);
      const view = await mountSignedIn();

      let outcome: unknown;
      await act(async () => {
        outcome = await view.result.current.confirmFirebaseSignIn({ method: 'google', email: EMAIL });
      });

      expect(outcome).toEqual(state);
    }
  });
});
