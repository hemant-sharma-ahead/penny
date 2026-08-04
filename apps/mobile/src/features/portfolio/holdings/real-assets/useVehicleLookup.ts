import { useState } from 'react';
import type { Holding } from '@/core/db/types';
import { fetchVehicleData, VehicleQueuedError } from '@/core/vehicle/rcClient';
import type { ChallanSummary, RcDetails } from '@/core/vehicle/rcClient';
import { rcDetailsFromMeta } from '@/core/portfolio/vehicleMeta';

interface VehicleAutofill {
  setName: (v: string) => void;
  investedAmount: string;
  setInvestedAmount: (v: string) => void;
  currentValue: string;
  setCurrentValue: (v: string) => void;
}

// Owns the vehicle RC-lookup flow: registration input, fetch state/error, and
// the fetched RC + challan snapshots (seeded from the holding being edited).
// `lookup` calls the RC API and auto-fills name, invested amount and an
// IRDA-IDV-depreciated current value when those fields are still empty.
export function useVehicleLookup(editing: Holding | null, autofill: VehicleAutofill) {
  const [vehicleRegInput, setVehicleRegInput] = useState(editing?.assetMeta?.vehicleRegNumber ?? '');
  const [vehicleFetching, setVehicleFetching] = useState(false);
  const [vehicleFetchError, setVehicleFetchError] = useState('');
  // A non-error notice — e.g. the proxy queued the lookup for tomorrow morning.
  const [vehicleNotice, setVehicleNotice] = useState('');
  // True for the rest of this session once a lookup gets queued — lets the Add Holding gate allow
  // saving a reg-number-only placeholder (see VehicleModal's canSave) even though RC never arrived.
  const [vehicleQueued, setVehicleQueued] = useState(false);
  // True when the last successful lookup's *challan* half specifically failed (RC still succeeded —
  // see fetchVehicleData's `challans: null` contract). Session-only; VehicleModal threads this into
  // applyVehicleFields as `challanFetchFailed` so it's only persisted when a challan fetch was
  // actually attempted, never confused with "challan untouched this session".
  const [vehicleChallanError, setVehicleChallanError] = useState(false);
  const [vehicleChallanSnapshot, setVehicleChallanSnapshot] = useState<ChallanSummary | null>(null);
  const [vehicleRcSnapshot, setVehicleRcSnapshot] = useState<RcDetails | null>(() =>
    rcDetailsFromMeta(editing?.assetMeta)
  );

  async function lookup() {
    setVehicleFetching(true);
    setVehicleFetchError('');
    setVehicleNotice('');
    setVehicleChallanError(false);
    setVehicleQueued(false);
    try {
      const { rc, challans } = await fetchVehicleData(vehicleRegInput.trim());
      setVehicleRcSnapshot(rc);
      setVehicleChallanSnapshot(challans);
      setVehicleChallanError(challans === null);
      setVehicleRegInput(rc.regNumber);
      const autoName = [rc.make, rc.model, rc.year ? String(rc.year) : ''].filter(Boolean).join(' ');
      if (autoName) autofill.setName(autoName);
      // salePriceRaw = ex-showroom purchase price
      if (rc.salePriceRaw && rc.salePriceRaw > 0) {
        if (!autofill.investedAmount) autofill.setInvestedAmount(String(rc.salePriceRaw));
        // Estimate depreciated current value (IRDA IDV method)
        if (!autofill.currentValue && rc.year) {
          const yearsOld = new Date().getFullYear() - rc.year;
          const deprRates = [0.05, 0.15, 0.3, 0.4, 0.5];
          const rate = yearsOld <= 0 ? 0 : (deprRates[Math.min(yearsOld - 1, 4)] ?? 0.5);
          const estimated = Math.round(rc.salePriceRaw * (1 - rate));
          autofill.setCurrentValue(String(estimated));
        }
      }
    } catch (e) {
      if (e instanceof VehicleQueuedError) {
        setVehicleNotice(e.message);
        setVehicleQueued(true);
      } else {
        setVehicleFetchError(e instanceof Error ? e.message : 'Could not fetch vehicle details');
      }
    } finally {
      setVehicleFetching(false);
    }
  }

  return {
    vehicleRegInput,
    setVehicleRegInput,
    vehicleFetching,
    vehicleFetchError,
    setVehicleFetchError,
    vehicleNotice,
    vehicleQueued,
    vehicleRcSnapshot,
    setVehicleRcSnapshot,
    vehicleChallanSnapshot,
    vehicleChallanError,
    lookup
  };
}
