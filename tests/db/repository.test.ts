import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/schema';
import { EncryptedRepository } from '@/core/db/repository';
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

  it('raw IndexedDB record is NOT plaintext', async () => {
    const repo = new EncryptedRepository<Expense>(db.expenses as never);
    await repo.put(sampleExpense);

    // Read directly from Dexie — bypasses EncryptedRepository
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
