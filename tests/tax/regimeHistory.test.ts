import { describe, expect, it } from 'vitest';
import { compareTaxRegimes } from '@/core/calculators/taxRegime';
import { fyConfigFor } from '@/core/tax/regimeHistory';
import { selectableFYs, fyStartYearOf, fyWindow, shortFYLabel } from '@/core/tax/fy';

const noDeductions = {
  deduction80C: 0,
  deduction80D: 0,
  homeLoanInterest: 0,
  nps80ccd1b: 0,
  hraExemption: 0,
  otherDeductions: 0
};

describe('regime history', () => {
  it('has no new regime before FY2020-21', () => {
    expect(fyConfigFor(2019).new).toBeNull();
    const res = compareTaxRegimes({ grossIncome: 10_00_000, isSalaried: true, ...noDeductions }, fyConfigFor(2019));
    expect(res?.new).toBeNull();
    expect(res?.recommended).toBe('old');
    expect(res?.savings).toBe(0);
  });

  it('makes ₹12L tax-free under the new regime only from FY2025-26', () => {
    const input = { grossIncome: 12_75_000, isSalaried: true, ...noDeductions };
    // FY2025-26: rebate up to ₹12L taxable ⇒ nil
    const cur = compareTaxRegimes(input, fyConfigFor(2025));
    expect(cur?.new?.totalTax).toBeCloseTo(0, 0);
    // FY2023-24: rebate only up to ₹7L ⇒ tax due on ₹12.25L taxable (₹75k std ded didn't exist either)
    const old = compareTaxRegimes(input, fyConfigFor(2023));
    expect(old?.new?.totalTax ?? 0).toBeGreaterThan(0);
  });

  it('applies 3% cess in FY2017-18 and 4% afterwards', () => {
    expect(fyConfigFor(2017).cessRate).toBe(0.03);
    expect(fyConfigFor(2018).cessRate).toBe(0.04);
  });
});

describe('fy helpers', () => {
  it('derives the FY start year across the April boundary', () => {
    expect(fyStartYearOf(new Date('2026-06-10').getTime())).toBe(2026);
    expect(fyStartYearOf(new Date('2026-02-10').getTime())).toBe(2025);
  });

  it('builds an April–March window', () => {
    const w = fyWindow(2025);
    expect(new Date(w.start).getMonth()).toBe(3); // April
    expect(new Date(w.end).getMonth()).toBe(2); // March
  });

  it('lists FYs newest-first back to 2017, clamped to the latest modelled FY', () => {
    const fys = selectableFYs(new Date('2026-06-10').getTime());
    expect(fys[0].label).toBe(shortFYLabel(2026));
    expect(fys[fys.length - 1].startYear).toBe(2017);
  });
});
