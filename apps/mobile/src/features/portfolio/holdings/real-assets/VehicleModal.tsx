import { useState } from 'react';
import { FormModal } from '~/components/shared';
import type { Holding } from '@/core/db/types';
import { buildBaseHolding } from '@/core/portfolio/holdingMappers';
import { applyVehicleFields } from '@/core/portfolio/vehicleMeta';
import { holdingFormTitle } from '~/features/portfolio/holdings/shared/registry';
import { useSharedHoldingFields } from '~/features/portfolio/holdings/shared/useSharedHoldingFields';
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
    vehicleQueued,
    vehicleRcSnapshot,
    setVehicleRcSnapshot,
    vehicleChallanSnapshot,
    vehicleChallanError,
    lookup
  } = useVehicleLookup(editing, {
    setName: shared.setName,
    investedAmount: shared.investedAmount,
    setInvestedAmount: shared.setInvestedAmount,
    currentValue: shared.currentValue,
    setCurrentValue: shared.setCurrentValue
  });
  const [saving, setSaving] = useState(false);

  // Adding a *new* vehicle requires the RC fetch to have actually succeeded (or, for the queued
  // case, the app allowing a reg-number-only placeholder to be saved now and completed later — see
  // the queued-follow-up decision) — no manual-entry fallback if RC genuinely fails. Editing an
  // existing vehicle keeps today's unrestricted behaviour: the record already exists, so a retry
  // that fails shouldn't newly block saving other field edits.
  const canSave = !!editing || !!vehicleRcSnapshot || vehicleQueued;

  function handleSave() {
    if (!canSave) return;
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
      challanFetchFailed: vehicleChallanError,
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
    <FormModal
      onClose={onClose}
      title={holdingFormTitle(!!editing, 'vehicle')}
      onSave={handleSave}
      onDelete={editing && onDelete ? handleDelete : undefined}
      saving={saving}
      saveLabel={editing ? 'Update' : 'Add holding'}
      saveDisabled={!canSave}
      scrollable
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
        vehicleChallanError={vehicleChallanError}
        lookup={lookup}
      />
    </FormModal>
  );
}
