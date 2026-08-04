// Barrel for the M13 financial calculators (pure, on-device logic).

export { calcFire } from './fire';
export type { FireInput, FireResult } from './fire';

export { calcHraExemption } from './hra';
export type { HraInput, HraResult } from './hra';

export { calcSipSwp } from './sipSwp';
export type { SipSwpInput, SipSwpResult, SwpYearRow } from './sipSwp';

export { compareTaxRegimes, TAX_FY_LABEL, NEW_REGIME_STD_DEDUCTION, OLD_REGIME_STD_DEDUCTION } from './taxRegime';
export type { TaxRegimeInput, TaxRegimeResult, RegimeBreakdown } from './taxRegime';

export { calcFd, calcRd } from './fdRd';
export type { CompoundingFreq, FdCalcInput, FdCalcResult, RdCalcInput, RdCalcResult } from './fdRd';

export { calcLumpsumFv, calcCagr } from './lumpsum';
export type { LumpsumFvInput, LumpsumFvResult, CagrInput, CagrResult } from './lumpsum';

export { calcCapitalGains, EQUITY_LTCG_EXEMPTION } from './capitalGains';
export type { CapitalAsset, CapitalGainsInput, CapitalGainsResult } from './capitalGains';

export { calcGratuity, GRATUITY_TAX_FREE_CAP, GRATUITY_MIN_YEARS } from './gratuity';
export type { GratuityInput, GratuityResult } from './gratuity';

export {
  calcSsy,
  SSY_DEPOSIT_YEARS,
  SSY_MATURITY_YEARS,
  SSY_MIN_ANNUAL,
  SSY_MAX_ANNUAL,
  SSY_DEFAULT_RATE_PCT
} from './ssy';
export type { SsyInput, SsyResult, SsyYearRow } from './ssy';

export { calcInflation } from './inflation';
export type { InflationInput, InflationResult } from './inflation';

export { calcRetirementProjection, calcInvestableCorpus } from './retirementProjection';
export type {
  RetirementProjectionInput,
  RetirementProjectionResult,
  RetirementYearPoint
} from './retirementProjection';
