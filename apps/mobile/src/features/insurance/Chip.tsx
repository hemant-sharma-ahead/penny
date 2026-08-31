import { Pressable, Text } from 'react-native';
import { useThemeColors } from '~/theme/useThemeColors';

interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

/** Small selectable pill — duration presets, discount value, NCB slabs (insurance-redesign-v4.html's
 *  `.chip`/`.chip.active`). Distinct from `~/components/ui/DismissibleChip`, which is for a removable
 *  tag (always has an "x"), not a single-select option. */
export function Chip({ label, active, onPress }: ChipProps) {
  const theme = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      className="px-2.5 py-1.5 rounded-lg border"
      style={{
        borderColor: active ? theme.primary : theme.border,
        backgroundColor: active ? theme.primary : theme.surfaceSecondary
      }}
    >
      <Text className="text-[10px] font-bold" style={{ color: active ? '#04140d' : theme.textSecondary }}>
        {label}
      </Text>
    </Pressable>
  );
}
