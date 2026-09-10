import { Stack } from 'expo-router';
import { View } from 'react-native';

import AccessDenied from '../../../components/AccessDenied';
import PoForm from '../../../components/PoForm';
import { useSession } from '../../../lib/auth';
import { canManagePurchaseOrders } from '../../../lib/permissions';
import { useTheme } from '../../../lib/theme-context';

export default function NewPurchaseOrderScreen() {
  const { colors } = useTheme();
  const { user } = useSession();
  return (
    <>
      <Stack.Screen options={{ title: 'New Purchase Order' }} />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {canManagePurchaseOrders(user) ? (
          <PoForm />
        ) : (
          <AccessDenied message="Only managers and above can create purchase orders." />
        )}
      </View>
    </>
  );
}
