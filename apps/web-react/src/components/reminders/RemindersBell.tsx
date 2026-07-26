import { useState } from 'react';
import { Modal, Button, IconBadge, EmptyState } from '@/components/ui';
import { usePrivacy } from '@/context/PrivacyContext';
import { useReminders } from '@/hooks/useReminders';
import { getCashFlowMeta } from '@/core/cashflow/meta';
import { STATUS } from '@/lib/statusColors';
import { formatCurrency } from '@/lib/formatters';
import { daysBetween, formatDateShort } from '@/lib/date';
import type { Reminder, ReminderUrgency } from '@/core/reminders/reminders';

const URGENCY_META: Record<ReminderUrgency, { label: string; color: string }> = {
  overdue: { label: 'Overdue', color: STATUS.danger },
  today: { label: 'Due today', color: STATUS.warning },
  soon: { label: 'Coming up', color: STATUS.info }
};

function dueLabel(r: Reminder, todayMs: number): string {
  if (r.urgency === 'today') return 'Today';
  if (r.urgency === 'overdue') return `Overdue · ${formatDateShort(r.dueMs)}`;
  const d = daysBetween(todayMs, r.dueMs);
  return d === 1 ? 'Tomorrow' : `in ${d} days`;
}

export function RemindersBell() {
  const { shouldMask } = usePrivacy();
  const { nowMs, reminders, counts, snooze, markDone, log, cancelSub } = useReminders();
  const [open, setOpen] = useState(false);
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Reminders mix bills/EMIs/subscriptions from different modules without a live category/account
  // reference here — treated as an aggregate view: visible in Safe, hidden only in Privacy.
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

  const sections: ReminderUrgency[] = ['overdue', 'today', 'soon'];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface-2"
        aria-label={`Reminders${counts.total ? ` (${counts.total})` : ''}`}
      >
        <i className="ti ti-bell" style={{ fontSize: 20 }} aria-hidden="true" />
        {counts.total > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full flex items-center justify-center text-white font-bold"
            style={{ fontSize: 9, backgroundColor: counts.urgent > 0 ? STATUS.danger : 'var(--color-text-tertiary)' }}
          >
            {counts.total}
          </span>
        )}
      </button>

      {open && (
        <Modal title="Reminders" onClose={() => setOpen(false)}>
          {reminders.length === 0 ? (
            <EmptyState
              icon="ti-bell-check"
              title="You're all caught up"
              description="No bills or renewals due in the next week."
            />
          ) : (
            <div className="flex flex-col gap-4">
              {sections.map((urgency) => {
                const items = reminders.filter((r) => r.urgency === urgency);
                if (items.length === 0) return null;
                return (
                  <div key={urgency}>
                    <p
                      className="text-xs font-semibold uppercase tracking-wide mb-2"
                      style={{ color: URGENCY_META[urgency].color }}
                    >
                      {URGENCY_META[urgency].label}
                    </p>
                    <div className="flex flex-col gap-2">
                      {items.map((r) => {
                        const cfg = getCashFlowMeta(r.kind);
                        const busy = busyId === r.id;
                        return (
                          <div
                            key={r.id}
                            className="rounded-xl border border-theme bg-surface-2 p-3 flex flex-col gap-2"
                          >
                            <div className="flex items-center gap-3">
                              <IconBadge icon={cfg.icon} color={cfg.color} size="sm" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate text-primary">{r.label}</p>
                                <p className="text-xs text-tertiary">{dueLabel(r, nowMs)}</p>
                              </div>
                              <span className="text-sm font-semibold text-primary shrink-0">{money(r.amount)}</span>
                            </div>

                            {snoozeFor === r.id ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-tertiary mr-1">Snooze:</span>
                                {[
                                  { label: '1 day', days: 1 },
                                  { label: '3 days', days: 3 },
                                  { label: '1 week', days: 7 }
                                ].map((o) => (
                                  <Button
                                    key={o.days}
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                      snooze(r.id, o.days);
                                      setSnoozeFor(null);
                                    }}
                                  >
                                    {o.label}
                                  </Button>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                {r.action === 'log' && (
                                  <Button size="sm" loading={busy} onClick={() => void runAction(r, log)}>
                                    Log it
                                  </Button>
                                )}
                                {r.action === 'cancel' && (
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    loading={busy}
                                    onClick={() => void runAction(r, cancelSub)}
                                  >
                                    Cancel
                                  </Button>
                                )}
                                <Button variant="ghost" size="sm" icon="ti-clock" onClick={() => setSnoozeFor(r.id)}>
                                  Snooze
                                </Button>
                                <Button variant="ghost" size="sm" icon="ti-check" onClick={() => markDone(r.id)}>
                                  Done
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
