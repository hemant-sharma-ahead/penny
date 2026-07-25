import { View, Text } from 'react-native';
import { Card, IconBadge } from '~/components/ui';
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

/** RN port of apps/web-legacy/src/features/cashflow/CashFlowTimeline.tsx. */
export function CashFlowTimeline({ grouped, todayStart, masked }: CashFlowTimelineProps) {
  return (
    <View className="gap-4">
      {grouped.map(([monthKey, monthEvents]) => (
        <View key={monthKey}>
          <View className="flex-row items-center gap-2 mb-2">
            <Text className="text-xs font-semibold uppercase tracking-wide text-secondary">{monthLabel(monthKey)}</Text>
            <View className="flex-1 h-px bg-surface-2 border-t border-theme" />
            <Text className="text-xs text-tertiary">
              {!masked ? formatCurrency(monthEvents.reduce((s, e) => s + e.amount, 0)) : '••••'}
            </Text>
          </View>
          <View className="gap-2">
            {monthEvents.map((event) => {
              const cfg = getCashFlowMeta(event.type);
              return (
                <Card key={event.id} padding="xs" radius="md" className="flex-row items-center gap-3">
                  <IconBadge icon={cfg.icon} color={cfg.color} size="sm" />
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-primary" numberOfLines={1}>
                      {event.label}
                    </Text>
                    <Text className="text-xs text-tertiary">
                      {cfg.label} · {formatRowDate(event.dueMs, todayStart)}
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold text-primary">
                    {!masked ? formatCurrency(event.amount) : '••••'}
                  </Text>
                </Card>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
