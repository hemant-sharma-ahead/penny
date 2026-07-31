import { STATUS, tint } from '@/lib/statusColors';
import { daysUntil } from '@/lib/date';

export function VehicleValidityBadge({ label, upto }: { label: string; upto: number }) {
  const days = daysUntil(upto);
  const expired = days < 0;
  const soon = days >= 0 && days <= 30;
  const color = expired ? STATUS.danger : soon ? STATUS.warning : STATUS.success;
  const dateStr = new Date(upto).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
  return (
    <div
      className="flex flex-col items-center px-2 py-1.5 rounded-xl flex-1"
      style={{ backgroundColor: tint(color, 8) }}
    >
      <p className="text-[9px] text-tertiary">{label}</p>
      <p className="text-[10px] font-semibold tabular-nums" style={{ color }}>
        {expired ? 'Expired' : dateStr}
      </p>
    </div>
  );
}
