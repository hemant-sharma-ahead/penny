import { useState } from 'react';
import { Modal } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import type { Expense } from '@/core/db/types';

/**
 * Share-later picker (Track E, screen 9). A focused "Share with which group?" list opened from a
 * transaction's row action. Shares the expense as an equal split into the chosen group and marks the
 * personal transaction as shared — the transaction itself stays put; only a linked group event is added.
 */
export function ShareToGroupModal({
  expense,
  groups,
  onShare,
  onClose
}: {
  expense: Expense;
  groups: { id: string; name: string }[];
  onShare: (expense: Expense, groupId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function pick(groupId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await onShare(expense, groupId);
      onClose();
    } catch {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Share with a group" nested>
      <p className="text-[13px] text-secondary -mt-1 mb-1">
        Adds <b className="text-primary">{expense.description}</b> ({formatCurrency(expense.amount)}) as an equal split.
        Your account still records the full amount.
      </p>
      <div className="flex flex-col gap-1.5">
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => void pick(g.id)}
            disabled={busy}
            className="surface rounded-xl px-3 py-3 text-left text-sm font-medium text-primary flex items-center gap-2.5 hover:bg-surface-2 disabled:opacity-50"
          >
            <i className="ti ti-users-group" style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
            {g.name}
            <i className="ti ti-chevron-right ml-auto text-tertiary" aria-hidden="true" />
          </button>
        ))}
      </div>
    </Modal>
  );
}
