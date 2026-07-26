import { TextInput, SegmentedControl, DetailRow } from '@/components/ui';

interface GoldFieldsProps {
  editing: boolean;
  metalType: 'gold' | 'silver';
  setMetalType: (v: 'gold' | 'silver') => void;
  metalCategory: 'jewellery' | 'coin' | 'bar' | 'digital' | 'other';
  setMetalCategory: (v: 'jewellery' | 'coin' | 'bar' | 'digital' | 'other') => void;
  metalKarat: 14 | 18 | 22 | 24;
  setMetalKarat: (v: 14 | 18 | 22 | 24) => void;
  metalPurity: string;
  setMetalPurity: (v: string) => void;
  metalWeightGrams: string;
  setMetalWeightGrams: (v: string) => void;
  metalPurchasePrice: string;
  setMetalPurchasePrice: (v: string) => void;
}

// Precious-metal fields: gold/silver toggle (locked when editing), category,
// karat (gold) or purity (silver), weight + purchase price, invested preview.
export function GoldFields({
  editing,
  metalType,
  setMetalType,
  metalCategory,
  setMetalCategory,
  metalKarat,
  setMetalKarat,
  metalPurity,
  setMetalPurity,
  metalWeightGrams,
  setMetalWeightGrams,
  metalPurchasePrice,
  setMetalPurchasePrice
}: GoldFieldsProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Gold / Silver toggle */}
      <div>
        <label className="text-xs font-medium text-secondary">Metal</label>
        <div className="mt-1">
          <SegmentedControl
            options={[
              { value: 'gold', label: '🥇 Gold', color: '#d97706' },
              { value: 'silver', label: '🥈 Silver', color: '#94a3b8' }
            ]}
            value={metalType}
            onChange={(v) => {
              if (!editing) setMetalType(v as 'gold' | 'silver');
            }}
          />
        </div>
      </div>

      {/* Category */}
      <div>
        <label className="text-xs font-medium text-secondary">Category</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {(['jewellery', 'coin', 'bar', 'digital', 'other'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setMetalCategory(cat)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
              style={
                metalCategory === cat
                  ? {
                      backgroundColor: 'var(--color-primary)',
                      color: '#fff',
                      borderColor: 'var(--color-primary)'
                    }
                  : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
              }
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Karat (gold) or Purity (silver) */}
      {metalType === 'gold' ? (
        <div>
          <label className="text-xs font-medium text-secondary">Karat</label>
          <div className="mt-1">
            <SegmentedControl
              options={([14, 18, 22, 24] as const).map((k) => ({
                value: String(k),
                label: `${k}K`,
                color: '#d97706'
              }))}
              value={String(metalKarat)}
              onChange={(v) => setMetalKarat(Number(v) as 14 | 18 | 22 | 24)}
            />
          </div>
        </div>
      ) : (
        <div>
          <label className="text-xs font-medium text-secondary">Purity</label>
          <div className="mt-1">
            <SegmentedControl
              options={(['999', '925', '800', 'other'] as const).map((p) => ({
                value: p,
                label: p,
                color: '#94a3b8'
              }))}
              value={metalPurity}
              onChange={(v) => setMetalPurity(v)}
            />
          </div>
        </div>
      )}

      {/* Weight + Purchase price */}
      <div className="grid grid-cols-2 gap-3">
        <TextInput
          label="Weight (grams)"
          type="number"
          inputMode="decimal"
          placeholder="0.00"
          value={metalWeightGrams}
          onChange={setMetalWeightGrams}
        />
        <TextInput
          label="Purchase price (₹/g)"
          type="number"
          inputMode="decimal"
          placeholder="0.00"
          value={metalPurchasePrice}
          onChange={setMetalPurchasePrice}
        />
      </div>

      {/* Invested amount preview */}
      {parseFloat(metalWeightGrams) > 0 && parseFloat(metalPurchasePrice) > 0 && (
        <DetailRow
          label="Total invested"
          value={`₹${(parseFloat(metalWeightGrams) * parseFloat(metalPurchasePrice)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          size="md"
        />
      )}
    </div>
  );
}
