// Old vs New tax regime comparison — pure, on-device. FY-parameterised: the slab tables, rebate
// limits, standard deductions, cess and surcharge for each financial year live in
// `core/tax/regimeHistory.ts`; this module applies them. Defaults to the latest modelled FY.
//
// This is an estimate for planning. It does not model every edge case (marginal relief on
// surcharge/rebate, special-rate incomes, etc.).

import {
  fyConfigFor,
  LATEST_FY_START,
  type FYTaxConfig,
  type RegimeConfig,
  type RegimeSlab
} from '@/core/tax/regimeHistory';

/** Default config — the latest financial year we model. */
export const CURRENT_FY_CONFIG: FYTaxConfig = fyConfigFor(LATEST_FY_START);

export const TAX_FY_LABEL = CURRENT_FY_CONFIG.label;
export const NEW_REGIME_STD_DEDUCTION = CURRENT_FY_CONFIG.new?.stdDeduction ?? 75_000;
export const OLD_REGIME_STD_DEDUCTION = CURRENT_FY_CONFIG.old.stdDeduction;

// Chapter VI-A statutory caps (stable across the modelled window).
const CAP_80C = 1_50_000;
const CAP_24B = 2_00_000;
const CAP_NPS_80CCD_1B = 50_000;

/** Progressive slab tax on a taxable income. */
function slabTax(taxable: number, slabs: RegimeSlab[]): number {
  if (taxable <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const slab of slabs) {
    const upper = slab.upTo ?? Infinity;
    if (taxable > lower) {
      const slice = Math.min(taxable, upper) - lower;
      tax += slice * slab.rate;
    }
    lower = upper;
    if (taxable <= upper) break;
  }
  return tax;
}

/** Surcharge on income, with the new regime capped at the FY's cap rate. */
function surchargeAmount(tax: number, totalIncome: number, fy: FYTaxConfig, isNewRegime: boolean): number {
  let rate = 0;
  for (const band of fy.surcharge) {
    if (totalIncome > band.aboveIncome) rate = band.rate;
  }
  if (isNewRegime) rate = Math.min(rate, fy.newRegimeSurchargeCap);
  return tax * rate;
}

export interface RegimeBreakdown {
  grossIncome: number;
  standardDeduction: number;
  otherDeductions: number; // 0 for new regime
  taxableIncome: number;
  taxBeforeRebate: number;
  rebate: number;
  surcharge: number;
  cess: number;
  totalTax: number;
}

export interface TaxRegimeInput {
  grossIncome: number; // annual gross salary income
  isSalaried: boolean; // governs the standard deduction
  // Old-regime deductions (ignored by the new regime):
  deduction80C: number; // max ₹1.5L
  deduction80D: number; // health insurance
  homeLoanInterest: number; // §24B, max ₹2L (self-occupied)
  nps80ccd1b: number; // additional NPS, max ₹50K
  hraExemption: number; // exempt HRA
  otherDeductions: number; // any remaining Chapter VI-A
}

export interface TaxRegimeResult {
  old: RegimeBreakdown;
  /** Null for FYs before the new regime existed (pre FY2020-21). */
  new: RegimeBreakdown | null;
  recommended: 'old' | 'new';
  savings: number; // tax saved by choosing the recommended regime
  fyLabel: string;
}

function computeRegime(
  grossIncome: number,
  config: RegimeConfig,
  fy: FYTaxConfig,
  isSalaried: boolean,
  otherDeductions: number,
  isNewRegime: boolean
): RegimeBreakdown {
  const standardDeduction = isSalaried ? config.stdDeduction : 0;
  const taxableIncome = Math.max(0, grossIncome - standardDeduction - otherDeductions);
  const taxBeforeRebate = slabTax(taxableIncome, config.slabs);
  const rebate = taxableIncome <= config.rebateLimit ? taxBeforeRebate : 0;
  const taxAfterRebate = taxBeforeRebate - rebate;
  const surcharge = surchargeAmount(taxAfterRebate, taxableIncome, fy, isNewRegime);
  const cess = (taxAfterRebate + surcharge) * fy.cessRate;

  return {
    grossIncome,
    standardDeduction,
    otherDeductions,
    taxableIncome,
    taxBeforeRebate,
    rebate,
    surcharge,
    cess,
    totalTax: taxAfterRebate + surcharge + cess
  };
}

export function compareTaxRegimes(input: TaxRegimeInput, fy: FYTaxConfig = CURRENT_FY_CONFIG): TaxRegimeResult | null {
  const { grossIncome, isSalaried } = input;
  if (grossIncome < 0) return null;

  // Old regime totals the Chapter VI-A deductions (with their statutory caps).
  const cappedOtherDeductions =
    Math.min(input.deduction80C, CAP_80C) +
    Math.max(0, input.deduction80D) +
    Math.min(input.homeLoanInterest, CAP_24B) +
    Math.min(input.nps80ccd1b, CAP_NPS_80CCD_1B) +
    Math.max(0, input.hraExemption) +
    Math.max(0, input.otherDeductions);

  const old = computeRegime(grossIncome, fy.old, fy, isSalaried, cappedOtherDeductions, false);
  const newBreakdown = fy.new ? computeRegime(grossIncome, fy.new, fy, isSalaried, 0, true) : null;

  const recommended: 'old' | 'new' = newBreakdown && newBreakdown.totalTax < old.totalTax ? 'new' : 'old';
  const savings = newBreakdown ? Math.abs(old.totalTax - newBreakdown.totalTax) : 0;

  return { old, new: newBreakdown, recommended, savings, fyLabel: fy.label };
}

/** The tax under the recommended regime — convenience for callers that only need the figure. */
export function recommendedRegimeTax(result: TaxRegimeResult): number {
  return result.recommended === 'new' && result.new ? result.new.totalTax : result.old.totalTax;
}
