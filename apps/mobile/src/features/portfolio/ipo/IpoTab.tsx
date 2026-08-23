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
  // Default to 'open' (2026-08-11) — the most actionable state; matches IPO_SUBTAB_ORDER's own
  // reordering (open first). The two are independent constants, not derived from one another — see
  // `ipoHelpers.ts`'s own doc comment on IPO_SUBTAB_ORDER's ordering rationale.
  const [ipoSubTab, setIpoSubTab] = useState<IpoStatus>('open');
  // 2026-08-22: was a boolean (All / Mainboard only) — added the missing third option since `IpoCategory`
  // itself has always been `'mainboard' | 'sme'` (see packages/core/src/core/ipo/ipoTypes.ts); the filter
  // just never exposed the SME half of that split.
  const [ipoBoardFilter, setIpoBoardFilter] = useState<'all' | 'mainboard' | 'sme'>('all');
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
    let list = ipoBoardFilter === 'all' ? ipoSubList : ipoSubList.filter((i) => i.category === ipoBoardFilter);
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

      {/* All / Mainboard / SME filter */}
      {ipoSubList.length > 0 && (
        <View className="px-4 pt-2.5 pb-0.5">
          <SegmentedControl
            options={[
              { value: 'all', label: 'All' },
              { value: 'mainboard', label: 'Mainboard' },
              { value: 'sme', label: 'SME' }
            ]}
            value={ipoBoardFilter}
            onChange={(v) => setIpoBoardFilter(v as 'all' | 'mainboard' | 'sme')}
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
                ipoBoardFilter !== 'all' && ipoSubList.length > 0
                  ? `No ${ipoBoardFilter === 'mainboard' ? 'mainboard' : 'SME'} IPOs in this category.`
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

    // Option 5 (docs/mockups/proposals/backup-icons-and-ipo-gmp-v1.html §2b) — a 3-tier RAG confidence
    // gradient scaled off GMP magnitude, not a plain positive/negative split: red below zero, amber for
    // a weak positive (0–8%), green at/above 8% ("higher the GMP, more likely the chance of profit").
    // `null` means no GMP data at all — stays plain/neutral, no tier.
    const ragTier = (value: number | null, percent: number): 'red' | 'amber' | 'green' | null => {
      if (value === null) return null;
      if (value < 0) return 'red';
      return percent >= 8 ? 'green' : 'amber';
    };
    const RAG_COLOR = { red: theme.danger, amber: theme.warning, green: theme.success } as const;

    const gmpTier = ragTier(ipo.gmpValue, safeGmpPct);
    // Same RAG treatment applied to `listingGain` for a `listed` card's headline — the analogous
    // "how strong is the signal" magnitude once an IPO has actually listed.
    const gainTier = ipo.status === 'listed' ? ragTier(ipo.listingGain, ipo.listingGain ?? 0) : null;

    // Left-edge stripe for ambient RAG scanning down the list. For upcoming/open/closed this tracks the
    // live GMP tier. For `listed`, the mockup explicitly calls this out as an open design question (tier
    // the stripe off the old GMP estimate vs. the actual listingGain outcome) — resolved here in favor
    // of listingGain (the real, decision-relevant number for a card that's no longer actionable),
    // always faded since a listed card is historical, not actionable. No GMP data at all → no stripe,
    // same neutral treatment as today's "no GMP" case.
    const stripeTier = ipo.status === 'listed' ? gainTier : gmpTier;
    const stripeStyle = stripeTier
      ? {
          borderLeftWidth: 3,
          borderLeftColor: ipo.status === 'listed' ? tint(RAG_COLOR[stripeTier], 40) : RAG_COLOR[stripeTier]
        }
      : undefined;

    return (
      <View className="px-4">
        <Card padding="sm" radius="md" onPress={() => setSelectedIpo(ipo)} style={stripeStyle}>
          <View className="flex-row gap-3">
            {/* Left column: name, price/lot, subscription, listing headline (listed only — GMP moved
                entirely to the right column for every other status, per Option 5) */}
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

              {/* Listing headline — `listed` only. Always rendered whenever listingGain isn't null
                  (never silently dropped — a real bug in earlier options this mockup fixed). */}
              {ipo.status === 'listed' && ipo.listingGain !== null && (
                <Text
                  className="text-xs font-semibold"
                  style={{ color: gainTier ? RAG_COLOR[gainTier] : theme.textTertiary }}
                >
                  Listed {ipo.listingGain >= 0 ? '+' : ''}
                  {ipo.listingGain.toFixed(1)}%
                </Text>
              )}
            </View>

            {/* Right column: GMP (upcoming/open/closed, plain text, no chip) above dates; listed keeps
                the historical "GMP was" line alongside dates/listing info */}
            <View className="gap-1 items-end">
              {ipo.status !== 'listed' &&
                (ipo.gmpValue !== null ? (
                  <Text
                    className="text-xs font-bold"
                    style={{ color: gmpTier ? RAG_COLOR[gmpTier] : theme.textTertiary }}
                  >
                    ₹{Math.abs(ipo.gmpValue)} ({safeGmpPct > 0 ? '+' : ''}
                    {safeGmpPct.toFixed(1)}%){ipo.status === 'upcoming' ? ' est.' : ''}
                  </Text>
                ) : (
                  <Text className="text-xs text-tertiary">GMP: —</Text>
                ))}

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
                  {/* Historical "GMP was" — muted/faded (tier preserved but non-actionable now that
                      the IPO has actually listed), sitting above the dates per Option 5. */}
                  {safeGmpPct !== 0 && (
                    <Text
                      className="text-xs font-bold"
                      style={{ color: gmpTier ? tint(RAG_COLOR[gmpTier], 80) : theme.textTertiary }}
                      numberOfLines={1}
                    >
                      GMP was ~{safeGmpPct > 0 ? '+' : ''}
                      {safeGmpPct.toFixed(1)}%
                    </Text>
                  )}
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
                </>
              )}
            </View>
          </View>
        </Card>
      </View>
    );
  }
}
