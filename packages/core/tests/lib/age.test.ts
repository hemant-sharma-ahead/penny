import { describe, expect, it } from 'vitest';
import { deriveAge, deriveAgeBand } from '@/lib/date';

// Fixed "now" so the tests are deterministic: 2026-06-25.
const NOW = new Date('2026-06-25T12:00:00Z').getTime();

describe('deriveAge', () => {
  it('computes whole years', () => {
    expect(deriveAge('1990-06-25', NOW)).toBe(36); // birthday today
    expect(deriveAge('1990-01-01', NOW)).toBe(36); // birthday earlier this year
  });

  it('subtracts a year when the birthday has not happened yet', () => {
    expect(deriveAge('1990-12-31', NOW)).toBe(35);
    expect(deriveAge('1990-06-26', NOW)).toBe(35); // tomorrow
  });

  it('returns null for unparseable or implausible dates', () => {
    expect(deriveAge('not-a-date', NOW)).toBeNull();
    expect(deriveAge('2030-01-01', NOW)).toBeNull(); // future → negative age
  });
});

describe('deriveAgeBand', () => {
  it('buckets age into 5-year bands', () => {
    expect(deriveAgeBand('1990-01-01', NOW)).toBe('35–39'); // age 36
    expect(deriveAgeBand('1996-01-01', NOW)).toBe('30–34'); // age 30
    expect(deriveAgeBand('2005-01-01', NOW)).toBe('20–24'); // age 21
  });

  it('returns null for unparseable dates', () => {
    expect(deriveAgeBand('', NOW)).toBeNull();
  });
});
