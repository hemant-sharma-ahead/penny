import { useState } from 'react';
import { formatCurrency, formatPercent } from '@/lib/formatters';

export interface TaxStoryData {
  fyLabel: string;
  gross: number;
  consumed: number;
  totalTax: number; // direct + indirect
  directTax: number;
  indirectTax: number;
  taxPctOfConsumed: number;
  savingsRate: number;
}

interface Card {
  big: string;
  caption: string;
}

async function shareStory(d: TaxStoryData) {
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
  ctx.font = 'bold 56px sans-serif';
  ctx.fillText('My tax story', 540, 240);
  ctx.font = '40px sans-serif';
  ctx.fillText(d.fyLabel, 540, 310);
  ctx.font = 'bold 150px sans-serif';
  ctx.fillText(formatCurrency(Math.round(d.totalTax)), 540, 560);
  ctx.font = '44px sans-serif';
  ctx.fillText('paid in tax', 540, 630);
  ctx.font = '40px sans-serif';
  ctx.fillText(`${formatPercent(d.taxPctOfConsumed)} of what I didn't save`, 540, 760);
  ctx.fillText(`Direct ${formatCurrency(Math.round(d.directTax))}`, 540, 870);
  ctx.fillText(`Indirect ${formatCurrency(Math.round(d.indirectTax))}`, 540, 940);
  ctx.fillText(`Saved ${formatPercent(d.savingsRate)} of income`, 540, 1050);
  ctx.font = '34px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('Private by design · all on my device', 540, 1270);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) return;
  const file = new File([blob], 'penny-tax-story.png', { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'My tax story' });
      return;
    }
  } catch {
    /* cancelled — fall through to download */
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'penny-tax-story.png';
  a.click();
  URL.revokeObjectURL(url);
}

/** Full-screen, tap-through tax story — generated and shared entirely on-device. */
export function TaxStoryModal({ data, onClose }: { data: TaxStoryData; onClose: () => void }) {
  const [idx, setIdx] = useState(0);

  const cards: Card[] = [
    { big: '🧾', caption: `Your tax story · ${data.fyLabel}` },
    { big: formatCurrency(Math.round(data.gross)), caption: 'you earned' },
    {
      big: formatCurrency(Math.round(data.totalTax)),
      caption: `paid in tax — ${formatPercent(data.taxPctOfConsumed)} of what you didn't save`
    },
    { big: `${formatPercent(data.savingsRate)}`, caption: 'of your income, saved & invested' },
    { big: '🔒', caption: 'All private. All on your device.' }
  ];

  const last = idx >= cards.length - 1;
  const card = cards[idx] ?? cards[0];
  if (!card) return null;

  const next = () => (last ? onClose() : setIdx((i) => i + 1));

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col text-white"
      style={{ background: 'linear-gradient(160deg,#00C47D,#007A4D)' }}
    >
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

      <div className="absolute inset-0 flex">
        <button
          type="button"
          aria-label="Previous"
          className="w-1/3"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
        />
        <button type="button" aria-label="Next" className="flex-1" onClick={next} />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="text-5xl font-bold mb-4 leading-tight tabular-nums">{card.big}</div>
        <p className="text-lg font-medium opacity-95">{card.caption}</p>
      </div>

      {last && (
        <div className="relative z-10 px-6 pb-10">
          <button
            type="button"
            onClick={() => void shareStory(data)}
            className="w-full py-3 rounded-xl bg-white text-[#007A4D] font-semibold text-sm"
          >
            <i className="ti ti-share" style={{ fontSize: 16 }} aria-hidden="true" /> Share my tax story
          </button>
        </div>
      )}
    </div>
  );
}
