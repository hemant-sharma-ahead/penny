// Retirement Corpus projection — sibling to fire.ts's `calcFire()`, but solving for a *fixed* target
// retirement year instead of solving for the earliest year FI is reached. Powers both Home's
// "Retirement Corpus" hero card and the FIRE Calculator's "at your planned retirement age" result —
// both read one shared `RetirementPlan` (see `packages/core/src/hooks/useRetirementPlan.ts`).
//
// `fire.ts`'s `calcFire()` is unchanged and still owns the "years to FI at current pace" question.

import type { AssetClass, Holding } from '@/core/db/types';

export interface RetirementProjectionInput {
  currentAge: number;
  retirementAge: number;
  investableCorpusToday: number;
  monthlyExpenseToday: number;
  monthlyInvestment: number;
  expectedReturnPct: number;
  inflationPct: number;
  swrPct: number;
}

export interface RetirementYearPoint {
  year: number; // calendar year
  age: number;
  corpus: number; // investable corpus projected at this point
}

export interface RetirementProjectionResult {
  yearsToRetirement: number;
  yearlyPath: RetirementYearPoint[]; // length yearsToRetirement + 1, index 0 = today
  corpusNeeded: number; // inflation-adjusted FIRE number at the retirement year
  corpusProjected: number; // projected investable corpus at the retirement year
  percentFunded: number; // round(corpusProjected / corpusNeeded * 100)
  expenseAtRetirement: number; // monthly, inflation-adjusted
  monthlyGapToClose: number; // extra monthly investment needed to hit corpusNeeded exactly by the target year; 0 if already funded
}

/**
 * Projects investable corpus forward to a *fixed* retirement age (as opposed to `calcFire()`, which
 * solves for the earliest year FI is reached at the current pace). Annual compounding, contribution
 * added at year-end (an ordinary annuity) — see docs/features/home.md for the worked example this
 * mirrors.
 */
export function calcRetirementProjection(
  input: RetirementProjectionInput,
  nowMs: number = Date.now()
): RetirementProjectionResult {
  const {
    currentAge,
    retirementAge,
    investableCorpusToday,
    monthlyExpenseToday,
    monthlyInvestment,
    expectedReturnPct,
    inflationPct,
    swrPct
  } = input;

  const years = Math.max(0, retirementAge - currentAge);
  const r = expectedReturnPct / 100;
  const infl = inflationPct / 100;
  const swr = swrPct / 100;
  const currentYear = new Date(nowMs).getFullYear();

  const expenseAtRetirement = monthlyExpenseToday * Math.pow(1 + infl, years);
  const corpusNeeded = swr > 0 ? (expenseAtRetirement * 12) / swr : 0;

  const yearlyPath: RetirementYearPoint[] = [{ year: currentYear, age: currentAge, corpus: investableCorpusToday }];
  let corpus = investableCorpusToday;
  for (let t = 1; t <= years; t++) {
    corpus = corpus * (1 + r) + monthlyInvestment * 12;
    yearlyPath.push({ year: currentYear + t, age: currentAge + t, corpus });
  }
  const corpusProjected = yearlyPath[yearlyPath.length - 1]?.corpus ?? investableCorpusToday;

  const percentFunded = corpusNeeded > 0 ? Math.round((corpusProjected / corpusNeeded) * 100) : 0;

  // Closed-form gap-to-close — internally consistent with the loop above: plugging
  // `monthlyInvestment + monthlyGapToClose / 12` back into the same loop lands almost exactly on
  // corpusNeeded (see calculators.test.ts's consistency assertion).
  const fvExisting = investableCorpusToday * Math.pow(1 + r, years);
  const annuityFactor = years === 0 ? 0 : r === 0 ? years : (Math.pow(1 + r, years) - 1) / r;
  const remaining = corpusNeeded - fvExisting - monthlyInvestment * 12 * annuityFactor;
  const monthlyGapToClose = remaining <= 0 || annuityFactor === 0 ? 0 : remaining / annuityFactor / 12;

  return {
    yearsToRetirement: years,
    yearlyPath,
    corpusNeeded,
    corpusProjected,
    percentFunded,
    expenseAtRetirement,
    monthlyGapToClose
  };
}

// Asset classes that can actually fund a 4%-withdrawal retirement lifestyle — deliberately excludes
// 'vehicle' | 'property' | 'other', since that equity can't be drawn down the way a liquid/market-linked
// holding can (matches how FIRE calculators and Empower's retirement planner scope their own corpus
// figure). This is why the Retirement Corpus chart plots a smaller, different number than the
// Home net-worth figure — see docs/features/home.md.
const INVESTABLE_ASSET_CLASSES = new Set<AssetClass>(['mf', 'stock', 'fd', 'nps', 'ppf', 'epf', 'gold']);

/**
 * Sums the subset of holdings that count toward the retirement/FIRE corpus, plus liquid funds
 * (cash/bank accounts already counted toward net worth). Reuses `useHome.ts`'s existing
 * `currentValue ?? investedAmount` convention rather than re-deriving holding value another way.
 */
export function calcInvestableCorpus(holdings: Holding[], liquidFunds: number): number {
  const investableHoldings = holdings.reduce(
    (sum, h) => (INVESTABLE_ASSET_CLASSES.has(h.assetClass) ? sum + (h.currentValue ?? h.investedAmount) : sum),
    0
  );
  return investableHoldings + liquidFunds;
}
