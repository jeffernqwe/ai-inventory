import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { spacing, type } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

const createStyles = (colors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    leading: {
      width: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: { flex: 1 },
    title: { ...type.listTitle, color: colors.text },
    subtitle: {
      ...type.bodySmall,
      color: colors.textSecondary,
      marginTop: 2,
    },
    footer: { marginTop: spacing.xs },
    right: { flexShrink: 0 },
  });

/**
 * Standard list row used inside Cards: optional leading icon, a title (with an
 * optional subtitle) that grows to fill, and an optional right-side element
 * (badge, value, chevron). The title intentionally avoids aggressive
 * truncation so important names stay readable at large font sizes.
 *
 * `footer` renders one more line beneath the subtitle for content that must NOT
 * drop to the subtitle's small size — key quantities (available/on-hand) and
 * progress figures are rendered by the caller at `type.body` or larger.
 *
 * `titleStyle` is an optional, purely presentational override merged after the
 * base title style (used to keep an entity identifier's emphasis, e.g. the
 * bold tabular purchase-order number).
 */
export function ListRow({ leading, title, subtitle, right, footer, titleStyle, style }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.row, style]}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.body}>
        {title ? (
          <Text style={[styles.title, titleStyle]} numberOfLines={2}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

export default ListRow;
