import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/schema';
import { activityLogRepo, expensesRepo, ledgerEntriesRepo } from '@/core/db/repositories';
import { restoreActivity, summarizeDiff } from '@/core/db/activityLog';
import { deriveKey, generateSalt } from '@/core/crypto/engine';
import { keystore } from '@/core/crypto/keystore';
import type { ActivityLog, Expense, LedgerEntry } from '@/core/db/types';

async function setupKeystore() {
  const salt = generateSalt();
  keystore.setMasterKey(await deriveKey('test-passphrase', salt, 1_000));
}

const expense: Expense = {
  id: 'exp-restore-1',
  amount: 340,
  categoryId: 'cat-food',
  description: 'Swiggy',
  date: 1_700_000_000_000,
  hashtags: [],
  isRecurring: false,
  type: 'expense',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000
};

describe('summarizeDiff', () => {
  it('captures only changed fields as [before, after]', () => {
    const out = summarizeDiff({ a: 1, b: 2, c: 3 }, { a: 1, b: 20, c: 30 }, ['a', 'b', 'c']);
    expect(JSON.parse(out!)).toEqual({ b: [2, 20], c: [3, 30] });
  });

  it('returns undefined when nothing changed', () => {
    expect(summarizeDiff({ a: 1 }, { a: 1 }, ['a'])).toBeUndefined();
  });
});

const linkedEntry: LedgerEntry = {
  id: 'le-cascade-1',
  personId: 'p1',
  kind: 'lent',
  amount: 340,
  date: 1_700_000_000_000,
  origin: 'expense',
  linkedTxnId: expense.id,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000
};

describe('restoreActivity', () => {
  beforeEach(async () => {
    await setupKeystore();
    await db.activity_log.clear();
    await db.expenses.clear();
    await db.ledger_entries.clear();
  });

  it('re-inserts a single snapshotted record and marks the entry restored', async () => {
    const entry: ActivityLog = {
      id: 'log-1',
      timestamp: Date.now(),
      action: 'DELETE',
      entityType: 'expense',
      entityId: expense.id,
      summary: 'Deleted expense: Swiggy ₹340',
      snapshot: JSON.stringify(expense)
    };
    await activityLogRepo.put(entry);

    const ok = await restoreActivity('log-1');
    expect(ok).toBe(true);
    expect(await expensesRepo.get(expense.id)).toEqual(expense);
    expect((await activityLogRepo.get('log-1'))?.restored).toBe(true);
  });

  it('restores all records from a bulk-delete array snapshot', async () => {
    const second = { ...expense, id: 'exp-restore-2', description: 'Zomato' };
    await activityLogRepo.put({
      id: 'log-2',
      timestamp: Date.now(),
      action: 'BULK_DELETE',
      entityType: 'expense',
      entityId: expense.id,
      summary: 'Deleted 2 transactions',
      snapshot: JSON.stringify([expense, second]),
      entityCount: 2
    });

    await restoreActivity('log-2');
    expect((await expensesRepo.getAll()).map((e) => e.id).sort()).toEqual(['exp-restore-1', 'exp-restore-2']);
  });

  it('restores cascade records of another entity type alongside the primary (combined undo)', async () => {
    await activityLogRepo.put({
      id: 'log-cascade',
      timestamp: Date.now(),
      action: 'DELETE',
      entityType: 'expense',
      entityId: expense.id,
      summary: 'Deleted expense: Swiggy ₹340',
      snapshot: JSON.stringify(expense),
      cascade: JSON.stringify([{ entityType: 'ledgerEntry', record: linkedEntry }])
    });

    const ok = await restoreActivity('log-cascade');
    expect(ok).toBe(true);
    expect(await expensesRepo.get(expense.id)).toEqual(expense);
    expect(await ledgerEntriesRepo.get(linkedEntry.id)).toEqual(linkedEntry);
  });

  it('is a no-op for an already-restored entry', async () => {
    await activityLogRepo.put({
      id: 'log-3',
      timestamp: Date.now(),
      action: 'DELETE',
      entityType: 'expense',
      entityId: expense.id,
      summary: 'x',
      snapshot: JSON.stringify(expense),
      restored: true
    });
    expect(await restoreActivity('log-3')).toBe(false);
    expect(await expensesRepo.get(expense.id)).toBeUndefined();
  });
});
