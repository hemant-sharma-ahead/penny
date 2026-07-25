import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Modal, Button, IconBadge, EmptyState } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { usePrivacy } from '~/context/PrivacyContext';
import { useReminders } from '~/hooks/useReminders';
import { getCashFlowMeta } from '@/core/cashflow/meta';
import { formatCurrency } from '@/lib/formatters';
import { daysBetween, formatDateShort } from '@/lib/date';
import type { Reminder, ReminderUrgency } from '@/core/reminders/reminders';

function dueLabel(r: Reminder, todayMs: number): string {
  if (r.urgency === 'today') return 'Today';
  if (r.urgency === 'overdue') return `Overdue · ${formatDateShort(r.dueMs)}`;
  const d = daysBetween(todayMs, r.dueMs);
  return d === 1 ? 'Tomorrow' : `in ${d} days`;
}

/**
 * RN port of apps/web-legacy/src/components/reminders/RemindersBell.tsx — same bell icon + badge
 * count, opening a centered Modal with the same overdue/today/soon sections and per-reminder
 * actions (log/cancel/snooze/done). Snooze's inline day-picker row swaps web's flex-wrap buttons
 * for the shared `Button` component.
 */
export function RemindersBell() {
  const theme = useThemeColors();
  const { shouldMask } = usePrivacy();
  const { nowMs, reminders, counts, snooze, markDone, log, cancelSub } = useReminders();
  const [open, setOpen] = useState(false);
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const masked = shouldMask(false);
  const money = (n: number) => (masked ? '••••' : formatCurrency(n));

  const runAction = async (r: Reminder, fn: (r: Reminder) => Promise<void>) => {
    setBusyId(r.id);
    try {
      await fn(r);
    } finally {
      setBusyId(null);
    }
  };

  const URGENCY_META: Record<ReminderUrgency, { label: string; color: string }> = {
    overdue: { label: 'Overdue', color: theme.danger },
    today: { label: 'Due today', color: theme.warning },
    soon: { label: 'Coming up', color: theme.info }
  };
  const sections: ReminderUrgency[] = ['overdue', 'today', 'soon'];

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="w-8 h-8 items-center justify-center rounded-lg"
        accessibilityLabel={`Reminders${counts.total ? ` (${counts.total})` : ''}`}
      >
        <View>
          <Icon name="ti-bell" size={20} color={theme.textSecondary} />
          {counts.total > 0 && (
            <View
              className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full items-center justify-center"
              style={{ backgroundColor: counts.urgent > 0 ? theme.danger : theme.textTertiary }}
            >
              <Text className="text-white font-bold" style={{ fontSize: 9 }}>
                {counts.total}
              </Text>
            </View>
          )}
        </View>
      </Pressable>

      {open && (
        <Modal title="Reminders" onClose={() => setOpen(false)} scrollable>
          {reminders.length === 0 ? (
            <EmptyState
              icon="ti-bell-check"
              title="You're all caught up"
              description="No bills or renewals due in the next week."
            />
          ) : (
            <View className="gap-4">
              {sections.map((urgency) => {
                const items = reminders.filter((r) => r.urgency === urgency);
                if (items.length === 0) return null;
                return (
                  <View key={urgency}>
                    <Text
                      className="text-xs font-semibold uppercase tracking-wide mb-2"
                      style={{ color: URGENCY_META[urgency].color }}
                    >
                      {URGENCY_META[urgency].label}
                    </Text>
                    <View className="gap-2">
                      {items.map((r) => {
                        const cfg = getCashFlowMeta(r.kind);
                        const busy = busyId === r.id;
                        return (
                          <View key={r.id} className="rounded-xl border border-theme bg-surface-2 p-3 gap-2">
                            <View className="flex-row items-center gap-3">
                              <IconBadge icon={cfg.icon} color={cfg.color} size="sm" />
                              <View className="flex-1">
                                <Text className="text-sm font-medium text-primary" numberOfLines={1}>
                                  {r.label}
                                </Text>
                                <Text className="text-xs text-tertiary">{dueLabel(r, nowMs)}</Text>
                              </View>
                              <Text className="text-sm font-semibold text-primary">{money(r.amount)}</Text>
                            </View>

                            {snoozeFor === r.id ? (
                              <View className="flex-row items-center gap-1.5">
                                <Text className="text-xs text-tertiary mr-1">Snooze:</Text>
                                {[
                                  { label: '1 day', days: 1 },
                                  { label: '3 days', days: 3 },
                                  { label: '1 week', days: 7 }
                                ].map((o) => (
                                  <Button
                                    key={o.days}
                                    variant="secondary"
                                    size="sm"
                                    onPress={() => {
                                      snooze(r.id, o.days);
                                      setSnoozeFor(null);
                                    }}
                                  >
                                    {o.label}
                                  </Button>
                                ))}
                              </View>
                            ) : (
                              <View className="flex-row items-center gap-1.5">
                                {r.action === 'log' && (
                                  <Button size="sm" loading={busy} onPress={() => void runAction(r, log)}>
                                    Log it
                                  </Button>
                                )}
                                {r.action === 'cancel' && (
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    loading={busy}
                                    onPress={() => void runAction(r, cancelSub)}
                                  >
                                    Cancel
                                  </Button>
                                )}
                                <Button variant="ghost" size="sm" icon="ti-clock" onPress={() => setSnoozeFor(r.id)}>
                                  Snooze
                                </Button>
                                <Button variant="ghost" size="sm" icon="ti-check" onPress={() => markDone(r.id)}>
                                  Done
                                </Button>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Modal>
      )}
    </>
  );
}
