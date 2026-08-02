import type { Expense } from '@/core/db/types';

/** How a single transaction moves `accountId`'s balance (+in / −out / 0 if unrelated). */
export function delta(accountId: string, t: Pick<Expense, 'accountId' | 'toAccountId' | 'amount' | 'type'>): number {
  const type = t.type ?? 'expense';
  if (type === 'income' && t.accountId === accountId) return t.amount;
  if (type === 'expense' && t.accountId === accountId) return -t.amount;
  if (type === 'transfer') {
    if (t.accountId === accountId) return -t.amount;
    if (t.toAccountId === accountId) return t.amount;
  }
  return 0;
}

export function computeBalance(accountId: string, openingBalance: number, txns: Expense[]): number {
  return txns.reduce((bal, t) => bal + delta(accountId, t), openingBalance);
}

/** A not-yet-saved transaction, for projecting its effect on a balance (cash-negative guard, Track E). */
export type CandidateTxn = Pick<Expense, 'accountId' | 'toAccountId' | 'amount' | 'type'>;

/**
 * Balance of `accountId` if `candidate` were applied on top of `txns`. When editing an existing
 * transaction, pass `txns` with that transaction excluded so its old effect isn't double-counted.
 */
export function projectedBalance(
  accountId: string,
  openingBalance: number,
  txns: Expense[],
  candidate: CandidateTxn
): number {
  return computeBalance(accountId, openingBalance, txns) + delta(accountId, candidate);
}
