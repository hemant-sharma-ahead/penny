import { useState } from 'react';
import { Modal, Button } from '@/components/ui';
import type { Holding } from '@/core/db/types';
import { buildBaseHolding } from '@/core/portfolio/holdingMappers';
import { applyVehicleFields } from '@/core/portfolio/vehicleMeta';
import { holdingFormTitle } from '@/features/portfolio/holdings/shared/registry';
import { useSharedHoldingFields } from '@/features/portfolio/holdings/shared/useSharedHoldingFields';
import { VehicleFields } from './VehicleFields';
import { useVehicleLookup } from './useVehicleLookup';

interface VehicleModalProps {
  editing: Holding | null;
  onSave: (holding: Holding) => Promise<void>;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

// Self-contained add/edit modal for a vehicle (RC plate lookup).
export function VehicleModal({ editing, onSave, onDelete, onClose }: VehicleModalProps) {
  const shared = useSharedHoldingFields(editing);
  const {
    vehicleRegInput,
    setVehicleRegInput,
    vehicleFetching,
    vehicleFetchError,
    setVehicleFetchError,
    vehicleNotice,
    vehicleRcSnapshot,
    setVehicleRcSnapshot,
    vehicleChallanSnapshot,
    lookup
  } = useVehicleLookup(editing, {
    setName: shared.setName,
    investedAmount: shared.investedAmount,
    setInvestedAmount: shared.setInvestedAmount,
    currentValue: shared.currentValue,
    setCurrentValue: shared.setCurrentValue
  });
  const [saving, setSaving] = useState(false);

  function handleSave() {
    const effectiveName = shared.name.trim() || vehicleRegInput.trim();
    if (!effectiveName) return;
    setSaving(true);
    const holding = buildBaseHolding(
      {
        assetClass: 'vehicle',
        name: effectiveName,
        investedAmount: parseFloat(shared.investedAmount) || 0,
        currentValue: parseFloat(shared.currentValue) || undefined,
        notes: shared.notes
      },
      editing
    );
    applyVehicleFields(holding, {
      rcSnapshot: vehicleRcSnapshot,
      challanSnapshot: vehicleChallanSnapshot,
      vehicleRegInput,
      ...(editing?.assetMeta && { existingMeta: editing.assetMeta })
    });
    onSave(holding)
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  function handleDelete() {
    if (editing && onDelete) onDelete(editing.id);
  }

  return (
    <Modal
      onClose={onClose}
      title={holdingFormTitle(!!editing, 'vehicle')}
      scrollable
      footer={
        <div className="flex gap-3">
          {editing && onDelete && (
            <Button variant="danger" fullWidth onClick={handleDelete}>
              Delete
            </Button>
          )}
          <Button variant="primary" fullWidth onClick={handleSave} loading={saving}>
            {saving ? 'Saving…' : editing ? 'Update' : 'Add holding'}
          </Button>
        </div>
      }
    >
      <VehicleFields
        vehicleRegInput={vehicleRegInput}
        setVehicleRegInput={setVehicleRegInput}
        vehicleFetching={vehicleFetching}
        vehicleFetchError={vehicleFetchError}
        setVehicleFetchError={setVehicleFetchError}
        vehicleNotice={vehicleNotice}
        vehicleRcSnapshot={vehicleRcSnapshot}
        setVehicleRcSnapshot={setVehicleRcSnapshot}
        lookup={lookup}
      />
    </Modal>
  );
}
