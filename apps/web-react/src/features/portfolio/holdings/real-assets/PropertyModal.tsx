import { useState } from 'react';
import { Modal, Button } from '@/components/ui';
import type { Holding } from '@/core/db/types';
import { buildBaseHolding, isHoldingValid, applyPropertyFields } from '@/core/portfolio/holdingMappers';
import { holdingFormTitle } from '@/features/portfolio/holdings/shared/registry';
import { SharedNameField, SharedValueFields } from '@/features/portfolio/holdings/shared/SharedHoldingFields';
import { useSharedHoldingFields } from '@/features/portfolio/holdings/shared/useSharedHoldingFields';
import { PropertyFields } from './PropertyFields';
import type { PropertyType } from '@/core/portfolio/holdingMappers';

interface PropertyModalProps {
  editing: Holding | null;
  onSave: (holding: Holding) => Promise<void>;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

// Self-contained add/edit modal for a property holding.
export function PropertyModal({ editing, onSave, onDelete, onClose }: PropertyModalProps) {
  const shared = useSharedHoldingFields(editing);
  const [propertyType, setPropertyType] = useState<PropertyType>(editing?.assetMeta?.propertyType ?? '');
  const [propertyAreaSqft, setPropertyAreaSqft] = useState(
    editing?.assetMeta?.propertyAreaSqft != null ? String(editing.assetMeta.propertyAreaSqft) : ''
  );
  const [propertyCity, setPropertyCity] = useState(editing?.assetMeta?.propertyCity ?? '');
  const [saving, setSaving] = useState(false);

  function handleSave() {
    const invested = parseFloat(shared.investedAmount) || 0;
    const effectiveName = shared.name.trim();
    if (!isHoldingValid({ name: effectiveName, requiresAmount: false, investedAmount: invested })) return;
    setSaving(true);
    const holding = buildBaseHolding(
      {
        assetClass: 'property',
        name: effectiveName,
        investedAmount: invested,
        currentValue: parseFloat(shared.currentValue) || undefined,
        notes: shared.notes
      },
      editing
    );
    applyPropertyFields(holding, {
      propertyType,
      propertyAreaSqft,
      propertyCity,
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
      title={holdingFormTitle(!!editing, 'property')}
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
      <SharedNameField assetClass="property" shared={shared} />
      <PropertyFields
        propertyType={propertyType}
        setPropertyType={setPropertyType}
        propertyAreaSqft={propertyAreaSqft}
        setPropertyAreaSqft={setPropertyAreaSqft}
        propertyCity={propertyCity}
        setPropertyCity={setPropertyCity}
      />
      <SharedValueFields assetClass="property" shared={shared} />
    </Modal>
  );
}
