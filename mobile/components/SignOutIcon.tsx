import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useSession } from '../lib/auth';
import { confirm } from '../lib/confirm';
import { radius } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

/**
 * Header sign-out affordance for protected screens that use the native stack
 * header (the Dashboard's custom TopBar is the only other in-header ⎋ button).
 * It self-wires to the session so it can render from a Stack.Screen headerRight
 * with no props. Same confirmation copy and signOut behavior as the Dashboard
 * and Profile controls — available to every authenticated role, never role-gated
 * (authorization stays on the backend).
 *
 * Colors come from `useTheme()` so the button follows the header it sits in;
 * the fill is the recessed `surfaceMuted` token rather than `surface`, which
 * would make it invisible against the header's own `surface` background.
 */
export default function SignOutIcon() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { signOut } = useSession();

  async function onSignOut(): Promise<void> {
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

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    icon: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconText: { color: colors.textMuted, fontSize: 17, fontWeight: '700' },
  });
