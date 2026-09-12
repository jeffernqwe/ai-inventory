import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import * as api from './api';
import { ApiError, setSessionLostHandler } from './client';

/**
 * Session state for the whole app.
 *
 * The JWT is the only thing persisted (SecureStore — Android Keystore / iOS
 * Keychain). The user object is always re-fetched from /api/auth/me on boot so
 * role/status/businessId reflect the server, never a stale cache. A token that
 * is invalid, expired, or belongs to a disabled account is cleared and the app
 * returns to the login screen. Authorization stays entirely on the backend —
 * this context only decides which screen is shown.
 *
 * Phase 26A: the token is no longer the whole session. The server keeps a
 * session record named by the token's `jti`, so signing out revokes it for real,
 * one device can be ended without touching the others, and a session ended
 * elsewhere stops working here at the next request — which surfaces as the same
 * 401 this context has always treated as "no longer signed in".
 */

const TOKEN_KEY = 'inventoryai.auth.token';

/** Errors that mean the stored session is no longer valid. */
export function isSessionError(err) {
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
function currentDeviceLabel() {
  if (Platform.OS === 'android') {
    const model = Platform.constants?.Model;
    return model ? `Android · ${model}` : 'Android device';
  }
  if (Platform.OS === 'ios') return 'iOS device';
  return 'Web browser';
}

// SecureStore is native-only; an in-memory fallback keeps the web target working
// (there the token simply is not persisted across reloads).
const mem = { token: null };

async function persistToken(token) {
  mem.token = token ?? null;
  if (Platform.OS === 'web') return;
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Non-fatal: the in-memory copy keeps this launch working.
  }
}

async function readStoredToken() {
  if (Platform.OS === 'web') return mem.token;
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return mem.token;
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | signedOut | signedIn

  // The current token, readable without re-creating callbacks; and whether the
  // server has already refused it, so sign-out knows there is nothing left to
  // revoke. Both are refs because neither should re-render anything.
  const tokenRef = useRef(null);
  const sessionLostRef = useRef(false);

  const applySession = useCallback(async (nextToken, nextUser) => {
    await persistToken(nextToken);
    tokenRef.current = nextToken;
    if (nextToken) sessionLostRef.current = false;
    setToken(nextToken);
    setUser(nextUser);
    setStatus(nextToken && nextUser ? 'signedIn' : 'signedOut');
  }, []);

  const clearSession = useCallback(async () => {
    await applySession(null, null);
  }, [applySession]);

  // One place decides what a refused token means. Registered here rather than in
  // each screen (see lib/client.js), so a dead session is handled identically
  // whether it was noticed by a list, a form, or a background refresh.
  useEffect(() => {
    setSessionLostHandler((err) => {
      if (!isSessionError(err)) return;
      sessionLostRef.current = true;
      clearSession();
    });
    return () => setSessionLostHandler(null);
  }, [clearSession]);

  const signIn = useCallback(
    async ({ email, password }) => {
      const { token: nextToken, user: nextUser } = await api.login({
        email,
        password,
        deviceLabel: currentDeviceLabel(),
      });
      await applySession(nextToken, nextUser);
      return nextUser;
    },
    [applySession]
  );

  const signUp = useCallback(
    async ({ businessName, name, email, password }) => {
      // Register issues no token — log the owner straight in afterwards.
      await api.register({ businessName, name, email, password });
      return signIn({ email, password });
    },
    [signIn]
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
   */
  const endSession = useCallback(
    async ({ all = false } = {}) => {
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
    },
    [clearSession]
  );

  const signOut = useCallback(() => endSession(), [endSession]);
  const signOutEverywhere = useCallback(() => endSession({ all: true }), [endSession]);

  /** Re-validate the current token against /api/auth/me and refresh the user. */
  const refresh = useCallback(async () => {
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
    (async () => {
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

  const value = useMemo(
    () => ({ user, token, status, signIn, signUp, signOut, signOutEverywhere, refresh, clearSession }),
    [user, token, status, signIn, signUp, signOut, signOutEverywhere, refresh, clearSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useSession must be used within an AuthProvider');
  return ctx;
}

export default AuthProvider;
