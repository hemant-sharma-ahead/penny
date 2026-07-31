import { useCallback, useEffect, useState } from 'react';
import { fetchIpos, getCachedIpos } from './ipoClient';
import type { IpoItem } from './ipoTypes';

export interface UseIposResult {
  upcoming: IpoItem[];
  open: IpoItem[];
  closed: IpoItem[];
  listed: IpoItem[];
  all: IpoItem[];
  loading: boolean;
  refreshing: boolean;
  lastUpdated: number | null;
  refresh: () => void;
}

export function useIpos(): UseIposResult {
  const [all, setAll] = useState<IpoItem[]>(() => getCachedIpos()?.data ?? []);
  const [loading, setLoading] = useState(() => getCachedIpos() === null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(() => getCachedIpos()?.fetchedAt ?? null);

  // Non-async — setState only in .then()/.catch(), mirrors useRepository pattern.
  // Returns a cleanup that cancels the in-flight fetch on unmount.
  const load = useCallback((force: boolean) => {
    let cancelled = false;
    fetchIpos(force)
      .then((data) => {
        if (cancelled) return;
        setAll(data);
        setLastUpdated(Date.now());
        setLoading(false);
        setRefreshing(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(false), [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  return {
    upcoming: all.filter((i) => i.status === 'upcoming'),
    open: all.filter((i) => i.status === 'open'),
    closed: all.filter((i) => i.status === 'closed'),
    listed: all.filter((i) => i.status === 'listed'),
    all,
    loading,
    refreshing,
    lastUpdated,
    refresh
  };
}
