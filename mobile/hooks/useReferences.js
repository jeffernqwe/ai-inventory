import { useCallback, useEffect, useState } from 'react';

/**
 * Loads the active list of a reference resource (categories/locations) for use
 * in filters and pickers. Reads through the normal paginated endpoint (one page
 * at max size) so it stays correct if the list grows.
 */
export function useActiveRef(token, api, { limit = 100 } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
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

  useEffect(() => {
    reload();
  }, [reload]);

  return { items, loading, reload };
}

/** Both option lists, in the shape screens need. */
export function useCatalogOptions(token, { categoriesApi, locationsApi }) {
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
