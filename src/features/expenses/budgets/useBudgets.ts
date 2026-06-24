import { useMemo } from 'react';
import { budgetsRepo } from '@/core/db/repositories';
import { useRepository } from '@/hooks/useRepository';
import { toMonthYearKey } from '@/lib/formatters';

export function useBudgets() {
  const { items: budgets, save: saveBudget } = useRepository(budgetsRepo);

  const monthBudgets = useMemo(() => budgets.filter((b) => b.monthYear === toMonthYearKey()), [budgets]);

  return { budgets, saveBudget, monthBudgets };
}
