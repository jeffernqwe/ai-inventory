import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { radius, spacing } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

const createStyles = (colors) =>
  StyleSheet.create({
    chip: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 7,
    },
    pressed: { opacity: 0.8 },
    label: { fontSize: 13, fontWeight: '600' },
  });

/** Pressable filter chip (search/filter rows): toggles selection state. */
export default function Chip({ label, selected, onPress, tone = 'primary' }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const activeBg = tone === 'danger' ? colors.danger : colors.primary;
  const activeFg = colors.textOnPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: activeBg, borderColor: activeBg },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, selected ? { color: activeFg } : { color: colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
