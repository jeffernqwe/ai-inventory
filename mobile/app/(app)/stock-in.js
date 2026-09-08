import { useLocalSearchParams } from 'expo-router';

import AccessDenied from '../../components/AccessDenied';
import Screen from '../../components/Screen';
import MovementForm from '../../components/MovementForm';
import { useSession } from '../../lib/auth';
import { canStockIn } from '../../lib/permissions';

function str(v) {
  return Array.isArray(v) ? v[0] : v;
}

export default function StockInScreen() {
  const { user } = useSession();
  const p = useLocalSearchParams();
  if (!canStockIn(user)) {
    return <AccessDenied message="Your role does not allow stock-in." />;
  }
  return (
    <Screen padded={false}>
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
    </Screen>
  );
}
