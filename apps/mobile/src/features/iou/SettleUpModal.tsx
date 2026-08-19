import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import type { Account, Person, SettleDirection } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { projectedBalance } from '@/core/accounts/balanceCalculator';
import { AmountInput, Banner, OptionButton, SelectInput, TextInput, Toggle } from '~/components/ui';
import { FormModal } from '~/components/shared';
import { useThemeColors } from '~/theme/useThemeColors';

export interface SettleResult {
  amount: number;
  direction: SettleDirection;
  note?: string;
  /** When set, also record the matching money movement on this account (income if they paid you,
   *  expense if you paid them). */
  txnAccountId?: string;
}

interface SettleUpModalProps {
  person: Person;
  /** Net balance: positive ⇒ they owe you; negative ⇒ you owe them. */
  net: number;
  accounts: Account[];
  /** Current balance per account — powers the cash-negative guard below (same pattern as `ExpenseForm.tsx`). */
  accountBalances?: Record<string, number>;
  onSettle: (result: SettleResult) => Promise<void>;
  onClose: () => void;
}

/** Record a (partial or full) settlement. No payment integration — Penny only logs the entry. */
export function SettleUpModal({ person, net, accounts, accountBalances, onSettle, onClose }: SettleUpModalProps) {
  const theme = useThemeColors();
  const [direction, setDirection] = useState<SettleDirection>(net >= 0 ? 'they_paid_you' : 'you_paid_them');
  const [amount, setAmount] = useState(net !== 0 ? String(Math.abs(Math.round(net))) : '');
  const [note, setNote] = useState('');
  const [recordTxn, setRecordTxn] = useState(true);

  const usableAccounts = accounts.filter((a) => !a.isArchived);
  const [accountId, setAccountId] = useState(
    () => usableAccounts.find((a) => a.includeInNetWorth)?.id ?? usableAccounts[0]?.id ?? ''
  );
  const [saving, setSaving] = useState(false);

  const canRecord = usableAccounts.length > 0;
  const moneyIn = direction === 'they_paid_you';

  // Soft cash-negative guard (Track E / item 17), mirroring `ExpenseForm.tsx`'s `cashWarningBalance`.
  // "They paid me" records income (money in), which only raises the balance — nothing to warn about
  // there; only "I paid them" (money out) can push a Cash account negative.
  const payingAccount = usableAccounts.find((a) => a.id === accountId);
  const cashWarningBalance = useMemo(() => {
    if (!canRecord || !recordTxn || moneyIn || !accountBalances || !payingAccount) return null;
    if (payingAccount.type !== 'cash') return null;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return null;
    const base = accountBalances[payingAccount.id] ?? payingAccount.openingBalance;
    const projected = projectedBalance(payingAccount.id, base, [], {
      accountId: payingAccount.id,
      toAccountId: undefined,
      amount: amt,
      type: 'expense'
    });
    return projected < 0 ? projected : null;
  }, [canRecord, recordTxn, moneyIn, accountBalances, payingAccount, amount]);

  async function handleSave() {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return;
    setSaving(true);
    const result: SettleResult = { amount: parsed, direction };
    if (note.trim()) result.note = note.trim();
    if (canRecord && recordTxn && accountId) result.txnAccountId = accountId;
    try {
      await onSettle(result);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      title={`Settle up with ${person.name}`}
      onClose={onClose}
      onSave={() => void handleSave()}
      saving={saving}
      saveLabel="Record settlement"
    >
      <Text className="text-xs text-tertiary">
        {net > 0
          ? `${person.name} owes you ${formatCurrency(net)}.`
          : net < 0
            ? `You owe ${person.name} ${formatCurrency(-net)}.`
            : `You're settled up with ${person.name}.`}{' '}
        Record what was actually paid — settle in your own UPI/bank app.
      </Text>

      <View className="flex-row flex-wrap gap-2">
        <View className="w-[48%]">
          <OptionButton
            label="They paid me"
            icon="ti-arrow-down"
            selected={direction === 'they_paid_you'}
            onPress={() => setDirection('they_paid_you')}
            color={theme.success}
          />
        </View>
        <View className="w-[48%]">
          <OptionButton
            label="I paid them"
            icon="ti-arrow-up"
            selected={direction === 'you_paid_them'}
            onPress={() => setDirection('you_paid_them')}
            color={theme.danger}
          />
        </View>
      </View>

      <AmountInput label="Amount settled" value={amount} onChange={setAmount} placeholder="0" autoFocus />

      <TextInput label="Note (optional)" value={note} onChange={setNote} placeholder="e.g. UPI, cash" />

      {canRecord && (
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-medium text-secondary">
              {moneyIn ? 'Record money into an account' : 'Record money out of an account'}
            </Text>
            <Toggle value={recordTxn} onChange={setRecordTxn} accessibilityLabel="Record matching transaction" />
          </View>
          {recordTxn && (
            <SelectInput
              label={moneyIn ? 'Received in' : 'Paid from'}
              value={accountId}
              onChange={setAccountId}
              options={usableAccounts.map((a) => ({ value: a.id, label: a.name }))}
            />
          )}
        </View>
      )}

      {cashWarningBalance !== null && (
        <Banner variant="warning">
          This makes {payingAccount?.name ?? 'Cash'} go to {formatCurrency(cashWarningBalance)} — did you miss a cash
          withdrawal or pick the wrong account? You can still save.
        </Banner>
      )}
    </FormModal>
  );
}
