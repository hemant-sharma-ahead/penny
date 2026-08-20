import { forwardRef } from 'react';
import { View, TextInput as RNTextInput, type TextInputProps as RNTextInputProps, Text } from 'react-native';
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
  /** Extra classes merged onto the inner `RNTextInput` only (not the field wrapper) — matches web's own
   *  `TextInput`'s `inputClassName` prop, e.g. `"text-center tracking-widest text-lg"` for PIN fields.
   *  Found missing via the 2026-07-25 parity sweep: PIN entry everywhere on mobile used the plain
   *  left-aligned default instead of web's large/centered/letter-spaced digit styling. */
  inputClassName?: string;
}

/**
 * Forwards its ref straight to the inner `RNTextInput` (added 2026-08-20, item 32/36 real-device
 * testing pass) — lets a caller apply this app's established `Modal`'s `onShow` + ref → `.focus()`
 * fix for "autoFocus inside a native Modal doesn't reliably work" (already used by `ExpenseForm.tsx`'s
 * raw description field) anywhere that uses this wrapped component instead of a raw `RNTextInput`.
 * No `useImperativeHandle` needed — this wrapper adds no extra layer around the input itself, so the
 * real `RNTextInput` instance (exposing `.focus()`/`.blur()`/etc.) is forwarded directly.
 */
export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(
  {
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
    inputClassName = '',
    ...rest
  },
  ref
) {
  const theme = useThemeColors();
  const inputEl = (
    <View className="relative flex-row items-center">
      {prefix && <Text className="absolute left-3 text-sm text-tertiary z-10">{prefix}</Text>}
      <RNTextInput
        ref={ref}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        editable={!disabled}
        textAlignVertical="center"
        className={`bg-surface-2 text-primary border w-full rounded-xl px-3 py-2.5 text-sm ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-10' : ''} ${disabled ? 'opacity-50' : ''} ${inputClassName}`}
        style={{ borderColor: error ? theme.open : theme.border, includeFontPadding: false }}
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
});
