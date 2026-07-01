import { describe, expect, it } from 'vitest';
import {
  decideVahan,
  inWorkingWindow,
  canSpend,
  istParts,
  normalizeReg,
  nextWindowStartMs,
  VAHAN_DAILY_BUDGET,
  CALLS_PER_FETCH
} from '../../workers/api-proxy/src/lib/vahan';

// A timestamp at a known IST hour. 2026-06-27 04:30 UTC = 10:00 IST (inside the morning window).
const IN_WINDOW = Date.UTC(2026, 5, 27, 4, 30); // 10:00 IST
const OUT_WINDOW = Date.UTC(2026, 5, 27, 18, 0); // 23:30 IST

describe('istParts / inWorkingWindow', () => {
  it('converts UTC to the IST hour + day key', () => {
    expect(istParts(IN_WINDOW)).toEqual({ hour: 10, dayKey: '2026-06-27' });
  });

  it('rolls the day key forward when IST crosses midnight', () => {
    // 2026-06-27 20:00 UTC = 2026-06-28 01:30 IST
    expect(istParts(Date.UTC(2026, 5, 27, 20, 0)).dayKey).toBe('2026-06-28');
  });

  it('is true only inside 06:00–12:00 IST', () => {
    expect(inWorkingWindow(IN_WINDOW)).toBe(true);
    expect(inWorkingWindow(OUT_WINDOW)).toBe(false);
  });
});

describe('canSpend', () => {
  it('leaves room for a full fetch (2 calls) under the budget', () => {
    expect(canSpend(0)).toBe(true);
    expect(canSpend(VAHAN_DAILY_BUDGET - CALLS_PER_FETCH)).toBe(true);
    expect(canSpend(VAHAN_DAILY_BUDGET - 1)).toBe(false);
    expect(canSpend(VAHAN_DAILY_BUDGET)).toBe(false);
  });
});

describe('decideVahan', () => {
  it('serves cache when present and not a forced refresh', () => {
    expect(decideVahan({ cached: true, refresh: false, budgetUsed: 0, nowMs: OUT_WINDOW })).toBe('serve_cache');
  });

  it('fetches now when in-window with budget (even if cached, on refresh)', () => {
    expect(decideVahan({ cached: false, refresh: false, budgetUsed: 0, nowMs: IN_WINDOW })).toBe('fetch_now');
    expect(decideVahan({ cached: true, refresh: true, budgetUsed: 0, nowMs: IN_WINDOW })).toBe('fetch_now');
  });

  it('queues outside the window or when the budget is exhausted', () => {
    expect(decideVahan({ cached: false, refresh: false, budgetUsed: 0, nowMs: OUT_WINDOW })).toBe('queue');
    expect(decideVahan({ cached: false, refresh: false, budgetUsed: VAHAN_DAILY_BUDGET, nowMs: IN_WINDOW })).toBe(
      'queue'
    );
  });
});

describe('normalizeReg', () => {
  it('uppercases and strips spaces', () => {
    expect(normalizeReg(' ka03 mn 5678 ')).toBe('KA03MN5678');
  });
});

describe('nextWindowStartMs', () => {
  it('returns a future 06:00 IST', () => {
    const next = nextWindowStartMs(OUT_WINDOW);
    expect(next).toBeGreaterThan(OUT_WINDOW);
    expect(istParts(next).hour).toBe(6);
  });

  it('jumps to tomorrow when already past today’s window start', () => {
    const next = nextWindowStartMs(IN_WINDOW); // 10:00 IST → already past 06:00
    expect(istParts(next).hour).toBe(6);
    expect(next).toBeGreaterThan(IN_WINDOW);
  });
});
