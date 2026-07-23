import { useMemo } from 'react';
import type { ActivityLog } from '@/core/db/types';
import { maskAmounts } from '@/lib/maskAmounts';

interface Props {
  entries: ActivityLog[];
  masked: boolean;
}

/** Nostalgic "a year (or more) ago today" memory from the same calendar day in a past year. */
export function OnThisDay({ entries, masked }: Props) {
  const memories = useMemo(() => {
    const now = new Date();
    return entries
      .filter((e) => {
        const d = new Date(e.timestamp);
        return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() < now.getFullYear();
      })
      .slice(0, 3);
  }, [entries]);

  if (memories.length === 0) return null;

  return (
    <div className="surface rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <i
          className="ti ti-calendar-heart"
          style={{ fontSize: 16, color: 'var(--color-primary)' }}
          aria-hidden="true"
        />
        <p className="text-sm font-semibold text-primary">On this day</p>
      </div>
      <div className="flex flex-col gap-1.5">
        {memories.map((e) => (
          <p key={e.id} className="text-xs text-secondary">
            <span className="text-tertiary">{new Date(e.timestamp).getFullYear()}:</span>{' '}
            {maskAmounts(e.summary, masked)}
          </p>
        ))}
      </div>
    </div>
  );
}
