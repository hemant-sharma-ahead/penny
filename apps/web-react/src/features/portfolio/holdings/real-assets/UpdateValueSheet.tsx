import { useState } from 'react';
import { Modal, Button, AmountInput } from '@/components/ui';
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

  async function handleSave() {
    const v = parseFloat(value);
    if (isNaN(v) || v <= 0) return;
    setSaving(true);
    await onSave({ ...holding, currentValue: v, lastUpdatedAt: Date.now() });
    setSaving(false);
  }

  return (
    <Modal onClose={onClose} title="Update value">
      <p className="text-xs text-tertiary -mt-2">{label}</p>

      <div>
        <AmountInput
          label="Current market value"
          value={value}
          onChange={(val) => setValue(val)}
          placeholder="e.g. 650000"
        />
        {holding.investedAmount > 0 && (
          <p className="text-[10px] text-tertiary mt-1">
            Purchase price: ₹{holding.investedAmount.toLocaleString('en-IN')}
          </p>
        )}
      </div>

      <Button variant="primary" size="lg" fullWidth onClick={handleSave} disabled={saving} loading={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </Modal>
  );
}
