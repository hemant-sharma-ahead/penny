// Capital gains calculator — pure, on-device. Post-Budget 2024 rules (FY 2024-25+).
//
// Covers the four common asset types Indian retail investors hold. Long-term
// special rates: 12.5% (no indexation). Short-term: equity flat 20%, others at the
// taxpayer's slab rate. Equity LTCG enjoys a ₹1.25L per-year exemption. A 4% health
// & education cess applies on the computed tax.

export type CapitalAsset = 'equity' | 'debt' | 'gold' | 'property';

// Months of holding required for long-term treatment.
const LT_THRESHOLD_MONTHS: Record<CapitalAsset, number> = {
  equity: 12,
  debt: 0, // debt funds bought after Apr-2023 are always taxed at slab — no LT benefit
  gold: 24,
  property: 24
};

export const EQUITY_LTCG_EXEMPTION = 1_25_000;
const EQUITY_LTCG_RATE = 12.5;
const EQUITY_STCG_RATE = 20;
const LT_SPECIAL_RATE = 12.5; // gold, property long-term
const CESS_PCT = 4;

export interface CapitalGainsInput {
  asset: CapitalAsset;
  buyValue: number; // total purchase cost
  sellValue: number; // total sale value
  holdingMonths: number;
  slabRatePct: number; // marginal slab rate — used when the gain is taxed at slab
}

export interface CapitalGainsResult {
  gain: number; // can be negative (capital loss)
  isLongTerm: boolean;
  ltThresholdMonths: number;
  exemptionApplied: number; // equity LTCG ₹1.25L exemption used
  taxableGain: number;
  appliedRatePct: number; // base rate applied to the taxable gain
  isSlabRate: boolean; // true when taxed at the user's slab
  baseTax: number;
  cess: number;
  tax: number; // base tax + cess
  netGain: number; // gain after tax
}

export function calcCapitalGains(input: CapitalGainsInput): CapitalGainsResult | null {
  const { asset, buyValue, sellValue, holdingMonths, slabRatePct } = input;
  if (buyValue <= 0 || sellValue < 0 || holdingMonths < 0 || slabRatePct < 0) return null;

  const ltThresholdMonths = LT_THRESHOLD_MONTHS[asset];
  const gain = sellValue - buyValue;
  const isLongTerm = asset === 'debt' ? false : holdingMonths >= ltThresholdMonths;

  // Capital loss (or break-even) — nothing to tax.
  if (gain <= 0) {
    return {
      gain,
      isLongTerm,
      ltThresholdMonths,
      exemptionApplied: 0,
      taxableGain: 0,
      appliedRatePct: 0,
      isSlabRate: false,
      baseTax: 0,
      cess: 0,
      tax: 0,
      netGain: gain
    };
  }

  let appliedRatePct: number;
  let isSlabRate = false;
  let exemptionApplied = 0;
  let taxableGain = gain;

  if (asset === 'equity') {
    if (isLongTerm) {
      exemptionApplied = Math.min(gain, EQUITY_LTCG_EXEMPTION);
      taxableGain = Math.max(0, gain - EQUITY_LTCG_EXEMPTION);
      appliedRatePct = EQUITY_LTCG_RATE;
    } else {
      appliedRatePct = EQUITY_STCG_RATE;
    }
  } else if (asset === 'debt') {
    appliedRatePct = slabRatePct;
    isSlabRate = true;
  } else {
    // gold, property
    if (isLongTerm) {
      appliedRatePct = LT_SPECIAL_RATE;
    } else {
      appliedRatePct = slabRatePct;
      isSlabRate = true;
    }
  }

  const baseTax = taxableGain * (appliedRatePct / 100);
  const cess = baseTax * (CESS_PCT / 100);
  const tax = baseTax + cess;

  return {
    gain,
    isLongTerm,
    ltThresholdMonths,
    exemptionApplied,
    taxableGain,
    appliedRatePct,
    isSlabRate,
    baseTax,
    cess,
    tax,
    netGain: gain - tax
  };
}
