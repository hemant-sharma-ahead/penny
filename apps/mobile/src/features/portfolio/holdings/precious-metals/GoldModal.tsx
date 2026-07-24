import { useState } from 'react';
import { View } from 'react-native';
import { Modal, Button } from '~/components/ui';
import type { Holding } from '@/core/db/types';
import { applyGoldFields, buildBaseHolding } from '@/core/portfolio/holdingMappers';
import { holdingFormTitle } from '../shared/registry';
import { SharedNameField, SharedValueFields } from '../shared/SharedHoldingFields';
import { useSharedHoldingFields } from '../shared/useSharedHoldingFields';
import { GoldFields } from './GoldFields';

interface GoldModalProps {
  editing: Holding | null;
  onSave: (holding: Holding) => Promise<void>;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

// Self-contained add/edit modal for precious metals (gold / silver).
export function GoldModal({ editing, onSave, onDelete, onClose }: GoldModalProps) {
  const shared = useSharedHoldingFields(editing);
  const [metalType, setMetalType] = useState<'gold' | 'silver'>(editing?.assetMeta?.metalType ?? 'gold');
  const [metalCategory, setMetalCategory] = useState<'jewellery' | 'coin' | 'bar' | 'digital' | 'other'>(
    editing?.assetMeta?.metalCategory ?? 'jewellery'
  );
  const [metalKarat, setMetalKarat] = useState<14 | 18 | 22 | 24>(editing?.assetMeta?.metalKarat ?? 22);
  const [metalPurity, setMetalPurity] = useState(editing?.assetMeta?.metalPurity ?? '999');
  const [metalWeightGrams, setMetalWeightGrams] = useState(
    editing?.assetMeta?.metalWeightGrams != null ? String(editing.assetMeta.metalWeightGrams) : ''
  );
  const [metalPurchasePrice, setMetalPurchasePrice] = useState(
    editing?.assetMeta?.metalPurchasePricePerGram != null ? String(editing.assetMeta.metalPurchasePricePerGram) : ''
  );
  const [saving, setSaving] = useState(false);

  function handleSave() {
    const effectiveName = shared.name.trim();
    if (!effectiveName) return;
    if (parseFloat(metalWeightGrams) <= 0 || parseFloat(metalPurchasePrice) <= 0) return;
    setSaving(true);
    const holding = buildBaseHolding(
      { assetClass: 'gold', name: effectiveName, investedAmount: 0, notes: shared.notes },
      editing
    );
    applyGoldFields(holding, {
      metalType,
      metalCategory,
      metalKarat,
      metalPurity,
      metalWeightGrams,
      metalPurchasePrice,
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
      title={holdingFormTitle(!!editing, 'gold')}
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
      <SharedNameField assetClass="gold" shared={shared} />
      <GoldFields
        editing={!!editing}
        metalType={metalType}
        setMetalType={setMetalType}
        metalCategory={metalCategory}
        setMetalCategory={setMetalCategory}
        metalKarat={metalKarat}
        setMetalKarat={setMetalKarat}
        metalPurity={metalPurity}
        setMetalPurity={setMetalPurity}
        metalWeightGrams={metalWeightGrams}
        setMetalWeightGrams={setMetalWeightGrams}
        metalPurchasePrice={metalPurchasePrice}
        setMetalPurchasePrice={setMetalPurchasePrice}
      />
      <SharedValueFields assetClass="gold" shared={shared} />
    </Modal>
  );
}
