/**
 * Phase E — session reconciliation: the durable Firebase session and the Inventory
 * AI JWT.
 *
 * Owner decisions implemented here:
 *
 *   D-E1  A FAILED `signOutOfFirebase()` is CONSUMED, not discarded. The boolean is
 *         persisted as a one-bit marker and retried on a later signed-out launch.
 *         Inventory AI logout still completes regardless, and nothing user-facing or
 *         sensitive is produced.
 *
 *   D-E2  A boot that refuses the stored Inventory AI JWT ends the durable Firebase
 *         session EXPLICITLY, and does not duplicate the sign-out when the centralized
 *         session-loss handler already handled the same 401/403.
 *
 * WHAT IS REAL HERE: `AuthProvider`, its boot restore, the marker persistence, the
 * session-loss handler and `applySession`/`clearSession`. Only module boundaries are
 * mocked — the same seam `phaseB-reconciliation.test.tsx` uses.
 *
 * THE NEGATIVES ARE THE TESTS. The failure modes this file exists to catch are actions
 * that should NOT happen (a second Firebase sign-out; an exchange on boot; a listener),
 * so each is asserted as an absence as well as its positive counterpart.
 */

/// <reference types="node" />
// One source guard reads a file as text, which needs `node:fs`, `node:path` and
// `__dirname`. This directive opts THIS file into Node's types and nothing else.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '../lib/client';
import { AuthProvider, useSession } from '../lib/auth';

// ---------------------------------------------------------------------------
// The mock seam
// ---------------------------------------------------------------------------

const mockSignOutOfFirebase = jest.fn();
const mockCurrentFirebaseIdToken = jest.fn();

jest.mock('../lib/firebase-auth', () => ({
  // A real class, so `isSessionError`'s own `instanceof` handling means something.
  FirebaseAuthError: class FirebaseAuthError extends Error {
    code: string | null;

    constructor(code: string | null, message: string) {
      super(message);
      this.name = 'FirebaseAuthError';
      this.code = code;
    }
  },
  signInWithEmail: jest.fn(),
  signInWithGoogle: jest.fn(),
  ensureFirebaseAccount: jest.fn(),
  // Under P2 this can answer a token after a cold start, so it is the exact seam
  // through which a restored native user could be turned into an Inventory AI
  // session. No boot path may call it.
  currentFirebaseIdToken: (...args: unknown[]) => mockCurrentFirebaseIdToken(...args),
  confirmFirebaseSignIn: jest.fn(),
  // THE ONE THAT MATTERS FOR D-E1: its boolean is the signal under test.
  signOutOfFirebase: (...args: unknown[]) => mockSignOutOfFirebase(...args),
}));

const mockIsFirebaseConfigured = jest.fn(() => true);

jest.mock('../lib/firebase', () => ({
  isFirebaseConfigured: () => mockIsFirebaseConfigured(),
}));

/** Captured so a case can drive the central session-loss handler directly. */
const mockSessionLostHandler: { current: ((err: unknown) => void) | null } = { current: null };

jest.mock('../lib/client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code: string | null;
    fields: unknown[];

    constructor(status: number, code?: string | null, message?: string) {
      super(message || 'Request failed');
      this.name = 'ApiError';
      this.status = status;
      this.code = code ?? null;
      this.fields = [];
    }
  },
  setSessionLostHandler: (handler: unknown) => {
    // `as never` rather than a function type: a type annotation here would name a
    // parameter, and jest's mock-factory guard rejects any identifier in the factory
    // that is not `mock`-prefixed or a language global.
    mockSessionLostHandler.current = handler as never;
  },
}));

const mockMe = jest.fn();
const mockLogout = jest.fn();
const mockFirebaseExchange = jest.fn();

jest.mock('../lib/api', () => ({
  me: (...args: unknown[]) => mockMe(...args),
  login: jest.fn(),
  logout: (...args: unknown[]) => mockLogout(...args),
  firebaseExchange: (...args: unknown[]) => mockFirebaseExchange(...args),
  firebaseRegister: jest.fn(),
  register: jest.fn(),
  firebaseUnlink: jest.fn(),
}));

const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();

jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
  deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const APP_TOKEN = 'inventory-ai.jwt';
/** Pinned so a rename of the key has to be a deliberate, two-place edit. */
const SIGNOUT_PENDING_KEY = 'inventoryai.auth.firebaseSignOutPending';
const USER = { id: 'u1', name: 'Ada', email: 'owner@example.com', role: 'OWNER' as const };

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

const SESSION_LOST = () => new ApiError(401, 'AUTH_REQUIRED', 'Session ended');

beforeEach(() => {
  jest.clearAllMocks();
  mockIsFirebaseConfigured.mockReturnValue(true);
  mockGetItemAsync.mockResolvedValue(null);
  mockSetItemAsync.mockResolvedValue(undefined);
  mockDeleteItemAsync.mockResolvedValue(undefined);
  mockMe.mockResolvedValue({ user: USER });
  mockLogout.mockResolvedValue({ message: 'Signed out' });
  mockSignOutOfFirebase.mockResolvedValue(true);
  // Never expected to be called; set so a regression that DOES call it is visible as
  // a resolved value rather than as an undefined-function crash.
  mockCurrentFirebaseIdToken.mockResolvedValue('should.never.be.read');
  mockSessionLostHandler.current = null;
});

/** Mounts the provider already signed in from a stored token. */
async function mountSignedIn() {
  mockGetItemAsync.mockResolvedValue(APP_TOKEN);
  const view = await renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(view.result.current.status).toBe('signedIn'));
  return view;
}

// ---------------------------------------------------------------------------
// D-E2 — boot cleanup is explicit, and never duplicated
// ---------------------------------------------------------------------------

describe('D-E2 — boot ends the durable Firebase session exactly once', () => {
  it('★ ends the Firebase session when the stored JWT is refused and no handler saw it', async () => {
    // The refusal is thrown WITHOUT going through the shared handler, so the boot
    // path is the only thing that can clean up — and it must.
    mockGetItemAsync.mockResolvedValue(APP_TOKEN);
    mockMe.mockRejectedValue(SESSION_LOST());

    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));

    expect(mockSignOutOfFirebase).toHaveBeenCalledTimes(1);
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('inventoryai.auth.token');
  });

  it('★ does NOT duplicate the sign-out when the central handler already handled the 401', async () => {
    // `lib/client.ts` reports a token-bearing 401 to the handler SYNCHRONOUSLY, before
    // the refused request is rethrown to the caller — reproduced faithfully here. The
    // boot catch therefore sees the handler has claimed the refusal and must not end
    // the Firebase session a second time.
    mockGetItemAsync.mockResolvedValue(APP_TOKEN);
    mockMe.mockImplementation(async () => {
      mockSessionLostHandler.current?.(SESSION_LOST());
      throw SESSION_LOST();
    });

    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));

    // ONE, not two. Removing the `sessionLostRef` dedup makes this 2 and fails.
    expect(mockSignOutOfFirebase).toHaveBeenCalledTimes(1);
  });

  it('★ ends the Firebase session ONCE when several requests are refused for one dead session', async () => {
    // On device, one dead session arrives as two refused responses (`/api/inventory`
    // and `/api/locations` loading together) and each is reported to this handler. The
    // loss is applied once; the rest must not repeat the native teardown.
    const view = await mountSignedIn();
    expect(typeof mockSessionLostHandler.current).toBe('function');

    await act(async () => {
      mockSessionLostHandler.current?.(SESSION_LOST());
      mockSessionLostHandler.current?.(SESSION_LOST());
      mockSessionLostHandler.current?.(SESSION_LOST());
    });

    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
    expect(mockSignOutOfFirebase).toHaveBeenCalledTimes(1);
  });

  it('★ does not repeat the Firebase sign-out when a screen also calls signOut()', async () => {
    // Measured on device: the centralized handler AND a screen's own `onSessionError`
    // branch both act on one 401/403 (this app has always done the latter), which asked
    // the native SDK to sign out twice. One loss, one native sign-out.
    const view = await mountSignedIn();

    await act(async () => {
      mockSessionLostHandler.current?.(SESSION_LOST());
      await view.result.current.signOut();
    });

    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
    expect(mockSignOutOfFirebase).toHaveBeenCalledTimes(1);
    // The doomed logout request is still skipped, so nothing chases the dead session.
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('does not end the Firebase session for a non-session boot failure', async () => {
    // A 500 is a server fault, not a dead session: neither the local token nor the
    // durable Firebase session may be touched.
    mockGetItemAsync.mockResolvedValue(APP_TOKEN);
    mockMe.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Server error'));

    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));

    expect(mockSignOutOfFirebase).not.toHaveBeenCalled();
  });

  it('never exchanges a durable native Firebase user for a session on boot', async () => {
    // The P2 split-brain rule, restated for the path D-E2 touches.
    mockGetItemAsync.mockResolvedValue(null);

    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));

    expect(mockCurrentFirebaseIdToken).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(mockMe).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// D-E1 — the signOut result is consumed
// ---------------------------------------------------------------------------

describe('D-E1 — the Firebase sign-out outcome is consumed, never discarded', () => {
  it('★ records a FAILED Firebase sign-out for retry, and still completes the logout', async () => {
    mockSignOutOfFirebase.mockResolvedValue(false);
    const view = await mountSignedIn();

    await act(async () => {
      await view.result.current.signOut();
    });

    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
    // Inventory AI logout completed regardless of the Firebase failure.
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(view.result.current.token).toBeNull();
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('inventoryai.auth.token');
    // THE SIGNAL: the one boolean that says a durable credential may remain.
    expect(mockSetItemAsync).toHaveBeenCalledWith(SIGNOUT_PENDING_KEY, '1');
  });

  it('records a failed Firebase sign-out on the session-loss path too', async () => {
    mockSignOutOfFirebase.mockResolvedValue(false);
    const view = await mountSignedIn();

    await act(async () => {
      mockSessionLostHandler.current?.(SESSION_LOST());
    });

    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
    expect(mockSetItemAsync).toHaveBeenCalledWith(SIGNOUT_PENDING_KEY, '1');
  });

  it('records a SUCCESSFUL Firebase sign-out as nothing outstanding', async () => {
    mockSignOutOfFirebase.mockResolvedValue(true);
    const view = await mountSignedIn();

    await act(async () => {
      await view.result.current.signOut();
    });

    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
    // '0' rather than a delete, so a later signed-out launch does not retry.
    expect(mockSetItemAsync).toHaveBeenCalledWith(SIGNOUT_PENDING_KEY, '0');
    expect(mockSetItemAsync).not.toHaveBeenCalledWith(SIGNOUT_PENDING_KEY, '1');
  });
});

// ---------------------------------------------------------------------------
// D-E1 — the retry happens on a later SIGNED-OUT launch, and only there
// ---------------------------------------------------------------------------

describe('D-E1 — retry on a later signed-out launch', () => {
  it('★ retries an outstanding Firebase sign-out when the launch resolves signed out', async () => {
    mockGetItemAsync.mockImplementation(async (key: string) =>
      key === SIGNOUT_PENDING_KEY ? '1' : null
    );
    mockSignOutOfFirebase.mockResolvedValue(true);

    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(mockSignOutOfFirebase).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));

    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    // The retry succeeded, so the marker is cleared and the loop converges.
    expect(mockSetItemAsync).toHaveBeenCalledWith(SIGNOUT_PENDING_KEY, '0');
  });

  it('does not touch Firebase when no sign-out is outstanding', async () => {
    mockGetItemAsync.mockResolvedValue(null);

    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));

    expect(mockSignOutOfFirebase).not.toHaveBeenCalled();
  });

  it('does not retry from a SIGNED-IN launch', async () => {
    // The marker is only meaningful while signed out; retrying from a live session
    // would sign the freshly authenticated Firebase user out from under someone.
    mockGetItemAsync.mockImplementation(async (key: string) =>
      key === SIGNOUT_PENDING_KEY ? '1' : APP_TOKEN
    );

    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedIn'));

    expect(mockSignOutOfFirebase).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Source guards — the shape of the module, not just its behaviour
// ---------------------------------------------------------------------------

describe('the session layer holds no Firebase listener and no second door', () => {
  const source = readFileSync(join(__dirname, '..', 'lib', 'auth.tsx'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('never subscribes to Firebase auth state', () => {
    // An auth-state listener is the one shape that would let native state DRIVE the
    // app, and the natural next step is to treat `currentUser` as a sign-in.
    expect(code).not.toMatch(/onAuthStateChanged|onIdTokenChanged/);
  });

  it('consumes the signOutOfFirebase result rather than discarding it', () => {
    // ★ D-E1's structural half. A BARE statement — nothing capturing the value —
    // must not exist, and every Firebase sign-out must go through the one consumer.
    // Anchored to the line start so the assignment inside `endFirebaseSession` is not
    // mistaken for the discarded form.
    expect(code).not.toMatch(/^\s*await\s+signOutOfFirebase\(\)\s*;/m);
    expect(code).toMatch(/await\s+endFirebaseSession\(\)/);
    expect(code).toMatch(/const completed = await signOutOfFirebase\(\)/);
  });

  it('never treats a Firebase token as an Inventory AI session', () => {
    // The client's own half of `auth_time` vs `iat`: it never reads either claim and
    // never forces a token refresh, because a confirmation is a real sign-in (which
    // is what stamps a fresh `auth_time`) and never a `getIdToken(true)`.
    expect(code).not.toMatch(/getIdToken\(true\)/);
    expect(code).not.toMatch(/auth_time/);
    expect(code).not.toMatch(/reauthenticateWith/);
  });
});
