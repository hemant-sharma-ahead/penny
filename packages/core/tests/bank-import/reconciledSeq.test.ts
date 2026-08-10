import { describe, expect, it } from 'vitest';
import {
  computeDaySequence,
  countOtherUnexplainedByDay,
  groupResolutionsByDay,
  type DayResolution
} from '@/core/bank-import/reconciledSeq';
import type { ParsedStatementRow } from '@/core/bank-import/types';
import type { Expense } from '@/core/db/types';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day).getTime();
const ACCOUNT = 'acc-1';

function row(overrides: Partial<ParsedStatementRow> = {}): ParsedStatementRow {
  return {
    rawNarration: 'UPI-SWIGGY-123',
    date: d(2026, 5, 8),
    amount: 450,
    direction: 'debit',
    rowIndex: 1,
    ...overrides
  };
}

function resolution(overrides: Partial<DayResolution> = {}): DayResolution {
  return { statementRow: row(), expenseId: 'e1', ...overrides };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e',
    amount: 0,
    categoryId: 'cat',
    description: '',
    date: d(2026, 5, 8),
    hashtags: [],
    isRecurring: false,
    type: 'expense',
    accountId: ACCOUNT,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  };
}

describe('computeDaySequence — day-completeness detection (docs/plans/bank-balance-sync.md §7 Stage 5)', () => {
  it('a day where every transaction is explained by the current import ⇒ fully explained, sequenced', () => {
    const result = computeDaySequence(
      [
        resolution({ statementRow: row({ rowIndex: 1 }), expenseId: 'atm' }),
        resolution({ statementRow: row({ rowIndex: 2 }), expenseId: 'refund' })
      ],
      0
    );
    expect(result.fullyExplained).toBe(true);
    expect(result.sequenceByExpenseId.size).toBe(2);
  });

  it('a day with one unexplained leftover transaction ⇒ not sequenced', () => {
    const result = computeDaySequence([resolution({ expenseId: 'atm' })], 1);
    expect(result.fullyExplained).toBe(false);
    expect(result.sequenceByExpenseId.size).toBe(0);
  });

  it('no resolutions at all for the day ⇒ not sequenced (nothing to sequence)', () => {
    const result = computeDaySequence([], 0);
    expect(result.fullyExplained).toBe(false);
    expect(result.sequenceByExpenseId.size).toBe(0);
  });
});

describe('computeDaySequence — sequence assignment matches statement row order', () => {
  it('assigns reconciledSeq by rowIndex order, not the order resolutions were passed in', () => {
    // Deliberately passed in the OPPOSITE of rowIndex order, and not date/insertion order either —
    // the §9 worked example: 09:14 ATM withdrawal (earlier in the day, higher rowIndex here on
    // purpose) vs. 18:40 UPI refund (later in the day). Only rowIndex should decide the outcome.
    const result = computeDaySequence(
      [
        resolution({ statementRow: row({ rowIndex: 5 }), expenseId: 'atm-withdrawal' }),
        resolution({ statementRow: row({ rowIndex: 2 }), expenseId: 'upi-refund' })
      ],
      0
    );
    expect(result.fullyExplained).toBe(true);
    expect(result.sequenceByExpenseId.get('upi-refund')).toBe(1); // lower rowIndex ⇒ first
    expect(result.sequenceByExpenseId.get('atm-withdrawal')).toBe(2);
  });

  it('assigns a dense 1..N sequence even when rowIndex values themselves are sparse', () => {
    const result = computeDaySequence(
      [
        resolution({ statementRow: row({ rowIndex: 40 }), expenseId: 'c' }),
        resolution({ statementRow: row({ rowIndex: 10 }), expenseId: 'a' }),
        resolution({ statementRow: row({ rowIndex: 25 }), expenseId: 'b' })
      ],
      0
    );
    expect(result.sequenceByExpenseId.get('a')).toBe(1);
    expect(result.sequenceByExpenseId.get('b')).toBe(2);
    expect(result.sequenceByExpenseId.get('c')).toBe(3);
  });
});

describe('groupResolutionsByDay', () => {
  it('groups by the statement row’s own date, not any other field', () => {
    const byDay = groupResolutionsByDay([
      resolution({ statementRow: row({ date: d(2026, 5, 8) }), expenseId: 'a' }),
      resolution({ statementRow: row({ date: d(2026, 5, 8) }), expenseId: 'b' }),
      resolution({ statementRow: row({ date: d(2026, 5, 9) }), expenseId: 'c' })
    ]);
    expect(byDay.size).toBe(2);
    expect(byDay.get('2026-05-08')?.map((r) => r.expenseId)).toEqual(['a', 'b']);
    expect(byDay.get('2026-05-09')?.map((r) => r.expenseId)).toEqual(['c']);
  });
});

describe('countOtherUnexplainedByDay', () => {
  it('counts an untouched expense on the account/day as a leftover', () => {
    const counts = countOtherUnexplainedByDay(
      ACCOUNT,
      [expense({ id: 'manual-1', date: d(2026, 5, 8) })],
      new Set(['atm', 'refund']) // this import's own resolved ids — doesn't include manual-1
    );
    expect(counts.get('2026-05-08')).toBe(1);
  });

  it('excludes an expense this import itself resolved', () => {
    const counts = countOtherUnexplainedByDay(ACCOUNT, [expense({ id: 'atm', date: d(2026, 5, 8) })], new Set(['atm']));
    expect(counts.get('2026-05-08')).toBeUndefined();
  });

  it('excludes an expense this same commit is deleting (a lone-wolf duplicate)', () => {
    const counts = countOtherUnexplainedByDay(
      ACCOUNT,
      [expense({ id: 'dup', date: d(2026, 5, 8) })],
      new Set(),
      new Set(['dup'])
    );
    expect(counts.get('2026-05-08')).toBeUndefined();
  });

  it('ignores an expense on a different account entirely', () => {
    const counts = countOtherUnexplainedByDay(
      ACCOUNT,
      [expense({ id: 'other-acct', accountId: 'acc-2', date: d(2026, 5, 8) })],
      new Set()
    );
    expect(counts.size).toBe(0);
  });
});

describe('Re-check-forward: a day unresolved by one import gets sequenced once a later import completes it', () => {
  it('import A leaves the day unsequenced (a manual leftover); import B (a fuller re-import) resolves it', () => {
    // Day: 3 real transactions — an ATM withdrawal and a UPI refund, both from the statement, plus a
    // manually-entered expense the first (partial) import never touched at all.
    const atm = resolution({ statementRow: row({ rowIndex: 1 }), expenseId: 'atm' });
    const refund = resolution({ statementRow: row({ rowIndex: 3 }), expenseId: 'refund' });
    const manual = expense({ id: 'manual-1', date: d(2026, 5, 8) });

    // --- Import A: only resolves atm + refund; `manual-1` is untouched, so it's a leftover. ---
    const resolvedByA = new Set(['atm', 'refund']);
    const otherByDayA = countOtherUnexplainedByDay(ACCOUNT, [manual], resolvedByA);
    const dayResultA = computeDaySequence([atm, refund], otherByDayA.get('2026-05-08') ?? 0);
    expect(dayResultA.fullyExplained).toBe(false);
    expect(dayResultA.sequenceByExpenseId.size).toBe(0);

    // --- Import B: a fuller re-import whose own rows now ALSO explain `manual-1` (matched this time)
    // — the day's full set (atm, refund, manual-1) is resolved entirely by B's own rows. ---
    const manualResolvedByB = resolution({ statementRow: row({ rowIndex: 2 }), expenseId: 'manual-1' });
    const resolvedByB = [atm, refund, manualResolvedByB];
    const resolvedIdsB = new Set(resolvedByB.map((r) => r.expenseId));
    const otherByDayB = countOtherUnexplainedByDay(ACCOUNT, [manual], resolvedIdsB);
    const dayResultB = computeDaySequence(resolvedByB, otherByDayB.get('2026-05-08') ?? 0);

    expect(dayResultB.fullyExplained).toBe(true);
    expect(dayResultB.sequenceByExpenseId.get('atm')).toBe(1); // rowIndex 1
    expect(dayResultB.sequenceByExpenseId.get('manual-1')).toBe(2); // rowIndex 2
    expect(dayResultB.sequenceByExpenseId.get('refund')).toBe(3); // rowIndex 3
  });
});
