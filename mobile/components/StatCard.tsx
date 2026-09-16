import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { radius, spacing, type } from '../lib/theme';
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

export type StatTone = 'default' | 'success' | 'danger' | 'warning' | 'primary';

const TONES: Record<StatTone, keyof Palette | undefined> = {
  default: undefined,
  success: 'success',
  danger: 'danger',
  warning: 'warning',
  primary: 'primary',
};

export interface StatCardProps {
  label?: ReactNode;
  value?: ReactNode;
  sub?: ReactNode;
  tone?: StatTone;
  style?: StyleProp<ViewStyle>;
}

/**
 * Key-number card for dashboards. The value uses the large `stat` type token
 * (24/800) so important quantities are immediately readable — a deliberate
 * readability choice, never a small caption.
 */
function StatCard({ label, value, sub, tone = 'default', style }: StatCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const toneKey = TONES[tone];
  const valueColor = toneKey ? colors[toneKey] : colors.text;
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
