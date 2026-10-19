import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Icon } from './icons';
import { radius } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

/**
 * Header profile affordance, beside the sign-out button.
 *
 * WHY IT EXISTS. Profile is reached from a tile on the Dashboard — and STAFF does
 * not land on the Dashboard at all (`defaultHomePath` sends them to Inventory,
 * which is correct: they do not hold `dashboard.view`). Found on the device
 * 2026-10-17 while walking the four roles: the only header affordance on
 * Inventory was sign out, so a STAFF user could not reach Profile at all, and
 * with it could not change their password, see/end their active sessions or edit
 * their name — features every other role gets from the Dashboard tile.
 *
 * Shown on the Inventory header for every role rather than only for STAFF: one
 * icon, no permission conditional, and a member who navigates to Inventory from
 * any role still has a direct way back to their own account.
 */
export default function ProfileIcon() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={() => router.push('/profile')}
      hitSlop={10}
      style={styles.icon}
      accessibilityRole="button"
      accessibilityLabel="Profile"
    >
      <Icon name="person" color={colors.textMuted} size={18} />
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
  });
