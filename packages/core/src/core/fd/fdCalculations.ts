export type CompoundingFreq = 'monthly' | 'quarterly' | 'half-yearly' | 'yearly' | 'at_maturity';

export interface FdResult {
  maturityAmount: number;
  totalInterest: number;
  accruedAmount: number; // current fair value (principal + interest so far)
  accruedInterest: number; // interest earned to date
  daysRemaining: number;
  pctElapsed: number; // 0–100 for progress bar
  isMatured: boolean;
}

export interface RdResult {
  maturityAmount: number;
  totalInterest: number; // maturity - total committed (installment × tenure)
  totalDeposited: number; // installment × months completed so far
  monthsCompleted: number;
  monthsRemaining: number;
  pctElapsed: number; // 0–100 for progress bar
  isMatured: boolean;
}

function freqPerYear(freq: CompoundingFreq): number {
  switch (freq) {
    case 'monthly':
      return 12;
    case 'quarterly':
      return 4;
    case 'half-yearly':
      return 2;
    case 'yearly':
      return 1;
    case 'at_maturity':
      return 0;
  }
}

// Banking convention: a "year" for interest-rate purposes is a flat 365 days, not the
// average Julian/Gregorian year (365.25). Using 365.25 here under-counts the compounding
// exponent for any exact date-span tenure — the error grows with how many leap days the
// tenure spans — and produces a maturity amount that doesn't match real bank FD calculators.
// Exported so `calculators/fdRd.ts` (tenure-in-years, no real dates) stays on the exact same
// constant rather than risking a second, drifting copy.
export const MS_PER_YEAR = 365 * 24 * 3600 * 1000;
const MS_PER_MONTH = 30.4375 * 24 * 3600 * 1000;

export function calcFdMaturity(
  principal: number,
  ratePercent: number,
  startMs: number,
  maturityMs: number,
  freq: CompoundingFreq,
  nowMs = Date.now()
): FdResult {
  const r = ratePercent / 100;
  const totalMs = maturityMs - startMs;
  const totalYears = totalMs / MS_PER_YEAR;
  const elapsedYears = Math.max(0, Math.min(totalYears, (nowMs - startMs) / MS_PER_YEAR));

  let maturityAmount: number;
  let accruedAmount: number;

  if (freq === 'at_maturity') {
    maturityAmount = principal * (1 + r * totalYears);
    accruedAmount = principal * (1 + r * elapsedYears);
  } else {
    const n = freqPerYear(freq);
    maturityAmount = principal * Math.pow(1 + r / n, n * totalYears);
    accruedAmount = principal * Math.pow(1 + r / n, n * elapsedYears);
  }

  const daysRemaining = Math.max(0, Math.round((maturityMs - nowMs) / (24 * 3600 * 1000)));
  const pctElapsed = totalMs > 0 ? Math.min(100, Math.max(0, ((nowMs - startMs) / totalMs) * 100)) : 0;

  return {
    maturityAmount: Math.round(maturityAmount),
    totalInterest: Math.round(maturityAmount - principal),
    accruedAmount: Math.round(accruedAmount),
    accruedInterest: Math.round(accruedAmount - principal),
    daysRemaining,
    pctElapsed,
    isMatured: nowMs >= maturityMs
  };
}

// RD uses quarterly compounding (standard Indian bank practice).
// Each monthly installment k (0-indexed) compounds for (tenure - k) months
// = (tenure - k)/3 quarters at maturity.
export function calcRdMaturity(
  monthlyInstallment: number,
  ratePercent: number,
  tenureMonths: number,
  startMs: number,
  nowMs = Date.now()
): RdResult {
  const rQ = ratePercent / 100 / 4;

  let maturityAmount = 0;
  for (let k = 0; k < tenureMonths; k++) {
    maturityAmount += monthlyInstallment * Math.pow(1 + rQ, (tenureMonths - k) / 3);
  }

  const monthsCompleted = Math.max(0, Math.min(tenureMonths, Math.floor((nowMs - startMs) / MS_PER_MONTH)));
  const maturityMs = startMs + tenureMonths * MS_PER_MONTH;

  return {
    maturityAmount: Math.round(maturityAmount),
    totalInterest: Math.round(maturityAmount - monthlyInstallment * tenureMonths),
    totalDeposited: monthlyInstallment * monthsCompleted,
    monthsCompleted,
    monthsRemaining: Math.max(0, tenureMonths - monthsCompleted),
    pctElapsed: tenureMonths > 0 ? Math.min(100, (monthsCompleted / tenureMonths) * 100) : 0,
    isMatured: nowMs >= maturityMs
  };
}
