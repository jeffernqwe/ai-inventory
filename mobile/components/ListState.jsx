import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../lib/theme';
import Button from './Button';

/** Centered spinner with optional label. */
export function CenterLoader({ label = 'Loading…', style }) {
  return (
    <View style={[styles.center, style]}>
      <ActivityIndicator color={colors.primary} size="large" />
      {label ? <Text style={styles.loaderLabel}>{label}</Text> : null}
    </View>
  );
}

/** List/box state row used under headers while a page loads. */
export function LoadingBlock({ label }) {
  return (
    <View style={styles.box}>
      <ActivityIndicator color={colors.primary} />
      {label ? <Text style={styles.muted}>{label}</Text> : null}
    </View>
  );
}

/** Empty state (no data / no search matches). */
export function EmptyState({ title = 'Nothing here yet', message, action }) {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.mutedCenter}>{message}</Text> : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

/** Full error state with a Retry action. */
export function ErrorState({ title = 'Something went wrong', message, onRetry, retryLabel = 'Try again' }) {
  return (
    <View style={styles.center}>
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

/** Message used by screens for thrown ApiError / network failures. */
export function errorText(err, fallback = 'Unable to load. Check your connection and try again.') {
  if (err == null) return fallback;
  if (typeof err === 'string') return err;
  return err.message || fallback;
}

const styles = StyleSheet.create({
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
});
