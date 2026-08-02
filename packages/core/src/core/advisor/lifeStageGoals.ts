// Life-stage goal templates (Home advisor). From the user's opt-in Life & household profile, generate
// pre-filled savings-goal suggestions with India benchmarks + inflation. Advice-only, on-device; the
// user edits amounts/dates before or after adding. See docs/plans/home-financial-advisor.md.
import type { Profile } from '@/core/db/types';
import { DAY_MS } from '@/lib/date';
import type { GoalTemplate } from './guidance';

// Rough India benchmarks (today's money) — deliberately editable defaults, not advice.
const EDU_COLLEGE_TODAY = 2_500_000; // ~₹25L for a 4-year degree today
const EDU_INFLATION = 0.08;
const COLLEGE_AGE = 18;
const HOME_DOWNPAYMENT = 2_000_000; // ~₹20L
const MARRIAGE_FUND = 1_000_000; // ~₹10L
const RETIREMENT_CORPUS = 20_000_000; // ~₹2Cr

const round = (n: number) => Math.round(n / 1000) * 1000;

/**
 * Suggested life-stage goals for a profile. Degrades gracefully: with no household data, only the
 * universal Retirement corpus is suggested. Callers dedupe against existing goals (by name).
 */
export function lifeStageGoalTemplates(
  profile: Profile | null | undefined,
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

  // Universal — everyone should be building toward retirement.
  out.push({
    name: 'Retirement corpus',
    targetAmount: RETIREMENT_CORPUS,
    currentAmount: 0,
    risk,
    icon: 'ti-umbrella', // matches core/goals/meta.ts's 'retirement' keyword icon — see its 2026-08-02 note
    targetDate: nowMs + 20 * 365 * DAY_MS
  });

  return out;
}
