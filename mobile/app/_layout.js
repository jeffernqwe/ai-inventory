import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '../lib/auth';
import { ThemeProvider, useTheme } from '../lib/theme-context';

/**
 * Root layout. Wraps the whole navigation tree in the theme provider (light /
 * dark palettes) and the auth session provider so every screen can read
 * { user, token, status, signIn, signUp, signOut }.
 * Screens in the root stack manage their own chrome: the protected (app) group
 * renders its own header stack, while auth screens draw their own layout.
 */
function RootNavigator() {
  const { colors, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
