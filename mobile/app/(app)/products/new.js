import { View } from 'react-native';

import AccessDenied from '../../../components/AccessDenied';
import ProductForm from '../../../components/ProductForm';
import { useSession } from '../../../lib/auth';
import { canManageProducts } from '../../../lib/permissions';
import { colors } from '../../../lib/theme';

export default function NewProductScreen() {
  const { user } = useSession();
  if (!canManageProducts(user)) {
    return <AccessDenied message="Only managers and above can create products." />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProductForm />
    </View>
  );
}
