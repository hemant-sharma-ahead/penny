import { View, Text } from 'react-native';
import { TextInput } from '~/components/ui';
import { Chip } from '../Chip';

interface VehicleInsuranceFieldsProps {
  vehicleRegNumber: string;
  setVehicleRegNumber: (v: string) => void;
  ncbPct: string;
  setNcbPct: (v: string) => void;
}

const NCB_PRESETS = ['0', '20', '25', '35', '45', '50'];

/**
 * Vehicle insurance-specific fields — **deliberately UNLINKED** from `AssetMeta.vehicleInsurance*`/
 * `vehicleInsurancePolicyNo` on a Real Assets vehicle holding (two independent places by design,
 * already decided in the mockup). "IDV" moved into `PolicyForm.tsx`'s generic top-of-form primary-
 * coverage hero field in the 2026-08-31 dense-grid relayout.
 */
export function VehicleInsuranceFields({
  vehicleRegNumber,
  setVehicleRegNumber,
  ncbPct,
  setNcbPct
}: VehicleInsuranceFieldsProps) {
  return (
    <View className="gap-3">
      <TextInput
        label="Registration number"
        value={vehicleRegNumber}
        onChange={setVehicleRegNumber}
        placeholder="e.g. KA03AB1234"
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <View>
        <Text className="text-xs font-medium text-secondary mb-1">No-Claim Bonus (NCB)</Text>
        <View className="flex-row flex-wrap gap-1.5">
          {NCB_PRESETS.map((p) => (
            <Chip key={p} label={`${p}%`} active={ncbPct === p} onPress={() => setNcbPct(p)} />
          ))}
        </View>
      </View>
    </View>
  );
}
