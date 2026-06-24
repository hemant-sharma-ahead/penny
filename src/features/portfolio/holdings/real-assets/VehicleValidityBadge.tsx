function vehicleNowMs(): number {
  return Date.now();
}

export function VehicleValidityBadge({ label, upto }: { label: string; upto: number }) {
  const days = Math.floor((upto - vehicleNowMs()) / (1000 * 60 * 60 * 24));
  const expired = days < 0;
  const soon = days >= 0 && days <= 30;
  const color = expired ? '#ef4444' : soon ? '#f59e0b' : '#10b981';
  const dateStr = new Date(upto).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
  return (
    <div className="flex flex-col items-center px-2 py-1.5 rounded-xl flex-1" style={{ backgroundColor: `${color}10` }}>
      <p className="text-[9px] text-tertiary">{label}</p>
      <p className="text-[10px] font-semibold tabular-nums" style={{ color }}>
        {expired ? 'Expired' : dateStr}
      </p>
    </div>
  );
}
