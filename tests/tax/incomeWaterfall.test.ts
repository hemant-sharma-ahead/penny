import { describe, expect, it } from 'vitest';
import { computeWaterfall, defaultEpf, type WaterfallInput } from '@/core/tax/incomeWaterfall';

const base: WaterfallInput = {
  gross: 20_00_000,
  epfEmployee: 1_20_000, // 12% of 50% basic
  professionalTax: 2_400,
  lwf: 0,
  incomeTax: 2_00_000,
  trackedSpend: 10_00_000,
  indirectTax: 1_00_000
};

describe('computeWaterfall', () => {
  it('reconciles consumed = directTax + trackedSpend = direct + indirect + real', () => {
    const w = computeWaterfall(base);
    expect(w.consumed).toBeCloseTo(w.directTax + w.trackedSpend, 0);
    expect(w.consumed).toBeCloseTo(w.directTax + w.indirectTax + w.realConsumption, 0);
    // gross − totalSavings identity
    expect(w.consumed).toBeCloseTo(w.gross - w.totalSavings, 0);
  });

  it('computes in-hand and total savings (incl. EPF)', () => {
    const w = computeWaterfall(base);
    expect(w.inHand).toBe(20_00_000 - 1_20_000 - 2_400 - 2_00_000);
    expect(w.totalSavings).toBe(w.epf + w.discretionarySavings);
  });

  it('shares of consumed sum to ~100', () => {
    const w = computeWaterfall(base);
    expect(Math.round(w.directPct + w.indirectPct + w.realPct)).toBe(100);
  });

  it('flags overspending when spend exceeds in-hand', () => {
    const w = computeWaterfall({ ...base, trackedSpend: 18_00_000 });
    expect(w.overspent).toBe(true);
    expect(w.discretionarySavings).toBeLessThan(0);
  });

  it('caps indirect tax at tracked spend and clamps negatives', () => {
    const w = computeWaterfall({ ...base, indirectTax: 99_00_000 });
    expect(w.indirectTax).toBe(w.trackedSpend);
    expect(w.realConsumption).toBe(0);
  });

  it('defaultEpf is 12% of 50%-basic', () => {
    expect(defaultEpf(20_00_000)).toBe(1_20_000);
  });
});
