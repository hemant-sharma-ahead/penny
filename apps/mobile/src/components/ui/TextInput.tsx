import { View, Text, TextInput as RNTextInput, type TextInputProps as RNTextInputProps } from 'react-native';
import { FormField } from './FormField';
import { useThemeColors } from '~/theme/useThemeColors';

interface TextInputProps extends Pick<
  RNTextInputProps,
  'placeholder' | 'autoFocus' | 'autoComplete' | 'maxLength' | 'keyboardType' | 'secureTextEntry'
> {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean;
  disabled?: boolean;
  prefix?: string | undefined;
  suffix?: string | undefined;
}

export function TextInput({
  label,
  value,
  onChange,
  error,
  hint,
  required,
  disabled,
  placeholder,
  prefix,
  suffix,
  ...rest
}: TextInputProps) {
  const theme = useThemeColors();
  const inputEl = (
    <View className="relative flex-row items-center">
      {prefix && <Text className="absolute left-3 text-sm text-tertiary z-10">{prefix}</Text>}
      <RNTextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        editable={!disabled}
        className={`bg-surface-2 text-primary border w-full rounded-xl px-3 py-2.5 text-sm ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-10' : ''} ${disabled ? 'opacity-50' : ''}`}
        style={{ borderColor: error ? theme.danger : theme.border }}
        {...rest}
      />
      {suffix && <Text className="absolute right-3 text-sm text-tertiary">{suffix}</Text>}
    </View>
  );

  if (!label) return inputEl;

  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      {inputEl}
    </FormField>
  );
}
