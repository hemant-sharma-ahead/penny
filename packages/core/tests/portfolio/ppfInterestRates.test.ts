import { describe, expect, it } from 'vitest';
import {
  lookupRateForDate,
  lookupRateForMonth,
  PPF_RATE_TABLE_FALLBACK,
  type PpfRateTable
} from '@/core/portfolio/ppfInterestRates';

describe('lookupRateForDate (PPF)', () => {
  it('returns the rate in effect for a date that falls exactly on a period boundary', () => {
    const table: PpfRateTable = {
      confirmedThrough: '2025-03-31',
      periods: [
        { effectiveFrom: '2023-04-01', ratePct: 7.1 },
        { effectiveFrom: '2024-04-01', ratePct: 7.0 }
      ]
    };
    expect(lookupRateForDate(table, '2024-04-01')).toBe(7.0);
    expect(lookupRateForDate(table, '2024-03-31')).toBe(7.1);
  });

  it('resolves the genuinely mid-month 15-Jan-2000 change at exact day precision', () => {
    expect(lookupRateForDate(PPF_RATE_TABLE_FALLBACK, '2000-01-14')).toBe(12.0);
    expect(lookupRateForDate(PPF_RATE_TABLE_FALLBACK, '2000-01-15')).toBe(11.0);
  });

  it('handles a real mid-year rate change (FY2017-18, changed three times) with no special-casing', () => {
    const table: PpfRateTable = {
      confirmedThrough: '2018-03-31',
      periods: [
        { effectiveFrom: '2017-04-01', ratePct: 7.9 },
        { effectiveFrom: '2017-07-01', ratePct: 7.8 },
        { effectiveFrom: '2018-01-01', ratePct: 7.6 }
      ]
    };
    expect(lookupRateForDate(table, '2017-04-01')).toBe(7.9);
    expect(lookupRateForDate(table, '2017-06-30')).toBe(7.9);
    expect(lookupRateForDate(table, '2017-07-01')).toBe(7.8);
    expect(lookupRateForDate(table, '2017-12-31')).toBe(7.8);
    expect(lookupRateForDate(table, '2018-01-01')).toBe(7.6);
    expect(lookupRateForDate(table, '2018-03-31')).toBe(7.6);
  });

  it('returns null for a date before the table’s first period', () => {
    const table: PpfRateTable = {
      confirmedThrough: '2025-03-31',
      periods: [{ effectiveFrom: '2020-04-01', ratePct: 7.1 }]
    };
    expect(lookupRateForDate(table, '2019-04-01')).toBeNull();
  });

  it('returns null (never extrapolates) for a date after confirmedThrough — "rate not yet available"', () => {
    const table: PpfRateTable = {
      confirmedThrough: '2025-03-31',
      periods: [{ effectiveFrom: '2023-04-01', ratePct: 7.1 }]
    };
    expect(lookupRateForDate(table, '2025-04-01')).toBeNull();
    expect(lookupRateForDate(table, '2026-04-01')).toBeNull();
  });

  it('the fallback table correctly resolves known historical rates', () => {
    expect(lookupRateForDate(PPF_RATE_TABLE_FALLBACK, '2014-06-15')).toBe(8.7); // FY2014-15
    expect(lookupRateForDate(PPF_RATE_TABLE_FALLBACK, '2026-06-15')).toBe(7.1); // FY2026-27, unchanged
  });

  it('the fallback table’s periods are sorted ascending by effectiveFrom', () => {
    const froms = PPF_RATE_TABLE_FALLBACK.periods.map((p) => p.effectiveFrom);
    const sorted = [...froms].sort();
    expect(froms).toEqual(sorted);
  });
});

describe('lookupRateForMonth (PPF) — end-of-month convenience convention', () => {
  it('resolves a clean (non-straddling) month to its one rate', () => {
    expect(lookupRateForMonth(PPF_RATE_TABLE_FALLBACK, '2014-06')).toBe(8.7);
  });

  it('resolves the straddling January 2000 month using the documented end-of-month convention (11%, not 12%)', () => {
    // Documented, not verified against a primary source — see the function's own doc comment.
    expect(lookupRateForMonth(PPF_RATE_TABLE_FALLBACK, '2000-01')).toBe(11.0);
  });

  it('returns null for a month after confirmedThrough', () => {
    expect(lookupRateForMonth(PPF_RATE_TABLE_FALLBACK, '2027-04')).toBeNull();
  });
});
