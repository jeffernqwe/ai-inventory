import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import Badge from '../../components/Badge';
import Chip from '../../components/Chip';
import Input from '../../components/Input';
import { EmptyState, ErrorState, LoadingBlock, errorText } from '../../components/ListState';
import SelectField from '../../components/SelectField';
import { inventoryApi, locationsApi } from '../../lib/api';
import { useSession } from '../../lib/auth';
import { formatNumber } from '../../lib/format';
import useDebounced from '../../hooks/useDebounced';
import { useActiveRef } from '../../hooks/useReferences';
import usePagedList from '../../hooks/usePagedList';
import useRefetchOnFocus from '../../hooks/useRefetchOnFocus';
import { colors, radius, spacing, type } from '../../lib/theme';

function str(v) {
  return Array.isArray(v) ? v[0] : v;
}

function StockRow({ item }) {
  const archived = item.product?.status === 'ARCHIVED';
  return (
    <Pressable style={styles.row} onPress={() => router.push(`/inventory/${item.id}`)} accessibilityRole="button">
      <View style={styles.rowTop}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.product?.name ?? 'Unknown product'}
        </Text>
        <View style={styles.badges}>
          {item.isLowStock ? <Badge text="Low" tone="low" /> : null}
          {item.isOutOfStock ? <Badge text="Out" tone="danger" /> : null}
        </View>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta} numberOfLines={1}>
          {item.location?.name ?? 'No location'}
        </Text>
        {archived ? <Text style={styles.meta}>Archived</Text> : null}
      </View>
      <Text style={styles.avail}>
        {formatNumber(item.availableQuantity)} available · {formatNumber(item.quantity)} on hand
      </Text>
    </Pressable>
  );
}

export default function InventoryScreen() {
  const { token, user, signOut } = useSession();
  const locations = useActiveRef(token, locationsApi);

  // Dashboard stat cards deep-link here with ?status=low|out. The backend's
  // inventory endpoint filters via lowStock/outOfStock flags, so the navigation
  // shorthand is mapped onto those flags here (UI concern only).
  const statusParam = str(useLocalSearchParams().status);
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const [locationId, setLocationId] = useState('');
  const [low, setLow] = useState(statusParam === 'low');
  const [out, setOut] = useState(statusParam === 'out');

  const queryParams = useCallback(() => {
    const p = { page: undefined, q: debouncedQ || undefined, locationId: locationId || undefined };
    if (low) p.lowStock = true;
    if (out) p.outOfStock = true;
    return p;
  }, [debouncedQ, locationId, low, out]);

  const fetcher = useCallback(
    (page, limit) => inventoryApi.list(token, { ...queryParams(), page, limit }),
    [token, queryParams]
  );

  const list = usePagedList(fetcher, { params: queryParams(), onSessionError: signOut });
  // Reload when returning from an inventory row detail / stock movement screen.
  useRefetchOnFocus(list.reload);

  const locOptions = [{ value: '', label: 'All locations' }, ...locations.items.map((l) => ({ value: l.id, label: l.name }))];

  const header = (
    <View>
      <Input value={q} onChangeText={setQ} placeholder="Search by product name, SKU or barcode…" name="q" autoCapitalize="none" />
      <View style={styles.chipRow}>
        <Chip label="Low stock" tone="warning" selected={low} onPress={() => setLow((v) => !v)} />
        <Chip label="Out of stock" tone="danger" selected={out} onPress={() => setOut((v) => !v)} />
      </View>
      <SelectField label="Location" placeholder="Filter by location…" options={locOptions} value={locationId} onChange={setLocationId} />
    </View>
  );

  function emptyMessage() {
    if (low && !out) return 'No low-stock rows match your filters right now.';
    if (out) return 'Nothing is out of stock right now.';
    if (q) return `Nothing matches “${q}”.`;
    return 'No stock records yet — stock in a product at a location to create one.';
  }

  const renderItem = ({ item }) => <StockRow item={item} />;

  return (
    <View style={styles.flex}>
      {list.loading && list.items.length === 0 ? (
        <FlatList data={[]} renderItem={null} ListHeaderComponent={header} ListEmptyComponent={<LoadingBlock label="Loading inventory…" />} contentContainerStyle={styles.content} />
      ) : list.error && list.items.length === 0 ? (
        <FlatList data={[]} renderItem={null} ListHeaderComponent={header} ListEmptyComponent={<ErrorState title="Couldn't load inventory" message={errorText(list.error)} onRetry={list.reload} />} contentContainerStyle={styles.content} />
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.huge, flexGrow: 1 },
  chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowName: { ...type.body, fontWeight: '700', color: colors.text, flexShrink: 1 },
  badges: { flexDirection: 'row', gap: 6 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: 6 },
  meta: { ...type.caption, color: colors.textMuted },
  avail: { ...type.body, color: colors.textSecondary, marginTop: 8, fontVariant: ['tabular-nums'] },
  separator: { height: spacing.md },
});
