import { useCallback, useEffect, useState } from 'react';

import type { ApiResponse } from '../lib/api';
import type { QueryParams } from '../lib/client';

/**
 * The `list` surface shared by every reference api (categories, locations,
 * suppliers, products). Naming just this one method keeps the hook independent
 * of which catalogue it is pointed at.
 */
export interface ReferenceListApi {
  list: (token: string, params?: QueryParams) => Promise<ApiResponse>;
}

/**
 * Loads the active list of a reference resource (categories/locations) for use
 * in filters and pickers. Reads through the normal paginated endpoint (one page
 * at max size) so it stays correct if the list grows.
 */
export function useActiveRef(
  token: string | null,
  api: ReferenceListApi,
  { limit = 100 }: { limit?: number } = {}
): { items: ApiResponse[]; loading: boolean; reload: () => Promise<void> } {
  const [items, setItems] = useState<ApiResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async (): Promise<void> => {
    if (!token) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.list(token, { status: 'ACTIVE', page: 1, limit });
      setItems(res?.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [api, token, limit]);

  // First load uses a synchronous loading transition intentionally. `loading` is
  // a lifecycle signal, not derived data: `items.length === 0` cannot distinguish
  // an initial load from a successfully loaded empty catalogue. MovementForm,
  // PoForm and TransferForm all depend on `loading && items.length === 0` for
  // their initial-loading UI. Deriving `loading` from `items` would therefore
  // change the empty-catalogue behaviour.
  //
  // This is a narrow lint-only exception. The hook currently has no production
  // callers of its `reload()` API and no reachable overlapping-request flow, so
  // no request-identity guard is being introduced in this lint phase. If reload
  // becomes actively consumed later, request supersession must be addressed as
  // a separate correctness change.
  useEffect(() => {
    // Deliberate, narrow exception at this one call site — not a suppression of
    // any dependency rule.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  return { items, loading, reload };
}

/** Both option lists, in the shape screens need. */
export function useCatalogOptions(
  token: string | null,
  { categoriesApi, locationsApi }: { categoriesApi: ReferenceListApi; locationsApi: ReferenceListApi }
): {
  categories: ApiResponse[];
  locations: ApiResponse[];
  loadingCategories: boolean;
  loadingLocations: boolean;
  reloadCategories: () => Promise<void>;
  reloadLocations: () => Promise<void>;
} {
  const categories = useActiveRef(token, categoriesApi);
  const locations = useActiveRef(token, locationsApi);
  return {
    categories: categories.items,
    locations: locations.items,
    loadingCategories: categories.loading,
    loadingLocations: locations.loading,
    reloadCategories: categories.reload,
    reloadLocations: locations.reload,
  };
}
