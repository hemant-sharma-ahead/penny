import { useState } from 'react';
import { View, Text } from 'react-native';
import { Modal, Button, TextInput, SelectInput, AmountInput, Toggle } from '~/components/ui';
import { epochToDateInput } from '@/lib/formatters';
import type { ManualSubscription } from './useSubscriptions';

interface Props {
  onAdd: (sub: ManualSubscription) => void;
  onClose: () => void;
}

const INTERVALS = [
  { value: '7', label: 'Weekly' },
  { value: '14', label: 'Fortnightly' },
  { value: '30', label: 'Monthly' },
  { value: '91', label: 'Quarterly' },
  { value: '365', label: 'Annual' }
];

/**
 * RN port note: web's "Last charged" field is a native HTML `<input type="date">`. RN has no built-in
 * date input; rather than pull in a native date-picker module for this pilot, it's a plain text field
 * accepting the same `YYYY-MM-DD` shape `epochToDateInput` already produces — a flagged, accepted
 * simplification (same parsing/format contract, just typed by hand instead of picked).
 */
export function SubscriptionForm({ onAdd, onClose }: Props) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [interval, setInterval] = useState('30');
  const [lastCharged, setLastCharged] = useState(() => epochToDateInput(Date.now()));
  const [isTrial, setIsTrial] = useState(false);

  const amt = parseFloat(amount);
  const canSave = name.trim().length > 0 && !isNaN(amt) && amt > 0;

  function handleSave() {
    if (!canSave) return;
    const intervalDays = parseInt(interval, 10) || 30;
    const lastChargedAt = lastCharged ? new Date(lastCharged).getTime() : undefined;
    const sub: ManualSubscription = {
      merchantCategory: name.trim(),
      detectedAmount: amt,
      intervalDays,
      status: isTrial ? 'trial' : 'active',
      ...(lastChargedAt !== undefined && { lastChargedAt }),
      // A trial converts to paid one interval after the last charge.
      ...(isTrial && lastChargedAt !== undefined && { trialEndsAt: lastChargedAt + intervalDays * 86_400_000 })
    };
    onAdd(sub);
    onClose();
  }

  return (
    <Modal
      title="Add subscription"
      onClose={onClose}
      footer={
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button variant="secondary" fullWidth onPress={onClose}>
              Cancel
            </Button>
          </View>
          <View className="flex-1">
            <Button fullWidth disabled={!canSave} onPress={handleSave}>
              Add
            </Button>
          </View>
        </View>
      }
    >
      <View className="gap-3">
        <TextInput label="Name" placeholder="e.g. Netflix, Gym, iCloud" value={name} onChange={setName} autoFocus />
        <View className="flex-row gap-2">
          <View className="flex-1">
            <AmountInput label="Amount (₹)" placeholder="0" value={amount} onChange={setAmount} />
          </View>
          <View className="w-36">
            <SelectInput label="Billing" value={interval} onChange={setInterval} options={INTERVALS} />
          </View>
        </View>
        <TextInput label="Last charged (YYYY-MM-DD)" value={lastCharged} onChange={setLastCharged} />
        <View className="flex-row items-center justify-between rounded-xl border border-theme px-3 py-3">
          <View>
            <Text className="text-xs font-medium text-secondary">Free trial</Text>
            <Text className="text-[11px] text-tertiary">Converts to paid after one cycle</Text>
          </View>
          <Toggle value={isTrial} onChange={setIsTrial} accessibilityLabel="Free trial" />
        </View>
      </View>
    </Modal>
  );
}
