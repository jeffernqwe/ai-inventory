import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import * as api from './api';
import type { RegisterPayload } from './api';
import { ApiError, setSessionLostHandler } from './client';
import { isFirebaseConfigured } from './firebase';
import { FirebaseAuthError, ensureFirebaseAccount, signInWithEmail, signOutOfFirebase } from './firebase-auth';
import type { Role } from './permissions';

/**
 * Session state for the whole app.
 *
 * The JWT is the only thing persisted (SecureStore — Android Keystore / iOS
 * Keychain). The user object is always re-fetched from /api/auth/me on boot so
 * role/status/businessId reflect the server, never a stale cache. A token that
 * is invalid, expired, or belongs to a disabled user is cleared and the app
 * returns to the login screen. Authorization stays entirely on the backend —
 * this context only decides which screen is shown.
 *
 * Phase 26A: the token is no longer the whole session. The server keeps a
 * session record named by the token's `jti`, so signing out revokes it for real,
 * one device can be ended without touching the others, and a session ended
 * elsewhere stops working here at the next request — which surfaces as the same
 * 401 this context has always treated as "no longer signed in".
 *
 * Phase 32E: Firebase is a SECOND WAY TO PROVE AN IDENTITY, not a second session.
 * `signIn` asks Firebase first and hands the ID token to
 * POST /api/auth/firebase/exchange; the token this context stores is the same
 * Inventory AI JWT it has always stored, so every rule above is untouched. The
 * legacy password route is kept as a migration path for accounts that predate
 * Firebase, and it is reached ONLY when Firebase reports that it has no identity
 * for the address — never when Firebase or the backend failed, so an outage
 * cannot become a downgrade. `lib/firebase-auth.ts` owns that classification;
 * this file only consumes it.
 */

const TOKEN_KEY = 'inventoryai.auth.token';

/** The signed-in user as the server's public shape exposes it. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status?: string;
  /**
   * Sent by `toPublicUser` (server/src/services/auth.service.js) and rendered by
   * the Profile screen as "Member since". Declared optional because the mobile
   * type does not depend on the server sending it.
   */
  createdAt?: string;
}

/** 'loading' until the boot restore settles, then one of the two settled states. */
export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface SignInCredentials {
  email: string;
  password: string;
}

/** The value exposed by {@link useSession}. */
export interface AuthValue {
  user: AuthUser | null;
  token: string | null;
  status: AuthStatus;
  signIn: (credentials: SignInCredentials) => Promise<AuthUser>;
  signUp: (input: RegisterPayload) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  refresh: () => Promise<AuthUser | null>;
  clearSession: () => Promise<void>;
}

/** Errors that mean the stored session is no longer valid. */
export function isSessionError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 401 || (err.status === 403 && err.code === 'ACCOUNT_DISABLED');
  }
  return false;
}

/**
 * The label this device will show as in the user's own session list
 * ("Android · Pixel 7"). Purely cosmetic: the server coerces it, never validates
 * it, and never uses it for a decision — so a device that cannot be described
 * still signs in.
 *
 * No dependency is added for this (`expo-device` would be the obvious one).
 * Android is the only platform that exposes a hardware model through
 * `Platform.constants`; elsewhere the OS name is the best honest answer.
 */
function currentDeviceLabel(): string {
  if (Platform.OS === 'android') {
    // Android exposes `Model` at runtime, and React Native declares it in its own
    // Flow types (Libraries/Utilities/PlatformTypes.js), but the published
    // TypeScript `PlatformConstants` shape omits it — so this narrow is the only
    // way to read a value that genuinely exists. Optional chaining is preserved
    // because the original expression used it.
    const constants = Platform.constants as { Model?: string } | undefined;
    const model = constants?.Model;
    return model ? `Android · ${model}` : 'Android device';
  }
  if (Platform.OS === 'ios') return 'iOS device';
  return 'Web browser';
}

// SecureStore is native-only; an in-memory fallback keeps the web target working
// (there the token simply is not persisted across reloads).
const mem: { token: string | null } = { token: null };

async function persistToken(token: string | null): Promise<void> {
  mem.token = token ?? null;
  if (Platform.OS === 'web') return;
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Non-fatal: the in-memory copy keeps this launch working.
  }
}

async function readStoredToken(): Promise<string | null> {
  if (Platform.OS === 'web') return mem.token;
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return mem.token;
  }
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading'); // loading | signedOut | signedIn

  // The current token, readable without re-creating callbacks; and whether the
  // server has already refused it, so sign-out knows there is nothing left to
  // revoke. Both are refs because neither should re-render anything.
  const tokenRef = useRef<string | null>(null);
  const sessionLostRef = useRef(false);

  const applySession = useCallback(async (nextToken: string | null, nextUser: AuthUser | null): Promise<void> => {
    await persistToken(nextToken);
    tokenRef.current = nextToken;
    if (nextToken) sessionLostRef.current = false;
    setToken(nextToken);
    setUser(nextUser);
    setStatus(nextToken && nextUser ? 'signedIn' : 'signedOut');
  }, []);

  const clearSession = useCallback(async (): Promise<void> => {
    await applySession(null, null);
  }, [applySession]);

  // One place decides what a refused token means. Registered here rather than in
  // each screen (see lib/client.ts), so a dead session is handled identically
  // whether it was noticed by a list, a form, or a background refresh.
  useEffect(() => {
    setSessionLostHandler((err) => {
      if (!isSessionError(err)) return;
      sessionLostRef.current = true;
      void clearSession();
    });
    return () => setSessionLostHandler(null);
  }, [clearSession]);

  /**
   * Sign in (Phase 32E). Firebase first, then the legacy password route.
   *
   * The branch is exhaustive over `FirebaseSignInOutcome`, so the legacy call is
   * reachable from exactly two states and neither of them is a Firebase fault:
   * this build has no Firebase configuration, or Firebase reported that no
   * identity answers to these credentials. Everything else — a misconfigured
   * project, a disabled Firebase user, a rate limit, a dropped connection, or a
   * token that could not be minted — becomes a `FirebaseAuthError` and the legacy
   * route is NOT tried. That is the whole point of the split: treating a failure
   * as "try the other door" would let anyone who can break Firebase choose the
   * weaker door.
   *
   * A `failure` is thrown rather than returned so the screens' existing error path
   * (`err.message` after `fieldMap`) handles it with no new branch — and it is not
   * an `ApiError`, because nothing here produced an HTTP response.
   *
   * The exchange's response is the same envelope `login` returns, so the session
   * is applied identically whichever route proved the identity. Server-side
   * refusals of the exchange (`REGISTRATION_REQUIRED`, `ACCOUNT_DISABLED`,
   * `BUSINESS_NOT_ACTIVE`, `FIREBASE_TOKEN_INVALID`, `FIREBASE_NOT_CONFIGURED`)
   * propagate as `ApiError`s and are never retried against the legacy route.
   */
  const signIn = useCallback(
    async ({ email, password }: SignInCredentials): Promise<AuthUser> => {
      const deviceLabel = currentDeviceLabel();
      const outcome = await signInWithEmail(email, password);

      if (outcome.kind === 'failure') {
        throw new FirebaseAuthError(outcome.code, outcome.message);
      }

      const { token: nextToken, user: nextUser } =
        outcome.kind === 'idToken'
          ? await api.firebaseExchange({ idToken: outcome.idToken, deviceLabel })
          : await api.login({ email, password, deviceLabel });

      await applySession(nextToken, nextUser);
      return nextUser;
    },
    [applySession]
  );

  /**
   * Register a business owner (Phase 32E).
   *
   * WITH NO FIREBASE CONFIGURATION this is the pre-32D flow unchanged: the server
   * creates the account and the owner is signed straight in. That branch is what
   * keeps an unconfigured build (the repository today) fully usable, and it is
   * decided from the build's environment rather than from a runtime outcome, so it
   * cannot be reached by anything an attacker does.
   *
   * OTHERWISE the three steps of Phase 32A §8.2 run in order, each through the
   * endpoint that already owns its step: Firebase creates the identity, the server
   * creates the tenant, and the exchange opens the session. No token is issued by
   * `firebaseRegister` — exactly as `POST /api/auth/register` issues none — so the
   * exchange is what signs the new owner in.
   */
  const signUp = useCallback(
    async ({ businessName, name, email, password }: RegisterPayload): Promise<AuthUser> => {
      if (!isFirebaseConfigured()) {
        await api.register({ businessName, name, email, password });
        return signIn({ email, password });
      }

      const { idToken } = await ensureFirebaseAccount({ email, password, name });
      await api.firebaseRegister({ idToken, businessName, name });
      const { token: nextToken, user: nextUser } = await api.firebaseExchange({
        idToken,
        deviceLabel: currentDeviceLabel(),
      });
      await applySession(nextToken, nextUser);
      return nextUser;
    },
    [applySession, signIn]
  );

  /**
   * Sign out (Phase 26A). The server session is revoked FIRST, so the token stops
   * working everywhere immediately, and the local session is cleared whatever the
   * server answers — someone who taps "Sign out" on a plane is still signed out
   * on this device.
   *
   * If the token has already been refused by the server (revoked here or from
   * another device) there is nothing left to revoke, so the request is skipped
   * instead of being sent to collect a guaranteed 401.
   *
   * `all` ends every session the user has open, this one included ("sign out
   * everywhere", the same route with `{ all: true }`).
   *
   * Phase 32E adds one step at the end: the Firebase session is ended too. It is
   * local and holds nothing durable (Phase 32D pinned `inMemoryPersistence`), so
   * this is hygiene rather than revocation — but leaving it live would let a later
   * sign-in silently resume the previous Firebase user, and a sign-out that leaves
   * an identity signed in somewhere is not a sign-out. It is best effort and never
   * fatal, and it runs after `clearSession` so the local session is gone whatever
   * the SDK does.
   */
  const endSession = useCallback(
    async ({ all = false }: { all?: boolean } = {}): Promise<void> => {
      const current = tokenRef.current;
      const alreadyLost = sessionLostRef.current;
      sessionLostRef.current = false;
      if (current && !alreadyLost) {
        try {
          await api.logout(current, { all });
        } catch {
          // Offline, or the session ended between the tap and the request. The
          // local sign-out proceeds either way — the server is the authority on
          // whether the session is really gone.
        }
      }
      await clearSession();
      await signOutOfFirebase();
    },
    [clearSession]
  );

  const signOut = useCallback((): Promise<void> => endSession(), [endSession]);
  const signOutEverywhere = useCallback((): Promise<void> => endSession({ all: true }), [endSession]);

  /** Re-validate the current token against /api/auth/me and refresh the user. */
  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    if (!token) {
      setUser(null);
      setStatus('signedOut');
      return null;
    }
    try {
      const { user: fresh } = await api.me(token);
      setUser(fresh);
      setStatus('signedIn');
      return fresh;
    } catch (err) {
      if (isSessionError(err)) {
        await clearSession();
      } else {
        // Server unreachable / transient — do not drop a still-valid token.
        setUser(null);
        setStatus('signedOut');
      }
      return null;
    }
  }, [token, clearSession]);

  // Restore the session exactly once on boot.
  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await readStoredToken();
      if (!stored) {
        if (active) {
          tokenRef.current = null;
          setToken(null);
          setUser(null);
          setStatus('signedOut');
        }
        return;
      }
      try {
        const { user: fresh } = await api.me(stored);
        if (active) {
          // Restored without going through applySession (the token is already
          // persisted), so the ref signOut reads must be set here too.
          tokenRef.current = stored;
          sessionLostRef.current = false;
          setToken(stored);
          setUser(fresh);
          setStatus('signedIn');
        }
      } catch (err) {
        if (isSessionError(err)) {
          await persistToken(null);
        }
        if (active) {
          tokenRef.current = null;
          setToken(null);
          setUser(null);
          setStatus('signedOut');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, token, status, signIn, signUp, signOut, signOutEverywhere, refresh, clearSession }),
    [user, token, status, signIn, signUp, signOut, signOutEverywhere, refresh, clearSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useSession must be used within an AuthProvider');
  return ctx;
}

export default AuthProvider;
