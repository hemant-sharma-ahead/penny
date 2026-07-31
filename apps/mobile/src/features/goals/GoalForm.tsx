import { useState } from 'react';
import { View, Text } from 'react-native';
import type { Goal, GoalRisk } from '@/core/db/types';
import { epochToDateInput } from '@/lib/formatters';
import { TextInput, OptionButton, AmountInput, DateInput } from '~/components/ui';
import { FormModal } from '~/components/shared';

interface Props {
  editing: Goal | null;
  onSave: (goal: Goal) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

const RISK_OPTIONS: { value: GoalRisk; label: string; color: string }[] = [
  { value: 'conservative', label: 'Conservative', color: '#3b82f6' },
  { value: 'moderate', label: 'Moderate', color: '#10b981' },
  { value: 'aggressive', label: 'Aggressive', color: '#ef4444' }
];

export function GoalForm({ editing, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(editing?.name ?? '');
  const [targetAmount, setTargetAmount] = useState(editing ? String(editing.targetAmount) : '');
  const [currentAmount, setCurrentAmount] = useState(editing ? String(editing.currentAmount) : '0');
  const [targetDate, setTargetDate] = useState(() => {
    if (editing) return epochToDateInput(editing.targetDate);
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return epochToDateInput(d.getTime());
  });
  const [risk, setRisk] = useState<GoalRisk>(editing?.risk ?? 'moderate');
  const [saving, setSaving] = useState(false);

  function handleSave() {
    const target = parseFloat(targetAmount);
    const current = parseFloat(currentAmount) || 0;
    if (!name.trim() || isNaN(target) || target <= 0) return;
    setSaving(true);
    const now = Date.now();
    onSave({
      id: editing?.id ?? crypto.randomUUID(),
      name: name.trim(),
      targetAmount: target,
      currentAmount: current,
      targetDate: new Date(targetDate).getTime(),
      risk,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now
    })
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  function handleDelete() {
    if (!editing) return;
    onDelete(editing.id).catch(() => {});
  }

  return (
    <FormModal
      title={editing ? 'Edit goal' : 'New goal'}
      onClose={onClose}
      onSave={handleSave}
      onDelete={editing ? handleDelete : undefined}
      saving={saving}
      saveLabel={editing ? 'Update' : 'Save goal'}
    >
      <TextInput
        label="Goal name"
        value={name}
        onChange={setName}
        placeholder="e.g. Emergency fund, Europe trip"
        autoFocus
      />

      <AmountInput label="Target amount" value={targetAmount} onChange={setTargetAmount} placeholder="e.g. 500000" />

      <AmountInput label="Already saved" value={currentAmount} onChange={setCurrentAmount} placeholder="0" />

      <DateInput label="Target date" value={targetDate} onChange={setTargetDate} />

      <View>
        <Text className="text-xs font-medium text-secondary">Investment approach</Text>
        <View className="mt-1 flex-row flex-wrap gap-2">
          {RISK_OPTIONS.map((opt) => (
            <View key={opt.value} className="w-[31%]">
              <OptionButton
                compact
                label={opt.label}
                selected={risk === opt.value}
                onPress={() => setRisk(opt.value)}
                color={opt.color}
              />
            </View>
          ))}
        </View>
        <Text className="text-[10px] mt-1.5 text-tertiary">Conservative 7% · Moderate 11% · Aggressive 14% p.a.</Text>
      </View>
    </FormModal>
  );
}
