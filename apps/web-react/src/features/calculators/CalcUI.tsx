// Shared building blocks for the financial calculator screens. These are thin adapters over the
// app's shared component library (TextInput, SegmentedControl, DetailRow-style rows) so the
// calculators inherit the same theming and behaviour as the rest of Penny.
import type { ReactNode } from 'react';
import { MaskedValue } from '@/components/privacy/MaskedValue';
import { TextInput, SegmentedControl } from '@/components/ui';
import { STATUS } from '@/lib/statusColors';
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
    <TextInput
      label={label}
      value={value}
      onChange={onChange}
      hint={hint}
      placeholder={placeholder ?? '0'}
      prefix={prefix}
      suffix={suffix}
      type="number"
      inputMode="decimal"
    />
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
      <SegmentedControl options={options} value={value} onChange={onChange} />
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
        style={{ color: saving ? STATUS.success : accent ? 'var(--color-primary)' : 'var(--color-text-primary)' }}
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
  const colorClass = saving ? 'text-success' : accent ? 'text-[var(--color-primary)]' : 'text-primary';
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
