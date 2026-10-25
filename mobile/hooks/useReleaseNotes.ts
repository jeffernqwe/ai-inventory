import { useCallback, useEffect, useState } from 'react';

import { LATEST_RELEASE_NOTE } from '../lib/releaseNotes';
import type { ReleaseNote } from '../lib/releaseNotes';
import { markReleaseNotesSeen, readSeenReleaseNoteId } from '../lib/releaseNotesSeen';

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
 * The rule is one comparison, and it is deliberately the simple one. `seenId !== latest.id`
 * means a note announces itself once and never again; publishing a bundle with no new note
 * announces nothing; and a device that has never stored anything is shown the newest note — which
 * is exactly right for a build that arrives by over-the-air update, because the app really did
 * just change underneath the person holding it.
 *
 * `loading` exists so the card cannot flash for one frame before the stored marker is known.
 */
export function useReleaseNotes(): ReleaseNotesState {
  const latest = LATEST_RELEASE_NOTE;
  const [seenId, setSeenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    readSeenReleaseNoteId()
      .then((stored) => {
        if (active) setSeenId(stored);
      })
      // `readSeenReleaseNoteId` already swallows its own failures; this keeps the hook's
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
    // Flip in memory first so the card disappears on the tap, then persist without awaiting:
    // the screen must never wait on storage, and a failed write only costs one repeat.
    setSeenId(id);
    void markReleaseNotesSeen(id);
  }, []);

  return {
    latest,
    loading,
    unseen: !loading && latest !== null && seenId !== latest.id,
    acknowledge,
  };
}

export default useReleaseNotes;
