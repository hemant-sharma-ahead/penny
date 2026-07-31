# Calculators

## What it is

India-first, pure on-device financial calculators — zero backend, zero network calls. A
searchable hub at `/app/calculators`; each calculator has a pure-logic core in
`packages/core/src/core/calculators/`, a UI component in `features/calculators/`, and unit
tests in `packages/core/tests/calculators/calculators.test.ts`.

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
(overlaps Goals), compound vs simple interest (purely educational).

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

## UI & placement

- **Entry point:** a "Calc" tile in the Modules grid of the Settings drawer → navigates to
  `/app/calculators`.
- **Page:** searchable list at `/app/calculators` (search box + scrollable list); tapping a
  calculator opens a focused detail screen with a back button. Direct deep-link via
  `?calc=<id>`.
- All amounts respect privacy-mode masking. Inputs/results reuse shared primitives
  (`LabeledInput`, `SegmentedToggle`, `ResultCard`, `AmountRow`, `ResultRow`, `HeroResult`).

## Mobile (`apps/mobile`)

Ported in full — same 10 calculators, same pure-logic core (shared via `packages/core`, no
platform-specific logic needed since these are pure math with no storage/network
dependency). RN-specific note: Tax's Optimize "what-if" deduction sliders needed
`@react-native-community/slider` (no RN range-input equivalent existed elsewhere in the
app) — see `docs/plans/mobile-migration.md`'s playbook.

## Files

- `packages/core/src/core/calculators/` — pure logic: `fire.ts`, `taxRegime.ts`, `hra.ts`,
  `sipSwp.ts`, `fdRd.ts`, `lumpsum.ts`, `capitalGains.ts`, `gratuity.ts`, `ssy.ts`,
  `inflation.ts`, `index.ts` (barrel)
- `apps/web-react/src/features/calculators/` / `apps/mobile/src/features/calculators/` —
  `CalculatorsPage.tsx`, `calculatorRegistry.ts`, `CalcUI.tsx`, one component per calculator
- `packages/core/tests/calculators/calculators.test.ts` — unit tests (one describe block
  per engine)
