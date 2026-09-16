import { useLocalSearchParams } from 'expo-router';

import AccessDenied from '../../components/AccessDenied';
import TransferForm from '../../components/TransferForm';
import { useSession } from '../../lib/auth';
import { canTransferStock } from '../../lib/permissions';

/** Route params are `string | string[]` (a key repeated in the link yields an array). */
function str(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

export default function TransferStockScreen() {
  const { user } = useSession();
  const p = useLocalSearchParams();
  if (!canTransferStock(user)) {
    return <AccessDenied message="Only managers and above can transfer stock." />;
  }
  return (
    <TransferForm
      initialProductId={str(p.productId)}
      initialProductName={str(p.productName)}
      initialLocationId={str(p.locationId)}
      initialLocationName={str(p.locationName)}
    />
  );
}
