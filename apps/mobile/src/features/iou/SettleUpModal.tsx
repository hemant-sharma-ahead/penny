import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import type { Account, ExpenseCategory, Person, SettleDirection } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { projectedBalance } from '@/core/accounts/balanceCalculator';
import { AmountInput, Banner, TextInput, Toggle } from '~/components/ui';
import { FormModal, AccountChips, PaymentModeChips, IouCategoryChips } from '~/components/shared';

export interface SettleResult {
  amount: number;
  direction: SettleDirection;
  note?: string;
  /** When set, also record the matching money movement on this account (income if they paid you,
   *  expense if you paid them). */
  txnAccountId?: string;
  /** How the money moved — same `PaymentModeChips` field every regular transaction already has. */
  paymentMode?: string;
}

interface SettleUpModalProps {
  person: Person;
  /** Net balance: positive ⇒ they owe you; negative ⇒ you owe them. */
  net: number;
  accounts: Account[];
  /** The 4 real IOU categories, read live for their real name/icon/color — same convention as
   *  `EntryForm.tsx`'s picker, reused verbatim here (2026-08-27) instead of the old plain
   *  "They paid me / I paid them" toggle, so a settlement's category is picked the same way
   *  everywhere in the app, not two different UIs for the same 4 categories. */
  categories: ExpenseCategory[];
  /** Current balance per account — powers the cash-negative guard below (same pattern as `ExpenseForm.tsx`). */
  accountBalances?: Record<string, number>;
  /** Opens Add Account without leaving this form — same escape hatch `AccountChips` already needs in
   *  `EntryForm.tsx`/`ExpenseForm.tsx`. */
  onAddAccount: () => void;
  onSettle: (result: SettleResult) => Promise<void>;
  onClose: () => void;
}

/** Record a (partial or full) settlement. No payment integration — Penny only logs the entry. */
export function SettleUpModal({
  person,
  net,
  accounts,
  categories,
  accountBalances,
  onAddAccount,
  onSettle,
  onClose
}: SettleUpModalProps) {
  // Only the 2 settlement categories are ever selectable here (Lending/Borrowed Money create new
  // debt, not applicable to settling existing debt — both tiles stay disabled below); which one
  // is enabled follows the actual net direction, same as `EntryForm.tsx`'s own tile-disable pattern.
  const [categoryId, setCategoryId] = useState(net >= 0 ? 'cat-collected-money' : 'cat-return-borrowed');
  // Which tiles `IouCategoryChips` should render locked — Lending/Borrowed Money always (never
  // applicable to a settlement), plus whichever of the 2 settlement tiles doesn't match the actual
  // net direction (both stay open at an exactly-settled ₹0 balance, since there's no direction to
  // enforce then).
  const disabledCategoryIds = useMemo(() => {
    const ids = new Set(['cat-lending', 'cat-inc-borrowed']);
    if (net > 0) ids.add('cat-return-borrowed');
    else if (net < 0) ids.add('cat-collected-money');
    return ids;
  }, [net]);
  // These 2 ids are the only ones `categoryId` can ever hold (enforced by the disabled tiles below),
  // so this ternary is exhaustive in practice — simpler than routing through the general 4-way
  // `kindForIouCategory` for a component that only ever cares about these two.
  const direction: SettleDirection = categoryId === 'cat-collected-money' ? 'they_paid_you' : 'you_paid_them';
  const [amount, setAmount] = useState(net !== 0 ? String(Math.abs(Math.round(net))) : '');
  const [note, setNote] = useState('');
  const [recordTxn, setRecordTxn] = useState(true);
  const [paymentMode, setPaymentMode] = useState('');

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
    if (canRecord && recordTxn && accountId) {
      result.txnAccountId = accountId;
      if (paymentMode) result.paymentMode = paymentMode;
    }
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

      {/* Same icon-chip row `EntryForm.tsx`'s "Add IOU" popup uses (2026-08-27, mockup
          `docs/mockups/proposals/iou-popups-expenseform-alignment-v1.html`) — Lending/Borrowed Money
          stay permanently locked here (settling never creates new debt), and of the 2 settlement
          tiles, only the one matching the actual net direction is open: if they owe you, only
          "Collected Money" is tappable; if you owe them, only "Return Borrowed" is. At an
          exactly-settled ₹0 balance there's no direction to enforce, so both stay open. */}
      <View className="gap-1.5">
        <Text className="text-xs font-medium text-secondary">Category</Text>
        <IouCategoryChips
          categories={categories}
          value={categoryId}
          onChange={setCategoryId}
          disabledIds={disabledCategoryIds}
        />
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
            <View className="gap-1.5">
              <Text className="text-xs font-medium text-secondary">{moneyIn ? 'Received in' : 'Paid from'}</Text>
              <AccountChips
                accounts={usableAccounts}
                value={accountId}
                onChange={setAccountId}
                onAddAccount={onAddAccount}
              />
            </View>
          )}
          {recordTxn && (
            <View className="gap-1.5">
              <Text className="text-xs font-medium text-secondary">Paid via</Text>
              <PaymentModeChips value={paymentMode} onChange={setPaymentMode} selectedAccount={payingAccount} />
            </View>
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
