# Loans

## What it is

The loans module tracks all your borrowings and lets you model different repayment strategies without any commitment. You can see exactly how much interest you will pay over the life of each loan, and then explore "what if" scenarios — extra payments, balance transfers, step-up EMIs — to find the fastest and cheapest path to debt freedom.

## User-facing capabilities

- View all active loans in one place: current outstanding balance, monthly EMI, interest rate, and tenure remaining
- See the full amortisation schedule for any loan — a month-by-month table showing principal paid, interest paid, and remaining balance for every single EMI
- Use the Payoff Planner to model repayment scenarios without changing your actual loan data:
  - **Extra lump sum prepayment**: enter an amount you could prepay and see how many months it saves and how much interest it avoids
  - **Extra EMI per month**: see how much faster the loan closes if you pay a fixed extra amount each month
  - **Step-up EMI**: model increasing your EMI by a percentage each year (e.g. +5% annually as your salary grows)
  - **Balance transfer**: enter a new interest rate and processing fee to see the net saving of refinancing your loan
- Download a complete amortisation schedule as an Excel (XLSX) file for offline reference or sharing with a CA
- Add, edit, and delete EMI-bearing loans. The loan tracker and its Add/Edit modal cover the six EMI loan types (`EMI_LOAN_TYPES`): Home loan, Car loan, Personal loan, Education loan, Gold loan, and Loan Against Property (LAP). (The wider `liabilities` store also models non-EMI borrowings — credit card, BNPL, LAS, overdraft, informal loans, rental deposit — but those are managed elsewhere, not in the loan planner.)
- **Edit** any tracked loan (the Add/Edit modal opens pre-filled) or **delete** it — deletion asks for confirmation, then shows an Undo toast so an accidental removal can be reversed

## How it works

Loans are stored in the encrypted `liabilities` Dexie store. The `Liability` record has 18 fields, including: type, name, principalAmount, `outstandingAmount` (the remaining balance), interestRate, emiAmount, `emiDueDate` (day-of-month the EMI falls due), startDate, endDate, and lenderName. The cash-flow forecaster keys its monthly EMI projection off `emiDueDate`.

The amortisation schedule is generated entirely on-device by `amortization.ts` using the standard reducing-balance method. For each month it calculates: interest = currentBalance × (annualRate / 12), principal = EMI − interest, newBalance = currentBalance − principal.

Amounts respect `usePrivacy().shouldMask(!safeModeVisibility.loans)` — Open never masks, Safe masks loan amounts only if the "Loans" toggle in Settings → Safe Mode is switched off (visible by default). Loans don't have per-item categories, so this is a single module-wide toggle rather than per-loan.

Payoff scenarios are computed in `calculator.ts` without modifying stored data — they run the amortisation algorithm forward with the modified parameters and report the difference in total interest paid and tenure. This makes scenario modelling completely safe and reversible.

The XLSX export uses a spreadsheet library to produce a formatted workbook with one sheet per loan, including a header row with loan details and a data table of the full schedule.

The feature follows the **vertical-slice** pattern: `LoanScenariosPage.tsx` is a thin shell
(~45 lines) holding the tab state + shared `usePlanner` hook, dispatching to the `myloans/` and
`planner/` slices. Each slice owns its own UI state, hooks, and modals. Inputs use the shared
`TextInput`/`SelectInput` components (no hand-rolled dropdowns), and the spreadsheet payload is built
purely in `core/loans/planExport.ts` so only the `writeFile` call is web-specific.

`MyLoansTab` renders each loan with pencil (edit) and trash (delete) actions. Editing reopens
`AddLoanModal` in edit mode — `useLoanForm` pre-fills from the existing loan and saves in place.
Deleting routes through a `ConfirmDialog`, then calls `deleteLiability` (exposed by `useLoans`, backed
by `useLoggedRepository`) so the removal is logged and reversible via an Undo toast.

Key files:

- `src/features/loans/LoanScenariosPage.tsx` — thin shell: header + tab strip → MyLoansTab | PlannerTab
- `src/features/loans/useLoans.ts` — repository hook: `saveLiability` + `deleteLiability` (logged/undoable) + `emiLoans` filter
- `src/features/loans/myloans/` — `MyLoansTab` (list + per-loan edit/delete) + `AddLoanModal` (add & edit) + `useLoanForm`
- `src/features/loans/planner/` — `PlannerTab` + `PlannerResults` + `usePlanner` (amortization derivation)
- `src/core/loans/calculator.ts` — EMI calculation and scenario modelling
- `src/core/loans/amortization.ts` — month-by-month schedule generation
- `src/core/loans/meta.ts` — loan-type metadata (label/icon/colour); `planExport.ts` — pure export builder

**Mobile (`apps/mobile`):** ported in Track 4 (third module, after Subscriptions and Insurance) — `apps/mobile/src/features/loans/` mirrors the web files above 1:1 (`useLoans.ts`/`useLoanForm.ts`/`usePlanner.ts` unchanged beyond import paths). Two platform notes matching Insurance's: `grid-cols-2`/`gridTemplateColumns` (loan-type picker, tenure/rate rows, the amortization table) become `flex-row`/`flex-wrap` layouts with `flex-1` or explicit-percentage-width children; a `var(--color-surface-secondary)`/`var(--color-primary)` CSS-var pair (the computed-EMI banner) is substituted with real theme hex. Back button dropped, same reasoning as Insurance.

**"Download XLSX" (`PlannerResults.tsx`'s `PlannerSummaryCard`)** — originally dropped as a capability gap (no native file-save/share flow existed at the time; `xlsx`'s browser-only `writeFile` has no RN equivalent), then restored post-Track-4 on `write-excel-file`'s `/universal` entry point, which turned out to be broken on-device the whole time (two separate bugs, both found and fixed 2026-08-05):
1. `.toBlob()` always ends by calling `new Blob([arrayBuffer], {...})` internally — but RN's own `Blob` (`Libraries/Blob/BlobManager.js`) explicitly does not support constructing a Blob from an `ArrayBuffer`/`ArrayBufferView`, so this call always threw, on every platform, every time.
2. Fixed by switching to the `xlsx` package for writing too (its read side was already proven safe for bank-import's XLSX parsing) — but `xlsx`'s `write({type: 'array'})` actually returns a bare `ArrayBuffer` despite its types claiming `Uint8Array` (its own `s2ab()` helper builds a `Uint8Array` view internally but returns the underlying buffer, not the view), and `expo-file-system`'s native `File.write()` needs a genuine `TypedArray` to read the buffer off of via its JSI bridge — passed a bare `ArrayBuffer`, it threw `[write] Cannot convert '[object ArrayBuffer]' to a Kotlin type. no ArrayBuffer attached`.

Fixed by wrapping the `xlsx` `write()` result in `new Uint8Array(...)` before it reaches either `new Blob(...)` (web) or `file.write(...)` (native). One real trade-off from the `xlsx` switch: the free/community `xlsx` build has no cell-styling support, so `write-excel-file`'s `fontFamily`/`fontSize` styling is gone — data and column widths are unaffected, just the font is Excel's own default now.

## Current limitations

- Loan balances must be updated manually; there is no automatic sync with lenders
- No support for floating-rate loans where the interest rate changes mid-tenure (e.g. home loans linked to repo rate)
- Credit card revolving balance does not integrate with the minimum payment calculation
- BNPL instalments are tracked as a single loan, not broken out per purchase
- No alert when a loan EMI payment date is approaching

## Planned improvements

- Phase 2: Prepayment opportunity alert — when Chip detects a large surplus (e.g. a bonus in your income), it will suggest the optimal prepayment amount and show the interest saving
- Phase 2: Credit score impact simulation — model how paying off a loan or reducing utilisation might affect your credit score

## Ideas welcome

- Would a floating-rate scenario tool be useful (e.g. "what if my rate goes up by 0.5%")?
- Should the Payoff Planner allow combining multiple scenarios (e.g. extra monthly EMI + one lump sum prepayment)?
- Would a "debt avalanche vs debt snowball" comparison across all your loans be helpful?
