import { describe, expect, it } from 'vitest';
import { toAnnual, toMonthly, nextRenewal, isDormant } from '@/core/subscriptions/format';

const DAY = 86_400_000;
const NOW = new Date('2026-06-26T10:00:00').getTime();

describe('subscription cost helpers', () => {
  it('annualises and monthlises by interval', () => {
    expect(Math.round(toAnnual(649, 30))).toBe(7896); // 649/30*365
    expect(Math.round(toMonthly(1200, 365))).toBe(99); // 1200/365*30
  });
});

describe('nextRenewal', () => {
  it('projects the next charge at/after today from the last charge', () => {
    const next = nextRenewal({ intervalDays: 30, lastChargedAt: NOW - 33 * DAY }, NOW);
    // last charge 33d ago, +30d = 3d ago (past) → +30 again = 27d out
    expect(next).not.toBeNull();
    expect(next! > NOW).toBe(true);
  });

  it('returns null without a last charge', () => {
    expect(nextRenewal({ intervalDays: 30 }, NOW)).toBeNull();
  });
});

describe('isDormant', () => {
  it('flags subs not charged in 2+ intervals', () => {
    expect(isDormant({ intervalDays: 30, lastChargedAt: NOW - 70 * DAY }, NOW)).toBe(true);
    expect(isDormant({ intervalDays: 30, lastChargedAt: NOW - 20 * DAY }, NOW)).toBe(false);
    expect(isDormant({ intervalDays: 30 }, NOW)).toBe(false);
  });
});
