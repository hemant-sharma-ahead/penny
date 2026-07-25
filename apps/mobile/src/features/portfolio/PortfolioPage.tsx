import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivacy } from '~/context/PrivacyContext';
import { useSettings } from '~/context/SettingsContext';
import { usePortfolioHoldings, HOLDINGS_SUBTABS } from './usePortfolioHoldings';
import type { HoldingsSubTab } from './usePortfolioHoldings';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { PageHeader, Button } from '~/components/ui';
import { AssetTaxNote } from '~/components/shared';
import type { AssetTaxTopic } from '@/core/tax/assetTaxInfo';
import { useThemeColors } from '~/theme/useThemeColors';
import { EquitySection } from './holdings/equity/EquitySection';
import { FixedIncomeSection } from './holdings/fixed-income/FixedIncomeSection';
import { PreciousMetalsSection } from './holdings/precious-metals/PreciousMetalsSection';
import { RealAssetsSection } from './holdings/real-assets/RealAssetsSection';
import { RetirementSection } from './holdings/retirement/RetirementSection';
import { IpoTab } from './ipo/IpoTab';

/** Which contextual tax note to show per holdings sub-tab. */
const SUBTAB_TAX_TOPIC: Partial<Record<HoldingsSubTab, AssetTaxTopic>> = {
  stocks: 'equity',
  mf: 'equity',
  fixed_income: 'fd',
  precious_metals: 'gold',
  real_assets: 'property',
  retirement: 'retirement'
};

export function PortfolioPage() {
  const theme = useThemeColors();
  const { mode, shouldMask } = usePrivacy();
  const { safeModeVisibility } = useSettings();
  const masked = shouldMask(!safeModeVisibility.portfolio);
  const {
    holdings,
    saveHolding,
    removeHolding,
    totalInvested,
    totalCurrent,
    subTabCounts,
    hasLivePriceRefresh,
    refreshing,
    refreshPrices
  } = usePortfolioHoldings();

  const [activeTab, setActiveTab] = useState<'holdings' | 'ipo'>('holdings');
  const [holdingsSubTab, setHoldingsSubTab] = useState<HoldingsSubTab>('stocks');

  const overallReturn = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

  const subTabRows = [HOLDINGS_SUBTABS.slice(0, 3), HOLDINGS_SUBTABS.slice(3)];

  return (
    <SafeAreaView edges={[]} className="flex-1 bg-surface-tertiary">
      <PageHeader
        title="Portfolio"
        actions={
          activeTab !== 'ipo' && hasLivePriceRefresh ? (
            <Button variant="secondary" size="sm" icon="ti-refresh" loading={refreshing} onPress={refreshPrices}>
              {refreshing ? 'Fetching…' : 'Refresh prices'}
            </Button>
          ) : undefined
        }
      >
        {activeTab !== 'ipo' && holdings.length > 0 && (
          <View className="flex-row items-baseline gap-3 mt-1">
            <Text className="text-sm text-secondary">{masked ? '••••' : formatCurrency(totalCurrent)}</Text>
            <Text className="text-xs font-medium" style={{ color: overallReturn >= 0 ? theme.success : theme.danger }}>
              {overallReturn >= 0 ? '+' : ''}
              {formatPercent(overallReturn)}
            </Text>
          </View>
        )}
      </PageHeader>

      {/* Main tabs */}
      <View className="flex-row px-4 border-b border-theme">
        {(['holdings', 'ipo'] as const).map((tab) => {
          const active = activeTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              className="py-2.5 mr-5 border-b-2"
              style={{ borderColor: active ? theme.primary : 'transparent' }}
            >
              <Text className="text-sm font-medium" style={{ color: active ? theme.primary : theme.textSecondary }}>
                {tab === 'ipo' ? 'IPO' : 'Holdings'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 96 }}>
        {/* ── Holdings tab ── */}
        {activeTab === 'holdings' && (
          <View className="flex-1">
            {/* Holdings sub-tab bar — 2 rows: 3 on top, 3 on bottom */}
            <View className="flex flex-col gap-1.5 px-4 pt-2.5 pb-2 border-b border-theme">
              {subTabRows.map((row, rowIdx) => (
                <View key={rowIdx} className="flex-row gap-1.5">
                  {row.map((tab) => {
                    const count = subTabCounts[tab.key] ?? 0;
                    const isActive = holdingsSubTab === tab.key;
                    return (
                      <Pressable
                        key={tab.key}
                        onPress={() => setHoldingsSubTab(tab.key)}
                        className="flex-1 flex-row items-center justify-center gap-1 px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: isActive ? theme.primary : theme.surfaceSecondary }}
                      >
                        <Text
                          className="text-xs font-medium"
                          style={{ color: isActive ? '#fff' : theme.textSecondary }}
                        >
                          {tab.label}
                        </Text>
                        {count > 0 && (
                          <View
                            className="w-4 h-4 rounded-full items-center justify-center"
                            style={{
                              backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : theme.surfaceTertiary
                            }}
                          >
                            <Text
                              className="text-[10px] font-bold leading-none"
                              style={{ color: isActive ? '#fff' : theme.textTertiary }}
                            >
                              {count > 9 ? '9+' : count}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>

            {/* Contextual tax-awareness note for this asset class */}
            {SUBTAB_TAX_TOPIC[holdingsSubTab] && (
              <View className="px-4 pt-3">
                <AssetTaxNote topic={SUBTAB_TAX_TOPIC[holdingsSubTab] as AssetTaxTopic} />
              </View>
            )}

            {/* Sub-tab content */}
            {(() => {
              const cfg = HOLDINGS_SUBTABS.find((t) => t.key === holdingsSubTab);
              if (!cfg) return null;
              const subHoldings = holdings.filter((h) => cfg.assetClasses.includes(h.assetClass));
              switch (holdingsSubTab) {
                case 'stocks':
                case 'mf':
                  return (
                    <EquitySection
                      holdings={subHoldings}
                      assetClass={holdingsSubTab === 'stocks' ? 'stock' : 'mf'}
                      masked={masked}
                      onSave={saveHolding}
                      onRemove={removeHolding}
                    />
                  );
                case 'fixed_income':
                  return (
                    <FixedIncomeSection
                      holdings={subHoldings}
                      masked={masked}
                      onSave={saveHolding}
                      onRemove={removeHolding}
                    />
                  );
                case 'precious_metals':
                  return (
                    <PreciousMetalsSection
                      holdings={subHoldings}
                      masked={masked}
                      onSave={saveHolding}
                      onRemove={removeHolding}
                    />
                  );
                case 'real_assets':
                  return (
                    <RealAssetsSection
                      holdings={subHoldings}
                      mode={mode}
                      masked={masked}
                      onSave={saveHolding}
                      onRemove={removeHolding}
                    />
                  );
                case 'retirement':
                  return (
                    <RetirementSection
                      holdings={subHoldings}
                      masked={masked}
                      onSave={saveHolding}
                      onRemove={removeHolding}
                    />
                  );
              }
            })()}
          </View>
        )}

        {/* ── IPO tab ── */}
        {activeTab === 'ipo' && <IpoTab />}
      </ScrollView>
    </SafeAreaView>
  );
}
