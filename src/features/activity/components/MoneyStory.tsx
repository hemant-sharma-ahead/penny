import { useMemo, useState } from 'react';
import type { ActivityLog } from '@/core/db/types';
import type { PrivacyMode } from '@/context/PrivacyContext';
import { ChipAvatar } from '@/components/ui/ChipAvatar';
import { narrateDay, weeklyStats } from '@/core/activity/narrate';
import { TrackingHeatmap } from './TrackingHeatmap';
import { OnThisDay } from './OnThisDay';
import { MilestoneBanner } from './MilestoneBanner';
import { WrappedModal } from './WrappedModal';

interface Props {
  entries: ActivityLog[];
  mode: PrivacyMode;
}

interface Tile {
  value: string;
  label: string;
}

/** Story tab: Chip narration + a compact 2×2 week grid + streak heatmap + On this day. */
export function MoneyStory({ entries, mode }: Props) {
  const story = useMemo(() => narrateDay(entries), [entries]);
  const week = useMemo(() => weeklyStats(entries), [entries]);
  const [showWrapped, setShowWrapped] = useState(false);
  const isSunday = new Date().getDay() === 0;

  const tiles: Tile[] = week
    ? [
        { value: String(week.total), label: 'changes' },
        { value: week.busiestDay ?? '—', label: 'busiest day' },
        { value: String(week.added), label: 'added' },
        { value: String(week.removed), label: 'removed' }
      ]
    : [];

  return (
    <div className="px-4 pt-4 flex flex-col gap-5">
      <MilestoneBanner entries={entries} />

      {/* Chip narration */}
      <div className="flex gap-2.5">
        <ChipAvatar size={32} className="flex-shrink-0 mt-0.5" />
        <div className="surface rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex-1">
          <p className="text-sm text-primary leading-relaxed">{story}</p>
        </div>
      </div>

      {/* Weekly Wrapped entry — emphasised on Sundays */}
      {week && (
        <button
          type="button"
          onClick={() => setShowWrapped(true)}
          className="w-full rounded-2xl px-4 py-3 flex items-center gap-3 text-left text-white"
          style={{ background: 'linear-gradient(135deg,#00C47D,#007A4D)' }}
        >
          <i className="ti ti-sparkles" style={{ fontSize: 20 }} aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold">{isSunday ? 'Your week is ready 🎉' : 'Your week, wrapped'}</p>
            <p className="text-[11px] opacity-90">Tap through your week · share it</p>
          </div>
          <i className="ti ti-chevron-right" style={{ fontSize: 18 }} aria-hidden="true" />
        </button>
      )}

      {/* This week — 2×2 grid */}
      {tiles.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2">This week</p>
          <div className="grid grid-cols-2 gap-2">
            {tiles.map((t) => (
              <div key={t.label} className="surface rounded-xl px-3 py-2.5">
                <span className="text-xl font-bold text-primary leading-none">{t.value}</span>
                <span className="block text-[11px] text-secondary mt-1">{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <TrackingHeatmap entries={entries} />
      <OnThisDay entries={entries} mode={mode} />

      {showWrapped && <WrappedModal entries={entries} onClose={() => setShowWrapped(false)} />}
    </div>
  );
}
