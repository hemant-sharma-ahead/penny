import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FormField } from './FormField';
import { amountToWords } from '@/lib/amountToWords';

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

/** Characters permitted while typing — digits, decimal, and calculator operators. */
const ALLOWED = /[^0-9.+\-*/]/g;
const HAS_OPERATOR = /[+\-*/]/;

/** Strips grouping commas and any other disallowed characters. */
function sanitize(s: string): string {
  return s.replace(ALLOWED, '');
}

/** Indian-grouped display of a plain numeric string, preserving any decimal part. */
function groupForDisplay(raw: string): string {
  if (!raw) return '';
  const negative = raw.startsWith('-');
  const [intPart = '', decPart] = raw.replace('-', '').split('.');
  if (!intPart && decPart === undefined) return '';
  let grouped: string;
  if (intPart.length <= 3) {
    grouped = intPart || '0';
  } else {
    const tail = intPart.slice(-3);
    const head = intPart.slice(0, -3);
    const groups: string[] = [];
    for (let i = head.length; i > 0; i -= 2) {
      groups.unshift(head.slice(Math.max(0, i - 2), i));
    }
    grouped = [...groups, tail].join(',');
  }
  return `${negative ? '-' : ''}${grouped}${decPart !== undefined ? `.${decPart}` : ''}`;
}

/** What to show in the field: group plain numbers, leave calculator expressions raw. */
function formatField(sanitized: string): string {
  return HAS_OPERATOR.test(sanitized) ? sanitized : groupForDisplay(sanitized);
}

/** Caret position after `n` non-comma characters in the formatted string. */
function caretAfter(formatted: string, n: number): number {
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] !== ',') count++;
    if (count >= n) return i + 1;
  }
  return formatted.length;
}

/**
 * Evaluates a simple arithmetic expression (+ − × ÷, left-to-right with ×÷
 * precedence). Returns null for empty/invalid input. No `eval` — tokenised and
 * folded by hand so it's safe on untrusted strings.
 */
function evaluate(expr: string): number | null {
  const tokens = expr.match(/(\d*\.?\d+|[+\-*/])/g);
  if (!tokens || tokens.length === 0) return null;

  const nums: number[] = [];
  const ops: string[] = [];
  let expectNumber = true;
  for (const t of tokens) {
    if (HAS_OPERATOR.test(t) && t.length === 1) {
      if (expectNumber) return null; // operator where a number was expected
      ops.push(t);
      expectNumber = true;
    } else {
      const n = parseFloat(t);
      if (!Number.isFinite(n)) return null;
      nums.push(n);
      expectNumber = false;
    }
  }
  if (expectNumber) return null; // trailing operator → incomplete

  // Pass 1: × and ÷
  for (let i = 0; i < ops.length; ) {
    const op = ops[i];
    if (op === '*' || op === '/') {
      const a = nums[i];
      const b = nums[i + 1];
      if (a === undefined || b === undefined) return null;
      const r = op === '*' ? a * b : b === 0 ? NaN : a / b;
      if (!Number.isFinite(r)) return null;
      nums.splice(i, 2, r);
      ops.splice(i, 1);
    } else {
      i++;
    }
  }
  // Pass 2: + and −
  let acc = nums[0];
  if (acc === undefined) return null;
  for (let i = 0; i < ops.length; i++) {
    const b = nums[i + 1];
    if (b === undefined) return null;
    acc = ops[i] === '+' ? acc + b : acc - b;
  }
  return Number.isFinite(acc) ? acc : null;
}

/** Best-effort numeric value of a draft, tolerating a trailing operator. */
function resolve(draft: string): number | null {
  const direct = evaluate(draft);
  if (direct !== null) return direct;
  const trimmed = draft.replace(/[+\-*/.]+$/, '');
  return trimmed ? evaluate(trimmed) : null;
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

  const isExpression = HAS_OPERATOR.test(text);
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
