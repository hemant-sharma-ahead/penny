import { View, Pressable, Text } from 'react-native';
import { TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { RcDetails } from '@/core/vehicle/rcClient';
import { ValidityBadge } from './ValidityBadge';
import { tint } from '~/lib/color';

interface VehicleFieldsProps {
  vehicleRegInput: string;
  setVehicleRegInput: (v: string) => void;
  vehicleFetching: boolean;
  vehicleFetchError: string;
  setVehicleFetchError: (v: string) => void;
  vehicleNotice: string;
  vehicleRcSnapshot: RcDetails | null;
  setVehicleRcSnapshot: (v: RcDetails | null) => void;
  /** True when this session's fetch got RC data but the challan half specifically failed — shown as
   *  its own note inside the RC preview card, never blocking anything (see VehicleModal's `canSave`,
   *  which only requires RC). */
  vehicleChallanError: boolean;
  lookup: () => void;
}

// Vehicle fields: registration-number lookup (RC + challan fetch) with a
// fetched-details preview and validity badges for insurance / PUC / RC.
export function VehicleFields({
  vehicleRegInput,
  setVehicleRegInput,
  vehicleFetching,
  vehicleFetchError,
  setVehicleFetchError,
  vehicleNotice,
  vehicleRcSnapshot,
  setVehicleRcSnapshot,
  vehicleChallanError,
  lookup
}: VehicleFieldsProps) {
  const theme = useThemeColors();
  return (
    <View className="flex-col gap-3">
      <View>
        <Text className="text-xs font-medium text-secondary">Registration number</Text>
        <View className="mt-1 flex-row gap-2">
          <View className="flex-1">
            <TextInput
              placeholder="e.g. MH12AB1234"
              value={vehicleRegInput}
              onChange={(v) => {
                setVehicleRegInput(v.toUpperCase());
                setVehicleFetchError('');
                if (vehicleRcSnapshot) setVehicleRcSnapshot(null);
              }}
              inputClassName="font-mono uppercase"
            />
          </View>
          <Pressable
            disabled={vehicleFetching || vehicleRegInput.trim().length < 6}
            onPress={lookup}
            className="shrink-0 px-4 py-3 rounded-xl justify-center disabled:opacity-40"
            style={{
              backgroundColor: theme.info,
              opacity: vehicleFetching || vehicleRegInput.trim().length < 6 ? 0.4 : 1
            }}
          >
            <Text className="text-sm font-semibold text-white">{vehicleFetching ? '…' : 'Fetch'}</Text>
          </Pressable>
        </View>
        {vehicleFetchError && (
          <Text className="text-[11px] mt-1" style={{ color: theme.danger }}>
            {vehicleFetchError}
          </Text>
        )}
        {vehicleNotice && (
          <View className="flex-row items-start gap-1 mt-1">
            <Icon name="ti-clock-hour-4" size={12} color={theme.info} />
            <Text className="text-[11px] flex-1" style={{ color: theme.info }}>
              {vehicleNotice}
            </Text>
          </View>
        )}
      </View>

      {/* Fetched RC details preview */}
      {vehicleRcSnapshot && (
        <View className="rounded-xl p-3 flex-col gap-2 bg-surface-2 border border-theme">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-semibold text-primary">
              {vehicleRcSnapshot.make} {vehicleRcSnapshot.model}
              {vehicleRcSnapshot.year ? ` · ${vehicleRcSnapshot.year}` : ''}
            </Text>
            <View
              className="px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor:
                  vehicleRcSnapshot.rcStatus === 'ACTIVE' ? tint(theme.success, 8) : tint(theme.danger, 8)
              }}
            >
              <Text
                className="text-[9px] font-bold uppercase"
                style={{ color: vehicleRcSnapshot.rcStatus === 'ACTIVE' ? theme.success : theme.danger }}
              >
                {vehicleRcSnapshot.rcStatus}
              </Text>
            </View>
          </View>
          <View className="flex-row flex-wrap gap-x-3 gap-y-1">
            {vehicleRcSnapshot.fuelType && (
              <Text className="text-[10px] text-tertiary">
                Fuel: <Text className="text-secondary">{vehicleRcSnapshot.fuelType}</Text>
              </Text>
            )}
            {vehicleRcSnapshot.color && (
              <Text className="text-[10px] text-tertiary">
                Colour: <Text className="text-secondary">{vehicleRcSnapshot.color}</Text>
              </Text>
            )}
            {vehicleRcSnapshot.rtoLocation && (
              <Text className="text-[10px] text-tertiary w-full">
                RTO: <Text className="text-secondary">{vehicleRcSnapshot.rtoLocation}</Text>
              </Text>
            )}
          </View>
          <View className="flex-row flex-wrap gap-1.5 pt-1 border-t border-theme">
            {vehicleRcSnapshot.insuranceUpto && (
              <ValidityBadge label="Insurance" upto={vehicleRcSnapshot.insuranceUpto} />
            )}
            {vehicleRcSnapshot.puccUpto && <ValidityBadge label="PUC" upto={vehicleRcSnapshot.puccUpto} />}
            {vehicleRcSnapshot.rcValidUpto && <ValidityBadge label="RC" upto={vehicleRcSnapshot.rcValidUpto} />}
          </View>
          {vehicleChallanError && (
            <View className="flex-row items-center gap-1 pt-1 border-t border-theme">
              <Icon name="ti-alert-triangle" size={11} color={theme.warning} />
              <Text className="text-[10px]" style={{ color: theme.warning }}>
                Could not fetch challan status — vehicle details above are still fine to save.
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
