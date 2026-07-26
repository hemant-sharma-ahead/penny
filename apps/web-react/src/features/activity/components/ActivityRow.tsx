import type { ActivityLog } from '@/core/db/types';
import { maskAmounts } from '@/lib/maskAmounts';
import { ACTION_META } from '../activityMeta';
import { DiffChips } from './DiffChips';

interface Props {
  entry: ActivityLog;
  masked: boolean;
  onRestore?: (id: string) => void;
  restoring?: boolean;
}

function timeOf(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function ActivityRow({ entry, masked, onRestore, restoring }: Props) {
  const meta = ACTION_META[entry.action];
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ backgroundColor: `${meta.color}18` }}
      >
        <i className={`ti ${meta.icon}`} style={{ fontSize: 16, color: meta.color }} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-primary leading-snug">{maskAmounts(entry.summary, masked)}</p>
        {entry.diff && <DiffChips diff={entry.diff} masked={masked} />}
        <p className="text-[10px] text-tertiary mt-0.5">{timeOf(entry.timestamp)}</p>
      </div>
      {onRestore && (
        <button
          type="button"
          onClick={() => onRestore(entry.id)}
          disabled={restoring}
          className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg bg-surface-2 disabled:opacity-50"
          style={{ color: 'var(--color-primary)' }}
        >
          Restore
        </button>
      )}
    </div>
  );
}
