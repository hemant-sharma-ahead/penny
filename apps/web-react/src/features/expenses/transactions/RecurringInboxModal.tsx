import { useState } from 'react';
import { Modal, Button, IconBadge } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { formatDateShort } from '@/lib/date';
import type { DueRecurring } from '@/core/expenses/recurringDue';
import type { ExpenseCategory } from '@/core/db/types';

interface Props {
  due: DueRecurring[];
  categoryMap: Map<string, ExpenseCategory>;
  onPost: (d: DueRecurring) => Promise<void>;
  onSkip: (d: DueRecurring) => void;
  onClose: () => void;
}

/** "Due to log" inbox — confirm recurring items to post them as real transactions. */
export function RecurringInboxModal({ due, categoryMap, onPost, onSkip, onClose }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const handlePost = async (d: DueRecurring) => {
    setBusyId(d.key);
    try {
      await onPost(d);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal title="Due to log" onClose={onClose}>
      <p className="text-sm text-secondary mb-3">
        These recurring items are due. Logging adds the transaction; the next one will surface when it falls due.
      </p>
      <div className="flex flex-col gap-2">
        {due.map((d) => {
          const t = d.template;
          const cat = categoryMap.get(t.categoryId);
          const isIncome = (t.type ?? 'expense') === 'income';
          return (
            <div key={d.key} className="flex items-center gap-3 rounded-xl border border-theme bg-surface-2 p-3">
              <IconBadge icon={cat?.icon ?? 'ti-repeat'} color={cat?.color ?? 'var(--color-primary)'} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-primary">{t.description}</p>
                <p className="text-xs text-tertiary">
                  Due {formatDateShort(d.dueMs)}
                  {d.periodsOverdue > 1 ? ` · ${d.periodsOverdue} pending` : ''}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span
                  className="text-sm font-semibold"
                  style={{ color: isIncome ? 'var(--color-success)' : undefined }}
                >
                  {isIncome ? '+' : ''}
                  {formatCurrency(t.amount)}
                </span>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => onSkip(d)} disabled={busyId === d.key}>
                    Skip
                  </Button>
                  <Button size="sm" loading={busyId === d.key} onClick={() => void handlePost(d)}>
                    Log
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        {due.length === 0 && <p className="text-sm text-tertiary text-center py-4">Nothing due right now.</p>}
      </div>
    </Modal>
  );
}
