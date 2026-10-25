import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import Badge from '../../components/Badge';
import type { BadgeTone } from '../../components/Badge';
import Button from '../../components/Button';
import Card from '../../components/Card';
import Screen from '../../components/Screen';
import { useReleaseNotes } from '../../hooks/useReleaseNotes';
import { useSession } from '../../lib/auth';
import { defaultHomePath } from '../../lib/permissions';
import { RELEASE_NOTES, formatReleaseDate } from '../../lib/releaseNotes';
import type { ReleaseNote, ReleaseNoteKind } from '../../lib/releaseNotes';
import { spacing, type } from '../../lib/theme';
import type { Palette } from '../../lib/theme';
import { useTheme } from '../../lib/theme-context';

/**
 * What's New — every note this bundle carries, newest first.
 *
 * WHY IT IS A SCREEN AND NOT ONLY A CARD. The card announces the newest note, once. People who
 * skipped it — or who want to check what changed last month — need somewhere permanent to look,
 * and Profile carries the doorway. The content is the same constant, so the two can never
 * disagree.
 *
 * The list is the BUNDLE's list, not the server's: it renders with no network, needs no token,
 * and cannot show a note about code this build does not have. That is the whole point of keeping
 * it in the bundle, and it is why nothing here calls the API.
 *
 * Reading is not the same as acknowledging: opening the screen leaves the dashboard card in
 * place, and the footer button is what records it as read. Leaving before pressing it therefore
 * costs nothing but the card returning — never a lost message.
 */

const KIND: Record<ReleaseNoteKind, { label: string; tone: BadgeTone }> = {
  feature: { label: 'New feature', tone: 'info' },
  improvement: { label: 'Improvement', tone: 'success' },
  fix: { label: 'Fix', tone: 'neutral' },
};

function NoteCard({ note }: { note: ReleaseNote }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const kind = KIND[note.kind];
  const when = formatReleaseDate(note.date);
  return (
    <Card style={styles.note}>
      <View style={styles.noteHead}>
        <Badge text={kind.label} tone={kind.tone} />
        {when ? <Text style={styles.noteDate}>{when}</Text> : null}
      </View>
      <Text style={styles.noteTitle}>{note.title}</Text>
      <Text style={styles.noteSummary}>{note.summary}</Text>
      {note.points?.length ? (
        <View style={styles.points}>
          {note.points.map((point) => (
            <View key={point} style={styles.point}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.pointText}>{point}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export default function WhatsNewScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useSession();
  const { unseen, acknowledge } = useReleaseNotes();

  /**
   * Acknowledge, then leave. `canGoBack` is checked because this screen has two doorways: the
   * dashboard card (a push, so back works) and a deep link or a cold start straight onto it (no
   * history, where `back()` would do nothing and strand the tap). The fallback is the same home
   * route the app uses after sign-in, so it lands where the person's role belongs.
   */
  function leave(): void {
    acknowledge();
    if (router.canGoBack()) router.back();
    else router.replace(defaultHomePath(user));
  }

  return (
    <Screen scroll>
      <Card>
        <Text style={styles.introText}>
          Inventory AI updates itself. When a new version is ready it arrives the next time you
          open the app, so there is nothing to download from the store.
        </Text>
        <Text style={[styles.introText, styles.introSpaced]}>
          Anything worth knowing about is written up here, newest first. Small wording and layout
          fixes arrive quietly and are not announced.
        </Text>
      </Card>

      {RELEASE_NOTES.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}

      <Button
        title={unseen ? 'Mark as read' : 'Done'}
        variant="secondary"
        style={styles.done}
        onPress={leave}
      />
    </Screen>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    introText: { ...type.body, color: colors.textSecondary, lineHeight: 22 },
    introSpaced: { marginTop: spacing.sm },
    note: { marginTop: spacing.md },
    noteHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    noteDate: { ...type.caption, color: colors.textMuted },
    noteTitle: { ...type.h3, color: colors.text, marginTop: spacing.sm },
    noteSummary: { ...type.bodySmall, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 21 },
    points: { marginTop: spacing.sm, gap: spacing.xs },
    point: { flexDirection: 'row', gap: spacing.sm },
    bullet: { ...type.bodySmall, color: colors.primary, lineHeight: 21 },
    pointText: { ...type.bodySmall, color: colors.text, lineHeight: 21, flex: 1 },
    done: { marginTop: spacing.xl },
  });
