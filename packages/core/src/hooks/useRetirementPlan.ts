import { useCallback, useEffect } from 'react';
import { useRepository } from './useRepository';
import { retirementPlanRepo } from '@/core/db/repositories';
import type { RetirementPlan } from '@/core/db/types';

// Matches FireCalculator's existing hardcoded defaults (12% return / 6% inflation / 4% SWR) — kept
// consistent rather than inventing new ones now that both places read the same plan.
const DEFAULTS: Omit<RetirementPlan, 'id' | 'createdAt' | 'updatedAt'> = {
  retirementAge: 60,
  expectedReturnPct: 12,
  inflationPct: 6,
  swrPct: 4,
  monthlyInvestment: 0
};

/**
 * The single, shared Retirement Plan — same singleton shape as {@link useProfile} (`items[0] ?? null`,
 * no fixed id assumed), except there's no onboarding step that seeds this row, so this hook lazily
 * creates it with sensible defaults the first time it's read. Read from both Home's Retirement Corpus
 * card and the FIRE Calculator — editing either place updates both via `update()`.
 */
export function useRetirementPlan(): {
  plan: RetirementPlan | null;
  loading: boolean;
  update: (patch: Partial<Omit<RetirementPlan, 'id' | 'createdAt'>>) => void;
} {
  const { items, loading, save } = useRepository(retirementPlanRepo);
  const plan = items[0] ?? null;

  useEffect(() => {
    if (loading || plan) return;
    let cancelled = false;
    // Re-check the repo directly (not just this instance's own `items` state) right before writing —
    // Home's card and the FIRE Calculator each mount their own `useRetirementPlan()` instance, so a
    // naive check-then-write here could otherwise race and create two singleton rows if both happened
    // to mount before either's write landed.
    void retirementPlanRepo.getAll().then((existing) => {
      if (cancelled || existing.length > 0) return;
      const now = Date.now();
      void save({ id: crypto.randomUUID(), ...DEFAULTS, createdAt: now, updatedAt: now });
    });
    return () => {
      cancelled = true;
    };
  }, [loading, plan, save]);

  const update = useCallback(
    (patch: Partial<Omit<RetirementPlan, 'id' | 'createdAt'>>) => {
      if (!plan) return;
      void save({ ...plan, ...patch, updatedAt: Date.now() });
    },
    [plan, save]
  );

  return { plan, loading: loading || !plan, update };
}
