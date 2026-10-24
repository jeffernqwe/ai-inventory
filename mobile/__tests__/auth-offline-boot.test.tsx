/**
 * A launch that cannot reach the server is still a SIGNED-IN launch.
 *
 * WHY THIS SUITE EXISTS (measured 2026-10-24, preview APK on the OPPO CPH1969). With the
 * phone in aeroplane mode, a cold start dropped the person to the Login screen even
 * though the stored Inventory AI token was still valid: the boot restore asks `api.me`
 * for the account, and a network failure was treated as "not signed in". AUTH-03 removed
 * exactly that rule from `refresh()` ("a NON-TERMINAL failure must never destroy a
 * still-valid session"); the boot path had kept it. The remedy is a stored profile —
 * written only from a server-confirmed `user`, deleted with the session — so an offline
 * launch can name the account it holds and mark itself degraded.
 *
 * WHAT IS REAL: `AuthProvider`, its boot restore, `applySession`/`clearSession`, the
 * session-loss handler, and the SecureStore writes. Only module boundaries are mocked.
 *
 * THE FOUR PROPERTIES, each asserted as an outcome on the provider's own state:
 *   1. A transient boot failure keeps the session, the profile and the token.
 *   2. With no profile stored, nothing is invented — the old signed-out outcome stands.
 *   3. A REFUSED session signs out and deletes the profile with the token.
 *   4. A healthy launch refreshes the profile, so the next offline launch is current.
 */

/// <reference types="node" />

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
  currentFirebaseIdToken: (...args: unknown[]) => mockCurrentFirebaseIdToken(...args),
  confirmFirebaseSignIn: jest.fn(),
  signOutOfFirebase: (...args: unknown[]) => mockSignOutOfFirebase(...args),
}));

jest.mock('../lib/config', () => ({
  isFirebaseConfigured: () => true,
}));

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
  isRecoverableAuthError: (err: { code?: string | null } | null | undefined) =>
    err?.code === 'SESSION_EXPIRED',
  setSessionLostHandler: (handler: unknown) => {
    mockSessionLostHandler.current = handler as never;
  },
  setSessionRenewalHandler: jest.fn(),
  setSessionRecoveryHandler: jest.fn(),
}));

const mockMe = jest.fn();

jest.mock('../lib/api', () => ({
  me: (...args: unknown[]) => mockMe(...args),
  login: jest.fn(),
  logout: jest.fn(),
  firebaseExchange: jest.fn(),
  firebaseRegister: jest.fn(),
  register: jest.fn(),
  renew: jest.fn(),
}));

// A REAL key/value store, because the whole point of the change is WHAT is stored under
// which key. `getItemAsync` answers by name, so a test can seed a token without a profile,
// or a profile that does not match the token, which is exactly the ambiguity worth pinning.
const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'inventoryai.auth.token';
const SNAPSHOT_KEY = 'inventoryai.auth.userSnapshot';

const APP_TOKEN =
  'header.' +
  Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '') +
  '.signature';

const STORED_USER = {
  id: 'u1',
  name: 'Ada',
  email: 'owner@example.com',
  role: 'OWNER' as const,
  status: 'ACTIVE' as const,
};

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  mockSignOutOfFirebase.mockResolvedValue(true);
  mockCurrentFirebaseIdToken.mockResolvedValue('should.never.be.read');
  mockSessionLostHandler.current = null;
});

// ---------------------------------------------------------------------------
// The cases
// ---------------------------------------------------------------------------

describe('a launch with no network', () => {
  it('★ keeps the session, the account and the token when the server cannot be reached', async () => {
    mockStore.set(TOKEN_KEY, APP_TOKEN);
    mockStore.set(SNAPSHOT_KEY, JSON.stringify(STORED_USER));
    // The exact shape a dead network produces: status 0, NETWORK_ERROR, no HTTP answer.
    mockMe.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server'));

    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedIn'));

    expect(view.result.current.user).toEqual(STORED_USER);
    // The TOKEN IS NOT DISCARDED, in memory or in storage: the next online launch must be
    // able to restore the same session, and a signed-in screen may retry immediately.
    expect(view.result.current.token).toBe(APP_TOKEN);
    expect(mockStore.get(TOKEN_KEY)).toBe(APP_TOKEN);
    expect(mockStore.get(SNAPSHOT_KEY)).toBe(JSON.stringify(STORED_USER));
    // DEGRADED, because nothing in this launch has confirmed the session yet.
    expect(view.result.current.authPhase).toBe('degraded');
  });

  it('does not invent an account when no profile was ever stored', async () => {
    // A build that upgrades onto this version has a token but no snapshot yet. The honest
    // outcome is the old one — Login — rather than a half-signed-in state with no name.
    mockStore.set(TOKEN_KEY, APP_TOKEN);
    mockMe.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server'));

    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));

    expect(view.result.current.user).toBeNull();
    // The stored token is untouched, so the next launch still tries to restore it.
    expect(mockStore.get(TOKEN_KEY)).toBe(APP_TOKEN);
  });

  it('survives a corrupt profile instead of crashing the launch', async () => {
    mockStore.set(TOKEN_KEY, APP_TOKEN);
    mockStore.set(SNAPSHOT_KEY, '{not json');
    mockMe.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server'));

    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
    expect(view.result.current.user).toBeNull();
  });
});

describe('a refused session', () => {
  it('★ signs out and deletes the profile with the token', async () => {
    // A 401 is the opposite evidence from a network fault: the server has spoken, and it
    // said this session is over. Keeping the snapshot would let a later offline launch
    // restore an account the server has already disowned.
    mockStore.set(TOKEN_KEY, APP_TOKEN);
    mockStore.set(SNAPSHOT_KEY, JSON.stringify(STORED_USER));
    mockMe.mockRejectedValue(new ApiError(401, 'AUTH_REQUIRED', 'Session ended'));

    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));

    expect(view.result.current.user).toBeNull();
    expect(mockStore.has(TOKEN_KEY)).toBe(false);
    expect(mockStore.has(SNAPSHOT_KEY)).toBe(false);
    expect(mockSignOutOfFirebase).toHaveBeenCalled();
  });

  it('deletes the profile when a live session is later refused', async () => {
    mockStore.set(TOKEN_KEY, APP_TOKEN);
    mockStore.set(SNAPSHOT_KEY, JSON.stringify(STORED_USER));
    mockMe.mockResolvedValue({ user: STORED_USER });

    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedIn'));

    await act(async () => {
      mockSessionLostHandler.current?.(new ApiError(401, 'AUTH_REQUIRED', 'Session ended'));
    });
    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));

    expect(mockStore.has(TOKEN_KEY)).toBe(false);
    expect(mockStore.has(SNAPSHOT_KEY)).toBe(false);
  });
});

describe('a healthy launch', () => {
  it('refreshes the stored profile, so role changes do not go stale on the phone', async () => {
    mockStore.set(TOKEN_KEY, APP_TOKEN);
    mockStore.set(SNAPSHOT_KEY, JSON.stringify({ ...STORED_USER, role: 'STAFF' }));
    mockMe.mockResolvedValue({ user: { ...STORED_USER, role: 'MANAGER' } });

    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedIn'));

    expect(view.result.current.user?.role).toBe('MANAGER');
    expect(JSON.parse(mockStore.get(SNAPSHOT_KEY) ?? 'null')).toEqual({
      ...STORED_USER,
      role: 'MANAGER',
    });
    expect(view.result.current.authPhase).toBe('idle');
  });
});
