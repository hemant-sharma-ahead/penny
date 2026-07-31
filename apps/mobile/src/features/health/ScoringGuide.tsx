import { View, Text } from 'react-native';

const SCORING_RULES: [string, string, string][] = [
  ['Emergency Fund', '20 pts', '6+ months of expenses'],
  ['Savings Rate', '20 pts', '30%+ of income saved'],
  ['Debt-to-Income', '20 pts', '≤20% of income on EMIs'],
  ['Insurance', '15 pts', 'Life + health coverage'],
  ['Goals on Track', '15 pts', 'All active goals progressing'],
  ['Diversification', '10 pts', '4+ asset classes']
];

/** Static reference card explaining how each health-score dimension is weighted. */
export function ScoringGuide() {
  return (
    <View className="rounded-2xl p-4 bg-surface-2 border border-theme">
      <Text className="text-xs font-semibold mb-2 text-secondary">How it's scored</Text>
      <View className="gap-1">
        {SCORING_RULES.map(([label, pts, target]) => (
          <View key={label} className="flex-row items-baseline justify-between gap-2">
            <Text className="text-[11px] text-secondary">{label}</Text>
            <Text className="text-[10px] flex-shrink-0 text-tertiary">
              {pts} · {target}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
