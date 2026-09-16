import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { radius, spacing, type } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

const createStyles = (colors: Palette) =>
  StyleSheet.create({
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
    focused: { borderColor: colors.primary },
    multiline: {
      minHeight: 92,
      textAlignVertical: 'top',
    },
    inputError: { borderColor: colors.danger },
    inputDisabled: { backgroundColor: colors.surfaceMuted, color: colors.textMuted },
    error: { ...type.caption, color: colors.danger, marginTop: 6 },
    helper: { ...type.caption, color: colors.textMuted, marginTop: 6 },
  });

export interface InputProps {
  label?: ReactNode;
  /** Field key this input reports under; selects the matching `errors` entry. */
  name?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  /** A single field message (wins over `errors`). */
  error?: string | null;
  /** Field-level problems from a 400 response, keyed by field name. */
  errors?: Record<string, string | undefined> | null;
  required?: boolean;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: boolean;
  multiline?: boolean;
  editable?: boolean;
  maxLength?: number;
  helper?: ReactNode;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  onBlur?: () => void;
  autoFocus?: boolean;
}

/**
 * Labelled text field. `error` renders the backend/field message; field-level
 * validation problems from a 400 map onto `name` and are shown in red.
 * Focused fields get a primary ring so the active input is obvious.
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
}: InputProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [focused, setFocused] = useState(false);
  const problem = error || errors?.[name ?? ''];
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.req}> *</Text> : null}
        </Text>
      ) : null}
      <TextInput
        style={[
          styles.input,
          multiline && styles.multiline,
          focused && !problem && styles.focused,
          problem && styles.inputError,
          !editable && styles.inputDisabled,
        ]}
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
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        autoFocus={autoFocus}
      />
      {problem ? <Text style={styles.error}>{problem}</Text> : helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}
