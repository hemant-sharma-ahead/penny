import { useMemo, useState } from 'react';
import { Button, Modal } from '@/components/ui';
import type { Account } from '@/core/db/types';
import { AccountChips } from './AccountChips';
import { PaymentModeChips } from './PaymentModeChips';
import { couplePaymentToAccount } from './paymentModes';

interface Props {
  accounts: Account[];
  count: number;
  onApply: (patch: { accountId?: string; paymentMode?: string }) => Promise<void>;
  onAddAccount: () => void;
  onClose: () => void;
}

/**
 * Bulk-edit account + payment mode together, mirroring the entry form's coupling
 * (a cash account forces the cash mode; any other account disallows it).
 */
export function BulkAccountPaymentModal({ accounts, count, onApply, onAddAccount, onClose }: Props) {
  const [accountId, setAccountId] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [busy, setBusy] = useState(false);

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.isArchived), [accounts]);
  const selectedAccount = useMemo(() => accounts.find((a) => a.id === accountId), [accounts, accountId]);

  function handleAccountSelect(id: string) {
    setAccountId(id);
    setPaymentMode((prev) =>
      couplePaymentToAccount(
        accounts.find((a) => a.id === id),
        prev
      )
    );
  }

  async function handleApply() {
    const patch: { accountId?: string; paymentMode?: string } = {};
    if (accountId) patch.accountId = accountId;
    if (paymentMode) patch.paymentMode = paymentMode;
    if (!patch.accountId && !patch.paymentMode) return;
    setBusy(true);
    try {
      await onApply(patch);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      nested
      onClose={onClose}
      title="Account & payment mode"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button fullWidth disabled={!accountId && !paymentMode} loading={busy} onClick={() => void handleApply()}>
            Apply
          </Button>
        </div>
      }
    >
      <p className="text-sm text-secondary">
        Update {count} transaction{count === 1 ? '' : 's'}. Only the fields you set are changed.
      </p>

      <div>
        <label className="text-xs font-medium text-secondary">Account</label>
        <div className="mt-1">
          <AccountChips
            accounts={activeAccounts}
            value={accountId}
            onChange={handleAccountSelect}
            onAddAccount={onAddAccount}
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-secondary">Payment mode</label>
        <div className="mt-1">
          <PaymentModeChips value={paymentMode} onChange={setPaymentMode} selectedAccount={selectedAccount} />
        </div>
      </div>
    </Modal>
  );
}
