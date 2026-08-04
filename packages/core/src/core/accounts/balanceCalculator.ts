import type { Account, Expense } from '@/core/db/types';

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

/**
 * Sum of live balances across every account that counts toward net worth (`includeInNetWorth`,
 * excluding archived ones) — extracted from `apps/mobile/src/features/home/useHome.ts`'s inline
 * filter+reduce so `apps/mobile/src/hooks/useInvestableCorpus.ts` (used by the FIRE Calculator, a
 * different feature module) can compute the exact same figure without duplicating the logic. Clamped
 * ≥0, matching `useHome.ts`'s own `Math.max(0, liquidFunds)` convention.
 */
export function calcLiquidFunds(accounts: Account[], txns: Expense[]): number {
  const liquidAccs = accounts.filter((a) => a.includeInNetWorth && !a.isArchived);
  return Math.max(
    0,
    liquidAccs.reduce((sum, a) => sum + computeBalance(a.id, a.openingBalance, txns), 0)
  );
}
