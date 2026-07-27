import { View, Text } from 'react-native';
import { formatCurrency } from '@/lib/formatters';
import { Banner, StatBox, SectionLabel } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { EQUITY_LTCG_EXEMPTION, computeCapitalGainsTax } from '@/core/tax/calculator';
import type { TaxSummary } from '@/core/tax/calculator';
import { CapGainRow } from './CapGainRow';

/** RN port of apps/web-react/src/features/tax/gains/CapitalGainsTab.tsx. */
export function CapitalGainsTab({ summary }: { summary: TaxSummary }) {
  const theme = useThemeColors();
  const { capGains, totalEquityLtcg, totalEquityStcg, totalOtherLtcg, totalOtherStcg } = summary;
  const tax = computeCapitalGainsTax(summary);

  return (
    <>
      {/* Summary cards */}
      {(totalEquityLtcg > 0 || totalEquityStcg > 0 || totalOtherLtcg > 0) && (
        <View className="flex-row flex-wrap gap-3">
          {totalEquityLtcg > 0 && (
            <View className="w-[48%]">
              <StatBox
                tone="success"
                label="Equity LTCG"
                value={formatCurrency(Math.round(totalEquityLtcg))}
                sub={`${formatCurrency(EQUITY_LTCG_EXEMPTION)} exempt · tax on remainder`}
                footer={`Est. tax: ${formatCurrency(Math.round(tax.equityLtcgTax))}`}
              />
            </View>
          )}
          {totalEquityStcg > 0 && (
            <View className="w-[48%]">
              <StatBox
                tone="warning"
                label="Equity STCG"
                value={formatCurrency(Math.round(totalEquityStcg))}
                sub="Taxed @ 20%"
                footer={`Est. tax: ${formatCurrency(Math.round(tax.equityStcgTax))}`}
              />
            </View>
          )}
          {(totalOtherLtcg > 0 || totalOtherStcg > 0) && (
            <View className="w-[48%]">
              <StatBox
                tone="info"
                label="Other LTCG"
                value={formatCurrency(Math.round(totalOtherLtcg))}
                sub="Gold / debt · 12.5%"
                footer={`Est. tax: ${formatCurrency(Math.round(tax.otherLtcgTax))}`}
              />
            </View>
          )}
          {(totalEquityLtcg > 0 || totalEquityStcg > 0) && (
            <View className="w-[48%]">
              <StatBox
                label="Total est. tax"
                value={formatCurrency(Math.round(tax.totalTax))}
                sub="Equity only (excl. slab-rate items)"
              />
            </View>
          )}
        </View>
      )}

      {/* Harvesting tips */}
      {totalEquityStcg > 0 && totalEquityLtcg === 0 && (
        <Banner variant="warning" icon="ti-bulb">
          <Text className="font-bold">Tax-loss harvesting:</Text> If you have unrealised losses, consider booking them
          before March 31 to offset these STCG gains.
        </Banner>
      )}
      {totalEquityLtcg > EQUITY_LTCG_EXEMPTION && (
        <Banner variant="info" icon="ti-bulb">
          <Text className="font-bold">LTCG grandfathering:</Text> If gains accumulated before Jan 31 2018, those are
          exempt. Consult your CA for the exact grandfathered cost.
        </Banner>
      )}

      {/* Holdings list */}
      {capGains.length > 0 ? (
        <View className="gap-2">
          <SectionLabel>Holdings with gains/losses</SectionLabel>
          {capGains.map((item) => (
            <CapGainRow key={item.name + item.assetClass} item={item} />
          ))}
        </View>
      ) : (
        <View className="p-10 items-center">
          <Icon name="ti-chart-pie" size={40} color={theme.textTertiary} />
          <Text className="text-sm mt-3 text-tertiary text-center">
            No holdings found. Add investments in Portfolio to see capital gains.
          </Text>
        </View>
      )}

      {/* Disclaimer */}
      {capGains.length > 0 && (
        <View className="rounded-xl p-3 bg-surface-2 border border-theme">
          <Text className="text-[10px] leading-relaxed text-tertiary">
            <Text className="font-bold">Note:</Text> Holding period is calculated from when you added this holding to
            Penny, which may differ from the actual purchase date. Tax estimates are indicative — consult a CA for
            precise calculations. Equity LTCG exemption of ₹1.25L is shown per-holding here; it applies across all
            equity gains in a FY.
          </Text>
        </View>
      )}
    </>
  );
}
