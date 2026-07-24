import { useState } from 'react';
import { ScrollView } from 'react-native';
import type { Budget, ExpenseCategory } from '@/core/db/types';
import { BudgetsTab } from './BudgetsTab';
import { BudgetModal } from './BudgetModal';
import { useBudgets } from './useBudgets';

interface BudgetsSliceProps {
  expenseCategories: ExpenseCategory[];
  spendByCategory: Map<string, number>;
  shouldMask: (sensitive: boolean | undefined) => boolean;
  /** True when rendered inside a Modal (drops the tab scroll wrapper). */
  overlay?: boolean;
}

export function BudgetsSlice({ expenseCategories, spendByCategory, shouldMask, overlay }: BudgetsSliceProps) {
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
      shouldMask={shouldMask}
      onOpenBudget={openBudgetForm}
    />
  );

  return (
    <>
      {overlay ? (
        tab
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 96 }}>
          {tab}
        </ScrollView>
      )}

      {showBudgetForm && (
        <BudgetModal
          expenseCategories={expenseCategories}
          initialCategoryId={initialCategoryId}
          existingBudget={existingBudget}
          onSave={handleSaveBudget}
          onClose={() => setShowBudgetForm(false)}
        />
      )}
    </>
  );
}
