import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/schema';
import { EncryptedRepository } from '@/core/db/repository';
import { expensesRepo } from '@/core/db/repositories';
import { deriveKey, generateSalt } from '@/core/crypto/engine';
import { keystore } from '@/core/crypto/keystore';
import type { Expense } from '@/core/db/types';

async function setupKeystore() {
  const salt = generateSalt();
  const mk = await deriveKey('test-passphrase', salt, 1_000);
  keystore.setMasterKey(mk);
}

const sampleExpense: Expense = {
  id: 'test-expense-001',
  amount: 1500,
  categoryId: 'cat-001',
  description: 'Grocery shopping',
  date: 1_700_000_000_000,
  hashtags: ['#groceries'],
  isRecurring: false,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000
};

describe('EncryptedRepository — round-trip', () => {
  beforeEach(async () => {
    await setupKeystore();
    await db.expenses.clear();
  });

  it('stores and retrieves a record', async () => {
    const repo = new EncryptedRepository<Expense>(db.expenses as never);
    await repo.put(sampleExpense);
    const retrieved = await repo.get(sampleExpense.id);
    expect(retrieved).toEqual(sampleExpense);
  });

  it('round-trips a record whose ciphertext is large enough to stress base64 encoding (regression: 2026-08-20 "Maximum call stack size exceeded" on a ~9,000-row CSV import\'s activity-log entry — `bufferToBase64` used to spread the whole byte array into `String.fromCharCode(...)`, which blows the call stack once the buffer is large; now chunked)', async () => {
    const repo = new EncryptedRepository<Expense>(db.expenses as never);
    const large: Expense = {
      ...sampleExpense,
      id: 'test-expense-large',
      // ~200KB of plaintext, comfortably larger than the 32768-byte chunk size the fix uses —
      // this is what actually exercises the bug (a small record never got close to the ceiling).
      description: 'x'.repeat(200_000)
    };
    await repo.put(large);
    const retrieved = await repo.get(large.id);
    expect(retrieved).toEqual(large);
  });

  it('raw IndexedDB record is NOT plaintext', async () => {
    const repo = new EncryptedRepository<Expense>(db.expenses as never);
    await repo.put(sampleExpense);

    // Read directly from the raw table — bypasses EncryptedRepository
    const raw = await db.expenses.get(sampleExpense.id);
    expect(raw).toBeDefined();

    const rawStr = JSON.stringify(raw);

    // None of the plaintext field values should appear in the raw record
    expect(rawStr).not.toContain('Grocery shopping');
    expect(rawStr).not.toContain('groceries');
    expect(rawStr).not.toContain('cat-001');
    expect(rawStr).not.toContain('"amount":1500');

    // But the record must have iv and ciphertext fields
    expect(rawStr).toContain('iv');
    expect(rawStr).toContain('ciphertext');
  });

  it('getAll decrypts multiple records correctly', async () => {
    const repo = new EncryptedRepository<Expense>(db.expenses as never);
    const second: Expense = { ...sampleExpense, id: 'test-expense-002', amount: 3000, description: 'Restaurant' };

    await repo.put(sampleExpense);
    await repo.put(second);

    const all = await repo.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((e) => e.id).sort()).toEqual(['test-expense-001', 'test-expense-002']);
    expect(all.find((e) => e.id === 'test-expense-002')?.amount).toBe(3000);
  });

  it('delete removes the record', async () => {
    const repo = new EncryptedRepository<Expense>(db.expenses as never);
    await repo.put(sampleExpense);
    await repo.delete(sampleExpense.id);
    const result = await repo.get(sampleExpense.id);
    expect(result).toBeUndefined();
  });

  it('locked keystore throws on read', async () => {
    const repo = new EncryptedRepository<Expense>(db.expenses as never);
    await repo.put(sampleExpense);

    keystore.lock();

    await expect(repo.get(sampleExpense.id)).rejects.toThrow('Session locked');
  });

  it('wrong key cannot decrypt a record', async () => {
    const repo = new EncryptedRepository<Expense>(db.expenses as never);
    await repo.put(sampleExpense);

    // Replace keystore with a different key
    const wrongSalt = generateSalt();
    const wrongKey = await deriveKey('different-passphrase', wrongSalt, 1_000);
    keystore.setMasterKey(wrongKey);

    await expect(repo.get(sampleExpense.id)).rejects.toThrow();
  });
});

// Tier 2 performance fix (2026-08-28) — `expensesRepo` (the real singleton, wired with indexed-query
// support in `repositories.ts`) gains real indexed queries over 5 plaintext columns. These
// tests use `expensesRepo` specifically (not a bare `EncryptedRepository`, unlike the suite above)
// since that's the one repo actually constructed with the `indexed` option.
describe('EncryptedRepository — indexed expense queries (Tier 2)', () => {
  const jan1: Expense = { ...sampleExpense, id: 'idx-jan-1', date: Date.UTC(2026, 0, 1), accountId: 'acc-a' };
  const jan15: Expense = {
    ...sampleExpense,
    id: 'idx-jan-15',
    date: Date.UTC(2026, 0, 15),
    accountId: 'acc-b',
    categoryId: 'cat-002'
  };
  const feb1: Expense = { ...sampleExpense, id: 'idx-feb-1', date: Date.UTC(2026, 1, 1), accountId: 'acc-a' };
  const transferIntoB: Expense = {
    ...sampleExpense,
    id: 'idx-transfer',
    date: Date.UTC(2026, 0, 20),
    type: 'transfer',
    accountId: 'acc-a',
    toAccountId: 'acc-b'
  };

  beforeEach(async () => {
    await setupKeystore();
    await db.expenses.clear();
    await Promise.all([jan1, jan15, feb1, transferIntoB].map((e) => expensesRepo.put(e)));
  });

  it('queryByDateRange returns only rows within range, correctly decrypted', async () => {
    const jan = await expensesRepo.queryByDateRange(Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 31));
    expect(jan.map((e) => e.id).sort()).toEqual(['idx-jan-1', 'idx-jan-15', 'idx-transfer']);
    expect(jan.find((e) => e.id === 'idx-jan-15')?.categoryId).toBe('cat-002');
  });

  it('queryByAccount matches accountId OR toAccountId, never double-counting a row on both sides', async () => {
    const acctA = await expensesRepo.queryByAccount('acc-a');
    expect(acctA.map((e) => e.id).sort()).toEqual(['idx-feb-1', 'idx-jan-1', 'idx-transfer']);

    const acctB = await expensesRepo.queryByAccount('acc-b');
    expect(acctB.map((e) => e.id).sort()).toEqual(['idx-jan-15', 'idx-transfer']);
  });

  it('queryByCategory returns only matching rows', async () => {
    const cat002 = await expensesRepo.queryByCategory('cat-002');
    expect(cat002.map((e) => e.id)).toEqual(['idx-jan-15']);
  });

  it('raw stored row exposes date/accountId/toAccountId/categoryId/type as plaintext, but keeps amount/description/hashtags encrypted', async () => {
    const raw = (await db.expenses.get('idx-jan-15')) as unknown as Record<string, unknown>;
    expect(raw.date).toBe(Date.UTC(2026, 0, 15));
    expect(raw.accountId).toBe('acc-b');
    expect(raw.categoryId).toBe('cat-002');
    expect(raw.type).toBe('expense');

    const rawStr = JSON.stringify(raw);
    expect(rawStr).not.toContain('Grocery shopping');
    expect(rawStr).not.toContain('groceries');
    expect(rawStr).not.toContain('"amount":1500');
  });

  it('backfillIndexColumnsBatch writes the index columns for pre-existing rows in one batch, without touching iv/ciphertext', async () => {
    // Simulate a row written before Tier 2 shipped — a direct raw-table write, bypassing
    // `expensesRepo.put()` entirely, so it never got the 5 index columns `indexFields` normally populates.
    const preExisting: Expense = { ...sampleExpense, id: 'idx-legacy', date: Date.UTC(2026, 2, 1), accountId: 'acc-c' };
    const legacyRepo = new EncryptedRepository<Expense>(db.expenses as never); // no `indexed` option — same as pre-Tier-2 writes
    await legacyRepo.put(preExisting);

    const beforeRaw = (await db.expenses.get('idx-legacy')) as unknown as Record<string, unknown>;
    expect(beforeRaw.date).toBeUndefined();
    const { iv: ivBefore, ciphertext: ciphertextBefore } = beforeRaw as { iv: string; ciphertext: string };

    await expensesRepo.backfillIndexColumnsBatch([
      {
        id: 'idx-legacy',
        fields: { date: preExisting.date, accountId: 'acc-c', categoryId: preExisting.categoryId, type: 'expense' }
      },
      { id: 'idx-jan-1', fields: { date: jan1.date, accountId: 'acc-a', categoryId: jan1.categoryId, type: 'expense' } }
    ]);

    const afterRaw = (await db.expenses.get('idx-legacy')) as unknown as Record<string, unknown>;
    expect(afterRaw.date).toBe(Date.UTC(2026, 2, 1));
    expect(afterRaw.accountId).toBe('acc-c');
    // iv/ciphertext must be byte-for-byte unchanged — this is a column update, not a re-encryption.
    expect(afterRaw.iv).toBe(ivBefore);
    expect(afterRaw.ciphertext).toBe(ciphertextBefore);

    // The now-indexed row is findable via the real query, and decrypts correctly.
    const acctC = await expensesRepo.queryByAccount('acc-c');
    expect(acctC.map((e) => e.id)).toEqual(['idx-legacy']);
    expect(acctC[0]?.description).toBe(sampleExpense.description);
  });

  it('backfillIndexColumnsBatch is a no-op on an empty array', async () => {
    await expect(expensesRepo.backfillIndexColumnsBatch([])).resolves.toBeUndefined();
  });
});
