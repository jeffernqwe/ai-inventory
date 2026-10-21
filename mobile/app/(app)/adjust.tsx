import { useLocalSearchParams } from 'expo-router';

import AccessDenied from '../../components/AccessDenied';
import MovementForm from '../../components/MovementForm';
import { useSession } from '../../lib/auth';
import { canAdjustStock } from '../../lib/permissions';

/** Route params are `string | string[]` (a key repeated in the link yields an array). */
function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

export default function AdjustStockScreen() {
  const { user } = useSession();
  const p = useLocalSearchParams();
  if (!canAdjustStock(user)) {
    return <AccessDenied message="Only managers and above can adjust stock." />;
  }
  return (
    <MovementForm
      kind="adjust"
      initialProductId={str(p.productId)}
      initialProductName={str(p.productName)}
      initialLocationId={str(p.locationId)}
      initialLocationName={str(p.locationName)}
    />
  );
}
