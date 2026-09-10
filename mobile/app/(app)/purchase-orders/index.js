import { useCallback, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { PoStatusBadge } from '../../../components/Badge';
import Input from '../../../components/Input';
import { EmptyState, ErrorState, LoadingBlock, errorText } from '../../../components/ListState';
import SelectField from '../../../components/SelectField';
import AccessDenied from '../../../components/AccessDenied';
import { purchaseOrdersApi } from '../../../lib/api';
import { useSession } from '../../../lib/auth';
import { formatDate, formatNumber } from '../../../lib/format';
import useDebounced from '../../../hooks/useDebounced';
import usePagedList from '../../../hooks/usePagedList';
import useRefetchOnFocus from '../../../hooks/useRefetchOnFocus';
import { canViewPurchaseOrders } from '../../../lib/permissions';
import { radius, spacing, type } from '../../../lib/theme';
import { useTheme } from '../../../lib/theme-context';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'OPEN', label: 'Open' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'CANCELED', label: 'Canceled' },
];

function PoRow({ item }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const t = item.totals ?? {};
  const received = t.quantityReceived ?? 0;
  const ordered = t.quantityOrdered ?? 0;
  const supplier = item.supplier?.name;
  const location = item.location?.name;
  const meta = [supplier, location].filter(Boolean).join(' · ') || 'No supplier / location';

  return (
    <Pressable style={styles.row} onPress={() => router.push(`/purchase-orders/${item.id}`)} accessibilityRole="button">
      <View style={styles.rowTop}>
        <Text style={styles.rowNumber} numberOfLines={1}>
          {item.number}
        </Text>
        <PoStatusBadge status={item.status} />
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
        {item.expectedAt ? <Text style={styles.meta}>Expected {formatDate(item.expectedAt)}</Text> : null}
      </View>
      <Text style={styles.progress}>
        {formatNumber(received)} of {formatNumber(ordered)} received
        {item.status === 'RECEIVED' ? ' · complete' : item.status === 'CANCELED' ? ' · canceled' : ''}
      </Text>
    </Pressable>
  );
}

export default function PurchaseOrdersScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { token, user, signOut } = useSession();

  if (!canViewPurchaseOrders(user)) {
    return <AccessDenied message="Your role does not allow viewing purchase orders." />;
  }

  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const [status, setStatus] = useState('');

  const filters = useCallback(
    () => ({ status: status || undefined, q: debouncedQ || undefined }),
    [status, debouncedQ]
  );

  const fetcher = useCallback(
    (page, limit) => purchaseOrdersApi.list(token, { ...filters(), page, limit }),
    [token, filters]
  );

  const list = usePagedList(fetcher, { params: filters(), onSessionError: signOut });
  // Reload when returning from a detail / receive screen so progress is current.
  useRefetchOnFocus(list.reload);

  const header = (
    <View>
      <Input value={q} onChangeText={setQ} placeholder="Search by order number (e.g. PO-0001)…" name="q" autoCapitalize="characters" />
      <SelectField label="Status" placeholder="All statuses…" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
    </View>
  );

  function emptyMessage() {
    if (q) return `No purchase orders match “${q}”.`;
    if (status) return 'No purchase orders in this status right now.';
    return 'No purchase orders yet. Orders created by a manager will appear here.';
  }

  const renderItem = ({ item }) => <PoRow item={item} />;

  return (
    <View style={styles.flex}>
      {list.loading && list.items.length === 0 ? (
        <FlatList data={[]} renderItem={null} ListHeaderComponent={header} ListEmptyComponent={<LoadingBlock label="Loading purchase orders…" />} contentContainerStyle={styles.content} />
      ) : list.error && list.items.length === 0 ? (
        <FlatList data={[]} renderItem={null} ListHeaderComponent={header} ListEmptyComponent={<ErrorState title="Couldn't load purchase orders" message={errorText(list.error)} onRetry={list.reload} />} contentContainerStyle={styles.content} />
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ListEmptyComponent={<EmptyState title="Nothing to show" message={emptyMessage()} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} colors={[colors.primary]} />}
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={list.loadingMore ? <LoadingBlock label="Loading more…" /> : null}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    content: { padding: spacing.lg, paddingBottom: spacing.huge, flexGrow: 1 },
    row: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    rowNumber: { ...type.body, fontWeight: '800', color: colors.text, flexShrink: 1, fontVariant: ['tabular-nums'] },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: 6 },
    meta: { ...type.caption, color: colors.textMuted },
    progress: { ...type.body, color: colors.textSecondary, marginTop: 8, fontVariant: ['tabular-nums'] },
    separator: { height: spacing.md },
  });
