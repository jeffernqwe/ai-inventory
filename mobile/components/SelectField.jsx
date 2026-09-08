import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, type } from '../lib/theme';

/**
 * Read-only field that opens a modal list of options. Keeps pickers consistent
 * across the app (product, location, category, movement type…) without a picker
 * library. `options` = [{ label, value }]; a value of '' renders the placeholder.
 */
export default function SelectField({
  label,
  placeholder = 'Select…',
  options,
  value,
  onChange,
  error,
  disabled,
  required,
  searchable,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const shown = searchable && q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.req}> *</Text> : null}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setQuery('');
          setOpen(true);
        }}
        disabled={disabled || options.length === 0}
        style={({ pressed }) => [
          styles.field,
          error && styles.fieldError,
          (disabled || options.length === 0) && styles.fieldDisabled,
          pressed && styles.fieldPressed,
        ]}
      >
        <Text numberOfLines={1} style={selected ? styles.value : styles.placeholder}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={styles.backdropTouch} onPress={() => setOpen(false)} />
          <SafeAreaView style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label || 'Select'}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Text style={styles.close}>Done</Text>
              </Pressable>
            </View>
            {options.length === 0 ? (
              <Text style={styles.empty}>No options available.</Text>
            ) : (
              <FlatList
                data={shown}
                keyExtractor={(o) => o.value}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                  searchable ? (
                    <TextInputInline value={query} onChangeText={setQuery} />
                  ) : null
                }
                renderItem={({ item }) => {
                  const isSel = item.value === value;
                  return (
                    <Pressable
                      onPress={() => {
                        onChange?.(item.value);
                        setOpen(false);
                      }}
                      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                    >
                      <Text style={[styles.optionText, isSel && styles.optionSelected]} numberOfLines={2}>
                        {item.label}
                      </Text>
                      {isSel ? <Text style={styles.check}>✓</Text> : null}
                    </Pressable>
                  );
                }}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
              />
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

function TextInputInline({ value, onChangeText }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder="Search…"
      placeholderTextColor={colors.placeholder}
      autoCapitalize="none"
      autoCorrect={false}
      style={styles.search}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: { ...type.label, color: colors.text, marginBottom: spacing.xs + 2 },
  req: { color: colors.danger },
  field: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldPressed: { backgroundColor: colors.surfaceMuted },
  fieldError: { borderColor: colors.danger },
  fieldDisabled: { backgroundColor: colors.surfaceMuted, opacity: 0.7 },
  value: { ...type.body, color: colors.text, flex: 1, paddingVertical: 11 },
  placeholder: { ...type.body, color: colors.placeholder, flex: 1, paddingVertical: 11 },
  chevron: { color: colors.textMuted, fontSize: 16, marginLeft: spacing.sm },
  error: { ...type.caption, color: colors.danger, marginTop: 6 },

  backdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropTouch: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '75%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  sheetTitle: { ...type.h3 },
  close: { ...type.button, color: colors.link },
  search: {
    ...type.body,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  option: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionPressed: { backgroundColor: colors.surfaceMuted },
  optionText: { ...type.body, color: colors.text, flex: 1 },
  optionSelected: { color: colors.primary, fontWeight: '700' },
  check: { color: colors.primary, fontWeight: '800', marginLeft: spacing.md },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginLeft: spacing.lg },
  empty: { ...type.body, color: colors.textMuted, textAlign: 'center', padding: spacing.xl },
});
