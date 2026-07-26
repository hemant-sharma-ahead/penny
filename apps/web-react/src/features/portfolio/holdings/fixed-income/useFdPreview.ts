import { useMemo } from 'react';
import { calcFdMaturity, calcRdMaturity } from '@/core/fd/fdCalculations';
import type { CompoundingFreq, FdResult, RdResult } from '@/core/fd/fdCalculations';

export interface FdPreviewParams {
  enabled: boolean;
  investedAmount: string;
  interestRate: string;
  fdStartDate: string;
  maturityDate: string;
  fdSubType: 'fd' | 'rd';
  fdCompoundingFreq: CompoundingFreq;
  rdTenureMonths: string;
}

// Live FD/RD maturity projection, recomputed whenever the form inputs change.
// Returns null until enough valid inputs are present.
export function useFdPreview(params: FdPreviewParams): FdResult | RdResult | null {
  const {
    enabled,
    investedAmount,
    interestRate,
    fdStartDate,
    maturityDate,
    fdSubType,
    fdCompoundingFreq,
    rdTenureMonths
  } = params;
  return useMemo(() => {
    if (!enabled) return null;
    const principal = parseFloat(investedAmount) || 0;
    const rate = parseFloat(interestRate) || 0;
    if (principal <= 0 || rate <= 0 || !fdStartDate) return null;

    if (fdSubType === 'fd') {
      if (!maturityDate) return null;
      const startMs = new Date(fdStartDate).getTime();
      const matMs = new Date(maturityDate).getTime();
      if (isNaN(startMs) || isNaN(matMs) || matMs <= startMs) return null;
      return calcFdMaturity(principal, rate, startMs, matMs, fdCompoundingFreq);
    } else {
      const tenure = parseInt(rdTenureMonths, 10);
      if (isNaN(tenure) || tenure <= 0) return null;
      const startMs = new Date(fdStartDate).getTime();
      if (isNaN(startMs)) return null;
      return calcRdMaturity(principal, rate, tenure, startMs);
    }
  }, [enabled, investedAmount, interestRate, fdStartDate, maturityDate, fdSubType, fdCompoundingFreq, rdTenureMonths]);
}
