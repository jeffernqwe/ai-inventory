import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../lib/theme';

const VARIANTS = {
  primary: { bg: colors.primary, fg: colors.textOnPrimary, border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.text, border: colors.borderStrong },
  danger: { bg: colors.danger, fg: '#FFFFFF', border: colors.danger },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  full = false,
  textStyle,
}) {
  const v = VARIANTS[variant] ?? VARIANTS.primary;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: v.bg, borderColor: v.border },
        full && styles.full,
        pressed && !isDisabled && { opacity: 0.85 },
        isDisabled && { opacity: 0.55 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <Text style={[styles.label, { color: v.fg }, textStyle]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function ButtonRow({ children, style }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  full: { alignSelf: 'stretch' },
  label: {
    ...type.button,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
