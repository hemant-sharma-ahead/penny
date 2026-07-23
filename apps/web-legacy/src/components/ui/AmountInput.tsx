import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FormField } from './FormField';
import { amountToWords } from '@/lib/amountToWords';
import { formatField, groupForDisplay, isExpression as checkIsExpression, resolve, sanitize } from '@/lib/amountInput';

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
  /** Number colour in hero mode (e.g. the transaction-type accent). Ignored when `error` is set. */
  accentColor?: string;
}

/** Caret position after `n` non-comma characters in the formatted string. Web-only (DOM selection
 * math) — apps/mobile's port skips caret restoration, see packages/core/src/lib/amountInput.ts. */
function caretAfter(formatted: string, n: number): number {
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] !== ',') count++;
    if (count >= n) return i + 1;
  }
  return formatted.length;
}

/**
 * Amount entry field with live Indian-grouped display, an inline calculator
 * (`120+45`), and an amount-in-words helper beneath. Stores a plain numeric
 * string via `onChange`; grouping is presentation-only.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);
  const [text, setText] = useState(() => groupForDisplay(value));

  // Re-sync when the value is changed from outside (e.g. autofill, editing a
  // record) — but never while the user is actively typing in this field.
  useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    setText(groupForDisplay(value));
  }, [value]);

  // Restore the caret after a grouped re-render so inserted commas don't push it.
  useLayoutEffect(() => {
    if (caretRef.current !== null && inputRef.current && document.activeElement === inputRef.current) {
      inputRef.current.setSelectionRange(caretRef.current, caretRef.current);
    }
    caretRef.current = null;
  });

  const isExpression = checkIsExpression(text);
  const numeric = Number(value);
  const words = showWords && value !== '' && Number.isFinite(numeric) && numeric !== 0 ? amountToWords(numeric) : '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const caret = e.target.selectionStart ?? raw.length;
    const sanitized = sanitize(raw);
    const display = formatField(sanitized);
    caretRef.current = caretAfter(display, sanitize(raw.slice(0, caret)).length);
    setText(display);
    const r = resolve(sanitized);
    onChange(r === null ? '' : String(r));
  };

  const handleBlur = () => {
    const r = resolve(sanitize(text));
    onChange(r === null ? '' : String(r));
    setText(r === null ? '' : groupForDisplay(String(r)));
  };

  const inputEl = (
    <div className="relative flex items-center">
      {prefix && <span className="absolute left-3 text-sm text-tertiary pointer-events-none">{prefix}</span>}
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        style={error ? { borderColor: 'var(--color-open)' } : undefined}
        className={[
          'input-surface border w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]',
          prefix ? 'pl-7' : ''
        ]
          .filter(Boolean)
          .join(' ')}
      />
    </div>
  );

  const helper = words ? (
    <p className="text-xs text-tertiary">
      {isExpression && (
        <span className="font-medium text-secondary">
          = {prefix}
          {groupForDisplay(value)} ·{' '}
        </span>
      )}
      {words}
    </p>
  ) : null;

  if (hero) {
    const heroColor = error ? 'var(--color-danger)' : (accentColor ?? 'var(--color-text-primary)');
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-baseline justify-center gap-1.5">
          <span style={{ color: 'var(--color-text-tertiary)', fontSize: 26, fontWeight: 600 }}>{prefix}</span>
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={text}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            aria-label="Amount"
            className="bg-transparent border-0 text-center p-0 leading-none focus:outline-none"
            style={{
              width: `${Math.max((text || placeholder || '0').length, 1) + 0.5}ch`,
              fontSize: 42,
              fontWeight: 700,
              color: heroColor
            }}
          />
        </div>
        {error ? (
          <p className="text-xs text-center" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        ) : (
          helper
        )}
      </div>
    );
  }

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
