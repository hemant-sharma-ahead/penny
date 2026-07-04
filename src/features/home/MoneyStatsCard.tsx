import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/router/paths';
import { formatCompact, formatCurrency } from '@/lib/formatters';
import { useHomeStats } from './useHomeStats';

/**
 * The Home "money facts" card (Track: Home advisor) — one card, three hairline-split columns:
 * Spent this month (living subtext) · Insurance cover · Loans outstanding. Each column taps through.
 */
export function MoneyStatsCard() {
  const stats = useHomeStats();
  const navigate = useNavigate();
  if (!stats) return null;

  const cols: { key: string; icon: string; color: string; label: string; value: string; sub: string; to: string }[] = [
    {
      key: 'spent',
      icon: 'ti-receipt',
      color: 'var(--color-danger)',
      label: 'Spent',
      value: formatCurrency(stats.spentThisMonth),
      sub: `Living ${formatCompact(stats.livingThisMonth)}`,
      to: PATHS.app.expenses
    },
    {
      key: 'insurance',
      icon: 'ti-shield',
      color: 'var(--color-info)',
      label: 'Insurance',
      value: stats.insuranceCover > 0 ? formatCompact(stats.insuranceCover) : '—',
      sub: 'cover',
      to: PATHS.app.insurance
    },
    {
      key: 'loans',
      icon: 'ti-building-bank',
      color: '#06b6d4',
      label: 'Loans',
      value: stats.loansOutstanding > 0 ? formatCompact(stats.loansOutstanding) : '—',
      sub: 'outstanding',
      to: PATHS.app.loans
    }
  ];

  return (
    <div className="surface rounded-2xl mb-4 overflow-hidden">
      <div className="flex">
        {cols.map((c, i) => (
          <button
            key={c.key}
            type="button"
            onClick={() => navigate(c.to)}
            className={`flex-1 text-left px-3 py-3 ${i > 0 ? 'border-l border-theme' : ''}`}
          >
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-secondary">
              <i className={`ti ${c.icon}`} style={{ fontSize: 12, color: c.color }} aria-hidden="true" />
              {c.label}
            </span>
            <span className="block text-[15px] font-extrabold text-primary tracking-tight mt-1">{c.value}</span>
            <span className="block text-[9px] text-tertiary mt-0.5">{c.sub}</span>
          </button>
        ))}
      </div>

      {/* Tax — a line into the Tax Awareness screen (Tax has no Home tile of its own). */}
      <button
        type="button"
        onClick={() => navigate(PATHS.app.tax)}
        className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-theme text-left active:bg-surface-2"
      >
        <i className="ti ti-receipt-tax" style={{ fontSize: 14, color: '#8b5cf6' }} aria-hidden="true" />
        <span className="text-[12px] font-semibold text-primary">Tax story</span>
        <span className="text-[11px] text-tertiary truncate">· where your money really goes this FY</span>
        <i
          className="ti ti-chevron-right text-tertiary ml-auto flex-shrink-0"
          style={{ fontSize: 15 }}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
