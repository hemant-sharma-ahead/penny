import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/schema';
import { keystore } from '@/core/crypto/keystore';
import { deriveKey, generateSalt } from '@/core/crypto/engine';
import { expensesRepo, accountsRepo } from '@/core/db/repositories';
import { seedDemoData, DEMO_SEED_KEY } from '@/core/db/seedDemoData';
import type { EmploymentType, Expense } from '@/core/db/types';

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

// Every persona (item 17, docs/plans/real-device-testing-pass.md) — a scale-dependent seed bug (the
// Student persona's `expenseScale` 0.35 shrinking the ATM withdrawal but not the transport row's flat
// wobble) once let Cash dip to -₹920 mid-history for that persona alone, while `salaried` stayed
// positive. Looping over all five here is what would have caught that regression.
const PERSONAS: EmploymentType[] = ['salaried', 'self_employed', 'business_owner', 'student', 'retired'];

describe('demo seed — cash never goes negative', () => {
  beforeEach(async () => {
    keystore.setMasterKey(await deriveKey('seed-test', generateSalt(), 1_000));
    await db.expenses.clear();
    await db.accounts.clear();
    localStorage.removeItem(DEMO_SEED_KEY);
  });

  for (const persona of PERSONAS) {
    it(`keeps the Cash Wallet ≥ 0 across the whole seeded history — ${persona}`, async () => {
      await seedDemoData(persona);

      const accounts = await accountsRepo.getAll();
      const cash = accounts.find((a) => a.id === 'demo-acc-cash');
      if (!cash) throw new Error('demo-acc-cash was not seeded');

      // Chronological order matters — this is a running balance, not a point-in-time sum.
      const txns = (await expensesRepo.getAll()).sort((a, b) => a.date - b.date);
      let running = cash.openingBalance;
      let min = running;
      for (const t of txns) {
        running += cashDelta('demo-acc-cash', t);
        min = Math.min(min, running);
      }
      expect(min).toBeGreaterThanOrEqual(0);
    });
  }
});
