import { describe, expect, it } from 'vitest';
import { buildLedgerRows, buildSkippedRowFingerprint } from '@/core/bank-import/ledger';
import { normalizeNarration } from '@/core/bank-import/normalization';
import type { BankStatementImportRecord, Expense, ImportBatchSummary } from '@/core/db/types';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day).getTime();
const ACCOUNT = 'acc-1';
const OTHER_ACCOUNT = 'acc-2';
const OPENING = 20_000;
const WINDOW_START = d(2026, 4, 1);
const WINDOW_END = d(2026, 5, 31);

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e',
    amount: 0,
    categoryId: 'cat',
    description: '',
    date: d(2026, 4, 1),
    hashtags: [],
    isRecurring: false,
    type: 'expense',
    accountId: ACCOUNT,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  };
}

function record(overrides: Partial<BankStatementImportRecord> = {}): BankStatementImportRecord {
  return {
    id: 'r',
    batchId: 'batch-1',
    accountId: ACCOUNT,
    rawNarration: 'NARRATION',
    normalizedKey: 'NARRATION',
    date: d(2026, 4, 1),
    amount: 0,
    type: 'expense',
    linkedTxnId: 'e',
    createdAt: 0,
    ...overrides
  };
}

function batch(overrides: Partial<ImportBatchSummary> = {}): ImportBatchSummary {
  return {
    batchId: 'batch-1',
    start: d(2026, 4, 1),
    end: d(2026, 5, 31),
    importedAt: 0,
    fileName: 'statement.csv',
    matchedCount: 0,
    addedCount: 0,
    skippedCount: 0,
    skippedRows: [],
    ...overrides
  };
}

describe('buildLedgerRows — matched rows', () => {
  it('pairs a linked expense with its import record and computes the running balance', () => {
    const txn = expense({ id: 'e1', type: 'income', amount: 35_000, date: d(2026, 4, 5) });
    const rec = record({
      id: 'r1',
      linkedTxnId: 'e1',
      rawNarration: 'SALARY-ACME',
      amount: 35_000,
      date: d(2026, 4, 5)
    });
    const rows = buildLedgerRows({
      accountId: ACCOUNT,
      openingBalance: OPENING,
      accountTxns: [txn],
      importRecords: [rec],
      batches: [],
      dismissedFingerprints: new Set(),
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('matched');
    expect(rows[0]?.statement?.rawNarration).toBe('SALARY-ACME');
    expect(rows[0]?.statement?.amount).toBe(35_000);
    expect(rows[0]?.expense?.amount).toBe(35_000);
    expect(rows[0]?.computedBalance).toBe(55_000);
  });

  it('labels a transfer leg with the other account id', () => {
    const txn = expense({
      id: 'e1',
      type: 'transfer',
      amount: 5_000,
      accountId: ACCOUNT,
      toAccountId: OTHER_ACCOUNT,
      date: d(2026, 4, 10)
    });
    const rec = record({ id: 'r1', linkedTxnId: 'e1', amount: 5_000, date: d(2026, 4, 10) });
    const rows = buildLedgerRows({
      accountId: ACCOUNT,
      openingBalance: OPENING,
      accountTxns: [txn],
      importRecords: [rec],
      batches: [],
      dismissedFingerprints: new Set(),
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END
    });

    expect(rows[0]?.expense?.isTransfer).toBe(true);
    expect(rows[0]?.expense?.otherAccountId).toBe(OTHER_ACCOUNT);
    expect(rows[0]?.expense?.amount).toBe(-5_000);
  });
});

describe('buildLedgerRows — expense-only classification', () => {
  it('classifies an unlinked expense inside a covered range as a genuine anomaly', () => {
    const txn = expense({ id: 'e1', amount: 1_200, date: d(2026, 4, 18) });
    const rows = buildLedgerRows({
      accountId: ACCOUNT,
      openingBalance: OPENING,
      accountTxns: [txn],
      importRecords: [],
      batches: [batch({ start: d(2026, 4, 1), end: d(2026, 4, 30) })],
      dismissedFingerprints: new Set(),
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END
    });

    expect(rows[0]?.kind).toBe('anomaly');
    expect(rows[0]?.statement).toBeUndefined();
  });

  it('classifies an unlinked expense outside any covered range as not-covered, not an anomaly', () => {
    const txn = expense({ id: 'e1', amount: 800, date: d(2026, 5, 26) });
    const rows = buildLedgerRows({
      accountId: ACCOUNT,
      openingBalance: OPENING,
      accountTxns: [txn],
      importRecords: [],
      batches: [batch({ start: d(2026, 4, 1), end: d(2026, 4, 30) })], // only covers April
      dismissedFingerprints: new Set(),
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END
    });

    expect(rows[0]?.kind).toBe('not-covered');
  });
});

describe('buildLedgerRows — skipped rows', () => {
  const skippedBatch = batch({
    skippedRows: [{ rawNarration: 'NEFT-XXCREDIT-UNKNOWN', date: d(2026, 4, 14), amount: 2_000, direction: 'credit' }]
  });

  it('shows a still-unresolved skipped row with a signed amount and a dismiss key', () => {
    const rows = buildLedgerRows({
      accountId: ACCOUNT,
      openingBalance: OPENING,
      accountTxns: [],
      importRecords: [],
      batches: [skippedBatch],
      dismissedFingerprints: new Set(),
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('skipped-unresolved');
    expect(rows[0]?.statement?.amount).toBe(2_000);
    expect(rows[0]?.expense).toBeUndefined();
    expect(rows[0]?.computedBalance).toBeUndefined();
    expect(rows[0]?.dismissKey).toBeDefined();
  });

  it('a debit-direction skipped row renders a negative signed amount', () => {
    const debitBatch = batch({
      skippedRows: [{ rawNarration: 'ATM WDL', date: d(2026, 4, 14), amount: 500, direction: 'debit' }]
    });
    const rows = buildLedgerRows({
      accountId: ACCOUNT,
      openingBalance: OPENING,
      accountTxns: [],
      importRecords: [],
      batches: [debitBatch],
      dismissedFingerprints: new Set(),
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END
    });

    expect(rows[0]?.statement?.amount).toBe(-500);
  });

  it('drops a skipped row once a LATER import (any batch) resolves the same narration/date/amount', () => {
    const laterRecord = record({
      id: 'r-resolved',
      batchId: 'batch-2',
      linkedTxnId: 'e-resolved',
      rawNarration: 'NEFT-XXCREDIT-UNKNOWN',
      // Must be the SAME normalization the skipped-row sweep itself recomputes live from
      // `rawNarration` — a real `BankStatementImportRecord` always has this in sync by construction
      // (both are written from the same `useBankImport.ts` commit step), so the test mirrors that.
      normalizedKey: normalizeNarration('NEFT-XXCREDIT-UNKNOWN'),
      date: d(2026, 4, 14),
      amount: 2_000
    });
    const resolvedExpense = expense({ id: 'e-resolved', type: 'income', amount: 2_000, date: d(2026, 4, 14) });

    const rows = buildLedgerRows({
      accountId: ACCOUNT,
      openingBalance: OPENING,
      accountTxns: [resolvedExpense],
      importRecords: [laterRecord],
      batches: [skippedBatch],
      dismissedFingerprints: new Set(),
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END
    });

    // Only the matched row should show — the stale 'skipped-unresolved' entry from the earlier batch's
    // own historical snapshot is correctly suppressed, not duplicated alongside the real match.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('matched');
  });

  it('drops a dismissed skipped row entirely, regardless of resolution', () => {
    const fingerprint = buildSkippedRowFingerprint('batch-1', 'NEFT-XXCREDIT-UNKNOWN', d(2026, 4, 14), 2_000);
    const rows = buildLedgerRows({
      accountId: ACCOUNT,
      openingBalance: OPENING,
      accountTxns: [],
      importRecords: [],
      batches: [skippedBatch],
      dismissedFingerprints: new Set([fingerprint]),
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END
    });

    expect(rows).toHaveLength(0);
  });

  it('treats a missing `direction` (a batch committed before this field existed) as a neutral positive', () => {
    const legacyBatch = batch({
      skippedRows: [{ rawNarration: 'OLD ROW', date: d(2026, 4, 14), amount: 300 }]
    });
    const rows = buildLedgerRows({
      accountId: ACCOUNT,
      openingBalance: OPENING,
      accountTxns: [],
      importRecords: [],
      batches: [legacyBatch],
      dismissedFingerprints: new Set(),
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END
    });

    expect(rows[0]?.statement?.amount).toBe(300);
  });
});

describe('buildLedgerRows — windowing', () => {
  it('excludes rows outside the window but still folds their balance effect into later rows', () => {
    const before = expense({ id: 'e0', type: 'income', amount: 10_000, date: d(2026, 3, 1) });
    const inWindow = expense({ id: 'e1', amount: 500, date: d(2026, 4, 10) });
    const rec = record({ id: 'r1', linkedTxnId: 'e1', amount: 500, date: d(2026, 4, 10) });

    const rows = buildLedgerRows({
      accountId: ACCOUNT,
      openingBalance: OPENING,
      accountTxns: [before, inWindow],
      importRecords: [rec],
      batches: [],
      dismissedFingerprints: new Set(),
      windowStart: WINDOW_START, // 1 Apr — excludes the 1 Mar salary row itself
      windowEnd: WINDOW_END
    });

    expect(rows).toHaveLength(1);
    // 20,000 opening + 10,000 (out-of-window salary, still folded in) - 500 = 29,500
    expect(rows[0]?.computedBalance).toBe(29_500);
  });
});

describe('buildLedgerRows — ordering', () => {
  it('sorts a mix of matched, anomaly, and skipped rows into date order', () => {
    const early = expense({ id: 'e1', amount: 100, date: d(2026, 4, 5) }); // anomaly, unlinked
    const mid = expense({ id: 'e2', amount: 200, date: d(2026, 4, 15) });
    const midRecord = record({ id: 'r2', linkedTxnId: 'e2', amount: 200, date: d(2026, 4, 15) });
    const lateSkipped = batch({
      skippedRows: [{ rawNarration: 'LATE ROW', date: d(2026, 4, 25), amount: 50, direction: 'debit' }]
    });

    const rows = buildLedgerRows({
      accountId: ACCOUNT,
      openingBalance: OPENING,
      accountTxns: [early, mid],
      importRecords: [midRecord],
      batches: [lateSkipped],
      dismissedFingerprints: new Set(),
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END
    });

    expect(rows.map((r) => r.date)).toEqual([d(2026, 4, 5), d(2026, 4, 15), d(2026, 4, 25)]);
    expect(rows.map((r) => r.kind)).toEqual(['anomaly', 'matched', 'skipped-unresolved']);
  });
});
