// Shared across exportCsv.ts (web) and exportCsv.native.ts — pure string-building logic with no DOM/
// RN-specific calls, so it was byte-identical in both files. Kept in exactly one place per the
// platform-variance-minimization principle (docs/ARCHITECTURE.md); each platform file keeps only its
// own genuinely-different download/share mechanism.
import type { Account, Expense, ExpenseCategory } from '@/core/db/types';

/** Optional lookups for the Account / IOU Person / Shared-to-group columns (2026-08-23, real-device-
 *  testing-pass item 76) — all three ADDITIVE and OPTIONAL, never required positional params, because
 *  `apps/web-react/src/features/expenses/transactions/ExpenseExportModal.tsx` (frozen) calls
 *  `exportExpensesAsCsv(filtered, expenseCategories)` with no third argument at all and must keep
 *  compiling/working exactly as-is; omitting any of these simply leaves that column blank per row. */
export interface ExportCsvContext {
  /** Resolves `Expense.accountId` → account name for the Account column. */
  accounts?: Account[];
  /** Expense id → linked IOU person's name (e.g. `useExpenses.ts`'s `iouLinkByTxn`, already resolved via
   *  `LedgerEntry.linkedTxnId`/`personId` → `Person.name` — there is no direct field on `Expense` itself
   *  for this). Absent/no entry leaves the column blank. */
  iouPersonByExpenseId?: Map<string, string>;
  /** Group id → group name, to resolve `Expense.shareWith` into a purely informational "Shared to: X"
   *  note — NOT meant to be re-import-actionable as a link; see importParsers.ts's handling of this
   *  column, which folds it into Notes on re-import rather than treating it as a real group reference. */
  groupNameById?: Map<string, string>;
}

function fmtDate(epoch: number): string {
  const d = new Date(epoch);
  return [String(d.getDate()).padStart(2, '0'), String(d.getMonth() + 1).padStart(2, '0'), d.getFullYear()].join('/');
}

function esc(s: string): string {
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportExpensesAsCsv(
  expenses: Expense[],
  categories: ExpenseCategory[],
  context?: ExportCsvContext
): string {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const accountNameById = new Map((context?.accounts ?? []).map((a) => [a.id, a.name]));
  const header = 'Date,Amount,Description,Category,Type,PaymentMode,Tags,Notes,Account,IOU Person,Shared To Group';
  const rows = expenses.map((e) => {
    const groupNames = (e.shareWith ?? [])
      .map((id) => context?.groupNameById?.get(id))
      .filter((name): name is string => !!name);
    return [
      fmtDate(e.date),
      e.amount.toFixed(2),
      esc(e.description),
      esc(catMap.get(e.categoryId) ?? 'Other'),
      e.type ?? 'expense',
      e.paymentMode ?? '',
      e.hashtags.map((t) => `#${t}`).join(' '),
      esc(e.notes ?? ''),
      esc(e.accountId ? (accountNameById.get(e.accountId) ?? '') : ''),
      esc(context?.iouPersonByExpenseId?.get(e.id) ?? ''),
      esc(groupNames.length ? `Shared to: ${groupNames.join(', ')}` : '')
    ].join(',');
  });
  return [header, ...rows].join('\n');
}
