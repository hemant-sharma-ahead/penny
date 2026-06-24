import { useState } from 'react';
import { Modal, Button } from '@/components/ui';
import type { Holding } from '@/core/db/types';
import { buildBaseHolding, applyMfFields } from '@/core/portfolio/holdingMappers';
import { holdingFormTitle } from '@/features/portfolio/holdings/shared/registry';
import { SharedValueFields } from '@/features/portfolio/holdings/shared/SharedHoldingFields';
import { useSharedHoldingFields } from '@/features/portfolio/holdings/shared/useSharedHoldingFields';
import { useMfSearch } from './useMfSearch';
import { useMfSchemeDetail } from './useMfSchemeDetail';
import { useLivePrice } from './useLivePrice';
import { MfFields } from './MfFields';

interface MfModalProps {
  editing: Holding | null;
  onSave: (holding: Holding) => Promise<void>;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

// Self-contained add/edit modal for a mutual-fund holding.
export function MfModal({ editing, onSave, onDelete, onClose }: MfModalProps) {
  const shared = useSharedHoldingFields(editing);
  const [mfQuery, setMfQuery] = useState(editing?.name ?? '');
  const [schemeCode, setSchemeCode] = useState(editing?.schemeCode ?? '');
  const [units, setUnits] = useState(editing?.units != null ? String(editing.units) : '');
  const [avgCostPrice, setAvgCostPrice] = useState(editing?.avgCostPrice != null ? String(editing.avgCostPrice) : '');
  const {
    results: mfResults,
    searching: mfSearching,
    dropdownOpen: mfDropdownOpen,
    setDropdownOpen: setMfDropdownOpen
  } = useMfSearch(true, mfQuery, schemeCode);
  const { schemeDetail, setSchemeDetail } = useMfSchemeDetail(true, schemeCode, editing);
  const { fetchedPrice, setFetchedPrice, priceFetching } = useLivePrice('mf', schemeCode, '');
  const [saving, setSaving] = useState(false);

  function handleSave() {
    const effectiveName = shared.name.trim();
    if (!effectiveName) return;
    setSaving(true);
    const holding = buildBaseHolding(
      {
        assetClass: 'mf',
        name: effectiveName,
        investedAmount: 0,
        currentValue: parseFloat(shared.currentValue) || undefined,
        notes: shared.notes
      },
      editing
    );
    applyMfFields(holding, { schemeCode, units, avgCostPrice, fetchedPrice, schemeDetail });
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
      title={holdingFormTitle(!!editing, 'mf', editing ? undefined : 'mf')}
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
      <MfFields
        editing={!!editing}
        mfQuery={mfQuery}
        setMfQuery={setMfQuery}
        schemeCode={schemeCode}
        setSchemeCode={setSchemeCode}
        mfResults={mfResults}
        mfSearching={mfSearching}
        mfDropdownOpen={mfDropdownOpen}
        setMfDropdownOpen={setMfDropdownOpen}
        schemeDetail={schemeDetail}
        setSchemeDetail={setSchemeDetail}
        name={shared.name}
        setName={shared.setName}
        units={units}
        setUnits={setUnits}
        avgCostPrice={avgCostPrice}
        setAvgCostPrice={setAvgCostPrice}
        fetchedPrice={fetchedPrice}
        setFetchedPrice={setFetchedPrice}
        priceFetching={priceFetching}
      />
      <SharedValueFields assetClass="mf" shared={shared} />
    </Modal>
  );
}
