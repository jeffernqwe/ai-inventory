import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing, type } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

const createStyles = (colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      flex: 1,
    },
    label: {
      ...type.label,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: spacing.xs,
    },
    value: {
      ...type.stat,
      color: colors.text,
    },
    sub: {
      ...type.bodySmall,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
  });

const TONES = {
  default: undefined,
  success: 'success',
  danger: 'danger',
  warning: 'warning',
  primary: 'primary',
};

/**
 * Key-number card for dashboards. The value uses the large `stat` type token
 * (24/800) so important quantities are immediately readable — a deliberate
 * readability choice, never a small caption.
 */
export function StatCard({ label, value, sub, tone = 'default', style }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const valueColor = TONES[tone] ? colors[TONES[tone]] : colors.text;
  return (
    <View style={[styles.card, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Text style={[styles.value, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {value}
      </Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

export default StatCard;
