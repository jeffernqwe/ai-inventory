import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { radius, shadows, spacing } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      ...shadows.card,
    },
    pressed: { opacity: 0.85 },
  });

export interface CardProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Plain card container. */
export default function Card({ children, style }: CardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={[styles.card, style]}>{children}</View>;
}

export interface PressableCardProps extends Omit<PressableProps, 'style' | 'children'> {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Tappable card with a subtle pressed state; onPress disables it. Extra props
 * (e.g. accessibilityRole/accessibilityLabel) are forwarded to the underlying
 * Pressable so a tappable row stays announced as a button.
 */
export function PressableCard({ children, onPress, style, disabled, ...rest }: PressableCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      {...rest}
      style={({ pressed }) => [styles.card, pressed && onPress && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
}
