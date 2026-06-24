// Old vs New tax regime comparison — pure, on-device.
//
// Slabs and rules for FY 2025-26 (AY 2026-27), individuals below 60.
//   - New regime: standard deduction ₹75,000; §87A rebate makes tax nil up to
//     ₹12,00,000 taxable income; surcharge capped at 25%.
//   - Old regime: standard deduction ₹50,000; §87A rebate makes tax nil up to
//     ₹5,00,000 taxable income; allows Chapter VI-A deductions (80C/80D/24B/etc.).
//   - Both: 4% health & education cess on (tax + surcharge).
//
// This is an estimate for planning. It does not model every edge case (marginal
// relief on surcharge, special-rate incomes, etc.).

export const TAX_FY_LABEL = 'FY 2025-26 (AY 2026-27)';

export const NEW_REGIME_STD_DEDUCTION = 75_000;
export const OLD_REGIME_STD_DEDUCTION = 50_000;
const NEW_REGIME_REBATE_LIMIT = 12_00_000;
const OLD_REGIME_REBATE_LIMIT = 5_00_000;
const CESS_RATE = 0.04;

interface Slab {
  upTo: number | null; // null = no upper bound
  rate: number; // fraction, e.g. 0.05
}

const NEW_REGIME_SLABS: Slab[] = [
  { upTo: 4_00_000, rate: 0 },
  { upTo: 8_00_000, rate: 0.05 },
  { upTo: 12_00_000, rate: 0.1 },
  { upTo: 16_00_000, rate: 0.15 },
  { upTo: 20_00_000, rate: 0.2 },
  { upTo: 24_00_000, rate: 0.25 },
  { upTo: null, rate: 0.3 }
];

const OLD_REGIME_SLABS: Slab[] = [
  { upTo: 2_50_000, rate: 0 },
  { upTo: 5_00_000, rate: 0.05 },
  { upTo: 10_00_000, rate: 0.2 },
  { upTo: null, rate: 0.3 }
];

/** Progressive slab tax on a taxable income. */
function slabTax(taxable: number, slabs: Slab[]): number {
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

/** Surcharge on total income. New regime caps the top rate at 25%. */
function surcharge(tax: number, totalIncome: number, regime: 'old' | 'new'): number {
  let rate = 0;
  if (totalIncome > 5_00_00_000) rate = regime === 'new' ? 0.25 : 0.37;
  else if (totalIncome > 2_00_00_000) rate = 0.25;
  else if (totalIncome > 1_00_00_000) rate = 0.15;
  else if (totalIncome > 50_00_000) rate = 0.1;
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
  new: RegimeBreakdown;
  recommended: 'old' | 'new';
  savings: number; // tax saved by choosing the recommended regime
}

function computeRegime(
  grossIncome: number,
  standardDeduction: number,
  otherDeductions: number,
  slabs: Slab[],
  rebateLimit: number,
  regime: 'old' | 'new'
): RegimeBreakdown {
  const taxableIncome = Math.max(0, grossIncome - standardDeduction - otherDeductions);
  const taxBeforeRebate = slabTax(taxableIncome, slabs);
  const rebate = taxableIncome <= rebateLimit ? taxBeforeRebate : 0;
  const taxAfterRebate = taxBeforeRebate - rebate;
  const sur = surcharge(taxAfterRebate, taxableIncome, regime);
  const cess = (taxAfterRebate + sur) * CESS_RATE;
  const totalTax = taxAfterRebate + sur + cess;

  return {
    grossIncome,
    standardDeduction,
    otherDeductions,
    taxableIncome,
    taxBeforeRebate,
    rebate,
    surcharge: sur,
    cess,
    totalTax
  };
}

export function compareTaxRegimes(input: TaxRegimeInput): TaxRegimeResult | null {
  const { grossIncome, isSalaried } = input;
  if (grossIncome < 0) return null;

  const oldStdDed = isSalaried ? OLD_REGIME_STD_DEDUCTION : 0;
  const newStdDed = isSalaried ? NEW_REGIME_STD_DEDUCTION : 0;

  // Old regime totals the Chapter VI-A deductions (with their statutory caps).
  const cappedOtherDeductions =
    Math.min(input.deduction80C, 1_50_000) +
    Math.max(0, input.deduction80D) +
    Math.min(input.homeLoanInterest, 2_00_000) +
    Math.min(input.nps80ccd1b, 50_000) +
    Math.max(0, input.hraExemption) +
    Math.max(0, input.otherDeductions);

  const oldBreakdown = computeRegime(
    grossIncome,
    oldStdDed,
    cappedOtherDeductions,
    OLD_REGIME_SLABS,
    OLD_REGIME_REBATE_LIMIT,
    'old'
  );
  const newBreakdown = computeRegime(grossIncome, newStdDed, 0, NEW_REGIME_SLABS, NEW_REGIME_REBATE_LIMIT, 'new');

  const recommended = newBreakdown.totalTax <= oldBreakdown.totalTax ? 'new' : 'old';
  const savings = Math.abs(oldBreakdown.totalTax - newBreakdown.totalTax);

  return { old: oldBreakdown, new: newBreakdown, recommended, savings };
}
