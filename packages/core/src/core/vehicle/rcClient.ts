// vahandetails.com — public API (key is hardcoded in their own frontend bundle).
// When VITE_API_PROXY is set, lookups go through the Penny API Proxy Worker (CORS + permanent cache
// + a morning queue for the rate-limited upstream); otherwise the client POSTs directly, as before.
import { VEHICLE_PROXY } from '@/core/net/apiBase';

const BASE = 'https://backend.vahandetails.com/api';
const HEADERS = { 'Content-Type': 'application/json', 'x-api-key': 'Test_1234' };

/** Raised when the proxy has queued a vehicle lookup for the next morning's Cron drain. */
export class VehicleQueuedError extends Error {
  readonly etaMorningIST: string | undefined;
  constructor(message: string, etaMorningIST?: string) {
    super(message);
    this.name = 'VehicleQueuedError';
    this.etaMorningIST = etaMorningIST;
  }
}

/** Raw vahandetails RC payload (subset we read). All fields are optional strings. */
type RawRcData = Record<string, string | undefined>;
interface RawRcResponse {
  status?: unknown;
  data?: RawRcData;
  message?: string;
}
interface RawChallanResponse {
  data?: unknown;
  challans?: unknown;
  summary?: Record<string, number | undefined>;
}

export interface RcDetails {
  regNumber: string;
  make: string;
  model: string;
  manufactureMonthYear: string; // e.g. "June 2017"
  year: number | null;
  fuelType: string;
  color: string;
  vehicleType: string; // "Two Wheeler" / "Four Wheeler"
  bodyType: string; // "MOTORCYCLE" / "MOTOR CAR"
  rtoLocation: string;
  rcStatus: string;
  regDate: string; // registration date string
  engineNo: string;
  chassisNo: string;
  rcValidUpto: number | null;
  fitnessUpto: number | null;
  insuranceCompany: string;
  insurancePolicyNo: string;
  insuranceUpto: number | null;
  puccNo: string;
  puccUpto: number | null;
  salePriceRaw: number | null; // ex-showroom from Vahan records
  fetchedAt: number;
  // Owner
  ownerName: string;
  presentAddress: string;
  permanentAddress: string;
  financer: string;
  // Specs
  cubicCap: string; // engine CC
  seatCap: string;
  unladenWeight: string; // actual bike/car weight (kg)
  grossWeight: string; // GVW including load (kg)
  norms: string; // emission norms e.g. "BHARAT STAGE VI"
}

export interface ChallanRecord {
  challanNo: string;
  date: string; // ISO string from API
  amount: number;
  paymentStatus: string; // "UNPAID" | "DISPOSED" | "PAID"
  challanStatus: string; // "Virtual Court" | "Already Paid" etc.
  offenceDetails: string;
  challanPlace: string;
  courtName: string;
  courtAddress: string;
  challanType: string; // "OFFLINE" | "ONLINE"
  rto: string;
  state: string;
}

export interface ChallanSummary {
  total: number;
  pending: number;
  paid: number;
  disposed: number;
  pendingAmount: number;
  records: ChallanRecord[];
  fetchedAt: number;
}

function parseDate(val: string | null | undefined): number | null {
  if (!val) return null;
  const ms = new Date(val).getTime();
  return isNaN(ms) ? null : ms;
}

function parseYear(manuMonthYr: string | null | undefined): number | null {
  if (!manuMonthYr) return null;
  const parts = manuMonthYr.split('/');
  const yr = parseInt(parts[parts.length - 1] ?? '', 10);
  return isNaN(yr) ? null : yr;
}

function parseManuLabel(manuMonthYr: string | null | undefined): string {
  if (!manuMonthYr) return '';
  const parts = manuMonthYr.split('/');
  if (parts.length < 2) return manuMonthYr;
  const monthNum = parseInt(parts[0] ?? '', 10);
  const year = parts[parts.length - 1] ?? '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabel = months[monthNum - 1] ?? '';
  return monthLabel ? `${monthLabel} ${year}` : year;
}

function parseRc(json: RawRcResponse, regNumber: string): RcDetails {
  if (!json.status || !json.data) throw new Error(json.message ?? 'Vehicle not found');

  const d = json.data;
  return {
    regNumber: d.rcRegnNo ?? regNumber.toUpperCase(),
    make: d.rcMakerDesc ?? '',
    model: d.rcMakerModel ?? '',
    manufactureMonthYear: parseManuLabel(d.rcManuMonthYr),
    year: parseYear(d.rcManuMonthYr),
    fuelType: d.rcFuelDesc ?? '',
    color: d.rcColor ?? '',
    vehicleType: d.vehicle_type ?? d.rcVehicleClass ?? '',
    bodyType: d.rcBodyType ?? '',
    rtoLocation: d.rcRegisteredAt ?? '',
    rcStatus: d.rcStatus ?? '',
    regDate: d.rcRegDate ?? d.rcRegnDate ?? d.rcRegnDt ?? '',
    engineNo: d.rcEngineNo ?? d.rcEngNo ?? '',
    chassisNo: d.rcChassisNo ?? d.rcChassisNumber ?? '',
    rcValidUpto: parseDate(d.rcRegnUpto),
    fitnessUpto: parseDate(d.rcFitUpto),
    insuranceCompany: d.rcInsuranceComp ?? '',
    insurancePolicyNo: d.rcInsurancePolicyNo ?? d.rcInsPolicy ?? '',
    insuranceUpto: parseDate(d.rcInsuranceUpto),
    puccNo: d.rcPucNo ?? d.rcPuccNo ?? '',
    puccUpto: parseDate(d.rcPuccUpto),
    salePriceRaw: d.rcSaleAmt ? parseFloat(d.rcSaleAmt) || null : null,
    fetchedAt: Date.now(),
    ownerName: d.rcOwnerName ?? '',
    presentAddress: d.rcPresentAddress ?? d.rcAddress ?? '',
    permanentAddress: d.rcPermAddress ?? d.rcPermanentAddress ?? '',
    financer: d.rcFinancer ?? '',
    cubicCap: d.rcCubicCap ?? '',
    seatCap: d.rcSeatCap ?? '',
    unladenWeight: d.rcUlw ?? d.rcUnladenWeight ?? d.rcUnladWeight ?? '',
    grossWeight: d.rcGvw ?? d.rcGrossWeight ?? '',
    norms: d.rcNormsDesc ?? d.rcNorms ?? ''
  };
}

function parseChallans(json: RawChallanResponse): ChallanSummary {
  // Parse individual challan records from data array
  const rawRecords: unknown[] = Array.isArray(json.data)
    ? json.data
    : Array.isArray(json.challans)
      ? json.challans
      : [];
  const records: ChallanRecord[] = rawRecords.map((r: unknown) => {
    const c = r as Record<string, unknown>;
    return {
      challanNo: String(c.challanNumber ?? c.challan_number ?? c.challanNo ?? ''),
      date: String(c.challanDate ?? c.challan_date ?? c.date ?? ''),
      amount: parseFloat(String(c.amount ?? 0)) || 0,
      paymentStatus: String(c.paymentStatus ?? c.payment_status ?? '').toUpperCase(),
      challanStatus: String(c.challanStatus ?? c.challan_status ?? ''),
      offenceDetails: String(c.offenseDetails ?? c.offense_details ?? c.offenceName ?? ''),
      challanPlace: String(c.challanPlace ?? c.challan_place ?? ''),
      courtName: String(c.courtName ?? c.court_name ?? ''),
      courtAddress: String(c.courtAddress ?? c.court_address ?? ''),
      challanType: String(c.challanType ?? c.challan_type ?? ''),
      rto: String(c.rto ?? ''),
      state: String(c.state ?? '')
    };
  });

  const s = json.summary ?? {};
  return {
    total: s.totalChallans ?? records.length,
    pending: s.pendingCount ?? records.filter((r) => r.paymentStatus === 'UNPAID').length,
    paid: s.paidCount ?? records.filter((r) => r.paymentStatus === 'PAID').length,
    disposed: s.disposedCount ?? records.filter((r) => r.paymentStatus === 'DISPOSED').length,
    pendingAmount: s.pendingAmount ?? 0,
    records,
    fetchedAt: Date.now()
  };
}

const normReg = (reg: string) => reg.toUpperCase().replace(/\s+/g, '');
const emptyChallans = (): ChallanSummary => ({
  total: 0,
  pending: 0,
  paid: 0,
  disposed: 0,
  pendingAmount: 0,
  records: [],
  fetchedAt: Date.now()
});

export async function fetchRcDetails(regNumber: string): Promise<RcDetails> {
  const res = await fetch(`${BASE}/get-rc-details`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ rc_number: normReg(regNumber) })
  });
  if (!res.ok) throw new Error(`RC fetch failed: ${res.status}`);
  return parseRc((await res.json()) as RawRcResponse, regNumber);
}

export async function fetchChallans(regNumber: string): Promise<ChallanSummary> {
  const res = await fetch(`${BASE}/get-challans-details`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ rc_number: normReg(regNumber) })
  });
  if (!res.ok) throw new Error(`Challan fetch failed: ${res.status}`);
  return parseChallans((await res.json()) as RawChallanResponse);
}

/**
 * Fetch RC + challans for a registration number. Through the API proxy when configured (which may
 * return a `queued` status → {@link VehicleQueuedError}); otherwise two direct POSTs as before.
 */
export async function fetchVehicleData(regNumber: string): Promise<{ rc: RcDetails; challans: ChallanSummary }> {
  if (VEHICLE_PROXY) {
    const res = await fetch(`${VEHICLE_PROXY}/${encodeURIComponent(normReg(regNumber))}`);
    if (!res.ok) throw new Error(`Vehicle fetch failed: ${res.status}`);
    const body = (await res.json()) as {
      queued?: boolean;
      message?: string;
      etaMorningIST?: string;
      data?: { rc?: RawRcResponse; challans?: RawChallanResponse };
    };
    if (body.queued && !body.data) {
      throw new VehicleQueuedError(
        body.message ?? 'Queued — details will arrive tomorrow morning.',
        body.etaMorningIST
      );
    }
    if (!body.data?.rc) throw new Error('Vehicle not found');
    return {
      rc: parseRc(body.data.rc, regNumber),
      challans: body.data.challans ? parseChallans(body.data.challans) : emptyChallans()
    };
  }
  const [rc, challans] = await Promise.all([fetchRcDetails(regNumber), fetchChallans(regNumber)]);
  return { rc, challans };
}
