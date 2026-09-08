import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, shadows, spacing } from '../lib/theme';

/** Plain card container. */
export default function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Tappable card with a subtle pressed state; onPress disables it. */
export function PressableCard({ children, onPress, style, disabled }) {
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

const styles = StyleSheet.create({
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
