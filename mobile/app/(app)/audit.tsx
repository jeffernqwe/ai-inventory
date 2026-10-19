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
import SearchField from '../../components/SearchField';
import { auditApi } from '../../lib/api';
import { ENTITY_LABELS, actionLabel, entityLabel } from '../../lib/auditLabels';
import type { ApiResponse } from '../../lib/api';
import { useSession } from '../../lib/auth';
import { canViewAudit } from '../../lib/permissions';
import { spacing, type } from '../../lib/theme';
import type { Palette } from '../../lib/theme';
import { useTheme } from '../../lib/theme-context';
import { formatDateTime } from '../../lib/format';
import useDebounced from '../../hooks/useDebounced';
import usePagedList from '../../hooks/usePagedList';
import useRefetchOnFocus from '../../hooks/useRefetchOnFocus';

const ENTITY_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Products', value: 'PRODUCT' },
  { label: 'Transactions', value: 'INVENTORY_TRANSACTION' },
  { label: 'Users', value: 'USER' },
  { label: 'POs', value: 'PURCHASE_ORDER' },
  { label: 'Suppliers', value: 'SUPPLIER' },
  { label: 'Categories', value: 'CATEGORY' },
  { label: 'Locations', value: 'LOCATION' },
  // Session lifecycle (sign-ins, sign-outs, revoked sessions) is a real part of
  // the trail and the one people ask about — "who has been signing in?".
  { label: 'Sessions', value: 'SESSION' },
];

function AuditRow({ item }: { item: ApiResponse }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const actionText = actionLabel(item.action);
  const entityText = entityLabel(item.entityType);
  const actor = item.actor?.name ?? 'System';
  const metadata = item.metadata ? JSON.stringify(item.metadata) : null;
  return (
    <Card>
      <ListRow
        leading={<Icon name="document" color={colors.primary} size={22} />}
        title={actionText}
        subtitle={`${actor} · ${formatDateTime(item.createdAt)}`}
        right={<Badge text={entityText} tone="neutral" />}
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

/**
 * Role guard (MOD-07, same shape as the AI hub). The permission check lives
 * here and nowhere else, so the list below mounts only for a role that may read
 * the trail. Declaring the hooks under this return instead would run them on a
 * denied render — `usePagedList` loads on mount and `useRefetchOnFocus`
 * subscribes — so a MANAGER or STAFF visit to a deep link would issue
 * `GET /api/audit` and be refused by the server for no reason. The server
 * remains the boundary either way; this stops the client asking at all.
 */
export default function AuditScreen() {
  const { user } = useSession();
  const view = canViewAudit(user);

  if (!view) {
    return (
      <>
        <Stack.Screen options={{ title: 'Audit Log' }} />
        <AccessDenied message="Only the business owner and admins can view the audit log." />
      </>
    );
  }

  return <AuditList />;
}

function AuditList() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { token, signOut } = useSession();

  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const [entityType, setEntityType] = useState('');

  const filters = useCallback(
    () => ({ entityType: entityType || undefined, q: debouncedQ || undefined }),
    [entityType, debouncedQ]
  );

  const fetcher = useCallback(
    (page: number, limit: number) => auditApi.list(token as string, { ...filters(), page, limit }),
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

  function emptyMessage(): string {
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
    </>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    search: { marginBottom: spacing.md },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
    entityId: { ...type.caption, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
    metadata: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs, fontStyle: 'italic' },
  });
