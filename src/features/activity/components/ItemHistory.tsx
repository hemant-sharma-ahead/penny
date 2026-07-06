import { useEffect, useState } from 'react';
import { activityLogRepo } from '@/core/db/repositories';
import type { ActivityLog } from '@/core/db/types';
import { usePrivacy } from '@/context/PrivacyContext';
import { maskAmounts } from '@/lib/maskAmounts';
import { ACTION_META } from '../activityMeta';

interface Props {
  entityId: string;
}

function when(ts: number): string {
  return new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Compact change history for a single record (its own story), shown on edit screens. */
export function ItemHistory({ entityId }: Props) {
  const { shouldMask } = usePrivacy();
  const masked = shouldMask(false);
  const [entries, setEntries] = useState<ActivityLog[]>([]);

  useEffect(() => {
    let cancelled = false;
    activityLogRepo.getAll().then((all) => {
      if (cancelled) return;
      setEntries(all.filter((e) => e.entityId === entityId).sort((a, b) => b.timestamp - a.timestamp));
    });
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  if (entries.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-medium text-secondary mb-1.5">History</p>
      <div className="flex flex-col gap-1.5">
        {entries.map((e) => {
          const meta = ACTION_META[e.action];
          return (
            <div key={e.id} className="flex items-center gap-2">
              <i className={`ti ${meta.icon}`} style={{ fontSize: 13, color: meta.color }} aria-hidden="true" />
              <span className="text-[11px] text-secondary flex-1 min-w-0 truncate">
                {maskAmounts(e.summary, masked)}
              </span>
              <span className="text-[10px] text-tertiary flex-shrink-0">{when(e.timestamp)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
