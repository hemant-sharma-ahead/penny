import { useState } from 'react';
import { FormModal } from '~/components/shared';
import type { Holding } from '@/core/db/types';
import { buildBaseHolding, isHoldingValid } from '@/core/portfolio/holdingMappers';
import { holdingFormTitle } from '~/features/portfolio/holdings/shared/registry';
import { SharedNameField, SharedValueFields } from '~/features/portfolio/holdings/shared/SharedHoldingFields';
import { useSharedHoldingFields } from '~/features/portfolio/holdings/shared/useSharedHoldingFields';

interface OtherModalProps {
  editing: Holding | null;
  onSave: (holding: Holding) => Promise<void>;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

// Self-contained add/edit modal for a generic "other" asset — name, amount,
// current value and notes only (no class-specific fields).
export function OtherModal({ editing, onSave, onDelete, onClose }: OtherModalProps) {
  const shared = useSharedHoldingFields(editing);
  const [saving, setSaving] = useState(false);

  function handleSave() {
    const invested = parseFloat(shared.investedAmount) || 0;
    const effectiveName = shared.name.trim();
    if (!isHoldingValid({ name: effectiveName, requiresAmount: true, investedAmount: invested })) return;
    setSaving(true);
    const holding = buildBaseHolding(
      {
        assetClass: 'other',
        name: effectiveName,
        investedAmount: invested,
        currentValue: parseFloat(shared.currentValue) || undefined,
        notes: shared.notes
      },
      editing
    );
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
      title={holdingFormTitle(!!editing, 'other')}
      onSave={handleSave}
      onDelete={editing && onDelete ? handleDelete : undefined}
      saving={saving}
      saveLabel={editing ? 'Update' : 'Add holding'}
      scrollable
    >
      <SharedNameField assetClass="other" shared={shared} />
      <SharedValueFields assetClass="other" shared={shared} />
    </FormModal>
  );
}
