import { Text, Pressable } from 'react-native';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

interface DismissibleChipProps {
  label: string;
  onDismiss: () => void;
  /** Solid background hex color. Defaults to the theme's brand primary. */
  color?: string;
  icon?: string;
}

export function DismissibleChip({ label, onDismiss, color, icon }: DismissibleChipProps) {
  const theme = useThemeColors();
  return (
    <Pressable
      onPress={onDismiss}
      className="shrink-0 flex-row items-center gap-1 px-3 py-1.5 rounded-full"
      style={{ backgroundColor: color ?? theme.primary }}
    >
      {icon && <Icon name={icon} size={11} color="#fff" />}
      <Text className="text-xs font-medium text-white">{label}</Text>
      <Icon name="ti-x" size={10} color="#fff" />
    </Pressable>
  );
}
