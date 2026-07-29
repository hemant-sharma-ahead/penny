import { STATUS, tint } from '@/lib/statusColors';
import { formatCurrency, formatCompact } from '@/lib/formatters';
import type { DisplayTransferPair } from '../useImport';

/** One detected "self-transfer" pair rendered as a single compact "Account A → Account B" card instead
 *  of two separate line items — see the approved mockup's "Merged Transfer Diagram". When either leg
 *  is a duplicate/skipped row (`alreadyImported`), the pair is still shown — never silently dropped
 *  from this list — but dimmed to the same tertiary/neutral tone used for "duplicate" elsewhere on the
 *  review screen, with an "Already imported" tag instead of "Transfer", and it is NOT counted or
 *  written (see confirmedTransferPairs in useImport.ts). */
export function TransferPairCard({ pair }: { pair: DisplayTransferPair }) {
  const dimmed = pair.alreadyImported;
  const accentColor = dimmed ? STATUS.neutral : STATUS.info;

  return (
    <div
      className="rounded-xl p-3 flex items-center gap-2"
      style={{ backgroundColor: tint(accentColor, 10), border: `1px solid ${tint(accentColor, 30)}` }}
    >
      <div className="flex-1 min-w-0 text-center">
        <p className={`text-[11px] font-extrabold truncate ${dimmed ? 'text-tertiary' : 'text-primary'}`}>
          {pair.fromAccount}
        </p>
        <p className="text-[9.5px] text-secondary">-{formatCurrency(pair.amount)}</p>
      </div>
      <div className="flex flex-col items-center flex-shrink-0" style={{ color: accentColor }}>
        <i className="ti ti-arrow-narrow-right" style={{ fontSize: 18 }} aria-hidden="true" />
        <span className="text-xs font-extrabold">{formatCompact(pair.amount)}</span>
        <span className="text-[9.5px] font-bold uppercase tracking-wide">
          {dimmed ? 'Already imported' : 'Transfer'}
        </span>
      </div>
      <div className="flex-1 min-w-0 text-center">
        <p className={`text-[11px] font-extrabold truncate ${dimmed ? 'text-tertiary' : 'text-primary'}`}>
          {pair.toAccount}
        </p>
        <p className="text-[9.5px] font-semibold" style={{ color: dimmed ? undefined : STATUS.success }}>
          +{formatCurrency(pair.amount)}
        </p>
      </div>
    </div>
  );
}
