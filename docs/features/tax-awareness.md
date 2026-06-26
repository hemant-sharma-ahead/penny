# Tax Awareness

## What it is

The one place to see every rupee of tax that leaves your pocket — on what you **earn, spend, save, invest and earn as interest** — across any financial year since 2017, and to learn how to pay less. It does not file taxes; it builds awareness and shows where to act.

**Four pillars** (`TaxAwarenessPage` `TabStrip`), each with a sub-strip where useful:
- **Footprint** — the income waterfall + money-flow visual + shareable Tax Story + FY switcher.
- **Explore** — the "tax X-ray" of everyday money moves + the GST/levy rate reference & history.
- **Optimize** — tax-saving *Suggestions* (headroom, regime, 80G, what-if, ITR helper) + the detailed *Deductions* tracker.
- **Calc** — Regime · HRA · Capital Gains calculators in one place. (The global Calculators hub at `/app/calculators` remains the searchable index.)

Models **GST 2.0** (22 Sep 2025: 12% & 28% retired → mostly 5%/18%, new 40% de-merit slab, insurance exempted) and **per-FY direct-tax slabs FY2017-18 → FY2026-27**, applying the rate/slab in force for the selected year.

## User-facing capabilities

- **Income waterfall (Footprint)** — derives gross from logged income (editable) and flows it down: −EPF/PF → −professional tax/LWF → −income tax → **in-hand** → spend vs savings. Answers *"of the money you didn't save, how much was direct tax, how much indirect, how much real spending."* A **money-flow bar** shows how every rupee of gross splits four ways (saved / direct tax / indirect tax / real spend). Every input is overridable; overspending (spending from savings/credit) is flagged.
- **FY switcher** — view any financial year back to FY2017-18; income, indirect tax and direct tax recompute with that year's rates/slabs.
- **Shareable "Tax Story"** — a full-screen, on-device card ("you paid ₹X tax — Y% of what you didn't save"); **"Did you know?"** awareness cards seeded on Footprint & Explore.
- **Tax X-ray (Explore)** — pick a money move (fuel, dining, property, vehicle, gold/silver, equity buy/sell, FD interest) and see every embedded levy and charge, with a live amount input. Plus the GST/levy **rate reference** (current slabs, retired slabs, non-GST levies) and a **rate-change history**.
- **Optimize** — regime recommendation, unused **80C/80D/80CCD(1B) headroom** with rupee impact, a **what-if simulator** (deduction sliders → live old-vs-new tax), **80G donation** tiers (50%/100%), and an **ITR-form helper** (ITR-1…4 / HUF). Plus the detailed deductions tracker.
- **Capital gains (Calc)** — unrealised LTCG/STCG across equity and other assets with estimated tax.
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

**Indirect-tax footprint (Track 7):**

- **Rate model** `src/core/tax/indirectTaxRates.ts` — time-versioned tax bands (GST 0/5/12/18/28, fuel, alcohol, tobacco, vehicle, toll, exempt). Each band has `effectiveFrom`-dated rate entries; `rateOn(band, atMs)` picks the rate in force on a transaction's date, and `embeddedTax()` backs the tax out of a tax-inclusive amount (`markup` basis = `rate/(100+rate)`; `share` basis = `rate/100`). Fuel/sin/vehicle/toll figures are labelled estimates.
- **Mapping** `src/core/tax/categoryTaxMap.ts` — default-category → band, with an intent-group fallback and a `SPEND_EXCLUDED` set (SIP/savings are not consumption).
- **Classifier** `src/core/tax/taxBandClassifier.ts` — resolves a band per expense, checking description keywords (fuel/toll/vehicle) **before** the category default, so fuel hidden inside Transport and one-time vehicle/road-tax purchases are caught.
- **Aggregator** `src/core/tax/indirectTax.ts` — `estimateIndirectTax()` rolls spending into totals + by-regime + by-band breakdowns (FY-filtered).
- **Income source** `src/core/tax/footprint.ts` — `sumFyIncome()` / `annualiseRecurringIncome()` derive gross income.

**Direct tax, history & advisory (Track 7 expansion):**
- `src/core/tax/regimeHistory.ts` — per-FY config (old + new regime slabs, std deduction, §87A rebate, cess, surcharge) FY2017-18 → FY2026-27; `fyConfigFor()`.
- `src/core/calculators/taxRegime.ts` — FY-parameterised `compareTaxRegimes(input, fyConfig?)` + `recommendedRegimeTax()`.
- `src/core/tax/fy.ts` — FY selection helpers (`selectableFYs`, `fyWindow`, `shortFYLabel`).
- `src/core/tax/incomeWaterfall.ts` — `computeWaterfall()`, the gross→consumed reconciliation (the spine).
- `src/core/tax/taxScenarios.ts` — the "tax X-ray" scenario data + per-scenario levy calculators.
- `src/core/tax/optimizer.ts` — deduction headroom, regime recommendation, 80G tiers.
- `src/core/tax/itrAdvisor.ts` — ITR-form decision tree.
- `src/core/tax/taxFacts.ts` — "Did you know?" content.

**Key files:**
- `src/core/tax/calculator.ts` — deduction/capital-gains logic (incl. `computeCapitalGainsTax`)
- `src/features/tax/TaxAwarenessPage.tsx` — thin shell: header (FY info) + 4-pillar `TabStrip`
- `src/features/tax/footprint/` — `FootprintTab` + `useFootprint` (FY-aware) + `MoneyFlow` + `share/TaxStoryModal`
- `src/features/tax/explore/ExploreTab.tsx` + `rates/RatesTab.tsx` — tax X-ray + rate reference/history
- `src/features/tax/optimize/` — `OptimizePillar` (Suggestions + Deductions) + `OptimizeTab`
- `src/features/tax/calculators/CalculatorsPillar.tsx` — Regime/HRA/Capital-Gains sub-strip
- `src/features/tax/DidYouKnow.tsx` — rotating awareness card
- `src/context/SettingsContext.tsx` — `taxGrossIncomeOverride` / `taxDirectOverride` / `taxEpfOverride` / `taxStatutoryOverride` (localStorage)

**Inputs from:** `holdings` (purchase dates, units, values), `liabilities` (home loan interest), `insurance_policies` (premiums), `profile` (income)

**FY boundary:** April 1 – March 31. The calculator uses `new Date()` to determine current FY and days remaining.

## Current limitations

- Gross income is derived from FY income transactions (or annualised recurring income); accuracy depends on income being logged. A manual override is available on the Footprint tab.
- The indirect-tax footprint is an **estimate shown as a range** (min–estimate–max) — it infers a GST slab (or fuel/sin/vehicle/toll levy) per category and backs out the embedded tax, then brackets it with per-regime uncertainty (chiefly that some spend is at small/unregistered/composition vendors that don't charge GST). The Explore tab carries a **"When does GST apply?"** card (₹40L/₹20L registration thresholds, composition, exempt items) and a **capital-gains & F&O** reference (LTCG 12.5%/₹1.25L, STCG 20%, holding periods, debt-MF slab, F&O as business income). Actual rates vary by item and state.
- Capital-gains tax in the footprint is on **unrealised** gains (no realised-sale ledger yet) — a "if sold today" proxy.
- TDS (tax deducted at source) is not tracked separately; the Footprint tab offers a manual direct-tax correction instead.
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
