import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPEN_ARM_DURATION_MS,
  getDefaultOpenCountdownLabel,
  getDefaultOpenCountdownUrgency,
  isDefaultOpenArmed
} from '@/lib/defaultOpenMode';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe('isDefaultOpenArmed', () => {
  it('is false when armedUntil is null/undefined', () => {
    expect(isDefaultOpenArmed(null)).toBe(false);
    expect(isDefaultOpenArmed(undefined)).toBe(false);
  });

  it('is true while armedUntil is still in the future', () => {
    const now = 1_000_000;
    expect(isDefaultOpenArmed(now + 1, now)).toBe(true);
  });

  it('is false once armedUntil has passed (including exactly now)', () => {
    const now = 1_000_000;
    expect(isDefaultOpenArmed(now, now)).toBe(false);
    expect(isDefaultOpenArmed(now - 1, now)).toBe(false);
  });
});

describe('getDefaultOpenCountdownUrgency', () => {
  const now = 0;

  it('is "days" while 24h or more remain', () => {
    expect(getDefaultOpenCountdownUrgency(now + DAY_MS, now)).toBe('days');
    expect(getDefaultOpenCountdownUrgency(now + 2 * DAY_MS, now)).toBe('days');
  });

  it('is "hours" once under 24h remain', () => {
    expect(getDefaultOpenCountdownUrgency(now + DAY_MS - 1, now)).toBe('hours');
    expect(getDefaultOpenCountdownUrgency(now + HOUR_MS, now)).toBe('hours');
  });
});

describe('getDefaultOpenCountdownLabel', () => {
  const now = 0;

  it('shows whole floored days while >=24h remain, singular/plural correctly', () => {
    expect(getDefaultOpenCountdownLabel(now + DEFAULT_OPEN_ARM_DURATION_MS, now)).toBe('3 days left');
    expect(getDefaultOpenCountdownLabel(now + 2 * DAY_MS + HOUR_MS, now)).toBe('2 days left');
    expect(getDefaultOpenCountdownLabel(now + DAY_MS, now)).toBe('1 day left');
  });

  it('switches to ceiled hours once under 24h remain, singular/plural correctly', () => {
    expect(getDefaultOpenCountdownLabel(now + DAY_MS - 1, now)).toBe('24 hours left');
    expect(getDefaultOpenCountdownLabel(now + 14 * HOUR_MS, now)).toBe('14 hours left');
    expect(getDefaultOpenCountdownLabel(now + HOUR_MS, now)).toBe('1 hour left');
  });

  it('never reports 0 hours left even as it approaches expiry', () => {
    expect(getDefaultOpenCountdownLabel(now + 1, now)).toBe('1 hour left');
    expect(getDefaultOpenCountdownLabel(now, now)).toBe('1 hour left');
  });
});
