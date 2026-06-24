import { Card, IconBadge } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { getCashFlowMeta } from '@/core/cashflow/meta';
import type { CashFlowEvent } from '@/core/cashflow/forecaster';

function formatGroupDate(dueMs: number, todayStart: number): string {
  const diffDays = Math.round((dueMs - todayStart) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(dueMs));
}

interface CashFlowTimelineProps {
  grouped: [number, CashFlowEvent[]][];
  todayStart: number;
  mode: 'open' | 'safe' | 'privacy';
}

export function CashFlowTimeline({ grouped, todayStart, mode }: CashFlowTimelineProps) {
  return (
    <div className="flex flex-col gap-4">
      {grouped.map(([dayMs, dayEvents]) => (
        <div key={dayMs}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
              {formatGroupDate(dayMs, todayStart)}
            </span>
            <div className="flex-1 h-px bg-surface-2 border-t border-theme" />
            <span className="text-xs text-tertiary">
              {mode === 'open' ? formatCurrency(dayEvents.reduce((s, e) => s + e.amount, 0)) : '••••'}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {dayEvents.map((event) => {
              const cfg = getCashFlowMeta(event.type);
              return (
                <Card key={event.id} padding="xs" radius="md" className="flex items-center gap-3">
                  <IconBadge icon={cfg.icon} color={cfg.color} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-primary">{event.label}</p>
                    <p className="text-xs text-tertiary">{cfg.label}</p>
                  </div>
                  <span className="text-sm font-semibold shrink-0 text-primary">
                    {mode === 'open' ? formatCurrency(event.amount) : '••••'}
                  </span>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
