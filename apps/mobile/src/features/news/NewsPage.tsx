import { useState } from 'react';
import { View, Text, Pressable, ScrollView, Linking, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NEWS_SOURCES } from '@/core/news/newsClient';
import type { NewsSourceId } from '@/core/news/newsTypes';
import type { SentimentLabel } from '@/core/sentiment';
import { TabStrip } from '~/components/ui';
import { BackButton } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { useNews } from './useNews';
import { useNewsSentiment } from './useNewsSentiment';
import { useHoldingsInNews } from './useHoldingsInNews';
import { SentimentChip } from './SentimentChip';
import { NewsMoodGauge } from './NewsMoodGauge';
import { HoldingsInNews } from './HoldingsInNews';
import { FilterDropdown, type FilterDropdownOption } from './FilterDropdown';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';

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

/**
 * RN port of apps/web-legacy/src/features/news/NewsPage.tsx. Web's `<a target="_blank">` headline
 * cards become `Pressable` + `Linking.openURL`. Web relies on `AppShell`'s persistent chrome for back
 * navigation (this page has no back button of its own); mobile adds one inline, same convention as
 * every other pushed screen in `MainNavigator.tsx`.
 */
export function NewsPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
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
    <SafeAreaView edges={['top']} className="flex-1" style={{ backgroundColor: modeBg }}>
      {/* Header */}
      <View className="px-4 pt-4 pb-2 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <BackButton />
          <View>
            <Text className="text-lg font-semibold text-primary">Finance News</Text>
            <Text className="text-xs text-tertiary mt-0.5">ET Markets · Mint · RBI · SEBI</Text>
          </View>
        </View>
        <Pressable
          onPress={refresh}
          disabled={loading}
          accessibilityLabel="Refresh news"
          className="w-9 h-9 rounded-xl items-center justify-center bg-surface-2 border border-theme"
          style={loading ? { opacity: 0.4 } : undefined}
        >
          {loading ? (
            <ActivityIndicator size="small" color={theme.textSecondary} />
          ) : (
            <Icon name="ti-refresh" size={18} color={theme.textSecondary} />
          )}
        </Pressable>
      </View>

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
      <ScrollView className="flex-1">
        <View className="px-4 pt-3 pb-6">
          {loading && items.length === 0 && (
            <View className="items-center justify-center gap-3 pt-16">
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

          {!error && items.length > 0 && (
            <>
              {/* Filter dropdowns — Source + Tone always; Holding only on the Holdings News tab */}
              <View className="flex-row gap-2 mb-3">
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
              </View>

              {activeTab === 'holdings' ? (
                <HoldingsInNews matches={filteredHoldingMatches} scoredById={scoredById} />
              ) : visible.length === 0 ? (
                <View className="items-center justify-center gap-3 pt-10">
                  <Icon name="ti-news-off" size={36} color={theme.textTertiary} />
                  <Text className="text-sm text-tertiary">No headlines for this filter</Text>
                </View>
              ) : (
                <View className="gap-2">
                  {visible.map((item) => {
                    const src = SOURCE_MAP[item.sourceId];
                    const scored = scoredById.get(item.id);
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => void Linking.openURL(item.link)}
                        className="bg-surface rounded-2xl p-4 gap-2 active:opacity-70"
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
                  })}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
