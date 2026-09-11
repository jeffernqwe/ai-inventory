import { useEffect, useState } from 'react';

import { inventoryApi } from '../lib/api';

/**
 * Loads the authoritative inventory row for a product+location so movement
 * forms can display current stock and warn before an action the server would
 * reject. The server still enforces every guard atomically — this is UX only.
 *
 * Shared by MovementForm (stock-in/out/adjust) and TransferForm (Phase 19) —
 * both need "what is on hand here right now" before the user commits.
 */
export default function useInventoryRow(token, productId, locationId) {
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token || !productId || !locationId) {
      setRow(null);
      setLoaded(false);
      return undefined;
    }
    setLoading(true);
    setLoaded(false);
    inventoryApi
      .list(token, { productId, page: 1, limit: 100 })
      .then((res) => {
        if (!active) return;
        const match = (res?.items ?? []).find((r) => r.location?.id === locationId);
        setRow(match ?? null);
      })
      .catch(() => {
        if (active) setRow(null);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [token, productId, locationId]);

  return { row, loading, loaded };
}
