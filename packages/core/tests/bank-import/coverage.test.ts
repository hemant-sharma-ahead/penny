import { describe, expect, it } from 'vitest';
import {
  computeVerifiedThroughDate,
  countSkippedRows,
  detectCoverageGap,
  findStandingCoverageGaps,
  findUnverifiedTailExpenses,
  mergeCoveredRanges
} from '@/core/bank-import/coverage';
import type { BankStatementImportRecord, Expense } from '@/core/db/types';

const DAY_MS = 86_400_000;
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day).getTime();
const ACCOUNT = 'acc-1';

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    amount: 450,
    categoryId: 'food',
    description: 'Swiggy dinner',
    date: d(2026, 4, 10),
    hashtags: [],
    isRecurring: false,
    type: 'expense',
    accountId: ACCOUNT,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  };
}

function importRecord(overrides: Partial<BankStatementImportRecord> = {}): BankStatementImportRecord {
  return {
    id: 'r1',
    batchId: 'batch-1',
    accountId: ACCOUNT,
    rawNarration: 'UPI-SWIGGY-123',
    normalizedKey: 'SWIGGY',
    date: d(2026, 4, 10),
    amount: 450,
    type: 'expense',
    linkedTxnId: 'e1',
    createdAt: 0,
    ...overrides
  };
}

describe('detectCoverageGap', () => {
  it('reports no gap when a new range picks up exactly where the last one ended (adjacent, next day)', () => {
    const existing = [{ start: d(2026, 5, 1), end: d(2026, 5, 31) }];
    const gap = detectCoverageGap({ start: d(2026, 6, 1), end: d(2026, 6, 30) }, existing);
    expect(gap).toBeNull();
  });

  it('reports the exact boundary dates for a real gap (§11b: last ended 15-Mar, next starts 1-Apr — gap is 16–31 Mar)', () => {
    const existing = [{ start: d(2026, 3, 1), end: d(2026, 3, 15) }];
    const gap = detectCoverageGap({ start: d(2026, 4, 1), end: d(2026, 4, 30) }, existing);
    expect(gap).not.toBeNull();
    expect(gap?.gapStart).toBe(d(2026, 3, 16));
    expect(gap?.gapEnd).toBe(d(2026, 3, 31));
  });

  it('reports no gap for an overlapping range (§15: overlap is never treated as an error)', () => {
    const existing = [{ start: d(2026, 4, 1), end: d(2026, 4, 30) }];
    // New range starts mid-way through the existing one.
    const gap = detectCoverageGap({ start: d(2026, 4, 15), end: d(2026, 5, 15) }, existing);
    expect(gap).toBeNull();
  });

  it('reports no gap on the very first import (no existing ranges to compare against)', () => {
    const gap = detectCoverageGap({ start: d(2026, 4, 1), end: d(2026, 4, 30) }, []);
    expect(gap).toBeNull();
  });

  it('picks the closest prior range when several exist, not just the first one', () => {
    const existing = [
      { start: d(2026, 1, 1), end: d(2026, 1, 31) },
      { start: d(2026, 3, 1), end: d(2026, 3, 15) }
    ];
    const gap = detectCoverageGap({ start: d(2026, 4, 1), end: d(2026, 4, 30) }, existing);
    expect(gap?.gapStart).toBe(d(2026, 3, 16));
    expect(gap?.gapEnd).toBe(d(2026, 3, 31));
  });

  it('is robust to incidental time-of-day noise on an adjacent boundary', () => {
    const existing = [{ start: d(2026, 5, 1), end: d(2026, 5, 31) + 23 * 60 * 60 * 1000 }];
    const gap = detectCoverageGap({ start: d(2026, 6, 1) + DAY_MS / 48, end: d(2026, 6, 5) }, existing);
    expect(gap).toBeNull();
  });
});

describe('countSkippedRows', () => {
  it('records N-M as skipped for a batch with N seen / M added', () => {
    expect(countSkippedRows(15, 9, 4)).toBe(2); // matched 9 + added 4 of 15 seen → 2 skipped
  });

  it('is zero when every row was handled', () => {
    expect(countSkippedRows(10, 6, 4)).toBe(0);
  });

  it('never goes negative even if the tallies overcount', () => {
    expect(countSkippedRows(5, 4, 4)).toBe(0);
  });
});

describe('mergeCoveredRanges', () => {
  it('merges two overlapping ranges into one', () => {
    const merged = mergeCoveredRanges([
      { start: d(2026, 4, 1), end: d(2026, 4, 20) },
      { start: d(2026, 4, 10), end: d(2026, 4, 30) }
    ]);
    expect(merged).toEqual([{ start: d(2026, 4, 1), end: d(2026, 4, 30) }]);
  });

  it('leaves two genuinely separate ranges apart', () => {
    const merged = mergeCoveredRanges([
      { start: d(2026, 4, 1), end: d(2026, 4, 10) },
      { start: d(2026, 5, 1), end: d(2026, 5, 10) }
    ]);
    expect(merged).toHaveLength(2);
  });

  it('is order-independent', () => {
    const merged = mergeCoveredRanges([
      { start: d(2026, 5, 1), end: d(2026, 5, 10) },
      { start: d(2026, 4, 1), end: d(2026, 4, 10) }
    ]);
    expect(merged[0]?.start).toBe(d(2026, 4, 1));
    expect(merged[1]?.start).toBe(d(2026, 5, 1));
  });
});

describe('findStandingCoverageGaps (docs/plans/bank-balance-sync.md §3 decision #16)', () => {
  it('flags an expense inside a covered range with no import-record link', () => {
    const gaps = findStandingCoverageGaps(
      [{ start: d(2026, 4, 1), end: d(2026, 4, 30) }],
      [expense({ id: 'e1' })],
      [] // no import record links it at all
    );
    expect(gaps.map((e) => e.id)).toEqual(['e1']);
  });

  it('does not flag an expense a linkedTxnId points at', () => {
    const gaps = findStandingCoverageGaps(
      [{ start: d(2026, 4, 1), end: d(2026, 4, 30) }],
      [expense({ id: 'e1' })],
      [importRecord({ linkedTxnId: 'e1' })]
    );
    expect(gaps).toHaveLength(0);
  });

  it('does not flag an expense outside any covered range — nothing claims to explain it', () => {
    const gaps = findStandingCoverageGaps(
      [{ start: d(2026, 4, 1), end: d(2026, 4, 30) }],
      [expense({ id: 'e1', date: d(2026, 6, 15) })],
      []
    );
    expect(gaps).toHaveLength(0);
  });

  it('correctly merges/dedupes overlapping covered ranges at the seam — no double-flag, no miss', () => {
    // Two overlapping batches (e.g. a re-import) together cover 1–30 Apr continuously. An expense
    // sitting exactly at the overlap seam (15 Apr, inside both individual ranges) must be evaluated
    // exactly once, and an expense just past where a naive first-range-only check might miss it
    // (25 Apr, only inside the second range) must still be caught.
    const ranges = [
      { start: d(2026, 4, 1), end: d(2026, 4, 20) },
      { start: d(2026, 4, 10), end: d(2026, 4, 30) }
    ];
    const gaps = findStandingCoverageGaps(
      ranges,
      [expense({ id: 'seam', date: d(2026, 4, 15) }), expense({ id: 'late', date: d(2026, 4, 25) })],
      []
    );
    expect(gaps.map((e) => e.id).sort()).toEqual(['late', 'seam']);
  });

  it('returns nothing when the account has no covered ranges at all', () => {
    const gaps = findStandingCoverageGaps([], [expense()], []);
    expect(gaps).toHaveLength(0);
  });
});

describe('computeVerifiedThroughDate', () => {
  it('returns the latest end across the covered ranges', () => {
    const ranges = [
      { start: d(2026, 1, 1), end: d(2026, 1, 31) },
      { start: d(2026, 3, 1), end: d(2026, 3, 15) }
    ];
    expect(computeVerifiedThroughDate(ranges)).toBe(d(2026, 3, 15));
  });

  it('is undefined when there are no covered ranges (never imported)', () => {
    expect(computeVerifiedThroughDate([])).toBeUndefined();
  });
});

describe('findUnverifiedTailExpenses (mobile punch-list item 4b)', () => {
  it('flags an expense dated after the covered ranges union end', () => {
    const tails = findUnverifiedTailExpenses(
      [{ start: d(2026, 4, 1), end: d(2026, 4, 30) }],
      [expense({ id: 'e1', date: d(2026, 5, 5) })],
      []
    );
    expect(tails.map((e) => e.id)).toEqual(['e1']);
  });

  it('does not flag an expense dated on or before the covered ranges union end', () => {
    const tails = findUnverifiedTailExpenses(
      [{ start: d(2026, 4, 1), end: d(2026, 4, 30) }],
      [expense({ id: 'e1', date: d(2026, 4, 30) }), expense({ id: 'e2', date: d(2026, 4, 15) })],
      []
    );
    expect(tails).toHaveLength(0);
  });

  it('does not flag an expense a linkedTxnId already points at, even if dated after the union end', () => {
    const tails = findUnverifiedTailExpenses(
      [{ start: d(2026, 4, 1), end: d(2026, 4, 30) }],
      [expense({ id: 'e1', date: d(2026, 5, 5) })],
      [importRecord({ linkedTxnId: 'e1' })]
    );
    expect(tails).toHaveLength(0);
  });

  it('uses the merged union end, not any single individual ranges end', () => {
    // Two overlapping ranges together cover through 30 Apr; an expense on 2 May must be flagged, even
    // though the SECOND range alone (ending 20 Apr) would have made it look further past its own end.
    const ranges = [
      { start: d(2026, 4, 1), end: d(2026, 4, 30) },
      { start: d(2026, 4, 10), end: d(2026, 4, 20) }
    ];
    const tails = findUnverifiedTailExpenses(ranges, [expense({ id: 'e1', date: d(2026, 5, 2) })], []);
    expect(tails.map((e) => e.id)).toEqual(['e1']);
  });

  it('returns nothing when the account has never had a statement imported at all', () => {
    const tails = findUnverifiedTailExpenses([], [expense({ date: d(2026, 12, 31) })], []);
    expect(tails).toHaveLength(0);
  });
});
