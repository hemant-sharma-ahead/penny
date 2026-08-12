import { View, Pressable, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';

interface ExtraCircleProps {
  icon: string;
  label: string;
  active: boolean;
  accent: string;
  onPress: () => void;
  /** Locks the toggle on (unresponsive to taps) — the Lent/Borrowed circle uses this when the
   *  selected category makes the person mandatory, so it can't be collapsed away from underneath a
   *  now-required field (2026-08-06). `active` should still be passed as `true` alongside this. */
  disabled?: boolean;
}

/** A circular icon button with a caption below — `ExpenseForm`'s secondary-action style (Tags /
 *  Receipt / Lent / Repeat), extracted so other forms that toggle the same kind of optional panel
 *  (e.g. `BulkCategorizeModal`'s Tags/Lent-Borrowed) can reuse the exact same look instead of a
 *  lookalike. */
export function ExtraCircle({ icon, label, active, accent, onPress, disabled }: ExtraCircleProps) {
  const theme = useThemeColors();
  return (
    <Pressable disabled={disabled} onPress={onPress} className="items-center gap-1.5" style={{ width: 64 }}>
      <View
        className="w-11 h-11 rounded-full items-center justify-center border"
        style={{
          borderColor: active ? accent : theme.border,
          backgroundColor: active ? tint(accent, 12) : theme.surfaceSecondary
        }}
      >
        <Icon name={icon} size={18} color={active ? accent : theme.textTertiary} />
      </View>
      <Text
        className="text-[10px] font-medium leading-none"
        style={{ color: active ? theme.textPrimary : theme.textTertiary }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
