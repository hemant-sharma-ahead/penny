import type { Expense } from '@/core/db/types';

export function computeBalance(accountId: string, openingBalance: number, txns: Expense[]): number {
  const linked = txns.filter((t) => t.accountId === accountId || t.toAccountId === accountId);
  return linked.reduce((bal, t) => {
    const type = t.type ?? 'expense';
    if (type === 'income' && t.accountId === accountId) return bal + t.amount;
    if (type === 'expense' && t.accountId === accountId) return bal - t.amount;
    if (type === 'transfer') {
      if (t.accountId === accountId) return bal - t.amount;
      if (t.toAccountId === accountId) return bal + t.amount;
    }
    return bal;
  }, openingBalance);
}
