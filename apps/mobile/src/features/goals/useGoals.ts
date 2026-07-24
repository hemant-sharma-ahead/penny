import { useMemo } from 'react';
import { goalsRepo } from '@/core/db/repositories';
import type { Goal } from '@/core/db/types';
import { useLoggedRepository } from '~/hooks/useLoggedRepository';

const summarizeGoal = (g: Goal) => `goal: ${g.name}`;

export function useGoals() {
  const {
    items: goals,
    save: saveGoal,
    remove: removeGoal
  } = useLoggedRepository(goalsRepo, {
    entityType: 'goal',
    summarize: summarizeGoal,
    diffFields: ['name', 'targetAmount', 'currentAmount']
  });

  const totalSaved = useMemo(() => goals.reduce((s, g) => s + g.currentAmount, 0), [goals]);
  const totalTarget = useMemo(() => goals.reduce((s, g) => s + g.targetAmount, 0), [goals]);

  return { goals, saveGoal, removeGoal, totalSaved, totalTarget };
}

export type { Goal };
