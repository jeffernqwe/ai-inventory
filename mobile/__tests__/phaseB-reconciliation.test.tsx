/**
 * Phase B — reconciliation between the two durable credentials.
 *
 * Owner decision P2 makes the device hold TWO persisted credentials: the native
 * Firebase session and the Inventory AI JWT. This file pins the rules that keep that
 * from becoming split-brain authentication, and each rule is asserted as a NEGATIVE
 * as well as a positive, because the failure mode is an action that should not
 * happen:
 *
 *   COLD START. The Inventory AI JWT is the only thing that signs anyone in. A
 *   restored native Firebase user must NOT be exchanged, must NOT be bridged into
 *   session state, and must NOT even be consulted — so `currentFirebaseIdToken`,
 *   which is the only way this file could reach native state, is asserted never to
 *   be called during boot.
 *
 *   SIGN-OUT ORDER. When a token-bearing request is refused, the Inventory AI
 *   session is cleared FIRST and the durable Firebase session is ended second. The
 *   order is the operation: clearing first is what guarantees the user is signed out
 *   here even if the Firebase call fails or the device is offline.
 *
 * WHAT IS REAL HERE: `AuthProvider`, its boot restore, its session persistence,
 * `applySession`, `clearSession` and the session-loss handler. Only the module
 * boundaries are mocked.
 */

/// <reference types="node" />
//
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

// Untyped mocks on purpose: each case below decides what the boundary "did", and a
// typed signature here would make `mockResolvedValue` reject values that are the
// whole point of the case.
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
  // THE ONE THAT MATTERS. Under P2 this can answer a token after a cold start, so it
  // is the exact seam through which a restored native user could be turned into an
  // Inventory AI session. The boot path must never call it.
  currentFirebaseIdToken: (...args: unknown[]) => mockCurrentFirebaseIdToken(...args),
  confirmFirebaseSignIn: jest.fn(),
  signOutOfFirebase: (...args: unknown[]) => mockSignOutOfFirebase(...args),
}));

const mockIsFirebaseConfigured = jest.fn(() => true);

jest.mock('../lib/config', () => ({
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
const mockLogin = jest.fn();
const mockLogout = jest.fn();
const mockFirebaseExchange = jest.fn();
const mockFirebaseRegister = jest.fn();
const mockRegister = jest.fn();
const mockFirebaseUnlink = jest.fn();

jest.mock('../lib/api', () => ({
  me: (...args: unknown[]) => mockMe(...args),
  login: (...args: unknown[]) => mockLogin(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
  firebaseExchange: (...args: unknown[]) => mockFirebaseExchange(...args),
  firebaseRegister: (...args: unknown[]) => mockFirebaseRegister(...args),
  register: (...args: unknown[]) => mockRegister(...args),
  firebaseUnlink: (...args: unknown[]) => mockFirebaseUnlink(...args),
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
const USER = { id: 'u1', name: 'Ada', email: 'owner@example.com', role: 'OWNER' as const };

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  mockIsFirebaseConfigured.mockReturnValue(true);
  mockGetItemAsync.mockResolvedValue(null);
  mockSetItemAsync.mockResolvedValue(undefined);
  mockDeleteItemAsync.mockResolvedValue(undefined);
  mockMe.mockResolvedValue({ user: USER });
  mockLogout.mockResolvedValue({ message: 'Signed out' });
  mockSignOutOfFirebase.mockResolvedValue(true);
  // Never expected to be called; set so that a regression which DOES call it is
  // visible as a resolved value rather than as an undefined-function crash.
  mockCurrentFirebaseIdToken.mockResolvedValue('should.never.be.read');
  mockSessionLostHandler.current = null;
});

// ---------------------------------------------------------------------------
// Cold start
// ---------------------------------------------------------------------------

describe('cold start — the Inventory AI JWT is the only thing that signs anyone in', () => {
  it('★ stays signed out when a durable native Firebase user exists but no JWT does', async () => {
    // The P2 split-brain case, in the direction that matters. A device that signed in
    // natively before has a restored `currentUser`; the Inventory AI session was ended
    // (signed out elsewhere, revoked, or simply expired). The app must be signed OUT,
    // and it must not reach for an exchange to fix that.
    mockGetItemAsync.mockResolvedValue(null);

    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));

    expect(view.result.current.token).toBeNull();
    expect(view.result.current.user).toBeNull();
    // THE NEGATIVES ARE THE TEST: nothing asked Firebase who was signed in, and no
    // exchange was attempted on the strength of it.
    expect(mockCurrentFirebaseIdToken).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
    expect(mockMe).not.toHaveBeenCalled();
  });

  it('asks the server about the stored JWT and nothing else', async () => {
    mockGetItemAsync.mockResolvedValue(APP_TOKEN);

    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedIn'));

    expect(mockMe).toHaveBeenCalledWith(APP_TOKEN);
    expect(view.result.current.token).toBe(APP_TOKEN);
    expect(view.result.current.user).toEqual(USER);
    // A native Firebase session living beside the JWT changes nothing about boot.
    expect(mockCurrentFirebaseIdToken).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
  });

  it('drops a JWT the server refuses, without asking Firebase for a replacement', async () => {
    // The refused-token path, which is where a naive reconciliation would try to
    // re-mint a session from the durable native credential. It must not.
    mockGetItemAsync.mockResolvedValue(APP_TOKEN);
    mockMe.mockRejectedValue(new ApiError(401, 'AUTH_REQUIRED', 'Session ended'));

    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));

    expect(mockDeleteItemAsync).toHaveBeenCalled();
    expect(mockCurrentFirebaseIdToken).not.toHaveBeenCalled();
    expect(mockFirebaseExchange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Session loss — the owner's approved Phase B addition
// ---------------------------------------------------------------------------

describe('session loss ends the durable Firebase session too, and second', () => {
  /** Mounts the provider already signed in from a stored token. */
  async function mountSignedIn() {
    mockGetItemAsync.mockResolvedValue(APP_TOKEN);
    const view = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedIn'));
    return view;
  }

  it('★ clears the Inventory AI session before the Firebase one', async () => {
    // THE ORDER IS THE PROPERTY. Clearing first is what makes the guarantee hold if
    // the Firebase call hangs or fails: the user is already signed out here.
    const order: string[] = [];
    mockDeleteItemAsync.mockImplementation(async () => {
      order.push('inventoryai.clear');
    });
    mockSignOutOfFirebase.mockImplementation(async () => {
      order.push('firebase.signOut');
      return true;
    });

    const view = await mountSignedIn();
    expect(typeof mockSessionLostHandler.current).toBe('function');

    await act(async () => {
      mockSessionLostHandler.current?.(new ApiError(401, 'AUTH_REQUIRED', 'Session ended'));
    });

    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
    expect(order).toEqual(['inventoryai.clear', 'firebase.signOut']);
    expect(view.result.current.token).toBeNull();
    expect(view.result.current.user).toBeNull();
  });

  it('still signs out locally when the Firebase sign-out reports failure', async () => {
    // The failure is REPORTED, never thrown, so it cannot take the Inventory AI
    // sign-out down with it — which is the whole reason the two are ordered.
    mockSignOutOfFirebase.mockResolvedValue(false);

    const view = await mountSignedIn();

    await act(async () => {
      mockSessionLostHandler.current?.(new ApiError(401, 'AUTH_REQUIRED', 'Session ended'));
    });

    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
    expect(mockSignOutOfFirebase).toHaveBeenCalledTimes(1);
    expect(view.result.current.token).toBeNull();
  });

  it('treats a disabled account as session loss, and ends Firebase with it', async () => {
    // `isSessionError` has always covered 403 ACCOUNT_DISABLED; Phase B adds the
    // Firebase sign-out to that path, so a disabled account does not keep a live
    // identity on the device either.
    const view = await mountSignedIn();

    await act(async () => {
      mockSessionLostHandler.current?.(
        new ApiError(403, 'ACCOUNT_DISABLED', 'This account is disabled.')
      );
    });

    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));
    expect(mockSignOutOfFirebase).toHaveBeenCalledTimes(1);
  });

  it('ignores an error that is not session loss', async () => {
    // A validation failure or a plain 403 business refusal is not a dead session, so
    // neither the local session nor the Firebase one may be touched.
    const view = await mountSignedIn();

    await act(async () => {
      mockSessionLostHandler.current?.(new ApiError(400, 'VALIDATION_ERROR', 'Bad request'));
      mockSessionLostHandler.current?.(
        new ApiError(403, 'FORBIDDEN_BUSINESS', 'Not your business')
      );
    });

    await waitFor(() => expect(view.result.current.status).toBe('signedIn'));
    expect(mockSignOutOfFirebase).not.toHaveBeenCalled();
    expect(view.result.current.token).toBe(APP_TOKEN);
  });
});

// ---------------------------------------------------------------------------
// Source guard — no listener, no bridge
// ---------------------------------------------------------------------------

describe('the session layer holds no Firebase listener', () => {
  it('never subscribes to Firebase auth state', () => {
    // An auth-state listener is the one shape that would let native state DRIVE the
    // app: it pushes `currentUser` changes, and the natural next step is to treat one
    // as a sign-in. Phase B forbids it outright, and there is no other module it
    // could hide in — `lib/firebase-native.ts` is guarded for the same verbs by the
    // Phase 1 suite.
    const source = readFileSync(join(__dirname, '..', 'lib', 'auth.tsx'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    expect(code).not.toMatch(/onAuthStateChanged|onIdTokenChanged/);
  });
});
