import { useEffect, useRef, useState } from 'react';
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
  /** Hero-mode alignment — `'center'` (default, unchanged) or `'right'` (a smaller variant that sits
   *  beside another control, e.g. `ExpenseForm.tsx`'s combined category+amount row). */
  heroAlign?: 'center' | 'right';
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
  accentColor,
  heroAlign = 'center'
}: AmountInputProps) {
  const theme = useThemeColors();
  const [text, setText] = useState(() => groupForDisplay(value));
  const isFocusedRef = useRef(false);
  // Hero-mode-only sizing state (both `heroAlign` variants) — see the `if (hero)` block below for why.
  const [heroContainerWidth, setHeroContainerWidth] = useState(0);
  const [heroPrefixWidth, setHeroPrefixWidth] = useState(0);
  const [heroMeasuredTextWidth, setHeroMeasuredTextWidth] = useState(0);

  // Re-sync when `value` changes from outside (autofill, loading an existing record into an edit
  // form) — matching web's AmountInput.tsx effect. RN has no `document.activeElement`, so a focus ref
  // stands in for it; never resync while the user is actively typing, same guard web has.
  useEffect(() => {
    if (isFocusedRef.current) return;
    setText(groupForDisplay(value));
  }, [value]);

  const isExpression = checkIsExpression(text);
  const numeric = Number(value);
  const words = showWords && value !== '' && Number.isFinite(numeric) && numeric !== 0 ? amountToWords(numeric) : '';

  const handleFocus = () => {
    isFocusedRef.current = true;
  };

  const handleChange = (raw: string) => {
    const sanitized = sanitize(raw);
    setText(formatField(sanitized));
    const r = resolve(sanitized);
    onChange(r === null ? '' : String(r));
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
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
    const isRight = heroAlign === 'right';
    const fontSize = isRight ? 28 : 42;
    const prefixFontSize = isRight ? 17 : 26;
    const lineHeight = Math.ceil(fontSize * 1.2);

    // Unlike `Text`, RN's `TextInput` doesn't intrinsically size its own box to its current value —
    // left unconstrained it renders at some platform-decided default width regardless of content, so
    // a short value ("10") shows a visible gap before its aligned digits (box wider than the text)
    // while a long one ("1,00,00,000") overflows past a box narrower than the text needs. Fixed by
    // measuring the actual rendered text width (a hidden mirror `Text`, same font, below) and the
    // space actually available (`onLayout` on the outer row), then sizing the real input to match,
    // capped so it can never overflow onto a sibling (e.g. the category tile in `ExpenseForm.tsx`'s
    // combined category+amount row).
    const rawWidth = heroMeasuredTextWidth > 0 ? heroMeasuredTextWidth + 8 : 40;
    const cap = heroContainerWidth > 0 ? Math.max(40, heroContainerWidth - heroPrefixWidth - 8) : undefined;
    const inputWidth = cap !== undefined ? Math.min(rawWidth, cap) : rawWidth;

    return (
      <View
        className={isRight ? 'items-end gap-1' : 'items-center gap-1'}
        onLayout={(e) => setHeroContainerWidth(e.nativeEvent.layout.width)}
      >
        <View className={`flex-row items-baseline gap-1.5 ${isRight ? 'justify-end' : 'justify-center'}`}>
          <Text
            style={{ color: theme.textTertiary, fontSize: prefixFontSize, fontWeight: '600' }}
            onLayout={(e) => setHeroPrefixWidth(e.nativeEvent.layout.width)}
          >
            {prefix}
          </Text>
          {/* Invisible — measured via onLayout only, never shown. Same font as the real input below,
           *  so its rendered width is what the real input should be sized to. */}
          <Text
            style={{ position: 'absolute', opacity: 0, fontSize, fontWeight: '700', lineHeight }}
            onLayout={(e) => setHeroMeasuredTextWidth(e.nativeEvent.layout.width)}
          >
            {text || placeholder}
          </Text>
          <RNTextInput
            value={text}
            onChangeText={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            placeholderTextColor={theme.textTertiary}
            editable={!disabled}
            autoFocus={autoFocus}
            keyboardType="decimal-pad"
            accessibilityLabel="Amount"
            textAlignVertical="center"
            style={{
              fontSize,
              // Explicit `lineHeight` (was missing) — at this large a fontSize, letting it fall back
              // to the platform default risked the glyph's own ascent being taller than the line box
              // and getting clipped at the top, since `includeFontPadding: false` (Android) already
              // strips the font's own built-in vertical padding.
              lineHeight,
              fontWeight: '700',
              color: heroColor,
              padding: 0,
              includeFontPadding: false,
              // Was `isRight ? 'right' : 'left'` — 'left' never matched this mode's actually-centered
              // intent (the row/outer View both center it); harmless while the box hugged its content
              // exactly, but worth being correct now that width is explicitly computed.
              textAlign: isRight ? 'right' : 'center',
              width: inputWidth
            }}
          />
        </View>
        {error ? (
          <Text className={isRight ? 'text-xs text-right' : 'text-xs text-center'} style={{ color: theme.danger }}>
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
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        editable={!disabled}
        autoFocus={autoFocus}
        keyboardType="decimal-pad"
        textAlignVertical="center"
        className={`bg-surface-2 text-primary border w-full rounded-xl px-3 py-2.5 text-sm ${prefix ? 'pl-7' : ''} ${disabled ? 'opacity-50' : ''}`}
        style={{ borderColor: error ? theme.open : theme.border, includeFontPadding: false }}
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
