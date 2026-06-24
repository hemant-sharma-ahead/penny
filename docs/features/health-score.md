# Health Score

## What it is

A composite financial health score (0–100) that measures how well-structured your finances are across 6 dimensions. Like a credit score but for your entire financial life — it tells you at a glance how healthy your money situation is and where to focus next.

## User-facing capabilities

- See your overall health score (0–100) and letter grade (A+ through D) on a single screen
- Understand your score across 6 dimensions: Diversification, Emergency Fund, Insurance Coverage, Debt Management, Goal Progress, and Savings Rate
- Get plain-language explanations of what each dimension score means and what's holding you back
- See a prioritised list of actions that would improve your score the most
- Understand the grade thresholds: A+ (90–100), A (80–89), B (70–79), C (60–69), D (below 60)

## How it works

**Scoring model — 6 components, 20 points each:**

1. **Diversification (20 pts)** — Number of distinct asset classes held (equity, debt/FD, real estate, gold, NPS/PPF/EPF, other). Holding 4 or more classes earns full marks. Scales linearly below that.

2. **Emergency fund (20 pts)** — Liquid savings (savings accounts + FDs ≤ 1 year) divided by average monthly expenses. Target is 6× monthly expenses. Score scales linearly: 3× = 10 pts, 6× = 20 pts.

3. **Insurance coverage (20 pts)** — Split between term life (sum assured ÷ annual income × 10, capped at 20 pts) and health insurance existence check (partial score if health policy exists). Employment type from profile adjusts benchmarks (e.g. self-employed users have no EPF and a higher emergency fund target).

4. **Debt management (20 pts)** — Primarily EMI-to-income ratio (target < 40%). Credit card utilisation is a secondary signal. Lower debt burden = higher score, scoring is inverse linear.

5. **Goal progress (20 pts)** — Ratio of goals "on track" to total goals. A goal is on track if `currentAmount / targetAmount ≥ monthsElapsed / totalMonths`.

6. **Savings rate (20 pts)** — Monthly net savings divided by monthly income. Target is above 20%. Scales linearly up to that threshold.

**Key files:**
- `src/core/health/scorer.ts` — `computeHealthScore()` and `deriveInputs()` functions
- `src/features/health/HealthScorePage.tsx` — thin composition: income input + gauge + breakdown
- `src/features/health/useHealthScore.ts` — loads the 5-repo snapshot, derives inputs, owns income state
- `src/features/health/ScoreGauge.tsx` / `ComponentCard.tsx` / `ScoringGuide.tsx` — presentational pieces

**Inputs pulled from:** `holdings`, `expenses`, `goals`, `liabilities`, `insurance_policies`, and `profile` (employment type for benchmark adjustments)

**Score is recalculated on every page open** — there is no caching or stored history today.

## Current limitations

- Does not account for number of dependents — a family of four needs a larger emergency fund than a single person, but the score does not yet differentiate.
- Employment type and DOB from profile (Pre-Phase 1.5 fields) are not yet used for benchmark adjustments; defaults are applied for all users.
- Score history is not stored, so you cannot see whether your score has improved over time.
- Income used in savings rate and debt-to-income calculations must be entered manually in profile; it is not auto-derived from the expenses store.

## Planned improvements

- **Pre-Phase 1.5:** DOB and employment type collected during onboarding will improve benchmark accuracy (e.g. different emergency fund multipliers for salaried vs self-employed).
- **Phase 2:** Score history graph showing monthly trend. Action plan generation by Chip based on the lowest-scoring dimensions.
- **Phase 2:** Household health score — a group-level composite score for Phase 1.5 Groups, aggregating individual scores with shared-liability adjustments.
- **Phase 2:** Dependents field in profile feeds into emergency fund and insurance benchmarks.

## Ideas welcome

- Should the score weight components differently based on life stage (e.g. a 25-year-old needs to weight savings rate more heavily than insurance)?
- What's the right threshold for "on track" for a goal — strict linear, or should early-stage goals get more lenient treatment?
- Should the score penalise *over-concentration* in a single asset class (e.g. 90% in equity), or only reward diversification?
