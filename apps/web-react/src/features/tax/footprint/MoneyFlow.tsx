import { formatCurrency, formatPercent } from '@/lib/formatters';
import { STATUS } from '@/lib/statusColors';
import type { IncomeWaterfall } from '@/core/tax/incomeWaterfall';

// Every rupee of gross splits four ways (they sum to gross):
//   savings + direct tax + indirect tax + real consumption.
interface Segment {
  key: string;
  label: string;
  amount: number;
  color: string;
}

function segments(w: IncomeWaterfall): Segment[] {
  return [
    { key: 'savings', label: 'Saved & invested', amount: Math.max(0, w.totalSavings), color: STATUS.success },
    { key: 'direct', label: 'Direct tax', amount: w.directTax, color: STATUS.danger },
    { key: 'indirect', label: 'Indirect tax', amount: w.indirectTax, color: STATUS.warning },
    { key: 'real', label: 'Real spending', amount: Math.max(0, w.realConsumption), color: STATUS.info }
  ];
}

/** A stacked proportion bar showing how every rupee of gross income was used. */
export function MoneyFlow({ waterfall }: { waterfall: IncomeWaterfall }) {
  const segs = segments(waterfall);
  const total = segs.reduce((s, x) => s + x.amount, 0) || 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-4 rounded-full overflow-hidden bg-surface-2">
        {segs.map((s) =>
          s.amount > 0 ? (
            <div
              key={s.key}
              style={{ width: `${(s.amount / total) * 100}%`, backgroundColor: s.color }}
              className="h-full"
              title={`${s.label}: ${formatCurrency(Math.round(s.amount))}`}
            />
          ) : null
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {segs.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[11px] text-secondary truncate">{s.label}</span>
              <span className="text-xs font-semibold text-primary tabular-nums">
                {formatCurrency(Math.round(s.amount))}{' '}
                <span className="text-[10px] text-tertiary font-normal">
                  ({formatPercent((s.amount / total) * 100)})
                </span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Step {
  label: string;
  amount: number;
  kind: 'in' | 'out' | 'total';
}

/** The gross → in-hand → spend/savings step-down, as a compact ledger. */
export function WaterfallSteps({ waterfall: w }: { waterfall: IncomeWaterfall }) {
  const steps: Step[] = [
    { label: 'Gross income', amount: w.gross, kind: 'in' },
    { label: 'EPF / PF (saved)', amount: -w.epf, kind: 'out' },
    { label: 'Professional tax + LWF', amount: -w.statutoryLevies, kind: 'out' },
    { label: 'Income tax', amount: -w.incomeTax, kind: 'out' },
    { label: 'In-hand', amount: w.inHand, kind: 'total' },
    { label: 'Spent', amount: -w.trackedSpend, kind: 'out' },
    {
      label: w.overspent ? 'Dipped into savings' : 'Discretionary savings',
      amount: w.discretionarySavings,
      kind: 'total'
    }
  ];

  return (
    <div className="flex flex-col">
      {steps.map((s, i) => {
        const isTotal = s.kind === 'total';
        const color = s.kind === 'out' ? STATUS.danger : s.amount < 0 ? STATUS.danger : STATUS.success;
        return (
          <div
            key={s.label}
            className={`flex items-center justify-between py-1.5 ${i > 0 ? 'border-t border-theme' : ''}`}
          >
            <span className={`text-xs ${isTotal ? 'font-semibold text-primary' : 'text-secondary'}`}>{s.label}</span>
            <span
              className="text-xs font-semibold tabular-nums"
              style={{ color: isTotal ? 'var(--color-text-primary)' : color }}
            >
              {s.amount < 0 ? '−' : ''}
              {formatCurrency(Math.abs(Math.round(s.amount)))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
