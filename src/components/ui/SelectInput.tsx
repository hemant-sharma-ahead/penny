import { FormField } from './FormField';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: string;
}

export function SelectInput({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
  disabled,
  error,
  hint
}: SelectInputProps) {
  const selectEl = (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        style={error ? { borderColor: 'var(--color-open)' } : undefined}
        className="input-surface border w-full rounded-xl px-3 py-2.5 text-sm appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <i
        className="ti ti-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-tertiary pointer-events-none"
        style={{ fontSize: 14 }}
        aria-hidden="true"
      />
    </div>
  );

  if (!label) return selectEl;

  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      {selectEl}
    </FormField>
  );
}
