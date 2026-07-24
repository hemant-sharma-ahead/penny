import { View, Text } from 'react-native';
import { Card, IconBadge, ProgressBar } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { calcRdMaturity } from '@/core/fd/fdCalculations';
import type { Holding } from '@/core/db/types';
import { nowMs } from '~/features/portfolio/holdings/shared/helpers';

// View card for a Recurring Deposit — monthly installment, rate, months-completed
// progress and projected maturity.
export function RdCard({ holding, onEdit, masked }: { holding: Holding; onEdit: () => void; masked: boolean }) {
  const theme = useThemeColors();
  const meta = holding.assetMeta ?? {};
  const monthlyInstallment = meta.rdMonthlyInstallment ?? holding.investedAmount;
  const rate = holding.interestRate ?? 0;
  const tenureMonths = meta.rdTenureMonths ?? 0;
  const startMs = meta.fdStartDate ?? null;
  const bank = meta.fdBank ?? '';

  const result =
    monthlyInstallment > 0 && rate > 0 && tenureMonths > 0 && startMs
      ? calcRdMaturity(monthlyInstallment, rate, tenureMonths, startMs, nowMs())
      : null;

  const startDateStr = startMs
    ? new Date(startMs).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : null;
  const maturityMs = startMs ? startMs + tenureMonths * 30.4375 * 24 * 3600 * 1000 : null;
  const maturityDateStr = maturityMs
    ? new Date(maturityMs).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : null;

  return (
    <Card onPress={onEdit} padding="sm" className="flex flex-col gap-3">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-row items-center gap-2.5 flex-1">
          <IconBadge icon="ti-calendar-repeat" color="#6366f1" bg="#6366f115" size="sm" />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
              {holding.name}
            </Text>
            <View className="flex-row items-center gap-1.5 flex-wrap mt-0.5">
              {bank && <Text className="text-[10px] text-secondary">{bank}</Text>}
              {rate > 0 && (
                <Text
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: `${theme.success}18`, color: theme.success }}
                >
                  {rate}% p.a.
                </Text>
              )}
              {tenureMonths > 0 && <Text className="text-[9px] text-tertiary">{tenureMonths} months</Text>}
            </View>
          </View>
        </View>
        {result?.isMatured ? (
          <Text
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${theme.success}18`, color: theme.success }}
          >
            MATURED
          </Text>
        ) : (
          <Icon name="ti-chevron-right" size={15} color={theme.textTertiary} />
        )}
      </View>

      {result && (
        <View className="flex flex-col gap-1">
          <ProgressBar value={result.pctElapsed} />
          <View className="flex-row justify-between">
            <Text className="text-[9px] text-tertiary">
              {result.monthsCompleted}/{tenureMonths} months · {startDateStr}
            </Text>
            <Text className="text-[9px] text-tertiary">
              {result.isMatured ? 'Matured' : `${result.monthsRemaining} left`} · {maturityDateStr}
            </Text>
          </View>
        </View>
      )}

      <View className="flex-row items-end justify-between gap-3">
        <View>
          <Text className="text-[10px] text-tertiary mb-0.5">Monthly</Text>
          <Text className="text-sm font-semibold text-primary tabular-nums">
            {!masked ? `₹${monthlyInstallment.toLocaleString('en-IN')}/mo` : '••••'}
          </Text>
          {result && (
            <Text className="text-[10px] text-tertiary mt-0.5">
              Deposited: {!masked ? `₹${result.totalDeposited.toLocaleString('en-IN')}` : '••••'}
            </Text>
          )}
        </View>
        {result && (
          <View className="items-end">
            <Text className="text-[10px] text-tertiary mb-0.5">
              {result.isMatured ? 'Maturity amount' : 'Projected maturity'}
            </Text>
            <Text className="text-lg font-bold tabular-nums" style={{ color: theme.success }}>
              {!masked ? `₹${result.maturityAmount.toLocaleString('en-IN')}` : '••••'}
            </Text>
            <Text className="text-[9px] font-medium" style={{ color: theme.success }}>
              +₹{result.totalInterest.toLocaleString('en-IN')} interest
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}
