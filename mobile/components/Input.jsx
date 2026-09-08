import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, type } from '../lib/theme';

/**
 * Labelled text field. `error` renders the backend/field message; field-level
 * validation problems from a 400 map onto `name` and are shown in red.
 */
export default function Input({
  label,
  name,
  value,
  onChangeText,
  error,
  errors = {},
  required,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  autoCorrect = false,
  multiline,
  editable = true,
  maxLength,
  helper,
  returnKeyType,
  onSubmitEditing,
  onBlur,
  autoFocus,
}) {
  const problem = error || errors?.[name];
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.req}> *</Text> : null}
        </Text>
      ) : null}
      <TextInput
        style={[styles.input, multiline && styles.multiline, problem && styles.inputError, !editable && styles.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        editable={editable}
        multiline={multiline}
        maxLength={maxLength}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        onBlur={onBlur}
        autoFocus={autoFocus}
      />
      {problem ? <Text style={styles.error}>{problem}</Text> : helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: {
    ...type.label,
    color: colors.text,
    marginBottom: spacing.xs + 2,
  },
  req: { color: colors.danger },
  input: {
    ...type.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
  },
  multiline: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  inputError: { borderColor: colors.danger },
  inputDisabled: { backgroundColor: colors.surfaceMuted, color: colors.textMuted },
  error: { ...type.caption, color: colors.danger, marginTop: 6 },
  helper: { ...type.caption, color: colors.textMuted, marginTop: 6 },
});
