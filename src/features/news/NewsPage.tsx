import { useState } from 'react';
import { NEWS_SOURCES } from '@/core/news/newsClient';
import type { NewsSourceId } from '@/core/news/newsTypes';
import type { SentimentLabel } from '@/core/sentiment';
import { useNews } from './useNews';
import { useNewsSentiment } from './useNewsSentiment';
import { SentimentChip } from './SentimentChip';
import { NewsMoodGauge } from './NewsMoodGauge';

type FilterId = 'all' | 'markets' | 'regulatory';
type SentimentFilter = 'all' | SentimentLabel;

function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const SOURCE_MAP = Object.fromEntries(NEWS_SOURCES.map((s) => [s.id, s])) as Record<
  NewsSourceId,
  (typeof NEWS_SOURCES)[0]
>;

const FILTER_CHIPS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'markets', label: 'Markets' },
  { id: 'regulatory', label: 'Regulatory' }
];

const SENTIMENT_CHIPS: { id: SentimentFilter; label: string; icon?: string }[] = [
  { id: 'all', label: 'All tones' },
  { id: 'positive', label: 'Positive', icon: 'ti-trending-up' },
  { id: 'negative', label: 'Negative', icon: 'ti-trending-down' }
];

export function NewsPage() {
  const { items, loading, error, refresh } = useNews();
  const { scoredById, mood } = useNewsSentiment(items);
  const [filter, setFilter] = useState<FilterId>('all');
  const [sentiment, setSentiment] = useState<SentimentFilter>('all');

  const visible = items.filter((item) => {
    if (filter !== 'all' && SOURCE_MAP[item.sourceId]?.category !== filter) return false;
    if (sentiment !== 'all' && scoredById.get(item.id)?.label !== sentiment) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-primary">Finance News</h1>
          <p className="text-xs text-tertiary mt-0.5">ET Markets · Mint · RBI · SEBI</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-surface-2 border border-theme active:opacity-70 disabled:opacity-40 transition-opacity"
          aria-label="Refresh news"
        >
          <i
            className={`ti ti-refresh text-secondary ${loading ? 'animate-spin' : ''}`}
            style={{ fontSize: 18 }}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Source-category filter */}
      <div className="flex gap-2 px-4 pb-2 overflow-x-auto">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.id}
            onClick={() => setFilter(chip.id)}
            className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors"
            style={
              filter === chip.id
                ? { backgroundColor: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
            }
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Sentiment (news-tone) filter */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
        {SENTIMENT_CHIPS.map((chip) => (
          <button
            key={chip.id}
            onClick={() => setSentiment(chip.id)}
            className="flex-shrink-0 inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors"
            style={
              sentiment === chip.id
                ? { backgroundColor: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
            }
          >
            {chip.icon && <i className={`ti ${chip.icon}`} style={{ fontSize: 13 }} aria-hidden="true" />}
            {chip.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 pt-16 text-center">
            <i className="ti ti-loader-2 animate-spin text-tertiary" style={{ fontSize: 32 }} aria-hidden="true" />
            <p className="text-sm text-tertiary">Fetching latest headlines…</p>
          </div>
        )}

        {error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 pt-16 text-center px-6">
            <i className="ti ti-wifi-off text-tertiary" style={{ fontSize: 36 }} aria-hidden="true" />
            <p className="text-sm font-medium text-primary">Couldn't load news</p>
            <p className="text-xs text-tertiary">{error}</p>
            <button
              onClick={refresh}
              className="mt-2 px-5 py-2 rounded-xl text-sm font-medium border border-theme text-secondary active:opacity-70"
            >
              Try again
            </button>
          </div>
        )}

        {/* News-mood gauge — reflects all fetched headlines (not the filtered subset) */}
        {!error && items.length > 0 && (
          <div className="mb-3">
            <NewsMoodGauge mood={mood} />
          </div>
        )}

        {!loading && !error && visible.length === 0 && items.length > 0 && (
          <div className="flex flex-col items-center justify-center gap-3 pt-10 text-center">
            <i className="ti ti-news-off text-tertiary" style={{ fontSize: 36 }} aria-hidden="true" />
            <p className="text-sm text-tertiary">No headlines for this filter</p>
          </div>
        )}

        {visible.length > 0 && (
          <div className="flex flex-col gap-2">
            {visible.map((item) => {
              const src = SOURCE_MAP[item.sourceId];
              const scored = scoredById.get(item.id);
              return (
                <a
                  key={item.id}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="surface rounded-2xl p-4 flex flex-col gap-2 active:opacity-70 transition-opacity no-underline"
                >
                  {/* Source chip + sentiment + time */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: `${src?.color ?? '#6b7280'}1a`, color: src?.color ?? '#6b7280' }}
                      >
                        {src?.label ?? item.sourceId}
                      </span>
                      {scored && <SentimentChip label={scored.label} />}
                    </div>
                    <span className="text-[10px] text-tertiary flex-shrink-0">{relativeTime(item.publishedAt)}</span>
                  </div>

                  {/* Title */}
                  <p className="text-sm font-medium text-primary leading-snug line-clamp-2">{item.title}</p>

                  {/* Summary */}
                  {item.summary && (
                    <p className="text-xs text-secondary leading-relaxed line-clamp-2">{item.summary}</p>
                  )}

                  {/* Read more indicator */}
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[10px] font-medium" style={{ color: 'var(--color-primary)' }}>
                      Read full story
                    </span>
                    <i
                      className="ti ti-arrow-up-right"
                      style={{ fontSize: 11, color: 'var(--color-primary)' }}
                      aria-hidden="true"
                    />
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
