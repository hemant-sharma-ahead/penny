import { useMemo } from 'react';
import { budgetsRepo } from '@/core/db/repositories';
import type { Budget } from '@/core/db/types';
import { useLoggedRepository } from '~/hooks/useLoggedRepository';
import { toMonthYearKey } from '@/lib/formatters';

const summarizeBudget = (b: Budget) => `budget for ${b.monthYear}`;

export function useBudgets() {
  const { items: budgets, save: saveBudget } = useLoggedRepository(budgetsRepo, {
    entityType: 'budget',
    summarize: summarizeBudget,
    diffFields: ['limitAmount']
  });

  const monthBudgets = useMemo(() => budgets.filter((b) => b.monthYear === toMonthYearKey()), [budgets]);

  return { budgets, saveBudget, monthBudgets };
}
