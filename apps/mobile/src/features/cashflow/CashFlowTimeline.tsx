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

/**
 * RN port of apps/web-react/src/features/cashflow/CashFlowTimeline.tsx, split into a section header
 * (`CashFlowMonthHeader`) and item (`CashFlowEventCard`) so `CashFlowPage.tsx` can assemble them around a
 * `SectionList` instead of nested `.map()`s inside a `ScrollView` — a 6-month horizon can produce 50-100+
 * rows across nested month/event lists, flagged as an unvirtualized risk in the 2026-07-26 parity sweep.
 */
export function CashFlowMonthHeader({ monthKey, total, masked }: { monthKey: string; total: number; masked: boolean }) {
  return (
    <View className="flex-row items-center gap-2 mb-2 mt-4">
      <Text className="text-xs font-semibold uppercase tracking-wide text-secondary">{monthLabel(monthKey)}</Text>
      <View className="flex-1 h-px bg-surface-2 border-t border-theme" />
      <Text className="text-xs text-tertiary">{!masked ? formatCurrency(total) : '••••'}</Text>
    </View>
  );
}

export function CashFlowEventCard({
  event,
  todayStart,
  masked
}: {
  event: CashFlowEvent;
  todayStart: number;
  masked: boolean;
}) {
  const cfg = getCashFlowMeta(event.type);
  return (
    <Card padding="xs" radius="md" className="flex-row items-center gap-3 mb-2">
      <IconBadge icon={cfg.icon} color={cfg.color} size="sm" />
      <View className="flex-1">
        <Text className="text-sm font-medium text-primary" numberOfLines={1}>
          {event.label}
        </Text>
        <Text className="text-xs text-tertiary">
          {cfg.label} · {formatRowDate(event.dueMs, todayStart)}
        </Text>
      </View>
      <Text className="text-sm font-semibold text-primary">{!masked ? formatCurrency(event.amount) : '••••'}</Text>
    </Card>
  );
}
