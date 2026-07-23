import { View, Text } from 'react-native';

/** Track 1 skeleton placeholder — real screens land feature-by-feature in Track 4. */
export function PlaceholderScreen({ label }: { label: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-surface-tertiary">
      <Text className="text-text-primary text-lg font-medium">{label}</Text>
      <Text className="text-text-secondary mt-1">Ported in Track 4</Text>
    </View>
  );
}
