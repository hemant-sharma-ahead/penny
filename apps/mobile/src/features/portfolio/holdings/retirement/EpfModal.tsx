import { useState } from 'react';
import { FormModal } from '~/components/shared';
import type { Holding } from '@/core/db/types';
import { buildBaseHolding, applyEpfFields } from '@/core/portfolio/holdingMappers';
import { epochToDateInput } from '@/lib/formatters';
import { holdingFormTitle } from '../shared/registry';
import { SharedNameField, SharedValueFields } from '../shared/SharedHoldingFields';
import { useSharedHoldingFields } from '../shared/useSharedHoldingFields';
import { EpfFields } from './EpfFields';

interface EpfModalProps {
  editing: Holding | null;
  onSave: (holding: Holding) => Promise<void>;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

// Self-contained add/edit modal for an EPF holding. Corpus is derived from
// transaction history (managed from the EPF card), so no manual amount is taken.
export function EpfModal({ editing, onSave, onDelete, onClose }: EpfModalProps) {
  const shared = useSharedHoldingFields(editing);
  const currentEmployer = editing?.assetMeta?.epfEmployers?.find((e) => !e.toDate);
  const [epfUan, setEpfUan] = useState(editing?.assetMeta?.uan ?? '');
  const [epfBirthYear, setEpfBirthYear] = useState(
    editing?.assetMeta?.epfBirthYear != null ? String(editing.assetMeta.epfBirthYear) : ''
  );
  const [epfCompany, setEpfCompany] = useState(currentEmployer?.companyName ?? '');
  const [epfBasicSalary, setEpfBasicSalary] = useState(
    currentEmployer?.basicSalary != null ? String(currentEmployer.basicSalary) : ''
  );
  const [epfJoiningDate, setEpfJoiningDate] = useState(() =>
    currentEmployer?.fromDate != null ? epochToDateInput(currentEmployer.fromDate) : ''
  );
  const epfEmployeePct = currentEmployer?.employeeContribPct ?? 12;
  const [saving, setSaving] = useState(false);

  function handleSave() {
    const effectiveName = shared.name.trim();
    if (!effectiveName) return;
    setSaving(true);
    const holding = buildBaseHolding(
      {
        assetClass: 'epf',
        name: effectiveName,
        investedAmount: parseFloat(shared.investedAmount) || 0,
        currentValue: parseFloat(shared.currentValue) || undefined,
        notes: shared.notes
      },
      editing
    );
    applyEpfFields(holding, {
      epfUan,
      epfBirthYear,
      epfCompany,
      epfBasicSalary,
      epfEmployeePct,
      epfJoiningDate,
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
      title={holdingFormTitle(!!editing, 'epf')}
      onClose={onClose}
      onSave={handleSave}
      onDelete={editing && onDelete ? handleDelete : undefined}
      saving={saving}
      saveLabel={editing ? 'Update' : 'Add holding'}
    >
      <SharedNameField assetClass="epf" shared={shared} />
      <EpfFields
        epfUan={epfUan}
        setEpfUan={setEpfUan}
        epfBirthYear={epfBirthYear}
        setEpfBirthYear={setEpfBirthYear}
        epfCompany={epfCompany}
        setEpfCompany={setEpfCompany}
        epfBasicSalary={epfBasicSalary}
        setEpfBasicSalary={setEpfBasicSalary}
        epfJoiningDate={epfJoiningDate}
        setEpfJoiningDate={setEpfJoiningDate}
      />
      <SharedValueFields assetClass="epf" shared={shared} />
    </FormModal>
  );
}
