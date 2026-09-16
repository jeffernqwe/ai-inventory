import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '../lib/theme-context';
import { radius, spacing } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { Icon } from './icons';
import type { IconName } from './icons';

export type IconButtonVariant = 'ghost' | 'subtle' | 'primary' | 'danger';

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    touchable: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
    },
    ghost: {
      backgroundColor: 'transparent',
    },
    subtle: {
      backgroundColor: colors.surfaceMuted,
    },
    primary: {
      backgroundColor: colors.primary,
    },
    danger: {
      backgroundColor: colors.dangerSoft,
    },
    pressed: {
      opacity: 0.7,
    },
    disabled: {
      opacity: 0.4,
    },
    label: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 20,
    },
    labelOnPrimary: {
      color: colors.textOnPrimary,
    },
  });

export interface IconButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  icon: IconName;
  label?: string;
  size?: number;
  variant?: IconButtonVariant;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/**
 * A tappable icon button with a 44px minimum touch target and an accessible
 * label. Use for compact icon-only actions (sign out, add, scan, close).
 *
 * `label` renders as visible text next to the icon when provided (still keeps
 * the 44px target); otherwise `accessibilityLabel` names the action for
 * screen readers.
 */
function IconButton({
  icon,
  label,
  onPress,
  size = 20,
  variant = 'ghost', // 'ghost' | 'subtle' | 'primary' | 'danger'
  disabled,
  accessibilityLabel,
  style,
  ...props
}: IconButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const hasLabel = Boolean(label);
  const iconColor = variant === 'primary' ? colors.textOnPrimary : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (hasLabel ? label : icon)}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [
        styles.touchable,
        variant === 'ghost' && styles.ghost,
        variant === 'subtle' && styles.subtle,
        variant === 'primary' && styles.primary,
        variant === 'danger' && styles.danger,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      <Icon name={icon} size={size} color={iconColor} />
      {hasLabel ? (
        <Text style={[styles.label, variant === 'primary' && styles.labelOnPrimary]}>{label}</Text>
      ) : null}
    </Pressable>
  );
}

export default IconButton;
