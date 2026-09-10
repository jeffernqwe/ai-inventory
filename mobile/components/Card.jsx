import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { radius, shadows, spacing } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

const createStyles = (colors) =>
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

/** Plain card container. */
export default function Card({ children, style }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Tappable card with a subtle pressed state; onPress disables it. */
export function PressableCard({ children, onPress, style, disabled }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [styles.card, pressed && onPress && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
}
