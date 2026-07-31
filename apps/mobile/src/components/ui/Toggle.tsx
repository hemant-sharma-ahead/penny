import { Pressable, View } from 'react-native';
import { useThemeColors } from '~/theme/useThemeColors';

interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

export function Toggle({ value, onChange, disabled, accessibilityLabel }: ToggleProps) {
  const theme = useThemeColors();
  return (
    <Pressable
      role="switch"
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => onChange(!value)}
      className={`w-11 h-6 rounded-full shrink-0 justify-center ${disabled ? 'opacity-50' : ''}`}
      style={{ backgroundColor: value ? theme.primary : theme.surfaceTertiary }}
    >
      <View className="w-5 h-5 bg-white rounded-full shadow" style={{ transform: [{ translateX: value ? 22 : 2 }] }} />
    </Pressable>
  );
}
