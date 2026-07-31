import { useMemo } from 'react';
import { scoreHeadline, computeMood } from '@/core/sentiment';
import type { ScoredHeadline, MoodSummary } from '@/core/sentiment';
import type { NewsItem } from '@/core/news/newsTypes';

interface UseNewsSentimentResult {
  /** headline id → scored result (memoized over the item set). */
  scoredById: Map<string, ScoredHeadline>;
  /** Descriptive "news mood" over the given items. Informational only — not a forecast. */
  mood: MoodSummary;
}

/**
 * Score the (already-fetched) headlines on-device. Pure + memoized: no network, no AI.
 * Scores the title only in Phase A. See docs/MARKET_SENTIMENT_RESEARCH.md.
 */
export function useNewsSentiment(items: NewsItem[]): UseNewsSentimentResult {
  return useMemo(() => {
    const scoredById = new Map<string, ScoredHeadline>();
    const scored: ScoredHeadline[] = [];
    for (const item of items) {
      const s = scoreHeadline(item.title);
      scoredById.set(item.id, s);
      scored.push(s);
    }
    return { scoredById, mood: computeMood(scored) };
  }, [items]);
}
