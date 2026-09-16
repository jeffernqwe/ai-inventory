import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Calls `reload` whenever this screen regains focus after being covered by a
 * pushed child route (create / edit / stock forms). Screens below a push stay
 * mounted in a native stack, so without this their data goes stale on
 * `router.back()`. The first focus (initial mount) is skipped — those screens
 * already load on mount — so there is no double fetch on first open.
 */
export default function useRefetchOnFocus(reload?: (() => void) | null): void {
  const skipFirst = useRef(true);
  const reloadRef = useRef(reload);

  // Keep the latest callback without re-subscribing the focus effect: callers
  // pass a fresh inline function on every render, so `useCallback` below must
  // keep an empty dependency list. Synchronizing on commit rather than during
  // render keeps the ref write out of the render path (a render React discards
  // would otherwise mutate a ref that never committed). This effect is declared
  // before `useFocusEffect`, so it flushes first in the same commit.
  useEffect(() => {
    reloadRef.current = reload;
  });

  useFocusEffect(
    useCallback(() => {
      if (skipFirst.current) {
        skipFirst.current = false;
        return;
      }
      reloadRef.current?.();
    }, [])
  );
}
