import { nowMs } from '@/features/portfolio/holdings/shared/helpers';

// Small pill showing a validity/expiry date (RC, insurance, PUCC, fitness) with
// colour coding: red = expired, amber = within 30 days, green = valid.
export function ValidityBadge({ label, upto }: { label: string; upto: number }) {
  const days = Math.floor((upto - nowMs()) / (1000 * 60 * 60 * 24));
  const expired = days < 0;
  const soon = days >= 0 && days <= 30;
  const color = expired ? '#ef4444' : soon ? '#f59e0b' : '#10b981';
  const text = expired
    ? `${label} expired`
    : `${label} · ${new Date(upto).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}`;
  return (
    <span
      className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
      style={{ backgroundColor: `${color}15`, color }}
    >
      {text}
    </span>
  );
}
