import { useCallback, useEffect, useRef, useState } from 'react';
import { isSessionError } from '../lib/auth';

/**
 * Paginated-list hook shared by every list screen.
 *
 * `fetcher(page, limit)` must return a pagination envelope
 * `{ items, total }` (as the backend sends). The list reloads automatically
 * whenever the serialized `params` change (search text, filters, paging size).
 *
 * Sessions that expire mid-session surface through `onSessionError`, which
 * screens wire to `signOut` so the app returns to login.
 */
export default function usePagedList(fetcher, { params = {}, limit = 20, onSessionError } = {}) {
  const paramsKey = JSON.stringify(params ?? {});
  const fetcherRef = useRef(fetcher);
  const onSessionErrorRef = useRef(onSessionError);
  const runRef = useRef(0);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Keep latest closures without re-triggering effects.
  fetcherRef.current = fetcher;
  onSessionErrorRef.current = onSessionError;

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const fetchPage = useCallback(
    async (target, { more = false, refresh = false } = {}) => {
      const id = ++runRef.current;
      if (more) setLoadingMore(true);
      else if (refresh) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await fetcherRef.current(target, limit);
        if (id !== runRef.current) return; // superseded by a newer request
        const next = res?.items ?? [];
        setItems((prev) => (target === 1 ? next : [...prev, ...next]));
        setTotal(res?.total ?? 0);
        setPage(target);
        setError(null);
      } catch (err) {
        if (id !== runRef.current) return;
        setError(err);
        if (target === 1) setItems([]);
        if (isSessionError(err)) onSessionErrorRef.current?.();
      } finally {
        if (id === runRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [limit]
  );

  // First load + automatic reload when filters change.
  useEffect(() => {
    fetchPage(1);
    return () => {
      runRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, limit]);

  const reload = useCallback(() => fetchPage(1), [fetchPage]);
  const refresh = useCallback(() => fetchPage(1, { refresh: true }), [fetchPage]);
  const loadMore = useCallback(() => {
    if (loading || loadingMore || refreshing || page >= totalPages) return;
    fetchPage(page + 1, { more: true });
  }, [loading, loadingMore, refreshing, page, totalPages, fetchPage]);

  return { items, total, totalPages, page, loading, refreshing, loadingMore, error, reload, refresh, loadMore };
}
