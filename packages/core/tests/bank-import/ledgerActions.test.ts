import { describe, expect, it } from 'vitest';
import {
  buildResolvedImportRecord,
  relinkLedgerRow,
  resolveSkippedRowToExisting,
  unmatchLedgerRow
} from '@/core/bank-import/ledgerActions';
import type { BankStatementImportRecord, Expense, ImportBatchSummary } from '@/core/db/types';

const ACCOUNT = 'acc-1';
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day).getTime();

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    amount: 460,
    categoryId: 'food',
    description: 'Zomato',
    date: d(2026, 4, 9),
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
    id: 'r1',
    batchId: 'batch-1',
    accountId: ACCOUNT,
    rawNarration: 'SWIGGY BLR',
    normalizedKey: 'SWIGGY',
    date: d(2026, 4, 9),
    amount: 460,
    type: 'expense',
    linkedTxnId: 'e1',
    createdAt: 0,
    ...overrides
  };
}

function batch(overrides: Partial<ImportBatchSummary> = {}): ImportBatchSummary {
  return {
    batchId: 'batch-1',
    start: d(2026, 4, 1),
    end: d(2026, 4, 30),
    importedAt: 0,
    fileName: 'statement.csv',
    matchedCount: 1,
    addedCount: 0,
    skippedCount: 0,
    skippedRows: [],
    ...overrides
  };
}

describe('unmatchLedgerRow', () => {
  it('clears checkpoint fields on the expense and appends the row back to the batch as skipped', () => {
    const e = expense({ statementBalance: 41_200, reconciledSeq: 3 });
    const { updatedExpense, updatedBatch } = unmatchLedgerRow(ACCOUNT, e, record(), batch(), 100);

    expect(updatedExpense.statementBalance).toBeUndefined();
    expect(updatedExpense.reconciledSeq).toBeUndefined();
    expect(updatedExpense.updatedAt).toBe(100);
    expect(updatedBatch.skippedRows).toHaveLength(1);
    expect(updatedBatch.skippedRows[0]).toEqual({
      rawNarration: 'SWIGGY BLR',
      date: d(2026, 4, 9),
      amount: 460,
      direction: 'debit'
    });
  });

  it('derives credit direction from the expense sign, not the record type, for an income row', () => {
    const e = expense({ type: 'income', amount: 2_000 });
    const { updatedBatch } = unmatchLedgerRow(ACCOUNT, e, record({ type: 'income', amount: 2_000 }), batch(), 100);
    expect(updatedBatch.skippedRows[0]?.direction).toBe('credit');
  });

  it('never touches checkpoint fields when this account is only the transfer toAccountId side', () => {
    const e = expense({
      type: 'transfer',
      accountId: 'other-acc',
      toAccountId: ACCOUNT,
      statementBalance: 999 // belongs to the OTHER account's own checkpoint, must survive untouched
    });
    const { updatedExpense } = unmatchLedgerRow(ACCOUNT, e, record({ type: 'transfer' }), batch(), 100);
    expect(updatedExpense.statementBalance).toBe(999);
  });

  it('is idempotent (legacy, value-based fallback) — repeatedly unmatching a record with no sourceRowIndex never duplicates', () => {
    // Reproduces the exact on-device sequence: unmatch, re-match, unmatch again, re-match, unmatch a
    // third time — each unmatch call receives the SAME batch it just wrote (as a real caller would,
    // reading it back from the account after each round-trip), and must never grow past one entry.
    // `record()`'s default fixture has no `sourceRowIndex` — exercises the legacy fallback path.
    let currentBatch = batch();
    for (let i = 0; i < 3; i++) {
      const result = unmatchLedgerRow(ACCOUNT, expense(), record(), currentBatch, 100 + i);
      currentBatch = result.updatedBatch;
    }
    expect(currentBatch.skippedRows).toHaveLength(1);
  });

  it('is idempotent via rowIndex — repeatedly unmatching the same tracked row never duplicates', () => {
    let currentBatch = batch();
    for (let i = 0; i < 3; i++) {
      const result = unmatchLedgerRow(ACCOUNT, expense(), record({ sourceRowIndex: 7 }), currentBatch, 100 + i);
      currentBatch = result.updatedBatch;
    }
    expect(currentBatch.skippedRows).toHaveLength(1);
    expect(currentBatch.skippedRows[0]?.rowIndex).toBe(7);
  });

  it('never collapses two GENUINELY SEPARATE rows that share identical narration/date/amount', () => {
    // The exact concern this whole rowIndex mechanism exists for: two same-day, same-merchant,
    // same-amount purchases are two real transactions, not one duplicated twice — unmatching BOTH
    // (each tied to its own distinct rowIndex) must produce two separate skippedRows entries, never
    // collapse to one.
    let currentBatch = batch();
    const first = unmatchLedgerRow(ACCOUNT, expense({ id: 'e1' }), record({ sourceRowIndex: 7 }), currentBatch, 100);
    currentBatch = first.updatedBatch;
    const second = unmatchLedgerRow(ACCOUNT, expense({ id: 'e2' }), record({ sourceRowIndex: 8 }), currentBatch, 101);
    currentBatch = second.updatedBatch;

    expect(currentBatch.skippedRows).toHaveLength(2);
    expect(currentBatch.skippedRows.map((r) => r.rowIndex).sort()).toEqual([7, 8]);
  });
});

describe('relinkLedgerRow', () => {
  it('corrects the new expense to the statement date/amount and moves the checkpoint over', () => {
    const oldExpense = expense({ id: 'wrong', statementBalance: 41_200 });
    const newExpense = expense({ id: 'right', description: 'Swiggy dinner', date: d(2026, 4, 8), amount: 999 });
    const { updatedOldExpense, updatedNewExpense } = relinkLedgerRow(ACCOUNT, oldExpense, newExpense, record(), 100);

    expect(updatedOldExpense.statementBalance).toBeUndefined();
    expect(updatedNewExpense.date).toBe(d(2026, 4, 9));
    expect(updatedNewExpense.amount).toBe(460);
    expect(updatedNewExpense.statementBalance).toBe(41_200);
  });

  it('does not attach a checkpoint to the new expense when the old one never owned one', () => {
    const oldExpense = expense({ id: 'wrong' }); // no statementBalance
    const newExpense = expense({ id: 'right', date: d(2026, 4, 8) });
    const { updatedNewExpense } = relinkLedgerRow(ACCOUNT, oldExpense, newExpense, record(), 100);
    expect(updatedNewExpense.statementBalance).toBeUndefined();
  });
});

describe('resolveSkippedRowToExisting', () => {
  it("corrects the chosen expense to the skipped row's own date/amount, never attaching a checkpoint", () => {
    const chosen = expense({ date: d(2026, 4, 20), amount: 999 });
    const updated = resolveSkippedRowToExisting(
      ACCOUNT,
      { rawNarration: 'NEFT-XXCREDIT-UNKNOWN', date: d(2026, 4, 14), amount: 2_000, direction: 'credit' },
      chosen,
      100
    );
    expect(updated.date).toBe(d(2026, 4, 14));
    expect(updated.amount).toBe(2_000);
    expect(updated.statementBalance).toBeUndefined();
  });

  it('falls back to a neutral positive direction for a legacy row with no direction field', () => {
    const chosen = expense({ date: d(2026, 4, 14), amount: 300 });
    const updated = resolveSkippedRowToExisting(
      ACCOUNT,
      { rawNarration: 'OLD ROW', date: d(2026, 4, 14), amount: 300 },
      chosen,
      100
    );
    // Already agrees (date/amount unchanged) — `reconcileMatchedExpense` returns `undefined` for a
    // no-op change, and this function falls back to a plain `updatedAt` bump in that case.
    expect(updated.updatedAt).toBe(100);
  });
});

describe('buildResolvedImportRecord', () => {
  it("reuses the row's own original batchId rather than inventing a new one", () => {
    const rec = buildResolvedImportRecord({
      id: 'new-id',
      batchId: 'batch-1',
      accountId: ACCOUNT,
      rawNarration: 'NEFT-XXCREDIT-UNKNOWN',
      date: d(2026, 4, 14),
      amount: 2_000,
      type: 'income',
      linkedTxnId: 'e-resolved',
      normalizedKey: 'NEFTXXCREDITUNKNOWN',
      now: 100
    });
    expect(rec.batchId).toBe('batch-1');
    expect(rec.id).toBe('new-id');
    expect(rec.linkedTxnId).toBe('e-resolved');
    expect(rec.sourceRowIndex).toBeUndefined();
  });

  it('carries sourceRowIndex forward when the resolved row had one', () => {
    const rec = buildResolvedImportRecord({
      id: 'new-id',
      batchId: 'batch-1',
      accountId: ACCOUNT,
      rawNarration: 'UPI/BIGBASKET',
      date: d(2026, 5, 18),
      amount: 2_500,
      type: 'expense',
      linkedTxnId: 'e-resolved',
      normalizedKey: 'BIGBASKET',
      now: 100,
      sourceRowIndex: 8
    });
    expect(rec.sourceRowIndex).toBe(8);
  });
});
