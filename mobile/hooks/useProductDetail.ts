import { useCallback, useEffect, useRef, useState } from 'react';

import { productsApi } from '../lib/api';
import type { ApiResponse } from '../lib/api';
import { isSessionError, useSession } from '../lib/auth';

/** Loads a single product by id (server-authoritative) for detail/edit screens. */
export function useProductDetail(id: string | undefined): {
  product: ApiResponse;
  loading: boolean;
  error: unknown;
  reload: () => Promise<void>;
} {
  const { token, signOut } = useSession();
  const [product, setProduct] = useState<ApiResponse>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // The request currently allowed to commit its result. `reload` is part of the
  // public API, so requests overlap from anywhere — the focus refetch, the
  // ErrorState retry, or the reload after archive/generate-barcode — and a slow
  // earlier response must not repaint the screen with a superseded product.
  //
  // This guard therefore lives in `load`, not in the Effect's cleanup: an
  // imperative reload has no Effect run to be cleaned up by, so an
  // Effect-scoped `active` flag would protect only the first load and leave
  // every later overlap unguarded. Supersession is a property of the request,
  // not of the mount. It is a ref, so it also survives the `load` identity
  // changing under it and still covers a request left in flight by a previous
  // closure when `token`/`id` changed.
  const latestRequest = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    if (!token || !id) return;
    const request = ++latestRequest.current;
    const isLatest = (): boolean => latestRequest.current === request;
    // Still synchronous, before the first await: a refresh must be able to show
    // loading while the previous product stays on screen, which is what both
    // consumers' `loading && !product` gate relies on.
    setLoading(true);
    setError(null);
    try {
      const p = await productsApi.get(token, id);
      // A superseded response is discarded whole — it may not touch the product
      // the newer request is responsible for.
      if (!isLatest()) return;
      setProduct(p);
    } catch (err) {
      // A superseded failure is discarded too, and that includes a session
      // error: a stale 401 must not sign the user out after a newer request has
      // already succeeded.
      if (!isLatest()) return;
      setError(err);
      if (isSessionError(err)) await signOut();
    } finally {
      // Only the newest request owns the spinner, so an older one settling must
      // not clear a load that is still running.
      if (isLatest()) setLoading(false);
    }
  }, [token, id, signOut]);

  // First load only. `load` is also exposed as the imperative `reload()` API, and
  // `products/[id]/index.tsx` awaits it for sequencing (`await reload(); await
  // loadStock();`), so its `loading`/`error` writes have to land synchronously
  // before the request: a same-key refresh deliberately sets `loading` while the
  // previous `product` stays on screen, and both consumers gate on
  // `loading && !product`, so deriving `loading` would change their behaviour.
  useEffect(() => {
    // Deliberate, narrow exception at this one call site — not a suppression of
    // any dependency rule.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { product, loading, error, reload: load };
}

export default useProductDetail;
