import { TextInput } from '@/components/ui';
import type { RcDetails } from '@/core/vehicle/rcClient';
import { ValidityBadge } from './ValidityBadge';

interface VehicleFieldsProps {
  vehicleRegInput: string;
  setVehicleRegInput: (v: string) => void;
  vehicleFetching: boolean;
  vehicleFetchError: string;
  setVehicleFetchError: (v: string) => void;
  vehicleNotice: string;
  vehicleRcSnapshot: RcDetails | null;
  setVehicleRcSnapshot: (v: RcDetails | null) => void;
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
  lookup
}: VehicleFieldsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-medium text-secondary">Registration number</label>
        <div className="mt-1 flex gap-2">
          <div className="flex-1">
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
          </div>
          <button
            type="button"
            disabled={vehicleFetching || vehicleRegInput.trim().length < 6}
            onClick={lookup}
            className="flex-shrink-0 px-4 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: '#3b82f6' }}
          >
            {vehicleFetching ? '…' : 'Fetch'}
          </button>
        </div>
        {vehicleFetchError && <p className="text-[11px] text-red-500 mt-1">{vehicleFetchError}</p>}
        {vehicleNotice && (
          <p className="text-[11px] mt-1 flex items-start gap-1 text-info">
            <i className="ti ti-clock-hour-4 mt-px" aria-hidden="true" />
            <span>{vehicleNotice}</span>
          </p>
        )}
      </div>

      {/* Fetched RC details preview */}
      {vehicleRcSnapshot && (
        <div className="rounded-xl p-3 flex flex-col gap-2 bg-surface-2 border border-theme">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-primary">
              {vehicleRcSnapshot.make} {vehicleRcSnapshot.model}
              {vehicleRcSnapshot.year ? ` · ${vehicleRcSnapshot.year}` : ''}
            </p>
            <span
              className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: vehicleRcSnapshot.rcStatus === 'ACTIVE' ? '#10b98115' : '#ef444415',
                color: vehicleRcSnapshot.rcStatus === 'ACTIVE' ? '#10b981' : '#ef4444'
              }}
            >
              {vehicleRcSnapshot.rcStatus}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {vehicleRcSnapshot.fuelType && (
              <p className="text-[10px] text-tertiary">
                Fuel: <span className="text-secondary">{vehicleRcSnapshot.fuelType}</span>
              </p>
            )}
            {vehicleRcSnapshot.color && (
              <p className="text-[10px] text-tertiary">
                Colour: <span className="text-secondary">{vehicleRcSnapshot.color}</span>
              </p>
            )}
            {vehicleRcSnapshot.rtoLocation && (
              <p className="text-[10px] text-tertiary col-span-2">
                RTO: <span className="text-secondary">{vehicleRcSnapshot.rtoLocation}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-theme">
            {vehicleRcSnapshot.insuranceUpto && (
              <ValidityBadge label="Insurance" upto={vehicleRcSnapshot.insuranceUpto} />
            )}
            {vehicleRcSnapshot.puccUpto && <ValidityBadge label="PUC" upto={vehicleRcSnapshot.puccUpto} />}
            {vehicleRcSnapshot.rcValidUpto && <ValidityBadge label="RC" upto={vehicleRcSnapshot.rcValidUpto} />}
          </div>
        </div>
      )}
    </div>
  );
}
