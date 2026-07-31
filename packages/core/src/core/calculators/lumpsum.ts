// Lumpsum investment calculator — pure, on-device.
//
// Two modes:
//   • Future value — grow a one-time investment at an expected annual return.
//   • CAGR — given a start value, end value and tenure, find the annualised return.

export interface LumpsumFvInput {
  principal: number;
  ratePct: number; // expected annual return
  years: number;
}

export interface LumpsumFvResult {
  futureValue: number;
  totalGains: number;
}

export function calcLumpsumFv(input: LumpsumFvInput): LumpsumFvResult | null {
  const { principal, ratePct, years } = input;
  if (principal <= 0 || ratePct < 0 || years <= 0) return null;

  const futureValue = principal * Math.pow(1 + ratePct / 100, years);
  return { futureValue, totalGains: futureValue - principal };
}

export interface CagrInput {
  initialValue: number;
  finalValue: number;
  years: number;
}

export interface CagrResult {
  cagrPct: number; // compound annual growth rate
  absoluteReturnPct: number; // total return over the whole period
  totalGains: number;
}

export function calcCagr(input: CagrInput): CagrResult | null {
  const { initialValue, finalValue, years } = input;
  if (initialValue <= 0 || finalValue < 0 || years <= 0) return null;

  const cagrPct = (Math.pow(finalValue / initialValue, 1 / years) - 1) * 100;
  const absoluteReturnPct = ((finalValue - initialValue) / initialValue) * 100;
  return { cagrPct, absoluteReturnPct, totalGains: finalValue - initialValue };
}
