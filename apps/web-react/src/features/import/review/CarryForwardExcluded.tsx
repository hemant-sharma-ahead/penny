import { useState } from 'react';
import { formatCurrency } from '@/lib/formatters';
import { STATUS, tint } from '@/lib/statusColors';
import type { ParsedRow } from '@/core/import/importParsers';

function fmtShortDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface CarryForwardExcludedProps {
  rows: ParsedRow[];
}

/**
 * Surfaces MoneyView-style monthly carry-forward markers ("Cash Forward" et al) that were excluded from
 * the batch — see `importCarryForward.ts`'s `identifyRedundantCarryForwardRows()`. Structurally distinct
 * from both `UnparsedRows` (those are structurally broken, unparseable rows) and a duplicate/skipped row
 * (a user or dedup decision) — this is neither: it's a real, successfully-parsed row that Penny simply
 * doesn't need to write, because an earlier occurrence for the same account already represents that
 * same leftover cash. Informational only (nothing to "fix" here), but never silently dropped — shown
 * distinctly so the user can see exactly what was left out and why, per the project's standing
 * never-silently-drop-import-data principle.
 */
export function CarryForwardExcluded({ rows }: CarryForwardExcludedProps) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return null;

  return (
    <div
      className="rounded-xl overflow-hidden bg-surface-3"
      style={{ border: `1px solid ${tint(STATUS.neutral, 45)}` }}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-2 p-3 text-left"
      >
        <span className="text-xs font-bold text-secondary flex items-center gap-1.5">
          <i className="ti ti-recycle text-tertiary" aria-hidden="true" />
          {rows.length} recurring carry-forward marker{rows.length !== 1 ? 's' : ''} excluded
        </span>
        <i className={`ti ti-chevron-${expanded ? 'up' : 'down'} text-tertiary`} aria-hidden="true" />
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-theme flex flex-col gap-1.5 pt-2">
          <p className="text-[10.5px] text-tertiary leading-relaxed">
            Already reflected in your other transactions — only the earliest carry-forward marker per account is
            imported (as that account's starting balance); later ones each repeat the same leftover cash and would
            double-count it.
          </p>
          <div className="flex flex-col divide-y divide-dashed divide-[var(--color-border)]">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-[10.5px] py-1.5">
                <span className="text-secondary truncate">
                  {row.account ? `${row.account} · ` : ''}
                  {fmtShortDate(row.date)}
                </span>
                <span className="font-semibold text-tertiary flex-shrink-0">{formatCurrency(row.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
