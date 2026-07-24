import { useState } from 'react';
import type { Person } from '@/core/db/types';
import { TextInput } from '~/components/ui';
import { FormModal } from '~/components/shared';

interface PersonFormProps {
  editing: Person;
  onSave: (person: Person) => Promise<void>;
  /** Soft-archives if the person has entries, else hard-deletes (handled by the hook). */
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

/** Edit a person's name / phone / notes. */
export function PersonForm({ editing, onSave, onDelete, onClose }: PersonFormProps) {
  const [name, setName] = useState(editing.name);
  const [phone, setPhone] = useState(editing.phone ?? '');
  const [notes, setNotes] = useState(editing.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const person: Person = { ...editing, name: name.trim(), updatedAt: Date.now() };
    if (phone.trim()) person.phone = phone.trim();
    else delete person.phone;
    if (notes.trim()) person.notes = notes.trim();
    else delete person.notes;
    try {
      await onSave(person);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      title="Edit person"
      onClose={onClose}
      onSave={() => void handleSave()}
      onDelete={() => void onDelete(editing.id)}
      deleteLabel="Remove"
      saving={saving}
      saveLabel="Save"
    >
      <TextInput label="Name" value={name} onChange={setName} autoFocus />
      <TextInput
        label="Phone (optional)"
        value={phone}
        onChange={setPhone}
        keyboardType="phone-pad"
        placeholder="For your reference only"
      />
      <TextInput label="Notes (optional)" value={notes} onChange={setNotes} />
    </FormModal>
  );
}
