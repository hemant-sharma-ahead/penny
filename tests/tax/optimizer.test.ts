import { describe, expect, it } from 'vitest';
import { optimizeDirectTax } from '@/core/tax/optimizer';
import { suggestITR } from '@/core/tax/itrAdvisor';
import { fyConfigFor } from '@/core/tax/regimeHistory';

const fy = fyConfigFor(2025);

describe('optimizeDirectTax', () => {
  it('reports unused 80C/80D/NPS headroom', () => {
    const r = optimizeDirectTax({
      grossIncome: 15_00_000,
      isSalaried: true,
      used80C: 50_000,
      used80D: 0,
      usedNps: 0,
      homeLoanInterest: 0,
      hraExemption: 0,
      fyConfig: fy
    });
    const c80 = r.headroom.find((h) => h.section === '80C')!;
    expect(c80.remaining).toBe(1_00_000);
    expect(r.headroom.find((h) => h.section === '80CCD(1B)')!.remaining).toBe(50_000);
  });

  it('quantifies potential saving only when the old regime is in play', () => {
    // Large deductions ⇒ old regime wins ⇒ deductions help.
    const helps = optimizeDirectTax({
      grossIncome: 18_00_000,
      isSalaried: true,
      used80C: 1_50_000,
      used80D: 50_000,
      usedNps: 50_000,
      homeLoanInterest: 2_00_000,
      hraExemption: 3_00_000,
      fyConfig: fy
    });
    expect(helps.deductionsHelp).toBe(true);

    // No deductions ⇒ new regime wins ⇒ headroom saving is 0 with a note.
    const noHelp = optimizeDirectTax({
      grossIncome: 9_00_000,
      isSalaried: true,
      used80C: 0,
      used80D: 0,
      usedNps: 0,
      homeLoanInterest: 0,
      hraExemption: 0,
      fyConfig: fy
    });
    expect(noHelp.deductionsHelp).toBe(false);
    expect(noHelp.totalPotentialSaving).toBe(0);
    expect(noHelp.notes.length).toBeGreaterThan(0);
  });
});

describe('suggestITR', () => {
  const base = {
    isHUF: false,
    hasBusinessOrProfession: false,
    isPresumptive: false,
    hasCapitalGains: false,
    multipleHouseProperties: false,
    incomeAbove50L: false,
    foreignAssetsOrIncome: false
  };

  it('ITR-1 for a simple salaried resident', () => {
    expect(suggestITR(base).form).toBe('ITR-1 (Sahaj)');
  });
  it('ITR-2 when capital gains exist', () => {
    expect(suggestITR({ ...base, hasCapitalGains: true }).form).toBe('ITR-2');
  });
  it('ITR-2 for a HUF without business', () => {
    expect(suggestITR({ ...base, isHUF: true }).form).toBe('ITR-2');
  });
  it('ITR-4 for presumptive business', () => {
    expect(suggestITR({ ...base, hasBusinessOrProfession: true, isPresumptive: true }).form).toBe('ITR-4 (Sugam)');
  });
  it('ITR-3 for non-presumptive business', () => {
    expect(suggestITR({ ...base, hasBusinessOrProfession: true }).form).toBe('ITR-3');
  });
});
