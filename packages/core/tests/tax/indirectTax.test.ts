import { describe, expect, it } from 'vitest';
import { TAX_BANDS, rateOn, embeddedTax, GST_LAUNCH, GST_2_0, type TaxBand } from '@/core/tax/indirectTaxRates';
import { estimateIndirectTax } from '@/core/tax/indirectTax';
import type { Expense, ExpenseCategory } from '@/core/db/types';
import { currentFY } from '@/core/tax/calculator';

const makeExpense = (over: Partial<Expense>): Expense => ({
  id: Math.random().toString(36).slice(2),
  amount: 1000,
  categoryId: 'cat-other',
  description: '',
  date: new Date('2026-06-10').getTime(),
  hashtags: [],
  isRecurring: false,
  type: 'expense',
  createdAt: 0,
  updatedAt: 0,
  ...over
});

const cat = (id: string, intentGroup: string): ExpenseCategory => ({
  id,
  name: id,
  icon: '',
  color: '',
  isDefault: true,
  intentGroup,
  applicableTo: 'expense',
  createdAt: 0
});

const catMap = new Map<string, ExpenseCategory>([
  ['cat-food', cat('cat-food', 'daily_living')],
  ['cat-transport', cat('cat-transport', 'daily_living')],
  ['cat-rent', cat('cat-rent', 'home_utilities')],
  ['cat-alcohol', cat('cat-alcohol', 'sin_goods')],
  ['cat-sip', cat('cat-sip', 'financial')]
]);

describe('rateOn — date-aware lookup', () => {
  const band: TaxBand = {
    id: 'gst-18',
    label: 'x',
    regime: 'gst',
    basis: 'markup',
    blurb: '',
    rates: [
      { effectiveFrom: Date.UTC(2025, 0, 1), ratePct: 12 },
      { effectiveFrom: Date.UTC(2017, 6, 1), ratePct: 18 }
    ]
  };

  it('picks the entry in force at the date', () => {
    expect(rateOn(band, Date.UTC(2026, 0, 1))).toBe(12); // after 2025 change
    expect(rateOn(band, Date.UTC(2020, 0, 1))).toBe(18); // before 2025 change
  });

  it('falls back to the earliest known rate for very old dates', () => {
    expect(rateOn(band, Date.UTC(2000, 0, 1))).toBe(18);
  });
});

describe('embeddedTax — basis math', () => {
  it('backs GST (markup) out of a tax-inclusive amount', () => {
    // ₹1180 at 18% → ₹180 embedded
    expect(Math.round(embeddedTax(TAX_BANDS['gst-18'], 1180, GST_LAUNCH))).toBe(180);
  });

  it('treats share-basis bands as a fraction of the amount', () => {
    // Fuel: 50% of pump price is tax → ₹500 of ₹1000
    expect(Math.round(embeddedTax(TAX_BANDS.fuel, 1000, GST_LAUNCH))).toBe(500);
  });

  it('returns 0 for exempt / non-positive amounts', () => {
    expect(embeddedTax(TAX_BANDS.exempt, 5000, GST_LAUNCH)).toBe(0);
    expect(embeddedTax(TAX_BANDS['gst-18'], 0, GST_LAUNCH)).toBe(0);
  });

  it('applies the GST 2.0 insurance exemption from the cutover date', () => {
    const before = GST_2_0 - 86_400_000; // a day before
    // ₹11,800 premium at 18% → ₹1,800 embedded before the cutover
    expect(Math.round(embeddedTax(TAX_BANDS.insurance, 11800, before))).toBe(1800);
    // exempt on/after the cutover → 0
    expect(embeddedTax(TAX_BANDS.insurance, 11800, GST_2_0)).toBe(0);
  });
});

describe('estimateIndirectTax', () => {
  it('aggregates tax by band and regime, excluding income/transfer/savings', () => {
    const expenses = [
      makeExpense({ categoryId: 'cat-food', amount: 1050 }), // 5% → ~50
      makeExpense({ categoryId: 'cat-transport', amount: 1000, description: 'Petrol at HPCL' }), // fuel → 500
      makeExpense({ categoryId: 'cat-rent', amount: 20000 }), // exempt → 0, still in spend base
      makeExpense({ categoryId: 'cat-sip', amount: 5000 }), // excluded entirely
      makeExpense({ categoryId: 'cat-food', amount: 2000, type: 'income' }) // income → ignored
    ];
    const r = estimateIndirectTax(expenses, catMap);

    expect(r.totalSpend).toBe(1050 + 1000 + 20000); // sip & income excluded
    expect(Math.round(r.totalTax)).toBe(550); // 50 (food) + 500 (fuel)
    const fuelLine = r.byBand.find((b) => b.bandId === 'fuel');
    expect(Math.round(fuelLine!.tax)).toBe(500);
    expect(r.byRegime[0].regime).toBe('fuel'); // largest tax contributor
  });

  it('brackets the point estimate with a min/max range', () => {
    const expenses = [
      makeExpense({ categoryId: 'cat-food', amount: 1050 }),
      makeExpense({ categoryId: 'cat-transport', amount: 1000, description: 'Petrol at HPCL' })
    ];
    const r = estimateIndirectTax(expenses, catMap);
    expect(r.totalTaxMin).toBeLessThanOrEqual(r.totalTax);
    expect(r.totalTaxMax).toBeGreaterThanOrEqual(r.totalTax);
    expect(r.totalTaxMin).toBeGreaterThan(0);
  });

  it('filters to the FY window when given', () => {
    const fy = currentFY(new Date('2026-06-10').getTime());
    const expenses = [
      makeExpense({ categoryId: 'cat-food', amount: 1050, date: new Date('2026-06-10').getTime() }),
      makeExpense({ categoryId: 'cat-food', amount: 1050, date: new Date('2024-01-01').getTime() }) // prior FY
    ];
    const r = estimateIndirectTax(expenses, catMap, fy);
    expect(r.totalSpend).toBe(1050);
  });
});
