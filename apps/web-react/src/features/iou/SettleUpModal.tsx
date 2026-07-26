import { useState } from 'react';
import type { Account, Person, SettleDirection } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { AmountInput, OptionButton, SelectInput, TextInput, Toggle } from '@/components/ui';
import { FormModal } from '@/components/shared';
import { STATUS } from '@/lib/statusColors';

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
  onSettle: (result: SettleResult) => Promise<void>;
  onClose: () => void;
}

/** Record a (partial or full) settlement. No payment integration — Penny only logs the entry. */
export function SettleUpModal({ person, net, accounts, onSettle, onClose }: SettleUpModalProps) {
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
      nested
    >
      <p className="text-xs text-tertiary">
        {net > 0
          ? `${person.name} owes you ${formatCurrency(net)}.`
          : net < 0
            ? `You owe ${person.name} ${formatCurrency(-net)}.`
            : `You're settled up with ${person.name}.`}{' '}
        Record what was actually paid — settle in your own UPI/bank app.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <OptionButton
          label="They paid me"
          icon="ti-arrow-down"
          selected={direction === 'they_paid_you'}
          onClick={() => setDirection('they_paid_you')}
          color={STATUS.success}
        />
        <OptionButton
          label="I paid them"
          icon="ti-arrow-up"
          selected={direction === 'you_paid_them'}
          onClick={() => setDirection('you_paid_them')}
          color={STATUS.danger}
        />
      </div>

      <AmountInput label="Amount settled" value={amount} onChange={setAmount} placeholder="0" autoFocus />

      <TextInput label="Note (optional)" value={note} onChange={setNote} placeholder="e.g. UPI, cash" />

      {canRecord && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center justify-between">
            <span className="text-xs font-medium text-secondary">
              {moneyIn ? 'Record money into an account' : 'Record money out of an account'}
            </span>
            <Toggle value={recordTxn} onChange={setRecordTxn} aria-label="Record matching transaction" />
          </label>
          {recordTxn && (
            <SelectInput
              label={moneyIn ? 'Received in' : 'Paid from'}
              value={accountId}
              onChange={setAccountId}
              options={usableAccounts.map((a) => ({ value: a.id, label: a.name }))}
            />
          )}
        </div>
      )}
    </FormModal>
  );
}
