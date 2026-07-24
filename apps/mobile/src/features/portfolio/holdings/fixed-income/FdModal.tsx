import { useState } from 'react';
import type { Holding } from '@/core/db/types';
import type { CompoundingFreq } from '@/core/fd/fdCalculations';
import { applyFdFields, buildBaseHolding, isHoldingValid } from '@/core/portfolio/holdingMappers';
import { epochToDateInput } from '@/lib/formatters';
import { FormModal } from '~/components/shared';
import { holdingFormTitle } from '~/features/portfolio/holdings/shared/registry';
import { SharedNameField, SharedValueFields } from '~/features/portfolio/holdings/shared/SharedHoldingFields';
import { useSharedHoldingFields } from '~/features/portfolio/holdings/shared/useSharedHoldingFields';
import { FdFields } from './FdFields';
import { useFdPreview } from './useFdPreview';

interface FdModalProps {
  editing: Holding | null;
  onSave: (holding: Holding) => Promise<void>;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

// Self-contained add/edit modal for Fixed / Recurring Deposits.
export function FdModal({ editing, onSave, onDelete, onClose }: FdModalProps) {
  const shared = useSharedHoldingFields(editing);
  const [fdSubType, setFdSubType] = useState<'fd' | 'rd'>(editing?.assetMeta?.fdSubType ?? 'fd');
  const [fdBank, setFdBank] = useState(editing?.assetMeta?.fdBank ?? '');
  const [fdStartDate, setFdStartDate] = useState(() =>
    editing?.assetMeta?.fdStartDate != null ? epochToDateInput(editing.assetMeta.fdStartDate) : ''
  );
  const [fdCompoundingFreq, setFdCompoundingFreq] = useState<CompoundingFreq>(
    editing?.assetMeta?.fdCompoundingFreq ?? 'quarterly'
  );
  const [rdTenureMonths, setRdTenureMonths] = useState(
    editing?.assetMeta?.rdTenureMonths != null ? String(editing.assetMeta.rdTenureMonths) : ''
  );
  const [interestRate, setInterestRate] = useState(editing?.interestRate != null ? String(editing.interestRate) : '');
  const [maturityDate, setMaturityDate] = useState(() =>
    editing?.maturityDate != null ? epochToDateInput(editing.maturityDate) : ''
  );
  const [saving, setSaving] = useState(false);

  const fdPreview = useFdPreview({
    enabled: true,
    investedAmount: shared.investedAmount,
    interestRate,
    fdStartDate,
    maturityDate,
    fdSubType,
    fdCompoundingFreq,
    rdTenureMonths
  });

  function handleSave() {
    const invested = parseFloat(shared.investedAmount) || 0;
    const effectiveName = shared.name.trim();
    if (!isHoldingValid({ name: effectiveName, requiresAmount: false, investedAmount: invested })) return;
    setSaving(true);
    const holding = buildBaseHolding(
      {
        assetClass: 'fd',
        name: effectiveName,
        investedAmount: invested,
        currentValue: parseFloat(shared.currentValue) || undefined,
        notes: shared.notes
      },
      editing
    );
    applyFdFields(holding, {
      interestRate,
      fdSubType,
      fdBank,
      fdStartDate,
      maturityDate,
      fdCompoundingFreq,
      rdTenureMonths,
      investedAmount: shared.investedAmount,
      fdPreview,
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
      title={holdingFormTitle(!!editing, 'fd')}
      onClose={onClose}
      onSave={handleSave}
      onDelete={editing && onDelete ? handleDelete : undefined}
      saving={saving}
      saveLabel={editing ? 'Update' : 'Add holding'}
    >
      <SharedNameField assetClass="fd" shared={shared} />
      <FdFields
        editing={!!editing}
        fdSubType={fdSubType}
        setFdSubType={setFdSubType}
        fdBank={fdBank}
        setFdBank={setFdBank}
        fdStartDate={fdStartDate}
        setFdStartDate={setFdStartDate}
        interestRate={interestRate}
        setInterestRate={setInterestRate}
        investedAmount={shared.investedAmount}
        setInvestedAmount={shared.setInvestedAmount}
        fdCompoundingFreq={fdCompoundingFreq}
        setFdCompoundingFreq={setFdCompoundingFreq}
        maturityDate={maturityDate}
        setMaturityDate={setMaturityDate}
        rdTenureMonths={rdTenureMonths}
        setRdTenureMonths={setRdTenureMonths}
        fdPreview={fdPreview}
      />
      <SharedValueFields assetClass="fd" shared={shared} />
    </FormModal>
  );
}
