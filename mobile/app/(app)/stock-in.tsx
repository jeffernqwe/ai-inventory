import { useLocalSearchParams } from 'expo-router';

import AccessDenied from '../../components/AccessDenied';
import MovementForm from '../../components/MovementForm';
import { useSession } from '../../lib/auth';
import { canStockIn } from '../../lib/permissions';

/** Route params are `string | string[]` (a key repeated in the link yields an array). */
function str(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

export default function StockInScreen() {
  const { user } = useSession();
  const p = useLocalSearchParams();
  if (!canStockIn(user)) {
    return <AccessDenied message="Your role does not allow stock-in." />;
  }
  return (
    <MovementForm
      kind="stock-in"
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
