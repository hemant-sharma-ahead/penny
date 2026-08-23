import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/core/db/schema';
import { EncryptedRepository } from '@/core/db/repository';
import { expensesRepo, merchantMemoryRepo } from '@/core/db/repositories';
import { keystore } from '@/core/crypto/keystore';
import { initialize, unlock } from '@/core/crypto/securityManager';
import { exportBackup, importBackup } from '@/core/backup/backupManager';
import { memoryKey } from '@/core/expenses/merchantMemory';
import type { Expense, MerchantMemory } from '@/core/db/types';

const PASS = 'correct horse battery staple';
const PIN = '123456';

interface TestRecord {
  id: string;
  secret: string;
}
const repo = new EncryptedRepository<TestRecord>(db.profile as never);
const accountsRepo = new EncryptedRepository<TestRecord>(db.accounts as never);
const sample: TestRecord = { id: 'p1', secret: 'top-secret-value' };

describe('backupManager — envelope round-trip', () => {
  beforeEach(async () => {
    await Promise.all([
      db.security.clear(),
      db.profile.clear(),
      db.expenses.clear(),
      db.accounts.clear(),
      db.merchant_memory.clear()
    ]);
    keystore.lock();
  });

  it('exports a v2 file and restores it on a wiped vault', async () => {
    await initialize(PASS, PIN);
    await repo.put(sample);

    const blob = await exportBackup();
    const text = await blob.text();
    expect(JSON.parse(text).version).toBe(2);

    // Wipe everything (simulate a fresh device).
    await Promise.all([db.security.clear(), db.profile.clear()]);
    keystore.lock();

    await importBackup(text, PASS);
    // Restore locks the session — the user re-enters their PIN.
    expect(keystore.isUnlocked()).toBe(false);
    expect(await unlock(PIN)).toBe('ok');
    expect(await repo.get('p1')).toEqual(sample);
  });

  it('rejects an incorrect passphrase on restore', async () => {
    await initialize(PASS, PIN);
    await repo.put(sample);
    const text = await (await exportBackup()).text();

    await expect(importBackup(text, 'wrong passphrase')).rejects.toThrow(/Incorrect passphrase/);
  });

  it('rolls back the whole restore if any one table fails partway through (regression: real-device "app resets itself after a failed restore" report, 2026-08-21)', async () => {
    await initialize(PASS, PIN);
    await repo.put(sample);
    await accountsRepo.put(sample); // gives `accounts` a row so the simulated `bulkPut` failure below actually fires
    const text = await (await exportBackup()).text();

    // Confirm the CURRENT (pre-restore) vault can unlock with the CURRENT PIN before we touch anything.
    expect(await unlock(PIN)).toBe('ok');
    keystore.lock();

    // Simulate some table's `bulkPut` throwing partway through the restore — `accounts` sits after
    // `security` in `BACKUP_STORES`, so a real bug here would have already replaced `security` with the
    // backup's copy before this throws, corrupting the vault even though the overall restore "failed."
    // `restoreTables()` runs the whole thing inside one real Dexie `transaction()`, so this also
    // exercises Dexie's own automatic rollback, not a hand-rolled one.
    const bulkPutSpy = vi.spyOn(db.accounts, 'bulkPut').mockRejectedValueOnce(new Error('simulated write failure'));

    await expect(importBackup(text, PASS)).rejects.toThrow('simulated write failure');
    bulkPutSpy.mockRestore();

    // The whole transaction must have rolled back — `security` must still be the CURRENT vault's
    // record, not the backup's, so the CURRENT PIN still unlocks (the exact case that read as "the app
    // reset itself" before this fix, since a real device build has no test the user can run manually).
    expect(await unlock(PIN)).toBe('ok');
    expect(await repo.get('p1')).toEqual(sample);
  });

  it('drops orphaned merchant-memory rows on restore (regression: real-device "suggests a transaction that does not exist" report, 2026-08-21)', async () => {
    await initialize(PASS, PIN);
    const now = Date.now();

    // The exact inconsistency found on-device: a memory entry with no matching expense at all (its
    // source expense had already been deleted/replaced by the time this backup was made).
    const orphanMemory: MerchantMemory = {
      id: memoryKey('expense', 'Test Expense', 'cat-1'),
      description: 'Test Expense',
      type: 'expense',
      categoryId: 'cat-1',
      usageCount: 3,
      updatedAt: now
    };
    // A real expense + its matching memory entry, which must survive the restore untouched.
    const realExpense: Expense = {
      id: 'e1',
      amount: 500,
      categoryId: 'cat-2',
      description: 'Groceries',
      date: now,
      hashtags: [],
      isRecurring: false,
      createdAt: now,
      updatedAt: now
    };
    const realMemory: MerchantMemory = {
      id: memoryKey('expense', 'Groceries', 'cat-2'),
      description: 'Groceries',
      type: 'expense',
      categoryId: 'cat-2',
      usageCount: 1,
      updatedAt: now
    };
    await merchantMemoryRepo.put(orphanMemory);
    await merchantMemoryRepo.put(realMemory);
    await expensesRepo.put(realExpense);

    const text = await (await exportBackup()).text();

    await Promise.all([db.security.clear(), db.expenses.clear(), db.merchant_memory.clear()]);
    keystore.lock();

    await importBackup(text, PASS);
    expect(await unlock(PIN)).toBe('ok');

    const restoredMemories = await merchantMemoryRepo.getAll();
    expect(restoredMemories.map((m) => m.id)).toEqual([realMemory.id]);
    expect(await expensesRepo.get('e1')).toEqual(realExpense);
  });
});
