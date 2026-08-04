import { computeBalance } from '@/core/accounts/balanceCalculator';
import type { Account, Expense } from '@/core/db/types';

export interface BalanceCheckResult {
  computed: number;
  statementClosing: number;
  matches: boolean;
}

/**
 * Optional post-import validation nudge (docs/plans/bank-statement-import.md §11) — compares
 * Penny's own computed balance for the account (always derived, never stored) against the
 * statement's own stated closing balance, if the file had a Balance column. Never auto-corrects —
 * only surfaces a nudge toward the existing Reconcile feature on mismatch.
 */
export function checkBalanceAgainstStatement(
  account: Pick<Account, 'id' | 'openingBalance'>,
  allExpensesForAccount: Expense[],
  statementClosingBalance: number,
  toleranceRupees = 1
): BalanceCheckResult {
  const computed = computeBalance(account.id, account.openingBalance, allExpensesForAccount);
  return {
    computed,
    statementClosing: statementClosingBalance,
    matches: Math.abs(computed - statementClosingBalance) <= toleranceRupees
  };
}
