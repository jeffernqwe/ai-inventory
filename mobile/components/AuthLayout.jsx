import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import Card from './Card';
import Screen from './Screen';
import { radius, spacing, type } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

/**
 * Auth-screen shell: brand header + card on a tinted background, reused by
 * Login and Register so the two screens stay visually identical.
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Screen scroll padded={false} contentStyle={styles.scroll}>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>IA</Text>
        </View>
        <Text style={styles.appName}>Inventory AI</Text>
        <Text style={styles.tagline}>Multi-tenant inventory for small teams</Text>
      </View>

      <Card style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.form}>{children}</View>
      </Card>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </Screen>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xxl },
    brand: { alignItems: 'center', marginBottom: spacing.xxl },
    // minWidth/minHeight (not width/height) so the mark grows with the label
    // instead of clipping it at large system font scales.
    logo: {
      minWidth: 56,
      minHeight: 56,
      borderRadius: radius.lg,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    logoText: { ...type.h2, color: colors.textOnPrimary, letterSpacing: 0.5 },
    // alignSelf:'stretch' keeps the centred column's text box at the container
    // width; without it the box shrink-wraps and a wrapped line looks off-centre.
    appName: { ...type.h1, color: colors.text, alignSelf: 'stretch', textAlign: 'center' },
    tagline: { ...type.body, color: colors.textMuted, alignSelf: 'stretch', textAlign: 'center', marginTop: spacing.xs },
    card: { padding: spacing.xxl },
    title: { ...type.h2, color: colors.text, marginBottom: spacing.xs },
    subtitle: { ...type.bodySmall, color: colors.textSecondary, marginBottom: spacing.lg },
    form: { marginTop: spacing.sm },
    footer: { alignItems: 'center', marginTop: spacing.xxl },
  });
