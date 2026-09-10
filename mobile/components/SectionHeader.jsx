import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { spacing, type } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

const createStyles = (colors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    title: { ...type.h3, color: colors.text },
    subtitle: {
      ...type.bodySmall,
      color: colors.textSecondary,
      marginTop: 2,
    },
    action: {
      marginLeft: spacing.md,
      flexShrink: 0,
    },
  });

/**
 * Section header for grouping content on a screen: an optional title/subtitle
 * on the left and an optional `action` node (button/chip/link) on the right.
 */
export function SectionHeader({ title, subtitle, action, style }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.row, style]}>
      <View style={{ flex: 1 }}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

export default SectionHeader;
