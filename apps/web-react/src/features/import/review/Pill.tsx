import type { ReactNode } from 'react';
import { STATUS, tint } from '@/lib/statusColors';

interface PillProps {
  children: ReactNode;
  /** Currently-selected action for this row/tile — filled primary treatment. */
  active?: boolean;
  /** Core-suggested action (e.g. "Mark as Transfer" for a likely-transfer category) not yet chosen —
   *  a distinct info-tinted treatment so the suggestion stands out from the other plain pills. */
  suggested?: boolean;
  icon?: string;
  /** Tighter padding/font for a dense 4-pill row (the category tile's action row) that must fit — or
   *  horizontally scroll — on one line. */
  compact?: boolean;
  onClick: () => void;
}

/**
 * Small pill-shaped action button for the import review screen's dense per-account/per-category
 * action rows (up to 4 per category tile). components/ui/Button.tsx has no compact pill variant and
 * this is single-consumer (the import review screen only) — per penny-standards.md's shared/ rule,
 * a component used by exactly one feature belongs in that feature's folder, not components/ui/.
 */
export function Pill({ children, active, suggested, icon, compact, onClick }: PillProps) {
  const style: React.CSSProperties = active
    ? { backgroundColor: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#fff' }
    : suggested
      ? { backgroundColor: tint(STATUS.info, 12), borderColor: tint(STATUS.info, 45), color: STATUS.info }
      : { backgroundColor: 'transparent', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 font-bold rounded-full border whitespace-nowrap flex-shrink-0 transition-colors ${
        compact ? 'text-[9.5px] px-2 py-1' : 'text-[10.5px] px-2.5 py-1'
      }`}
      style={style}
    >
      {icon && <i className={`ti ${icon}`} style={{ fontSize: 11 }} aria-hidden="true" />}
      {children}
    </button>
  );
}
