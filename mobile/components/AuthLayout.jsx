import { useMemo } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, shadows, spacing, type } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

/**
 * Auth-screen shell: brand header + card on a tinted background, reused by
 * Login and Register so the two screens stay visually identical.
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>IA</Text>
            </View>
            <Text style={styles.appName}>Inventory AI</Text>
            <Text style={styles.tagline}>Multi-tenant inventory for small teams</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            <View style={styles.form}>{children}</View>
          </View>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xxl },
    brand: { alignItems: 'center', marginBottom: spacing.xxl },
    logo: {
      width: 56,
      height: 56,
      borderRadius: radius.lg,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    logoText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: 22, letterSpacing: 0.5 },
    appName: { ...type.h1, color: colors.text },
    tagline: { ...type.body, color: colors.textMuted, marginTop: spacing.xs },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xxl,
      ...shadows.card,
    },
    title: { ...type.h2, color: colors.text, marginBottom: 4 },
    subtitle: { ...type.bodySmall, color: colors.textSecondary, marginBottom: spacing.lg },
    form: { marginTop: spacing.sm },
    footer: { alignItems: 'center', marginTop: spacing.xxl },
  });
