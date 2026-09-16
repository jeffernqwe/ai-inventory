import { Stack } from 'expo-router';

import AccessDenied from '../../../components/AccessDenied';
import PoForm from '../../../components/PoForm';
import { useSession } from '../../../lib/auth';
import { canManagePurchaseOrders } from '../../../lib/permissions';

export default function NewPurchaseOrderScreen() {
  const { user } = useSession();
  return (
    <>
      <Stack.Screen options={{ title: 'New Purchase Order' }} />
      {canManagePurchaseOrders(user) ? (
        <PoForm />
      ) : (
        <AccessDenied message="Only managers and above can create purchase orders." />
      )}
    </>
  );
}
