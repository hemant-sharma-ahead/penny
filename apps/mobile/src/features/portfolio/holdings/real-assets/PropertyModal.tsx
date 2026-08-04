import { useState } from 'react';
import { FormModal } from '~/components/shared';
import type { Holding } from '@/core/db/types';
import { buildBaseHolding, isHoldingValid, applyPropertyFields } from '@/core/portfolio/holdingMappers';
import { epochToDateInput } from '@/lib/formatters';
import { holdingFormTitle } from '~/features/portfolio/holdings/shared/registry';
import { SharedNameField, SharedValueFields } from '~/features/portfolio/holdings/shared/SharedHoldingFields';
import { useSharedHoldingFields } from '~/features/portfolio/holdings/shared/useSharedHoldingFields';
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
  const [propertyPurchaseDate, setPropertyPurchaseDate] = useState(() =>
    editing?.assetMeta?.propertyPurchaseDate != null ? epochToDateInput(editing.assetMeta.propertyPurchaseDate) : ''
  );
  const [showDateError, setShowDateError] = useState(false);
  const [saving, setSaving] = useState(false);

  function handleSave() {
    const invested = parseFloat(shared.investedAmount) || 0;
    const effectiveName = shared.name.trim();
    if (!isHoldingValid({ name: effectiveName, requiresAmount: false, investedAmount: invested })) return;
    if (!propertyPurchaseDate) {
      setShowDateError(true);
      return;
    }
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
      propertyPurchaseDate,
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
      title={holdingFormTitle(!!editing, 'property')}
      onSave={handleSave}
      onDelete={editing && onDelete ? handleDelete : undefined}
      saving={saving}
      saveLabel={editing ? 'Update' : 'Add holding'}
      scrollable
    >
      <SharedNameField assetClass="property" shared={shared} />
      <PropertyFields
        propertyType={propertyType}
        setPropertyType={setPropertyType}
        propertyAreaSqft={propertyAreaSqft}
        setPropertyAreaSqft={setPropertyAreaSqft}
        propertyCity={propertyCity}
        setPropertyCity={setPropertyCity}
        propertyPurchaseDate={propertyPurchaseDate}
        setPropertyPurchaseDate={(v) => {
          setPropertyPurchaseDate(v);
          if (v) setShowDateError(false);
        }}
        purchaseDateError={showDateError ? 'Purchase date is required' : undefined}
      />
      <SharedValueFields assetClass="property" shared={shared} />
    </FormModal>
  );
}
