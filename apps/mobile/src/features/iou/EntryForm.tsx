import { useState } from 'react';
import { View, Text } from 'react-native';
import type { Account, Expense, LedgerEntry, LedgerKind, Person } from '@/core/db/types';
import { epochToDateInput } from '@/lib/formatters';
import { dateInputToEpoch } from '@/lib/date';
import { TextInput, OptionButton, AmountInput, SelectInput, Toggle, DateInput } from '~/components/ui';
import { FormModal } from '~/components/shared';
import { useThemeColors } from '~/theme/useThemeColors';
import { PersonPicker } from './PersonPicker';

/**
 * Whether (and on which account) to record the matching account transaction — expense for lent,
 * income for borrowed. On edit this also re-syncs an existing linked transaction, or deletes it
 * when `record` is turned off.
 */
export interface EntryTxnOption {
  record: boolean;
  accountId: string;
  personName: string;
}

interface EntryFormProps {
  persons: Person[];
  accounts: Account[];
  /** Resolve the typed name to a (possibly new) person at save time. */
  getOrCreatePerson: (name: string) => Promise<Person>;
  /** Lock the form to a person (adding from their ledger). */
  presetPerson?: Person | undefined;
  /** A lent/borrowed entry being edited (settlements are not edited here). */
  editing?: LedgerEntry | null | undefined;
  /** The account transaction currently linked to the entry being edited, if any (to prefill the account). */
  linkedTxn?: Expense | null | undefined;
  onSave: (entry: LedgerEntry, txn?: EntryTxnOption) => Promise<void>;
  onDelete?: ((id: string) => Promise<void>) | undefined;
  onClose: () => void;
  nowMs: number;
}

/** Add / edit a single lent or borrowed ledger entry. */
export function EntryForm({
  persons,
  accounts,
  getOrCreatePerson,
  presetPerson,
  editing,
  linkedTxn,
  onSave,
  onDelete,
  onClose,
  nowMs
}: EntryFormProps) {
  const theme = useThemeColors();
  const editingPerson = editing ? persons.find((p) => p.id === editing.personId) : undefined;
  const lockedPerson = presetPerson ?? editingPerson;

  const [kind, setKind] = useState<Exclude<LedgerKind, 'settlement'>>(
    editing && editing.kind !== 'settlement' ? editing.kind : 'lent'
  );
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [query, setQuery] = useState(lockedPerson?.name ?? '');
  const [selectedId, setSelectedId] = useState<string | undefined>(lockedPerson?.id);
  const [description, setDescription] = useState(editing?.description ?? '');
  const [date, setDate] = useState(() => epochToDateInput(editing?.date ?? nowMs));
  const [dueDate, setDueDate] = useState(() => (editing?.dueDate != null ? epochToDateInput(editing.dueDate) : ''));
  const [saving, setSaving] = useState(false);

  // Record the matching account movement. New entries default ON; editing a manual entry re-syncs
  // (or removes) its linked transaction, so the toggle reflects whether one is currently linked.
  const usableAccounts = accounts.filter((a) => !a.isArchived);
  const [recordTxn, setRecordTxn] = useState(editing ? !!editing.linkedTxnId : true);
  const [accountId, setAccountId] = useState(
    () => linkedTxn?.accountId ?? usableAccounts.find((a) => a.includeInNetWorth)?.id ?? usableAccounts[0]?.id ?? ''
  );
  // Expense-origin entries are owned by their expense (edit there); manual entries can re-sync here.
  const canRecord = (!editing || editing.origin === 'manual') && usableAccounts.length > 0;

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
    if (description.trim()) entry.description = description.trim();
    if (dueDate) entry.dueDate = new Date(dueDate).getTime();
    if (editing?.linkedTxnId) entry.linkedTxnId = editing.linkedTxnId;
    if (editing?.notes) entry.notes = editing.notes;

    const txnOption: EntryTxnOption | undefined = canRecord
      ? { record: recordTxn && !!accountId, accountId, personName }
      : undefined;

    try {
      await onSave(entry, txnOption);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      title={editing ? 'Edit entry' : 'Add IOU'}
      onClose={onClose}
      onSave={() => void handleSave()}
      onDelete={editing && onDelete ? () => void onDelete(editing.id) : undefined}
      saving={saving}
      saveLabel={editing ? 'Update' : kind === 'lent' ? 'I lent this' : 'I borrowed this'}
    >
      <View className="flex-row gap-2">
        <View className="flex-1">
          <OptionButton
            label="I lent"
            icon="ti-arrow-up"
            selected={kind === 'lent'}
            onPress={() => setKind('lent')}
            color={theme.success}
          />
        </View>
        <View className="flex-1">
          <OptionButton
            label="I borrowed"
            icon="ti-arrow-down"
            selected={kind === 'borrowed'}
            onPress={() => setKind('borrowed')}
            color={theme.danger}
          />
        </View>
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
              {kind === 'lent' ? 'Record money out of an account' : 'Record money into an account'}
            </Text>
            <Toggle value={recordTxn} onChange={setRecordTxn} accessibilityLabel="Record matching transaction" />
          </View>
          {recordTxn && (
            <SelectInput
              label={kind === 'lent' ? 'Paid from' : 'Received in'}
              value={accountId}
              onChange={setAccountId}
              options={usableAccounts.map((a) => ({ value: a.id, label: a.name }))}
            />
          )}
        </View>
      )}
    </FormModal>
  );
}
