# Tax Awareness

## What it is

Shows your tax position across the current financial year — how much of your 80C/80D/24B deduction limits you have used, your capital gains exposure across equity and debt, and a side-by-side comparison of old vs new tax regime. It does not file taxes; it helps you understand where you stand and where you should act before March 31.

## User-facing capabilities

- See how much of your 80C limit (₹1.5L) is already used vs remaining, broken down by instrument (EPF, PPF, ELSS, home loan principal, LIC premiums, NSC, SCSS, tuition fees)
- See your 80D utilisation (₹25K own family / ₹50K with senior-citizen parents) from health insurance premiums
- See your 24B home loan interest deduction utilisation (₹2L limit under old regime)
- See unrealised LTCG and STCG on equity holdings, with estimated tax due if you sell today
- See indexed cost and long-term capital gain on debt fund and gold holdings held over 3 years
- Compare estimated tax liability under old regime (with deductions) vs new regime (lower slabs, no deductions)
- Track the current financial year (April–March), how many days remain, and a plain-language summary of what to do before year-end

## How it works

**Deduction tracking (Old Tax Regime):**

- **80C** aggregates: EPF contributions from the `holdings` store (EPF asset class), PPF/ELSS holdings, home loan principal from `liabilities` (type `home_loan`, derived from amortisation schedule), and insurance premiums from `insurance_policies` where type is `term_life`, `whole_life`, or `endowment`.
- **80D** pulls health insurance premiums from `insurance_policies` where type is `health`. Split into own-family (≤ ₹25K) and parents (additional ≤ ₹25K, or ₹50K if parents are senior citizens — senior-citizen flag is a Phase 2 addition).
- **24B** pulls home loan interest from the `liabilities` store, calculated from outstanding balance, rate, and EMI schedule if available.

**Capital gains:**

- Holdings in `holdings` store with `assetClass: 'equity'` or `'mf'` use `purchaseDate` to determine holding period.
- LTCG (> 1 year): 10% on gains above ₹1L per year. Estimated tax shown as `max(0, totalGain - 100000) × 0.10`.
- STCG (≤ 1 year): 15% flat on gains.
- Debt funds and gold held > 3 years: indexed cost calculated using CII (Cost Inflation Index) table embedded in the calculator. LTCG = current value − indexed cost, taxed at 20%.

**Old vs new regime comparison:**

- Takes total income (user-entered in profile), subtracts applicable deductions under old regime, applies slab rates for both regimes, and shows the difference.
- Standard deduction of ₹50K (salaried) applied automatically under old regime.

**Key files:**
- `src/core/tax/calculator.ts` — all computation logic
- `src/features/tax/TaxAwarenessPage.tsx` — display page

**Inputs from:** `holdings` (purchase dates, units, values), `liabilities` (home loan interest), `insurance_policies` (premiums), `profile` (income)

**FY boundary:** April 1 – March 31. The calculator uses `new Date()` to determine current FY and days remaining.

## Current limitations

- Total income must be manually entered in the profile. It is not auto-calculated from the accounts or expenses stores.
- TDS (tax deducted at source) is not tracked — the estimated tax due does not account for TDS already paid by your employer or broker.
- Senior-citizen parent flag for enhanced 80D limit is not yet captured; the tool defaults to the ₹25K parent limit for all users.
- The old vs new regime comparison uses a simplified slab model and does not handle surcharge or cess accurately for income above ₹50L.
- ITR filing deadlines are shown as static text; no reminders or calendar integration.

## Planned improvements

- **Pre-Phase 1.5:** Pull income total automatically from the accounts store when salary credits are tracked.
- **Phase 2 (M13):** Old vs new regime calculator as a standalone interactive tool where users can adjust income and deduction sliders.
- **Phase 2:** ITR deadline reminders pushed as in-app notifications (July 31 and revised deadline if extended).
- **Phase 2:** ELSS investment tracker showing individual tranche lock-in periods (3 years per SIP instalment).
- **Phase 2:** Senior-citizen parent flag in profile to unlock enhanced 80D limit.
- **Phase 2:** TDS tracker — log TDS certificates (Form 16, Form 16A) and subtract from estimated tax due.

## Ideas welcome

- Should tax-loss harvesting suggestions be surfaced automatically (e.g. "You have ₹1.2L LTCG — selling this underperformer would offset it")?
- What is the right way to handle NRI tax status, which has different slab rates and no 80C benefit?
- Should the tool track advance tax payment deadlines (June 15, Sept 15, Dec 15, March 15) for self-employed users?
