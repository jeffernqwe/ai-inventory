import { Stack } from 'expo-router';
import { View } from 'react-native';

import AccessDenied from '../../../components/AccessDenied';
import PoForm from '../../../components/PoForm';
import { useSession } from '../../../lib/auth';
import { canManagePurchaseOrders } from '../../../lib/permissions';
import { colors } from '../../../lib/theme';

export default function NewPurchaseOrderScreen() {
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
