import { ProgressBar } from '@/components/ui';
import type { ComponentStatus, ScoreComponent } from '@/core/health/scorer';

const STATUS_STYLE: Record<ComponentStatus, { border: string; text: string; bar: string }> = {
  excellent: { border: '#10b981', text: '#10b981', bar: '#10b981' },
  good: { border: '#22c55e', text: '#22c55e', bar: '#22c55e' },
  fair: { border: '#f59e0b', text: '#f59e0b', bar: '#f59e0b' },
  poor: { border: '#ef4444', text: '#ef4444', bar: '#ef4444' },
  no_data: { border: 'var(--color-border)', text: 'var(--color-text-tertiary)', bar: 'var(--color-border-strong)' }
};

export function ComponentCard({ c }: { c: ScoreComponent }) {
  const s = STATUS_STYLE[c.status];
  const pct = c.max > 0 ? (c.earned / c.max) * 100 : 0;
  const statusLabel = c.status === 'no_data' ? 'No data' : c.status.charAt(0).toUpperCase() + c.status.slice(1);

  return (
    <div className="surface rounded-2xl p-3 flex flex-col gap-2" style={{ borderColor: s.border }}>
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <i className={`ti ${c.icon} flex-shrink-0`} style={{ fontSize: 15, color: s.text }} aria-hidden="true" />
          <span className="text-xs font-semibold truncate text-primary">{c.label}</span>
        </div>
        <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: s.text }}>
          {c.earned}/{c.max}
        </span>
      </div>

      <ProgressBar value={pct} color={s.bar} animate />

      <div>
        <span
          className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
          style={{ color: s.text, backgroundColor: `${s.bar}22` }}
        >
          {statusLabel}
        </span>
        <p className="text-[10px] mt-1 leading-relaxed line-clamp-2 text-secondary">{c.insight}</p>
      </div>
    </div>
  );
}
