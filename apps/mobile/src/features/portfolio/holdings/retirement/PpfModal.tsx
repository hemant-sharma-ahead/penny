import { useState } from 'react';
import { FormModal } from '~/components/shared';
import type { Holding } from '@/core/db/types';
import { buildBaseHolding, isHoldingValid, applyPpfFields } from '@/core/portfolio/holdingMappers';
import { epochToDateInput } from '@/lib/formatters';
import { holdingFormTitle } from '../shared/registry';
import { SharedNameField, SharedValueFields } from '../shared/SharedHoldingFields';
import { useSharedHoldingFields } from '../shared/useSharedHoldingFields';
import { PpfFields } from './PpfFields';

interface PpfModalProps {
  editing: Holding | null;
  onSave: (holding: Holding) => Promise<void>;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

// Self-contained add/edit modal for a PPF holding.
export function PpfModal({ editing, onSave, onDelete, onClose }: PpfModalProps) {
  const shared = useSharedHoldingFields(editing);
  const [ppfOpeningDate, setPpfOpeningDate] = useState(() =>
    editing?.assetMeta?.ppfOpeningDate != null ? epochToDateInput(editing.assetMeta.ppfOpeningDate) : ''
  );
  const [ppfBank, setPpfBank] = useState(editing?.assetMeta?.ppfBank ?? '');
  const [ppfAnnual, setPpfAnnual] = useState(
    editing?.assetMeta?.annualContribution != null ? String(editing.assetMeta.annualContribution) : ''
  );
  const [saving, setSaving] = useState(false);

  function handleSave() {
    const invested = parseFloat(shared.investedAmount) || 0;
    const effectiveName = shared.name.trim();
    if (!isHoldingValid({ name: effectiveName, requiresAmount: true, investedAmount: invested })) return;
    setSaving(true);
    const holding = buildBaseHolding(
      {
        assetClass: 'ppf',
        name: effectiveName,
        investedAmount: invested,
        currentValue: parseFloat(shared.currentValue) || undefined,
        notes: shared.notes
      },
      editing
    );
    applyPpfFields(holding, {
      ppfOpeningDate,
      ppfBank,
      ppfAnnual,
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
      title={holdingFormTitle(!!editing, 'ppf')}
      onClose={onClose}
      onSave={handleSave}
      onDelete={editing && onDelete ? handleDelete : undefined}
      saving={saving}
      saveLabel={editing ? 'Update' : 'Add holding'}
    >
      <SharedNameField assetClass="ppf" shared={shared} />
      <PpfFields
        ppfOpeningDate={ppfOpeningDate}
        setPpfOpeningDate={setPpfOpeningDate}
        ppfAnnual={ppfAnnual}
        setPpfAnnual={setPpfAnnual}
        ppfBank={ppfBank}
        setPpfBank={setPpfBank}
      />
      <SharedValueFields assetClass="ppf" shared={shared} />
    </FormModal>
  );
}
