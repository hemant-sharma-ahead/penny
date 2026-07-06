import { Card, IconBadge } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { daysBetween, monthLabel } from '@/lib/date';
import { getCashFlowMeta } from '@/core/cashflow/meta';
import type { CashFlowEvent } from '@/core/cashflow/forecaster';

/** Per-row due date — relative for the next two days, else "Mon, 12 Jul". */
function formatRowDate(dueMs: number, todayStart: number): string {
  const diffDays = daysBetween(todayStart, dueMs);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(dueMs));
}

interface CashFlowTimelineProps {
  grouped: [string, CashFlowEvent[]][]; // [monthKey "YYYY-MM", events]
  todayStart: number;
  masked: boolean;
}

export function CashFlowTimeline({ grouped, todayStart, masked }: CashFlowTimelineProps) {
  return (
    <div className="flex flex-col gap-4">
      {grouped.map(([monthKey, monthEvents]) => (
        <div key={monthKey}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-secondary">{monthLabel(monthKey)}</span>
            <div className="flex-1 h-px bg-surface-2 border-t border-theme" />
            <span className="text-xs text-tertiary">
              {!masked ? formatCurrency(monthEvents.reduce((s, e) => s + e.amount, 0)) : '••••'}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {monthEvents.map((event) => {
              const cfg = getCashFlowMeta(event.type);
              return (
                <Card key={event.id} padding="xs" radius="md" className="flex items-center gap-3">
                  <IconBadge icon={cfg.icon} color={cfg.color} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-primary">{event.label}</p>
                    <p className="text-xs text-tertiary">
                      {cfg.label} · {formatRowDate(event.dueMs, todayStart)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold shrink-0 text-primary">
                    {!masked ? formatCurrency(event.amount) : '••••'}
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
