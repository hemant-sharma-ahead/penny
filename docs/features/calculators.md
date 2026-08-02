# Calculators

## What it is

India-first, pure on-device financial calculators — zero backend, zero network calls. Each
calculator has a pure-logic core in `packages/core/src/core/calculators/`, a UI component in
`features/calculators/`, and unit tests in `packages/core/tests/calculators/calculators.test.ts`.

**As of 2026-08-01, `apps/mobile` diverges from `apps/web-react` (frozen) here**: web still has
a standalone, searchable "Calculators" hub reachable from a Modules-grid tile in Settings (as
described further below, historical/web-only). Mobile removed that hub entirely and relocated
every calculator to the screen it's actually about — see "Mobile — 2026-08-01 relocation" below.

## Calculators (10)

| #   | Calculator              | id              | What it does                                                                      | Logic source        |
| --- | ------------------------ | --------------- | ------------------------------------------------------------------------------------ | -------------------- |
| 1   | FIRE                    | `fire`          | Corpus to retire early + years/age to financial independence (inflation-adjusted) | `fire.ts`            |
| 2   | Old vs New Tax Regime   | `tax-regime`    | Compares income tax under both regimes (slabs, deductions, 87A, cess)             | `taxRegime.ts`       |
| 3   | HRA Exemption           | `hra`           | Section 10(13A) exemption — least of the three statutory amounts                  | `hra.ts`             |
| 4   | SIP & SWP Planner       | `sip-swp`       | Step-up SIP accumulation → SWP drawdown; corpus survival + year-by-year schedule  | `sipSwp.ts`          |
| 5   | FD / RD Maturity        | `fd-rd`         | Fixed & recurring deposit maturity + interest, all compounding frequencies        | `fdRd.ts`            |
| 6   | Lumpsum & CAGR          | `lumpsum`       | Future value of a one-time investment, or annualised return (CAGR) from start/end | `lumpsum.ts`         |
| 7   | Capital Gains Tax       | `capital-gains` | LTCG / STCG on equity, debt, gold, property — post-Budget-2024 rules + 4% cess    | `capitalGains.ts`    |
| 8   | Gratuity                | `gratuity`      | Payment of Gratuity Act: 15/26 formula, ₹20L cap, 5-year eligibility flag         | `gratuity.ts`        |
| 9   | Sukanya Samriddhi       | `ssy`           | Girl-child scheme: 21-year maturity, deposits stop after year 15, passbook        | `ssy.ts`             |
| 10  | Inflation / Future Cost | `inflation`     | Future cost of today's money + purchasing-power erosion                           | `inflation.ts`       |

**Deliberately not built:** PPF Maturity and NPS Corpus calculators — NPS/PPF/EPF are
already tracked live in the Portfolio module, so standalone calculators would be redundant.
Also considered and passed on: EMI/Loan (Loans module already has EMI + amortization),
retirement corpus (overlaps FIRE), EPF maturity (tracked in Portfolio), goal planner
(overlaps Goals), compound vs simple interest (purely educational). **This is the same
principle the 2026-08-01 mobile relocation below just extends to the remaining 8** — once a
calculator's answer lives somewhere real (a Portfolio holding, a Goal, a Tax return), that's
its home; a calculator with no such home doesn't need its own screen either (see Inflation).

## Key calculation notes

- **SIP & SWP** — SIP contributions compound at end of month (ordinary annuity); SWP
  withdrawals taken at start of month, remainder grows. Step-up and withdrawal increase
  applied at year boundaries. Reports whether the corpus survives the withdrawal period
  or depletes early (`monthsCorpusLasted`).
- **Capital Gains** — long-term special rate 12.5% (no indexation). Equity LT needs 12
  months and gets the ₹1.25L exemption; equity ST is flat 20%. Gold/property LT need 24
  months; their ST and all debt gains are taxed at the user's slab. 4% health & education
  cess added on top. Capital losses show zero tax.
- **Gratuity** — a part-year of more than 6 months rounds up to a full year; figure shown
  even below 5 years of service with an "indicative" warning.
- **SSY** — deposits modelled at the start of each year for 15 years; balance keeps
  compounding annually until 21-year maturity. Flags deposits outside the ₹250–₹1.5L band.

## UI & placement (`apps/web-react`, frozen — historical reference only)

- **Entry point:** a "Calc" tile in the Modules grid of the Settings drawer → navigates to
  `/app/calculators`.
- **Page:** searchable list at `/app/calculators` (search box + scrollable list); tapping a
  calculator opens a focused detail screen with a back button. Direct deep-link via
  `?calc=<id>`.
- All amounts respect privacy-mode masking. Inputs/results reuse shared primitives
  (`LabeledInput`, `SegmentedToggle`, `ResultCard`, `AmountRow`, `ResultRow`, `HeroResult`).

## Mobile (`apps/mobile`) — 2026-08-01 relocation

Ported in full originally (same 10 calculators, same pure-logic core, no platform-specific
logic needed) as a mirror of web's searchable hub. On review, that hub — reached only via a
"Calc" tile buried in Settings' Modules grid — put every calculator one navigation hop away
from the real data it's about, and the Modules grid itself had shrunk to just 3 toggles
(Portfolio/Goals tab visibility + Calc), two of which weren't even about calculators. Removed
entirely and replaced with contextual entry points:

| Calculator | Mobile home | How it's reached |
|---|---|---|
| Tax Regime, HRA | Tax Awareness (`CalculatorsPillar.tsx`) | Already embedded there before this pass — unchanged; the standalone hub copy was the only thing removed |
| Capital Gains | Tax Awareness (`CapitalGainsTab.tsx`) only | Computed from real transactions, not the generic scratch calculator — that generic version (`CapitalGainsCalculator.tsx`) had no other host and was deleted on mobile |
| FD / RD Maturity | Portfolio → Fixed Income tab | `CalculatorsSection` entry row → `Modal` |
| Gratuity, SSY | Portfolio → Retirement tab | `CalculatorsSection` entry row → `Modal` |
| FIRE, SIP & SWP Planner, Lumpsum & CAGR | Goals (tab strip) | Rendered inline as a Goals tab, same as the pre-existing Goal SIP tab |
| Inflation | Goals — inline helper on `GoalForm`'s target-amount/date fields | Not a screen at all anymore; `calcInflation()` called directly |

New shared piece: `features/calculators/CalculatorsSection.tsx` — an icon+title+subtitle entry
row that opens a calculator's existing, unchanged form inside the shared centred `Modal`
(never a bottom sheet, per `docs/DESIGN_GUIDELINES.md`) rather than a pushed screen, so
Portfolio didn't need its own nested `Stack.Navigator` just for this (see `MainTabs.tsx`'s
doc comment on why Portfolio renders directly today). `calculatorRegistry.ts` shrank to just
the 6 relocated ids' metadata (icon/color/title for the entry rows + Modal header) —
`searchCalculators()`/`keywords` were dropped along with the searchable hub.

Also removed as a consequence: Home's `ToolsGrid.tsx` (Calculators was its last tile — the
whole "Tools" section is gone from `HomePage.tsx` now, not left empty), the "Calculators"
route from `HomeStack.tsx`, and Settings' entire "Modules" section (`ModuleVisibility`,
`MODULES` grid, and `MainTabs.tsx`'s tab-hiding logic for Portfolio/Goals — those two tabs are
now always shown). See `docs/ARCHITECTURE.md`'s 2026-08-01 entry for the full change list.

RN-specific note carried over from the original port: Tax's Optimize "what-if" deduction
sliders needed `@react-native-community/slider` (no RN range-input equivalent existed
elsewhere in the app) — see `docs/plans/mobile-migration.md`'s playbook.

## Files

- `packages/core/src/core/calculators/` — pure logic: `fire.ts`, `taxRegime.ts`, `hra.ts`,
  `sipSwp.ts`, `fdRd.ts`, `lumpsum.ts`, `capitalGains.ts`, `gratuity.ts`, `ssy.ts`,
  `inflation.ts`, `index.ts` (barrel) — shared by both platforms, unchanged by the mobile
  relocation
- `apps/web-react/src/features/calculators/` (frozen) — `CalculatorsPage.tsx`,
  `calculatorRegistry.ts` (still has all 10 + search), `CalcUI.tsx`, one component per
  calculator
- `apps/mobile/src/features/calculators/` — `calculatorRegistry.ts` (6 ids only),
  `CalculatorsSection.tsx` (entry row + Modal), one component per relocated calculator
  (`FireCalculator.tsx`, `SipSwpCalculator.tsx`, `FdRdCalculator.tsx`,
  `LumpsumCalculator.tsx`, `GratuityCalculator.tsx`, `SsyCalculator.tsx`,
  `TaxRegimeCalculator.tsx`, `HraCalculator.tsx` — the last two imported directly by Tax's
  `CalculatorsPillar.tsx`, not through the registry); no `CalculatorsPage.tsx`,
  `CapitalGainsCalculator.tsx`, or `InflationCalculator.tsx` on mobile (deleted)
- `packages/core/tests/calculators/calculators.test.ts` — unit tests (one describe block
  per engine), unaffected by the mobile relocation
