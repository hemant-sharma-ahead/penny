import { useState } from 'react';
import { Modal, Button, AmountInput, DetailRow } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { STATUS, ink } from '@/lib/statusColors';
import type { Account } from '@/core/db/types';

interface Props {
  account: Account;
  currentBalance: number;
  onReconcile: (account: Account, actual: number) => Promise<void> | void;
  onClose: () => void;
}

/** Adjust an account to its real-world balance — posts a balancing income/expense. */
export function ReconcileModal({ account, currentBalance, onReconcile, onClose }: Props) {
  const [actual, setActual] = useState(String(Math.max(0, Math.round(currentBalance))));
  const actualNum = parseFloat(actual);
  const diff = !isNaN(actualNum) ? Math.round((actualNum - currentBalance) * 100) / 100 : 0;
  const hasDiff = Math.abs(diff) >= 1;
  const surplus = diff > 0;

  return (
    <Modal
      title={`Reconcile ${account.name}`}
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button
            fullWidth
            disabled={!hasDiff}
            onClick={() => {
              void onReconcile(account, actualNum);
              onClose();
            }}
          >
            {hasDiff ? 'Reconcile' : 'Already matches'}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-secondary mb-3">
        Count the actual balance in this account. Penny posts a small adjustment so the tracked balance matches reality.
      </p>
      <div className="surface rounded-xl px-4 py-1 mb-3">
        <DetailRow label="Tracked balance" value={formatCurrency(currentBalance)} size="md" />
      </div>
      <AmountInput label="Actual balance now" value={actual} onChange={setActual} autoFocus />
      {hasDiff && (
        <p className="mt-3 text-xs" style={{ color: ink(surplus ? STATUS.success : STATUS.danger) }}>
          Posts {surplus ? 'income' : 'an expense'} of {formatCurrency(Math.abs(diff))} (“Balance reconciliation”) to
          {surplus ? ' add the surplus.' : ' cover the shortfall.'}
        </p>
      )}
    </Modal>
  );
}
