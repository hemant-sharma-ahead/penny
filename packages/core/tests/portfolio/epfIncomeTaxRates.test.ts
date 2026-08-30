import { describe, expect, it } from 'vitest';
import {
  lookupTaxPeriodForMonth,
  estimateAnnualIncomeTax,
  isNewRegimeAvailable,
  EPF_INCOME_TAX_TABLE_FALLBACK
} from '@/core/portfolio/epfIncomeTaxRates';

// Real reported ask (2026-08-30): the EPF hike breakdown's "Net Monthly" only ever subtracted employee
// EPF, never real income tax — this covers the new "In Hand Monthly" calculator these tables back.
// Both regimes are modelled (a direct follow-up question caught that the first version only ever
// computed the New Regime, silently assuming that's what everyone was on from FY2020-21 onward, when a
// taxpayer can genuinely choose either every year since).
describe('isNewRegimeAvailable', () => {
  it('is false for any month before the New Regime existed', () => {
    expect(isNewRegimeAvailable(EPF_INCOME_TAX_TABLE_FALLBACK, '2014-11')).toBe(false);
    expect(isNewRegimeAvailable(EPF_INCOME_TAX_TABLE_FALLBACK, '2020-03')).toBe(false);
  });

  it("is true from FY2020-21 (the New Regime's introduction) onward", () => {
    expect(isNewRegimeAvailable(EPF_INCOME_TAX_TABLE_FALLBACK, '2020-04')).toBe(true);
    expect(isNewRegimeAvailable(EPF_INCOME_TAX_TABLE_FALLBACK, '2026-06')).toBe(true);
  });
});

describe('lookupTaxPeriodForMonth', () => {
  it('picks the FY2014-15 Old Regime period for a month in that era', () => {
    const period = lookupTaxPeriodForMonth(EPF_INCOME_TAX_TABLE_FALLBACK, '2014-11', 'old');
    expect(period.effectiveFrom).toBe('2014-04');
    expect(period.standardDeduction).toBe(0);
  });

  it('the Old Regime stays frozen at its FY2019-20 shape for every year since, including today', () => {
    const period2019 = lookupTaxPeriodForMonth(EPF_INCOME_TAX_TABLE_FALLBACK, '2019-06', 'old');
    const period2026 = lookupTaxPeriodForMonth(EPF_INCOME_TAX_TABLE_FALLBACK, '2026-06', 'old');
    expect(period2026).toEqual(period2019);
    expect(period2026.standardDeduction).toBe(50000);
    expect(period2026.rebateThresholdIncome).toBe(500000);
  });

  it('picks the current (FY2025-26+) New Regime period for a recent month', () => {
    const period = lookupTaxPeriodForMonth(EPF_INCOME_TAX_TABLE_FALLBACK, '2026-06', 'new');
    expect(period.effectiveFrom).toBe('2025-04');
    expect(period.standardDeduction).toBe(75000);
    expect(period.rebateThresholdIncome).toBe(1200000);
  });
});

describe('estimateAnnualIncomeTax', () => {
  it('is zero for taxable income at/below the New Regime rebate threshold (Section 87A)', () => {
    // FY2025-26+: standard deduction 75,000, rebate threshold 12,00,000 taxable.
    const result = estimateAnnualIncomeTax(1275000, EPF_INCOME_TAX_TABLE_FALLBACK, '2026-01', 'new');
    expect(result.taxableIncome).toBe(1200000);
    expect(result.totalTax).toBe(0);
  });

  it('computes New Regime progressive slabs correctly just above the rebate threshold', () => {
    // FY2025-26+: taxable 1,300,000 → brackets: 0-4L@0, 4-8L@5, 8-12L@10, 12-13L@15.
    // Tax = 4L*5% + 4L*10% + 1L*15% = 20,000 + 40,000 + 15,000 = 75,000. Cess 4% = 3,000.
    const result = estimateAnnualIncomeTax(1375000, EPF_INCOME_TAX_TABLE_FALLBACK, '2026-01', 'new');
    expect(result.incomeTax).toBe(75000);
    expect(result.cess).toBe(3000);
    expect(result.totalTax).toBe(78000);
  });

  it('computes Old Regime for the SAME recent month — a genuine, different choice, not a fallback', () => {
    // Old Regime (frozen since FY2019-20): std ded 50,000, rebate up to 5L, brackets 0-2.5L@0,
    // 2.5-5L@5, 5-10L@20, 10L+@30. Gross 1,375,000 - 50,000 = 1,325,000 taxable.
    // Tax = 2.5L*5% + 5L*20% + 3.25L*30% = 12,500 + 100,000 + 97,500 = 210,000. Cess 4% = 8,400.
    const result = estimateAnnualIncomeTax(1375000, EPF_INCOME_TAX_TABLE_FALLBACK, '2026-01', 'old');
    expect(result.taxableIncome).toBe(1325000);
    expect(result.incomeTax).toBe(210000);
    expect(result.cess).toBe(8400);
    // Old Regime genuinely owes far more here — exactly the real-world case ("no deductions modelled")
    // this feature's own UI caveat exists for.
  });

  it('silently falls back to the Old Regime when "new" is requested for a pre-2020 month', () => {
    const asNew = estimateAnnualIncomeTax(600000, EPF_INCOME_TAX_TABLE_FALLBACK, '2014-11', 'new');
    const asOld = estimateAnnualIncomeTax(600000, EPF_INCOME_TAX_TABLE_FALLBACK, '2014-11', 'old');
    expect(asNew).toEqual(asOld);
  });

  it('uses the Old Regime slabs (no standard deduction) for a pre-2018 month', () => {
    // FY2014-15: 0-2.5L@0, 2.5-5L@10, 5-10L@20 — taxable income 6,00,000 (no standard deduction yet).
    // Tax = 2.5L*10% + 1L*20% = 25,000 + 20,000 = 45,000. Cess 3% = 1,350.
    const result = estimateAnnualIncomeTax(600000, EPF_INCOME_TAX_TABLE_FALLBACK, '2014-11', 'old');
    expect(result.taxableIncome).toBe(600000);
    expect(result.incomeTax).toBe(45000);
    expect(result.cess).toBe(1350);
  });

  it('never returns negative taxable income for a gross below the standard deduction', () => {
    const result = estimateAnnualIncomeTax(50000, EPF_INCOME_TAX_TABLE_FALLBACK, '2026-01', 'new');
    expect(result.taxableIncome).toBe(0);
    expect(result.totalTax).toBe(0);
  });

  it('applies the highest, unbounded bracket correctly for a large income (New Regime)', () => {
    // FY2025-26+: taxable 30,00,000 → last bracket (24L+) applies to the amount above 24L.
    // 4L@0 + 4L@5 + 4L@10 + 4L@15 + 4L@20 + 4L@25 + 6L@30
    // = 0 + 20000 + 40000 + 60000 + 80000 + 100000 + 180000 = 480000
    const result = estimateAnnualIncomeTax(3075000, EPF_INCOME_TAX_TABLE_FALLBACK, '2026-01', 'new');
    expect(result.taxableIncome).toBe(3000000);
    expect(result.incomeTax).toBe(480000);
  });
});
