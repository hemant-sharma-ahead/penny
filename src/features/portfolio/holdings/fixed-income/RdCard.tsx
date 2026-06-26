import { Card, IconBadge, ProgressBar } from '@/components/ui';
import { calcRdMaturity } from '@/core/fd/fdCalculations';
import type { Holding } from '@/core/db/types';
import { nowMs } from '@/features/portfolio/holdings/shared/helpers';

// View card for a Recurring Deposit — monthly installment, rate, months-completed
// progress and projected maturity.
export function RdCard({ holding, onEdit, mode }: { holding: Holding; onEdit: () => void; mode: string }) {
  const meta = holding.assetMeta ?? {};
  const monthlyInstallment = meta.rdMonthlyInstallment ?? holding.investedAmount;
  const rate = holding.interestRate ?? 0;
  const tenureMonths = meta.rdTenureMonths ?? 0;
  const startMs = meta.fdStartDate ?? null;
  const bank = meta.fdBank ?? '';

  const result =
    monthlyInstallment > 0 && rate > 0 && tenureMonths > 0 && startMs
      ? calcRdMaturity(monthlyInstallment, rate, tenureMonths, startMs, nowMs())
      : null;

  const startDateStr = startMs
    ? new Date(startMs).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : null;
  const maturityMs = startMs ? startMs + tenureMonths * 30.4375 * 24 * 3600 * 1000 : null;
  const maturityDateStr = maturityMs
    ? new Date(maturityMs).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : null;

  return (
    <Card onClick={onEdit} padding="sm" className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <IconBadge icon="ti-calendar-repeat" color="#6366f1" bg="#6366f115" size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary truncate">{holding.name}</p>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              {bank && <span className="text-[10px] text-secondary">{bank}</span>}
              {rate > 0 && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: '#10b98115', color: '#10b981' }}
                >
                  {rate}% p.a.
                </span>
              )}
              {tenureMonths > 0 && <span className="text-[9px] text-tertiary">{tenureMonths} months</span>}
            </div>
          </div>
        </div>
        {result?.isMatured ? (
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: '#10b98115', color: '#10b981' }}
          >
            MATURED
          </span>
        ) : (
          <i
            className="ti ti-chevron-right text-tertiary flex-shrink-0 mt-1"
            style={{ fontSize: 15 }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Progress bar + installments */}
      {result && (
        <div className="flex flex-col gap-1">
          <ProgressBar value={result.pctElapsed} animate />
          <div className="flex justify-between">
            <p className="text-[9px] text-tertiary">
              {result.monthsCompleted}/{tenureMonths} months · {startDateStr}
            </p>
            <p className="text-[9px] text-tertiary">
              {result.isMatured ? 'Matured' : `${result.monthsRemaining} left`} · {maturityDateStr}
            </p>
          </div>
        </div>
      )}

      {/* Value row */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] text-tertiary mb-0.5">Monthly</p>
          <p className="text-sm font-semibold text-primary tabular-nums">
            {mode === 'open' ? `₹${monthlyInstallment.toLocaleString('en-IN')}/mo` : '••••'}
          </p>
          {result && (
            <p className="text-[10px] text-tertiary mt-0.5">
              Deposited: {mode === 'open' ? `₹${result.totalDeposited.toLocaleString('en-IN')}` : '••••'}
            </p>
          )}
        </div>
        {result && (
          <div className="text-right">
            <p className="text-[10px] text-tertiary mb-0.5">
              {result.isMatured ? 'Maturity amount' : 'Projected maturity'}
            </p>
            <p className="text-lg font-bold tabular-nums" style={{ color: '#10b981' }}>
              {mode === 'open' ? `₹${result.maturityAmount.toLocaleString('en-IN')}` : '••••'}
            </p>
            <p className="text-[9px] font-medium" style={{ color: '#10b981' }}>
              +₹{result.totalInterest.toLocaleString('en-IN')} interest
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
