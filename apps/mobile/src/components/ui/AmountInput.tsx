import { useState } from 'react';
import { View, TextInput as RNTextInput, Text } from 'react-native';
import { FormField } from './FormField';
import { amountToWords } from '@/lib/amountToWords';
import { formatField, groupForDisplay, isExpression as checkIsExpression, resolve, sanitize } from '@/lib/amountInput';
import { useThemeColors } from '~/theme/useThemeColors';

interface AmountInputProps {
  label?: string;
  /** Plain numeric string the parent stores — e.g. '1200' or '1234.5', '' when empty. */
  value: string;
  /** Emits the evaluated plain numeric string (no grouping commas), or '' when empty. */
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Currency prefix shown inside the field. Defaults to '₹'. */
  prefix?: string;
  /** Show the live amount-in-words helper line beneath the field. Defaults to true. */
  showWords?: boolean;
  /** Hero style: large, centered, borderless, accent-coloured number with words beneath (no box). */
  hero?: boolean;
  /** Number hex color in hero mode (e.g. the transaction-type accent). Ignored when `error` is set. */
  accentColor?: string;
}

/**
 * Amount entry field with live Indian-grouped display, an inline calculator (`120+45`), and an
 * amount-in-words helper beneath. RN port note: skips web's caret-position restoration after each
 * re-format (DOM-selection-specific, see packages/core/src/lib/amountInput.ts's comment) — a minor,
 * accepted UX simplification, not a functional gap (the value/onChange contract is identical).
 */
export function AmountInput({
  label,
  value,
  onChange,
  placeholder = '0',
  error,
  hint,
  required,
  disabled,
  autoFocus,
  prefix = '₹',
  showWords = true,
  hero = false,
  accentColor
}: AmountInputProps) {
  const theme = useThemeColors();
  const [text, setText] = useState(() => groupForDisplay(value));

  const isExpression = checkIsExpression(text);
  const numeric = Number(value);
  const words = showWords && value !== '' && Number.isFinite(numeric) && numeric !== 0 ? amountToWords(numeric) : '';

  const handleChange = (raw: string) => {
    const sanitized = sanitize(raw);
    setText(formatField(sanitized));
    const r = resolve(sanitized);
    onChange(r === null ? '' : String(r));
  };

  const handleBlur = () => {
    const r = resolve(sanitize(text));
    onChange(r === null ? '' : String(r));
    setText(r === null ? '' : groupForDisplay(String(r)));
  };

  const helper = words ? (
    <Text className="text-xs text-tertiary">
      {isExpression && (
        <Text className="font-medium text-secondary">
          = {prefix}
          {groupForDisplay(value)} ·{' '}
        </Text>
      )}
      {words}
    </Text>
  ) : null;

  if (hero) {
    const heroColor = error ? theme.danger : (accentColor ?? theme.textPrimary);
    return (
      <View className="items-center gap-1">
        <View className="flex-row items-baseline justify-center gap-1.5">
          <Text style={{ color: theme.textTertiary, fontSize: 26, fontWeight: '600' }}>{prefix}</Text>
          <RNTextInput
            value={text}
            onChangeText={handleChange}
            onBlur={handleBlur}
            placeholder={placeholder}
            placeholderTextColor={theme.textTertiary}
            editable={!disabled}
            autoFocus={autoFocus}
            keyboardType="decimal-pad"
            accessibilityLabel="Amount"
            style={{ fontSize: 42, fontWeight: '700', color: heroColor, padding: 0, minWidth: 40 }}
          />
        </View>
        {error ? (
          <Text className="text-xs text-center" style={{ color: theme.danger }}>
            {error}
          </Text>
        ) : (
          helper
        )}
      </View>
    );
  }

  const inputEl = (
    <View className="relative flex-row items-center">
      {prefix && <Text className="absolute left-3 text-sm text-tertiary z-10">{prefix}</Text>}
      <RNTextInput
        value={text}
        onChangeText={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        editable={!disabled}
        autoFocus={autoFocus}
        keyboardType="decimal-pad"
        className={`bg-surface-2 text-primary border w-full rounded-xl px-3 py-2.5 text-sm ${prefix ? 'pl-7' : ''} ${disabled ? 'opacity-50' : ''}`}
        style={{ borderColor: error ? theme.danger : theme.border }}
      />
    </View>
  );

  if (!label) {
    return (
      <>
        {inputEl}
        {helper}
      </>
    );
  }

  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      {inputEl}
      {helper}
    </FormField>
  );
}
