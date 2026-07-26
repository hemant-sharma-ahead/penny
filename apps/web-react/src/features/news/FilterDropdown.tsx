import { useState } from 'react';

export interface FilterDropdownOption {
  value: string;
  label: string;
  /** Optional trailing count (e.g. how many headlines mention this stock). */
  count?: number;
}

interface FilterDropdownProps {
  label: string;
  value: string;
  options: FilterDropdownOption[];
  onChange: (value: string) => void;
}

/**
 * Compact "in-field label" dropdown — small uppercase label, bold current value, chevron — for filters
 * that only have a handful of options (source, tone, holding). Trades the always-visible chip row for
 * less horizontal space so 2-3 filters fit on one line. Dismiss pattern matches ContextSwitcher /
 * PrivacyModeSwitcher (full-screen invisible backdrop), not SelectInput's portal (no scroll-container
 * escape needed here).
 */
export function FilterDropdown({ label, value, options, onChange }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full text-left rounded-xl border px-2.5 py-1.5 transition-colors"
        style={{ borderColor: open ? 'var(--color-primary)' : 'var(--color-border)' }}
      >
        <span className="block text-[9px] font-semibold uppercase tracking-wide text-tertiary leading-none">
          {label}
        </span>
        <span className="flex items-center justify-between gap-1 mt-0.5">
          <span
            className="text-xs font-semibold truncate"
            style={{ color: open ? 'var(--color-primary)' : 'var(--color-text-primary)' }}
          >
            {selected?.label ?? '—'}
          </span>
          <i
            className="ti ti-chevron-down flex-shrink-0 transition-transform"
            style={{
              fontSize: 12,
              color: open ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
              transform: open ? 'rotate(180deg)' : undefined
            }}
            aria-hidden="true"
          />
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="listbox"
            className="absolute left-0 top-full mt-1 z-50 min-w-full w-max max-w-[220px] bg-surface border border-theme rounded-xl shadow-2xl overflow-hidden"
          >
            {options.map((opt) => {
              const sel = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={sel}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-left whitespace-nowrap"
                  style={
                    sel
                      ? { color: 'var(--color-primary)', backgroundColor: 'var(--color-surface-2)' }
                      : { color: 'var(--color-text-secondary)' }
                  }
                >
                  <span className="truncate">{opt.label}</span>
                  {sel ? (
                    <i className="ti ti-check flex-shrink-0" style={{ fontSize: 12 }} aria-hidden="true" />
                  ) : opt.count !== undefined ? (
                    <span className="text-[10px] text-tertiary flex-shrink-0">{opt.count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
