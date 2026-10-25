import * as SecureStore from 'expo-secure-store';

/**
 * The one piece of durable state the release notes need: which note this device has already
 * been told about.
 *
 * SecureStore rather than a new key-value dependency — the app has no AsyncStorage package, and
 * `lib/theme-context.tsx` already persists a non-secret preference here, so this adds no
 * dependency and no native module. The value is a note id and nothing else: no token, no user,
 * no business. It is a convenience marker, never a security control, which is why a failure to
 * read or write it is swallowed rather than surfaced.
 */
const SEEN_KEY = 'inventoryai.releaseNotes.seenId';

/**
 * The id this device has acknowledged, or null when it has acknowledged nothing.
 *
 * A read failure returns null — the card is then SHOWN. That is the deliberate direction: an
 * unreadable marker must not be the reason somebody misses a message about a change, and the
 * worst case is one card that reappears until the write succeeds.
 */
export async function readSeenReleaseNoteId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SEEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Records a note as acknowledged. Best-effort: the in-memory state has already moved on, so a
 * failed write costs one repeated card on the next launch and nothing else.
 */
export async function markReleaseNotesSeen(noteId: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(SEEN_KEY, noteId);
  } catch {
    // Intentionally silent — see the comment above.
  }
}
