interface TabOption<T extends string> {
  value: T;
  label: string;
  /** Optional Tabler icon class, e.g. 'ti-chart-bar' */
  icon?: string;
  /** Badge count shown as a small pill on the tab */
  count?: number;
}

interface TabStripProps<T extends string> {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Allow the strip to scroll horizontally when there are many tabs */
  scrollable?: boolean;
}

export function TabStrip<T extends string>({
  options,
  value,
  onChange,
  scrollable = false
}: TabStripProps<T>) {
  return (
    <div
      className={`flex border-b border-theme ${scrollable ? 'overflow-x-auto scrollbar-none' : ''}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={[
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
              active
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-tertiary hover:text-secondary'
            ].join(' ')}
          >
            {opt.icon && (
              <i className={`ti ${opt.icon}`} style={{ fontSize: 15 }} aria-hidden="true" />
            )}
            {opt.label}
            {opt.count !== undefined && opt.count > 0 && (
              <span
                className="text-xs font-semibold rounded-full px-1.5 py-0.5 leading-none"
                style={{
                  backgroundColor: active ? 'var(--color-primary)' : 'var(--color-surface-3, #e5e7eb)',
                  color: active ? '#fff' : 'var(--color-text-secondary)'
                }}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
