import { TextInput, SelectInput } from '@/components/ui';
import type { PropertyType } from '@/core/portfolio/holdingMappers';

interface PropertyFieldsProps {
  propertyType: PropertyType;
  setPropertyType: (v: PropertyType) => void;
  propertyAreaSqft: string;
  setPropertyAreaSqft: (v: string) => void;
  propertyCity: string;
  setPropertyCity: (v: string) => void;
}

// Property fields: type, area, and city. Market/purchase value is entered via
// the shared amount fields.
export function PropertyFields({
  propertyType,
  setPropertyType,
  propertyAreaSqft,
  setPropertyAreaSqft,
  propertyCity,
  setPropertyCity
}: PropertyFieldsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
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
        <TextInput
          label="Area (sqft)"
          type="number"
          inputMode="decimal"
          placeholder="e.g. 1200"
          value={propertyAreaSqft}
          onChange={setPropertyAreaSqft}
        />
      </div>
      <TextInput label="City" placeholder="e.g. Bangalore" value={propertyCity} onChange={setPropertyCity} />
    </div>
  );
}
