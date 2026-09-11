import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { StatusBadge } from './Badge';
import Banner from './Banner';
import Button from './Button';
import Card from './Card';
import Chip from './Chip';
import { Icon } from './icons';
import Input from './Input';
import ListRow from './ListRow';
import ListScreen from './ListScreen';
import { SearchField } from './SearchField';
import Sheet from './Sheet';
import { errorText } from './ListState';
import { ApiError } from '../lib/client';
import { useSession } from '../lib/auth';
import { confirm } from '../lib/confirm';
import useDebounced from '../hooks/useDebounced';
import usePagedList from '../hooks/usePagedList';
import { spacing, type } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

function fieldMap(err) {
  const out = {};
  if (err instanceof ApiError && Array.isArray(err.fields)) {
    for (const f of err.fields) out[f.field] = f.message;
  }
  return out;
}

/**
 * Shared manage screen for business-scoped reference lists (Categories,
 * Locations, Suppliers): search, status filter, server-driven pagination, and —
 * for users with the manage permission — create/edit via a sheet plus archive/
 * restore. The backend stays the authority; this UI only gates what's shown.
 *
 * `fields` adds extra optional writable columns (e.g. supplier contactName/
 * phone/email) to the form and the list row. Default `[]` keeps
 * Categories/Locations behaviour byte-for-byte unchanged.
 *
 * `icon` is an optional semantic icon name used as the row's leading glyph.
 */
export default function RefManage({
  api,
  canManageFn,
  singular,
  label,
  placeholder,
  emptyTitle,
  emptyMessage,
  fields = [],
  icon,
}) {
  const { user, token, signOut } = useSession();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

  // Create / edit form state.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [extras, setExtras] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setName('');
    setDescription('');
    setExtras({});
    setFieldErrors({});
    setFormError(null);
    setFormOpen(true);
  }
  function openEdit(item) {
    setEditing(item);
    setName(item.name);
    setDescription(item.description ?? '');
    const next = {};
    for (const f of fields) next[f.name] = item[f.name] ?? '';
    setExtras(next);
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
    for (const f of fields) {
      const v = (extras[f.name] ?? '').trim();
      // create: skip blanks so nothing empty is stored; update: forward '' so
      // the server clears a previously-set value (its PATCH applies differing fields).
      if (editing) payload[f.name] = v;
      else if (v) payload[f.name] = v;
    }
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
      <SearchField value={q} onChangeText={setQ} placeholder={placeholder} style={styles.search} />
      <View style={styles.filterRow}>
        <Chip label="All" selected={statusFilter === 'ALL'} onPress={() => setStatusFilter('ALL')} />
        <Chip label="Active" selected={statusFilter === 'ACTIVE'} onPress={() => setStatusFilter('ACTIVE')} />
        <Chip label="Archived" selected={statusFilter === 'ARCHIVED'} onPress={() => setStatusFilter('ARCHIVED')} />
      </View>
      {manage ? (
        <Button title={`New ${singular}`} icon="add" onPress={openCreate} full style={styles.newBtn} />
      ) : null}
    </View>
  );

  const renderItem = ({ item }) => {
    const meta = fields
      .map((f) => item[f.name])
      .filter((v) => v != null && String(v).trim() !== '')
      .join(' · ');
    return (
      <Card>
        <ListRow
          leading={icon ? <Icon name={icon} color={colors.primary} size={22} /> : null}
          title={item.name}
          subtitle={item.description || undefined}
          right={<StatusBadge status={item.status} />}
          footer={meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
        />
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
      </Card>
    );
  };

  return (
    <View style={styles.flex}>
      <ListScreen
        items={list.items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        header={header}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        errorTitle="Couldn't load items"
        refreshing={list.refreshing}
        onRefresh={list.refresh}
        onEndReached={list.loadMore}
        loadingMore={list.loadingMore}
        emptyTitle={emptyTitle}
        emptyMessage={debouncedQ ? `No ${label.toLowerCase()} match “${debouncedQ}”.` : emptyMessage}
        emptyAction={
          manage && !debouncedQ ? (
            <Button title={`Add your first ${singular.toLowerCase()}`} onPress={openCreate} />
          ) : null
        }
        footer={
          list.items.length >= 20 ? <Text style={styles.count}>{list.total} total</Text> : null
        }
      />

      {/* Create / edit */}
      <Sheet
        visible={formOpen}
        onClose={closeForm}
        title={editing ? `Edit ${singular.toLowerCase()}` : `New ${singular.toLowerCase()}`}
      >
        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
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
          {fields.map((f) => (
            <Input
              key={f.name}
              name={f.name}
              label={f.label}
              value={extras[f.name] ?? ''}
              onChangeText={(v) => setExtras((prev) => ({ ...prev, [f.name]: v }))}
              error={fieldErrors[f.name]}
              maxLength={f.maxLength}
              keyboardType={f.keyboardType}
              autoCapitalize={f.autoCapitalize ?? 'none'}
            />
          ))}
          <Button title={editing ? 'Save changes' : `Create ${singular.toLowerCase()}`} onPress={save} loading={saving} full />
          <Button title="Cancel" variant="secondary" onPress={closeForm} style={styles.cancelBtn} full />
        </ScrollView>
      </Sheet>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    search: { marginBottom: spacing.md },
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    newBtn: { marginBottom: spacing.md },
    rowMeta: { ...type.bodySmall, color: colors.textMuted },
    rowActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    smallBtn: { flex: 1 },
    count: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },
    sheetScroll: { flexShrink: 1 },
    sheetBody: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xl },
    cancelBtn: { marginTop: spacing.md },
  });
