// Stub — full implementation lives in M11 (teammate's branch, not yet merged)

export type NpsPfmKey = string;
export type NpsSchemeType = 'E' | 'C' | 'G' | 'A';
export type NpsLifecycleFund = 'LC75' | 'LC50' | 'LC25' | 'BLC';
export type NpsChoiceType = 'auto' | 'active';

export interface NpsNavDetail {
  schemeCode: string;
  schemeName: string;
  nav: number;
  date: string;
}

export interface NpsFundManager {
  key: NpsPfmKey;
  label: string;
}

export const NPS_FUND_MANAGERS: NpsFundManager[] = [];

export const LIFECYCLE_FUNDS: Record<
  NpsLifecycleFund,
  { key: NpsLifecycleFund; label: string; shortLabel: string; equityAtAge: Record<number, number> }
> = {
  LC75: { key: 'LC75', label: 'Aggressive (LC-75)', shortLabel: 'LC-75', equityAtAge: {} },
  LC50: { key: 'LC50', label: 'Moderate (LC-50)', shortLabel: 'LC-50', equityAtAge: {} },
  LC25: { key: 'LC25', label: 'Conservative (LC-25)', shortLabel: 'LC-25', equityAtAge: {} },
  BLC: { key: 'BLC', label: 'Balanced (BLC)', shortLabel: 'BLC', equityAtAge: {} }
};

// Empty lookup tables — the real M11 NPS module populates these from npsnav.in.
const STUB_SCHEME_CODES: Record<string, string> = {};
const STUB_NAVS: Record<string, NpsNavDetail> = {};

export function getAllocationAtAge(
  fund: NpsLifecycleFund,
  age: number
): { equity: number; corporate: number; govt: number } {
  const equity = LIFECYCLE_FUNDS[fund]?.equityAtAge[age] ?? 0;
  return { equity, corporate: 0, govt: Math.max(0, 100 - equity) };
}

export async function findNpsSchemeCode(pfm: NpsPfmKey, scheme: NpsSchemeType, tier: string): Promise<string | null> {
  return STUB_SCHEME_CODES[`${pfm}-${scheme}-${tier}`] ?? null;
}

export async function fetchNpsNav(schemeCode: string): Promise<NpsNavDetail | null> {
  return STUB_NAVS[schemeCode] ?? null;
}

export function getPfmLabel(pfm: NpsPfmKey): string {
  return NPS_FUND_MANAGERS.find((m) => m.key === pfm)?.label ?? pfm;
}
