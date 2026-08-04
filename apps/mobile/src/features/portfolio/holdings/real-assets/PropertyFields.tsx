import { View } from 'react-native';
import { TextInput, SelectInput, DateInput } from '~/components/ui';
import type { PropertyType } from '@/core/portfolio/holdingMappers';

interface PropertyFieldsProps {
  propertyType: PropertyType;
  setPropertyType: (v: PropertyType) => void;
  propertyAreaSqft: string;
  setPropertyAreaSqft: (v: string) => void;
  propertyCity: string;
  setPropertyCity: (v: string) => void;
  propertyPurchaseDate: string;
  setPropertyPurchaseDate: (v: string) => void;
  /** Set only after a failed save attempt with no date — see PropertyModal.handleSave. */
  purchaseDateError?: string;
}

// Property fields: type, area, city, and purchase date. Market/purchase value
// is entered via the shared amount fields.
export function PropertyFields({
  propertyType,
  setPropertyType,
  propertyAreaSqft,
  setPropertyAreaSqft,
  propertyCity,
  setPropertyCity,
  propertyPurchaseDate,
  setPropertyPurchaseDate,
  purchaseDateError
}: PropertyFieldsProps) {
  return (
    <View className="flex-col gap-3">
      <View className="flex-row flex-wrap gap-3">
        <View className="flex-1 min-w-[45%]">
          <SelectInput
            label="Type"
            value={propertyType}
            onChange={(v) => setPropertyType(v as PropertyType)}
            placeholder="Select…"
            options={[
              { value: 'flat', label: 'Flat' },
              { value: 'house', label: 'House' },
              { value: 'plot', label: 'Plot' },
              { value: 'commercial', label: 'Commercial' }
            ]}
          />
        </View>
        <View className="flex-1 min-w-[45%]">
          <TextInput
            label="Area (sqft)"
            keyboardType="decimal-pad"
            placeholder="e.g. 1200"
            value={propertyAreaSqft}
            onChange={setPropertyAreaSqft}
          />
        </View>
      </View>
      <TextInput label="City" placeholder="e.g. Bangalore" value={propertyCity} onChange={setPropertyCity} />
      <DateInput
        label="Purchase date"
        value={propertyPurchaseDate}
        onChange={setPropertyPurchaseDate}
        required
        error={purchaseDateError}
        maximumDate={new Date()}
      />
    </View>
  );
}
