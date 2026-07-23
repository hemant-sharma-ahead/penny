import { useState } from 'react';
import { NEWS_SOURCES } from '@/core/news/newsClient';
import type { NewsSourceId } from '@/core/news/newsTypes';
import type { SentimentLabel } from '@/core/sentiment';
import { TabStrip } from '@/components/ui';
import { useNews } from './useNews';
import { useNewsSentiment } from './useNewsSentiment';
import { useHoldingsInNews } from './useHoldingsInNews';
import { SentimentChip } from './SentimentChip';
import { NewsMoodGauge } from './NewsMoodGauge';
import { HoldingsInNews } from './HoldingsInNews';
import { FilterDropdown, type FilterDropdownOption } from './FilterDropdown';

type SourceFilter = 'all' | 'markets' | 'regulatory';
type ToneFilter = 'all' | SentimentLabel;
type NewsTab = 'all' | 'holdings';

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

const SOURCE_OPTIONS: FilterDropdownOption[] = [
  { value: 'all', label: 'All' },
  { value: 'markets', label: 'Markets' },
  { value: 'regulatory', label: 'Regulatory' }
];

const TONE_OPTIONS: FilterDropdownOption[] = [
  { value: 'all', label: 'All tones' },
  { value: 'positive', label: 'Positive' },
  { value: 'negative', label: 'Negative' }
];

interface TabFilters {
  source: SourceFilter;
  tone: ToneFilter;
}

const DEFAULT_FILTERS: TabFilters = { source: 'all', tone: 'all' };

export function NewsPage() {
  const { items, loading, error, refresh } = useNews();
  const { scoredById, mood } = useNewsSentiment(items);
  // Each tab keeps its own Source/Tone selection — switching tabs shows that tab's own last filter
  // (not the other tab's), and switching back restores whatever was previously chosen there.
  const [allFilters, setAllFilters] = useState<TabFilters>(DEFAULT_FILTERS);
  const [holdingsFilters, setHoldingsFilters] = useState<TabFilters>(DEFAULT_FILTERS);
  const [tab, setTab] = useState<NewsTab>('all');
  const [holding, setHolding] = useState('all');

  function filterItems(f: TabFilters) {
    return items.filter((item) => {
      if (f.source !== 'all' && SOURCE_MAP[item.sourceId]?.category !== f.source) return false;
      if (f.tone !== 'all' && scoredById.get(item.id)?.label !== f.tone) return false;
      return true;
    });
  }

  const visible = filterItems(allFilters);
  const holdingsVisible = filterItems(holdingsFilters);

  const {
    matches: holdingMatches,
    holdingOptions,
    hasStocks,
    loading: holdingsLoading
  } = useHoldingsInNews(holdingsVisible);
  const showHoldingsTab = !holdingsLoading && hasStocks;
  const activeTab: NewsTab = showHoldingsTab ? tab : 'all';
  const filteredHoldingMatches =
    holding === 'all' ? holdingMatches : holdingMatches.filter((m) => m.holdings.some((h) => h.symbol === holding));

  const activeFilters = activeTab === 'holdings' ? holdingsFilters : allFilters;
  const setActiveFilters = activeTab === 'holdings' ? setHoldingsFilters : setAllFilters;

  const holdingOptionsList: FilterDropdownOption[] = [
    { value: 'all', label: 'All' },
    ...holdingOptions.map((h) => ({ value: h.symbol, label: h.symbol, count: h.count }))
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between flex-shrink-0">
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

      {/* News-mood banner — fixed, not part of the scrolling feed, reflects all fetched headlines */}
      {!error && items.length > 0 && <NewsMoodGauge mood={mood} />}

      {/* All News / Holdings News — only shown once we know the user owns stocks with news to show */}
      {showHoldingsTab && (
        <TabStrip
          options={[
            { value: 'all', label: 'All News' },
            { value: 'holdings', label: 'Holdings News', count: holdingMatches.length }
          ]}
          value={activeTab}
          onChange={setTab}
        />
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
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

        {!error && items.length > 0 && (
          <>
            {/* Filter dropdowns — Source + Tone always; Holding only on the Holdings News tab */}
            <div className="flex gap-2 mb-3">
              <FilterDropdown
                label="Source"
                value={activeFilters.source}
                options={SOURCE_OPTIONS}
                onChange={(v) => setActiveFilters((f) => ({ ...f, source: v as SourceFilter }))}
              />
              <FilterDropdown
                label="Tone"
                value={activeFilters.tone}
                options={TONE_OPTIONS}
                onChange={(v) => setActiveFilters((f) => ({ ...f, tone: v as ToneFilter }))}
              />
              {activeTab === 'holdings' && (
                <FilterDropdown label="Holding" value={holding} options={holdingOptionsList} onChange={setHolding} />
              )}
            </div>

            {activeTab === 'holdings' ? (
              <HoldingsInNews matches={filteredHoldingMatches} scoredById={scoredById} />
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 pt-10 text-center">
                <i className="ti ti-news-off text-tertiary" style={{ fontSize: 36 }} aria-hidden="true" />
                <p className="text-sm text-tertiary">No headlines for this filter</p>
              </div>
            ) : (
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
                        <span className="text-[10px] text-tertiary flex-shrink-0">
                          {relativeTime(item.publishedAt)}
                        </span>
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
          </>
        )}
      </div>
    </div>
  );
}
