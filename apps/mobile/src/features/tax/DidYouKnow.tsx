import { useState } from 'react';
import { Pressable, View, Text } from 'react-native';
import { tint, ink } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import { Icon } from '~/components/Icon';
import { TAX_FACTS } from '@/core/tax/taxFacts';

/** RN port of apps/web-react/src/features/tax/DidYouKnow.tsx — a tappable "Did you know?" awareness
 *  card that cycles through tax facts. */
export function DidYouKnow() {
  const theme = useThemeColors();
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * TAX_FACTS.length));
  const fact = TAX_FACTS[idx % TAX_FACTS.length];
  const color = theme.info;

  return (
    <Pressable
      onPress={() => setIdx((i) => (i + 1) % TAX_FACTS.length)}
      accessibilityLabel="Show another tax fact"
      className="rounded-xl border p-3 flex-row gap-2"
      style={{ backgroundColor: tint(color, 12), borderColor: tint(color, 30) }}
    >
      <Icon name="ti-bulb" size={16} color={color} />
      <View className="flex-1 gap-0.5">
        <Text
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: ink(color, theme.textPrimary) }}
        >
          Did you know?
        </Text>
        <Text className="text-xs leading-relaxed" style={{ color: ink(color, theme.textPrimary) }}>
          {fact}
        </Text>
        <Text className="text-[10px] mt-0.5" style={{ color: ink(color, theme.textPrimary), opacity: 0.7 }}>
          Tap for another
        </Text>
      </View>
    </Pressable>
  );
}
