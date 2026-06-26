import type { ReactNode } from 'react';
import { STATUS, tint, ink, type StatusKey } from '@/lib/statusColors';

type StatBoxSize = 'sm' | 'md';

interface StatBoxProps {
  label: string;
  value: ReactNode;
  /** Status tone — tints the background/border and colors the label + footer. Omit for a neutral cell. */
  tone?: StatusKey;
  /** Compact ('sm') inline cell vs prominent ('md', default) summary tile. */
  size?: StatBoxSize;
  /** Overrides the value text color (e.g. STATUS.success for a positive amount). */
  valueColor?: string;
  /** Muted line under the value. */
  sub?: ReactNode;
  /** Emphasized line below (tone-colored), e.g. "Est. tax: ₹X". */
  footer?: ReactNode;
  className?: string;
}

const BOX = {
  sm: { pad: 'rounded-xl p-2.5', value: 'text-xs' },
  md: { pad: 'rounded-2xl p-3', value: 'text-lg' }
} as const;

/**
 * A label + value summary cell. Neutral by default (surface-2); pass a `tone` for a tinted,
 * status-colored variant (e.g. the capital-gains summary tiles). Theme-aware via tokens.
 */
export function StatBox({ label, value, tone, size = 'md', valueColor, sub, footer, className = '' }: StatBoxProps) {
  const color = tone && tone !== 'neutral' ? STATUS[tone] : null;
  const box = BOX[size];

  return (
    <div
      className={`border ${box.pad} ${color ? '' : 'bg-surface-2 border-theme'} ${className}`}
      style={color ? { backgroundColor: tint(color, 10), borderColor: tint(color, 25) } : undefined}
    >
      <p
        className={`text-[10px] font-semibold uppercase tracking-wide ${color ? '' : 'text-tertiary'}`}
        style={color ? { color: ink(color) } : undefined}
      >
        {label}
      </p>
      <p
        className={`${box.value} font-bold mt-1 tabular-nums ${valueColor ? '' : 'text-primary'}`}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </p>
      {sub !== undefined && <p className="text-[10px] text-secondary mt-0.5">{sub}</p>}
      {footer !== undefined && (
        <p className="text-xs font-semibold mt-1" style={color ? { color } : undefined}>
          {footer}
        </p>
      )}
    </div>
  );
}
