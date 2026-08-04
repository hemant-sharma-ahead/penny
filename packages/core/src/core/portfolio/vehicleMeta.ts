// Vehicle RC ⇆ AssetMeta mapping pair. `rcDetailsFromMeta` rebuilds an RcDetails
// snapshot from stored metadata (used to seed the edit form); `applyVehicleFields`
// writes a snapshot back into metadata on save. They are mirror images and must
// stay in sync.
import type { AssetMeta, Holding } from '@/core/db/types';
import type { ChallanSummary, RcDetails } from '@/core/vehicle/rcClient';

// Rebuilds a partial RcDetails from persisted vehicle metadata. Fields that are
// not persisted (engine/chassis numbers, addresses, etc.) come back blank.
export function rcDetailsFromMeta(meta: AssetMeta | undefined): RcDetails | null {
  if (!meta?.vehicleRegNumber) return null;
  return {
    regNumber: meta.vehicleRegNumber,
    make: meta.vehicleMake ?? '',
    model: meta.vehicleModel ?? '',
    manufactureMonthYear: '',
    year: meta.vehicleYear ?? null,
    fuelType: meta.vehicleFuelType ?? '',
    color: meta.vehicleColor ?? '',
    vehicleType: meta.vehicleType ?? '',
    bodyType: '',
    rtoLocation: meta.vehicleRtoLocation ?? '',
    rcStatus: meta.vehicleRcStatus ?? '',
    regDate: '',
    engineNo: '',
    chassisNo: '',
    rcValidUpto: meta.vehicleRcValidUpto ?? null,
    fitnessUpto: meta.vehicleFitnessUpto ?? null,
    insuranceCompany: meta.vehicleInsuranceCompany ?? '',
    insurancePolicyNo: '',
    insuranceUpto: meta.vehicleInsuranceUpto ?? null,
    puccNo: '',
    puccUpto: meta.vehiclePuccUpto ?? null,
    salePriceRaw: null,
    fetchedAt: meta.vehicleRcFetchedAt ?? Date.now(),
    ownerName: '',
    presentAddress: '',
    permanentAddress: '',
    financer: '',
    cubicCap: '',
    seatCap: '',
    unladenWeight: '',
    grossWeight: '',
    norms: ''
  };
}

export interface VehicleFieldsInput {
  rcSnapshot: RcDetails | null;
  challanSnapshot: ChallanSummary | null;
  /** True when a challan fetch was attempted this session and failed (RC may still have succeeded —
   *  these are independent). Distinct from `challanSnapshot` being null with this left `false`/
   *  undefined, which means challan was never touched this session at all — existing persisted
   *  challan state (if any), including any prior failure flag, is then left exactly as it was. */
  challanFetchFailed?: boolean;
  vehicleRegInput: string;
  existingMeta?: AssetMeta;
}

// Writes the fetched RC + challan snapshots into vehicle metadata. When no RC
// was fetched, only the (upper-cased) registration number is stored.
export function applyVehicleFields(holding: Holding, input: VehicleFieldsInput): Holding {
  const meta: AssetMeta = { ...(input.existingMeta ?? {}) };
  const rc = input.rcSnapshot;
  if (rc) {
    meta.vehicleRegNumber = rc.regNumber;
    meta.vehicleMake = rc.make;
    meta.vehicleModel = rc.model;
    if (rc.year) meta.vehicleYear = rc.year;
    meta.vehicleFuelType = rc.fuelType;
    meta.vehicleColor = rc.color;
    meta.vehicleType = rc.vehicleType;
    meta.vehicleRtoLocation = rc.rtoLocation;
    meta.vehicleRcStatus = rc.rcStatus;
    if (rc.rcValidUpto) meta.vehicleRcValidUpto = rc.rcValidUpto;
    meta.vehicleInsuranceCompany = rc.insuranceCompany;
    if (rc.insuranceUpto) meta.vehicleInsuranceUpto = rc.insuranceUpto;
    if (rc.puccUpto) meta.vehiclePuccUpto = rc.puccUpto;
    if (rc.fitnessUpto) meta.vehicleFitnessUpto = rc.fitnessUpto;
    meta.vehicleRcFetchedAt = rc.fetchedAt;
    if (rc.engineNo) meta.vehicleEngineNo = rc.engineNo;
    if (rc.chassisNo) meta.vehicleChassisNo = rc.chassisNo;
    if (rc.regDate) meta.vehicleRegDate = rc.regDate;
    if (rc.manufactureMonthYear) meta.vehicleManufactureLabel = rc.manufactureMonthYear;
    if (rc.bodyType) meta.vehicleBodyType = rc.bodyType;
    if (rc.ownerName) meta.vehicleOwnerName = rc.ownerName;
    if (rc.presentAddress) meta.vehiclePresentAddress = rc.presentAddress;
    if (rc.permanentAddress) meta.vehiclePermanentAddress = rc.permanentAddress;
    if (rc.financer) meta.vehicleFinancer = rc.financer;
    if (rc.cubicCap) meta.vehicleCubicCap = rc.cubicCap;
    if (rc.seatCap) meta.vehicleSeatCap = rc.seatCap;
    if (rc.unladenWeight) meta.vehicleUnladenWeight = rc.unladenWeight;
    if (rc.grossWeight) meta.vehicleGrossWeight = rc.grossWeight;
    if (rc.norms) meta.vehicleNorms = rc.norms;
    if (rc.insurancePolicyNo) meta.vehicleInsurancePolicyNo = rc.insurancePolicyNo;
    if (rc.puccNo) meta.vehiclePuccNo = rc.puccNo;
  } else if (input.vehicleRegInput.trim()) {
    meta.vehicleRegNumber = input.vehicleRegInput.trim().toUpperCase();
  }

  const ch = input.challanSnapshot;
  if (ch) {
    meta.vehicleChallanTotal = ch.total;
    meta.vehicleChallanPending = ch.pending;
    meta.vehicleChallanPaid = ch.paid;
    meta.vehicleChallanDisposed = ch.disposed;
    meta.vehicleChallanPendingAmount = ch.pendingAmount;
    meta.vehicleChallanFetchedAt = ch.fetchedAt;
    meta.vehicleChallanFetchFailed = false;
    if (ch.records.length > 0) meta.vehicleChallanRecords = ch.records;
  } else if (input.challanFetchFailed) {
    meta.vehicleChallanFetchFailed = true;
  }
  holding.assetMeta = meta;
  return holding;
}
