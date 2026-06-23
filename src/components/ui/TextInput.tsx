import type { InputHTMLAttributes } from 'react';
import { FormField } from './FormField';

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'size' | 'onChange'> {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  prefix?: string;
  suffix?: string;
}

export function TextInput({
  label,
  value,
  onChange,
  error,
  hint,
  required,
  prefix,
  suffix,
  disabled,
  placeholder,
  type = 'text',
  inputMode,
  autoFocus,
  autoComplete,
  maxLength,
  id,
  name
}: TextInputProps) {
  const inputEl = (
    <div className="relative flex items-center">
      {prefix && <span className="absolute left-3 text-sm text-tertiary pointer-events-none">{prefix}</span>}
      <input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        maxLength={maxLength}
        style={error ? { borderColor: 'var(--color-open)' } : undefined}
        className={['input-surface w-full rounded-xl px-3 py-2.5 text-sm', prefix ? 'pl-7' : '', suffix ? 'pr-10' : '']
          .filter(Boolean)
          .join(' ')}
      />
      {suffix && <span className="absolute right-3 text-sm text-tertiary pointer-events-none">{suffix}</span>}
    </div>
  );

  if (!label) return inputEl;

  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      {inputEl}
    </FormField>
  );
}
