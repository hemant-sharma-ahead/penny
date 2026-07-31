import { View, Pressable, Text } from 'react-native';
import { useThemeColors } from '~/theme/useThemeColors';

/** Compact segmented control for an optional field — tap the active segment again to clear it.
 *  Distinct from SegmentedControl (which requires a value and doesn't support clearing) because these
 *  Life & household fields are deliberately clearable. Shared by Edit Profile and onboarding. */
export function OptionalSeg({
  options,
  value,
  onChange
}: {
  options: { value: string; label: string }[];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const theme = useThemeColors();
  return (
    <View className="flex-row bg-surface-2 border border-theme rounded-lg p-0.5 gap-0.5">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(on ? undefined : o.value)}
            className={`px-2.5 py-1.5 rounded-md ${on ? 'bg-surface' : ''}`}
          >
            <Text className="text-[11.5px] font-semibold" style={{ color: on ? theme.primary : theme.textSecondary }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
