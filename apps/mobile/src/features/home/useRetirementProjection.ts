import { useEffect, useMemo, useState } from 'react';
import { useRetirementPlan } from '@/hooks/useRetirementPlan';
import { useProfile } from '@/hooks/useProfile';
import { deriveAge } from '@/lib/date';
import { calcRetirementProjection, type RetirementProjectionResult } from '@/core/calculators/retirementProjection';
import { netWorthSnapshotsRepo } from '@/core/db/repositories';
import type { NetWorthSnapshot, RetirementPlan } from '@/core/db/types';
import { useHomeStats } from './useHomeStats';
import type { HomeSummary } from './useHome';

/** One point on the Retirement Corpus chart's combined timeline. */
export interface CorpusChartPoint {
  /** Epoch ms — real for `historical`/`today`, a projected calendar date for `projected`. */
  t: number;
  value: number;
  kind: 'historical' | 'today' | 'projected';
}

export interface RetirementProjectionState {
  plan: RetirementPlan | null;
  loading: boolean;
  updatePlan: (patch: Partial<Omit<RetirementPlan, 'id' | 'createdAt'>>) => void;
  currentAge: number;
  /** Trailing actual spend if the plan has no override, else the user's own edited figure — same
   *  "own input always wins" pattern FireCalculator uses for age. */
  monthlyExpenseToday: number;
  projection: RetirementProjectionResult | null;
  /** Combined historical + today + projected points, ready for the chart. Historical is only present
   *  once ≥2 real monthly snapshots exist — see `NetWorthSnapshot`'s doc comment; never synthetic. */
  points: CorpusChartPoint[];
  hasHistorical: boolean;
}

const FALLBACK_AGE = 30;

/**
 * Assembles everything `GlanceHeader`'s Retirement Corpus card and `RetirementDrilldownModal` need:
 * the shared `RetirementPlan`, live investable corpus from `useHome`, real monthly snapshots (for the
 * chart's historical segment), profile-derived current age, and trailing actual spend (for the
 * expense auto-fill). Mirrors `FireCalculator.tsx`'s existing "derived default, user's own edit always
 * wins" pattern for both age and monthly expense.
 */
export function useRetirementProjection(summary: HomeSummary | null): RetirementProjectionState {
  const { plan, loading: planLoading, update } = useRetirementPlan();
  const { profile } = useProfile();
  const stats = useHomeStats();
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([]);

  useEffect(() => {
    let cancelled = false;
    netWorthSnapshotsRepo
      .getAll()
      .then((rows) => {
        if (!cancelled) setSnapshots([...rows].sort((a, b) => a.monthKey.localeCompare(b.monthKey)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Re-check whenever Home's own summary reloads — a new monthly snapshot may have just been written
    // by `useHome.ts`'s `captureMonthlySnapshotIfNeeded()`.
  }, [summary?.investableCorpus]);

  // Captured once per mount (lazy initializer), same pattern `useForecast.ts` uses for its own `nowMs`
  // — avoids calling the impure `Date.now()` directly inside a render/useMemo body.
  const [nowMs] = useState(() => Date.now());

  const derivedAge = profile?.dob ? deriveAge(profile.dob) : null;
  const currentAge = derivedAge ?? FALLBACK_AGE;
  const monthlyExpenseToday = plan?.monthlyExpenseOverride ?? stats?.livingThisMonth ?? 0;

  const projection = useMemo(() => {
    if (!plan || !summary) return null;
    return calcRetirementProjection(
      {
        currentAge,
        retirementAge: plan.retirementAge,
        investableCorpusToday: summary.investableCorpus,
        monthlyExpenseToday,
        monthlyInvestment: plan.monthlyInvestment,
        expectedReturnPct: plan.expectedReturnPct,
        inflationPct: plan.inflationPct,
        swrPct: plan.swrPct
      },
      nowMs
    );
  }, [plan, summary, currentAge, monthlyExpenseToday, nowMs]);

  const historicalPoints = useMemo<CorpusChartPoint[]>(() => {
    if (snapshots.length < 2) return [];
    return snapshots.map((s) => ({ t: s.capturedAt, value: s.investableCorpus, kind: 'historical' as const }));
  }, [snapshots]);

  const points = useMemo<CorpusChartPoint[]>(() => {
    if (!projection) return [];
    const projected: CorpusChartPoint[] = projection.yearlyPath.map((p, i) => {
      const d = new Date(nowMs);
      if (i > 0) d.setFullYear(d.getFullYear() + i);
      return { t: d.getTime(), value: p.corpus, kind: i === 0 ? ('today' as const) : ('projected' as const) };
    });
    // Guards against clock skew rather than trusting capturedAt blindly.
    const hist = historicalPoints.filter((h) => h.t < nowMs);
    return [...hist, ...projected];
  }, [projection, historicalPoints, nowMs]);

  return {
    plan,
    loading: planLoading || !summary,
    updatePlan: update,
    currentAge,
    monthlyExpenseToday,
    projection,
    points,
    hasHistorical: historicalPoints.length > 0
  };
}
