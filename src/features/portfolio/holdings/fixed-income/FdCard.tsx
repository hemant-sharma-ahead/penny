import { Card, IconBadge, ProgressBar } from '@/components/ui';
import { calcFdMaturity } from '@/core/fd/fdCalculations';
import type { CompoundingFreq } from '@/core/fd/fdCalculations';
import type { Holding } from '@/core/db/types';
import { nowMs } from '@/features/portfolio/holdings/shared/helpers';

// View card for a Fixed Deposit — principal, rate, maturity progress and
// projected/accrued interest.
export function FdCard({ holding, onEdit, mode }: { holding: Holding; onEdit: () => void; mode: string }) {
  const meta = holding.assetMeta ?? {};
  const principal = holding.investedAmount;
  const rate = holding.interestRate ?? 0;
  const startMs = meta.fdStartDate ?? null;
  const maturityMs = holding.maturityDate ?? null;
  const freq: CompoundingFreq = meta.fdCompoundingFreq ?? 'quarterly';
  const bank = meta.fdBank ?? '';

  const result =
    principal > 0 && rate > 0 && startMs && maturityMs
      ? calcFdMaturity(principal, rate, startMs, maturityMs, freq, nowMs())
      : null;

  const maturityDateStr = maturityMs
    ? new Date(maturityMs).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const startDateStr = startMs
    ? new Date(startMs).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
    : null;

  const freqLabel: Record<CompoundingFreq, string> = {
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    'half-yearly': 'Half-yearly',
    yearly: 'Yearly',
    at_maturity: 'At maturity'
  };

  return (
    <Card onClick={onEdit} padding="sm" className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <IconBadge icon="ti-building-bank" color="#f59e0b" bg="#f59e0b15" size="sm" />
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
              <span className="text-[9px] text-tertiary">{freqLabel[freq]}</span>
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

      {/* Progress bar + dates */}
      {result && (
        <div className="flex flex-col gap-1">
          <ProgressBar value={result.pctElapsed} animate />
          <div className="flex justify-between">
            <p className="text-[9px] text-tertiary">{startDateStr}</p>
            <p className="text-[9px] text-tertiary">
              {result.isMatured ? 'Matured' : `${result.daysRemaining} days left`} · {maturityDateStr}
            </p>
          </div>
        </div>
      )}

      {/* Value row */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] text-tertiary mb-0.5">Principal</p>
          <p className="text-sm font-semibold text-primary tabular-nums">
            {mode === 'open' ? `₹${principal.toLocaleString('en-IN')}` : '••••'}
          </p>
          {!result && maturityDateStr && <p className="text-[10px] text-tertiary mt-0.5">Matures {maturityDateStr}</p>}
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
              +₹{result.totalInterest.toLocaleString('en-IN')} ({((result.totalInterest / principal) * 100).toFixed(1)}
              %)
            </p>
          </div>
        )}
      </div>

      {/* Accrued interest */}
      {result && !result.isMatured && result.accruedInterest > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl" style={{ backgroundColor: '#10b98110' }}>
          <i className="ti ti-trending-up" style={{ fontSize: 13, color: '#10b981' }} aria-hidden="true" />
          <p className="text-[10px] font-medium" style={{ color: '#10b981' }}>
            {mode === 'open'
              ? `Accrued so far: ₹${result.accruedInterest.toLocaleString('en-IN')}`
              : 'Accrued interest: ••••'}
          </p>
        </div>
      )}
    </Card>
  );
}
