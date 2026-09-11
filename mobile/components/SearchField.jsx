import { useMemo } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { radius, spacing, type } from '../lib/theme';
import { useTheme } from '../lib/theme-context';
import { Icon } from './icons';

const createStyles = (colors) =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      minHeight: 44,
    },
    input: {
      ...type.body,
      flex: 1,
      color: colors.text,
      paddingVertical: 11,
    },
  });

/**
 * Search input used in list headers: search icon + text field on a muted
 * surface. Keeps a 44px touch target and stays readable at larger font sizes.
 * `autoCapitalize` defaults to 'none'; callers searching codes that are shown
 * in upper case (e.g. purchase-order numbers) can ask for 'characters'.
 */
export function SearchField({ value, onChangeText, placeholder = 'Search…', autoCapitalize = 'none', autoFocus, style }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.wrap, style]}>
      <Icon name="search" size={18} color={colors.textMuted} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        autoFocus={autoFocus}
        returnKeyType="search"
      />
    </View>
  );
}

export default SearchField;
