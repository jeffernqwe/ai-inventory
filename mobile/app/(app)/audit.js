import { useCallback, useMemo, useState } from 'react';
import { Stack } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import AccessDenied from '../../components/AccessDenied';
import Badge from '../../components/Badge';
import Chip from '../../components/Chip';
import Input from '../../components/Input';
import { EmptyState, ErrorState, LoadingBlock, errorText } from '../../components/ListState';
import { auditApi } from '../../lib/api';
import { useSession } from '../../lib/auth';
import { canViewAudit } from '../../lib/permissions';
import { radius, spacing, type } from '../../lib/theme';
import { useTheme } from '../../lib/theme-context';
import { formatDateTime } from '../../lib/format';
import useDebounced from '../../hooks/useDebounced';
import usePagedList from '../../hooks/usePagedList';
import useRefetchOnFocus from '../../hooks/useRefetchOnFocus';

/** Human-readable labels for every AUDIT_ACTIONS value (server constants/audit.js). */
const ACTION_LABELS = {
  PRODUCT_CREATED: 'Product created',
  PRODUCT_UPDATED: 'Product updated',
  PRODUCT_ARCHIVED: 'Product archived',
  CATEGORY_CREATED: 'Category created',
  CATEGORY_UPDATED: 'Category updated',
  CATEGORY_ARCHIVED: 'Category archived',
  LOCATION_CREATED: 'Location created',
  LOCATION_UPDATED: 'Location updated',
  LOCATION_ARCHIVED: 'Location archived',
  SUPPLIER_CREATED: 'Supplier created',
  SUPPLIER_UPDATED: 'Supplier updated',
  SUPPLIER_ARCHIVED: 'Supplier archived',
  PURCHASE_ORDER_CREATED: 'PO created',
  PURCHASE_ORDER_UPDATED: 'PO updated',
  PURCHASE_ORDER_ISSUED: 'PO issued',
  PURCHASE_ORDER_CANCELED: 'PO canceled',
  PURCHASE_ORDER_RECEIVED: 'PO received',
  INVENTORY_STOCK_IN: 'Stock in',
  INVENTORY_STOCK_OUT: 'Stock out',
  INVENTORY_ADJUSTED: 'Inventory adjusted',
  USER_CREATED: 'User created',
  USER_UPDATED: 'User updated',
};

/** Human-readable labels for every AUDIT_ENTITY_TYPES value. */
const ENTITY_LABELS = {
  PRODUCT: 'Product',
  INVENTORY: 'Inventory',
  INVENTORY_TRANSACTION: 'Transaction',
  USER: 'User',
  PURCHASE_ORDER: 'Purchase order',
  SUPPLIER: 'Supplier',
  CATEGORY: 'Category',
  LOCATION: 'Location',
};

const ENTITY_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Products', value: 'PRODUCT' },
  { label: 'Inventory', value: 'INVENTORY' },
  { label: 'Users', value: 'USER' },
  { label: 'POs', value: 'PURCHASE_ORDER' },
  { label: 'Suppliers', value: 'SUPPLIER' },
  { label: 'Categories', value: 'CATEGORY' },
  { label: 'Locations', value: 'LOCATION' },
];

function AuditRow({ item }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const actionLabel = ACTION_LABELS[item.action] ?? item.action;
  const entityLabel = ENTITY_LABELS[item.entityType] ?? item.entityType;
  const actor = item.actor?.name ?? 'System';
  const metadata = item.metadata ? JSON.stringify(item.metadata) : null;
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <Badge text={actionLabel} tone="info" />
        <Badge text={entityLabel} tone="neutral" />
      </View>
      {item.entityId ? (
        <Text style={styles.entityId} numberOfLines={1}>
          {item.entityId}
        </Text>
      ) : null}
      <Text style={styles.meta} numberOfLines={1}>
        {actor} · {formatDateTime(item.createdAt)}
      </Text>
      {metadata ? (
        <Text style={styles.metadata} numberOfLines={1}>
          {metadata}
        </Text>
      ) : null}
    </View>
  );
}

export default function AuditScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, token, signOut } = useSession();
  const view = canViewAudit(user);

  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const [entityType, setEntityType] = useState('');

  const filters = useCallback(
    () => ({ entityType: entityType || undefined, q: debouncedQ || undefined }),
    [entityType, debouncedQ]
  );

  const fetcher = useCallback(
    (page, limit) => auditApi.list(token, { ...filters(), page, limit }),
    [token, filters]
  );

  const list = usePagedList(fetcher, { params: filters(), onSessionError: signOut });
  // Reload when returning from elsewhere so new actions are visible.
  useRefetchOnFocus(list.reload);

  const header = (
    <View>
      <Input value={q} onChangeText={setQ} placeholder="Search actions or ids…" name="q" />
      <View style={styles.filterRow}>
        {ENTITY_FILTERS.map((f) => (
          <Chip
            key={f.value || 'all'}
            label={f.label}
            selected={entityType === f.value}
            onPress={() => setEntityType(f.value)}
          />
        ))}
      </View>
    </View>
  );

  function emptyMessage() {
    if (debouncedQ) return `No audit rows match “${debouncedQ}”.`;
    if (entityType) {
      const label = (ENTITY_LABELS[entityType] ?? 'matching').toLowerCase();
      return `No ${label} activity yet.`;
    }
    return 'No audit activity yet. Actions will appear here.';
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Audit Log' }} />
      <View style={styles.flex}>
        {!view ? (
          <AccessDenied message="Only the business owner and admins can view the audit log." />
        ) : list.loading && list.items.length === 0 ? (
          <FlatList
            data={[]}
            renderItem={null}
            ListHeaderComponent={header}
            ListEmptyComponent={<LoadingBlock label="Loading audit log…" />}
            contentContainerStyle={styles.content}
          />
        ) : list.error && list.items.length === 0 ? (
          <FlatList
            data={[]}
            renderItem={null}
            ListHeaderComponent={header}
            ListEmptyComponent={
              <ErrorState title="Couldn't load the audit log" message={errorText(list.error)} onRetry={list.reload} />
            }
            contentContainerStyle={styles.content}
          />
        ) : (
          <FlatList
            data={list.items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <AuditRow item={item} />}
            ListHeaderComponent={header}
            ListEmptyComponent={<EmptyState title="Nothing to show" message={emptyMessage()} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={list.refreshing}
                onRefresh={list.refresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            onEndReached={list.loadMore}
            onEndReachedThreshold={0.4}
            ListFooterComponent={list.loadingMore ? <LoadingBlock label="Loading more…" /> : null}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </>
  );
}

const createStyles = (colors) => StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.huge, flexGrow: 1 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  rowTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  entityId: { ...type.caption, color: colors.textSecondary, marginTop: 6, fontVariant: ['tabular-nums'] },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  metadata: { ...type.caption, color: colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  separator: { height: spacing.md },
});
