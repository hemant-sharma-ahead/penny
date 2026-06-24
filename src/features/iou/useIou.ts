import { useMemo, useState } from 'react';
import { personalIousRepo } from '@/core/db/repositories';
import { useRepository } from '@/hooks/useRepository';
import { DAY_MS } from '@/lib/date';

export function useIou() {
  const [nowMs] = useState(() => Date.now());
  const { items: ious, save: saveIou, remove: removeIou } = useRepository(personalIousRepo);

  const iouActive = useMemo(() => ious.filter((i) => !i.isSettled), [ious]);

  const iouHistory = useMemo(
    () =>
      [...ious.filter((i) => i.isSettled)].sort((a, b) => (b.settledAt ?? b.updatedAt) - (a.settledAt ?? a.updatedAt)),
    [ious]
  );

  const iouSortedActive = useMemo(
    () =>
      [...iouActive].sort((a, b) => {
        const aR = a.dueDate !== undefined ? Math.ceil((a.dueDate - nowMs) / DAY_MS) : null;
        const bR = b.dueDate !== undefined ? Math.ceil((b.dueDate - nowMs) / DAY_MS) : null;
        if (aR !== null && aR < 0 && bR !== null && bR < 0) return aR - bR;
        if (aR !== null && aR < 0) return -1;
        if (bR !== null && bR < 0) return 1;
        if (aR !== null && bR !== null) return aR - bR;
        if (aR !== null) return -1;
        if (bR !== null) return 1;
        return b.date - a.date;
      }),
    [iouActive, nowMs]
  );

  const iouTotalLent = useMemo(
    () => iouActive.filter((i) => i.direction === 'lent').reduce((s, i) => s + i.amount, 0),
    [iouActive]
  );

  const iouTotalBorrowed = useMemo(
    () => iouActive.filter((i) => i.direction === 'borrowed').reduce((s, i) => s + i.amount, 0),
    [iouActive]
  );

  const iouOverdueCount = useMemo(
    () => iouActive.filter((i) => i.dueDate !== undefined && i.dueDate < nowMs).length,
    [iouActive, nowMs]
  );

  return {
    ious,
    saveIou,
    removeIou,
    iouActive,
    iouHistory,
    iouSortedActive,
    iouTotalLent,
    iouTotalBorrowed,
    iouOverdueCount,
    nowMs
  };
}
