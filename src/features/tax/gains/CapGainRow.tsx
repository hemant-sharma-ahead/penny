import type { CapGainItem } from '@/core/tax/calculator';
import { formatCurrency } from '@/lib/formatters';
import { STATUS } from '@/lib/statusColors';

/** A single holding's realised/unrealised gain row with long-term progress and estimated tax. */
export function CapGainRow({ item }: { item: CapGainItem }) {
  const isGain = item.gain > 0;
  const isLoss = item.gain < 0;
  const daysToLT = item.ltThresholdDays - item.holdingDays;
  const gainColor = isGain ? STATUS.success : isLoss ? STATUS.danger : STATUS.neutral;

  return (
    <div className="rounded-xl p-3 surface">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate text-primary">{item.name}</p>
          <p className="text-[11px] mt-0.5 text-tertiary">
            {item.assetClass.toUpperCase()} · {item.holdingDays}d held ·{' '}
            {item.isLongTerm ? (
              <span className="text-success font-medium">Long-term</span>
            ) : daysToLT > 0 ? (
              <span className="text-warning font-medium">{daysToLT}d to long-term</span>
            ) : (
              <span className="text-secondary">Short-term</span>
            )}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold" style={{ color: gainColor }}>
            {isGain ? '+' : ''}
            {formatCurrency(Math.abs(item.gain))}
          </p>
          <p className="text-[10px] text-tertiary">
            {item.gainPct >= 0 ? '+' : ''}
            {item.gainPct.toFixed(1)}%
          </p>
        </div>
      </div>

      {item.gain > 0 && item.taxRatePct !== null && (
        <div className="mt-2 pt-2 flex items-center justify-between border-t border-theme">
          <span className="text-[10px] text-tertiary">
            Est. tax @ {item.taxRatePct}%
            {!item.isLongTerm && item.assetClass === 'stock' ? ' (STCG)' : item.isLongTerm ? ' (LTCG)' : ''}
          </span>
          <span className="text-[11px] font-semibold text-secondary">
            {item.estimatedTax !== null ? formatCurrency(Math.round(item.estimatedTax)) : 'At slab rate'}
          </span>
        </div>
      )}
      {item.gain > 0 && item.taxRatePct === null && (
        <div className="mt-2 pt-2 border-t border-theme">
          <span className="text-[10px] text-tertiary">Taxed at your income slab rate</span>
        </div>
      )}
    </div>
  );
}
