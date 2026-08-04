import { useCallback, useMemo, useRef, useState } from 'react';
import { View, ScrollView, RefreshControl, Pressable, Text } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { usePrivacy } from '~/context/PrivacyContext';
import { useSettings } from '~/context/SettingsContext';
import { usePortfolioHoldings, HOLDINGS_SUBTABS, effectiveValue } from './usePortfolioHoldings';
import type { HoldingsSubTab } from './usePortfolioHoldings';
import type { Holding } from '@/core/db/types';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { PageHeader, Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { AssetTaxNote } from '~/components/shared';
import type { AssetTaxTopic } from '@/core/tax/assetTaxInfo';
import { useThemeColors } from '~/theme/useThemeColors';
import { useRegisterHeaderScreen } from '~/navigation/HeaderBackContext';
import { EquitySection, type EquitySectionHandle } from './holdings/equity/EquitySection';
import { EquitySummaryCard } from './holdings/equity/EquitySummaryCard';
import { FixedIncomeSection } from './holdings/fixed-income/FixedIncomeSection';
import { PreciousMetalsSection } from './holdings/precious-metals/PreciousMetalsSection';
import { RealAssetsSection } from './holdings/real-assets/RealAssetsSection';
import { RetirementSection } from './holdings/retirement/RetirementSection';
import { IpoTab } from './ipo/IpoTab';
import { NewsView } from '~/features/news/NewsView';
import { MarketTicker } from './MarketTicker';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import type { SubTabRefreshState } from './SubTabRefreshState';

/**
 * 5 main asset-class tabs — 2026-08-01 Equity consolidation. `equity` is new (replaces the old
 * `Holdings`/`IPO` pair); the other 4 map 1:1 onto `HOLDINGS_SUBTABS`' own keys (minus `stocks`/`mf`,
 * which move under Equity's own sub-tabs below), so no separate label/icon/asset-class config needed
 * for them — `HOLDINGS_SUBTABS` stays the single source of truth, unchanged, still shared with
 * `EquitySection.tsx`.
 */
type PortfolioMainTab = 'equity' | Exclude<HoldingsSubTab, 'stocks' | 'mf'>;
type EquitySubTab = 'stocks' | 'mf' | 'ipo' | 'news';

const OTHER_MAIN_TABS = HOLDINGS_SUBTABS.filter(
  (t): t is typeof t & { key: Exclude<HoldingsSubTab, 'stocks' | 'mf'> } => t.key !== 'stocks' && t.key !== 'mf'
);

const EQUITY_SUBTABS: { key: EquitySubTab; label: string; icon: string }[] = [
  { key: 'stocks', label: 'Stocks', icon: 'ti-trending-up' },
  { key: 'mf', label: 'MF', icon: 'ti-chart-donut' },
  { key: 'ipo', label: 'IPO', icon: 'ti-ticket' },
  { key: 'news', label: 'News', icon: 'ti-news' }
];

/** Invested/current totals for `EquitySummaryCard` — scoped to just Stocks or just MF, distinct from
 *  `totalInvested`/`totalCurrent` (the whole-portfolio figure the page header's own subtitle shows).
 *  Pure function of its argument only (no component state), so it lives at module scope rather than
 *  needing a `useCallback` inside `PortfolioPage`. */
function equityTotals(list: Holding[]): { invested: number; current: number } {
  return {
    invested: list.reduce((s, h) => s + h.investedAmount, 0),
    current: list.reduce((s, h) => s + effectiveValue(h), 0)
  };
}

/** Which contextual tax note to show for the active tab/sub-tab. */
const TAX_TOPIC: Partial<Record<PortfolioMainTab | EquitySubTab, AssetTaxTopic>> = {
  stocks: 'equity',
  mf: 'equity',
  fixed_income: 'fd',
  precious_metals: 'gold',
  real_assets: 'property',
  retirement: 'retirement'
};

interface PortfolioRouteParams {
  mainTab?: PortfolioMainTab;
  equitySubTab?: EquitySubTab;
}

export function PortfolioPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();
  const equitySectionRef = useRef<EquitySectionHandle>(null);
  useRegisterHeaderScreen('Portfolio');
  const { mode, shouldMask } = usePrivacy();
  const { safeModeVisibility } = useSettings();
  const masked = shouldMask(!safeModeVisibility.portfolio);
  const {
    holdings,
    saveHolding,
    removeHolding,
    totalInvested,
    totalCurrent,
    hasLivePriceRefresh,
    refreshing,
    refreshPrices
  } = usePortfolioHoldings();

  // Deep-link hint from `GlanceHeader`'s net-worth breakdown (`navigation.navigate('Portfolio', {
  // mainTab, equitySubTab })`) — RN port of web's `location.state.holdingsSubTab`, found missing via the
  // 2026-07-25 parity sweep (mobile always landed on the default 'stocks' tab regardless of which asset
  // class was tapped). Param shape grew from a single flat `holdingsSubTab` to `{ mainTab, equitySubTab
  // }` with the 2026-08-01 Equity consolidation, since a tapped asset class now needs to say *which*
  // main tab to land on, and — only for stocks/MF — which Equity sub-tab too.
  const route = useRoute();
  const initialParams = route.params as PortfolioRouteParams | undefined;

  const [activeMainTab, setActiveMainTab] = useState<PortfolioMainTab>(initialParams?.mainTab ?? 'equity');
  const [equitySubTab, setEquitySubTab] = useState<EquitySubTab>(initialParams?.equitySubTab ?? 'stocks');
  // Collapsed by default (2026-08-01 density follow-up) — the full Invested/Current/Return/Return%
  // 2x2 grid ate space every tab needed below it; collapsed shows just Current Value + Return %, tap
  // the row to expand back to the full breakdown.
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  // IPO/News each report their own current refresh action here (only one is ever mounted at a time,
  // so both safely share this one slot) — see `SubTabRefreshState.ts`'s doc comment for why: one
  // consolidated header button for all of Equity's sub-tabs, found via your 2026-08-01 review, instead
  // of Stocks/MF/IPO/News each showing their own in a different place.
  const [subRefresh, setSubRefresh] = useState<SubTabRefreshState | null>(null);

  const overallReturn = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

  const holdingsFor = useCallback(
    (key: HoldingsSubTab) => {
      const cfg = HOLDINGS_SUBTABS.find((t) => t.key === key);
      return cfg ? holdings.filter((h) => cfg.assetClasses.includes(h.assetClass)) : [];
    },
    [holdings]
  );
  const stocksHoldings = useMemo(() => holdingsFor('stocks'), [holdingsFor]);
  const mfHoldings = useMemo(() => holdingsFor('mf'), [holdingsFor]);
  const stocksTotals = useMemo(() => equityTotals(stocksHoldings), [stocksHoldings]);
  const mfTotals = useMemo(() => equityTotals(mfHoldings), [mfHoldings]);

  const isEquityIpoOrNews = activeMainTab === 'equity' && (equitySubTab === 'ipo' || equitySubTab === 'news');
  const isPriceRefreshable = activeMainTab === 'equity' && (equitySubTab === 'stocks' || equitySubTab === 'mf');
  const taxTopic = TAX_TOPIC[activeMainTab === 'equity' ? equitySubTab : activeMainTab];

  // The one consolidated refresh action for Equity's Stocks/MF/IPO/News sub-tabs — 2026-08-01, moved out
  // of the page header entirely per your review ("not the right place"). Now surfaced two ways at once
  // (mockup A + B, both kept): a small icon button at the end of the Equity sub-tab row, and
  // pull-to-refresh (`RefreshControl`) on whichever scroll container is actually showing — the holdings
  // `ScrollView` below for Stocks/MF, `IpoTab`'s own `FlatList`, `NewsView`'s own `FlashList`/`ScrollView`.
  // `null` (both hidden) when there's nothing to refresh right now — no live-priced holdings, or
  // `subRefresh` itself is `null` (e.g. IPO's own "Listed" internal sub-tab).
  const equityRefresh =
    isPriceRefreshable && hasLivePriceRefresh
      ? { refresh: refreshPrices, refreshing, label: refreshing ? 'Fetching…' : 'Refresh prices' }
      : isEquityIpoOrNews && subRefresh
        ? {
            refresh: subRefresh.refresh,
            refreshing: subRefresh.refreshing,
            label: subRefresh.refreshing ? 'Refreshing…' : 'Refresh'
          }
        : null;

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader>
        {/* Whole-portfolio total — always shown regardless of active tab/sub-tab (including IPO/News,
            which used to hide it), since it's the grand total across every asset class, not scoped to
            whatever's currently on screen. Collapsed by default to just Current Value + Return %; tap
            the row to expand to the full Total Invested/Current Value/Return/Return % breakdown. */}
        {holdings.length > 0 && (
          <Pressable
            onPress={() => setSummaryExpanded((v) => !v)}
            accessibilityLabel={summaryExpanded ? 'Collapse portfolio summary' : 'Expand portfolio summary'}
            className="mt-2"
          >
            {summaryExpanded ? (
              <>
                <View className="flex-row justify-end">
                  <Icon name="ti-chevron-up" size={16} color={theme.textTertiary} />
                </View>
                <View className="flex-row gap-4 mt-1">
                  <View className="flex-1">
                    <Text className="text-[10px] font-semibold uppercase text-tertiary">Total Invested</Text>
                    <Text className="text-sm font-bold mt-0.5 text-primary">
                      {masked ? '••••' : formatCurrency(totalInvested)}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[10px] font-semibold uppercase text-tertiary">Current Value</Text>
                    <Text className="text-sm font-bold mt-0.5 text-primary">
                      {masked ? '••••' : formatCurrency(totalCurrent)}
                    </Text>
                  </View>
                </View>
                <View className="flex-row gap-4 mt-2">
                  <View className="flex-1">
                    <Text className="text-[10px] font-semibold uppercase text-tertiary">Return</Text>
                    <Text
                      className="text-sm font-bold mt-0.5"
                      style={{ color: overallReturn >= 0 ? theme.success : theme.danger }}
                    >
                      {masked
                        ? '••••'
                        : `${overallReturn >= 0 ? '+' : ''}${formatCurrency(totalCurrent - totalInvested)}`}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[10px] font-semibold uppercase text-tertiary">Return %</Text>
                    <Text
                      className="text-sm font-bold mt-0.5"
                      style={{ color: overallReturn >= 0 ? theme.success : theme.danger }}
                    >
                      {masked ? '••••' : `${overallReturn >= 0 ? '+' : ''}${formatPercent(overallReturn)}`}
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <View className="flex-row items-end gap-4">
                <View>
                  <Text className="text-[10px] font-semibold uppercase text-tertiary">Current Value</Text>
                  <Text className="text-lg font-bold mt-0.5 text-primary">
                    {masked ? '••••' : formatCurrency(totalCurrent)}
                  </Text>
                </View>
                <Text
                  className="text-sm font-extrabold mb-0.5"
                  style={{ color: overallReturn >= 0 ? theme.success : theme.danger }}
                >
                  {masked ? '••••' : `${overallReturn >= 0 ? '+' : ''}${formatPercent(overallReturn)}`}
                </Text>
                <View className="ml-auto">
                  <Icon name="ti-chevron-down" size={16} color={theme.textTertiary} />
                </View>
              </View>
            )}
          </Pressable>
        )}
      </PageHeader>

      {/* Market strip — 2026-08-01 consolidation: moved from Home, pinned here above the main tabs so
          it's visible regardless of which asset class is active (Sensex/Nifty/Gold aren't
          Equity-specific — this reads as portfolio-wide market context, not one asset class's own). */}
      <View className="px-4 pt-2.5">
        <MarketTicker />
      </View>

      {/* Main asset-class tabs. `flexGrow: 0` is load-bearing, not decorative — an unconstrained
          horizontal ScrollView as a flex child in this column layout stretches to fill all remaining
          vertical space instead of hugging its own content, pushing the sub-tab row/content below it
          down and leaving a large blank gap (the exact bug `TabStrip.tsx`'s `scrollable` mode had,
          found via the 2026-07-26 Expenses parity sweep — this hand-rolled tab row didn't inherit that
          fix since Portfolio has always built its own instead of using the shared `TabStrip`). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        className="border-b border-theme mt-1"
      >
        <View className="flex-row px-4">
          <Pressable
            onPress={() => setActiveMainTab('equity')}
            className="py-2.5 mr-5 border-b-2"
            style={{ borderColor: activeMainTab === 'equity' ? theme.primary : 'transparent' }}
          >
            <Text
              className="text-sm font-medium"
              style={{ color: activeMainTab === 'equity' ? theme.primary : theme.textSecondary }}
            >
              Equity
            </Text>
          </Pressable>
          {OTHER_MAIN_TABS.map((tab) => {
            const active = activeMainTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveMainTab(tab.key)}
                className="py-2.5 mr-5 border-b-2"
                style={{ borderColor: active ? theme.primary : 'transparent' }}
              >
                <Text className="text-sm font-medium" style={{ color: active ? theme.primary : theme.textSecondary }}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Equity's own sub-tabs — Stocks/MF/IPO/News, only shown when Equity is the active main tab.
          The small refresh icon at the end is mockup option B, kept alongside pull-to-refresh (option
          A, on whichever scroll container is showing below) rather than picking one — your call. */}
      {activeMainTab === 'equity' && (
        <View className="flex-row items-center px-4 gap-5 pt-2 pb-2 border-b border-theme">
          {EQUITY_SUBTABS.map((tab) => {
            const active = equitySubTab === tab.key;
            const color = active ? theme.primary : theme.textTertiary;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setEquitySubTab(tab.key)}
                className="flex-row items-center gap-1 pb-1.5 border-b-2"
                style={{ borderColor: active ? theme.primary : 'transparent' }}
              >
                <Icon name={tab.icon} size={13} color={color} />
                <Text className="text-xs font-medium" style={{ color }}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
          {equityRefresh && (
            <Pressable
              onPress={equityRefresh.refresh}
              disabled={equityRefresh.refreshing}
              accessibilityLabel={equityRefresh.label}
              className="ml-auto w-7 h-7 rounded-lg items-center justify-center bg-surface-2 border border-theme"
              style={{ opacity: equityRefresh.refreshing ? 0.5 : 1 }}
            >
              <Icon name="ti-refresh" size={14} color={theme.textSecondary} spin={equityRefresh.refreshing} />
            </Pressable>
          )}
        </View>
      )}

      {/* Contextual tax-awareness note for the active tab/sub-tab (none for Equity's own IPO/News) */}
      {taxTopic && (
        <View className="px-4 pt-3">
          <AssetTaxNote topic={taxTopic} />
        </View>
      )}

      {/*
       * IPO and News each own their own scrolling (IPO's card list is virtualized — see IpoTab.tsx;
       * News' aggregated feed uses FlashList — see NewsView.tsx) rather than being nested inside the
       * holdings ScrollView below — found unvirtualized in the 2026-07-26 parity sweep for IPO, and
       * NewsView carries the same lesson over now that it's embedded here too. Exactly one of the three
       * scroll containers below is ever mounted at a time.
       */}
      {activeMainTab === 'equity' && equitySubTab === 'ipo' ? (
        <IpoTab onRefreshStateChange={setSubRefresh} />
      ) : activeMainTab === 'equity' && equitySubTab === 'news' ? (
        <NewsView onRefreshStateChange={setSubRefresh} />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 96 }}
          refreshControl={
            equityRefresh ? (
              <RefreshControl
                refreshing={equityRefresh.refreshing}
                onRefresh={equityRefresh.refresh}
                tintColor={theme.primary}
              />
            ) : undefined
          }
        >
          <View className="px-4 pt-3">
            {activeMainTab === 'equity' && equitySubTab === 'stocks' && (
              <EquitySummaryCard invested={stocksTotals.invested} current={stocksTotals.current} masked={masked} />
            )}
            {activeMainTab === 'equity' && equitySubTab === 'mf' && (
              <EquitySummaryCard invested={mfTotals.invested} current={mfTotals.current} masked={masked} />
            )}
          </View>

          {activeMainTab === 'equity' && (equitySubTab === 'stocks' || equitySubTab === 'mf') && (
            <EquitySection
              ref={equitySectionRef}
              holdings={equitySubTab === 'stocks' ? stocksHoldings : mfHoldings}
              assetClass={equitySubTab === 'stocks' ? 'stock' : 'mf'}
              masked={masked}
              onSave={saveHolding}
              onRemove={removeHolding}
            />
          )}

          {activeMainTab === 'fixed_income' && (
            <FixedIncomeSection
              holdings={holdingsFor('fixed_income')}
              masked={masked}
              onSave={saveHolding}
              onRemove={removeHolding}
            />
          )}
          {activeMainTab === 'precious_metals' && (
            <PreciousMetalsSection
              holdings={holdingsFor('precious_metals')}
              masked={masked}
              onSave={saveHolding}
              onRemove={removeHolding}
            />
          )}
          {activeMainTab === 'retirement' && (
            <RetirementSection
              holdings={holdingsFor('retirement')}
              masked={masked}
              onSave={saveHolding}
              onRemove={removeHolding}
            />
          )}
          {activeMainTab === 'real_assets' && (
            <RealAssetsSection
              holdings={holdingsFor('real_assets')}
              mode={mode}
              masked={masked}
              onSave={saveHolding}
              onRemove={removeHolding}
            />
          )}
        </ScrollView>
      )}

      {/*
       * An always-visible FAB, reachable regardless of scroll position — matching the same pattern
       * Goals'/IOU's/Insurance's own sections correctly use. Previously a full-width "Add Stock/Add
       * Mutual Fund" button rendered as the last item inside the scrolling holdings list (so a long
       * holdings list required scrolling all the way down to add another one), flagged as a regression
       * in the 2026-07-26 parity sweep. Lives here, not inside `EquitySection` itself, since that
       * section is nested inside this page's `ScrollView` — an `absolute` element there would scroll
       * away with the content instead of staying fixed; `EquitySection`'s `openAdd()` imperative handle
       * bridges the tap back down to where the add-holding form state actually lives. Stocks/MF-only,
       * unchanged by the 2026-08-01 consolidation — confirmed not extending to the other 4 tabs.
       */}
      {activeMainTab === 'equity' && (equitySubTab === 'stocks' || equitySubTab === 'mf') && (
        <View className="absolute right-4" style={{ bottom: insets.bottom + 16 }}>
          <Button
            variant="primary"
            icon="ti-plus"
            accessibilityLabel="Add holding"
            className="w-14 h-14 rounded-full shadow-lg"
            onPress={() => equitySectionRef.current?.openAdd()}
          />
        </View>
      )}
    </SafeAreaView>
  );
}
