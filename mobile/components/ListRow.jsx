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
    right: { flexShrink: 0 },
  });

/**
 * Standard list row used inside Cards: optional leading icon, a title (with an
 * optional subtitle) that grows to fill, and an optional right-side element
 * (badge, value, chevron). The title intentionally avoids aggressive
 * truncation so important names stay readable at large font sizes.
 */
export function ListRow({ leading, title, subtitle, right, style }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.row, style]}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.body}>
        {title ? (
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

export default ListRow;
