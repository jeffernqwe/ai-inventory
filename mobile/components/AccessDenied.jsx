import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import Button from './Button';
import { useSession } from '../lib/auth';
import { defaultHomePath } from '../lib/permissions';
import { colors, spacing, type } from '../lib/theme';

/** Shown when the signed-in role cannot open a gated screen. */
export default function AccessDenied({ message = 'Your role does not allow this action.' }) {
  const { user } = useSession();
  return (
    <View style={styles.wrap}>
      <Text style={styles.emoji}>🔒</Text>
      <Text style={styles.title}>Not allowed</Text>
      <Text style={styles.body}>{message}</Text>
      <View style={styles.actions}>
        <Button title="Back to home" onPress={() => router.replace(defaultHomePath(user))} variant="secondary" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, backgroundColor: colors.background },
  emoji: { fontSize: 40, marginBottom: spacing.md },
  title: { ...type.h2, color: colors.text, textAlign: 'center' },
  body: { ...type.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, lineHeight: 22 },
  actions: { marginTop: spacing.xl },
});
