import { useCallback, useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';

import AccessDenied from '../../../../components/AccessDenied';
import { CenterLoader, EmptyState, ErrorState, errorText } from '../../../../components/ListState';
import PoForm from '../../../../components/PoForm';
import Screen from '../../../../components/Screen';
import { purchaseOrdersApi } from '../../../../lib/api';
import type { ApiResponse } from '../../../../lib/api';
import { isSessionError, useSession } from '../../../../lib/auth';
import { canManagePurchaseOrders } from '../../../../lib/permissions';

/**
 * Edit a DRAFT purchase order. Fetches the order fresh (deep-link safe), then
 * hands the detail DTO to the shared PoForm in edit mode. Only DRAFT orders
 * are editable — the backend rejects everything else (PO_NOT_DRAFT), and this
 * screen surfaces that instead of rendering an editable form.
 */
export default function EditPurchaseOrderScreen() {
  const { user, token, signOut } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [po, setPo] = useState<ApiResponse>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!token || !id) return;
    setError(null);
    setLoading(true);
    try {
      const data = await purchaseOrdersApi.get(token, id);
      setPo(data);
    } catch (err) {
      setError(err);
      setPo(null);
      if (isSessionError(err)) await signOut();
    } finally {
      setLoading(false);
    }
  }, [token, id, signOut]);

  useEffect(() => {
    // `load` sets error/loading synchronously before its first await on purpose:
    // loading must be true at request start (first mount and retry), and it can't
    // be derived from `po`/`error` because a retry keeps the previous `po` visible.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <>
      <Stack.Screen options={{ title: po?.status === 'DRAFT' ? 'Edit Purchase Order' : 'Purchase Order' }} />
      {!canManagePurchaseOrders(user) ? (
        <AccessDenied message="Only managers and above can manage purchase orders." />
      ) : loading && !po ? (
        <CenterLoader label="Loading order…" />
      ) : error && !po ? (
        <ErrorState title="Couldn't load this order" message={errorText(error)} onRetry={load} />
      ) : po ? (
        po.status === 'DRAFT' ? (
          <PoForm initial={po} key={po.id} />
        ) : (
          <Screen scroll>
            <EmptyState
              title="This order can no longer be edited"
              message={`${po.number} is ${po.status === 'OPEN' ? 'open' : po.status.toLowerCase()}. Only draft orders can be changed — cancel and re-create it to start over.`}
            />
          </Screen>
        )
      ) : null}
    </>
  );
}
