// Aggregates spending into an estimated indirect-tax footprint (GST + fuel + sin + vehicle + toll).
// Pure. Consumer amounts are tax-inclusive, so we back out the embedded tax per the band's basis.

import type { Expense, ExpenseCategory } from '@/core/db/types';
import { TAX_BANDS, REGIME_LABEL, embeddedTax, type TaxBandId, type TaxRegime } from './indirectTaxRates';
import { classifyTaxBand } from './taxBandClassifier';
import { SPEND_EXCLUDED } from './categoryTaxMap';

/** Minimal FY window — any object exposing the April–March bounds. */
export interface FYWindow {
  start: number;
  end: number;
}

export interface BandTaxLine {
  bandId: TaxBandId;
  label: string;
  regime: TaxRegime;
  spend: number;
  tax: number;
  count: number;
}

export interface RegimeTaxLine {
  regime: TaxRegime;
  label: string;
  spend: number;
  tax: number;
}

export interface IndirectTaxBreakdown {
  totalSpend: number; // spend base that attracts (or could attract) indirect tax
  totalTax: number; // point estimate
  totalTaxMin: number; // low end (e.g. some vendors unregistered / composition)
  totalTaxMax: number; // high end (everything registered + cess/rounding)
  effectiveRatePct: number; // totalTax / totalSpend
  byRegime: RegimeTaxLine[]; // sorted by tax desc
  byBand: BandTaxLine[]; // sorted by tax desc
}

// Indirect tax can never be tracked exactly, so we report a range around the point estimate.
// The low/high factors reflect each regime's real-world uncertainty — chiefly that some GST-bucket
// spend is at small/unregistered/composition vendors (no GST) or exempt items.
const REGIME_UNCERTAINTY: Record<TaxRegime, { low: number; high: number }> = {
  gst: { low: 0.7, high: 1.05 }, // some spend at unregistered/composition vendors or exempt
  fuel: { low: 0.9, high: 1.1 }, // state VAT varies
  sin: { low: 0.85, high: 1.15 }, // state excise varies widely
  vehicle: { low: 0.85, high: 1.15 }, // cess + road tax vary
  levy: { low: 1, high: 1 },
  exempt: { low: 1, high: 1 }
};

/** True for transactions that should count toward the consumption spend base. */
function isSpend(e: Expense): boolean {
  if (e.type && e.type !== 'expense') return false; // income / transfer
  if (SPEND_EXCLUDED.has(e.categoryId)) return false; // SIP / savings transfers
  if (e.amount <= 0) return false;
  return true;
}

/**
 * Estimate the indirect tax embedded in a period's spending. When `fy` is given, only expenses
 * within the FY window are counted; otherwise all supplied expenses are used.
 */
export function estimateIndirectTax(
  expenses: Expense[],
  categories: Map<string, ExpenseCategory>,
  fy?: FYWindow
): IndirectTaxBreakdown {
  const bandAcc = new Map<TaxBandId, BandTaxLine>();
  let totalSpend = 0;
  let totalTax = 0;
  let totalTaxMin = 0;
  let totalTaxMax = 0;

  for (const e of expenses) {
    if (fy && (e.date < fy.start || e.date > fy.end)) continue;
    if (!isSpend(e)) continue;

    const bandId = classifyTaxBand(e, categories.get(e.categoryId));
    const band = TAX_BANDS[bandId];
    const tax = embeddedTax(band, e.amount, e.date);
    const uncertainty = REGIME_UNCERTAINTY[band.regime];

    totalSpend += e.amount;
    totalTax += tax;
    totalTaxMin += tax * uncertainty.low;
    totalTaxMax += tax * uncertainty.high;

    const line = bandAcc.get(bandId) ?? {
      bandId,
      label: band.label,
      regime: band.regime,
      spend: 0,
      tax: 0,
      count: 0
    };
    line.spend += e.amount;
    line.tax += tax;
    line.count += 1;
    bandAcc.set(bandId, line);
  }

  const byBand = Array.from(bandAcc.values()).sort((a, b) => b.tax - a.tax);

  const regimeAcc = new Map<TaxRegime, RegimeTaxLine>();
  for (const line of byBand) {
    const r = regimeAcc.get(line.regime) ?? {
      regime: line.regime,
      label: REGIME_LABEL[line.regime],
      spend: 0,
      tax: 0
    };
    r.spend += line.spend;
    r.tax += line.tax;
    regimeAcc.set(line.regime, r);
  }
  const byRegime = Array.from(regimeAcc.values()).sort((a, b) => b.tax - a.tax);

  return {
    totalSpend,
    totalTax,
    totalTaxMin,
    totalTaxMax,
    effectiveRatePct: totalSpend > 0 ? (totalTax / totalSpend) * 100 : 0,
    byRegime,
    byBand
  };
}
