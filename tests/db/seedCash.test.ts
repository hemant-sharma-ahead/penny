import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/schema';
import { keystore } from '@/core/crypto/keystore';
import { deriveKey, generateSalt } from '@/core/crypto/engine';
import { expensesRepo, accountsRepo } from '@/core/db/repositories';
import { seedDemoData, DEMO_SEED_KEY } from '@/core/db/seedDemoData';
import type { Expense } from '@/core/db/types';

function cashDelta(accId: string, t: Expense): number {
  const type = t.type ?? 'expense';
  if (type === 'income' && t.accountId === accId) return t.amount;
  if (type === 'expense' && t.accountId === accId) return -t.amount;
  if (type === 'transfer') {
    if (t.accountId === accId) return -t.amount;
    if (t.toAccountId === accId) return t.amount;
  }
  return 0;
}

describe('demo seed — cash never goes negative', () => {
  beforeEach(async () => {
    keystore.setMasterKey(await deriveKey('seed-test', generateSalt(), 1_000));
    await db.expenses.clear();
    await db.accounts.clear();
    localStorage.removeItem(DEMO_SEED_KEY);
  });

  it('keeps the Cash Wallet ≥ 0 across the whole seeded history', async () => {
    await seedDemoData('salaried');

    const accounts = await accountsRepo.getAll();
    const cash = accounts.find((a) => a.id === 'demo-acc-cash');
    expect(cash).toBeDefined();

    const txns = (await expensesRepo.getAll()).sort((a, b) => a.date - b.date);
    let running = cash!.openingBalance;
    let min = running;
    for (const t of txns) {
      running += cashDelta('demo-acc-cash', t);
      min = Math.min(min, running);
    }
    expect(min).toBeGreaterThanOrEqual(0);
  });
});
