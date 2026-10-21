import { useLocalSearchParams } from 'expo-router';

import AccessDenied from '../../components/AccessDenied';
import MovementForm from '../../components/MovementForm';
import { useSession } from '../../lib/auth';
import { canStockOut } from '../../lib/permissions';

/** Route params are `string | string[]` (a key repeated in the link yields an array). */
function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

export default function StockOutScreen() {
  const { user } = useSession();
  const p = useLocalSearchParams();
  if (!canStockOut(user)) {
    return <AccessDenied message="Your role does not allow stock-out." />;
  }
  return (
    <MovementForm
      kind="stock-out"
      initialProductId={str(p.productId)}
      initialProductName={str(p.productName)}
      initialProductSku={str(p.sku)}
      initialProductBarcode={str(p.barcode)}
      lockProduct={str(p.lock) === '1'}
      initialLocationId={str(p.locationId)}
      initialLocationName={str(p.locationName)}
    />
  );
}
