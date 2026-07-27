import { View, Text } from 'react-native';
import { Card, ProgressBar, Badge } from '~/components/ui';
import { ListRow } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { calcFdMaturity } from '@/core/fd/fdCalculations';
import type { CompoundingFreq } from '@/core/fd/fdCalculations';
import type { Holding } from '@/core/db/types';
import { nowMs } from '~/features/portfolio/holdings/shared/helpers';

const freqLabel: Record<CompoundingFreq, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'half-yearly': 'Half-yearly',
  yearly: 'Yearly',
  at_maturity: 'At maturity'
};

// View card for a Fixed Deposit — principal, rate, maturity progress and
// projected/accrued interest.
export function FdCard({ holding, onEdit, masked }: { holding: Holding; onEdit: () => void; masked: boolean }) {
  const theme = useThemeColors();
  const meta = holding.assetMeta ?? {};
  const principal = holding.investedAmount;
  const rate = holding.interestRate ?? 0;
  const startMs = meta.fdStartDate ?? null;
  const maturityMs = holding.maturityDate ?? null;
  const freq: CompoundingFreq = meta.fdCompoundingFreq ?? 'quarterly';
  const bank = meta.fdBank ?? '';

  const result =
    principal > 0 && rate > 0 && startMs && maturityMs
      ? calcFdMaturity(principal, rate, startMs, maturityMs, freq, nowMs())
      : null;

  const maturityDateStr = maturityMs
    ? new Date(maturityMs).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const startDateStr = startMs
    ? new Date(startMs).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
    : null;

  return (
    <Card onPress={onEdit} padding="sm" className="flex flex-col gap-3">
      <ListRow
        icon="ti-building-bank"
        iconColor="#f59e0b"
        iconBg="#f59e0b15"
        iconSize="sm"
        title={
          <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
            {holding.name}
          </Text>
        }
        subtitle={
          <View className="flex-row items-center gap-1.5 flex-wrap">
            {bank && <Text className="text-[10px] text-secondary">{bank}</Text>}
            {rate > 0 && <Badge label={`${rate}% p.a.`} color={theme.success} size="sm" />}
            <Text className="text-[9px] text-tertiary">{freqLabel[freq]}</Text>
          </View>
        }
        right={
          result?.isMatured ? (
            <Badge label="MATURED" color={theme.success} size="sm" />
          ) : (
            <Icon name="ti-chevron-right" size={15} color={theme.textTertiary} />
          )
        }
      />

      {result && (
        <View className="flex flex-col gap-1">
          <ProgressBar value={result.pctElapsed} animate />
          <View className="flex-row justify-between">
            <Text className="text-[9px] text-tertiary">{startDateStr}</Text>
            <Text className="text-[9px] text-tertiary">
              {result.isMatured ? 'Matured' : `${result.daysRemaining} days left`} · {maturityDateStr}
            </Text>
          </View>
        </View>
      )}

      <View className="flex-row items-end justify-between gap-3">
        <View>
          <Text className="text-[10px] text-tertiary mb-0.5">Principal</Text>
          <Text className="text-sm font-semibold text-primary tabular-nums">
            {!masked ? `₹${principal.toLocaleString('en-IN')}` : '••••'}
          </Text>
          {!result && maturityDateStr && (
            <Text className="text-[10px] text-tertiary mt-0.5">Matures {maturityDateStr}</Text>
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
              +₹{result.totalInterest.toLocaleString('en-IN')} ({((result.totalInterest / principal) * 100).toFixed(1)}
              %)
            </Text>
          </View>
        )}
      </View>

      {result && !result.isMatured && result.accruedInterest > 0 && (
        <View
          className="flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
          style={{ backgroundColor: tint(theme.success, 12) }}
        >
          <Icon name="ti-trending-up" size={13} color={theme.success} />
          <Text className="text-[10px] font-medium" style={{ color: theme.success }}>
            {!masked ? `Accrued so far: ₹${result.accruedInterest.toLocaleString('en-IN')}` : 'Accrued interest: ••••'}
          </Text>
        </View>
      )}
    </Card>
  );
}
