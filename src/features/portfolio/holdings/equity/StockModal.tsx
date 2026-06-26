import { useState } from 'react';
import { Modal, Button } from '@/components/ui';
import type { Holding } from '@/core/db/types';
import { buildBaseHolding, applyStockFields } from '@/core/portfolio/holdingMappers';
import { holdingFormTitle } from '@/features/portfolio/holdings/shared/registry';
import { SharedValueFields } from '@/features/portfolio/holdings/shared/SharedHoldingFields';
import { useSharedHoldingFields } from '@/features/portfolio/holdings/shared/useSharedHoldingFields';
import { useLivePrice } from './useLivePrice';
import { StockFields } from './StockFields';

interface StockModalProps {
  editing: Holding | null;
  onSave: (holding: Holding) => Promise<void>;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

// Self-contained add/edit modal for an equity (stock) holding.
export function StockModal({ editing, onSave, onDelete, onClose }: StockModalProps) {
  const shared = useSharedHoldingFields(editing);
  const [symbol, setSymbol] = useState(editing?.symbol ?? '');
  const [units, setUnits] = useState(editing?.units != null ? String(editing.units) : '');
  const [avgCostPrice, setAvgCostPrice] = useState(editing?.avgCostPrice != null ? String(editing.avgCostPrice) : '');
  const {
    fetchedPrice,
    setFetchedPrice,
    priceFetching,
    fetchedName,
    setFetchedName,
    stockFetchAttempted,
    setStockFetchAttempted
  } = useLivePrice('stock', '', symbol);
  const [saving, setSaving] = useState(false);

  function handleSave() {
    const effectiveName = shared.name.trim() || fetchedName || symbol.trim().replace(/\.(NS|BO)$/i, '');
    if (!effectiveName) return;
    setSaving(true);
    const holding = buildBaseHolding(
      {
        assetClass: 'stock',
        name: effectiveName,
        investedAmount: 0,
        currentValue: parseFloat(shared.currentValue) || undefined,
        notes: shared.notes
      },
      editing
    );
    applyStockFields(holding, { symbol, units, avgCostPrice, fetchedPrice });
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
      title={holdingFormTitle(!!editing, 'stock', editing ? undefined : 'stock')}
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
      <StockFields
        symbol={symbol}
        setSymbol={setSymbol}
        units={units}
        setUnits={setUnits}
        avgCostPrice={avgCostPrice}
        setAvgCostPrice={setAvgCostPrice}
        fetchedPrice={fetchedPrice}
        setFetchedPrice={setFetchedPrice}
        fetchedName={fetchedName}
        setFetchedName={setFetchedName}
        priceFetching={priceFetching}
        stockFetchAttempted={stockFetchAttempted}
        setStockFetchAttempted={setStockFetchAttempted}
      />
      <SharedValueFields assetClass="stock" shared={shared} />
    </Modal>
  );
}
