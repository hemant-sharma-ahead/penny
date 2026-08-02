import { View, Text } from 'react-native';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency, formatPercent } from '@/lib/formatters';

interface EquitySummaryCardProps {
  invested: number;
  current: number;
  masked: boolean;
}

/**
 * Per-sub-tab summary card for Equity's Stocks and Mutual Funds — 2026-08-01 Portfolio consolidation.
 * Portfolio Value up top, then Invested / Returns / Returns % below — scoped to whichever sub-tab is
 * active (stocks-only or MF-only totals, not the combined Equity/whole-portfolio figure the page
 * header's own subtitle already shows). No "1-day change" line: `Holding` only stores the latest
 * fetched price, not a prior day's, so a genuine day-over-day figure isn't computable yet — deliberately
 * left out rather than shipping something misleading (see the mockup review this shipped from).
 */
export function EquitySummaryCard({ invested, current, masked }: EquitySummaryCardProps) {
  const theme = useThemeColors();
  const returns = current - invested;
  const returnsPct = invested > 0 ? (returns / invested) * 100 : 0;
  const positive = returns >= 0;
  const color = positive ? theme.success : theme.danger;

  return (
    <View className="bg-surface border border-theme rounded-2xl p-4 mb-3">
      <Text className="text-[10px] font-semibold uppercase text-tertiary">Current Value</Text>
      <Text className="text-2xl font-bold text-primary mt-0.5">{masked ? '••••' : formatCurrency(current)}</Text>
      <View className="flex-row mt-3 pt-3 border-t border-theme">
        <View className="flex-1">
          <Text className="text-[10px] font-semibold uppercase text-tertiary">Invested</Text>
          <Text className="text-sm font-bold mt-0.5 text-primary">{masked ? '••••' : formatCurrency(invested)}</Text>
        </View>
        <View className="flex-1 border-l border-theme pl-2.5 ml-2.5">
          <Text className="text-[10px] font-semibold uppercase text-tertiary">Returns</Text>
          <Text className="text-sm font-bold mt-0.5" style={{ color }}>
            {masked ? '••••' : `${positive ? '+' : ''}${formatCurrency(returns)}`}
          </Text>
        </View>
        <View className="flex-1 border-l border-theme pl-2.5 ml-2.5">
          <Text className="text-[10px] font-semibold uppercase text-tertiary">Returns %</Text>
          <Text className="text-sm font-bold mt-0.5" style={{ color }}>
            {masked ? '••••' : `${positive ? '+' : ''}${formatPercent(returnsPct)}`}
          </Text>
        </View>
      </View>
    </View>
  );
}
