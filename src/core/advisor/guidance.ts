// The Home advisor (guidance v1). Turns a weak health-score component into a concrete "next best step":
// either a pre-filled Goal template ("Set as goal"), a navigation to the relevant screen, or a prompt
// to add missing data. Pure + on-device — advice only, no product pushing. See docs/plans/home-financial-advisor.md.
import type { EmploymentType, Goal } from '@/core/db/types';
import type { DerivedInputs, ScoreComponent } from '@/core/health/scorer';
import { emergencyFundMonths } from '@/core/health/scorer';
import { goalsRepo } from '@/core/db/repositories';
import { logActivity } from '@/core/db/activityLog';
import { DAY_MS } from '@/lib/date';
import { PATHS } from '@/router/paths';

/** A ready-to-create goal from a suggestion (the user can edit before/after saving). */
export type GoalTemplate = Pick<Goal, 'name' | 'targetAmount' | 'currentAmount' | 'risk' | 'icon'> & {
  targetDate?: number;
};

/** Create a Goal from a suggestion template, tagged `source:'suggested'`. Returns the new goal id. */
export async function createGoalFromTemplate(t: GoalTemplate, nowMs: number = Date.now()): Promise<string> {
  const id = crypto.randomUUID();
  await goalsRepo.put({
    id,
    name: t.name,
    targetAmount: t.targetAmount,
    currentAmount: t.currentAmount,
    targetDate: t.targetDate ?? nowMs + 365 * DAY_MS,
    risk: t.risk,
    ...(t.icon ? { icon: t.icon } : {}),
    source: 'suggested',
    createdAt: nowMs,
    updatedAt: nowMs
  });
  logActivity({ action: 'CREATE', entityType: 'goal', entityId: id, summary: `Added goal: ${t.name}` });
  return id;
}

export type GuidanceAction =
  /** Create a goal (pre-filled). */
  | { kind: 'goal'; label: string; template: GoalTemplate }
  /** Send the user to a screen to act. */
  | { kind: 'navigate'; label: string; to: string }
  /** Prompt to add missing data (opens the health detail where income is entered). */
  | { kind: 'add-data'; label: string };

export interface AdvisorContext {
  derived: DerivedInputs | null;
  employmentType?: EmploymentType | undefined;
  incomeNeeded: boolean;
  /** True when an "Emergency fund" goal already exists — the action becomes "Top up" instead of "Set goal". */
  hasEmergencyGoal?: boolean;
}

/**
 * The recommended action for a (typically weak) score component, or null if there's nothing useful to
 * suggest. Only components with a clear, computable next step return a goal; others navigate/inform.
 */
export function guidanceForComponent(c: ScoreComponent, ctx: AdvisorContext): GuidanceAction | null {
  switch (c.key) {
    case 'emergency_fund': {
      // Already have an emergency-fund goal → point to it ("Top up") rather than create a duplicate.
      if (ctx.hasEmergencyGoal) return { kind: 'navigate', label: 'Top up', to: PATHS.app.goals };
      const months = emergencyFundMonths(ctx.employmentType);
      const avg = ctx.derived?.avgMonthlyExpenses ?? 0;
      if (avg <= 0) return { kind: 'add-data', label: 'Add expenses' };
      return {
        kind: 'goal',
        label: 'Set goal',
        template: {
          name: 'Emergency fund',
          targetAmount: Math.round(months * avg),
          currentAmount: Math.round(ctx.derived?.liquidAssets ?? 0),
          risk: 'conservative',
          icon: 'ti-umbrella'
        }
      };
    }
    case 'insurance':
      return { kind: 'navigate', label: 'Add cover', to: PATHS.app.insurance };
    case 'savings_rate':
      return ctx.incomeNeeded
        ? { kind: 'add-data', label: 'Add income' }
        : { kind: 'navigate', label: 'Review spend', to: PATHS.app.expenses };
    case 'debt_income':
      return { kind: 'navigate', label: 'Review', to: PATHS.app.loans };
    case 'goals':
      return { kind: 'navigate', label: 'Review', to: PATHS.app.goals };
    case 'diversification':
      return { kind: 'navigate', label: 'Invest', to: PATHS.app.portfolio };
    default:
      return null;
  }
}
