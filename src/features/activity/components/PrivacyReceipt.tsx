import { useMemo } from 'react';
import type { ActivityLog } from '@/core/db/types';
import { startOfToday } from '@/lib/date';

interface Props {
  entries: ActivityLog[];
}

/** Slim one-line privacy note for the top of the Timeline feed — living proof of the privacy promise. */
export function PrivacyReceipt({ entries }: Props) {
  const todayCount = useMemo(() => {
    const since = startOfToday();
    return entries.filter((e) => e.timestamp >= since).length;
  }, [entries]);

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-secondary border-b border-theme">
      <i className="ti ti-lock-check" style={{ fontSize: 14, color: 'var(--color-privacy)' }} aria-hidden="true" />
      <span>
        <span className="font-semibold text-primary">{todayCount}</span> change{todayCount === 1 ? '' : 's'} today — all
        stayed on your device.
      </span>
    </div>
  );
}
