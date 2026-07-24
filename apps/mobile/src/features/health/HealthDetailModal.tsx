import { View, Text } from 'react-native';
import { Modal, AmountInput, SectionLabel } from '~/components/ui';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { HealthScore } from '@/core/health/scorer';
import { ScoreGauge } from './ScoreGauge';
import { ComponentCard } from './ComponentCard';
import { ScoringGuide } from './ScoringGuide';

/**
 * The full Financial-Health breakdown — the "See all" / info detail behind the Home health card.
 * State (score + income) is owned by the Home card (via `useHealthScore`) and passed in, so entering
 * income here updates the Home ring live.
 */
export function HealthDetailModal({
  healthScore,
  monthlyIncome,
  setMonthlyIncome,
  incomeNeeded,
  onClose
}: {
  healthScore: HealthScore | null;
  monthlyIncome: string;
  setMonthlyIncome: (v: string) => void;
  incomeNeeded: boolean;
  onClose: () => void;
}) {
  const theme = useThemeColors();

  return (
    <Modal onClose={onClose} title="Financial Health" scrollable>
      <View className="gap-4">
        <Text className="text-xs text-tertiary -mt-1">
          On-device · updates as you add data · nothing leaves your device.
        </Text>

        <View
          className="rounded-2xl border p-4"
          style={{
            backgroundColor: tint(incomeNeeded ? theme.warning : theme.success, 8),
            borderColor: tint(incomeNeeded ? theme.warning : theme.success, 35)
          }}
        >
          <AmountInput
            label="Monthly take-home income"
            placeholder="e.g. 80,000"
            value={monthlyIncome}
            onChange={setMonthlyIncome}
          />
        </View>

        {healthScore && (
          <>
            <View className="rounded-2xl px-4 pt-4 pb-3 bg-surface">
              <View className="w-48 self-center">
                <ScoreGauge score={healthScore.total} color={healthScore.color} />
              </View>
              <View className="items-center -mt-2">
                <Text
                  className="text-base font-semibold px-3 py-1 rounded-full"
                  style={{ backgroundColor: tint(healthScore.color), color: healthScore.color }}
                >
                  {healthScore.grade} · {healthScore.gradeLabel}
                </Text>
              </View>
              <Text className="text-xs text-center mt-2 text-tertiary">
                {incomeNeeded
                  ? 'Enter income above to score Savings Rate and Debt-to-Income'
                  : 'Based on your current data across 6 dimensions'}
              </Text>
            </View>

            <SectionLabel className="-mb-2">Score breakdown</SectionLabel>
            <View className="flex-row flex-wrap gap-3">
              {healthScore.components.map((c) => (
                <View key={c.key} className="w-[47%]">
                  <ComponentCard c={c} />
                </View>
              ))}
            </View>
            <ScoringGuide />
          </>
        )}
      </View>
    </Modal>
  );
}
