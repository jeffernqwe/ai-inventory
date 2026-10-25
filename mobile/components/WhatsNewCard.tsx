import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Badge from './Badge';
import Card from './Card';
import { Icon } from './icons';
import type { ReleaseNote } from '../lib/releaseNotes';
import { spacing, type } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

export interface WhatsNewCardProps {
  note: ReleaseNote;
  /** Open the full list. */
  onOpen: () => void;
  /** Acknowledge this note; it does not come back. */
  onDismiss: () => void;
}

/**
 * The announcement card — one per published note, shown once, on the dashboard.
 *
 * WHY IT IS A CARD AND NOT A TOAST OR A MODAL. Over-the-air updates are silent by design, so
 * something has to say "this changed" when the change is worth knowing about — and it must be
 * possible to ignore. A card inside the page can be read, dismissed, or scrolled past; a modal
 * interrupts a task the person opened the app to do, and a toast disappears before it is read.
 *
 * It is deliberately NOT a pressable card wrapping two controls: the whole surface is not a
 * target, because the dismiss and the open action do opposite things. Each is its own control
 * with its own 44px row and its own announcement.
 *
 * Nothing here reads the network, the session, or the update runtime: the note arrived inside
 * this bundle, so the card renders offline and cannot disagree with the screen it opens.
 */
export default function WhatsNewCard({ note, onOpen, onDismiss }: WhatsNewCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Badge text="What's new" tone="info" dot />
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          // Names the note so a screen reader announces WHAT is being dismissed, not just "Got it".
          accessibilityLabel={`Dismiss the note about ${note.title}`}
          style={styles.dismiss}
        >
          <Text style={styles.dismissText}>Got it</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>{note.title}</Text>
      <Text style={styles.summary}>{note.summary}</Text>
      <Pressable
        onPress={onOpen}
        accessibilityRole="link"
        accessibilityLabel={`See what's new: ${note.title}`}
        style={styles.open}
      >
        <Text style={styles.openText}>See what&apos;s new</Text>
        <Icon name="chevronRight" size={16} color={colors.primary} />
      </Pressable>
    </Card>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    card: { marginTop: spacing.lg },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    // 44px tall on the trailing edge, and pulled right so the tap target reaches the card's
    // padding rather than stopping at the word.
    dismiss: { minHeight: 44, justifyContent: 'center', paddingLeft: spacing.md, marginRight: -spacing.xs },
    dismissText: { ...type.label, color: colors.textSecondary, fontWeight: '600' },
    title: { ...type.h3, color: colors.text, marginTop: spacing.sm },
    summary: { ...type.bodySmall, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 21 },
    open: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, marginTop: spacing.xs, marginBottom: -spacing.sm },
    openText: { ...type.label, color: colors.primary, fontWeight: '700' },
  });
