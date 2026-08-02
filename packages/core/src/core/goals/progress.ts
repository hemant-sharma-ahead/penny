import type { Goal, GoalContribution } from '@/core/db/types';

/**
 * A goal's real saved amount: the baseline (`Goal.currentAmount`, set once via `GoalForm`'s "Already
 * saved" field) plus the live sum of every `GoalContribution` linked to it. Shared by `useGoals.ts`
 * (goal-card progress) and `useForecast.ts` (Safe-to-spend's goal exclusion, 2026-08-02) so both read the
 * exact same number rather than two copies of this math drifting apart.
 */
export function effectiveSaved(goal: Pick<Goal, 'id' | 'currentAmount'>, contributions: GoalContribution[]): number {
  let total = goal.currentAmount;
  for (const c of contributions) {
    if (c.goalId === goal.id) total += c.amount;
  }
  return total;
}

export interface GoalReservation {
  goalId: string;
  name: string;
  amount: number;
  counts: boolean;
}

/**
 * Per-goal saved amounts plus which ones count toward "Safe to spend" (2026-08-02) —
 * `Goal.countsTowardSafeToSpend` defaults to true (every goal counts unless the user explicitly turns a
 * specific one off). Returns every goal (not just the counted ones) so a caller can show a full
 * breakdown, e.g. Cash Flow's "Excludes ₹X saved for goals" expandable list.
 */
export function goalReservations(goals: Goal[], contributions: GoalContribution[]): GoalReservation[] {
  return goals.map((g) => ({
    goalId: g.id,
    name: g.name,
    amount: effectiveSaved(g, contributions),
    counts: g.countsTowardSafeToSpend !== false
  }));
}

/** Total money reserved across every "counts" goal — the amount Safe-to-spend should subtract. */
export function totalGoalReserved(reservations: GoalReservation[]): number {
  return reservations.filter((r) => r.counts).reduce((s, r) => s + r.amount, 0);
}
