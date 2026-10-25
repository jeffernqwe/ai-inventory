import * as SecureStore from 'expo-secure-store';

/**
 * Which notes this device has already been told about.
 *
 * WHY THIS IS A LIST OF IDS AND NOT THE NEWEST ID. It was the newest id until 2026-10-25, and
 * that version had a defect the same day's testing exposed: `seenId !== latest.id` cannot tell
 * "a newer note arrived" apart from "this bundle is older than the last one". A rollback
 * (`eas update:rollback`), a republish of an earlier group, or simply deleting the top note from
 * `RELEASE_NOTES` all make `latest` go *backwards* — and a single stored id then reports the
 * older note as unseen, so a card somebody dismissed comes back. That is the one behaviour this
 * whole feature must never have: a dismissal is a promise.
 *
 * So the marker is the SET of ids this device has acknowledged, capped (see
 * {@link MAX_REMEMBERED_RELEASE_NOTES}). It is monotonic — a note can be added and never removed
 * — so going backwards announces nothing, and the only thing that ever appears is a note whose
 * id has genuinely never been stored here.
 *
 * SecureStore rather than a new key-value dependency — the app has no AsyncStorage package, and
 * `lib/theme-context.tsx` already persists a non-secret preference here, so this adds no
 * dependency and no native module. The value is a JSON array of note ids and nothing else: no
 * token, no user, no business. It is a convenience marker, never a security control, which is why
 * a failure to read or write it is swallowed rather than surfaced.
 */

/** Where the list lives today. */
export const RELEASE_NOTES_SEEN_IDS_KEY = 'inventoryai.releaseNotes.seenIds';

/**
 * The key this module wrote before 2026-10-25, holding ONE id.
 *
 * Read only when the list has never been written — a device that acknowledged a note under the
 * old build carries its dismissal here, and losing it would show that note again for no reason.
 * The first successful write moves the device onto the list and this value is never consulted
 * again; it is left in place rather than deleted, because a leftover note id is harmless and a
 * failed delete is one more thing to get wrong.
 */
export const RELEASE_NOTES_LEGACY_SEEN_ID_KEY = 'inventoryai.releaseNotes.seenId';

/**
 * How many ids are remembered. Far more than the handful of notes ever in flight, and small
 * enough to stay a few kilobytes in storage. An id that falls off the end could only be
 * re-announced by a rollback more than this many notes into the past.
 */
export const MAX_REMEMBERED_RELEASE_NOTES = 100;

/** Ids out of a stored value, tolerant of the single-id shape written by the old build. */
function parseIds(raw: string | null): string[] {
  const text = (raw ?? '').trim();
  if (text === '') return [];
  if (text.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.filter((value): value is string => typeof value === 'string' && value.trim() !== '');
      }
    } catch {
      // Fall through to the single-id reading: a mangled list must not be read as "seen nothing"
      // when the value in front of us is a perfectly good id.
    }
  }
  // The pre-2026-10-25 shape: one bare id, not JSON.
  return text.startsWith('{') || text.startsWith('"') ? [] : [text];
}

/** Deduplicate, keep the newest {@link MAX_REMEMBERED_RELEASE_NOTES}, drop blanks. */
function normalise(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const id of ids) {
    const value = typeof id === 'string' ? id.trim() : '';
    if (value === '' || seen.has(value)) continue;
    seen.add(value);
    kept.push(value);
  }
  return kept.slice(-MAX_REMEMBERED_RELEASE_NOTES);
}

/**
 * Every note id this device has acknowledged, oldest first.
 *
 * A read failure returns an empty list — the card is then SHOWN. That is the deliberate
 * direction: an unreadable marker must not be the reason somebody misses a message about a
 * change, and the worst case is one card that reappears until a write succeeds.
 */
export async function readSeenReleaseNoteIds(): Promise<string[]> {
  try {
    const stored = parseIds(await SecureStore.getItemAsync(RELEASE_NOTES_SEEN_IDS_KEY));
    if (stored.length > 0) return normalise(stored);
    // No list yet: a device that acknowledged a note under the single-id build.
    return normalise(parseIds(await SecureStore.getItemAsync(RELEASE_NOTES_LEGACY_SEEN_ID_KEY)));
  } catch {
    return [];
  }
}

/**
 * Records a note as acknowledged, keeping everything already acknowledged.
 *
 * `alreadySeen` is passed in rather than read back, because the caller has just read it and a
 * second read would be a second failure point — and because this module keeps no memory between
 * calls, so nothing can go stale or leak between a test case and the next one.
 *
 * Best-effort: the in-memory state has already moved on, so a failed write costs one repeated
 * card on the next launch and nothing else. If the earlier read failed, `alreadySeen` is empty
 * and this writes only the new id; that loses older acknowledgements rather than inventing them,
 * which is again the direction that repeats a card instead of hiding one.
 */
export async function markReleaseNoteSeen(noteId: string, alreadySeen: readonly string[]): Promise<void> {
  const next = normalise([...alreadySeen, noteId]);
  if (next.length === 0) return;
  try {
    await SecureStore.setItemAsync(RELEASE_NOTES_SEEN_IDS_KEY, JSON.stringify(next));
  } catch {
    // Intentionally silent — see the comment above.
  }
}
