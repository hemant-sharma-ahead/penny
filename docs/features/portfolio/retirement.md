# Retirement Accounts (NPS, PPF, EPF)

## What it is

Penny's Retirement sub-tab tracks the three main long-term savings pillars for Indian investors: NPS (National Pension System), PPF (Public Provident Fund), and EPF (Employee Provident Fund). Each is modelled with its own rules, contribution limits, and projection logic so you can see your expected retirement corpus in one place.

## User-facing capabilities

- **NPS:** Add your NPS holdings with fund type (LC-75, LC-50, LC-25, BLC), choice mode (auto or active), and units. See live NAV and current corpus value. View a year-by-year projection to retirement.
- **PPF:** Maintain a passbook-style ledger with deposits, interest credits, and withdrawals. See how much you've deposited in the current FY vs the ₹1.5L annual limit. View projected corpus to maturity. Entries are tagged with before/after-5th-of-month badges to show whether that month's interest was earned.
- **EPF:** Record each employer with basic salary and service dates. Log all transactions (employee contributions, employer contributions, interest credits, transfers, withdrawals). Add salary hike events per employer to drive a more accurate projection. View your projected corpus at retirement age 58.

## How it works

**NPS:**

- Live NAV fetched from npsnav.in, cached for 24 hours.
- Lifecycle fund tables (LC-75, LC-50, LC-25, BLC) define equity allocation percentages by age for auto choice.
- Active choice: user-specified allocation across equity, corporate bonds, and government bonds.
- Current corpus = NAV × units for each fund type, summed across funds.
- `assetMeta` fields: `npsPfm`, `npsSchemeType`, `npsActiveChoiceAllocation`, `npsUnits`.
- Key files: `src/core/nps/npsClient.ts` (NAV fetch), `src/core/nps/npsLifecycle.ts` (lifecycle tables and projection).

**PPF:**

- Transactions stored in `assetMeta.ppfTransactions[]` as a typed array (`PpfTransaction`).
- Before/after-5th badge: determined by comparing transaction day against the 5th of the month.
- FY deposit bar: sums all deposit transactions in the current April–March FY.
- Projection uses the current PPF interest rate to compound the balance to the maturity date.
- `assetMeta` fields: `ppfAccountNumber`, `ppfOpenDate`, `ppfTransactions[]`.

**EPF:**

- Employer history stored in `assetMeta.epfEmployers[]` (`EpfEmployer` type): company name, basic salary, from date, to date.
- Contributions auto-calculated: employee = 12% of basic; employer EPF = 3.67% of basic (8.33% goes to EPS, capped at ₹1,250/month).
- Salary hike groups (`epfHikeGroups[]`) store a timeline of hike events per employer for projection accuracy.
- Pro-rata logic handles partial first and last months of service.
- Retirement projection targets age 58 using DOB from the user's profile.
- `assetMeta` fields: `epfEmployers[]`, `epfTransactions[]`, `epfHikeGroups[]`.
- Types defined in `src/core/db/types/index.ts`: `EpfEmployer`, `EpfTransaction`, `EpfHikeGroup`, `PpfTransaction`.

**Key file:** `src/features/portfolio/PortfolioPage.tsx` — Retirement sub-tab rendering for all three account types.

**Mobile (`apps/mobile`):** ported in Track 4 (Portfolio module) — `apps/mobile/src/features/portfolio/holdings/retirement/` mirrors the web files above; this is the single biggest sub-scope in the entire Portfolio port (~1,760 web lines in `RetirementCard.tsx`/`RetirementSheets.tsx` alone — bigger than the whole Loans module). `STATUS.x` colors appear at the highest concentration in the module here (10 sites in `RetirementCard.tsx` alone) → `useThemeColors()`. Three hand-rolled `fixed inset-0` modal overlays found and rebuilt on the real ported `Modal` component: `NpsLifecycleDetail`, a contribution-breakdown popup inside `RetirementSheets` (never converted to `Modal` even on web, despite that file already using `Modal` elsewhere), and a third one found during the port, `EpfAllTransactionsSheet`. `core/nps/npsClient.ts`'s scheme-list cache used synchronous `localStorage` (incompatible with RN) — fixed via `npsClient.native.ts`, which keeps the existing in-memory `schemesMemCache` but drops the persistent cross-session layer (re-fetches once per cold app start instead of once per week), per the same decision applied to IPO's cache.

## Current limitations

- All data is entered manually — no EPFO passbook PDF import, no NPS PRAN statement import.
- EPF employer contribution split (EPF vs EPS) uses standard statutory rates; actual employer contributions may differ.
- NPS projection does not account for future contributions, only grows existing corpus.
- PPF withdrawal rules (partial withdrawal eligibility after Year 7) are not enforced or modelled.

## Planned improvements

- **Phase 2:** EPFO passbook PDF import using PDF.js to auto-populate EPF transaction history.
- **Phase 2:** NPS PRAN statement import to auto-populate fund units and transaction history.
- **Phase 2:** Future contribution modelling in projection (how much to contribute monthly to hit a target corpus).

## Ideas welcome

- Would a combined "retirement readiness" score across NPS + PPF + EPF be useful, or do you prefer to see each account separately?
- What retirement corpus target logic would you want — a multiple of current salary, a custom target amount, or an inflation-adjusted monthly income?
- Are there other retirement instruments (Atal Pension Yojana, Superannuation funds, gratuity) that should be added?
- How much detail do you need in the EPF projection — just the final number at 58, or year-by-year breakdown?
