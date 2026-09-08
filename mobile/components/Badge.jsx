import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../lib/theme';

/**
 * Small status/label pill. `tone` picks a soft background + strong text pair:
 *   neutral success danger warning info
 *   in out adjust low   (stock movement / stock-state chips)
 */
const TONES = {
  neutral: { bg: colors.chipNeutral, fg: colors.chipNeutralText },
  success: { bg: colors.successSoft, fg: colors.success },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  info: { bg: colors.infoSoft, fg: colors.info },
  in: { bg: colors.chipIn, fg: colors.chipInText },
  out: { bg: colors.chipOut, fg: colors.chipOutText },
  adjust: { bg: colors.chipAdjust, fg: colors.chipAdjustText },
  low: { bg: colors.chipLow, fg: colors.chipLowText },
};

export default function Badge({ text, tone = 'neutral', style }) {
  const t = TONES[tone] ?? TONES.neutral;
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, style]}>
      <Text style={[styles.text, { color: t.fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** Archive-aware status badge for ACTIVE/ARCHIVED entities. */
export function StatusBadge({ status }) {
  if (status === 'ARCHIVED') return <Badge text="Archived" tone="neutral" />;
  return <Badge text="Active" tone="success" />;
}

/** Movement-type badge (history / transaction rows). */
export function TypeBadge({ type }) {
  const map = { STOCK_IN: { t: 'Stock in', tone: 'in' }, STOCK_OUT: { t: 'Stock out', tone: 'out' }, ADJUSTMENT: { t: 'Adjustment', tone: 'adjust' } };
  const m = map[type] ?? { t: type, tone: 'neutral' };
  return <Badge text={m.t} tone={m.tone} />;
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
});
