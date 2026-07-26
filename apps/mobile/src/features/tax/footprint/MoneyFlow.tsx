import { View, Text } from 'react-native';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { useThemeColors } from '~/theme/useThemeColors';
import type { IncomeWaterfall } from '@/core/tax/incomeWaterfall';

// Every rupee of gross splits four ways (they sum to gross):
//   savings + direct tax + indirect tax + real consumption.
interface Segment {
  key: string;
  label: string;
  amount: number;
  color: string;
}

function segments(
  w: IncomeWaterfall,
  theme: { success: string; danger: string; warning: string; info: string }
): Segment[] {
  return [
    { key: 'savings', label: 'Saved & invested', amount: Math.max(0, w.totalSavings), color: theme.success },
    { key: 'direct', label: 'Direct tax', amount: w.directTax, color: theme.danger },
    { key: 'indirect', label: 'Indirect tax', amount: w.indirectTax, color: theme.warning },
    { key: 'real', label: 'Real spending', amount: Math.max(0, w.realConsumption), color: theme.info }
  ];
}

/** RN port of apps/web-react/src/features/tax/footprint/MoneyFlow.tsx — a stacked proportion bar
 *  showing how every rupee of gross income was used. */
export function MoneyFlow({ waterfall }: { waterfall: IncomeWaterfall }) {
  const theme = useThemeColors();
  const segs = segments(waterfall, theme);
  const total = segs.reduce((s, x) => s + x.amount, 0) || 1;

  return (
    <View className="gap-3">
      <View className="flex-row h-4 rounded-full overflow-hidden bg-surface-2">
        {segs.map((s) =>
          s.amount > 0 ? (
            <View key={s.key} style={{ width: `${(s.amount / total) * 100}%`, backgroundColor: s.color }} />
          ) : null
        )}
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-2">
        {segs.map((s) => (
          <View key={s.key} className="w-[45%] flex-row items-center gap-2">
            <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <View className="flex-1">
              <Text className="text-[11px] text-secondary" numberOfLines={1}>
                {s.label}
              </Text>
              <Text className="text-xs font-semibold text-primary">
                {formatCurrency(Math.round(s.amount))}{' '}
                <Text className="text-[10px] text-tertiary font-normal">
                  ({formatPercent((s.amount / total) * 100)})
                </Text>
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

interface Step {
  label: string;
  amount: number;
  kind: 'in' | 'out' | 'total';
}

/** The gross → in-hand → spend/savings step-down, as a compact ledger. */
export function WaterfallSteps({ waterfall: w }: { waterfall: IncomeWaterfall }) {
  const theme = useThemeColors();
  const steps: Step[] = [
    { label: 'Gross income', amount: w.gross, kind: 'in' },
    { label: 'EPF / PF (saved)', amount: -w.epf, kind: 'out' },
    { label: 'Professional tax + LWF', amount: -w.statutoryLevies, kind: 'out' },
    { label: 'Income tax', amount: -w.incomeTax, kind: 'out' },
    { label: 'In-hand', amount: w.inHand, kind: 'total' },
    { label: 'Spent', amount: -w.trackedSpend, kind: 'out' },
    {
      label: w.overspent ? 'Dipped into savings' : 'Discretionary savings',
      amount: w.discretionarySavings,
      kind: 'total'
    }
  ];

  return (
    <View>
      {steps.map((s, i) => {
        const isTotal = s.kind === 'total';
        const color = s.kind === 'out' ? theme.danger : s.amount < 0 ? theme.danger : theme.success;
        return (
          <View
            key={s.label}
            className={`flex-row items-center justify-between py-1.5 ${i > 0 ? 'border-t border-theme' : ''}`}
          >
            <Text className={`text-xs ${isTotal ? 'font-semibold text-primary' : 'text-secondary'}`}>{s.label}</Text>
            <Text className="text-xs font-semibold" style={{ color: isTotal ? theme.textPrimary : color }}>
              {s.amount < 0 ? '−' : ''}
              {formatCurrency(Math.abs(Math.round(s.amount)))}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
