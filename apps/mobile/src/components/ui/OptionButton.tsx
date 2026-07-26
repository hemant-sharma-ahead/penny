import { View, Pressable, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

interface OptionButtonProps {
  label: string;
  /** Tabler icon class, e.g. 'ti-trending-up' */
  icon?: string;
  /** Shown below the label in smaller text (non-compact mode only) */
  description?: string;
  selected: boolean;
  onPress: () => void;
  /** Border + text hex color when selected. Defaults to the theme's brand primary. */
  color?: string;
  disabled?: boolean;
  /** Compact vertical tile: icon above label, no description. Use in tight 3–4-column grids. */
  compact?: boolean;
}

export function OptionButton({
  label,
  icon,
  description,
  selected,
  onPress,
  color,
  disabled,
  compact = false
}: OptionButtonProps) {
  const theme = useThemeColors();
  const activeColor = color ?? theme.primary;
  const selectedStyle = { borderColor: activeColor, backgroundColor: `${activeColor}14` };
  const unselectedStyle = { borderColor: theme.border, backgroundColor: theme.surfaceSecondary };

  if (compact) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        className={`items-center gap-1 rounded-xl border-2 p-2 ${disabled ? 'opacity-40' : ''}`}
        style={selected ? selectedStyle : unselectedStyle}
      >
        {icon && <Icon name={icon} size={18} color={selected ? activeColor : theme.textTertiary} />}
        <Text
          className="text-[10px] font-medium text-center leading-tight"
          style={{ color: selected ? activeColor : theme.textSecondary }}
        >
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`flex-row items-center gap-2 rounded-xl border-2 px-3 py-2.5 w-full ${disabled ? 'opacity-40' : ''}`}
      style={selected ? selectedStyle : unselectedStyle}
    >
      {icon && <Icon name={icon} size={15} color={selected ? activeColor : theme.textSecondary} />}
      <View className="flex-col gap-0.5 shrink">
        <Text className="text-xs font-medium" style={{ color: selected ? activeColor : theme.textSecondary }}>
          {label}
        </Text>
        {description && (
          <Text className="text-[10px] font-normal" style={{ color: theme.textTertiary }}>
            {description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
