import { ProgressBar } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { STATUS } from '@/lib/statusColors';

interface DeductionBarProps {
  used: number;
  limit: number;
  label: string;
}

/** A labelled deduction-utilisation bar with used/limit amounts and a "remaining" hint. */
export function DeductionBar({ used, limit, label }: DeductionBarProps) {
  const pct = Math.min(100, (used / limit) * 100);
  const remaining = Math.max(0, limit - used);
  const color = pct >= 100 ? STATUS.success : pct >= 70 ? STATUS.warning : 'var(--color-primary)';

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs font-semibold text-primary">{label}</span>
        <span className="text-[11px] text-secondary">
          {formatCurrency(used)} / {formatCurrency(limit)}
        </span>
      </div>
      <ProgressBar value={pct} color={color} size="md" animate />
      {remaining > 0 ? (
        <p className="text-[10px] mt-1 text-tertiary">{formatCurrency(remaining)} remaining to invest this FY</p>
      ) : (
        <p className="text-[10px] text-success mt-1 font-medium">Limit fully utilised</p>
      )}
    </div>
  );
}
