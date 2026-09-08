import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { StatusBadge } from './Badge';
import Banner from './Banner';
import Button from './Button';
import Chip from './Chip';
import Input from './Input';
import { EmptyState, ErrorState, LoadingBlock, errorText } from './ListState';
import { ApiError } from '../lib/client';
import { useSession } from '../lib/auth';
import { confirm } from '../lib/confirm';
import useDebounced from '../hooks/useDebounced';
import usePagedList from '../hooks/usePagedList';
import { colors, radius, spacing, type } from '../lib/theme';

function fieldMap(err) {
  const out = {};
  if (err instanceof ApiError && Array.isArray(err.fields)) {
    for (const f of err.fields) out[f.field] = f.message;
  }
  return out;
}

/**
 * Shared manage screen for business-scoped reference lists (Categories,
 * Locations): search, status filter, server-driven pagination, and — for
 * users with the manage permission — create/edit via a modal plus archive/
 * restore. The backend stays the authority; this UI only gates what's shown.
 */
export default function RefManage({ api, canManageFn, singular, label, placeholder, emptyTitle, emptyMessage }) {
  const { user, token, signOut } = useSession();
  const manage = canManageFn(user);

  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetcher = useCallback(
    (page, limit) =>
      api.list(token, {
        page,
        limit,
        q: debouncedQ || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      }),
    [api, token, debouncedQ, statusFilter]
  );

  const list = usePagedList(fetcher, {
    params: { q: debouncedQ, status: statusFilter },
    onSessionError: signOut,
  });

  // Create / edit modal state.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setName('');
    setDescription('');
    setFieldErrors({});
    setFormError(null);
    setFormOpen(true);
  }
  function openEdit(item) {
    setEditing(item);
    setName(item.name);
    setDescription(item.description ?? '');
    setFieldErrors({});
    setFormError(null);
    setFormOpen(true);
  }
  function closeForm() {
    if (!saving) setFormOpen(false);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    const payload = { name: name.trim(), description: description.trim() || undefined };
    try {
      if (editing) await api.update(token, editing.id, payload);
      else await api.create(token, payload);
      setFormOpen(false);
      list.reload();
    } catch (err) {
      const fields = fieldMap(err);
      if (Object.keys(fields).length) setFieldErrors(fields);
      else setFormError(err?.message || `Unable to save the ${singular.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(item) {
    if (item.status === 'ARCHIVED') {
      try {
        await api.restore(token, item.id);
        list.reload();
      } catch (err) {
        Alert.alert('Could not restore', errorText(err));
      }
      return;
    }
    const ok = await confirm(
      `Archive ${singular.toLowerCase()}?`,
      `"${item.name}" will be hidden from new records but kept for history. You can restore it later.`,
      { confirmText: 'Archive', destructive: true }
    );
    if (!ok) return;
    try {
      await api.archive(token, item.id);
      list.reload();
    } catch (err) {
      Alert.alert('Could not archive', errorText(err));
    }
  }

  const header = (
    <View>
      <Input
        value={q}
        onChangeText={setQ}
        placeholder={placeholder}
        name="q"
        autoCapitalize="none"
      />
      <View style={styles.filterRow}>
        <Chip label="All" selected={statusFilter === 'ALL'} onPress={() => setStatusFilter('ALL')} />
        <Chip label="Active" selected={statusFilter === 'ACTIVE'} onPress={() => setStatusFilter('ACTIVE')} />
        <Chip label="Archived" selected={statusFilter === 'ARCHIVED'} onPress={() => setStatusFilter('ARCHIVED')} />
        <View style={styles.filterSpacer} />
        {manage ? (
          <Pressable style={styles.addBtn} onPress={openCreate} accessibilityRole="button">
            <Text style={styles.addBtnText}>＋ New {singular}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.name}
        </Text>
        <StatusBadge status={item.status} />
      </View>
      {item.description ? (
        <Text style={styles.rowDesc} numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}
      {manage ? (
        <View style={styles.rowActions}>
          <Button title="Edit" variant="secondary" onPress={() => openEdit(item)} style={styles.smallBtn} />
          <Button
            title={item.status === 'ARCHIVED' ? 'Restore' : 'Archive'}
            variant={item.status === 'ARCHIVED' ? 'secondary' : 'danger'}
            onPress={() => toggleArchive(item)}
            style={styles.smallBtn}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.flex}>
      {list.loading && list.items.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={null}
          ListHeaderComponent={header}
          ListEmptyComponent={<LoadingBlock label="Loading…" />}
          contentContainerStyle={styles.content}
        />
      ) : list.error && list.items.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={null}
          ListHeaderComponent={header}
          ListEmptyComponent={<ErrorState title="Couldn't load items" message={errorText(list.error)} onRetry={list.reload} />}
          contentContainerStyle={styles.content}
        />
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              title={emptyTitle}
              message={debouncedQ ? `No ${label.toLowerCase()} match “${debouncedQ}”.` : emptyMessage}
              action={
                manage && !debouncedQ ? (
                  <Button title={`Add your first ${singular.toLowerCase()}`} onPress={openCreate} />
                ) : null
              }
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} colors={[colors.primary]} />
          }
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            list.loadingMore ? <LoadingBlock label="Loading more…" /> : list.items.length >= 20 ? <Text style={styles.count}>{list.total} total</Text> : null
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Create / edit */}
      <Modal visible={formOpen} animationType="slide" transparent onRequestClose={closeForm}>
        <View style={styles.backdrop}>
          <Pressable style={styles.backdropTouch} onPress={closeForm} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{editing ? `Edit ${singular.toLowerCase()}` : `New ${singular.toLowerCase()}`}</Text>
            <Banner type="error" text={formError} />
            <Input
              name="name"
              label="Name"
              value={name}
              onChangeText={setName}
              error={fieldErrors.name}
              required
              autoCapitalize="words"
            />
            <Input
              name="description"
              label="Description (optional)"
              value={description}
              onChangeText={setDescription}
              multiline
              error={fieldErrors.description}
            />
            <Button title={editing ? 'Save changes' : `Create ${singular.toLowerCase()}`} onPress={save} loading={saving} full />
            <Button title="Cancel" variant="secondary" onPress={closeForm} style={styles.cancelBtn} full />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
  addBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowTitle: { ...type.body, fontWeight: '700', color: colors.text, flexShrink: 1 },
  rowDesc: { ...type.bodySmall, color: colors.textSecondary, marginTop: 4 },
  rowActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  smallBtn: { flex: 1, minHeight: 38 },
  separator: { height: spacing.md },
  count: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  backdropTouch: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.huge,
  },
  sheetTitle: { ...type.h2, color: colors.text, marginBottom: spacing.lg },
  cancelBtn: { marginTop: spacing.md },
});
