import { View, TextInput as RNTextInput, Pressable } from 'react-native';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }: SearchInputProps) {
  const theme = useThemeColors();
  return (
    <View className={`flex-row items-center gap-2 rounded-xl px-3 py-2 border border-theme bg-surface-2 ${className}`}>
      <Icon name="ti-search" size={15} color={theme.textTertiary} />
      <RNTextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        textAlignVertical="center"
        style={{ includeFontPadding: false }}
        className="flex-1 text-sm text-primary"
      />
      {value && (
        <Pressable onPress={() => onChange('')} accessibilityLabel="Clear search">
          <Icon name="ti-x" size={13} color={theme.textTertiary} />
        </Pressable>
      )}
    </View>
  );
}
