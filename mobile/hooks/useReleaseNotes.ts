import { useCallback, useEffect, useState } from 'react';

import { LATEST_RELEASE_NOTE } from '../lib/releaseNotes';
import type { ReleaseNote } from '../lib/releaseNotes';
import { markReleaseNoteSeen, readSeenReleaseNoteIds } from '../lib/releaseNotesSeen';

export interface ReleaseNotesState {
  /** The note the dashboard card announces, or null when this bundle carries none. */
  latest: ReleaseNote | null;
  /** True until the stored marker has been read — callers render no card while it is. */
  loading: boolean;
  /** True when this device has not acknowledged the newest note yet. */
  unseen: boolean;
  /** Records the newest note as acknowledged, in memory immediately and on disk best-effort. */
  acknowledge: () => void;
}

/**
 * The dashboard card's state: has this device been told about the newest note yet?
 *
 * The rule is one membership test — `!seenIds.includes(latest.id)` — and the list is what makes
 * it correct in both directions. A note announces itself once and never again; a bundle with no
 * new note announces nothing; a device that has stored nothing is shown the newest note, which is
 * exactly right for a build that arrives by over-the-air update, because the app really did just
 * change underneath the person holding it. And because the marker is a SET of ids rather than the
 * last one seen, going BACKWARDS — a rollback, a republish, or a note deleted from
 * `RELEASE_NOTES` — re-announces nothing, so a dismissal is final. See `lib/releaseNotesSeen.ts`.
 *
 * `loading` exists so the card cannot flash for one frame before the stored marker is known, and
 * so nothing can write a fresh list over one that has not been read yet.
 */
export function useReleaseNotes(): ReleaseNotesState {
  const latest = LATEST_RELEASE_NOTE;
  const [seenIds, setSeenIds] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    readSeenReleaseNoteIds()
      .then((stored) => {
        if (active) setSeenIds(stored);
      })
      // `readSeenReleaseNoteIds` already swallows its own failures; this keeps the hook's
      // contract even if that ever changes. Either way there is nothing to report: the card
      // simply shows.
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const acknowledge = useCallback(() => {
    const id = LATEST_RELEASE_NOTE?.id;
    if (!id) return;
    // The stored list has not been read yet, so writing now would replace every id in it with
    // this one. Refusing costs a repeated card (the fail-open direction); the alternative would
    // lose a dismissal. In practice this window is a few milliseconds and no card is on screen.
    if (loading) return;
    // Flip in memory first so the card disappears on the tap, then persist without awaiting:
    // the screen must never wait on storage, and a failed write only costs one repeat.
    setSeenIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    void markReleaseNoteSeen(id, seenIds);
  }, [loading, seenIds]);

  return {
    latest,
    loading,
    unseen: !loading && latest !== null && !seenIds.includes(latest.id),
    acknowledge,
  };
}

export default useReleaseNotes;
