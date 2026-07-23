import { useState } from 'react';
import { Modal, Button, TextInput, SelectInput, AmountInput, Toggle } from '@/components/ui';
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
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button fullWidth disabled={!canSave} onClick={handleSave}>
            Add
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <TextInput label="Name" placeholder="e.g. Netflix, Gym, iCloud" value={name} onChange={setName} autoFocus />
        <div className="flex gap-2">
          <div className="flex-1">
            <AmountInput label="Amount (₹)" placeholder="0" value={amount} onChange={setAmount} />
          </div>
          <div className="w-36 flex-shrink-0">
            <SelectInput label="Billing" value={interval} onChange={setInterval} options={INTERVALS} />
          </div>
        </div>
        <TextInput label="Last charged" type="date" value={lastCharged} onChange={setLastCharged} />
        <div className="flex items-center justify-between rounded-xl border border-theme px-3 py-3">
          <div>
            <p className="text-xs font-medium text-secondary">Free trial</p>
            <p className="text-[11px] text-tertiary">Converts to paid after one cycle</p>
          </div>
          <Toggle value={isTrial} onChange={setIsTrial} aria-label="Free trial" />
        </div>
      </div>
    </Modal>
  );
}
