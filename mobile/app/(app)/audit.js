import { useCallback, useMemo, useState } from 'react';
import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import AccessDenied from '../../components/AccessDenied';
import Badge from '../../components/Badge';
import Card from '../../components/Card';
import Chip from '../../components/Chip';
import { Icon } from '../../components/icons';
import ListRow from '../../components/ListRow';
import ListScreen from '../../components/ListScreen';
import { SearchField } from '../../components/SearchField';
import { auditApi } from '../../lib/api';
import { useSession } from '../../lib/auth';
import { canViewAudit } from '../../lib/permissions';
import { spacing, type } from '../../lib/theme';
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
    <Card>
      <ListRow
        leading={<Icon name="document" color={colors.primary} size={22} />}
        title={actionLabel}
        subtitle={`${actor} · ${formatDateTime(item.createdAt)}`}
        right={<Badge text={entityLabel} tone="neutral" />}
        footer={
          item.entityId || metadata ? (
            <View>
              {item.entityId ? (
                <Text style={styles.entityId} numberOfLines={1}>
                  {item.entityId}
                </Text>
              ) : null}
              {metadata ? (
                <Text style={styles.metadata} numberOfLines={2}>
                  {metadata}
                </Text>
              ) : null}
            </View>
          ) : null
        }
      />
    </Card>
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
      <SearchField value={q} onChangeText={setQ} placeholder="Search actions or ids…" style={styles.search} />
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
      {!view ? (
        <AccessDenied message="Only the business owner and admins can view the audit log." />
      ) : (
        <ListScreen
          items={list.items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AuditRow item={item} />}
          header={header}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          errorTitle="Couldn't load the audit log"
          refreshing={list.refreshing}
          onRefresh={list.refresh}
          onEndReached={list.loadMore}
          loadingMore={list.loadingMore}
          loadingLabel="Loading audit log…"
          emptyTitle="Nothing to show"
          emptyMessage={emptyMessage()}
        />
      )}
    </>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    search: { marginBottom: spacing.md },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
    entityId: { ...type.caption, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
    metadata: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs, fontStyle: 'italic' },
  });
