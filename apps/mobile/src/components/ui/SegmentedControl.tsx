import { View, Pressable, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Optional Tabler icon class, e.g. 'ti-trending-up' */
  icon?: string;
  /** Hex color for the active state background. Defaults to the theme's brand primary. */
  color?: string;
  /** Renders dimmed and non-interactive — for options that exist but aren't available yet. */
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  // Note: web's `cols` (explicit CSS grid column count for multi-row layouts) is dropped — RN has no
  // grid primitive; this always lays out as one flex-wrap row of equal-width segments. Revisit with a
  // real `cols` prop (chunking options into rows) if Track 4 needs a multi-row caller.
}

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  const theme = useThemeColors();
  return (
    <View className="flex-row flex-wrap gap-1.5 p-1 rounded-xl bg-surface-2">
      {options.map((opt) => {
        const active = opt.value === value;
        const activeColor = opt.color ?? theme.primary;
        return (
          <Pressable
            key={opt.value}
            disabled={opt.disabled}
            onPress={() => onChange(opt.value)}
            className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-lg"
            style={[active ? { backgroundColor: activeColor } : undefined, opt.disabled ? { opacity: 0.4 } : undefined]}
          >
            {opt.icon && <Icon name={opt.icon} size={14} color={active ? '#fff' : theme.textSecondary} />}
            <Text className="text-xs font-semibold" style={{ color: active ? '#fff' : theme.textSecondary }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
