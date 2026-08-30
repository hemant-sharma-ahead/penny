import { describe, expect, it } from 'vitest';
import {
  lookupBasicToGrossPctForMonth,
  EPF_BASIC_TO_GROSS_TABLE_FALLBACK
} from '@/core/portfolio/epfBasicToGrossRates';

// Real reported bug this covers (2026-08-30): a hike-journey point's CTC/Gross estimate always used
// ONE flat ratio regardless of which year it happened in — a real Nov 2014 hike came out meaningfully
// lower than the actual CTC because the pre-labour-code convention (~40%) is different from the
// current default (50%, only correct from the Code on Wages 2019's floor taking effect onward).
describe('lookupBasicToGrossPctForMonth', () => {
  it('returns the pre-labour-code convention for a month well before the floor took effect', () => {
    expect(lookupBasicToGrossPctForMonth(EPF_BASIC_TO_GROSS_TABLE_FALLBACK, '2014-11')).toBe(40);
  });

  it('returns the 50% floor for a month after the Code on Wages effective date', () => {
    expect(lookupBasicToGrossPctForMonth(EPF_BASIC_TO_GROSS_TABLE_FALLBACK, '2026-01')).toBe(50);
  });

  it('returns the exact boundary month correctly', () => {
    expect(lookupBasicToGrossPctForMonth(EPF_BASIC_TO_GROSS_TABLE_FALLBACK, '2025-11')).toBe(50);
    expect(lookupBasicToGrossPctForMonth(EPF_BASIC_TO_GROSS_TABLE_FALLBACK, '2025-10')).toBe(40);
  });

  it('falls back to the first period for a month before the table even starts', () => {
    expect(lookupBasicToGrossPctForMonth(EPF_BASIC_TO_GROSS_TABLE_FALLBACK, '1970-01')).toBe(40);
  });

  it('never returns null/undefined — always some usable default, unlike an EPF interest rate lookup', () => {
    const result = lookupBasicToGrossPctForMonth({ periods: [] }, '2020-01');
    expect(typeof result).toBe('number');
  });
});
