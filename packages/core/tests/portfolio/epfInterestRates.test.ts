import { describe, expect, it } from 'vitest';
import { lookupRateForMonth, EPF_RATE_TABLE_FALLBACK, type EpfRateTable } from '@/core/portfolio/epfInterestRates';

describe('lookupRateForMonth', () => {
  it('returns the rate in effect for a month that falls exactly on a period boundary', () => {
    const table: EpfRateTable = {
      confirmedThrough: '2025-03',
      periods: [
        { effectiveFrom: '2023-04', ratePct: 8.25 },
        { effectiveFrom: '2024-04', ratePct: 8.1 }
      ]
    };
    expect(lookupRateForMonth(table, '2024-04')).toBe(8.1);
    expect(lookupRateForMonth(table, '2024-03')).toBe(8.25);
  });

  it('handles the real 2000-01 mid-year rate change with no special-casing', () => {
    const table: EpfRateTable = {
      confirmedThrough: '2001-03',
      periods: [
        { effectiveFrom: '2000-04', ratePct: 12.0 },
        { effectiveFrom: '2000-07', ratePct: 11.0 }
      ]
    };
    expect(lookupRateForMonth(table, '2000-04')).toBe(12.0);
    expect(lookupRateForMonth(table, '2000-06')).toBe(12.0);
    expect(lookupRateForMonth(table, '2000-07')).toBe(11.0);
    expect(lookupRateForMonth(table, '2001-01')).toBe(11.0);
  });

  it('returns null for a month before the table’s first period', () => {
    const table: EpfRateTable = { confirmedThrough: '2025-03', periods: [{ effectiveFrom: '2020-04', ratePct: 8.5 }] };
    expect(lookupRateForMonth(table, '2019-04')).toBeNull();
  });

  it('returns null (never extrapolates) for a month after confirmedThrough — "rate not yet available"', () => {
    const table: EpfRateTable = { confirmedThrough: '2025-03', periods: [{ effectiveFrom: '2023-04', ratePct: 8.25 }] };
    expect(lookupRateForMonth(table, '2025-04')).toBeNull();
    expect(lookupRateForMonth(table, '2026-04')).toBeNull();
  });

  it('the fallback table correctly resolves a known historical rate (FY2014-15, verified against a real passbook)', () => {
    expect(lookupRateForMonth(EPF_RATE_TABLE_FALLBACK, '2014-06')).toBe(8.75);
  });

  it('the fallback table’s periods are sorted ascending by effectiveFrom', () => {
    const froms = EPF_RATE_TABLE_FALLBACK.periods.map((p) => p.effectiveFrom);
    const sorted = [...froms].sort();
    expect(froms).toEqual(sorted);
  });
});
