import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

const createTones = (colors) => ({
  error: { bg: colors.dangerSoft, fg: colors.danger, border: colors.danger },
  warn: { bg: colors.warningSoft, fg: colors.warning, border: colors.warning },
  info: { bg: colors.infoSoft, fg: colors.info, border: colors.info },
  success: { bg: colors.successSoft, fg: colors.success, border: colors.success },
});

/** Full-width alert strip for form/API errors above or below content. */
export default function Banner({ type = 'error', text, style }) {
  const { colors } = useTheme();
  const tones = useMemo(() => createTones(colors), [colors]);
  if (!text) return null;
  const t = tones[type] ?? tones.error;
  return (
    <View style={[styles.banner, { backgroundColor: t.bg, borderColor: t.border }, style]}>
      <Text style={[styles.text, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

const BODY = { fontSize: 13, lineHeight: 18 };

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.lg,
  },
  text: { ...BODY, fontWeight: '600' },
});
