import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import type { Account, Expense, LedgerEntry, LedgerKind, Person } from '@/core/db/types';
import { epochToDateInput, formatCurrency } from '@/lib/formatters';
import { dateInputToEpoch } from '@/lib/date';
import { projectedBalance } from '@/core/accounts/balanceCalculator';
import { kindForIouCategory } from '@/core/iou/ledger';
import { TextInput, AmountInput, Toggle, DateInput, Banner } from '~/components/ui';
import {
  FormModal,
  AccountChips,
  PaymentModeChips,
  IouCategoryChips,
  IOU_ALL_CHOICES,
  IOU_DEFAULT_CHOICE
} from '~/components/shared';
import type { ExpenseCategory } from '@/core/db/types';
import { PersonPicker } from './PersonPicker';

/**
 * Whether (and on which account) to record the matching account transaction — expense for
 * lent/return-borrowed, income for borrowed/collected-money. On edit this also re-syncs an existing
 * linked transaction, or deletes it when `record` is turned off.
 */
export interface EntryTxnOption {
  record: boolean;
  accountId: string;
  personName: string;
  /** How the money moved — same `PaymentModeChips` field every regular transaction already has;
   *  '' when left unset (matches `ExpenseForm.tsx`'s own "optional, no forced default" behavior). */
  paymentMode: string;
}

interface EntryFormProps {
  persons: Person[];
  accounts: Account[];
  /** The 4 real IOU categories (Lending/Borrowed Money/Return Borrowed/Collected Money) — read live
   *  for their real name/icon/color, same as every other category picker in the app; falls back to
   *  `IOU_ALL_CHOICES`' own label/icon when a category can't be found (shouldn't happen in practice,
   *  these 4 are seeded defaults, but never hard-fails a render over it). */
  categories: ExpenseCategory[];
  /** Resolve the typed name to a (possibly new) person at save time. */
  getOrCreatePerson: (name: string) => Promise<Person>;
  /** Lock the form to a person (adding from their ledger). */
  presetPerson?: Person | undefined;
  /** A lent/borrowed entry being edited (settlements are not edited here). */
  editing?: LedgerEntry | null | undefined;
  /** The account transaction currently linked to the entry being edited, if any (to prefill the account). */
  linkedTxn?: Expense | null | undefined;
  /** Current balance per account — powers the cash-negative guard below (same pattern as `ExpenseForm.tsx`). */
  accountBalances?: Record<string, number>;
  onSave: (entry: LedgerEntry, txn?: EntryTxnOption) => Promise<void>;
  onDelete?: ((id: string) => Promise<void>) | undefined;
  onAddAccount: () => void;
  onClose: () => void;
  nowMs: number;
}

/** The category id an existing lent/borrowed entry being edited maps back to — used only to preselect
 *  the right tile; settlements are never edited here (see `editing`'s own doc comment), so this never
 *  needs to handle `kind === 'settlement'`. */
function categoryIdForEditingEntry(kind: Exclude<LedgerKind, 'settlement'>): string {
  return kind === 'lent' ? 'cat-lending' : 'cat-inc-borrowed';
}

/** Add / edit a single lent or borrowed entry, or record a brand-new settlement (Return Borrowed /
 *  Collected Money) — the same 4 categories `ExpenseForm.tsx`'s mandatory-IOU-category picker and
 *  `BulkAddToIouModal.tsx`'s wizard already use, replacing this popup's own former 2-option "I lent" /
 *  "I borrowed" toggle for consistency (2026-08-26 — the toggle also silently never assigned a real
 *  category to the transaction it created, landing every one on the generic "Other"/"Other Income"
 *  fallback; picking a real category here fixes that at the source). */
export function EntryForm({
  persons,
  accounts,
  categories,
  getOrCreatePerson,
  presetPerson,
  editing,
  linkedTxn,
  accountBalances,
  onSave,
  onDelete,
  onAddAccount,
  onClose,
  nowMs
}: EntryFormProps) {
  const editingPerson = editing ? persons.find((p) => p.id === editing.personId) : undefined;
  const lockedPerson = presetPerson ?? editingPerson;

  const [categoryId, setCategoryId] = useState<string>(() =>
    editing && editing.kind !== 'settlement' ? categoryIdForEditingEntry(editing.kind) : IOU_DEFAULT_CHOICE.categoryId
  );
  const choice = IOU_ALL_CHOICES.find((c) => c.categoryId === categoryId) ?? IOU_DEFAULT_CHOICE;
  // Same mapping `ExpenseForm.tsx`'s Lent/Borrowed panel now uses (2026-08-26) — one place for
  // "which of the 4 categories means which kind/settleDirection", instead of re-deriving it here too.
  const { kind, settleDirection } = kindForIouCategory(categoryId);
  // Which tiles `IouCategoryChips` should render locked — unchanged logic from before the chip-row
  // redesign (2026-08-27), just expressed as a lookup set instead of a per-tile inline calculation.
  // While editing an existing (non-settlement) entry, only each TILE's own category decides whether
  // it's disabled — not the currently-selected one (that was a real bug once: using the outer
  // `isSettlement` disabled either both settlement tiles or neither depending on which was selected,
  // instead of always disabling exactly the 2 settlement tiles while editing a lent/borrowed entry).
  const disabledCategoryIds = useMemo(() => {
    if (!editing) return undefined;
    const ids = new Set<string>();
    for (const c of IOU_ALL_CHOICES) {
      const tileIsSettlement = c.categoryId === 'cat-return-borrowed' || c.categoryId === 'cat-collected-money';
      const disabled = editing.kind === 'settlement' ? c.categoryId !== categoryId : tileIsSettlement;
      if (disabled) ids.add(c.categoryId);
    }
    return ids;
  }, [editing, categoryId]);

  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [query, setQuery] = useState(lockedPerson?.name ?? '');
  const [selectedId, setSelectedId] = useState<string | undefined>(lockedPerson?.id);
  const [description, setDescription] = useState(editing?.description ?? '');
  const [date, setDate] = useState(() => epochToDateInput(editing?.date ?? nowMs));
  const [dueDate, setDueDate] = useState(() => (editing?.dueDate != null ? epochToDateInput(editing.dueDate) : ''));
  const [saving, setSaving] = useState(false);

  // Record the matching account movement. New entries default ON; editing a manual entry re-syncs
  // (or removes) its linked transaction, so the toggle reflects whether one is currently linked.
  // Closed accounts (2026-08-27), same as archived, are never a valid target for a new link.
  const usableAccounts = accounts.filter((a) => !a.isArchived && !a.isClosed);
  const [recordTxn, setRecordTxn] = useState(editing ? !!editing.linkedTxnId : true);
  const [accountId, setAccountId] = useState(
    () => linkedTxn?.accountId ?? usableAccounts.find((a) => a.includeInNetWorth)?.id ?? usableAccounts[0]?.id ?? ''
  );
  const [paymentMode, setPaymentMode] = useState(linkedTxn?.paymentMode ?? '');
  // Expense-origin entries are owned by their expense (edit there); manual entries can re-sync here.
  const canRecord = (!editing || editing.origin === 'manual') && usableAccounts.length > 0;

  // Soft cash-negative guard (Track E / item 17), mirroring `ExpenseForm.tsx`'s `cashWarningBalance`.
  // Only a money-OUT category ("Lending" or "Return Borrowed") can push a Cash account negative;
  // money-IN categories only raise the balance.
  const payingAccount = usableAccounts.find((a) => a.id === accountId);
  const cashWarningBalance = useMemo(() => {
    if (!canRecord || !recordTxn || choice.direction === 'income' || !accountBalances || !payingAccount) return null;
    if (payingAccount.type !== 'cash') return null;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return null;
    let base = accountBalances[payingAccount.id] ?? payingAccount.openingBalance;
    if (linkedTxn) base -= projectedBalance(payingAccount.id, 0, [], linkedTxn);
    const projected = projectedBalance(payingAccount.id, base, [], {
      accountId: payingAccount.id,
      toAccountId: undefined,
      amount: amt,
      type: 'expense'
    });
    return projected < 0 ? projected : null;
  }, [canRecord, recordTxn, choice.direction, accountBalances, payingAccount, amount, linkedTxn]);

  async function handleSave() {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return;

    let personId = lockedPerson?.id ?? selectedId;
    let personName = lockedPerson?.name ?? '';
    if (!personId) {
      const name = query.trim();
      if (!name) return;
      const person = await getOrCreatePerson(name);
      personId = person.id;
      personName = person.name;
    }

    setSaving(true);
    const entry: LedgerEntry = {
      id: editing?.id ?? crypto.randomUUID(),
      personId,
      kind,
      amount: parsed,
      date: dateInputToEpoch(date, editing?.date),
      origin: editing?.origin ?? 'manual',
      createdAt: editing?.createdAt ?? nowMs,
      updatedAt: nowMs
    };
    if (settleDirection) entry.settleDirection = settleDirection;
    if (description.trim()) entry.description = description.trim();
    if (dueDate) entry.dueDate = new Date(dueDate).getTime();
    if (editing?.linkedTxnId) entry.linkedTxnId = editing.linkedTxnId;
    if (editing?.notes) entry.notes = editing.notes;

    const txnOption: EntryTxnOption | undefined = canRecord
      ? { record: recordTxn && !!accountId, accountId, personName, paymentMode }
      : undefined;

    try {
      await onSave(entry, txnOption);
    } finally {
      setSaving(false);
    }
  }

  const saveLabel = editing
    ? 'Update'
    : categoryId === 'cat-lending'
      ? 'I lent this'
      : categoryId === 'cat-inc-borrowed'
        ? 'I borrowed this'
        : categoryId === 'cat-return-borrowed'
          ? 'I paid this back'
          : 'I collected this';

  return (
    <FormModal
      title={editing ? 'Edit entry' : 'Add IOU'}
      onClose={onClose}
      onSave={() => void handleSave()}
      onDelete={editing && onDelete ? () => void onDelete(editing.id) : undefined}
      saving={saving}
      saveLabel={saveLabel}
    >
      {/* Same 4 real IOU categories `ExpenseForm.tsx`/`BulkAddToIouModal.tsx` already use, now as the
          same icon-chip row `AccountChips`/`PaymentModeChips`/the real category picker's own
          quick-pick row all use (2026-08-27, mockup
          `docs/mockups/proposals/iou-popups-expenseform-alignment-v1.html`) — replacing the previous
          `OptionButton` 2×2 grid, which was a fourth, different "pick one of a few" tile shape in a
          form that otherwise already reads like `ExpenseForm.tsx`. Editing an existing lent/borrowed
          entry can still switch between "Lending"/"Borrowed Money" (kind flips expense⇄income, same
          as the old toggle did) but not into/out of a settlement category — settlements are never
          edited here (see this component's own doc comment). */}
      <View className="gap-1.5">
        <Text className="text-xs font-medium text-secondary">Category</Text>
        <IouCategoryChips
          categories={categories}
          value={categoryId}
          onChange={setCategoryId}
          disabledIds={disabledCategoryIds}
        />
      </View>

      <AmountInput label="Amount" value={amount} onChange={setAmount} placeholder="0" autoFocus={!!lockedPerson} />

      {lockedPerson ? (
        <TextInput label="Person" value={lockedPerson.name} onChange={() => {}} disabled />
      ) : (
        <PersonPicker
          persons={persons}
          query={query}
          onQueryChange={(q) => {
            setQuery(q);
            setSelectedId(undefined);
          }}
          onSelect={(p) => {
            setQuery(p.name);
            setSelectedId(p.id);
          }}
          autoFocus
        />
      )}

      <TextInput
        label="What for (optional)"
        value={description}
        onChange={setDescription}
        placeholder="e.g. dinner split, cab fare"
      />

      <View className="flex-row gap-3">
        <View className="flex-1">
          <DateInput label="Date" value={date} onChange={setDate} />
        </View>
        <View className="flex-1">
          <DateInput label="Due date (optional)" value={dueDate} onChange={setDueDate} />
        </View>
      </View>

      {canRecord && (
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-medium text-secondary">
              {choice.direction === 'expense' ? 'Record money out of an account' : 'Record money into an account'}
            </Text>
            <Toggle value={recordTxn} onChange={setRecordTxn} accessibilityLabel="Record matching transaction" />
          </View>
          {recordTxn && (
            <View className="gap-1.5">
              <Text className="text-xs font-medium text-secondary">
                {choice.direction === 'expense' ? 'Paid from' : 'Received in'}
              </Text>
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
