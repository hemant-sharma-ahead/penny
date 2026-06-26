import { formatCurrency } from '@/lib/formatters';
import { STATUS } from '@/lib/statusColors';
import type { Budget, ExpenseCategory } from '@/core/db/types';

interface BudgetsTabProps {
  expenseCategories: ExpenseCategory[];
  spendByCategory: Map<string, number>;
  monthBudgets: Budget[];
  mode: 'open' | 'safe' | 'privacy';
  onOpenBudget: (cat: ExpenseCategory, existing?: Budget) => void;
}

export function BudgetsTab({ expenseCategories, spendByCategory, monthBudgets, mode, onOpenBudget }: BudgetsTabProps) {
  return (
    <div className="px-4 py-4 flex flex-col gap-3">
      {expenseCategories.length === 0 && <p className="text-sm text-center mt-8 text-tertiary">Loading categories…</p>}
      {expenseCategories.map((cat) => {
        const budget = monthBudgets.find((b) => b.categoryId === cat.id);
        const spent = spendByCategory.get(cat.id) ?? 0;
        const pct = budget ? Math.min((spent / budget.limitAmount) * 100, 100) : 0;
        const over = !!budget && spent > budget.limitAmount;
        return (
          <div key={cat.id} className="surface rounded-xl px-4 py-3">
            {/* Header row */}
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${cat.color}18` }}
              >
                <i className={`ti ${cat.icon}`} style={{ fontSize: 15, color: cat.color }} aria-hidden="true" />
              </div>
              <span className="text-sm font-medium text-primary flex-1 truncate">{cat.name}</span>
              {budget && (
                <span
                  className="text-xs flex-shrink-0"
                  style={{ color: over ? STATUS.danger : 'var(--color-text-tertiary)' }}
                >
                  {mode === 'open' ? formatCurrency(budget.limitAmount) : '••••'}
                </span>
              )}
              <button
                className="text-xs font-medium underline text-tertiary flex-shrink-0"
                onClick={() => onOpenBudget(cat, budget)}
              >
                {budget ? 'Edit' : 'Set limit'}
              </button>
            </div>
            {/* Bar + spent on one row — only when budget is set */}
            {budget && (
              <div className="flex items-center gap-2 mt-2.5">
                <div className="flex-1 h-2 rounded-full overflow-hidden bg-surface-3">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${pct}%`, backgroundColor: over ? STATUS.danger : cat.color }}
                  />
                </div>
                <span
                  className="text-xs flex-shrink-0"
                  style={{ color: over ? STATUS.danger : 'var(--color-text-secondary)' }}
                >
                  {mode === 'open' ? formatCurrency(spent) : '••••'}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
