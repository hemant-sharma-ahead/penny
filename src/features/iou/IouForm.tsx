import { useState } from 'react';
import type { IouDirection, PersonalIou } from '@/core/db/types';
import { epochToDateInput } from '@/lib/formatters';
import { TextInput, OptionButton, AmountInput } from '@/components/ui';
import { FormModal } from '@/components/shared';
import { STATUS } from '@/lib/statusColors';

interface Props {
  editing: PersonalIou | null;
  onSave: (iou: PersonalIou) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
  nowMs: number;
}

export function IouForm({ editing, onSave, onDelete, onClose, nowMs }: Props) {
  const [direction, setDirection] = useState<IouDirection>(editing?.direction ?? 'lent');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [date, setDate] = useState(() => epochToDateInput(editing?.date ?? nowMs));
  const [dueDate, setDueDate] = useState(() => (editing?.dueDate != null ? epochToDateInput(editing.dueDate) : ''));
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  function handleSave() {
    const parsed = parseFloat(amount);
    if (!description.trim() || isNaN(parsed) || parsed <= 0) return;
    setSaving(true);
    const iou: PersonalIou = {
      id: editing?.id ?? crypto.randomUUID(),
      direction,
      amount: parsed,
      description: description.trim(),
      date: new Date(date).getTime(),
      isSettled: editing?.isSettled ?? false,
      createdAt: editing?.createdAt ?? nowMs,
      updatedAt: nowMs
    };
    if (dueDate) iou.dueDate = new Date(dueDate).getTime();
    if (notes.trim()) iou.notes = notes.trim();
    if (editing?.settledAt != null) iou.settledAt = editing.settledAt;
    onSave(iou)
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  function handleDelete() {
    if (!editing) return;
    onDelete(editing.id).catch(() => {});
  }

  return (
    <FormModal
      title={editing ? 'Edit IOU' : 'Add IOU'}
      onClose={onClose}
      onSave={handleSave}
      onDelete={editing ? handleDelete : undefined}
      saving={saving}
      saveLabel={editing ? 'Update' : direction === 'lent' ? 'I lent this' : 'I borrowed this'}
    >
      {/* Direction */}
      <div className="grid grid-cols-2 gap-2">
        <OptionButton
          label="I lent"
          icon="ti-arrow-up"
          selected={direction === 'lent'}
          onClick={() => setDirection('lent')}
          color={STATUS.success}
        />
        <OptionButton
          label="I borrowed"
          icon="ti-arrow-down"
          selected={direction === 'borrowed'}
          onClick={() => setDirection('borrowed')}
          color={STATUS.danger}
        />
      </div>

      <AmountInput label="Amount" value={amount} onChange={setAmount} placeholder="0" autoFocus />

      <TextInput
        label="Description"
        value={description}
        onChange={setDescription}
        placeholder="e.g. Lunch split, cab fare, concert tickets"
      />

      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Date" value={date} onChange={setDate} type="date" />
        <TextInput label="Due date (optional)" value={dueDate} onChange={setDueDate} type="date" />
      </div>

      <TextInput
        label="Notes (optional)"
        value={notes}
        onChange={setNotes}
        placeholder="Any context worth remembering"
      />
    </FormModal>
  );
}
