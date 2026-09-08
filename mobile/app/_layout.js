import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '../lib/auth';
import { colors } from '../lib/theme';

/**
 * Root layout. Wraps the whole navigation tree in the auth session provider so
 * every screen can read { user, token, status, signIn, signUp, signOut }.
 * Screens in the root stack manage their own chrome: the protected (app) group
 * renders its own header stack, while auth screens draw their own layout.
 */
export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
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
    </AuthProvider>
  );
}
