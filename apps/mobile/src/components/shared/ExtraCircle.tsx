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
  /** Locks the toggle ON (unresponsive to taps, real native `Pressable.disabled`) — `BulkCategorizeModal.tsx`/
   *  `ImportCategorizeModal.tsx`'s own Lent/Borrowed circle uses this when the picked category makes
   *  the person mandatory, so it can't be collapsed away from underneath a now-required field
   *  (2026-08-06). `active` should still be passed as `true` alongside this — unlike `locked` below,
   *  there's no separate dimmed look, since the circle is ON, not inert. */
  disabled?: boolean;
  /** Renders dimmed with a small lock badge instead of the normal on/off look — for a circle that
   *  genuinely can't be turned on right now (e.g. `ExpenseForm.tsx`'s Lent/Borrowed circle when the
   *  current category isn't one of the 4 that need a person), as opposed to one that's simply off and
   *  tappable to turn on (Tags/Receipt/Repeat) OR locked on via `disabled` above. Deliberately NOT
   *  `disabled` itself — `onPress` still fires so the caller can explain why (e.g. a toast), only the
   *  appearance changes. Found 2026-08-27: before this, a locked-off circle and an ordinary off circle
   *  rendered identically, giving no visual hint either way until you tapped it. */
  locked?: boolean;
}

/** A circular icon button with a caption below — `ExpenseForm`'s secondary-action style (Tags /
 *  Receipt / Lent / Repeat), extracted so other forms that toggle the same kind of optional panel
 *  (e.g. `BulkCategorizeModal`'s Tags/Lent-Borrowed) can reuse the exact same look instead of a
 *  lookalike. */
export function ExtraCircle({ icon, label, active, accent, onPress, disabled, locked }: ExtraCircleProps) {
  const theme = useThemeColors();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className="items-center gap-1.5"
      style={{ width: 64, opacity: locked ? 0.4 : 1 }}
    >
      <View
        className="w-11 h-11 rounded-full items-center justify-center border relative"
        style={{
          borderColor: active ? accent : theme.border,
          backgroundColor: active ? tint(accent, 12) : theme.surfaceSecondary
        }}
      >
        <Icon name={icon} size={18} color={active ? accent : theme.textTertiary} />
        {locked && (
          <View
            className="absolute -bottom-0.5 -right-0.5 w-[15px] h-[15px] rounded-full items-center justify-center border"
            style={{ backgroundColor: theme.surfaceTertiary, borderColor: theme.surface }}
          >
            <Icon name="ti-lock" size={8} color={theme.textTertiary} />
          </View>
        )}
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
