import { useCallback, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { ListRenderItem } from 'react-native';

import AccessDenied from '../../../components/AccessDenied';
import { PoStatusBadge } from '../../../components/Badge';
import { PressableCard } from '../../../components/Card';
import { Icon } from '../../../components/icons';
import ListRow from '../../../components/ListRow';
import ListScreen from '../../../components/ListScreen';
import SearchField from '../../../components/SearchField';
import SelectField from '../../../components/SelectField';
import { purchaseOrdersApi } from '../../../lib/api';
import type { ApiResponse } from '../../../lib/api';
import { useSession } from '../../../lib/auth';
import { formatDate, formatNumber } from '../../../lib/format';
import useDebounced from '../../../hooks/useDebounced';
import usePagedList from '../../../hooks/usePagedList';
import useRefetchOnFocus from '../../../hooks/useRefetchOnFocus';
import { canViewPurchaseOrders } from '../../../lib/permissions';
import { spacing, type } from '../../../lib/theme';
import type { Palette } from '../../../lib/theme';
import { useTheme } from '../../../lib/theme-context';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'OPEN', label: 'Open' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'CANCELED', label: 'Canceled' },
];

/**
 * Role guard (MOD-07). The permission check lives here and nowhere else, so the
 * screen below mounts only for a role that may view purchase orders. Hoisting
 * its hooks above this return instead would run them on a denied render, and
 * both `usePagedList` (first-load effect) and `useRefetchOnFocus` (focus effect)
 * fetch — which would query the purchase-order list for a role that may not
 * read it.
 */
export default function PurchaseOrdersScreen() {
  const { user } = useSession();

  if (!canViewPurchaseOrders(user)) {
    return <AccessDenied message="Your role does not allow viewing purchase orders." />;
  }

  return <PurchaseOrdersList />;
}

function PurchaseOrdersList() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { token, signOut } = useSession();

  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const [status, setStatus] = useState('');

  const filters = useCallback(
    () => ({ status: status || undefined, q: debouncedQ || undefined }),
    [status, debouncedQ]
  );

  const fetcher = useCallback(
    (page: number, limit: number) => purchaseOrdersApi.list(token as string, { ...filters(), page, limit }),
    [token, filters]
  );

  const list = usePagedList(fetcher, { params: filters(), onSessionError: signOut });
  // Reload when returning from a detail / receive screen so progress is current.
  useRefetchOnFocus(list.reload);

  const header = (
    <View>
      <SearchField
        value={q}
        onChangeText={setQ}
        placeholder="Search by order number (e.g. PO-0001)…"
        autoCapitalize="characters"
        style={styles.search}
      />
      <SelectField label="Status" placeholder="All statuses…" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
    </View>
  );

  function emptyMessage(): string {
    if (q) return `No purchase orders match “${q}”.`;
    if (status) return 'No purchase orders in this status right now.';
    return 'No purchase orders yet. Orders created by a manager will appear here.';
  }

  const renderItem: ListRenderItem<ApiResponse> = ({ item }) => {
    const t = item.totals ?? {};
    const received = t.quantityReceived ?? 0;
    const ordered = t.quantityOrdered ?? 0;
    const supplier = item.supplier?.name;
    const location = item.location?.name;
    const meta =
      [supplier, location].filter(Boolean).join(' · ') || 'No supplier / location';

    return (
      <PressableCard onPress={() => router.push(`/purchase-orders/${item.id}`)} accessibilityRole="button">
        <ListRow
          leading={<Icon name="receipt" color={colors.primary} size={22} />}
          title={item.number}
          titleStyle={styles.number}
          subtitle={[meta, item.expectedAt ? `Expected ${formatDate(item.expectedAt)}` : null].filter(Boolean).join(' · ')}
          footer={
            // Ordered/received quantities stay at body size (never the smaller subtitle size).
            <Text style={styles.progress}>
              {formatNumber(received)} of {formatNumber(ordered)} received
              {item.status === 'RECEIVED' ? ' · complete' : item.status === 'CANCELED' ? ' · canceled' : ''}
            </Text>
          }
          right={<PoStatusBadge status={item.status} />}
        />
      </PressableCard>
    );
  };

  return (
    <ListScreen
      items={list.items}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      header={header}
      loading={list.loading}
      error={list.error}
      onRetry={list.reload}
      refreshing={list.refreshing}
      onRefresh={list.refresh}
      onEndReached={list.loadMore}
      loadingMore={list.loadingMore}
      loadingLabel="Loading purchase orders…"
      emptyTitle="Nothing to show"
      emptyMessage={emptyMessage()}
    />
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    search: { marginBottom: spacing.lg },
    // PO number keeps its existing emphasis (bold, tabular figures).
    number: { fontWeight: '800', fontVariant: ['tabular-nums'] },
    progress: { ...type.body, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  });
