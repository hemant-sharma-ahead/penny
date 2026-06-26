interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

export function Toggle({ value, onChange, disabled, 'aria-label': ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className="w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ backgroundColor: value ? 'var(--color-primary)' : 'var(--color-surface-3, #d1d5db)' }}
    >
      <span
        className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${
          value ? 'translate-x-[22px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  );
}
