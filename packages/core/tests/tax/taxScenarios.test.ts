import { describe, expect, it } from 'vitest';
import { TAX_SCENARIOS } from '@/core/tax/taxScenarios';

const byId = (id: string) => TAX_SCENARIOS.find((s) => s.id === id)!;

describe('tax scenarios', () => {
  it('fuel: ~half the pump price is tax', () => {
    const r = byId('fuel').compute(1000);
    expect(Math.round(r.effectivePct)).toBe(48); // excise 25 + VAT 23
    expect(r.totalCharges).toBeGreaterThan(0); // base + dealer
  });

  it('dining: 5% GST backed out of an inclusive bill', () => {
    const r = byId('dining').compute(2100);
    expect(Math.round(r.totalTax)).toBe(100); // 2100 × 5/105
  });

  it('property: ready = stamp + registration only; under-construction adds GST', () => {
    const ready = byId('property').compute(1_00_00_000, 'ready');
    expect(Math.round(ready.totalTax)).toBe(7_00_000); // 6% + 1%
    const uc = byId('property').compute(1_00_00_000, 'under_construction');
    expect(Math.round(uc.totalTax)).toBe(12_00_000); // + 5% GST
  });

  it('vehicle: luxury slab embeds more GST than a small car', () => {
    const small = byId('vehicle').compute(10_00_000, 'small');
    const lux = byId('vehicle').compute(10_00_000, 'luxury');
    expect(lux.totalTax).toBeGreaterThan(small.totalTax);
  });

  it('gold: jewellery separates making (charge) from GST (tax)', () => {
    const r = byId('gold').compute(1_00_000, 'jewellery');
    expect(r.totalCharges).toBeGreaterThan(0); // making + hallmark
    expect(Math.round(r.lines.find((l) => l.label.includes('3%'))!.amount)).toBe(3000); // 3% of metal
  });

  it('equity: buy carries stamp duty, sell carries DP charge', () => {
    const buy = byId('equity').compute(1_00_000, 'buy');
    const sell = byId('equity').compute(1_00_000, 'sell');
    expect(buy.lines.some((l) => l.label.includes('Stamp'))).toBe(true);
    expect(sell.lines.some((l) => l.label.includes('DP'))).toBe(true);
    expect(buy.totalTax).toBeGreaterThan(0);
  });

  it('interest: 10% TDS', () => {
    const r = byId('interest').compute(50_000);
    expect(Math.round(r.totalTax)).toBe(5000);
  });
});
