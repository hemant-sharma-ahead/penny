// Monthly cash-flow summary for one cash/wallet account — Initial → Income → Expenses → Computed left,
// plus (only if a reconciliation happened that month) the real reconciled figure and the gap between the
// two. Not a new ledger concept: entirely derived from the account's existing continuous balance model
// (`balanceCalculator.ts`) — no "Cash Forward" transaction type, no month-bucketed storage.
import type { Account, Expense } from '@/core/db/types';
import { computeBalance, delta } from '@/core/accounts/balanceCalculator';

/** Fixed description `useAccounts.ts`'s `reconcileAccount()` posts — the one reliable way to tell an
 *  organic transaction apart from a reconciliation adjustment. */
const RECONCILIATION_DESCRIPTION = 'Balance reconciliation';

export interface CashFlowSummary {
  /** Balance at the start of the month (before any of that month's transactions). */
  initial: number;
  /** Sum of money moved into the account that month, from ordinary income/transfers-in — excludes any
   *  reconciliation adjustment. */
  income: number;
  /** Sum of money moved out of the account that month, from ordinary expenses/transfers-out — excludes
   *  any reconciliation adjustment. */
  expenses: number;
  /** `initial + income − expenses` — what the account should hold, per what you've actually logged. */
  computedLeft: number;
  /** Only set if the account was reconciled during this month: the real tracked balance including that
   *  adjustment (`computedLeft` plus the reconciliation's own delta) — the gap between the two is
   *  exactly how far your logging drifted from reality that month. */
  reconciledActual?: number;
  reconciledDate?: number;
}

/** Computes the cash-flow summary for one account over an arbitrary `[start, end)` range (a month via
 *  `monthBounds()`, a year via `yearBounds()`, both in `@/lib/date`), given every transaction in the
 *  vault (filtered internally to this account). */
export function computeCashFlowSummary(
  account: Pick<Account, 'id' | 'openingBalance'>,
  allTxns: Expense[],
  range: { start: number; end: number }
): CashFlowSummary {
  const { start, end } = range;
  const before = allTxns.filter((t) => t.date < start);
  const initial = computeBalance(account.id, account.openingBalance, before);

  const inMonth = allTxns.filter((t) => t.date >= start && t.date < end);
  const organic = inMonth.filter((t) => t.description !== RECONCILIATION_DESCRIPTION);
  const reconciliations = inMonth.filter(
    (t) => t.description === RECONCILIATION_DESCRIPTION && t.accountId === account.id
  );

  let income = 0;
  let expenseTotal = 0;
  for (const t of organic) {
    const d = delta(account.id, t);
    if (d > 0) income += d;
    else if (d < 0) expenseTotal += -d;
  }
  const computedLeft = initial + income - expenseTotal;

  if (reconciliations.length === 0) {
    return { initial, income, expenses: expenseTotal, computedLeft };
  }

  const reconciliationDelta = reconciliations.reduce((s, t) => s + delta(account.id, t), 0);
  const lastReconcileDate = reconciliations.reduce((latest, t) => Math.max(latest, t.date), 0);
  return {
    initial,
    income,
    expenses: expenseTotal,
    computedLeft,
    reconciledActual: computedLeft + reconciliationDelta,
    reconciledDate: lastReconcileDate
  };
}
