import { Redirect, Stack } from 'expo-router';

import { CenterLoader } from '../../components/ListState';
import { useSession } from '../../lib/auth';
import { colors } from '../../lib/theme';

/**
 * Authenticated group layout. Renders nothing until the session is restored,
 * then redirects signed-out/deep-linked users to /login. Every child screen
 * sits in its own header stack with a native back button.
 */
export default function AppLayout() {
  const { status } = useSession();

  if (status === 'loading') {
    return <CenterLoader label="Restoring session…" />;
  }
  if (status !== 'signedIn') {
    return <Redirect href="/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { fontWeight: '700', color: colors.text },
        headerStyle: { backgroundColor: colors.surface },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="dashboard" options={{ headerShown: false }} />
      <Stack.Screen name="products/index" options={{ title: 'Products' }} />
      <Stack.Screen name="products/new" options={{ title: 'New Product' }} />
      <Stack.Screen name="products/[id]/index" options={{ title: 'Product' }} />
      <Stack.Screen name="products/[id]/edit" options={{ title: 'Edit Product' }} />
      <Stack.Screen name="categories" options={{ title: 'Categories' }} />
      <Stack.Screen name="locations" options={{ title: 'Locations' }} />
      <Stack.Screen name="inventory" options={{ title: 'Inventory' }} />
      <Stack.Screen name="inventory/[id]" options={{ title: 'Stock Record' }} />
      <Stack.Screen name="stock-in" options={{ title: 'Stock In' }} />
      <Stack.Screen name="stock-out" options={{ title: 'Stock Out' }} />
      <Stack.Screen name="adjust" options={{ title: 'Adjust Stock' }} />
      <Stack.Screen name="history" options={{ title: 'Inventory History' }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
    </Stack>
  );
}
