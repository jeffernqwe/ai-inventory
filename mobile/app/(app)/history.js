import { useCallback, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { TypeBadge } from '../../components/Badge';
import Chip from '../../components/Chip';
import SelectField from '../../components/SelectField';
import { EmptyState, ErrorState, LoadingBlock, errorText } from '../../components/ListState';
import { inventoryApi, locationsApi, productsApi } from '../../lib/api';
import { useSession } from '../../lib/auth';
import { formatDateTime, formatNumber } from '../../lib/format';
import { useActiveRef } from '../../hooks/useReferences';
import usePagedList from '../../hooks/usePagedList';
import { radius, spacing, type } from '../../lib/theme';
import { useTheme } from '../../lib/theme-context';

function str(v) {
  return Array.isArray(v) ? v[0] : v;
}

const TYPE_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'STOCK_IN', label: 'Stock in' },
  { value: 'STOCK_OUT', label: 'Stock out' },
  { value: 'ADJUSTMENT', label: 'Adjust' },
];

function deltaText(item) {
  if (item.type === 'STOCK_IN') return `+${formatNumber(item.quantity)}`;
  if (item.type === 'STOCK_OUT') return `−${formatNumber(item.quantity)}`;
  const d = (item.newQuantity ?? 0) - (item.previousQuantity ?? 0);
  return d >= 0 ? `+${d}` : `−${Math.abs(d)}`;
}
function deltaTone(colors, item) {
  if (item.type === 'STOCK_IN') return colors.success;
  if (item.type === 'STOCK_OUT') return colors.danger;
  return colors.textSecondary;
}

function HistoryRow({ item }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <TypeBadge type={item.type} />
        <Text style={[styles.delta, { color: deltaTone(colors, item) }]}>{deltaText(item)}</Text>
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {item.product?.name ?? 'Unknown product'}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {item.location?.name ?? 'No location'} · {formatNumber(item.previousQuantity)} → {formatNumber(item.newQuantity)}
      </Text>
      <Text style={styles.time}>{formatDateTime(item.createdAt)}</Text>
      {item.reason ? (
        <Text style={styles.reason} numberOfLines={2}>
          Reason: {item.reason}
        </Text>
      ) : null}
      {item.reference ? (
        <Text style={styles.reason} numberOfLines={1}>
          Ref: {item.reference}
        </Text>
      ) : null}
    </View>
  );
}

export default function HistoryScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { token, signOut } = useSession();
  const p = useLocalSearchParams();
  const paramProductId = str(p.productId);
  const paramProductName = str(p.productName);
  const paramLocationId = str(p.locationId);
  const paramLocationName = str(p.locationName);

  const products = useActiveRef(token, productsApi);
  const locations = useActiveRef(token, locationsApi);

  const [type, setType] = useState('ALL');
  const [productId, setProductId] = useState(paramProductId ?? '');
  const [locationId, setLocationId] = useState(paramLocationId ?? '');

  const productOptions = useMemo(() => {
    const list = products.items.map((x) => ({ value: x.id, label: x.name }));
    if (paramProductId && paramProductName && !list.some((o) => o.value === paramProductId)) {
      list.unshift({ value: paramProductId, label: paramProductName });
    }
    return list;
  }, [products.items, paramProductId, paramProductName]);

  const locationOptions = useMemo(() => {
    const list = locations.items.map((l) => ({ value: l.id, label: l.name }));
    if (paramLocationId && paramLocationName && !list.some((o) => o.value === paramLocationId)) {
      list.unshift({ value: paramLocationId, label: paramLocationName });
    }
    return list;
  }, [locations.items, paramLocationId, paramLocationName]);

  const queryParams = useCallback(() => {
    const q = { page: undefined };
    if (type !== 'ALL') q.type = type;
    if (productId) q.productId = productId;
    if (locationId) q.locationId = locationId;
    return q;
  }, [type, productId, locationId]);

  const fetcher = useCallback(
    (page, limit) => inventoryApi.history(token, { ...queryParams(), page, limit }),
    [token, queryParams]
  );

  const list = usePagedList(fetcher, { params: queryParams(), onSessionError: signOut });

  const header = (
    <View>
      <View style={styles.chipRow}>
        {TYPE_FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} selected={type === f.value} onPress={() => setType(f.value)} />
        ))}
      </View>
      <SelectField label="Product" placeholder="All products…" options={productOptions} value={productId} onChange={setProductId} searchable />
      <SelectField label="Location" placeholder="All locations…" options={locationOptions} value={locationId} onChange={setLocationId} searchable />
      {list.total > 0 ? <Text style={styles.count}>{formatNumber(list.total)} movement{list.total === 1 ? '' : 's'}, newest first</Text> : null}
    </View>
  );

  return (
    <View style={styles.flex}>
      {list.loading && list.items.length === 0 ? (
        <FlatList data={[]} renderItem={null} ListHeaderComponent={header} ListEmptyComponent={<LoadingBlock label="Loading history…" />} contentContainerStyle={styles.content} />
      ) : list.error && list.items.length === 0 ? (
        <FlatList data={[]} renderItem={null} ListHeaderComponent={header} ListEmptyComponent={<ErrorState title="Couldn't load history" message={errorText(list.error)} onRetry={list.reload} />} contentContainerStyle={styles.content} />
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <HistoryRow item={item} />}
          ListHeaderComponent={header}
          ListEmptyComponent={<EmptyState title="No movements yet" message="Stock in, stock out and adjustments will be listed here." />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} colors={[colors.primary]} />}
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={list.loadingMore ? <LoadingBlock label="Loading more…" /> : null}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.huge, flexGrow: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  count: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  delta: { ...type.button, fontSize: 16 },
  name: { ...type.body, color: colors.text, fontWeight: '600', marginTop: spacing.sm },
  meta: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  time: { ...type.caption, color: colors.textMuted, marginTop: 4 },
  reason: { ...type.caption, color: colors.textMuted, marginTop: 6, lineHeight: 16 },
  separator: { height: spacing.md },
});
