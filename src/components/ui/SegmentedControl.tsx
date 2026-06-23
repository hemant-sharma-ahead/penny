interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Optional Tabler icon class, e.g. 'ti-trending-up' */
  icon?: string;
  /** CSS color for the active state background. Defaults to --color-primary. */
  color?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Number of columns. Defaults to options.length (all in one row). */
  cols?: number;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  cols
}: SegmentedControlProps<T>) {
  const gridCols = cols ?? options.length;
  const gridClass =
    gridCols === 2
      ? 'grid-cols-2'
      : gridCols === 3
        ? 'grid-cols-3'
        : gridCols === 4
          ? 'grid-cols-4'
          : 'grid-cols-2';

  return (
    <div className={`grid ${gridClass} gap-1.5 p-1 rounded-xl bg-surface-2`}>
      {options.map((opt) => {
        const active = opt.value === value;
        const activeColor = opt.color ?? 'var(--color-primary)';
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={
              active
                ? { backgroundColor: activeColor, color: '#fff' }
                : { color: 'var(--color-text-secondary, #6b7280)' }
            }
          >
            {opt.icon && (
              <i className={`ti ${opt.icon}`} style={{ fontSize: 14 }} aria-hidden="true" />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
