import { useMemo } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import Button from './Button';
import { Icon } from './icons';
import { useSession } from '../lib/auth';
import { defaultHomePath } from '../lib/permissions';
import { spacing, type } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

/** Shown when the signed-in role cannot open a gated screen. */
export default function AccessDenied({ message = 'Your role does not allow this action.' }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useSession();
  return (
    <View style={styles.wrap}>
      <Icon name="lock" size={40} color={colors.textMuted} />
      <Text style={styles.title}>Not allowed</Text>
      <Text style={styles.body}>{message}</Text>
      <View style={styles.actions}>
        <Button title="Back to home" onPress={() => router.replace(defaultHomePath(user))} variant="secondary" />
      </View>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, backgroundColor: colors.background },
    title: { ...type.h2, color: colors.text, textAlign: 'center', marginTop: spacing.md },
    body: { ...type.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
    actions: { marginTop: spacing.xl },
  });
