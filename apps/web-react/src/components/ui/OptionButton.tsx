interface OptionButtonProps {
  label: string;
  /** Tabler icon class, e.g. 'ti-trending-up' */
  icon?: string;
  /** Shown below the label in smaller text (non-compact mode only) */
  description?: string;
  selected: boolean;
  onClick: () => void;
  /** Border + text color when selected. Defaults to --color-primary. */
  color?: string;
  disabled?: boolean;
  /** Compact vertical tile: icon above label, no description. Use in tight 3–4-column grids. */
  compact?: boolean;
}

export function OptionButton({
  label,
  icon,
  description,
  selected,
  onClick,
  color,
  disabled,
  compact = false
}: OptionButtonProps) {
  const activeColor = color ?? 'var(--color-primary)';
  const selectedStyle = {
    borderColor: activeColor,
    color: activeColor,
    backgroundColor: `${activeColor}14`
  };
  const unselectedStyle = {
    borderColor: 'var(--color-border)',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-surface-secondary)'
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex flex-col items-center gap-1 rounded-xl border-2 p-2 text-[10px] font-medium text-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={selected ? selectedStyle : unselectedStyle}
      >
        {icon && (
          <i
            className={`ti ${icon} flex-shrink-0`}
            style={{ fontSize: 18, color: selected ? activeColor : 'var(--color-text-tertiary)' }}
            aria-hidden="true"
          />
        )}
        <span className="leading-tight">{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-xs font-medium text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full"
      style={selected ? selectedStyle : unselectedStyle}
    >
      {icon && (
        <i
          className={`ti ${icon} flex-shrink-0`}
          style={{ fontSize: 15, color: selected ? activeColor : 'var(--color-text-secondary)' }}
          aria-hidden="true"
        />
      )}
      <span className="flex flex-col gap-0.5 min-w-0">
        <span>{label}</span>
        {description && (
          <span className="text-[10px] font-normal" style={{ color: 'var(--color-text-tertiary)' }}>
            {description}
          </span>
        )}
      </span>
    </button>
  );
}
