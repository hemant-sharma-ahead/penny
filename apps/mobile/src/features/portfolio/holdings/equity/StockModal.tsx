import { useState } from 'react';
import { View } from 'react-native';
import { Modal, Button } from '~/components/ui';
import type { Holding } from '@/core/db/types';
import { buildBaseHolding, applyStockFields } from '@/core/portfolio/holdingMappers';
import { holdingFormTitle } from '../shared/registry';
import { SharedValueFields } from '../shared/SharedHoldingFields';
import { useSharedHoldingFields } from '../shared/useSharedHoldingFields';
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
  // setFetchedPrice/setFetchedName/setStockFetchAttempted aren't destructured here — those
  // resets now live entirely inside useLivePrice.ts's own debounced effect (see its
  // comment); StockFields only ever reads these three values, never sets them.
  const { fetchedPrice, priceFetching, fetchedName, stockFetchAttempted } = useLivePrice('stock', '', symbol);
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
        <View className="flex-row gap-3">
          {editing && onDelete && (
            <View className="flex-1">
              <Button variant="danger" fullWidth onPress={handleDelete}>
                Delete
              </Button>
            </View>
          )}
          <View className="flex-1">
            <Button variant="primary" fullWidth onPress={handleSave} loading={saving}>
              {saving ? 'Saving…' : editing ? 'Update' : 'Add holding'}
            </Button>
          </View>
        </View>
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
        fetchedName={fetchedName}
        priceFetching={priceFetching}
        stockFetchAttempted={stockFetchAttempted}
      />
      <SharedValueFields assetClass="stock" shared={shared} />
    </Modal>
  );
}
