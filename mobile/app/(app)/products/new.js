import AccessDenied from '../../../components/AccessDenied';
import ProductForm from '../../../components/ProductForm';
import { useSession } from '../../../lib/auth';
import { canManageProducts } from '../../../lib/permissions';

export default function NewProductScreen() {
  const { user } = useSession();
  if (!canManageProducts(user)) {
    return <AccessDenied message="Only managers and above can create products." />;
  }
  return <ProductForm />;
}
