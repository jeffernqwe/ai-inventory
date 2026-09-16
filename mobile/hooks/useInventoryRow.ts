import { useEffect, useState } from 'react';

import { inventoryApi } from '../lib/api';

/**
 * The parts of an inventory row these forms read. The stock-record screen owns
 * the full shape; this hook only needs "which location is this row for" and the
 * two quantities the availability line shows.
 */
export interface InventoryRowSummary {
  location?: { id?: string; name?: string } | null;
  quantity?: number;
  availableQuantity?: number;
}

/** A settled answer, held together with the request it answers. */
interface RowEntry {
  key: string;
  row: InventoryRowSummary | null;
}

/**
 * Loads the authoritative inventory row for a product+location so movement
 * forms can display current stock and warn before an action the server would
 * reject. The server still enforces every guard atomically — this is UX only.
 *
 * Shared by MovementForm (stock-in/out/adjust) and TransferForm (Phase 19) —
 * both need "what is on hand here right now" before the user commits.
 *
 * The Effect owns the network request and nothing else. `loading` and `loaded`
 * are *derived* from the request identity rather than stored and reset, because
 * a stored flag can only be cleared by an Effect run — which happens after the
 * render that carried the new parameters. That render would still see the old
 * flags, i.e. `loaded: true` beside the *previous* product's row, and a
 * consumer reads exactly that combination as "ready". Comparing the answer's
 * key against the current key makes that render impossible: an answer is only
 * ever exposed for the parameters it was fetched for.
 */
export default function useInventoryRow(
  token: string | null,
  productId: string | null | undefined,
  locationId: string | null | undefined
): { row: InventoryRowSummary | null; loading: boolean; loaded: boolean } {
  const [entry, setEntry] = useState<RowEntry | null>(null);

  // The identity of the request these parameters describe, or null when there
  // is nothing to ask for yet. Stock In passes null identifiers on purpose — it
  // creates a row rather than reading one — so a null key must stay inert.
  const key = token && productId && locationId ? `${token}|${productId}|${locationId}` : null;

  useEffect(() => {
    // `key === null` cannot happen once the three identifiers are present, but
    // the key is derived from them and TypeScript does not track that
    // relationship — so it is stated as well, to narrow `key` itself for the
    // `setEntry` calls below.
    if (key === null || !token || !productId || !locationId) return undefined;
    let active = true;
    inventoryApi
      .list(token, { productId, page: 1, limit: 100 })
      .then((res) => {
        if (!active) return;
        const items: InventoryRowSummary[] = res?.items ?? [];
        const match = items.find((r) => r.location?.id === locationId);
        setEntry({ key, row: match ?? null });
      })
      .catch(() => {
        // A failure settles to "no row", exactly like a genuinely absent one.
        // This hook has no error channel by design: the server enforces the real
        // guard atomically, so the form only needs to know whether it can offer
        // the action. Callers must not read a missing row as an error.
        if (active) setEntry({ key, row: null });
      });
    return () => {
      // Supersedes this request: its answer can no longer land, so a slow
      // earlier response cannot overwrite a newer one.
      active = false;
    };
  }, [key, token, productId, locationId]);

  // An entry is only current if it answers the parameters in hand. Anything else
  // (never fetched, still in flight, or fetched for a previous selection) is not
  // a row the caller may show.
  const settled = key && entry?.key === key ? entry : null;

  return {
    row: settled ? settled.row : null,
    loading: Boolean(key) && !settled,
    loaded: Boolean(settled),
  };
}
