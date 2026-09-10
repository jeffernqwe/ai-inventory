import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { palettes } from './theme';

const THEME_PREFERENCE_KEY = 'theme-preference';

const ThemeContext = createContext(null);

/**
 * ThemeProvider resolves the active color palette for the whole app.
 *
 * Preference is one of 'system' | 'light' | 'dark' and is persisted in
 * expo-secure-store (already a dependency, no new native module). Until the
 * stored preference is hydrated the provider falls back to 'system', so the
 * first paint matches the OS scheme immediately and an explicit override
 * applies one frame later.
 */
export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null
  const [preference, setPreference] = useState('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(THEME_PREFERENCE_KEY)
      .then((stored) => {
        if (!active) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreference(stored);
        }
        setHydrated(true);
      })
      .catch(() => {
        // SecureStore can be unavailable (rare platform edge) — keep the
        // 'system' default rather than blocking startup.
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setScheme = useCallback((next) => {
    const normalized = next === 'light' || next === 'dark' ? next : 'system';
    setPreference(normalized);
    SecureStore.setItemAsync(THEME_PREFERENCE_KEY, normalized).catch(() => {
      // Persistence is best-effort; the in-memory preference still applies.
    });
  }, []);

  const scheme = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
  const isDark = scheme === 'dark';
  const colors = palettes[scheme];

  const value = useMemo(
    () => ({ colors, scheme, isDark, preference, setScheme, hydrated }),
    [colors, scheme, isDark, preference, setScheme, hydrated],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Access the resolved theme. Returns { colors, scheme, isDark, preference,
 * setScheme, hydrated }. Must be rendered inside <ThemeProvider>.
 */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
