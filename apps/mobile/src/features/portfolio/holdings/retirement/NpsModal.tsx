import { useState } from 'react';
import { FormModal } from '~/components/shared';
import type { Holding } from '@/core/db/types';
import type { NpsChoiceType, NpsLifecycleFund, NpsPfmKey, NpsSchemeType } from '@/core/nps';
import { buildBaseHolding, isHoldingValid, applyNpsFields } from '@/core/portfolio/holdingMappers';
import { holdingFormTitle } from '../shared/registry';
import { SharedNameField, SharedValueFields } from '../shared/SharedHoldingFields';
import { useSharedHoldingFields } from '../shared/useSharedHoldingFields';
import { NpsFields } from './NpsFields';

interface NpsModalProps {
  editing: Holding | null;
  onSave: (holding: Holding) => Promise<void>;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

// Self-contained add/edit modal for an NPS holding.
export function NpsModal({ editing, onSave, onDelete, onClose }: NpsModalProps) {
  const shared = useSharedHoldingFields(editing);
  const [npsTier, setNpsTier] = useState<'tier1' | 'tier2'>(editing?.assetMeta?.tier ?? 'tier1');
  const [npsPran, setNpsPran] = useState(editing?.assetMeta?.pran ?? '');
  const [npsMonthly, setNpsMonthly] = useState(
    editing?.assetMeta?.monthlyContribution != null ? String(editing.assetMeta.monthlyContribution) : ''
  );
  const [npsChoiceType, setNpsChoiceType] = useState<NpsChoiceType>(editing?.assetMeta?.npsChoiceType ?? 'auto');
  const [npsLifecycleFund, setNpsLifecycleFund] = useState<NpsLifecycleFund>(
    editing?.assetMeta?.npsLifecycleFund ?? 'lc50'
  );
  const [npsBirthYear, setNpsBirthYear] = useState(
    editing?.assetMeta?.npsBirthYear != null ? String(editing.assetMeta.npsBirthYear) : ''
  );
  const [npsPfm, setNpsPfm] = useState<NpsPfmKey | ''>((editing?.assetMeta?.npsPfm as NpsPfmKey | undefined) ?? '');
  const [npsSchemeType, setNpsSchemeType] = useState<NpsSchemeType | ''>(editing?.assetMeta?.npsSchemeType ?? '');
  const [units, setUnits] = useState(editing?.units != null ? String(editing.units) : '');
  const [saving, setSaving] = useState(false);

  function handleSave() {
    const invested = parseFloat(shared.investedAmount) || 0;
    const effectiveName = shared.name.trim();
    if (!isHoldingValid({ name: effectiveName, requiresAmount: true, investedAmount: invested })) return;
    setSaving(true);
    const holding = buildBaseHolding(
      {
        assetClass: 'nps',
        name: effectiveName,
        investedAmount: invested,
        currentValue: parseFloat(shared.currentValue) || undefined,
        notes: shared.notes
      },
      editing
    );
    applyNpsFields(holding, {
      npsTier,
      npsChoiceType,
      npsPran,
      npsMonthly,
      npsBirthYear,
      npsLifecycleFund,
      npsPfm,
      npsSchemeType,
      units
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
      title={holdingFormTitle(!!editing, 'nps')}
      onClose={onClose}
      onSave={handleSave}
      onDelete={editing && onDelete ? handleDelete : undefined}
      saving={saving}
      saveLabel={editing ? 'Update' : 'Add holding'}
    >
      <SharedNameField assetClass="nps" shared={shared} />
      <NpsFields
        npsChoiceType={npsChoiceType}
        setNpsChoiceType={setNpsChoiceType}
        npsLifecycleFund={npsLifecycleFund}
        setNpsLifecycleFund={setNpsLifecycleFund}
        npsPfm={npsPfm}
        setNpsPfm={setNpsPfm}
        npsSchemeType={npsSchemeType}
        setNpsSchemeType={setNpsSchemeType}
        npsTier={npsTier}
        setNpsTier={setNpsTier}
        npsBirthYear={npsBirthYear}
        setNpsBirthYear={setNpsBirthYear}
        npsPran={npsPran}
        setNpsPran={setNpsPran}
        npsMonthly={npsMonthly}
        setNpsMonthly={setNpsMonthly}
        units={units}
        setUnits={setUnits}
      />
      <SharedValueFields assetClass="nps" shared={shared} />
    </FormModal>
  );
}
