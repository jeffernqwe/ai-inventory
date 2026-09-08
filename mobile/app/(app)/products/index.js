import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { StatusBadge } from '../../../components/Badge';
import Button from '../../../components/Button';
import Chip from '../../../components/Chip';
import Input from '../../../components/Input';
import { EmptyState, ErrorState, LoadingBlock, errorText } from '../../../components/ListState';
import SelectField from '../../../components/SelectField';
import { categoriesApi, locationsApi, productsApi } from '../../../lib/api';
import { useSession } from '../../../lib/auth';
import useDebounced from '../../../hooks/useDebounced';
import { useActiveRef } from '../../../hooks/useReferences';
import usePagedList from '../../../hooks/usePagedList';
import useRefetchOnFocus from '../../../hooks/useRefetchOnFocus';
import { canManageProducts } from '../../../lib/permissions';
import { colors, radius, spacing, type } from '../../../lib/theme';

export default function ProductsScreen() {
  const { token, user, signOut } = useSession();
  const manage = canManageProducts(user);
  const categories = useActiveRef(token, categoriesApi);
  const locations = useActiveRef(token, locationsApi);

  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const [status, setStatus] = useState('ALL');
  const [categoryId, setCategoryId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [low, setLow] = useState(false);
  const [out, setOut] = useState(false);

  const queryParams = useCallback(() => {
    const p = {
      page: undefined,
      q: debouncedQ || undefined,
      status: status === 'ALL' ? undefined : status,
      categoryId: categoryId || undefined,
      locationId: locationId || undefined,
    };
    if (low) p.lowStock = true;
    if (out) p.outOfStock = true;
    return p;
  }, [debouncedQ, status, categoryId, locationId, low, out]);

  const fetcher = useCallback(
    (page, limit) => productsApi.list(token, { ...queryParams(), page, limit }),
    [token, queryParams]
  );

  const list = usePagedList(fetcher, { params: queryParams(), onSessionError: signOut });
  // Reload when returning from /products/new or a product detail/edit screen.
  useRefetchOnFocus(list.reload);

  const catOptions = [{ value: '', label: 'All categories' }, ...categories.items.map((c) => ({ value: c.id, label: c.name }))];
  const locOptions = [{ value: '', label: 'All locations' }, ...locations.items.map((l) => ({ value: l.id, label: l.name }))];

  const header = (
    <View>
      <Input value={q} onChangeText={setQ} placeholder="Search by name, SKU or barcode…" name="q" autoCapitalize="none" />
      <View style={styles.filterRow}>
        <Chip label="All" selected={status === 'ALL'} onPress={() => setStatus('ALL')} />
        <Chip label="Active" selected={status === 'ACTIVE'} onPress={() => setStatus('ACTIVE')} />
        <Chip label="Archived" selected={status === 'ARCHIVED'} onPress={() => setStatus('ARCHIVED')} />
        <View style={styles.spacer} />
        {manage ? (
          <Pressable style={styles.addBtn} onPress={() => router.push('/products/new')} accessibilityRole="button">
            <Text style={styles.addBtnText}>＋ New</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.chipRow}>
        <Chip label="Low stock" tone="warning" selected={low} onPress={() => setLow((v) => !v)} />
        <Chip label="Out of stock" tone="danger" selected={out} onPress={() => setOut((v) => !v)} />
      </View>
      <SelectField label="Category" placeholder="Filter by category…" options={catOptions} value={categoryId} onChange={setCategoryId} />
      <SelectField label="Location" placeholder="Filter by location…" options={locOptions} value={locationId} onChange={setLocationId} />
    </View>
  );

  const renderItem = ({ item }) => (
    <Pressable style={styles.row} onPress={() => router.push(`/products/${item.id}`)}>
      <View style={styles.rowTop}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.name}
        </Text>
        <StatusBadge status={item.status} />
      </View>
      <View style={styles.metaRow}>
        {item.sku ? <Text style={styles.meta}>SKU {item.sku}</Text> : null}
        {item.category?.name ? <Text style={styles.meta}>{item.category.name}</Text> : null}
        {item.barcode ? <Text style={styles.meta}>Barcode {item.barcode}</Text> : null}
      </View>
    </Pressable>
  );

  return (
    <View style={styles.flex}>
      {list.loading && list.items.length === 0 ? (
        <FlatList data={[]} renderItem={null} ListHeaderComponent={header} ListEmptyComponent={<LoadingBlock label="Loading products…" />} contentContainerStyle={styles.content} />
      ) : list.error && list.items.length === 0 ? (
        <FlatList data={[]} renderItem={null} ListHeaderComponent={header} ListEmptyComponent={<ErrorState title="Couldn't load products" message={errorText(list.error)} onRetry={list.reload} />} contentContainerStyle={styles.content} />
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              title="No products found"
              message={q ? `Nothing matches “${q}”.` : 'Add your first product to start tracking stock.'}
              action={manage && !q ? <Button title="Add product" onPress={() => router.push('/products/new')} /> : null}
            />
          }
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
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chipRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  spacer: { flex: 1 },
  addBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  addBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowName: { ...type.body, fontWeight: '700', color: colors.text, flexShrink: 1 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: 6 },
  meta: { ...type.caption, color: colors.textMuted },
  separator: { height: spacing.md },
});
