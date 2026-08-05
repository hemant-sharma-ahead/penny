import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, FlatList, RefreshControl, View, Text } from 'react-native';
import { useThemeColors } from '~/theme/useThemeColors';
import { Card, EmptyState, SearchInput, SegmentedControl } from '~/components/ui';
import { useIpos } from '@/core/ipo/useIpos';
import { fetchHistoricalListedIpos } from '@/core/ipo/ipoClient';
import type { IpoItem, IpoStatus } from '@/core/ipo/ipoTypes';
import {
  IPO_SUBTAB_ORDER,
  IPO_SUBTAB_META,
  formatLastUpdated,
  formatIpoDate,
  currentFyLabel,
  daysUntil
} from './ipoHelpers';
import { IpoDetailModal } from './IpoDetailModal';
import { tint } from '~/lib/color';
import type { OnRefreshStateChange } from '../SubTabRefreshState';

interface SubTabPillProps {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}

function SubTabPill({ label, count, active, onPress }: SubTabPillProps) {
  const theme = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-1 px-2.5 py-1 rounded-full"
      style={{ backgroundColor: active ? theme.primary : theme.surfaceSecondary }}
    >
      <Text className="text-xs font-medium" style={{ color: active ? '#fff' : theme.textSecondary }}>
        {label}
      </Text>
      {count > 0 && (
        <View
          className="w-4 h-4 rounded-full items-center justify-center"
          style={{ backgroundColor: active ? 'rgba(255,255,255,0.25)' : theme.surfaceTertiary }}
        >
          <Text className="text-[10px] font-bold leading-none" style={{ color: active ? '#fff' : theme.textTertiary }}>
            {count > 9 ? '9+' : count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// IPO tab: upcoming/open/closed/listed sub-tabs with GMP, subscription and a
// detail modal. Fully self-contained — owns its own data fetching and state.
interface IpoTabProps {
  /** Reports this tab's current refresh action up to `PortfolioPage`'s single header button — see
   *  `SubTabRefreshState.ts`. `null` while on the "Listed" internal sub-tab, which has nothing live to
   *  refresh (matches this tab's own previous behavior of hiding its refresh button there). */
  onRefreshStateChange?: OnRefreshStateChange;
}

export function IpoTab({ onRefreshStateChange }: IpoTabProps) {
  const theme = useThemeColors();
  const [ipoSubTab, setIpoSubTab] = useState<IpoStatus>('upcoming');
  const [ipoShowMainboardOnly, setIpoShowMainboardOnly] = useState(false);
  const [ipoListedFy, setIpoListedFy] = useState<string>(currentFyLabel());
  const [ipoListedSearch, setIpoListedSearch] = useState('');
  const [historicalListedIpos, setHistoricalListedIpos] = useState<IpoItem[]>([]);
  const [historicalLoadedFy, setHistoricalLoadedFy] = useState<string | null>(null);
  const [selectedIpo, setSelectedIpo] = useState<IpoItem | null>(null);
  const ipos = useIpos();

  useEffect(() => {
    if (ipoSubTab === 'listed') {
      onRefreshStateChange?.(null);
      return;
    }
    onRefreshStateChange?.({ refresh: ipos.refresh, refreshing: ipos.refreshing });
  }, [ipoSubTab, ipos.refresh, ipos.refreshing, onRefreshStateChange]);

  // Clear this tab's contributed refresh state on unmount (switching away to a different Equity
  // sub-tab) — otherwise the header would keep calling a stale handler for a tab no longer on screen.
  useEffect(() => {
    return () => onRefreshStateChange?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ipoSubTab !== 'listed') return;
    const fyStart = parseInt(ipoListedFy.match(/\d{4}/)?.[0] ?? '0', 10);
    if (!fyStart) return;
    let cancelled = false;
    fetchHistoricalListedIpos(fyStart)
      .then((items) => {
        if (!cancelled) {
          setHistoricalListedIpos(items);
          setHistoricalLoadedFy(ipoListedFy);
        }
      })
      .catch(() => {
        if (!cancelled) setHistoricalLoadedFy(ipoListedFy);
      });
    return () => {
      cancelled = true;
    };
  }, [ipoSubTab, ipoListedFy]);

  const historicalListedLoading = ipoSubTab === 'listed' && historicalLoadedFy !== ipoListedFy;
  const ipoSubList = ipoSubTab === 'listed' ? historicalListedIpos : ipos[ipoSubTab];
  const activeIpoMeta = IPO_SUBTAB_META[ipoSubTab];
  const ipoListedFyOptions = useMemo(() => {
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = now.getFullYear();
    const start = m >= 4 ? y : y - 1;
    return Array.from({ length: 5 }, (_, i) => {
      const s = start - i;
      return `FY ${s}-${String(s + 1).slice(2)}`;
    });
  }, []);
  const ipoFilteredList = (() => {
    let list = ipoShowMainboardOnly ? ipoSubList.filter((i) => i.category === 'mainboard') : ipoSubList;
    if (ipoSubTab === 'listed') {
      const q = ipoListedSearch.trim().toLowerCase();
      if (q) list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    return list;
  })();

  const header = (
    <View>
      {/* Sub-tabs — refresh moved to `PortfolioPage`'s header (one consolidated button for all of
          Equity's sub-tabs instead of each having its own, found via your 2026-08-01 review) */}
      <View className="flex-row gap-1.5 px-4 py-2.5 border-b border-theme">
        {IPO_SUBTAB_ORDER.map((key) => {
          const { label } = IPO_SUBTAB_META[key];
          const count = key === 'listed' ? historicalListedIpos.length : ipos[key].length;
          return (
            <SubTabPill
              key={key}
              label={label}
              count={count}
              active={ipoSubTab === key}
              onPress={() => setIpoSubTab(key)}
            />
          );
        })}
      </View>

      {/* Last updated */}
      {ipos.lastUpdated && (
        <Text className="text-[10px] text-tertiary px-4 pt-1.5 pb-0.5">
          {formatLastUpdated(ipos.lastUpdated)} · investorgain.com
        </Text>
      )}

      {/* Listed tab: FY picker + search on one row */}
      {ipoSubTab === 'listed' && (
        <View className="flex-row items-center gap-2 px-4 pt-2.5 pb-0.5">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
            <View className="flex-row gap-1.5">
              {ipoListedFyOptions.map((fy) => {
                const active = ipoListedFy === fy;
                return (
                  <Pressable
                    key={fy}
                    onPress={() => setIpoListedFy(fy)}
                    className="px-3 py-1 rounded-full border border-theme"
                    style={{ backgroundColor: active ? theme.primary : theme.surfaceSecondary }}
                  >
                    <Text className="text-xs font-medium" style={{ color: active ? '#fff' : theme.textSecondary }}>
                      {fy}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <SearchInput value={ipoListedSearch} onChange={setIpoListedSearch} className="w-32" />
        </View>
      )}

      {/* Mainboard / All filter */}
      {ipoSubList.length > 0 && (
        <View className="px-4 pt-2.5 pb-0.5">
          <SegmentedControl
            options={[
              { value: 'all', label: 'All' },
              { value: 'mainboard', label: 'Mainboard' }
            ]}
            value={ipoShowMainboardOnly ? 'mainboard' : 'all'}
            onChange={(v) => setIpoShowMainboardOnly(v === 'mainboard')}
          />
        </View>
      )}
    </View>
  );

  const loadingContent = ipoSubTab === 'listed' ? historicalListedLoading : ipos.loading && ipos.all.length === 0;

  return (
    <>
      {/*
       * A FlatList, not a `.map()` in a `View` — IPO counts are naturally bounded per FY (lower risk
       * than the other lists flagged in the 2026-07-26 parity sweep), but still unvirtualized before
       * this. Everything above the card list (sub-tabs, FY picker, mainboard filter) becomes the
       * `ListHeaderComponent`; the loading spinner and empty states become `ListEmptyComponent`.
       */}
      <FlatList
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 96 }}
        data={loadingContent ? [] : ipoFilteredList}
        keyExtractor={(ipo: IpoItem) => String(ipo.id)}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListHeaderComponent={header}
        // Pull-to-refresh — only wired when there's actually something live to refresh (not on the
        // "Listed" internal sub-tab, same gating as the header's consolidated refresh action reported
        // via `onRefreshStateChange` above).
        refreshControl={
          ipoSubTab !== 'listed' ? (
            <RefreshControl refreshing={ipos.refreshing} onRefresh={ipos.refresh} tintColor={theme.primary} />
          ) : undefined
        }
        ListEmptyComponent={
          loadingContent ? (
            <View className="p-10 items-center">
              <ActivityIndicator color={theme.primary} />
              <Text className="text-sm mt-3 text-tertiary">Fetching IPO data…</Text>
            </View>
          ) : (
            <EmptyState
              icon={activeIpoMeta.icon}
              title={
                ipoShowMainboardOnly && ipoSubList.length > 0
                  ? 'No mainboard IPOs in this category.'
                  : activeIpoMeta.emptyMessage
              }
            />
          )
        }
        renderItem={({ item: ipo }) => renderIpoCard(ipo)}
      />
      {selectedIpo && <IpoDetailModal ipo={selectedIpo} onClose={() => setSelectedIpo(null)} />}
    </>
  );

  function renderIpoCard(ipo: IpoItem) {
    const catColor = ipo.category === 'mainboard' ? '#6366f1' : theme.warning;
    const catLabel = ipo.category === 'mainboard' ? 'MAIN' : 'SME';
    const closingDays = daysUntil(ipo.closeDate);
    const safeGmpPct = !ipo.gmpPercent || isNaN(ipo.gmpPercent) ? 0 : ipo.gmpPercent;
    const gmpColor =
      ipo.gmpValue !== null && ipo.gmpValue > 0
        ? theme.success
        : ipo.gmpValue !== null && ipo.gmpValue < 0
          ? theme.danger
          : theme.textTertiary;

    return (
      <View className="px-4">
        <Card padding="sm" radius="md" onPress={() => setSelectedIpo(ipo)}>
          <View className="flex-row gap-3">
            {/* Left column: name, price/lot, subscription, GMP/gain */}
            <View className="flex-1 gap-1">
              {/* Name + category badge inline */}
              <View className="flex-row items-baseline gap-1.5 flex-wrap">
                <Text className="text-sm font-semibold text-primary leading-snug">{ipo.name}</Text>
                <View className="px-1 py-0.5 rounded" style={{ backgroundColor: tint(catColor, 9) }}>
                  <Text className="text-[9px] font-bold uppercase tracking-wide" style={{ color: catColor }}>
                    {catLabel}
                  </Text>
                </View>
              </View>

              {/* Price · Lot · Issue size */}
              {(ipo.price || ipo.lotSize || ipo.issueSize) && (
                <Text className="text-xs text-secondary">
                  {[
                    ipo.price ? `₹${ipo.price}/sh` : null,
                    ipo.lotSize ? `Lot ${ipo.lotSize}` : null,
                    ipo.issueSize ?? null
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              )}

              {/* Subscription — open and closed */}
              {(ipo.status === 'open' || ipo.status === 'closed') && ipo.subscription && (
                <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
                  {ipo.subscription} subscribed
                </Text>
              )}

              {/* GMP row (upcoming/open/closed) or listing gain (listed) */}
              {ipo.status === 'listed' ? (
                ipo.listingGain !== null && (
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: ipo.listingGain >= 0 ? theme.success : theme.danger }}
                  >
                    Listed {ipo.listingGain >= 0 ? '+' : ''}
                    {ipo.listingGain.toFixed(1)}%
                  </Text>
                )
              ) : (
                <Text className="text-xs">
                  <Text className="text-tertiary">GMP: </Text>
                  {ipo.gmpValue !== null ? (
                    <Text className="font-medium" style={{ color: gmpColor }}>
                      ₹{Math.abs(ipo.gmpValue)} ({safeGmpPct > 0 ? '+' : ''}
                      {safeGmpPct.toFixed(1)}%)
                      {ipo.status === 'upcoming' && (
                        <Text className="text-tertiary font-normal text-[10px]"> est.</Text>
                      )}
                    </Text>
                  ) : (
                    <Text className="text-tertiary">—</Text>
                  )}
                </Text>
              )}
            </View>

            {/* Right column: dates stacked, right-aligned */}
            <View className="gap-1 items-end">
              {ipo.status === 'upcoming' &&
                (ipo.openDate ? (
                  <Text className="text-xs text-tertiary" numberOfLines={1}>
                    {formatIpoDate(ipo.openDate)} → {formatIpoDate(ipo.closeDate)}
                  </Text>
                ) : (
                  <Text className="text-xs text-tertiary">Dates TBA</Text>
                ))}

              {ipo.status === 'open' && (
                <>
                  <Text className="text-xs text-tertiary" numberOfLines={1}>
                    {formatIpoDate(ipo.openDate)} → {formatIpoDate(ipo.closeDate)}
                  </Text>
                  {closingDays !== null && (
                    <Text className="text-xs font-semibold" style={{ color: theme.success }}>
                      {closingDays === 0 ? 'Closes today' : `${closingDays}d left`}
                    </Text>
                  )}
                </>
              )}

              {ipo.status === 'closed' && (
                <>
                  <Text className="text-xs text-tertiary" numberOfLines={1}>
                    {formatIpoDate(ipo.openDate)} → {formatIpoDate(ipo.closeDate)}
                  </Text>
                  {ipo.boaDate && (
                    <Text className="text-xs text-tertiary" numberOfLines={1}>
                      Allotment: {formatIpoDate(ipo.boaDate)}
                    </Text>
                  )}
                  {ipo.listingDate && (
                    <Text className="text-xs text-tertiary" numberOfLines={1}>
                      Listing: {formatIpoDate(ipo.listingDate)}
                    </Text>
                  )}
                </>
              )}

              {ipo.status === 'listed' && (
                <>
                  {ipo.listingDate && (
                    <Text className="text-xs text-tertiary" numberOfLines={1}>
                      Listed: {formatIpoDate(ipo.listingDate)}
                    </Text>
                  )}
                  {ipo.listingPrice && (
                    <Text className="text-xs text-tertiary" numberOfLines={1}>
                      At: ₹{ipo.listingPrice}
                    </Text>
                  )}
                  {safeGmpPct !== 0 && (
                    <Text className="text-xs text-tertiary" numberOfLines={1}>
                      GMP was: ~{safeGmpPct > 0 ? '+' : ''}
                      {safeGmpPct.toFixed(1)}%
                    </Text>
                  )}
                </>
              )}
            </View>
          </View>
        </Card>
      </View>
    );
  }
}
