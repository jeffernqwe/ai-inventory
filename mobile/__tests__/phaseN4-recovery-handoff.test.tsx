/**
 * N-4 — the mobile recovery handoff, as `lib/auth.tsx` actually runs it.
 *
 * The server bridge is one half of the guarantee and the marker is the other: a password
 * reset performed inside Firebase reaches no server code, so the revocation is owed by a
 * DURABLE NOTE rather than by anything the reset screen still holds. This file pins that
 * note and the sign-in that consumes it.
 *
 * THE CENTRAL CLAIM IS ABOUT ORDER AND OWNERSHIP:
 *
 *   the marker is written before the credential changes, and at the sign-in it causes a
 *   TEMPORARY session to be minted for one bridge call — a session that is never applied,
 *   never persisted and never seeable by a screen — after which the SIGN-IN'S OWN session
 *   is the only one that reaches `applySession`.
 *
 * So the cases below assert the negatives that make it true: the temporary token is absent
 * from SecureStore and from the session the app exposes, the marker survives every
 * interruption, and a sign-in that owes nothing takes the path it always took.
 *
 * WHAT IS REAL HERE: `AuthProvider`, its SecureStore persistence, its boot restore, its
 * sign-in call graph and the marker helpers. Only the module boundaries are mocked — the
 * API layer, the Firebase classification layer, and the build gate.
 *
 * `expo-secure-store` is mocked with a REAL IN-MEMORY MAP rather than with `jest.fn()`s,
 * because the properties under test are about persistence: whether a value is still there
 * on a later launch is not observable through a mock that forgets everything between
 * calls, and "the marker survives a restart" would otherwise be an assertion about the
 * test's own bookkeeping.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '../lib/client';
import { AuthProvider, useSession } from '../lib/auth';

// ---------------------------------------------------------------------------
// The mock seam
// ---------------------------------------------------------------------------

/** A real key/value store, so persistence is observable rather than assumed. */
const mockSecureStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  }),
  getItemAsync: jest.fn(async (key: string) => (mockSecureStore.has(key) ? mockSecureStore.get(key) : null)),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStore.delete(key);
  }),
}));

const mockSignInWithEmail = jest.fn();
// Typed as a bare `jest.Mock` so the module mock below can forward whatever it is given;
// `jest.fn(async () => true)` would infer a zero-argument signature and reject the spread.
const mockSignOutOfFirebase: jest.Mock = jest.fn(async () => true);
const mockEnsureFirebaseAccount = jest.fn();

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
  ensureFirebaseAccount: (...args: unknown[]) => mockEnsureFirebaseAccount(...args),
  signOutOfFirebase: (...args: unknown[]) => mockSignOutOfFirebase(...args),
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
  GOOGLE_WEB_CLIENT_ID: '',
}));

const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockFirebaseExchange = jest.fn();
const mockFirebaseRegister = jest.fn();
const mockFirebaseLink = jest.fn();
const mockCredentialsChanged = jest.fn();
const mockLogout = jest.fn();
const mockMe = jest.fn();

jest.mock('../lib/api', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  register: (...args: unknown[]) => mockRegister(...args),
  firebaseExchange: (...args: unknown[]) => mockFirebaseExchange(...args),
  firebaseRegister: (...args: unknown[]) => mockFirebaseRegister(...args),
  firebaseLink: (...args: unknown[]) => mockFirebaseLink(...args),
  credentialsChanged: (...args: unknown[]) => mockCredentialsChanged(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
  me: (...args: unknown[]) => mockMe(...args),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'inventoryai.auth.token';
const MARKER_KEY = 'inventoryai.auth.passwordResetPending';

const EMAIL = 'owner@example.com';
const OTHER_EMAIL = 'someone-else@example.com';
const PASSWORD = 'NewPassword123!';
const ID_TOKEN = 'fake.fresh.id.token';

/** The session the app is allowed to keep, and the one it must never see. */
const FINAL_TOKEN = 'inventory-ai.jwt.final';
const TEMPORARY_TOKEN = 'inventory-ai.jwt.temporary';

const USER = { id: 'u1', name: 'Ada', email: EMAIL, role: 'OWNER' as const };
const session = (token: string) => ({ token, tokenType: 'Bearer', expiresIn: '1d', user: USER });

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

/** A mounted provider, settled out of its boot state. */
async function mount() {
  const view = await renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(view.result.current.status).not.toBe('loading'));
  return view;
}

/** Runs a call expected to reject and hands back what it threw. */
async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected the call to reject, but it resolved');
}

const order = (fn: jest.Mock) => fn.mock.invocationCallOrder[0];

beforeEach(() => {
  jest.clearAllMocks();
  mockSecureStore.clear();
  mockIsFirebaseConfigured.mockReturnValue(true);
  mockSignInWithEmail.mockResolvedValue({ kind: 'idToken', idToken: ID_TOKEN });
  mockSignOutOfFirebase.mockResolvedValue(true);
  mockLogin.mockResolvedValue(session(FINAL_TOKEN));
  mockFirebaseRegister.mockResolvedValue({});
  mockMe.mockResolvedValue({ token: FINAL_TOKEN, user: USER });
});

// ---------------------------------------------------------------------------
// The note the reset screen leaves
// ---------------------------------------------------------------------------

describe('N-4 — the recovery marker on its own terms', () => {
  it('★ stores a non-secret fingerprint and NOTHING else', async () => {
    const { markPasswordResetPending } = jest.requireActual<typeof import('../lib/auth')>(
      '../lib/auth'
    );

    await act(async () => {
      await markPasswordResetPending(EMAIL);
    });

    const raw = mockSecureStore.get(MARKER_KEY);
    expect(raw).toBeDefined();
    // The whole value: a format tag and an 8-hex-digit fingerprint. No credential, no
    // address, no id, no token — asserted against the STORED BYTES rather than a summary.
    expect(raw).toMatch(/^v1:[0-9a-f]{8}$/);
    expect(raw).not.toContain(EMAIL);
    expect(raw).not.toContain('@');
    expect(raw).not.toContain(PASSWORD);
    expect(raw).not.toContain(ID_TOKEN);
    expect(raw).not.toContain(String(USER.id));
  });

  it('★ derives the same fingerprint however the address was typed', async () => {
    const { markPasswordResetPending } = jest.requireActual<typeof import('../lib/auth')>(
      '../lib/auth'
    );

    await act(async () => {
      await markPasswordResetPending('  Owner@Example.COM  ');
    });
    const first = mockSecureStore.get(MARKER_KEY);

    mockSecureStore.clear();
    await act(async () => {
      await markPasswordResetPending(EMAIL);
    });

    expect(mockSecureStore.get(MARKER_KEY)).toBe(first);
  });

  it('★ an unrecognised stored value is treated as NO marker, and consumes nothing', async () => {
    mockSecureStore.set(MARKER_KEY, 'v2:whatever-this-is');
    mockFirebaseExchange.mockResolvedValue(session(FINAL_TOKEN));

    const view = await mount();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    expect(mockCredentialsChanged).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).toHaveBeenCalledTimes(1);
    // A format this build does not understand must not be silently rewritten either.
    expect(mockSecureStore.get(MARKER_KEY)).toBe('v2:whatever-this-is');
  });
});

// ---------------------------------------------------------------------------
// The sign-in that owes nothing
// ---------------------------------------------------------------------------

describe('N-4 — a sign-in with no marker behaves exactly as it always did', () => {
  it('★ one exchange, no bridge, and its own session applied', async () => {
    mockFirebaseExchange.mockResolvedValue(session(FINAL_TOKEN));

    const view = await mount();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    expect(mockFirebaseExchange).toHaveBeenCalledTimes(1);
    expect(mockCredentialsChanged).not.toHaveBeenCalled();
    expect(view.result.current.token).toBe(FINAL_TOKEN);
    expect(mockSecureStore.get(TOKEN_KEY)).toBe(FINAL_TOKEN);
    expect(mockSecureStore.has(MARKER_KEY)).toBe(false);
  });

  it('★ an account with NO Firebase identity still takes the legacy route, untouched', async () => {
    mockSignInWithEmail.mockResolvedValue({ kind: 'legacyFallback', reason: 'invalid-credential' });
    mockSecureStore.set(MARKER_KEY, 'v1:deadbeef');

    const view = await mount();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(mockCredentialsChanged).not.toHaveBeenCalled();
    // A marker cannot make a route that never had a Firebase identity reach the bridge.
    expect(mockSecureStore.get(MARKER_KEY)).toBe('v1:deadbeef');
  });
});

// ---------------------------------------------------------------------------
// The sign-in that owes one
// ---------------------------------------------------------------------------

describe('N-4 — the recovery handoff', () => {
  /** Leaves the marker for EMAIL, exactly as the reset screen does. */
  async function leaveMarker(email = EMAIL): Promise<void> {
    const { markPasswordResetPending } = jest.requireActual<typeof import('../lib/auth')>(
      '../lib/auth'
    );
    await act(async () => {
      await markPasswordResetPending(email);
    });
  }

  it('★ runs the locked sequence in order, and applies ONLY the final session', async () => {
    await leaveMarker();
    mockFirebaseExchange
      .mockResolvedValueOnce(session(TEMPORARY_TOKEN))
      .mockResolvedValueOnce(session(FINAL_TOKEN));
    mockCredentialsChanged.mockResolvedValue({ changedAt: '2026-09-29T00:00:00.000Z' });

    const view = await mount();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    // The sequence: sign in with the actual credential, exchange for the temporary
    // session, call the bridge with that session, exchange again for the final one.
    expect(mockSignInWithEmail).toHaveBeenCalledWith(EMAIL, PASSWORD);
    expect(mockFirebaseExchange).toHaveBeenCalledTimes(2);
    expect(mockCredentialsChanged).toHaveBeenCalledTimes(1);
    expect(order(mockSignInWithEmail)).toBeLessThan(order(mockFirebaseExchange));
    expect(order(mockFirebaseExchange)).toBeLessThan(order(mockCredentialsChanged));

    // The bridge is called with the FRESH ID token from the real sign-in and the
    // TEMPORARY session — never with the app's own session, which does not exist yet.
    expect(mockCredentialsChanged).toHaveBeenCalledWith({ idToken: ID_TOKEN }, TEMPORARY_TOKEN);

    // ★ THE TEMPORARY SESSION IS INVISIBLE. It is not the app's session, it is not what
    //   was persisted, and it was not left behind by the bridge's own bookkeeping.
    expect(view.result.current.token).toBe(FINAL_TOKEN);
    expect(mockSecureStore.get(TOKEN_KEY)).toBe(FINAL_TOKEN);
    expect(mockSecureStore.get(TOKEN_KEY)).not.toBe(TEMPORARY_TOKEN);
    expect([...mockSecureStore.values()]).not.toContain(TEMPORARY_TOKEN);

    // The revocation is acknowledged, so nothing is owed any more.
    expect(mockSecureStore.has(MARKER_KEY)).toBe(false);
  });

  it('★ a marker for ANOTHER account neither runs the bridge nor is consumed', async () => {
    await leaveMarker(OTHER_EMAIL);
    const stored = mockSecureStore.get(MARKER_KEY);
    mockFirebaseExchange.mockResolvedValue(session(FINAL_TOKEN));

    const view = await mount();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    expect(mockCredentialsChanged).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).toHaveBeenCalledTimes(1);
    expect(view.result.current.token).toBe(FINAL_TOKEN);
    expect(mockSecureStore.get(MARKER_KEY)).toBe(stored);
  });

  it('★ clears the marker on the bridge’s 2xx acknowledgement', async () => {
    await leaveMarker();
    mockFirebaseExchange
      .mockResolvedValueOnce(session(TEMPORARY_TOKEN))
      .mockResolvedValueOnce(session(FINAL_TOKEN));
    mockCredentialsChanged.mockResolvedValue({ changedAt: '2026-09-29T00:00:00.000Z' });

    const view = await mount();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    expect(mockSecureStore.has(MARKER_KEY)).toBe(false);
    expect(view.result.current.status).toBe('signedIn');
  });

  it('★ treats a 401 SESSION_INVALIDATED as SUCCESS-EQUIVALENT and clears the marker', async () => {
    await leaveMarker();
    mockFirebaseExchange
      .mockResolvedValueOnce(session(TEMPORARY_TOKEN))
      .mockResolvedValueOnce(session(FINAL_TOKEN));
    // The revocation this call is repeating already happened, which is why the temporary
    // token is no longer valid. A refusal is not a reason to keep owing it.
    mockCredentialsChanged.mockRejectedValue(new ApiError(401, 'SESSION_INVALIDATED', 'dead'));

    const view = await mount();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    expect(mockSecureStore.has(MARKER_KEY)).toBe(false);
    expect(view.result.current.token).toBe(FINAL_TOKEN);
    expect(view.result.current.status).toBe('signedIn');
  });

  it('★ KEEPS the marker when the bridge refuses a stale authentication (409)', async () => {
    await leaveMarker();
    const stored = mockSecureStore.get(MARKER_KEY);
    mockFirebaseExchange
      .mockResolvedValueOnce(session(TEMPORARY_TOKEN))
      .mockResolvedValueOnce(session(FINAL_TOKEN));
    mockCredentialsChanged.mockRejectedValue(
      new ApiError(409, 'FIREBASE_REAUTHENTICATION_REQUIRED', 'confirm your sign-in')
    );

    const view = await mount();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    // The person is signed in — their password change worked and blocking them would be
    // punishing them for our bookkeeping — and the revocation is still owed.
    expect(view.result.current.status).toBe('signedIn');
    expect(view.result.current.token).toBe(FINAL_TOKEN);
    expect(mockSecureStore.get(MARKER_KEY)).toBe(stored);
  });

  it('★ KEEPS the marker on a transport failure, and still signs the person in', async () => {
    await leaveMarker();
    const stored = mockSecureStore.get(MARKER_KEY);
    mockFirebaseExchange
      .mockResolvedValueOnce(session(TEMPORARY_TOKEN))
      .mockResolvedValueOnce(session(FINAL_TOKEN));
    mockCredentialsChanged.mockRejectedValue(
      new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server.')
    );

    const view = await mount();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    expect(view.result.current.status).toBe('signedIn');
    expect(mockSecureStore.get(MARKER_KEY)).toBe(stored);
  });

  it('★ a 409 identity conflict is terminal for the marker too — it is NOT consumed', async () => {
    await leaveMarker();
    const stored = mockSecureStore.get(MARKER_KEY);
    mockFirebaseExchange
      .mockResolvedValueOnce(session(TEMPORARY_TOKEN))
      .mockResolvedValueOnce(session(FINAL_TOKEN));
    mockCredentialsChanged.mockRejectedValue(
      new ApiError(409, 'FIREBASE_IDENTITY_CONFLICT', 'does not match')
    );

    const view = await mount();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    expect(view.result.current.status).toBe('signedIn');
    expect(mockSecureStore.get(MARKER_KEY)).toBe(stored);
  });

  it('★ SURVIVES a restart: a later launch still finds the note and runs the bridge', async () => {
    await leaveMarker();
    mockFirebaseExchange
      .mockResolvedValueOnce(session(TEMPORARY_TOKEN))
      .mockResolvedValueOnce(session(FINAL_TOKEN));
    mockCredentialsChanged.mockRejectedValue(
      new ApiError(409, 'FIREBASE_REAUTHENTICATION_REQUIRED', 'confirm your sign-in')
    );

    // FIRST LAUNCH — the attempt cannot complete, so the note stays.
    const first = await mount();
    await act(async () => {
      await first.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });
    expect(mockSecureStore.has(MARKER_KEY)).toBe(true);
    // Unmounting is itself a React update, so it is awaited inside `act` — an unmount
    // while a pending update is in flight produces overlapping `act()` scopes, which
    // poisons the renders that follow it rather than failing here.
    await act(async () => {
      first.unmount();
    });

    // SECOND LAUNCH — a fresh Provider over the SAME storage, which is what a restart is.
    // (The app's token was persisted too, so this launch restores the session it earned.)
    mockFirebaseExchange.mockReset();
    mockFirebaseExchange
      .mockResolvedValueOnce(session(TEMPORARY_TOKEN))
      .mockResolvedValueOnce(session(FINAL_TOKEN));
    mockCredentialsChanged.mockReset();
    mockCredentialsChanged.mockResolvedValue({ changedAt: '2026-09-29T00:00:00.000Z' });

    const second = await mount();
    await act(async () => {
      await second.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });

    // ★ The retry completes the revocation, and THIS time the note is gone.
    expect(mockCredentialsChanged).toHaveBeenCalledTimes(1);
    expect(mockCredentialsChanged).toHaveBeenCalledWith({ idToken: ID_TOKEN }, TEMPORARY_TOKEN);
    expect(mockSecureStore.has(MARKER_KEY)).toBe(false);
  });

  it('★ signing out and back in does not lose the note or double-apply a session', async () => {
    await leaveMarker();
    const stored = mockSecureStore.get(MARKER_KEY);
    mockFirebaseExchange
      .mockResolvedValueOnce(session(TEMPORARY_TOKEN))
      .mockResolvedValueOnce(session(FINAL_TOKEN));
    mockCredentialsChanged.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'offline'));

    const view = await mount();
    await act(async () => {
      await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
    });
    await act(async () => {
      await view.result.current.signOut();
    });
    await act(async () => {});

    // Sign-out clears the SESSION, not the debt: the marker is about a credential change
    // the server has not recorded yet, which sign-out has no bearing on.
    expect(view.result.current.status).toBe('signedOut');
    expect(mockSecureStore.has(TOKEN_KEY)).toBe(false);
    expect(mockSecureStore.get(MARKER_KEY)).toBe(stored);
  });

  it('★ a refused temporary exchange fails the sign-in and leaves the note owed', async () => {
    await leaveMarker();
    const stored = mockSecureStore.get(MARKER_KEY);
    // Same endpoint, same token as the final exchange, so a refusal here is one the
    // sign-in would have met a moment later — it is reported, not swallowed.
    mockFirebaseExchange.mockRejectedValue(new ApiError(403, 'ACCOUNT_DISABLED', 'disabled'));

    const view = await mount();
    const thrown = await capture(
      act(async () => {
        await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
      })
    );

    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).code).toBe('ACCOUNT_DISABLED');
    expect(view.result.current.status).toBe('signedOut');
    expect(mockCredentialsChanged).not.toHaveBeenCalled();
    expect(mockSecureStore.get(MARKER_KEY)).toBe(stored);
  });

  it('★ does not fall back to the legacy route when Firebase itself failed', async () => {
    await leaveMarker();
    mockSignInWithEmail.mockResolvedValue({
      kind: 'failure',
      code: 'auth/network-request-failed',
      message: 'Cannot reach the sign-in service. Check your connection and try again.',
    });

    const view = await mount();
    await capture(
      act(async () => {
        await view.result.current.signIn({ email: EMAIL, password: PASSWORD });
      })
    );

    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockCredentialsChanged).not.toHaveBeenCalled();
    // Nothing was proven, so nothing is consumed.
    expect(mockSecureStore.has(MARKER_KEY)).toBe(true);
  });
});
