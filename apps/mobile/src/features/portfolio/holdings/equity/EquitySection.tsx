import { forwardRef, useImperativeHandle, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { EmptyState, IconBadge, Badge } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { AssetClass, Holding } from '@/core/db/types';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { effectiveValue, HOLDINGS_SUBTABS } from '../../usePortfolioHoldings';
import { ASSET_META } from '../shared/registry';
import { StockModal } from './StockModal';
import { MfModal } from './MfModal';

interface EquitySectionProps {
  holdings: Holding[];
  assetClass: Extract<AssetClass, 'stock' | 'mf'>;
  masked: boolean;
  onSave: (holding: Holding) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export interface EquitySectionHandle {
  /** Opens the add-holding modal — called by `PortfolioPage.tsx`'s always-visible FAB, which lives
   *  outside this section's scrolling content (see that file for why). */
  openAdd: () => void;
}

// Stocks / Mutual-funds slice: groups holdings by symbol/scheme with expandable
// lots, and owns its add (FAB, rendered by the parent — see `EquitySectionHandle`) + edit modal.
export const EquitySection = forwardRef<EquitySectionHandle, EquitySectionProps>(function EquitySection(
  { holdings, assetClass, masked, onSave, onRemove },
  ref
) {
  const theme = useThemeColors();
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<{ editing: Holding | null } | null>(null);

  const openEdit = (h: Holding) => setForm({ editing: h });
  const close = () => setForm(null);

  useImperativeHandle(ref, () => ({ openAdd: () => setForm({ editing: null }) }), []);
  const save = async (h: Holding) => {
    await onSave(h);
    close();
  };
  const del = (id: string) => {
    void onRemove(id).then(close);
  };

  const cfg = HOLDINGS_SUBTABS.find((t) => t.assetClasses.includes(assetClass));
  const activeClass = form?.editing?.assetClass ?? assetClass;

  const stockGroups = (() => {
    const stockHoldings = holdings.filter((h) => h.assetClass === 'stock');
    const map = new Map<string, typeof stockHoldings>();
    for (const h of stockHoldings) {
      const key = (h.symbol ?? h.name).toUpperCase();
      const arr = map.get(key) ?? [];
      arr.push(h);
      map.set(key, arr);
    }
    return map;
  })();
  const renderedStockSymbols = new Set<string>();

  const mfGroups = (() => {
    const mfHoldings = holdings.filter((h) => h.assetClass === 'mf');
    const map = new Map<string, typeof mfHoldings>();
    for (const h of mfHoldings) {
      const key = (h.schemeCode ?? h.name).toString();
      const arr = map.get(key) ?? [];
      arr.push(h);
      map.set(key, arr);
    }
    return map;
  })();
  const renderedMfSchemes = new Set<string>();

  return (
    <>
      {holdings.length === 0 ? (
        <EmptyState icon={cfg?.icon ?? 'ti-wallet'} title={cfg?.emptyMessage ?? 'Nothing here yet.'} />
      ) : (
        <View className="py-2">
          {holdings.map((h) => {
            const meta = ASSET_META[h.assetClass];

            if (h.assetClass === 'stock') {
              const symKey = (h.symbol ?? h.name).toUpperCase();
              if (renderedStockSymbols.has(symKey)) return null;
              renderedStockSymbols.add(symKey);

              const lots = stockGroups.get(symKey) ?? [h];
              const totalUnits = lots.reduce((s, l) => s + (l.units ?? 0), 0);
              const totalInvested = lots.reduce((s, l) => s + l.investedAmount, 0);
              const weightedAvg = totalUnits > 0 ? totalInvested / totalUnits : 0;
              const totalCurrent = lots.reduce((s, l) => s + effectiveValue(l), 0);
              const livePrice = lots.find((l) => l.currentPrice != null)?.currentPrice ?? null;
              const totalGain = totalCurrent - totalInvested;
              const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
              const totalGainColor = totalGain >= 0 ? theme.success : theme.danger;
              const ticker = h.symbol ? h.symbol.replace(/\.(NS|BO)$/i, '') : null;
              const displayName = ticker ?? h.name;
              const companyName = h.name !== displayName ? h.name : '';
              const isMultiLot = lots.length > 1;
              const isExpanded = expandedSymbols.has(symKey);

              const handleGroupTap = () => {
                if (isMultiLot) {
                  setExpandedSymbols((prev) => {
                    const next = new Set(prev);
                    if (next.has(symKey)) next.delete(symKey);
                    else next.add(symKey);
                    return next;
                  });
                } else {
                  const firstLot = lots[0];
                  if (firstLot) openEdit(firstLot);
                }
              };

              return (
                <View key={symKey} className="border-b border-theme">
                  <Pressable onPress={handleGroupTap} className="w-full px-4 py-3">
                    <View className="flex-row items-start gap-3">
                      <IconBadge
                        icon={meta.icon}
                        color={meta.color}
                        bg={`${meta.color}15`}
                        size="sm"
                        className="mt-0.5"
                      />
                      <View className="flex-1 min-w-0">
                        <View className="flex-row items-baseline justify-between gap-2">
                          <View className="flex-row items-center gap-1.5 flex-1 min-w-0">
                            <Text className="text-sm font-semibold text-primary tracking-wide" numberOfLines={1}>
                              {displayName}
                            </Text>
                            {isMultiLot && <Badge label={`${lots.length} lots`} color={meta.color} size="sm" />}
                          </View>
                          <Text className="text-sm font-semibold text-primary shrink-0">
                            {!masked ? formatCurrency(totalCurrent) : '••••'}
                          </Text>
                        </View>
                        <View className="flex-row items-baseline justify-between gap-2 mt-0.5">
                          {companyName ? (
                            <Text className="text-xs text-secondary flex-1" numberOfLines={1}>
                              {companyName}
                            </Text>
                          ) : (
                            <View />
                          )}
                          <Text className="text-xs font-medium shrink-0" style={{ color: totalGainColor }}>
                            {!masked
                              ? `${totalGain >= 0 ? '+' : '−'}${formatCurrency(Math.abs(totalGain))} · ${totalGain >= 0 ? '+' : ''}${formatPercent(totalGainPct)}`
                              : '••••'}
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-1 mt-1.5 flex-wrap">
                          <Text className="text-[10px] text-tertiary">{totalUnits} shares</Text>
                          {weightedAvg > 0 && (
                            <>
                              <Text className="text-[9px] text-tertiary">·</Text>
                              <Text className="text-[10px] text-tertiary">
                                Avg{' '}
                                {!masked
                                  ? `₹${weightedAvg.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                                  : '••••'}
                              </Text>
                            </>
                          )}
                          {livePrice != null && (
                            <>
                              <Text className="text-[9px] text-tertiary">·</Text>
                              <Text className="text-[10px] font-medium" style={{ color: meta.color }}>
                                {!masked
                                  ? `₹${livePrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                                  : '••••'}
                                <Text className="ml-0.5 opacity-60 text-[9px]"> live</Text>
                              </Text>
                            </>
                          )}
                          {isMultiLot && (
                            <View className="ml-auto flex-row items-center gap-0.5">
                              <Icon
                                name={isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}
                                size={11}
                                color={theme.textTertiary}
                              />
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  </Pressable>
                  {isMultiLot && isExpanded && (
                    <View
                      className="mx-4 mb-3 rounded-xl overflow-hidden"
                      style={{ backgroundColor: theme.surfaceSecondary }}
                    >
                      {lots.map((lot, idx) => {
                        const lotCurrent = effectiveValue(lot);
                        const lotGain = lotCurrent - lot.investedAmount;
                        const lotGainPct = lot.investedAmount > 0 ? (lotGain / lot.investedAmount) * 100 : 0;
                        const lotGainColor = lotGain >= 0 ? theme.success : theme.danger;
                        return (
                          <Pressable
                            key={lot.id}
                            onPress={() => openEdit(lot)}
                            className={`w-full flex-row items-center gap-3 px-3 py-2.5 ${idx < lots.length - 1 ? 'border-b border-theme' : ''}`}
                          >
                            <View className="w-6 h-6 rounded-lg items-center justify-center shrink-0 bg-surface">
                              <Text className="text-[10px] font-bold text-secondary">{idx + 1}</Text>
                            </View>
                            <View className="flex-1 min-w-0">
                              <Text className="text-xs text-primary">
                                {lot.units} shares
                                {lot.avgCostPrice != null && (
                                  <Text className="text-tertiary">
                                    {' '}
                                    · Avg{' '}
                                    {!masked
                                      ? `₹${lot.avgCostPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                                      : '••••'}
                                  </Text>
                                )}
                              </Text>
                            </View>
                            <View className="items-end shrink-0">
                              <Text className="text-xs font-medium text-primary">
                                {!masked ? formatCurrency(lotCurrent) : '••••'}
                              </Text>
                              <Text className="text-[10px]" style={{ color: lotGainColor }}>
                                {lotGain >= 0 ? '+' : '−'}
                                {formatPercent(Math.abs(lotGainPct))}
                              </Text>
                            </View>
                            <Icon name="ti-pencil" size={13} color={theme.textTertiary} />
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            }

            if (h.assetClass === 'mf') {
              const schemeKey = (h.schemeCode ?? h.name).toString();
              if (renderedMfSchemes.has(schemeKey)) return null;
              renderedMfSchemes.add(schemeKey);

              const lots = mfGroups.get(schemeKey) ?? [h];
              const totalUnits = lots.reduce((s, l) => s + (l.units ?? 0), 0);
              const totalInvested = lots.reduce((s, l) => s + l.investedAmount, 0);
              const weightedAvg = totalUnits > 0 ? totalInvested / totalUnits : 0;
              const totalCurrent = lots.reduce((s, l) => s + effectiveValue(l), 0);
              const liveNav = lots.find((l) => l.currentPrice != null)?.currentPrice ?? null;
              const mfGain = totalCurrent - totalInvested;
              const mfGainPct = totalInvested > 0 ? (mfGain / totalInvested) * 100 : 0;
              const gainColor = mfGain >= 0 ? theme.success : theme.danger;
              const isMultiLot = lots.length > 1;
              const isExpanded = expandedSymbols.has(schemeKey);
              const mfSchemeCategory = h.assetMeta?.mfSchemeCategory ?? '';
              const mfFundHouse = h.assetMeta?.mfFundHouse ?? '';

              const handleGroupTap = () => {
                if (isMultiLot) {
                  setExpandedSymbols((prev) => {
                    const next = new Set(prev);
                    if (next.has(schemeKey)) next.delete(schemeKey);
                    else next.add(schemeKey);
                    return next;
                  });
                } else {
                  const firstLot = lots[0];
                  if (firstLot) openEdit(firstLot);
                }
              };

              return (
                <View key={schemeKey} className="border-b border-theme">
                  <Pressable onPress={handleGroupTap} className="w-full px-4 py-3">
                    <View className="flex-row items-start gap-3">
                      <IconBadge
                        icon={meta.icon}
                        color={meta.color}
                        bg={`${meta.color}15`}
                        size="sm"
                        className="mt-0.5"
                      />
                      <View className="flex-1 min-w-0">
                        <View className="flex-row items-baseline justify-between gap-2">
                          <View className="flex-row items-center gap-1.5 flex-1 min-w-0">
                            <Text className="text-xs font-semibold text-primary" numberOfLines={1}>
                              {h.name}
                            </Text>
                            {isMultiLot && <Badge label={`${lots.length} SIPs`} color={meta.color} size="sm" />}
                          </View>
                          <Text className="text-sm font-semibold text-primary shrink-0">
                            {!masked ? formatCurrency(totalCurrent) : '••••'}
                          </Text>
                        </View>
                        <View className="flex-row items-baseline justify-between gap-2 mt-0.5">
                          {mfSchemeCategory ? (
                            <Text className="text-xs text-secondary flex-1" numberOfLines={1}>
                              {mfSchemeCategory}
                              {mfFundHouse ? ` · ${mfFundHouse}` : ''}
                            </Text>
                          ) : (
                            <View />
                          )}
                          <Text className="text-xs font-medium shrink-0" style={{ color: gainColor }}>
                            {!masked
                              ? `${mfGain >= 0 ? '+' : '−'}${formatCurrency(Math.abs(mfGain))} · ${mfGain >= 0 ? '+' : ''}${formatPercent(mfGainPct)}`
                              : '••••'}
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-1 mt-1.5 flex-wrap">
                          <Text className="text-[10px] text-tertiary">{totalUnits.toFixed(3)} units</Text>
                          {weightedAvg > 0 && (
                            <>
                              <Text className="text-[9px] text-tertiary">·</Text>
                              <Text className="text-[10px] text-tertiary">
                                Avg NAV{' '}
                                {!masked
                                  ? `₹${weightedAvg.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                                  : '••••'}
                              </Text>
                            </>
                          )}
                          {liveNav != null && (
                            <>
                              <Text className="text-[9px] text-tertiary">·</Text>
                              <Text className="text-[10px] font-medium" style={{ color: meta.color }}>
                                NAV{' '}
                                {!masked ? `₹${liveNav.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '••••'}
                                <Text className="ml-0.5 opacity-60 text-[9px]"> live</Text>
                              </Text>
                            </>
                          )}
                          {isMultiLot && (
                            <View className="ml-auto flex-row items-center gap-0.5">
                              <Icon
                                name={isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}
                                size={11}
                                color={theme.textTertiary}
                              />
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  </Pressable>
                  {isMultiLot && isExpanded && (
                    <View
                      className="mx-4 mb-3 rounded-xl overflow-hidden"
                      style={{ backgroundColor: theme.surfaceSecondary }}
                    >
                      {lots.map((lot, idx) => {
                        const lotCurrent = effectiveValue(lot);
                        const lotGain = lotCurrent - lot.investedAmount;
                        const lotGainPct = lot.investedAmount > 0 ? (lotGain / lot.investedAmount) * 100 : 0;
                        const lotGainColor = lotGain >= 0 ? theme.success : theme.danger;
                        return (
                          <Pressable
                            key={lot.id}
                            onPress={() => openEdit(lot)}
                            className={`w-full flex-row items-center gap-3 px-3 py-2.5 ${idx < lots.length - 1 ? 'border-b border-theme' : ''}`}
                          >
                            <View className="w-6 h-6 rounded-lg items-center justify-center shrink-0 bg-surface">
                              <Text className="text-[10px] font-bold text-secondary">{idx + 1}</Text>
                            </View>
                            <View className="flex-1 min-w-0">
                              <Text className="text-xs text-primary">
                                {(lot.units ?? 0).toFixed(3)} units
                                {lot.avgCostPrice != null && (
                                  <Text className="text-tertiary">
                                    {' '}
                                    · Avg NAV{' '}
                                    {!masked
                                      ? `₹${lot.avgCostPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                                      : '••••'}
                                  </Text>
                                )}
                              </Text>
                            </View>
                            <View className="items-end shrink-0">
                              <Text className="text-xs font-medium text-primary">
                                {!masked ? formatCurrency(lotCurrent) : '••••'}
                              </Text>
                              <Text className="text-[10px]" style={{ color: lotGainColor }}>
                                {lotGain >= 0 ? '+' : '−'}
                                {formatPercent(Math.abs(lotGainPct))}
                              </Text>
                            </View>
                            <Icon name="ti-pencil" size={13} color={theme.textTertiary} />
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            }

            return null;
          })}
        </View>
      )}

      {form &&
        (activeClass === 'stock' ? (
          <StockModal editing={form.editing} onSave={save} onDelete={del} onClose={close} />
        ) : (
          <MfModal editing={form.editing} onSave={save} onDelete={del} onClose={close} />
        ))}
    </>
  );
});
