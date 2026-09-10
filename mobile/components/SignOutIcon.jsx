import { Pressable, StyleSheet, Text } from 'react-native';

import { useSession } from '../lib/auth';
import { confirm } from '../lib/confirm';
import { colors, radius } from '../lib/theme';

/**
 * Header sign-out affordance for protected screens that use the native stack
 * header (the Dashboard's custom TopBar is the only other in-header ⎋ button).
 * It self-wires to the session so it can render from a Stack.Screen headerRight
 * with no props. Same confirmation copy and signOut behavior as the Dashboard
 * and Profile controls — available to every authenticated role, never role-gated
 * (authorization stays on the backend).
 */
export default function SignOutIcon() {
  const { signOut } = useSession();

  async function onSignOut() {
    const ok = await confirm('Sign out', 'You will need to sign in again to manage inventory.', {
      confirmText: 'Sign Out',
      destructive: true,
    });
    if (ok) await signOut();
  }

  return (
    <Pressable
      onPress={onSignOut}
      hitSlop={10}
      style={styles.icon}
      accessibilityRole="button"
      accessibilityLabel="Sign out"
    >
      <Text style={styles.iconText}>⎋</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { color: colors.textMuted, fontSize: 17, fontWeight: '700' },
});
