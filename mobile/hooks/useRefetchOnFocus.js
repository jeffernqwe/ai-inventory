import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * Calls `reload` whenever this screen regains focus after being covered by a
 * pushed child route (create / edit / stock forms). Screens below a push stay
 * mounted in a native stack, so without this their data goes stale on
 * `router.back()`. The first focus (initial mount) is skipped — those screens
 * already load on mount — so there is no double fetch on first open.
 */
export default function useRefetchOnFocus(reload) {
  const skipFirst = useRef(true);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

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
