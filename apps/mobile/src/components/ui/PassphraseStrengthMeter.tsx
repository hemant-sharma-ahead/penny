import { View, Text } from 'react-native';
import { useThemeColors } from '~/theme/useThemeColors';

const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
// Strength gradient (weak→strong) — domain data, not a status token. Same hex values as web's
// bg-red-400/orange-400/yellow-400/emerald-400/emerald-600 Tailwind defaults.
const STRENGTH_COLORS = ['#f87171', '#fb923c', '#facc15', '#34d399', '#059669'];

/** Five-bar passphrase strength meter driven by a zxcvbn score (0–4). */
export function PassphraseStrengthMeter({ score }: { score: number }) {
  const theme = useThemeColors();
  return (
    <View className="mt-2">
      <View className="flex-row gap-1 mb-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <View
            key={i}
            className="h-1 flex-1 rounded-full"
            style={{ backgroundColor: i <= score ? STRENGTH_COLORS[score] : theme.border }}
          />
        ))}
      </View>
      <View className="flex-row justify-between items-center">
        <Text className="text-xs text-secondary">{STRENGTH_LABELS[score]}</Text>
        {score < 3 && (
          <Text className="text-xs" style={{ color: theme.warning }}>
            Need a stronger passphrase
          </Text>
        )}
      </View>
    </View>
  );
}
