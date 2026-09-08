import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../lib/theme';

const TONES = {
  error: { bg: colors.dangerSoft, fg: colors.danger, border: colors.danger },
  warn: { bg: colors.warningSoft, fg: colors.warning, border: colors.warning },
  info: { bg: colors.infoSoft, fg: colors.info, border: colors.info },
};

/** Full-width alert strip for form/API errors above or below content. */
export default function Banner({ type = 'error', text, style }) {
  if (!text) return null;
  const t = TONES[type] ?? TONES.error;
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
