import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { radius, spacing, type } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';
import Button from './Button';
import { Icon } from './icons';
import type { IconName } from './icons';

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
    box: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xxl,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    centerBlock: {},
    loaderLabel: { ...type.body, color: colors.textMuted, marginTop: spacing.md },
    emptyTitle: { ...type.h3, color: colors.text, textAlign: 'center' },
    muted: { ...type.bodySmall, color: colors.textMuted, textAlign: 'center' },
    mutedCenter: { ...type.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs, lineHeight: 22 },
    emptyAction: { marginTop: spacing.xl },
    iconWrap: { marginBottom: spacing.sm },
  });

/** Centered spinner with optional label. */
export function CenterLoader({ label = 'Loading…', style }: { label?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.center, style]}>
      <ActivityIndicator color={colors.primary} size="large" />
      {label ? <Text style={styles.loaderLabel}>{label}</Text> : null}
    </View>
  );
}

/** List/box state row used under headers while a page loads. */
export function LoadingBlock({ label }: { label?: ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.box}>
      <ActivityIndicator color={colors.primary} />
      {label ? <Text style={styles.muted}>{label}</Text> : null}
    </View>
  );
}

export interface EmptyStateProps {
  title?: ReactNode;
  message?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
}

/** Empty state (no data / no search matches). */
export function EmptyState({ title = 'Nothing here yet', message, action, icon }: EmptyStateProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.center}>
      {icon ? (
        <View style={styles.iconWrap}>
          <Icon name={icon} size={40} color={colors.textMuted} />
        </View>
      ) : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.mutedCenter}>{message}</Text> : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

export interface ErrorStateProps {
  title?: ReactNode;
  message?: ReactNode;
  onRetry?: () => void;
  retryLabel?: ReactNode;
  icon?: IconName;
}

/** Full error state with a Retry action. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  icon = 'alert',
}: ErrorStateProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.center}>
      <View style={styles.iconWrap}>
        <Icon name={icon} size={40} color={colors.danger} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.mutedCenter}>{message}</Text> : null}
      {onRetry ? (
        <View style={styles.emptyAction}>
          <Button title={retryLabel} onPress={onRetry} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Message used by screens for thrown ApiError / network failures. The thrown
 * value is genuinely unknown (a rejected request can carry anything), so the
 * shape is checked here rather than assumed by every caller.
 */
export function errorText(err: unknown, fallback = 'Unable to load. Check your connection and try again.'): string {
  if (err == null) return fallback;
  if (typeof err === 'string') return err;
  return (err as { message?: string }).message || fallback;
}
