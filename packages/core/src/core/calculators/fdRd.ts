// FD & RD maturity calculator — pure, on-device.
//
// Thin, tenure-based wrappers over the shared FD/RD compounding engine in
// `src/core/fd/fdCalculations.ts` so the calculator and the portfolio tracker stay
// on a single source of truth for the maths.

import { calcFdMaturity, calcRdMaturity, MS_PER_YEAR, type CompoundingFreq } from '@/core/fd/fdCalculations';

export type { CompoundingFreq };

export interface FdCalcInput {
  principal: number;
  ratePct: number; // annual interest rate
  years: number; // tenure in years (decimals allowed)
  freq: CompoundingFreq;
}

export interface FdCalcResult {
  principal: number;
  maturityAmount: number;
  totalInterest: number;
}

export function calcFd(input: FdCalcInput): FdCalcResult | null {
  const { principal, ratePct, years, freq } = input;
  if (principal <= 0 || ratePct < 0 || years <= 0) return null;

  const start = 0;
  const maturity = years * MS_PER_YEAR;
  const r = calcFdMaturity(principal, ratePct, start, maturity, freq, start);

  return { principal, maturityAmount: r.maturityAmount, totalInterest: r.totalInterest };
}

export interface RdCalcInput {
  monthlyInstallment: number;
  ratePct: number; // annual interest rate
  months: number; // tenure in months
}

export interface RdCalcResult {
  totalDeposited: number;
  maturityAmount: number;
  totalInterest: number;
}

export function calcRd(input: RdCalcInput): RdCalcResult | null {
  const { monthlyInstallment, ratePct, months } = input;
  if (monthlyInstallment <= 0 || ratePct < 0 || months <= 0) return null;

  const r = calcRdMaturity(monthlyInstallment, ratePct, Math.round(months), 0, 0);

  return {
    totalDeposited: monthlyInstallment * Math.round(months),
    maturityAmount: r.maturityAmount,
    totalInterest: r.totalInterest
  };
}
