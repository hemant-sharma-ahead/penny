import { useState } from 'react';
import { Text } from 'react-native';
import type { GoalContribution } from '@/core/db/types';
import { epochToDateInput } from '@/lib/formatters';
import { dateInputToEpoch } from '@/lib/date';
import { AmountInput, DateInput } from '~/components/ui';
import { FormModal } from '~/components/shared';

interface LegacyContributionEditModalProps {
  goalName: string;
  editing: GoalContribution;
  onSave: (input: { amount: number; date: number }) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

/**
 * Edit-only fallback for a contribution logged before 2026-08-02, when "Add contribution" recorded a
 * bare amount/date with no linked transaction at all (the old "Quick add" card button, and
 * `GoalContributionForm`'s "Record as a transaction" toggle switched off). "Add contribution" always
 * opens the real `ExpenseForm` now (see `GoalsTab.tsx`), so a contribution can never end up in this
 * shape again — this exists solely so a pre-existing one can still be edited or deleted. There's
 * genuinely nothing else to show for it (no account, no category, no transaction to open), so it stays
 * this small rather than being styled to match the Expense form.
 */
export function LegacyContributionEditModal({
  goalName,
  editing,
  onSave,
  onDelete,
  onClose
}: LegacyContributionEditModalProps) {
  const [amount, setAmount] = useState(String(editing.amount));
  const [date, setDate] = useState(() => epochToDateInput(editing.date));
  const [saving, setSaving] = useState(false);

  function handleSave() {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return;
    setSaving(true);
    onSave({ amount: parsed, date: dateInputToEpoch(date, editing.date) }).finally(() => setSaving(false));
  }

  return (
    <FormModal
      title="Edit contribution"
      onClose={onClose}
      onSave={handleSave}
      onDelete={() => void onDelete()}
      saving={saving}
      saveLabel="Update"
    >
      <Text className="text-xs text-secondary -mt-1">
        Toward {goalName} — a bookkeeping-only entry, no linked transaction
      </Text>
      <AmountInput label="Amount" value={amount} onChange={setAmount} placeholder="0" autoFocus />
      <DateInput label="Date" value={date} onChange={setDate} />
    </FormModal>
  );
}
