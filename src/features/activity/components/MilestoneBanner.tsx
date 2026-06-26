import { useEffect, useMemo, useState } from 'react';
import type { ActivityLog } from '@/core/db/types';
import { detectMilestone } from '@/core/activity/milestones';
import { Confetti } from './Confetti';

interface Props {
  entries: ActivityLog[];
}

const SEEN_KEY = 'penny_milestone_seen';

/** Celebratory banner for the latest milestone; confetti fires once per newly-reached milestone. */
export function MilestoneBanner({ entries }: Props) {
  const milestone = useMemo(() => detectMilestone(entries), [entries]);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (!milestone) return;
    if (localStorage.getItem(SEEN_KEY) === milestone.key) return;
    localStorage.setItem(SEEN_KEY, milestone.key);
    const raf = requestAnimationFrame(() => setCelebrate(true));
    const t = setTimeout(() => setCelebrate(false), 2400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [milestone]);

  if (!milestone) return null;

  return (
    <div
      className="relative overflow-hidden rounded-2xl px-4 py-3 flex items-center gap-3"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)' }}
    >
      {celebrate && <Confetti />}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        <i className={`ti ${milestone.icon}`} style={{ fontSize: 18, color: '#fff' }} aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-semibold text-primary">{milestone.label}</p>
        <p className="text-[11px] text-secondary">A little milestone worth celebrating.</p>
      </div>
    </div>
  );
}
