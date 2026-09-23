import { useMemo } from 'react';
import type { ReactNode } from 'react';
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
import type { Palette } from '../../lib/theme';
import { useTheme } from '../../lib/theme-context';

/**
 * One label/value line. The label is the muted title and the value renders at
 * body size beneath it (never a fixed-height right column) so long emails and
 * long names reflow instead of truncating at large system font sizes.
 */
function DetailRow({ label, value, divider }: { label: string; value?: ReactNode; divider?: boolean }) {
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

  async function onSignOut(): Promise<void> {
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
          Inventory AI keeps your sign-in on this device&apos;s secure storage. Permissions and business data are
          always enforced by the server — the app never stores your password.
        </Text>
        <Button
          title="Active sessions"
          variant="secondary"
          style={styles.editName}
          onPress={() => router.push('/sessions')}
        />
        {/**
         * Phase 32K — local password management is offered only where the server
         * says it applies. `authMethods.password` is false for an account whose
         * credential is held by its sign-in provider: Firebase is the
         * authentication authority for such an account, so the server refuses a
         * local password change outright (409 `PASSWORD_NOT_APPLICABLE`) and
         * showing the control would only lead to that rejection.
         *
         * The test is `=== false`, not falsiness, so the historical behaviour is
         * the default: a user object without the field — an older server, or a
         * response that predates this phase — still gets the button.
         *
         * Nothing here is a security control. The server is the boundary either
         * way; this only stops the UI from offering an action it knows will fail.
         */}
        {user?.authMethods?.password === false ? (
          <Text style={[styles.securityText, styles.spaced]}>
            Your password is managed by your sign-in provider, so it can&apos;t be changed here.
          </Text>
        ) : (
          <Button
            title="Change password"
            variant="secondary"
            style={styles.spaced}
            onPress={() => router.push('/change-password')}
          />
        )}
      </Card>

      <Button title="Refresh account" variant="secondary" style={styles.spaced} onPress={() => refresh()} />
      <Button title="Back to home" variant="secondary" style={styles.spaced} onPress={() => router.replace(defaultHomePath(user))} />
      <Button title="Sign out" variant="danger" style={styles.spaced} onPress={onSignOut} />
    </Screen>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
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
