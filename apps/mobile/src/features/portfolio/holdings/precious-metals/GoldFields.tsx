import { View, Text, Pressable } from 'react-native';
import { TextInput, SegmentedControl, DetailRow } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';

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
  const theme = useThemeColors();

  return (
    <View className="flex-col gap-3">
      {/* Gold / Silver toggle */}
      <View>
        <Text className="text-xs font-medium text-secondary">Metal</Text>
        <View className="mt-1">
          <SegmentedControl
            options={[
              { value: 'gold', label: '🥇 Gold', color: '#d97706' },
              { value: 'silver', label: '🥈 Silver', color: '#94a3b8' }
            ]}
            value={metalType}
            onChange={(v) => {
              if (!editing) setMetalType(v);
            }}
          />
        </View>
      </View>

      {/* Category */}
      <View>
        <Text className="text-xs font-medium text-secondary">Category</Text>
        <View className="mt-1 flex-row flex-wrap gap-2">
          {(['jewellery', 'coin', 'bar', 'digital', 'other'] as const).map((cat) => {
            const active = metalCategory === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setMetalCategory(cat)}
                className="px-3 py-1.5 rounded-full border"
                style={
                  active
                    ? { backgroundColor: theme.primary, borderColor: theme.primary }
                    : { borderColor: theme.border }
                }
              >
                <Text className="text-xs font-medium" style={{ color: active ? '#fff' : theme.textSecondary }}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Karat (gold) or Purity (silver) */}
      {metalType === 'gold' ? (
        <View>
          <Text className="text-xs font-medium text-secondary">Karat</Text>
          <View className="mt-1">
            <SegmentedControl
              options={([14, 18, 22, 24] as const).map((k) => ({
                value: String(k),
                label: `${k}K`,
                color: '#d97706'
              }))}
              value={String(metalKarat)}
              onChange={(v) => setMetalKarat(Number(v) as 14 | 18 | 22 | 24)}
            />
          </View>
        </View>
      ) : (
        <View>
          <Text className="text-xs font-medium text-secondary">Purity</Text>
          <View className="mt-1">
            <SegmentedControl
              options={(['999', '925', '800', 'other'] as const).map((p) => ({
                value: p,
                label: p,
                color: '#94a3b8'
              }))}
              value={metalPurity}
              onChange={setMetalPurity}
            />
          </View>
        </View>
      )}

      {/* Weight + Purchase price */}
      <View className="flex-row flex-wrap gap-3">
        <View className="flex-1">
          <TextInput
            label="Weight (grams)"
            keyboardType="decimal-pad"
            placeholder="0.00"
            value={metalWeightGrams}
            onChange={setMetalWeightGrams}
          />
        </View>
        <View className="flex-1">
          <TextInput
            label="Purchase price (₹/g)"
            keyboardType="decimal-pad"
            placeholder="0.00"
            value={metalPurchasePrice}
            onChange={setMetalPurchasePrice}
          />
        </View>
      </View>

      {/* Invested amount preview */}
      {parseFloat(metalWeightGrams) > 0 && parseFloat(metalPurchasePrice) > 0 && (
        <DetailRow
          label="Total invested"
          value={`₹${(parseFloat(metalWeightGrams) * parseFloat(metalPurchasePrice)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          size="md"
        />
      )}
    </View>
  );
}
