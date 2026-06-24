import { Card, ProgressBar, Badge } from '@/components/ui';
import { ListRow } from '@/components/shared';
import { STATUS } from '@/lib/statusColors';
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
      <ListRow
        icon="ti-building-bank"
        iconColor="#f59e0b"
        iconBg="#f59e0b15"
        iconSize="sm"
        title={<p className="text-sm font-semibold text-primary truncate">{holding.name}</p>}
        subtitle={
          <div className="flex items-center gap-1.5 flex-wrap">
            {bank && <span className="text-[10px] text-secondary">{bank}</span>}
            {rate > 0 && <Badge label={`${rate}% p.a.`} color={STATUS.success} size="sm" />}
            <span className="text-[9px] text-tertiary">{freqLabel[freq]}</span>
          </div>
        }
        right={
          result?.isMatured ? (
            <Badge label="MATURED" color={STATUS.success} size="sm" />
          ) : (
            <i className="ti ti-chevron-right text-tertiary" style={{ fontSize: 15 }} aria-hidden="true" />
          )
        }
      />

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
            <p className="text-lg font-bold tabular-nums text-success">
              {mode === 'open' ? `₹${result.maturityAmount.toLocaleString('en-IN')}` : '••••'}
            </p>
            <p className="text-[9px] font-medium text-success">
              +₹{result.totalInterest.toLocaleString('en-IN')} ({((result.totalInterest / principal) * 100).toFixed(1)}
              %)
            </p>
          </div>
        )}
      </div>

      {/* Accrued interest */}
      {result && !result.isMatured && result.accruedInterest > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-success-subtle">
          <i className="ti ti-trending-up text-success" style={{ fontSize: 13 }} aria-hidden="true" />
          <p className="text-[10px] font-medium text-success">
            {mode === 'open'
              ? `Accrued so far: ₹${result.accruedInterest.toLocaleString('en-IN')}`
              : 'Accrued interest: ••••'}
          </p>
        </div>
      )}
    </Card>
  );
}
