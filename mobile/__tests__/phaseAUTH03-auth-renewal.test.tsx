/**
 * AUTH-03 — the provider half of session renewal (`lib/auth.tsx`).
 *
 * WHAT IS REAL: `AuthProvider`, its boot restore, `applySession`/`clearSession`,
 * the renewal engine (`performRenewal`), `renewIfDue`, the auth epoch, the
 * single-flight promise, the cooldown, and the exported `isSessionError`
 * classification. Only module boundaries are mocked — the same seam the Phase B/E
 * reconciliation suites use.
 *
 * THE CASES THAT MATTER are the races and the absences: a stale renewal must NOT
 * resurrect a session a sign-out has ended; two triggers must produce ONE network
 * call; a transient failure must NOT sign anyone out. Each is asserted as an
 * outcome on the provider's own state.
 */

/// <reference types="node" />

import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import { ApiError } from '../lib/client';
import { AuthProvider, isSessionError, useSession } from '../lib/auth';

// ---------------------------------------------------------------------------
// The mock seam (declared first; the factories reference these lazily)
// ---------------------------------------------------------------------------

jest.mock('../lib/firebase-auth', () => ({
  FirebaseAuthError: class FirebaseAuthError extends Error {},
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

/** Captured so a case can drive the transport hooks directly. */
const mockHandlers: {
  lost: ((err: unknown) => void) | null;
  renewal: ((token: string) => Promise<string | null>) | null;
  recovery: ((err: unknown) => Promise<string | null>) | null;
} = { lost: null, renewal: null, recovery: null };

jest.mock('../lib/client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code: string | null;
    fields: unknown[];
    retryAfter: number | null;
    constructor(status: number, code?: string | null, message?: string) {
      super(message || 'Request failed');
      this.name = 'ApiError';
      this.status = status;
      this.code = code ?? null;
      this.fields = [];
      this.retryAfter = null;
    }
  },
  isRecoverableAuthError: (err: { code?: string | null } | null | undefined) =>
    err?.code === 'SESSION_EXPIRED',
  setSessionLostHandler: (handler: unknown) => {
    mockHandlers.lost = handler as never;
  },
  setSessionRenewalHandler: (handler: unknown) => {
    mockHandlers.renewal = handler as never;
  },
  setSessionRecoveryHandler: (handler: unknown) => {
    mockHandlers.recovery = handler as never;
  },
}));

const mockRenew = jest.fn();
const mockMe = jest.fn();
const mockLogout = jest.fn();

jest.mock('../lib/api', () => ({
  renew: (...args: unknown[]) => mockRenew(...args),
  me: (...args: unknown[]) => mockMe(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
  login: jest.fn(),
  firebaseExchange: jest.fn(),
  firebaseRegister: jest.fn(),
  register: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
  deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args),
}));

const mockCurrentFirebaseIdToken = jest.fn(async (..._args: unknown[]) => 'firebase-id-token');
const mockSignOutOfFirebase = jest.fn(async (..._args: unknown[]) => true);
const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn(async (..._args: unknown[]) => undefined);
const mockDeleteItemAsync = jest.fn(async (..._args: unknown[]) => undefined);

// Captured so a case can simulate a return to the foreground. `AppState` is spied
// on rather than mocked wholesale — replacing the whole react-native module makes
// the Expo/RN preset's own setup fail.
let mockAppStateListener: ((state: string) => void) | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER = { id: 'u1', name: 'Owner', email: 'o@example.com', role: 'OWNER', status: 'ACTIVE' };

function base64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A structurally valid JWT whose only meaningful claim is `exp`. */
function makeJwt(expSeconds: number): string {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ sub: 'u1', jti: 'jti-1', exp: expSeconds }));
  return `${header}.${payload}.signature`;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

async function mountSignedIn(token: string) {
  mockGetItemAsync.mockResolvedValue(token);
  const view = await renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(view.result.current.status).toBe('signedIn'));
  return view;
}

beforeEach(() => {
  mockHandlers.lost = null;
  mockHandlers.renewal = null;
  mockHandlers.recovery = null;
  mockAppStateListener = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, handler: (s: string) => void) => {
    mockAppStateListener = handler;
    return { remove: () => { mockAppStateListener = null; } };
  }) as never);
  mockRenew.mockReset();
  mockMe.mockReset();
  mockLogout.mockReset();
  mockCurrentFirebaseIdToken.mockReset();
  mockCurrentFirebaseIdToken.mockResolvedValue('firebase-id-token');
  mockSignOutOfFirebase.mockReset();
  mockSignOutOfFirebase.mockResolvedValue(true);
  mockGetItemAsync.mockReset();
  mockMe.mockResolvedValue({ user: USER });
  mockLogout.mockResolvedValue({ message: 'Signed out' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const nearExpiryToken = () => makeJwt(Math.floor(Date.now() / 1000) + 300); // 5 min
const farExpiryToken = () => makeJwt(Math.floor(Date.now() / 1000) + 3600); // 60 min

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

describe('AUTH-03 — classification is by application code', () => {
  it('terminal codes end the session; SESSION_EXPIRED and transient do not', () => {
    expect(isSessionError(new ApiError(401, 'SESSION_REVOKED', 'x'))).toBe(true);
    expect(isSessionError(new ApiError(401, 'SESSION_INVALIDATED', 'x'))).toBe(true);
    expect(isSessionError(new ApiError(401, 'INVALID_TOKEN', 'x'))).toBe(true);
    expect(isSessionError(new ApiError(401, 'AUTH_REQUIRED', 'x'))).toBe(true);
    expect(isSessionError(new ApiError(403, 'ACCOUNT_DISABLED', 'x'))).toBe(true);

    expect(isSessionError(new ApiError(401, 'SESSION_EXPIRED', 'x'))).toBe(false);
    expect(isSessionError(new ApiError(403, 'BUSINESS_NOT_ACTIVE', 'x'))).toBe(false);
    expect(isSessionError(new ApiError(503, 'FIREBASE_UNAVAILABLE', 'x'))).toBe(false);
    expect(isSessionError(new ApiError(429, 'SESSION_RENEW_RATE_LIMITED', 'x'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Single-flight
// ---------------------------------------------------------------------------

describe('AUTH-03 — single-flight', () => {
  it('collapses concurrent triggers into ONE network renewal', async () => {
    const view = await mountSignedIn(nearExpiryToken());
    expect(typeof mockHandlers.renewal).toBe('function');

    const pending = deferred<{ token: string; tokenExpiresAt: string; sessionExpiresAt: string; user: typeof USER }>();
    mockRenew.mockReturnValue(pending.promise);

    let a: Promise<string | null> | undefined;
    let b: Promise<string | null> | undefined;
    await act(async () => {
      a = mockHandlers.renewal!(view.result.current.token!);
      b = mockHandlers.renewal!(view.result.current.token!);
    });

    expect(mockRenew).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({
        token: 'renewed-token',
        tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        sessionExpiresAt: new Date(Date.now() + 14 * 86400_000).toISOString(),
        user: USER,
      });
      await Promise.all([a, b]);
    });

    await waitFor(() => expect(view.result.current.token).toBe('renewed-token'));
  });
});

// ---------------------------------------------------------------------------
// Auth epoch / stale response
// ---------------------------------------------------------------------------

describe('AUTH-03 — the auth epoch discards stale renewals', () => {
  it('a renewal that completes after a sign-out does NOT resurrect the session', async () => {
    const view = await mountSignedIn(nearExpiryToken());
    expect(typeof mockHandlers.renewal).toBe('function');

    const pending = deferred<{ token: string; tokenExpiresAt: string; sessionExpiresAt: string; user: typeof USER }>();
    mockRenew.mockReturnValue(pending.promise);

    let inFlight: Promise<string | null> | undefined;
    await act(async () => {
      inFlight = mockHandlers.renewal!(view.result.current.token!);
    });

    // The user signs out WHILE the renewal is in flight. This advances the epoch.
    await act(async () => {
      await view.result.current.signOut();
    });
    expect(view.result.current.status).toBe('signedOut');

    // The stale response now arrives. It must be DISCARDED.
    await act(async () => {
      pending.resolve({
        token: 'renewed-after-logout',
        tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        sessionExpiresAt: new Date(Date.now() + 14 * 86400_000).toISOString(),
        user: USER,
      });
      await inFlight;
    });

    expect(view.result.current.token).toBeNull();
    expect(view.result.current.status).toBe('signedOut');
  });
});

// ---------------------------------------------------------------------------
// DEGRADED vs terminal on refresh
// ---------------------------------------------------------------------------

describe('AUTH-03 — refresh preserves a valid session on a transient failure', () => {
  it('a transient failure marks DEGRADED and keeps the session', async () => {
    const view = await mountSignedIn(farExpiryToken());
    mockMe.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server'));

    await act(async () => {
      await view.result.current.refresh();
    });

    expect(view.result.current.status).toBe('signedIn');
    expect(view.result.current.authPhase).toBe('degraded');
    expect(view.result.current.token).not.toBeNull();
  });

  it('a terminal failure still signs out', async () => {
    const view = await mountSignedIn(farExpiryToken());
    mockMe.mockRejectedValueOnce(new ApiError(401, 'SESSION_REVOKED', 'Session ended'));

    await act(async () => {
      await view.result.current.refresh();
    });

    expect(view.result.current.status).toBe('signedOut');
  });
});

// ---------------------------------------------------------------------------
// Proactive renewal and the 10-minute threshold
// ---------------------------------------------------------------------------

describe('AUTH-03 — proactive renewal at the 10-minute threshold', () => {
  it('renews when the horizon is inside the threshold', async () => {
    const view = await mountSignedIn(nearExpiryToken());
    mockRenew.mockResolvedValue({
      token: 'proactive-token',
      tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      sessionExpiresAt: new Date(Date.now() + 14 * 86400_000).toISOString(),
      user: USER,
    });

    await act(async () => {
      await mockHandlers.renewal!(view.result.current.token!);
    });

    expect(mockRenew).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(view.result.current.token).toBe('proactive-token'));
  });

  it('does NOT renew when the horizon is outside the threshold', async () => {
    const view = await mountSignedIn(farExpiryToken());

    await act(async () => {
      await mockHandlers.renewal!(view.result.current.token!);
    });

    expect(mockRenew).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AppState foreground
// ---------------------------------------------------------------------------

describe('AUTH-03 — foreground renewal', () => {
  it('renews on a return to the foreground when due', async () => {
    const view = await mountSignedIn(nearExpiryToken());
    expect(typeof mockAppStateListener).toBe('function');

    mockRenew.mockResolvedValue({
      token: 'foreground-token',
      tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      sessionExpiresAt: new Date(Date.now() + 14 * 86400_000).toISOString(),
      user: USER,
    });

    await act(async () => {
      mockAppStateListener!('active');
      // allow the promise chain inside the listener to settle
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(mockRenew).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.result.current.token).toBe('foreground-token'));
  });
});

// ---------------------------------------------------------------------------
// 429 + Retry-After + cooldown
// ---------------------------------------------------------------------------

describe('AUTH-03 — a renewal 429 preserves the session and backs off', () => {
  it('marks DEGRADED and does not attempt another renewal during the cooldown', async () => {
    const view = await mountSignedIn(nearExpiryToken());

    const limited = new ApiError(429, 'SESSION_RENEW_RATE_LIMITED', 'Too many renewal attempts');
    limited.retryAfter = 60;
    mockRenew.mockRejectedValueOnce(limited);

    await act(async () => {
      await mockHandlers.renewal!(view.result.current.token!);
    });

    expect(mockRenew).toHaveBeenCalledTimes(1);
    expect(view.result.current.status).toBe('signedIn');
    expect(view.result.current.authPhase).toBe('degraded');

    // A second trigger inside the cooldown must NOT call the server again.
    await act(async () => {
      await mockHandlers.renewal!(view.result.current.token!);
    });
    expect(mockRenew).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Horizon
// ---------------------------------------------------------------------------

describe('AUTH-03 — the effective horizon is min(tokenExpiresAt, sessionExpiresAt)', () => {
  it('reports the session cap when it is earlier than the token expiry', async () => {
    const view = await mountSignedIn(nearExpiryToken());

    const sessionCap = Date.now() + 2 * 60_000; // 2 min: earlier than the 1h token
    mockRenew.mockResolvedValue({
      token: 'renewed-near-cap',
      tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      sessionExpiresAt: new Date(sessionCap).toISOString(),
      user: USER,
    });

    await act(async () => {
      await mockHandlers.renewal!(view.result.current.token!);
    });

    const horizon = view.result.current.authHorizonMs;
    expect(horizon).not.toBeNull();
    // The cap wins even though the token lives an hour longer.
    expect(horizon).toBeLessThan(Date.now() + 3 * 60_000);
  });
});
