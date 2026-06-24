// Shared building blocks for the financial calculator screens — labeled inputs,
// a segmented toggle, and result rows/cards. Mirrors the visual language of the
// existing Loan Scenarios page.
import type { ReactNode } from 'react';
import { MaskedValue } from '@/components/privacy/MaskedValue';
import { formatCurrency } from '@/lib/formatters';

interface LabeledInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
}

export function LabeledInput({ label, value, onChange, hint, placeholder, prefix, suffix }: LabeledInputProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-xs font-medium text-secondary">{label}</label>
        {hint && <span className="text-[10px] text-tertiary">{hint}</span>}
      </div>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-sm pointer-events-none select-none text-tertiary">{prefix}</span>
        )}
        <input
          type="number"
          inputMode="decimal"
          className="w-full rounded-xl border py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
          style={{ paddingLeft: prefix ? '1.75rem' : '0.75rem', paddingRight: suffix ? '2.5rem' : '0.75rem' }}
          placeholder={placeholder ?? '0'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && (
          <span className="absolute right-3 text-sm pointer-events-none select-none text-tertiary">{suffix}</span>
        )}
      </div>
    </div>
  );
}

interface SegmentedToggleProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

export function SegmentedToggle<T extends string>({ label, value, options, onChange }: SegmentedToggleProps<T>) {
  return (
    <div>
      <label className="text-xs font-medium text-secondary mb-1 block">{label}</label>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="py-2.5 rounded-xl border text-xs font-medium transition-colors"
            style={
              value === o.value
                ? { backgroundColor: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                : {
                    backgroundColor: 'transparent',
                    color: 'var(--color-text-secondary)',
                    borderColor: 'var(--color-border)'
                  }
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ResultRowProps {
  label: string;
  value: string;
  accent?: boolean;
  saving?: boolean;
}

export function ResultRow({ label, value, accent, saving }: ResultRowProps) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-secondary">{label}</span>
      <span
        className="text-sm font-semibold"
        style={{ color: saving ? '#10b981' : accent ? 'var(--color-primary)' : 'var(--color-text-primary)' }}
      >
        {value}
      </span>
    </div>
  );
}

/** Result row whose value is a rupee amount — masked outside Open mode. */
interface AmountRowProps {
  label: string;
  amount: number;
  accent?: boolean;
  saving?: boolean;
}

export function AmountRow({ label, amount, accent, saving }: AmountRowProps) {
  const colorClass = saving ? 'text-[#10b981]' : accent ? 'text-[var(--color-primary)]' : 'text-primary';
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-secondary">{label}</span>
      <MaskedValue value={formatCurrency(amount)} className={`text-sm font-semibold ${colorClass}`} />
    </div>
  );
}

export function ResultCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl p-4 surface">
      <p className="text-xs font-semibold mb-2 uppercase tracking-wide text-tertiary">{title}</p>
      <div className="divide-y divide-[var(--color-border)]">{children}</div>
    </div>
  );
}

export function HeroResult({ label, amount, note }: { label: string; amount: number; note?: string }) {
  return (
    <div className="surface rounded-2xl p-5 text-center">
      <p className="text-xs mb-1 text-secondary">{label}</p>
      <MaskedValue value={formatCurrency(amount)} className="text-3xl font-semibold text-primary" />
      {note && <p className="text-xs mt-1 text-tertiary">{note}</p>}
    </div>
  );
}
