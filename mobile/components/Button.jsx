import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, type } from '../lib/theme';
import { useTheme } from '../lib/theme-context';
import { Icon } from './icons';

const createVariants = (colors) => ({
  primary: { bg: colors.primary, fg: colors.textOnPrimary, border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.text, border: colors.borderStrong },
  danger: { bg: colors.danger, fg: colors.textOnPrimary, border: colors.danger },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
});

const SIZES = {
  md: { minHeight: 46, paddingHorizontal: spacing.lg },
  lg: { minHeight: 52, paddingHorizontal: spacing.xl },
};

/**
 * Primary action button. `size` is 'md' (46px, default) or 'lg' (52px) —
 * both comfortably above the 44px accessibility minimum. An optional `icon`
 * (semantic icon name) renders before the title.
 */
export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  style,
  full = false,
  textStyle,
}) {
  const { colors } = useTheme();
  const variants = useMemo(() => createVariants(colors), [colors]);
  const v = variants[variant] ?? variants.primary;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        SIZES[size],
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
        <>
          {icon ? <Icon name={icon} size={18} color={v.fg} /> : null}
          <Text style={[styles.label, { color: v.fg }, icon && styles.labelWithIcon, textStyle]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function ButtonRow({ children, style }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  full: { alignSelf: 'stretch' },
  label: {
    ...type.button,
    textAlign: 'center',
  },
  labelWithIcon: {
    marginLeft: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
