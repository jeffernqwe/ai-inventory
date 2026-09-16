import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { radius, spacing } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

/**
 * The pill tones. Beyond the semantic five, the movement/stock-state tones
 * (`in`/`out`/`adjust`/`low`) name the domain state directly.
 */
export type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'in' | 'out' | 'adjust' | 'low';

/**
 * Status/label pill. `tone` picks a soft background + strong text pair:
 *   neutral success danger warning info
 *   in out adjust low   (stock movement / stock-state chips)
 *
 * Status text is intentionally not tiny (12/700): PO and stock status are
 * primary business information, not captions.
 */
const createTones = (colors: Palette): Record<BadgeTone, { bg: string; fg: string }> => ({
  neutral: { bg: colors.chipNeutral, fg: colors.chipNeutralText },
  success: { bg: colors.successSoft, fg: colors.success },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  info: { bg: colors.infoSoft, fg: colors.info },
  in: { bg: colors.chipIn, fg: colors.chipInText },
  out: { bg: colors.chipOut, fg: colors.chipOutText },
  adjust: { bg: colors.chipAdjust, fg: colors.chipAdjustText },
  low: { bg: colors.chipLow, fg: colors.chipLowText },
});

export interface BadgeProps {
  text?: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Small status/label pill. `dot` renders a leading status dot so state reads
 * through color AND shape (never color alone).
 */
export default function Badge({ text, tone = 'neutral', dot = false, style }: BadgeProps) {
  const { colors } = useTheme();
  const tones = useMemo(() => createTones(colors), [colors]);
  const t = tones[tone] ?? tones.neutral;
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, style]}>
      {dot ? <View style={[styles.dot, { backgroundColor: t.fg }]} /> : null}
      <Text style={[styles.text, { color: t.fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** Archive-aware status badge for ACTIVE/ARCHIVED entities. */
export function StatusBadge({ status }: { status?: string }) {
  if (status === 'ARCHIVED') return <Badge text="Archived" tone="neutral" />;
  return <Badge text="Active" tone="success" />;
}

/**
 * One label's text and pill tone — the shape the two maps below share. `t` is
 * optional so an unrecognised or absent value can fall through to a neutral
 * pill carrying whatever string it was given.
 */
interface TypeLabel {
  t?: string;
  tone: BadgeTone;
}

/** The movement types the trail records; anything else falls through to neutral. */
const TYPE_MAP: Record<string, TypeLabel> = {
  STOCK_IN: { t: 'Stock in', tone: 'in' },
  STOCK_OUT: { t: 'Stock out', tone: 'out' },
  ADJUSTMENT: { t: 'Adjustment', tone: 'adjust' },
  // A transfer is neither a gain nor a loss — it moves stock between
  // locations — so it takes the informational tone (Phase 19).
  TRANSFER: { t: 'Transfer', tone: 'info' },
};

/** Movement-type badge (history / transaction rows). */
export function TypeBadge({ type }: { type?: string }) {
  // Typed as a TypeLabel so `'neutral'` is checked against BadgeTone instead of
  // being asserted into it.
  const fallback: TypeLabel = { t: type, tone: 'neutral' };
  const m = (type ? TYPE_MAP[type] : undefined) ?? fallback;
  return <Badge text={m.t} tone={m.tone} />;
}

/**
 * Purchase-order status badge (Phase 13D). Only OPEN orders are receivable;
 * RECEIVED/CANCELED are terminal, DRAFT is pre-issue.
 */
export function PoStatusBadge({ status }: { status?: string }) {
  const map: Record<string, TypeLabel> = {
    DRAFT: { t: 'Draft', tone: 'neutral' },
    OPEN: { t: 'Open', tone: 'info' },
    RECEIVED: { t: 'Received', tone: 'success' },
    CANCELED: { t: 'Canceled', tone: 'neutral' },
  };
  const fallback: TypeLabel = { t: status ?? '—', tone: 'neutral' };
  const m = (status ? map[status] : undefined) ?? fallback;
  return <Badge text={m.t} tone={m.tone} dot />;
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  text: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
});
