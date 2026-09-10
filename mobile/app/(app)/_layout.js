import { Redirect, Stack } from 'expo-router';

import { CenterLoader } from '../../components/ListState';
import SignOutIcon from '../../components/SignOutIcon';
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
      <Stack.Screen name="scan" options={{ title: 'Scan Barcode' }} />
      <Stack.Screen name="categories" options={{ title: 'Categories' }} />
      <Stack.Screen name="locations" options={{ title: 'Locations' }} />
      <Stack.Screen
        name="inventory"
        options={{ title: 'Inventory', headerRight: () => <SignOutIcon /> }}
      />
      <Stack.Screen name="inventory/[id]" options={{ title: 'Stock Record' }} />
      <Stack.Screen name="purchase-orders/index" options={{ title: 'Purchase Orders' }} />
      <Stack.Screen name="purchase-orders/[id]/index" options={{ title: 'Purchase Order' }} />
      <Stack.Screen name="purchase-orders/[id]/receive" options={{ title: 'Receive Stock' }} />
      <Stack.Screen name="stock-in" options={{ title: 'Stock In' }} />
      <Stack.Screen name="stock-out" options={{ title: 'Stock Out' }} />
      <Stack.Screen name="adjust" options={{ title: 'Adjust Stock' }} />
      <Stack.Screen name="history" options={{ title: 'Inventory History' }} />
      <Stack.Screen name="ai/index" options={{ title: 'AI Assistant' }} />
      <Stack.Screen name="ai/new" options={{ title: 'New Chat' }} />
      <Stack.Screen name="ai/[id]" options={{ title: 'AI Assistant' }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
    </Stack>
  );
}
