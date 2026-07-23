import { useState } from 'react';
import type { ActivityLog } from '@/core/db/types';
import { weeklyStats } from '@/core/activity/narrate';

interface Props {
  entries: ActivityLog[];
  onClose: () => void;
}

interface Card {
  big: string;
  caption: string;
}

async function shareWeek(big: number, busiest: string, added: number, removed: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const g = ctx.createLinearGradient(0, 0, 0, 1350);
  g.addColorStop(0, '#00C47D');
  g.addColorStop(1, '#007A4D');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 60px sans-serif';
  ctx.fillText('My week on Penny', 540, 280);
  ctx.font = 'bold 240px sans-serif';
  ctx.fillText(String(big), 540, 640);
  ctx.font = '44px sans-serif';
  ctx.fillText('changes this week', 540, 710);
  ctx.font = '48px sans-serif';
  ctx.fillText(`Busiest day · ${busiest}`, 540, 860);
  ctx.fillText(`${added} added · ${removed} removed`, 540, 940);
  ctx.font = '34px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('Private by design · all on my device', 540, 1260);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) return;
  const file = new File([blob], 'penny-week.png', { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'My week on Penny' });
      return;
    }
  } catch {
    /* user cancelled or share failed — fall through to download */
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'penny-week.png';
  a.click();
  URL.revokeObjectURL(url);
}

/** Full-screen, tap-through Weekly Wrapped — generated and shared entirely on-device. */
export function WrappedModal({ entries, onClose }: Props) {
  const stats = weeklyStats(entries);
  const [idx, setIdx] = useState(0);

  const cards: Card[] = stats
    ? [
        { big: '✨', caption: 'Your week on Penny' },
        { big: String(stats.total), caption: 'changes this week' },
        { big: stats.busiestDay ?? '—', caption: 'your busiest day' },
        { big: `${stats.added}·${stats.removed}`, caption: 'added · removed' },
        { big: '🔒', caption: 'All private. All on your device.' }
      ]
    : [{ big: '🌱', caption: 'Track a few things and your week shows up here.' }];

  const last = idx >= cards.length - 1;
  const card = cards[idx] ?? cards[0];

  function next() {
    if (last) onClose();
    else setIdx((i) => i + 1);
  }

  if (!card) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col text-white"
      style={{ background: 'linear-gradient(160deg,#00C47D,#007A4D)' }}
    >
      {/* progress segments */}
      <div className="flex gap-1.5 px-4 pt-4">
        {cards.map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full"
            style={{ backgroundColor: i <= idx ? '#fff' : 'rgba(255,255,255,0.35)' }}
          />
        ))}
      </div>

      <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3.5 right-4 z-10 p-1">
        <i className="ti ti-x" style={{ fontSize: 22 }} aria-hidden="true" />
      </button>

      {/* tap zones */}
      <div className="absolute inset-0 flex">
        <button
          type="button"
          aria-label="Previous"
          className="w-1/3"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
        />
        <button type="button" aria-label="Next" className="flex-1" onClick={next} />
      </div>

      {/* card content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl font-bold mb-4 leading-none">{card.big}</div>
        <p className="text-lg font-medium opacity-95">{card.caption}</p>
      </div>

      {last && stats && (
        <div className="relative z-10 px-6 pb-10 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void shareWeek(stats.total, stats.busiestDay ?? '—', stats.added, stats.removed)}
            className="w-full py-3 rounded-xl bg-white text-[#007A4D] font-semibold text-sm"
          >
            <i className="ti ti-share" style={{ fontSize: 16 }} aria-hidden="true" /> Share my week
          </button>
          <button type="button" onClick={onClose} className="w-full py-2 text-sm font-medium opacity-90">
            Done
          </button>
        </div>
      )}
    </div>
  );
}
