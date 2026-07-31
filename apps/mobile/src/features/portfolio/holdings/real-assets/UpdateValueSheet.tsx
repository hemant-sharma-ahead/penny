import { useState } from 'react';
import { Text } from 'react-native';
import { Modal, Button, AmountInput } from '~/components/ui';
import { useToast } from '~/context/ToastContext';
import type { Holding } from '@/core/db/types';

export function UpdateValueSheet({
  holding,
  onSave,
  onClose
}: {
  holding: Holding;
  onSave: (updated: Holding) => Promise<void>;
  onClose: () => void;
}) {
  const meta = holding.assetMeta ?? {};
  const isVehicle = holding.assetClass === 'vehicle';
  const label = isVehicle
    ? `${meta.vehicleMake ?? ''} ${meta.vehicleModel ?? ''}`.trim() || holding.name
    : meta.propertyCity
      ? `${meta.propertyType ?? 'Property'} · ${meta.propertyCity}`
      : holding.name;

  const [value, setValue] = useState(holding.currentValue?.toString() ?? holding.investedAmount.toString());
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  // try/catch/finally added 2026-07-25 (found via audit) — a thrown `onSave` used to leave `saving`
  // stuck at `true` forever, same bug class as SettingsPage's Exit Demo Mode.
  async function handleSave() {
    const v = parseFloat(value);
    if (isNaN(v) || v <= 0) return;
    setSaving(true);
    try {
      await onSave({ ...holding, currentValue: v, lastUpdatedAt: Date.now() });
    } catch {
      showToast({ message: "Couldn't save. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Update value">
      <Text className="text-xs text-tertiary -mt-2">{label}</Text>

      <AmountInput label="Current market value" value={value} onChange={setValue} placeholder="e.g. 650000" />
      {holding.investedAmount > 0 && (
        <Text className="text-[10px] text-tertiary mt-1">
          Purchase price: ₹{holding.investedAmount.toLocaleString('en-IN')}
        </Text>
      )}

      <Button variant="primary" size="lg" fullWidth onPress={handleSave} disabled={saving} loading={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </Modal>
  );
}
