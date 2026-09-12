import { useMemo } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Card from '../../components/Card';
import ListRow from '../../components/ListRow';
import Screen from '../../components/Screen';
import SectionHeader from '../../components/SectionHeader';
import { useSession } from '../../lib/auth';
import { confirm } from '../../lib/confirm';
import { formatDateTime } from '../../lib/format';
import { roleLabel, defaultHomePath } from '../../lib/permissions';
import { spacing, type } from '../../lib/theme';
import { useTheme } from '../../lib/theme-context';

/**
 * One label/value line. The label is the muted title and the value renders at
 * body size beneath it (never a fixed-height right column) so long emails and
 * long names reflow instead of truncating at large system font sizes.
 */
function DetailRow({ label, value, divider }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (value == null || value === '') return null;
  return (
    <ListRow
      style={divider ? styles.detailRow : undefined}
      title={label}
      titleStyle={styles.detailLabel}
      footer={<Text style={styles.detailValue}>{value}</Text>}
    />
  );
}

export default function ProfileScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, signOut, refresh } = useSession();

  async function onSignOut() {
    const ok = await confirm('Sign out', 'You will need to sign in again to manage inventory.', {
      confirmText: 'Sign Out',
      destructive: true,
    });
    if (ok) await signOut();
  }

  return (
    <Screen scroll>
      <Card style={styles.headerCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.name ?? '?').slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Badge
          text={roleLabel(user?.role)}
          tone={user?.role === 'OWNER' ? 'info' : 'neutral'}
          style={styles.headerBadge}
        />
      </Card>

      <SectionHeader title="Account" style={styles.section} />
      <Card>
        <View style={styles.detailList}>
          <DetailRow label="Name" value={user?.name} divider />
          <DetailRow label="Email" value={user?.email} divider />
          <DetailRow label="Role" value={roleLabel(user?.role)} divider />
          <DetailRow label="Status" value={user?.status === 'ACTIVE' ? 'Active' : user?.status} divider />
          <DetailRow label="Member since" value={formatDateTime(user?.createdAt)} />
        </View>
        <Button
          title="Edit name"
          variant="secondary"
          style={styles.editName}
          onPress={() => router.push('/edit-name')}
        />
      </Card>

      <SectionHeader title="Security" style={styles.section} />
      <Card>
        <Text style={styles.securityText}>
          Inventory AI keeps your sign-in on this device's secure storage. Permissions and business data are
          always enforced by the server — the app never stores your password.
        </Text>
        <Button
          title="Active sessions"
          variant="secondary"
          style={styles.editName}
          onPress={() => router.push('/sessions')}
        />
        <Button
          title="Change password"
          variant="secondary"
          style={styles.spaced}
          onPress={() => router.push('/change-password')}
        />
      </Card>

      <Button title="Refresh account" variant="secondary" style={styles.spaced} onPress={() => refresh()} />
      <Button title="Back to home" variant="secondary" style={styles.spaced} onPress={() => router.replace(defaultHomePath(user))} />
      <Button title="Sign out" variant="danger" style={styles.spaced} onPress={onSignOut} />
    </Screen>
  );
}

const createStyles = (colors) => StyleSheet.create({
  headerCard: { alignItems: 'center', paddingVertical: spacing.xxl },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: { ...type.h1, color: colors.textOnPrimary },
  name: { ...type.h2, color: colors.text, marginBottom: spacing.xs },
  // Badge sets alignSelf:'flex-start' for list rows; centre it under the name.
  headerBadge: { alignSelf: 'center' },
  section: { marginTop: spacing.xxl },
  detailList: { gap: spacing.sm },
  detailRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider, paddingBottom: spacing.sm },
  detailLabel: { ...type.label, color: colors.textMuted },
  detailValue: { ...type.body, color: colors.text, fontWeight: '600' },
  editName: { marginTop: spacing.lg },
  securityText: { ...type.bodySmall, color: colors.textSecondary },
  spaced: { marginTop: spacing.md },
});
