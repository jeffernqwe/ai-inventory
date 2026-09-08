import { useCallback, useEffect, useState } from 'react';

import { productsApi } from '../lib/api';
import { isSessionError, useSession } from '../lib/auth';

/** Loads a single product by id (server-authoritative) for detail/edit screens. */
export function useProductDetail(id) {
  const { token, signOut } = useSession();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const p = await productsApi.get(token, id);
      setProduct(p);
    } catch (err) {
      setError(err);
      if (isSessionError(err)) await signOut();
    } finally {
      setLoading(false);
    }
  }, [token, id, signOut]);

  useEffect(() => {
    load();
  }, [load]);

  return { product, loading, error, reload: load };
}

export default useProductDetail;
