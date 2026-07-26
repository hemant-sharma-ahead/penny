// Shared across exportCsv.ts (web) and exportCsv.native.ts — pure string-building logic with no DOM/
// RN-specific calls, so it was byte-identical in both files. Kept in exactly one place per the
// platform-variance-minimization principle (docs/ARCHITECTURE.md); each platform file keeps only its
// own genuinely-different download/share mechanism.
import type { Expense, ExpenseCategory } from '@/core/db/types';

function fmtDate(epoch: number): string {
  const d = new Date(epoch);
  return [String(d.getDate()).padStart(2, '0'), String(d.getMonth() + 1).padStart(2, '0'), d.getFullYear()].join('/');
}

function esc(s: string): string {
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportExpensesAsCsv(expenses: Expense[], categories: ExpenseCategory[]): string {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const header = 'Date,Amount,Description,Category,Type,PaymentMode,Tags,Notes';
  const rows = expenses.map((e) =>
    [
      fmtDate(e.date),
      e.amount.toFixed(2),
      esc(e.description),
      esc(catMap.get(e.categoryId) ?? 'Other'),
      e.type ?? 'expense',
      e.paymentMode ?? '',
      e.hashtags.map((t) => `#${t}`).join(' '),
      esc(e.notes ?? '')
    ].join(',')
  );
  return [header, ...rows].join('\n');
}
