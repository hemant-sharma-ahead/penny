// Direct-tax optimisation — surfaces unused deduction headroom (old regime), the regime
// recommendation, and the rupee impact of acting. Pure. Estimates for planning.

import { compareTaxRegimes, type TaxRegimeInput } from '@/core/calculators/taxRegime';
import type { FYTaxConfig, RegimeSlab } from './regimeHistory';

export const DEDUCTION_LIMITS = {
  SEC_80C: 1_50_000,
  SEC_80D: 50_000, // self (25k) + parents (25k); seniors higher — simplified
  NPS_80CCD_1B: 50_000
} as const;

export interface DeductionHeadroom {
  section: string;
  label: string;
  limit: number;
  used: number;
  remaining: number;
  /** Tax saved (old regime) if the remaining headroom is fully used, at the marginal rate + cess. */
  potentialSaving: number;
}

export interface OptimizerInput {
  grossIncome: number;
  isSalaried: boolean;
  used80C: number;
  used80D: number;
  usedNps: number; // 80CCD(1B)
  homeLoanInterest: number;
  hraExemption: number;
  fyConfig: FYTaxConfig;
}

export interface OptimizerResult {
  recommendedRegime: 'old' | 'new';
  regimeSaving: number;
  /** Old-regime marginal slab rate (incl. cess) on the current taxable income. */
  marginalRatePct: number;
  headroom: DeductionHeadroom[];
  totalPotentialSaving: number;
  /** True when these deductions actually reduce tax (i.e. the old regime is in play). */
  deductionsHelp: boolean;
  notes: string[];
}

/** Top slab rate reached by a taxable income. */
function marginalRate(taxable: number, slabs: RegimeSlab[]): number {
  let rate = 0;
  let lower = 0;
  for (const s of slabs) {
    const upper = s.upTo ?? Infinity;
    if (taxable > lower) rate = s.rate;
    lower = upper;
    if (taxable <= upper) break;
  }
  return rate;
}

export function optimizeDirectTax(input: OptimizerInput): OptimizerResult {
  const { grossIncome, isSalaried, fyConfig } = input;

  const regimeInput: TaxRegimeInput = {
    grossIncome,
    isSalaried,
    deduction80C: input.used80C,
    deduction80D: input.used80D,
    homeLoanInterest: input.homeLoanInterest,
    nps80ccd1b: input.usedNps,
    hraExemption: input.hraExemption,
    otherDeductions: 0
  };
  const regime = compareTaxRegimes(regimeInput, fyConfig);
  const recommendedRegime = regime?.recommended ?? 'new';
  const regimeSaving = regime?.savings ?? 0;
  const deductionsHelp = recommendedRegime === 'old';

  // Marginal rate on the old-regime taxable income (where deductions bite).
  const stdDed = isSalaried ? fyConfig.old.stdDeduction : 0;
  const usedDeductions =
    Math.min(input.used80C, DEDUCTION_LIMITS.SEC_80C) +
    input.used80D +
    Math.min(input.homeLoanInterest, 2_00_000) +
    Math.min(input.usedNps, DEDUCTION_LIMITS.NPS_80CCD_1B) +
    input.hraExemption;
  const taxable = Math.max(0, grossIncome - stdDed - usedDeductions);
  const marginal = marginalRate(taxable, fyConfig.old.slabs) * (1 + fyConfig.cessRate);
  const marginalRatePct = marginal * 100;

  const mk = (section: string, label: string, limit: number, used: number): DeductionHeadroom => {
    const remaining = Math.max(0, limit - used);
    return {
      section,
      label,
      limit,
      used: Math.min(used, limit),
      remaining,
      potentialSaving: deductionsHelp ? Math.round(remaining * marginal) : 0
    };
  };

  const headroom = [
    mk('80C', 'EPF, PPF, ELSS, life insurance, home-loan principal…', DEDUCTION_LIMITS.SEC_80C, input.used80C),
    mk('80D', 'Health insurance premiums (self + parents)', DEDUCTION_LIMITS.SEC_80D, input.used80D),
    mk('80CCD(1B)', 'Extra NPS contribution', DEDUCTION_LIMITS.NPS_80CCD_1B, input.usedNps)
  ];

  const totalPotentialSaving = headroom.reduce((s, h) => s + h.potentialSaving, 0);

  const notes: string[] = [];
  if (!deductionsHelp) {
    notes.push(
      'The new regime is currently cheaper for you, and it ignores 80C/80D/24B. These deductions only cut tax if you switch to the old regime.'
    );
  }
  if (regime?.new == null) {
    notes.push('The new regime did not exist this financial year, so the old regime applies.');
  }

  return {
    recommendedRegime,
    regimeSaving,
    marginalRatePct,
    headroom,
    totalPotentialSaving,
    deductionsHelp,
    notes
  };
}

// ── 80G donation reference (awareness) ─────────────────────────────────────────
export interface DonationTier {
  rate: string; // '100%' / '50%'
  limited: boolean; // subject to 10%-of-adjusted-GTI qualifying limit
  examples: string;
}

export const DONATION_TIERS: DonationTier[] = [
  {
    rate: '100%',
    limited: false,
    examples: 'PM National Relief Fund, National Defence Fund, PM CARES, Swachh Bharat Kosh'
  },
  { rate: '50%', limited: false, examples: 'PM Drought Relief Fund, Jawaharlal Nehru Memorial Fund' },
  { rate: '100%', limited: true, examples: 'Govt/local-authority funds for family planning, approved sports bodies' },
  { rate: '50%', limited: true, examples: 'Most registered charitable trusts & NGOs, religious renovation funds' }
];
