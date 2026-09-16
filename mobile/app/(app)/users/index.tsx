import { useCallback, useState } from 'react';
import { router, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import AccessDenied from '../../../components/AccessDenied';
import Badge from '../../../components/Badge';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import Chip from '../../../components/Chip';
import { Icon } from '../../../components/icons';
import ListRow from '../../../components/ListRow';
import ListScreen from '../../../components/ListScreen';
import SearchField from '../../../components/SearchField';
import { usersApi } from '../../../lib/api';
import type { ApiResponse } from '../../../lib/api';
import { useSession } from '../../../lib/auth';
import type { AuthUser } from '../../../lib/auth';
import { ROLES, canManageUsers, canModifyUser, roleLabel } from '../../../lib/permissions';
import { spacing } from '../../../lib/theme';
import { useTheme } from '../../../lib/theme-context';
import useDebounced from '../../../hooks/useDebounced';
import usePagedList from '../../../hooks/usePagedList';
import useRefetchOnFocus from '../../../hooks/useRefetchOnFocus';

const STATUS_ACTIVE = 'ACTIVE';
const STATUS_DISABLED = 'DISABLED';

function UserRow({ item, actor }: { item: ApiResponse; actor: AuthUser | null }) {
  const { colors } = useTheme();
  const isSelf = String(actor?.id) === String(item.id);
  const editable = canModifyUser(actor, item);
  const active = item.status === STATUS_ACTIVE;
  return (
    <Card>
      <ListRow
        leading={<Icon name="person" color={colors.primary} size={22} />}
        title={item.name}
        subtitle={item.email}
        right={<Badge text={active ? 'Active' : 'Disabled'} tone={active ? 'success' : 'neutral'} />}
      />
      <View style={styles.badges}>
        {isSelf ? <Badge text="You" tone="neutral" /> : null}
        <Badge text={roleLabel(item.role)} tone={item.role === ROLES.OWNER ? 'info' : 'neutral'} />
      </View>
      {editable ? (
        <View style={styles.rowActions}>
          <Button
            title="Edit"
            variant="secondary"
            style={styles.editBtn}
            onPress={() => router.push({ pathname: '/users/[id]', params: { id: item.id } })}
          />
        </View>
      ) : null}
    </Card>
  );
}

export default function UsersScreen() {
  const { user, token, signOut } = useSession();
  const manage = canManageUsers(user);

  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const [status, setStatus] = useState('');

  const filters = useCallback(
    () => ({ status: status || undefined, q: debouncedQ || undefined }),
    [status, debouncedQ]
  );

  const fetcher = useCallback(
    (page: number, limit: number) => usersApi.list(token as string, { ...filters(), page, limit }),
    [token, filters]
  );

  const list = usePagedList(fetcher, { params: filters(), onSessionError: signOut });
  // Reload when returning from create/edit so role/status changes are current.
  useRefetchOnFocus(list.reload);

  const header = (
    <View>
      <SearchField value={q} onChangeText={setQ} placeholder="Search by name or email…" style={styles.search} />
      <View style={styles.filterRow}>
        <Chip label="All" selected={status === ''} onPress={() => setStatus('')} />
        <Chip label="Active" selected={status === STATUS_ACTIVE} onPress={() => setStatus(STATUS_ACTIVE)} />
        <Chip label="Disabled" selected={status === STATUS_DISABLED} onPress={() => setStatus(STATUS_DISABLED)} />
      </View>
      {manage ? (
        <Button title="New User" icon="add" onPress={() => router.push('/users/new')} full style={styles.newBtn} />
      ) : null}
    </View>
  );

  function emptyMessage(): string {
    if (debouncedQ) return `No users match “${debouncedQ}”.`;
    if (status === STATUS_ACTIVE) return 'No active users right now.';
    if (status === STATUS_DISABLED) return 'No disabled users right now.';
    return 'No users yet. Admins and staff will appear here.';
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Users' }} />
      {!manage ? (
        <AccessDenied message="Only the business owner and admins can manage users." />
      ) : (
        <ListScreen
          items={list.items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <UserRow item={item} actor={user} />}
          header={header}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          errorTitle="Couldn't load users"
          refreshing={list.refreshing}
          onRefresh={list.refresh}
          onEndReached={list.loadMore}
          loadingMore={list.loadingMore}
          loadingLabel="Loading users…"
          emptyTitle="Nothing to show"
          emptyMessage={emptyMessage()}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  search: { marginBottom: spacing.md },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  newBtn: { marginBottom: spacing.md },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  rowActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  editBtn: { flex: 1 },
});
