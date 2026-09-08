import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import * as api from './api';
import { ApiError } from './client';

/**
 * Session state for the whole app.
 *
 * The JWT is the only thing persisted (SecureStore — Android Keystore / iOS
 * Keychain). The user object is always re-fetched from /api/auth/me on boot so
 * role/status/businessId reflect the server, never a stale cache. A token that
 * is invalid, expired, or belongs to a disabled account is cleared and the app
 * returns to the login screen. Authorization stays entirely on the backend —
 * this context only decides which screen is shown.
 */

const TOKEN_KEY = 'inventoryai.auth.token';

/** Errors that mean the stored session is no longer valid. */
export function isSessionError(err) {
  if (err instanceof ApiError) {
    return err.status === 401 || (err.status === 403 && err.code === 'ACCOUNT_DISABLED');
  }
  return false;
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

  const applySession = useCallback(async (nextToken, nextUser) => {
    await persistToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setStatus(nextToken && nextUser ? 'signedIn' : 'signedOut');
  }, []);

  const clearSession = useCallback(async () => {
    await applySession(null, null);
  }, [applySession]);

  const signIn = useCallback(
    async ({ email, password }) => {
      const { token: nextToken, user: nextUser } = await api.login({ email, password });
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

  const signOut = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

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
          setToken(null);
          setUser(null);
          setStatus('signedOut');
        }
        return;
      }
      try {
        const { user: fresh } = await api.me(stored);
        if (active) {
          setToken(stored);
          setUser(fresh);
          setStatus('signedIn');
        }
      } catch (err) {
        if (isSessionError(err)) {
          await persistToken(null);
        }
        if (active) {
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
    () => ({ user, token, status, signIn, signUp, signOut, refresh, clearSession }),
    [user, token, status, signIn, signUp, signOut, refresh, clearSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useSession must be used within an AuthProvider');
  return ctx;
}

export default AuthProvider;
