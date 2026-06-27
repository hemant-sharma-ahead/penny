import { useState } from 'react';
import type { Budget, ExpenseCategory } from '@/core/db/types';
import { BudgetsTab } from './BudgetsTab';
import { BudgetModal } from './BudgetModal';
import { useBudgets } from './useBudgets';

interface BudgetsSliceProps {
  expenseCategories: ExpenseCategory[];
  spendByCategory: Map<string, number>;
  mode: 'open' | 'safe' | 'privacy';
  /** True when rendered inside a Modal (drops the tab scroll wrapper; nests the inner form). */
  overlay?: boolean;
}

export function BudgetsSlice({ expenseCategories, spendByCategory, mode, overlay }: BudgetsSliceProps) {
  const { saveBudget, monthBudgets } = useBudgets();
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [initialCategoryId, setInitialCategoryId] = useState('');
  const [existingBudget, setExistingBudget] = useState<Budget | undefined>(undefined);

  function openBudgetForm(cat: ExpenseCategory, existing?: Budget) {
    setInitialCategoryId(cat.id);
    setExistingBudget(existing);
    setShowBudgetForm(true);
  }

  function handleSaveBudget(budget: Budget) {
    saveBudget(budget)
      .then(() => setShowBudgetForm(false))
      .catch(() => {});
  }

  const tab = (
    <BudgetsTab
      expenseCategories={expenseCategories}
      spendByCategory={spendByCategory}
      monthBudgets={monthBudgets}
      mode={mode}
      onOpenBudget={openBudgetForm}
    />
  );

  return (
    <>
      {overlay ? tab : <div className="flex-1 overflow-y-auto pb-24">{tab}</div>}

      {showBudgetForm && (
        <BudgetModal
          expenseCategories={expenseCategories}
          initialCategoryId={initialCategoryId}
          existingBudget={existingBudget}
          onSave={handleSaveBudget}
          onClose={() => setShowBudgetForm(false)}
          nested={overlay}
        />
      )}
    </>
  );
}
