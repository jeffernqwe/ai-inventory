import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Card from '../../components/Card';
import Screen from '../../components/Screen';
import { useSession } from '../../lib/auth';
import { confirm } from '../../lib/confirm';
import { formatDateTime } from '../../lib/format';
import { roleLabel, defaultHomePath } from '../../lib/permissions';
import { colors, spacing, type } from '../../lib/theme';

function DetailRow({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function ProfileScreen() {
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
        <Badge text={roleLabel(user?.role)} tone={user?.role === 'OWNER' ? 'info' : 'neutral'} />
      </Card>

      <Text style={styles.sectionTitle}>Account</Text>
      <Card style={styles.details}>
        <DetailRow label="Name" value={user?.name} />
        <DetailRow label="Email" value={user?.email} />
        <DetailRow label="Role" value={roleLabel(user?.role)} />
        <DetailRow label="Status" value={user?.status === 'ACTIVE' ? 'Active' : user?.status} />
        <DetailRow label="Member since" value={formatDateTime(user?.createdAt)} />
        <Button
          title="Edit name"
          variant="secondary"
          style={styles.editName}
          onPress={() => router.push('/edit-name')}
        />
      </Card>

      <Text style={styles.sectionTitle}>Security</Text>
      <Card>
        <Text style={styles.securityText}>
          Inventory AI keeps your sign-in on this device's secure storage. Permissions and business data are
          always enforced by the server — the app never stores your password.
        </Text>
        <Button
          title="Change password"
          variant="secondary"
          style={styles.editName}
          onPress={() => router.push('/change-password')}
        />
      </Card>

      <Button title="Refresh account" variant="secondary" style={styles.spaced} onPress={() => refresh()} />
      <Button title="Back to home" variant="secondary" style={styles.spaced} onPress={() => router.replace(defaultHomePath(user))} />
      <Button title="Sign out" variant="danger" style={styles.spaced} onPress={onSignOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  avatarText: { color: '#FFF', fontWeight: '800', fontSize: 26 },
  name: { ...type.h2, color: colors.text, marginBottom: spacing.xs },
  sectionTitle: { ...type.h3, color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md },
  details: {},
  editName: { marginTop: spacing.md },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm + 2 },
  detailLabel: { ...type.body, color: colors.textMuted },
  detailValue: { ...type.body, color: colors.text, fontWeight: '600', marginLeft: spacing.md, flexShrink: 1 },
  securityText: { ...type.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  spaced: { marginTop: spacing.md },
});
