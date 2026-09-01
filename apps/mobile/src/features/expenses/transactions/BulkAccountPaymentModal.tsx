import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { Button, Modal } from '~/components/ui';
import type { Account } from '@/core/db/types';
import { AccountChips, PaymentModeChips, couplePaymentToAccount } from '~/components/shared';

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

  // Closed accounts (2026-08-27), same as archived, are never a valid bulk-reassign target.
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.isArchived && !a.isClosed), [accounts]);
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
      onClose={onClose}
      title="Account & payment mode"
      footer={
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button variant="secondary" fullWidth onPress={onClose} disabled={busy}>
              Cancel
            </Button>
          </View>
          <View className="flex-1">
            <Button fullWidth disabled={!accountId && !paymentMode} loading={busy} onPress={() => void handleApply()}>
              Apply
            </Button>
          </View>
        </View>
      }
    >
      <Text className="text-sm text-secondary">
        Update {count} transaction{count === 1 ? '' : 's'}. Only the fields you set are changed.
      </Text>

      <View>
        <Text className="text-xs font-medium text-secondary">Account</Text>
        <View className="mt-1">
          <AccountChips
            accounts={activeAccounts}
            value={accountId}
            onChange={handleAccountSelect}
            onAddAccount={onAddAccount}
          />
        </View>
      </View>

      <View>
        <Text className="text-xs font-medium text-secondary">Payment mode</Text>
        <View className="mt-1">
          <PaymentModeChips value={paymentMode} onChange={setPaymentMode} selectedAccount={selectedAccount} />
        </View>
      </View>
    </Modal>
  );
}
