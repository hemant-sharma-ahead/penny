import { useCallback, useEffect, useState } from 'react';
import { clearNewsCache, fetchAllNews, NEWS_SOURCES } from '@/core/news/newsClient';
import type { NewsItem } from '@/core/news/newsTypes';

const ALL_IDS = NEWS_SOURCES.map((s) => s.id);

interface UseNewsResult {
  items: NewsItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** RN port of apps/web-legacy/src/features/news/useNews.ts — unchanged logic; `@/core/news/newsClient`
 *  resolves to its `.native.ts` sibling (in-memory cache instead of `localStorage`, regex-based RSS
 *  parsing instead of `DOMParser`) automatically via Metro's platform-extension resolution. */
export function useNews(): UseNewsResult {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // setState only inside .then()/.catch() — mirrors useIpos pattern
  const load = useCallback((bustCache: boolean) => {
    let cancelled = false;
    if (bustCache) clearNewsCache();
    fetchAllNews(ALL_IDS)
      .then((data) => {
        if (cancelled) return;
        setItems(data);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load news');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(false), [load]);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    load(true);
  }, [load]);

  return { items, loading, error, refresh };
}
