import { useMemo } from 'react';
import { goalsRepo } from '@/core/db/repositories';
import type { Goal } from '@/core/db/types';
import { useRepository } from '@/hooks/useRepository';

export function useGoals() {
  const { items: goals, save: saveGoal, remove: removeGoal } = useRepository(goalsRepo);

  const totalSaved = useMemo(() => goals.reduce((s, g) => s + g.currentAmount, 0), [goals]);
  const totalTarget = useMemo(() => goals.reduce((s, g) => s + g.targetAmount, 0), [goals]);

  return { goals, saveGoal, removeGoal, totalSaved, totalTarget };
}

export type { Goal };
