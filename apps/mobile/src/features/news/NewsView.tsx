import { useEffect, useState } from 'react';
import { View, Pressable, ScrollView, RefreshControl, Linking, ActivityIndicator, Text } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { NEWS_SOURCES } from '@/core/news/newsClient';
import type { NewsItem, NewsSourceId } from '@/core/news/newsTypes';
import type { SentimentLabel } from '@/core/sentiment';
import { Modal } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { useNews } from './useNews';
import { useNewsSentiment } from './useNewsSentiment';
import { useHoldingsInNews } from './useHoldingsInNews';
import { SentimentChip } from './SentimentChip';
import { NewsMoodNote } from './NewsMoodNote';
import { HoldingsInNews } from './HoldingsInNews';
import type { OnRefreshStateChange } from '~/features/portfolio/SubTabRefreshState';

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

interface FilterOption {
  value: string;
  label: string;
  /** Optional trailing count (e.g. how many headlines mention this stock). */
  count?: number;
}

const SOURCE_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'All' },
  { value: 'markets', label: 'Markets' },
  { value: 'regulatory', label: 'Regulatory' }
];

const TONE_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'All tones' },
  { value: 'positive', label: 'Positive' },
  { value: 'negative', label: 'Negative' }
];

/** One selectable section (Source/Tone/Holding) inside the combined Filters modal — same minimal pill
 *  style as the All News/Holdings News switch above the feed, rather than a checkmarked list. */
function FilterSection({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const theme = useThemeColors();
  return (
    <View>
      <Text className="text-[10px] font-semibold uppercase tracking-wide text-tertiary mb-2">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((opt) => {
          const sel = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              className="flex-row items-center gap-1.5 px-3.5 py-2 rounded-full"
              style={{ backgroundColor: sel ? theme.primary : theme.surfaceSecondary }}
            >
              <Text className="text-xs font-semibold" style={{ color: sel ? '#fff' : theme.textSecondary }}>
                {opt.label}
              </Text>
              {opt.count !== undefined && (
                <Text
                  className="text-[10px] font-bold"
                  style={{ color: sel ? '#fff' : theme.textTertiary, opacity: sel ? 0.85 : 1 }}
                >
                  {opt.count}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

interface TabFilters {
  source: SourceFilter;
  tone: ToneFilter;
}

const DEFAULT_FILTERS: TabFilters = { source: 'all', tone: 'all' };

/**
 * RN port of apps/web-react/src/features/news/NewsPage.tsx. Web's `<a target="_blank">` headline
 * cards become `Pressable` + `Linking.openURL`.
 *
 * **2026-08-01 Portfolio consolidation**: this is no longer its own routed screen — News moved from a
 * standalone Home tile into Portfolio's Equity tab as a sub-tab (see `PortfolioPage.tsx`), so this
 * component dropped its own `SafeAreaView`/background/header-back registration entirely; it now renders
 * as plain embedded content, inheriting the surrounding screen's safe-area and background the same way
 * `IpoTab.tsx` (Equity's other sub-tab) already does. Renamed `NewsPage` → `NewsView` to reflect that.
 * Its own refresh button moved into `PortfolioPage`'s header (one consolidated button for all of
 * Equity's sub-tabs instead of each having its own, found via your 2026-08-01 review) — reported up via
 * `onRefreshStateChange`.
 *
 * **2026-08-01 density pass**: the always-visible source line + `NewsMoodGauge` banner + 2-3 stacked
 * filter dropdown boxes left only ~2 cards visible on screen. Replaced with `NewsMoodNote` (a
 * collapsible one-liner, same visual language as `AssetTaxNote`, living as the first item of the
 * scrolling feed instead of fixed chrome) and one "Filters" icon that opens a combined modal for
 * Source/Tone/Holding instead of each field having its own popup.
 */
interface NewsViewProps {
  onRefreshStateChange?: OnRefreshStateChange;
}

export function NewsView({ onRefreshStateChange }: NewsViewProps) {
  const theme = useThemeColors();
  const { items, loading, error, refresh } = useNews();
  const { scoredById, mood } = useNewsSentiment(items);
  // Each tab keeps its own Source/Tone selection — switching tabs shows that tab's own last filter
  // (not the other tab's), and switching back restores whatever was previously chosen there.
  const [allFilters, setAllFilters] = useState<TabFilters>(DEFAULT_FILTERS);
  const [holdingsFilters, setHoldingsFilters] = useState<TabFilters>(DEFAULT_FILTERS);
  const [tab, setTab] = useState<NewsTab>('all');
  const [holding, setHolding] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // `useNews` has no separate "refreshing" flag distinct from its initial-load `loading` — reused as-is
  // for the header button's spinner/disabled state, same meaning either way (a fetch is in flight).
  useEffect(() => {
    onRefreshStateChange?.({ refresh, refreshing: loading });
  }, [refresh, loading, onRefreshStateChange]);
  useEffect(() => {
    return () => onRefreshStateChange?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const holdingOptionsList: FilterOption[] = [
    { value: 'all', label: 'All' },
    ...holdingOptions.map((h) => ({ value: h.symbol, label: h.symbol, count: h.count }))
  ];

  // A single icon button replaces the old 2-3 stacked filter dropdown boxes — opens one combined
  // Filters modal (Source + Tone always, Holding only on the Holdings News tab) instead of each field
  // having its own popup, freeing up the vertical space they used to take above the feed.
  const filterButton = (
    <Pressable
      onPress={() => setFiltersOpen(true)}
      accessibilityLabel="Filters"
      className="w-7 h-7 rounded-lg items-center justify-center bg-surface-2 border border-theme"
    >
      <Icon name="ti-filter" size={14} color={theme.textSecondary} />
    </Pressable>
  );

  return (
    <View className="flex-1">
      {/* All News / Holdings News + Filters — a compact pill switch rather than an underlined tab row
          (2026-08-01 density follow-up): with Equity's own main tabs + Stocks/MF/IPO/News sub-tabs
          already stacked above this, a 3rd underlined tab row read as one tab layer too many. Built
          locally rather than reusing the shared `SegmentedControl` — that component's options are
          `flex-1` (equal-width, meant to fill its container edge-to-edge, which pushed the filter
          button off-screen here); this one hugs its own label width instead, leaving room for the
          filter button beside it. The switch itself is conditional (only shown once we know the user
          owns stocks with news to show); the filter button is always available once there's something
          to filter. Source attribution + mood moved into `NewsMoodNote`, the first item of the
          scrolling feed below, instead of living here as fixed chrome. */}
      {items.length > 0 && (
        <View className="flex-row items-center gap-2 px-4 py-2.5 border-b border-theme">
          {showHoldingsTab && (
            <View className="flex-row bg-surface-2 rounded-full p-1">
              <Pressable
                onPress={() => setTab('all')}
                className="px-3.5 py-1.5 rounded-full"
                style={{ backgroundColor: activeTab === 'all' ? theme.primary : 'transparent' }}
              >
                <Text
                  className="text-xs font-bold"
                  style={{ color: activeTab === 'all' ? '#fff' : theme.textTertiary }}
                >
                  All News
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setTab('holdings')}
                className="flex-row items-center gap-1 px-3.5 py-1.5 rounded-full"
                style={{ backgroundColor: activeTab === 'holdings' ? theme.primary : 'transparent' }}
              >
                <Text
                  className="text-xs font-bold"
                  style={{ color: activeTab === 'holdings' ? '#fff' : theme.textTertiary }}
                >
                  Holdings
                </Text>
                {holdingMatches.length > 0 && (
                  <Text
                    className="text-[10px] font-bold"
                    style={{ color: activeTab === 'holdings' ? '#fff' : theme.textTertiary, opacity: 0.85 }}
                  >
                    {holdingMatches.length}
                  </Text>
                )}
              </Pressable>
            </View>
          )}
          <View className="ml-auto">{filterButton}</View>
        </View>
      )}

      {/* Content */}
      {loading && items.length === 0 && (
        <View className="items-center justify-center gap-3 pt-16 px-4">
          <ActivityIndicator size="large" color={theme.textTertiary} />
          <Text className="text-sm text-tertiary">Fetching latest headlines…</Text>
        </View>
      )}

      {error && items.length === 0 && (
        <View className="items-center justify-center gap-3 pt-16 px-6">
          <Icon name="ti-wifi-off" size={36} color={theme.textTertiary} />
          <Text className="text-sm font-medium text-primary">Couldn't load news</Text>
          <Text className="text-xs text-tertiary">{error}</Text>
          <Pressable onPress={refresh} className="mt-2 px-5 py-2 rounded-xl border border-theme">
            <Text className="text-sm font-medium text-secondary">Try again</Text>
          </Pressable>
        </View>
      )}

      {!error &&
        items.length > 0 &&
        (activeTab === 'holdings' ? (
          // Holdings News is naturally bounded (only headlines matching stocks the user owns) — not the
          // aggregated 80-150+ item feed the 2026-07-26 parity sweep flagged, so a plain ScrollView is fine.
          <ScrollView
            className="flex-1"
            refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={theme.primary} />}
          >
            <View className="px-4 pt-3 pb-6">
              <NewsMoodNote mood={mood} />
              <HoldingsInNews matches={filteredHoldingMatches} scoredById={scoredById} />
            </View>
          </ScrollView>
        ) : (
          // The aggregated "All News" feed (80-150+ items across 4 sources) is the one flagged as an
          // unvirtualized risk. FlashList (not FlatList/ScrollView+.map()) recycles row instances instead
          // of destroying/remounting them on scroll — see TransactionsTab.tsx for the full diagnosis of
          // why that distinction actually matters at this scale.
          <FlashList
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}
            data={visible}
            keyExtractor={(item: NewsItem) => item.id}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            ListHeaderComponent={<NewsMoodNote mood={mood} />}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={theme.primary} />}
            ListEmptyComponent={
              <View className="items-center justify-center gap-3 pt-10">
                <Icon name="ti-news-off" size={36} color={theme.textTertiary} />
                <Text className="text-sm text-tertiary">No headlines for this filter</Text>
              </View>
            }
            renderItem={({ item }) => {
              const src = SOURCE_MAP[item.sourceId];
              const scored = scoredById.get(item.id);
              return (
                <Pressable
                  onPress={() => void Linking.openURL(item.link)}
                  className="bg-surface border border-theme rounded-2xl p-4 gap-2 active:opacity-70"
                >
                  {/* Source chip + sentiment + time */}
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="flex-row items-center gap-1.5 flex-1">
                      <Text
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: tint(src?.color ?? '#6b7280'), color: src?.color ?? '#6b7280' }}
                      >
                        {src?.label ?? item.sourceId}
                      </Text>
                      {scored && <SentimentChip label={scored.label} />}
                    </View>
                    <Text className="text-[10px] text-tertiary">{relativeTime(item.publishedAt)}</Text>
                  </View>

                  {/* Title */}
                  <Text className="text-sm font-medium text-primary leading-snug" numberOfLines={2}>
                    {item.title}
                  </Text>

                  {/* Summary */}
                  {item.summary && (
                    <Text className="text-xs text-secondary leading-relaxed" numberOfLines={2}>
                      {item.summary}
                    </Text>
                  )}

                  {/* Read more indicator */}
                  <View className="flex-row items-center gap-1 mt-0.5">
                    <Text className="text-[10px] font-medium" style={{ color: theme.primary }}>
                      Read full story
                    </Text>
                    <Icon name="ti-arrow-up-right" size={11} color={theme.primary} />
                  </View>
                </Pressable>
              );
            }}
          />
        ))}

      {filtersOpen && (
        <Modal title="Filters" onClose={() => setFiltersOpen(false)} scrollable>
          <View className="gap-5">
            <FilterSection
              label="Source"
              options={SOURCE_OPTIONS}
              value={activeFilters.source}
              onChange={(v) => setActiveFilters((f) => ({ ...f, source: v as SourceFilter }))}
            />
            <FilterSection
              label="Tone"
              options={TONE_OPTIONS}
              value={activeFilters.tone}
              onChange={(v) => setActiveFilters((f) => ({ ...f, tone: v as ToneFilter }))}
            />
            {activeTab === 'holdings' && (
              <FilterSection label="Holding" options={holdingOptionsList} value={holding} onChange={setHolding} />
            )}
          </View>
        </Modal>
      )}
    </View>
  );
}
