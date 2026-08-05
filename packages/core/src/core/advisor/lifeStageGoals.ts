// Life-stage goal templates (Home advisor). From the user's opt-in Life & household profile, generate
// pre-filled savings-goal suggestions with India benchmarks + inflation. Advice-only, on-device; the
// user edits amounts/dates before or after adding. See docs/plans/home-financial-advisor.md.
import type { Profile } from '@/core/db/types';
import { DAY_MS } from '@/lib/date';
import type { GoalTemplate } from './guidance';

// Rough India benchmarks (today's money) — deliberately editable starting points, not advice. Kept as
// flat constants for Education/Home/Marriage: unlike Retirement (below), there's no real user data
// (a tracked home price, a wedding budget) these could be computed from instead — confirmed 2026-08-05,
// deliberately left as-is rather than inventing a second guessed formula in place of a guessed constant.
const EDU_COLLEGE_TODAY = 2_500_000; // ~₹25L for a 4-year degree today
const EDU_INFLATION = 0.08;
const COLLEGE_AGE = 18;
const HOME_DOWNPAYMENT = 2_000_000; // ~₹20L
const MARRIAGE_FUND = 1_000_000; // ~₹10L

const round = (n: number) => Math.round(n / 1000) * 1000;

/** Real, computed retirement target for the "Retirement corpus" suggestion — the caller (`SuggestedGoals.tsx`)
 *  computes this via `calcRetirementProjection()`, the exact same function and stored `RetirementPlan`
 *  Home's own Retirement Corpus chart uses, so the suggested number always matches what Home already
 *  shows instead of being a second, independent guess. `undefined` when there isn't enough real data
 *  (no expense tracking yet) to compute a meaningful number — deliberately means "don't suggest this
 *  goal at all" (see the call site below), not "fall back to a guessed constant", since a confidently
 *  wrong number is exactly the problem this replaces (found 2026-08-05 — the old flat ₹2Cr constant
 *  could be off by an order of magnitude from someone's real number). */
export interface RetirementSuggestion {
  targetAmount: number;
  yearsToRetirement: number;
}

/**
 * Suggested life-stage goals for a profile. Degrades gracefully: with no household data, only
 * Retirement corpus (when computable) is suggested. Callers dedupe against existing goals (by name).
 */
export function lifeStageGoalTemplates(
  profile: Profile | null | undefined,
  retirement: RetirementSuggestion | null | undefined,
  nowMs: number = Date.now()
): GoalTemplate[] {
  if (!profile) return [];
  const risk = profile.riskAppetite ?? 'moderate';
  const nowYear = new Date(nowMs).getFullYear();
  const out: GoalTemplate[] = [];

  // Education corpus per dependent still years away from college.
  for (const birthYear of profile.children ?? []) {
    const age = nowYear - birthYear;
    if (age >= COLLEGE_AGE) continue;
    const years = Math.max(1, COLLEGE_AGE - age);
    out.push({
      name: `Education corpus (born ${birthYear})`,
      targetAmount: round(EDU_COLLEGE_TODAY * (1 + EDU_INFLATION) ** years),
      currentAmount: 0,
      risk,
      icon: 'ti-school',
      targetDate: nowMs + years * 365 * DAY_MS
    });
  }

  if (profile.homeOwner === false) {
    out.push({
      name: 'Home down-payment',
      targetAmount: HOME_DOWNPAYMENT,
      currentAmount: 0,
      risk,
      icon: 'ti-home',
      targetDate: nowMs + 3 * 365 * DAY_MS
    });
  }

  if (profile.maritalStatus === 'single') {
    out.push({
      name: 'Marriage fund',
      targetAmount: MARRIAGE_FUND,
      currentAmount: 0,
      risk,
      icon: 'ti-heart',
      targetDate: nowMs + 2 * 365 * DAY_MS
    });
  }

  // Real, computed target only — no fallback constant. See `RetirementSuggestion`'s doc comment above.
  if (retirement) {
    out.push({
      name: 'Retirement corpus',
      targetAmount: round(retirement.targetAmount),
      currentAmount: 0,
      risk,
      icon: 'ti-umbrella', // matches core/goals/meta.ts's 'retirement' keyword icon — see its 2026-08-02 note
      targetDate: nowMs + Math.max(1, retirement.yearsToRetirement) * 365 * DAY_MS
    });
  }

  return out;
}
