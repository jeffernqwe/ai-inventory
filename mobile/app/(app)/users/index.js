import { useCallback, useMemo, useState } from 'react';
import { router, Stack } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import AccessDenied from '../../../components/AccessDenied';
import Badge from '../../../components/Badge';
import Button from '../../../components/Button';
import Chip from '../../../components/Chip';
import Input from '../../../components/Input';
import { EmptyState, ErrorState, LoadingBlock, errorText } from '../../../components/ListState';
import { usersApi } from '../../../lib/api';
import { useSession } from '../../../lib/auth';
import { ROLES, canManageUsers, canModifyUser, roleLabel } from '../../../lib/permissions';
import { radius, spacing, type } from '../../../lib/theme';
import { useTheme } from '../../../lib/theme-context';
import useDebounced from '../../../hooks/useDebounced';
import usePagedList from '../../../hooks/usePagedList';
import useRefetchOnFocus from '../../../hooks/useRefetchOnFocus';

const STATUS_ACTIVE = 'ACTIVE';
const STATUS_DISABLED = 'DISABLED';

function UserRow({ item, actor }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isSelf = String(actor?.id) === String(item.id);
  const editable = canModifyUser(actor, item);
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.name}
        </Text>
        {isSelf ? <Badge text="You" tone="neutral" /> : null}
        <Badge text={roleLabel(item.role)} tone={item.role === ROLES.OWNER ? 'info' : 'neutral'} />
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta} numberOfLines={1}>
          {item.email}
        </Text>
        <Badge text={item.status === STATUS_ACTIVE ? 'Active' : 'Disabled'} tone={item.status === STATUS_ACTIVE ? 'success' : 'neutral'} />
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
    </View>
  );
}

export default function UsersScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
    (page, limit) => usersApi.list(token, { ...filters(), page, limit }),
    [token, filters]
  );

  const list = usePagedList(fetcher, { params: filters(), onSessionError: signOut });
  // Reload when returning from create/edit so role/status changes are current.
  useRefetchOnFocus(list.reload);

  const header = (
    <View>
      <Input value={q} onChangeText={setQ} placeholder="Search by name or email…" name="q" />
      <View style={styles.filterRow}>
        <Chip label="All" selected={status === ''} onPress={() => setStatus('')} />
        <Chip label="Active" selected={status === STATUS_ACTIVE} onPress={() => setStatus(STATUS_ACTIVE)} />
        <Chip label="Disabled" selected={status === STATUS_DISABLED} onPress={() => setStatus(STATUS_DISABLED)} />
        <View style={styles.filterSpacer} />
        {manage ? (
          <Pressable style={styles.addBtn} onPress={() => router.push('/users/new')} accessibilityRole="button">
            <Text style={styles.addBtnText}>＋ New User</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  function emptyMessage() {
    if (debouncedQ) return `No users match “${debouncedQ}”.`;
    if (status === STATUS_ACTIVE) return 'No active users right now.';
    if (status === STATUS_DISABLED) return 'No disabled users right now.';
    return 'No users yet. Admins and staff will appear here.';
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Users' }} />
      <View style={styles.flex}>
        {!manage ? (
          <AccessDenied message="Only the business owner and admins can manage users." />
        ) : list.loading && list.items.length === 0 ? (
          <FlatList data={[]} renderItem={null} ListHeaderComponent={header} ListEmptyComponent={<LoadingBlock label="Loading users…" />} contentContainerStyle={styles.content} />
        ) : list.error && list.items.length === 0 ? (
          <FlatList data={[]} renderItem={null} ListHeaderComponent={header} ListEmptyComponent={<ErrorState title="Couldn't load users" message={errorText(list.error)} onRetry={list.reload} />} contentContainerStyle={styles.content} />
        ) : (
          <FlatList
            data={list.items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <UserRow item={item} actor={user} />}
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
    </>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    content: { padding: spacing.lg, paddingBottom: spacing.huge, flexGrow: 1 },
    filterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
    filterSpacer: { flex: 1 },
    addBtn: {
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
    },
    addBtnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 13 },
    row: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    rowName: { ...type.body, fontWeight: '700', color: colors.text, flexShrink: 1 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, marginTop: 6 },
    meta: { ...type.caption, color: colors.textMuted, flexShrink: 1 },
    rowActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    editBtn: { flex: 1, minHeight: 38 },
    separator: { height: spacing.md },
  });
