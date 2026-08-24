# Retirement Accounts (NPS, PPF, EPF)

## What it is

Penny's Retirement sub-tab tracks the three main long-term savings pillars for Indian investors: NPS (National Pension System), PPF (Public Provident Fund), and EPF (Employee Provident Fund). Each is modelled with its own rules, contribution limits, and projection logic so you can see your expected retirement corpus in one place.

## User-facing capabilities

- **NPS:** Add your NPS holdings with fund type (LC-75, LC-50, LC-25, BLC), choice mode (auto or active), and units. See live NAV and current corpus value. View a year-by-year projection to retirement.
- **PPF:** Maintain a passbook-style ledger with deposits, interest credits, and withdrawals. See how much you've deposited in the current FY vs the ₹1.5L annual limit. View projected corpus to maturity. Entries are tagged with before/after-5th-of-month badges to show whether that month's interest was earned. The card itself shows summary stats only — every individual transaction lives in a "See all transactions" popup, FY-grouped with its own per-year deposit progress bar.
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

- Transactions stored in `assetMeta.ppfTransactions[]` as a typed array (`PpfTransaction`:
  `type: 'deposit'|'interest'|'withdrawal'`, `date`, `amount`, `note?`).
- Before/after-5th badge: determined by comparing transaction day against the 5th of the month.
- FY deposit bar: sums all deposit transactions in the current April–March FY.
- Projection (`ppfProjectedCorpus` in `ppfCalculations.ts`) uses a fixed `PPF_RATE` constant
  (7.1%) to compound the balance to the maturity date — this is a pure closed-form formula, not
  derived from the FY-by-FY rate table below (unlike EPF's real-transaction-aware blend).
- `assetMeta` fields: `ppfOpeningDate` (epoch ms), `ppfBank` (optional institution name),
  `annualContribution` (planned annual amount, used for the projection), `maturityYear` (fallback
  when no opening date is set), `ppfTransactions[]`.
- **Maturity date** (`ppfMaturityMs()`) — 15 years from the END of the financial year the account
  was opened in, not from the raw opening date (real PPF rule, verified 2026-08-08 — fixed a
  pre-existing bug where it was calculated as a naive "opening date + 15 calendar years," which
  understated the true maturity date by up to almost a full year depending on where in the FY the
  account was actually opened; e.g. opened 10-Jul-2015 truly matures 1-Apr-2031, not 10-Jul-2030).
  `ppfBuildCardData()`'s `yearsElapsed`/`yearsLeft` are both anchored to this same corrected
  maturity date (not independently derived from the raw opening date) so they always sum to exactly
  15 and the maturity tile's progress bar can never disagree with its own "N yrs left" text.
  `PpfFields.tsx`'s "Track PPF" form preview label calls this same shared function rather than
  re-deriving the (previously wrong) formula locally.
- **PPF interest rate table** (`packages/core/src/core/portfolio/ppfInterestRates.ts`) — the full
  FY1986-87→2026-27 rate history, fetched from a small Cloudflare Worker route
  (`workers/api-proxy/src/ppfRates.ts`, `/ppf-rates`) with an identical offline-first fallback
  baked in client-side, mirroring the EPF rate table's pattern exactly (`epfInterestRates.ts`,
  `/epf-rates`) — including sharing the same generic async-cache storage module
  (`ratesStorage.ts`/`.native.ts`/`.web.ts`). Unlike EPF's table, periods are stored at **day
  precision** (`"YYYY-MM-DD"`, not `"YYYY-MM"`) because one historical change (12%→11%, effective
  15-Jan-2000) genuinely took effect mid-month — every other change lands on a clean month/quarter
  boundary. `lookupRateForMonth()` resolves a straddling month via a documented (not verified
  against a primary source) end-of-month convention; `lookupRateForDate()` is exact. Wired into
  `ppfInterestCalculator.ts`'s real 5th-of-month accrual simulation (`calculatePpfInterestForFy`,
  `checkPpfInterestMismatch`) and `ppfReconciliation.ts`'s statement-import review (see "PPF —
  statement import" below) — a genuinely different accrual timing than EPF's own rule, so the two
  calculators are not shared code.

**EPF:**

- Employer history stored in `assetMeta.epfEmployers[]` (`EpfEmployer` type): company name, basic salary, from date, to date.
- Contributions auto-calculated: employee = 12% of basic; employer EPF = 3.67% of basic (8.33% goes to EPS, capped at ₹1,250/month).
- Salary hike groups (`epfHikeGroups[]`) store a timeline of hike events per employer for projection accuracy.
- Pro-rata logic handles partial first and last months of service.
- Retirement projection targets age 58 using DOB from the user's profile.
- `assetMeta` fields: `epfEmployers[]`, `epfTransactions[]`, `epfHikeGroups[]`.
- Types defined in `src/core/db/types/index.ts`: `EpfEmployer`, `EpfTransaction`, `EpfHikeGroup`, `PpfTransaction`.

**EPF — passbook PDF import + interest calculator (core logic built 2026-08-07/08, all UI decisions
finalized via mockups v1–v4, UI implementation in progress — see `docs/plans/epf-passbook-import.md`
for the full design).** Full research/design context:
INDmoney-style UAN+password auto-sync was explicitly researched and rejected (requires server-side
credential custody, violates EPFO's own advisories against sharing login credentials with any third
party, carries real account-lockout risk, and there's no legitimate Account-Aggregator-framework
path — EPF is only "proposed," not live, as of the most recent check). PDF passbook import (the
user does their own EPFO login, downloads the passbook themselves, shares the file into Penny —
zero credentials ever touch the app) was chosen instead as the privacy-preserving alternative.
Manual entry is NOT replaced — this is purely additive, feeding the exact same `epfEmployers[]`/
`epfTransactions[]` arrays manual entry already writes to.

- `EpfEmployer` gained `establishmentId`, `memberId` (the real matching key for "which employer
  does this PDF belong to" — company name alone is unreliable across a rejoin), and
  `balanceCheckpoints[]` (EPFO's own stated opening/closing balance as of a date, for validating
  Penny's derived running total against).
- `EpfTransaction` gained `epfWages`/`epsWages` (the wage baseline a contribution was calculated
  on), `sourceParticulars` (the passbook's own row label, kept separate from the user-authored
  `note` field), and `sourceRef` (import-batch traceability).
- **Parser** (`packages/core/src/core/portfolio/epfPassbookParser.ts`): pure function, no I/O
  (mirrors `bank-import/xlsxParser.ts`'s shape) — takes raw PDF bytes, uses `unpdf` (chosen after a
  real on-device feasibility spike; `pdfjs-dist` raw was avoided as too heavy/fragile under Metro,
  the same failure class that once broke `@zip.js/zip.js`) to extract text, then regex-parses the
  bilingual (English-clean/Hindi-mojibake) header and transaction-table rows. Verified against a
  real downloaded EPFO passbook during development; the committed test fixture
  (`tests/fixtures/epf-passbook-synthetic.pdf`) is a synthetic stand-in with fake data, generated to
  mirror the real structure exactly (real passbooks carry PII in their text layer even with the
  visual image redacted, so one was never committed).
- **Interest calculator** (`packages/core/src/core/portfolio/epfInterestCalculator.ts`): EPF
  interest is entirely manual today (no auto-crediting logic existed before this) — this simulates
  EPFO's real month-by-month accrual (a contribution deposited in month M+1 earns zero interest
  that month, starting to accrue only from M+2; the whole year's interest is summed and credited
  once at FY-end, never compounded mid-year). Verified to reproduce a real passbook's exact
  credited interest and closing balance, not just a plausible approximation. Serves both the
  PDF-import reconciliation flow and a planned "Want me to calculate it for you?" button in the
  manual "Add transaction" flow (not yet wired into the UI). `calculateEpfInterestForYear()`'s
  result also carries an `employeeTrace`/`employerTrace` (month-by-month opening balance, rate, and
  interest contribution) purely for display — added 2026-08-08 per the design doc's §10.5, so any
  interest transaction's rate-used and full calculation can be shown on demand, recomputed fresh
  from the FY + logged contributions rather than stored as a snapshot. `getInterestRateForFy()` is a
  thin convenience wrapper for just the rate half of that (a transaction row's small "8.25% p.a."
  tag doesn't need the full trace).
- **Interest rate table** (`packages/core/src/core/portfolio/epfInterestRates.ts`): the full
  1986-87 to 2026-27 rate history, fetched from a small Cloudflare Worker route
  (`workers/api-proxy`'s `/epf-rates`, see `docs/EXTERNAL_APIS.md`) so a future rate change never
  needs an app-store release; the same table ships baked in as an offline-first fallback (network
  only ever refreshes it, never required). Modelled as rate PERIODS (not one-rate-per-FY) so the
  one historical mid-year change (2000-01: 12% Apr-Jun → 11% Jul-Mar) needs no special-casing.
  `confirmedThrough` makes "EPFO hasn't declared this year's rate yet" an explicit, surfaceable
  state rather than a silent guess.
- **Reconciliation** (`packages/core/src/core/portfolio/epfReconciliation.ts`): deliberately NOT
  bank-import's fuzzy amount/date matcher — a contribution row has a natural exact key,
  `(memberId, wagesMonth, type)`, since EPFO can only fund one contribution per employer per
  wage-month. Each imported row classifies as `new` (no existing entry), `matches` (existing entry
  agrees), or `conflict` (existing entry disagrees — the imported value is the intended default
  since it's straight from EPFO, but the user can keep either).
- **Excel export/import** (`packages/core/src/core/portfolio/epfExcelExport.ts` /
  `epfExcelImport.ts`, added 2026-08-08 — design doc §11): exports ONE combined workbook across
  every employer/year Penny knows about (5 sheets: Summary, Employers, Transactions, Interest
  History, Salary Hikes) — unlike EPFO's own one-employer-one-FY passbook download. Deliberately
  split into two features with different reliability bars: Excel is the structured,
  **round-trippable** format (`epfExcelImport.ts` reads its own export back into
  `epfReconciliation.ts`-compatible rows — verified end-to-end in tests: a full export→bytes→import
  cycle reconciles every row as an exact `matches`, and a genuinely edited amount correctly
  reconciles as a `conflict`, not a false positive); PDF export is explicitly phase 2,
  presentation-only, and is **not** promised to round-trip (would need a second fragile PDF parser
  for no real benefit, the same fragility class Excel-as-source-of-truth was chosen to avoid).
  `buildEpfExcelExport()` mirrors `packages/core/src/core/loans/planExport.ts`'s exact "plain arrays
  in, platform renders to `.xlsx`" shape — the actual `xlsx` write call happens in the apps/mobile UI
  layer, reusing `PlannerResults.tsx`'s already-solved RN `write()`/`ArrayBuffer` gotchas.
- **UI (`apps/mobile` only, shipped 2026-08-08)** — built exactly per the finalized mockups
  (`docs/plans/epf-passbook-import.md` §10/§11, `docs/mockups/proposals/epf-passbook-import-v4.html`):
  a quiet "Import"/"Export" pill row on the EPF card (`RetirementCard.tsx`), placed above the
  Employment section since one import can create a new employer AND add transactions, not just one
  or the other; a matching "or import passbook PDF →" shortcut on the untracked "Track EPF" CTA that
  creates a brand-new EPF holding straight from a first import, skipping manual UAN/company entry.
  The file picker (`epfImportLogic.ts`'s `pickAndParseEpfFiles()`) accepts multiple PDF passbooks
  and/or previously-exported Penny `.xlsx` files in one go, routes each by extension to
  `epfPassbookParser.ts`/`epfExcelImport.ts`, and flags duplicates (same employer+FY picked twice)
  and unreadable files up front rather than silently retrying or dropping them
  (`EpfImportFlow.tsx`'s batch-summary step). Every ready file's reconciliation units (one PDF is
  always one employer+FY; one `.xlsx` can round-trip several) are reviewed sequentially on one
  conflict-first triage screen (`EpfImportReviewSheet.tsx`, Direction C from the mockups): the rare
  real conflict is pinned open at the top with the imported value pre-selected, new rows are a
  pre-checked individually-toggleable checklist, and already-matching rows collapse to one quiet
  summary line. `epfImportLogic.ts` owns every actual `Holding` write — matching an employer by
  `memberId` first (never falling back to a name match once a real `memberId` is involved, so a
  same-name rejoin under a new Member ID is never merged into the wrong employer record), creating
  one if none matches, and merging `balanceCheckpoints`.
  FY-end interest gaps get their own `Banner` — one per past, fully-closed financial year with no
  `interest` transaction logged, not just the most recent (`epfInterestOnDemand.ts`'s
  `findMissingInterestFys()`). Inside the manual "Add transaction" flow, selecting "Interest" now
  offers **"Want me to calculate it for you?"** — runs the core accrual simulation against whatever's
  already logged (real transactions, or the existing auto-estimate if nothing's logged yet) and
  pre-fills the Amount field, still fully editable, never auto-saved; if EPFO hasn't declared that
  year's rate yet, it says so explicitly rather than guessing. Interest rows in the transactions list
  are now tappable (previously only contribution-month rows were) and show a small "X% p.a." tag;
  tapping opens a rate + month-by-month recalculation popup that also flags — without asserting
  either figure is wrong — when the recorded amount and a fresh recalculation disagree (e.g. an
  older manual entry, or contributions edited after the interest was recorded).
- **Cross-platform note:** this is a new capability built `apps/mobile`-only — `apps/web-react` is
  frozen (no equivalent UI exists or is planned there); see this feature's `Mobile` section below
  and `docs/MOBILE_PARITY.md`.
- **Real-vs-estimate blending (real-device bugfix batch, 2026-08-07):** `epfComputeAllMonths()`
  previously had NO visibility into real `EpfTransaction[]` at all — it always generated a pure
  formula estimate for every month, even for months a passbook import had already logged a real
  contribution. This made the EPF card's stat boxes (real-transaction-only totals) and the "See all
  transactions" list (always-estimated month range) visibly disagree after an import. Fixed by
  making `epfComputeAllMonths(employers, transactions)` transaction-aware: for any month with a real
  logged `contribution` transaction (matched by `wagesMonth`), its own `employeeAmount`/
  `employerAmount`/`pensionAmount` are used instead of the formula, and the entry gets a new
  `isReal: boolean` field so callers can tell which. `epfBuildCardData()` now ALWAYS derives
  `employeeTotal`/`employerTotal`/`corpus` from this blended function's output (no more
  `txns.length === 0` all-or-nothing gate), so the card and the transactions list can no longer
  disagree by construction. `EpfCardData` also gained a `pensionTotal` field (summed from the
  blended `epsAmount`, informational only — deliberately NOT added into `corpus`, same convention
  as the EPS/pension row shown elsewhere on the card). The Excel export was already unaffected by
  this bug — `epfExcelExport.ts` has only ever exported real `EpfTransaction[]`, never the estimate.
- **FY-end interest nudge gets its own "+ Add" (2026-08-07):** the nudge banner's copy used to point
  at "+ Add above," ambiguous since the card has two other "+Add" buttons. It now carries its own
  inline "+ Add" pill that opens the "Add EPF transaction" sheet pre-selected to `interest` with the
  date pre-filled to that FY's 31 March (`EpfTransactionSheet` gained optional `initialType`/
  `initialDate` props for this).
- **Interest breakdown mismatch can now be corrected in place (2026-08-07):** the interest
  breakdown popup's "recorded vs. recalculated" banner was previously informational only. When the
  two disagree, it now shows an "Update to ₹…" button that writes the freshly recomputed employee/
  employer split back onto that transaction (`EpfAllTransactionsSheet` gained an `onSave` prop for
  this, same shape `EpfTransactionSheet`'s own "calculate it for me" assistant already writes).
- **"Are you still working at X?" employment confirmation + "needs review" flags (2026-08, real-user
  feedback, mobile-only):** root-cause fix for a real bug where importing a single, strictly-past-FY
  passbook left an employer's `toDate` unset (= "current") with nothing actually tying it to the
  present, so estimated contributions silently ran all the way to today. `RetirementCard` now shows
  a Yes/No card prompt for any such employer (`ti-briefcase` icon) — Yes sets the new
  `currentEmploymentConfirmed` flag (see `docs/SCHEMA.md`); No bounds `toDate` to the last FY with
  real evidence. Separately, two "needs review" conditions are now flagged on demand, never stored,
  via one shared function (`epfReviewFlags.ts`) so a row's badge and the card's summary count can
  never disagree: an **interest mismatch** (recorded vs. a fresh recalculation for that FY — this
  also now backs the interest-breakdown popup's own banner, previously computed separately) and a
  **wage discrepancy** (a real contribution amount vs. what the employer's current salary model
  would predict, ±2%) — higher-than-predicted offers an opt-in "Add hike" action in the contribution
  popup; lower-than-predicted is explanation-only (no edit-transaction-amount UI exists yet — see
  `docs/plans/epf-passbook-import.md` §9). Both flag types show a small amber `ti-alert-triangle`
  badge in `EpfAllTransactionsSheet` and a summed "N need review" pill on `RetirementCard`.
- **Employer-switch correctness fixes + per-employer ledger (2026-08-11, real-device testing,
  `apps/mobile` only):** two more employer-switch bugs found on top of the §10.8 reconciliation fix
  (`docs/plans/epf-passbook-import.md` §10.9). `epfComputeAllMonths()` had its own separate
  wagesMonth-only matching bug distinct from the reconciliation one already fixed — corrected via a
  new `epfResolveTxnEmployer()` that scopes real-transaction matching to the same employer being
  simulated for that month, not just the same wage month. Separately, an unconfirmed "current"
  employer kept projecting estimated months all the way to today regardless of whether the "Are you
  still working at X?" prompt above was ever answered — fixed by capping the projection at the
  employer's own last real evidence date (`epfLastRealEvidenceMs`). The design gap feeding both: a
  brand-new employer's join date was being silently inferred from a contribution's deposit date
  rather than asked for. Import now always confirms a new employer's real joining date via a new
  `EpfNewEmployerSetupSheet` (wired into `EpfImportFlow.tsx`) — and additionally asks for the old
  employer's last working day when a genuine mid-month switch is detected — with pro-rata-aware date
  suggestions (`estimateProRataEdgeDate`/`checkProRataConsistency`) when a partial first/last month
  exists. The new `joiningDateConfirmed` flag (see `docs/SCHEMA.md`) now guards against a later
  import silently moving an already-confirmed join date backward; a disagreement instead surfaces as
  a new non-blocking `joiningDateContradiction` review flag.

  Separately, EPF transactions moved from one centralized cross-employer list to a **per-employer
  ledger**, mirroring EPFO's own portal / INDmoney's "select Member ID → view that passbook" model:
  `EpfAllTransactionsSheet` gained an optional `employerFilter` prop (scoping both computed months
  and non-contribution transactions to one employer via new `epfEmployerScoping.ts` resolvers),
  tapping an employer row on the card now opens that employer's own ledger directly, and "See all
  transactions" routes through a new `EpfEmployerPickerSheet.tsx` picker whenever 2+ employers exist
  (skipped entirely for the common single-employer case). A scoped per-employer view also shows new
  "Estimated Gross Salary / CTC" stat tiles (`estimateGrossAndCtc()`, using an editable per-employer
  Basic-to-Gross ratio and the statutory gratuity formula), always presented as an explicit estimate
  with a formula popup, never asserted as fact. Mockup:
  `docs/mockups/proposals/epf-employer-switch-v1.html`. **Implemented but not yet manually verified
  on-device.**
- **Second on-device round (2026-08-11, `docs/plans/epf-passbook-import.md` §10.10) — 8 more real
  bugs found testing the round above, plus a Gross/CTC display change.** Interest/transfer/
  withdrawal reconciliation was still unscoped by employer (only contributions had been scoped in
  §10.9) — a same-FY employer switch means both employers can legitimately earn interest in the
  same year, so importing the second employer's interest was silently overwriting the first's;
  fixed by widening `epfResolveTxnEmployer()` to resolve any transaction type (not just
  contributions, via a new `epfEmployerForDate()`) and scoping the reconciliation calls to it.
  Missing `key` props on the import flow's review sheets meant React was reusing the same component
  instance across import units, causing stale dates and a possible cross-FY conflict-choice bleed.
  `checkJoiningDateContradiction` compared dates at raw-millisecond granularity instead of
  month granularity, producing a false-positive contradiction on every employer's OWN joining
  month — the likely dominant cause of a reported "20 need review but nothing looks wrong"
  mismatch; fixed via a new `epfMonthKeyOf()` helper. The wage-discrepancy flag now skips an
  employer's own joining/leaving month entirely (a pro-rata partial month there is expected, not a
  real discrepancy), replaced by a new confirm UI, `EpfMonthEdgeConfirm` (a local component inside
  `RetirementSheets.tsx`), that lets the user confirm the exact join/leave date from the
  transaction row itself, reusing the same pro-rata-consistency pattern the import-time setup sheet
  already established. A few smaller latent bugs (wrong-employer transaction lookup and duplicate
  React keys on a shared switch month, a badge-Set keyed without the employer) were fixed alongside
  it. A new heuristic "pending transfer" banner (`epfHasPendingTransfer()`) flags a closed employer
  whose balance doesn't yet show a `transfer_in` on its successor. Separately, an explicit
  follow-up ask changed the Gross/CTC display: `estimateGrossAndCtc()` gained a
  `monthlyEmployeeContribution` parameter and now also returns `netMonthly` (Gross minus the
  employee's own EPF deduction, not income tax — no payroll tax engine exists), `annualGross`, and
  `annualCtc`; the scoped ledger now shows three tiles — **Est. CTC (annual)**, **Est. Gross
  (annual)**, **Net Monthly** — CTC/Gross quoted annually (the conventional Indian "LPA" framing),
  Net Monthly staying monthly. Two items from the original bug report ("hikes not shown for other
  companies," part of "transfers not shown") are believed to be downstream of the reconciliation-
  scoping/key-collision bugs above rather than separate issues, but this has **not been
  independently re-verified** — flagged as "should re-check," not "confirmed fixed." No Dexie
  schema changes this round. **Implemented but not yet manually verified on-device.**
- **Third on-device round (2026-08-12, `docs/plans/epf-passbook-import.md` §10.11) — EPF corpus
  never counted in net worth, plus more employer-switch bugs.** The most significant find: an EPF
  holding's `currentValue` was never actually persisted anywhere — every net-worth aggregator in the
  app (Home's summary, the retirement-projection calculator, Portfolio's own holdings total) reads
  the generic `holding.currentValue ?? holding.investedAmount`, but EPF (unlike PPF/NPS, which save
  a manually-typed corpus straight onto `investedAmount`) only ever computed its corpus on demand for
  the card's own display, so this fell back to `0` and silently vanished from both the net-worth
  total and the breakdown view (excluded outright by its `> 0` filter, not shown as ₹0). Fixed by a
  new `saveHolding()` wrapper in `RetirementSection.tsx` that stamps the freshly computed EPF corpus
  onto `currentValue` before every save; an existing EPF holding self-corrects the next time any save
  happens on it (no separate migration needed). Also fixed: the interest CALCULATION engine
  (`buildEpfInterestInput()`/`sumEpfBalanceBeforeFy()`, distinct from §10.10's reconciliation fix)
  was still summing a same-FY switch's real deposits/opening balance across BOTH employers instead
  of scoping to one, inflating the recalculated interest shown for the FY an employer actually left
  in; "Are you still working at X?" → "No" now opens the same `EpfMonthEdgeConfirm` form (exported
  from `RetirementSheets.tsx`) to ask for the real last working day instead of silently guessing 31
  March; and the row-level wage-discrepancy warning on a still-open employer's true final month now
  routes into that same confirm flow instead of a dead-end banner (closing the last gap in §10.10's
  edge-detection logic). A reported concern about two "TRANSFER IN" passbook particulars variants was
  investigated and found to already classify correctly — no fix needed, regression tests added. **No
  Dexie schema changes.** **Implemented but not yet manually verified on-device.** Separately, a
  "hike journey" mockup (`docs/mockups/proposals/epf-hike-journey-v1.html`) proposing Gross/Net/CTC
  at each salary point (not just Basic) was approved and **implemented**: the per-employer hike
  list's expandable rows initially showed, per point (including a synthetic "Joined" point derived
  from the employer's own start date/Basic), a small card with a growth-% pill vs. the previous
  point plus that point's own Gross/mo, CTC/yr, and Net/mo — not just Basic — via a new
  `buildEpfHikeJourney()`/`EpfHikeJourneyPoint` pair in `epfCalculations.ts`. Unit-tested; **not
  yet manually verified on-device.** (This card layout was redesigned into a table in the fifth
  round below — see that bullet for the current display.)
- **Fourth on-device round (2026-08-12, `docs/plans/epf-passbook-import.md` §10.12) — mid-year
  withdrawal never subtracted from interest, employer-side withdrawal amount silently dropped.**
  Found via a direct real-passbook comparison (FY2019-20's recorded ₹2,350 employee/₹719 employer
  interest didn't match Penny's own recalculation), three compounding bugs found in sequence: (1)
  the interest engine had no concept of a mid-year withdrawal at all — `calculateEpfInterestForYear`
  now accepts an optional `monthlyWithdrawals` and nets deposits/withdrawals per stream before
  simulating, applying a withdrawal at month-end (same timing symmetry as a deposit) and clamping
  the balance at zero; (2) fixing #1 alone still didn't match — `epfImportLogic.ts`'s
  withdrawal/advance storage branch was silently dropping the employer-side amount entirely (storing
  only the employee amount), unlike the already-correct interest/transfer_in branch; now stores the
  real employee/employer split, though **only for a future import** — an already-imported withdrawal
  needs the same statement re-imported to pick up the fix; (3) `existingAmounts()`
  (`epfReconciliation.ts`) was still comparing every non-contribution transaction as employee-only,
  which meant a re-import to pick up fix #2 would have silently agreed with the old wrong value
  instead of surfacing a conflict — fixed to prefer the real split when set. Unit-tested; **the
  corrected numbers have not yet been re-verified on-device against the real passbook.**
- **Fifth on-device round (2026-08-12, `docs/plans/epf-passbook-import.md` §10.13) — non-interest
  rows not tappable, no "keep recorded" option on an interest mismatch, hike journey redesigned
  card→table.** Two more real reported gaps plus one direct display revision. `transfer_in`/
  `withdrawal`/`advance` rows in `EpfAllTransactionsSheet`'s non-contribution list had no `onPress`
  at all (only `interest` rows did) — now every non-contribution row is tappable, opening a new,
  simpler breakdown popup (date, `sourceParticulars`, Employee/Employer/Total, same `DetailRow`
  style as the contribution popup), with a graceful fallback for a legacy/manually-typed transaction
  with no real employee/employer split. The interest breakdown popup's mismatch banner previously
  offered only "Update to ₹X"; a new field, `EpfTransaction.interestMismatchAcknowledged?: boolean`,
  is set when the user picks a new "Keep recorded" option instead — `checkInterestMismatch` still
  always reports the raw disagreement, but `findAllReviewFlags` now skips the `interestMismatch` flag
  once acknowledged, so it stops counting toward "N need review" and the row badge (same dismissal
  pattern as `Account.dismissedVerificationFindings`). Finally, per further on-device feedback on the
  hike-journey display shipped in the Third/Fourth rounds above, the per-employer hike list's card
  layout (Basic + a Gross/mo·CTC/yr·Net/mo card per point) was redesigned into a single table — a
  header row (Month | Est CTC | Est Gross | Net Monthly) followed by one row per salary point, with
  CTC and Gross now both shown ANNUAL to match the ledger header's own convention (Gross had
  inconsistently been monthly in the card layout). Same `buildEpfHikeJourney()` function, unchanged;
  only the `RetirementCard.tsx` rendering changed. No mockup round — treated as a direct revision of
  an already-built feature per the user's own precise, unambiguous spec. **Implemented but not yet
  manually verified on-device.**

**PPF — statement import (2026-08-08, `apps/mobile` only, per
`docs/mockups/proposals/ppf-statement-import-v1.html`).** A bank/post-office PPF statement (CSV or
`.xlsx`) import — the same "Statement Import" concept as bank-import and EPF's own passbook import,
scoped to PPF's simpler shape: one continuous ledger per account, no multi-file/unit queue.

- **Core logic** (`packages/core/src/core/portfolio/`): `ppfStatementParser.ts` reuses bank-import's
  generic grid/column-mapping/date-parsing primitives directly (`tokenizeCsv`, `parseXlsxToGrid`,
  `parseStatementRows`) and adds `classifyPpfRow()` (credit+narration mentions "interest" → an
  interest credit; otherwise credit → deposit, debit → withdrawal — never inferred from amount
  size). `ppfReconciliation.ts` uses EPF's exact-key model (new/matches/conflict by `(type, date)`
  for a deposit/withdrawal, `(type, FY)` for the once-a-year interest credit) rather than
  bank-import's fuzzy amount/date-proximity matcher — a PPF statement is low-volume and structured,
  same reasoning EPF's own import already established. Every interest-type row additionally gets a
  `calculatedInterest` field — a fresh recalculation from `ppfInterestCalculator.ts`'s real
  5th-of-month accrual rule, using every other row/existing transaction Penny knows about for that
  FY — so the review screen can show "Imported: ₹X · Calculated: ₹Y" the same sanity-check EPF's
  import already does. `null` when the rate table has no confirmed rate for that FY; `undefined`
  entirely for a non-interest row or when no rate table was supplied at all.
- **UI (`apps/mobile/src/features/portfolio/holdings/retirement/`):** `ppfImportLogic.ts` owns file
  picking (single CSV/`.xlsx`, extension-based routing, mirroring `epfImportLogic.ts`'s own
  convention), the column-mapping draft (`guessPpfColumnMapping()` pre-fills, the user must
  review/confirm before parsing — never trusted silently), the reconcile wrapper, and
  `commitPpfImport()` (the only place `ppfTransactions[]` gets written from an import). `PpfImportFlow.tsx`
  is the step shell (mapping confirm → review → conditional missing-details gate → done);
  `PpfImportReviewSheet.tsx` reuses EPF's approved conflict-first triage layout (conflicts pinned
  open at the top, new rows a pre-checked checklist, matches collapsed to one quiet line) plus a new
  **calculation card** for interest rows — pulled out of the standard new/matches/conflict sections
  into its own card, three states: quiet **Matches**, flagged **Differs** (the statement's own
  figure stays the kept default — never auto-corrected, since it's what was actually credited), and
  muted **Not verified** (when Penny's own record doesn't go back far enough for the recalculation
  to be trustworthy — shown for transparency, explicitly excluded from the match/differ judgment).
  Entry points mirror EPF's exactly: a ghost "Import" pill next to the PPF card's "+ Add" pill, and
  an "or import statement →" shortcut on the untracked "Track PPF" CTA that creates a brand-new PPF
  holding straight from a first import. A statement never carries the account-level fields Penny
  needs (opening date/bank/name) — the **missing-details gate** collects them inline, right after
  review, before the commit finalizes, reusing the same `PpfFields`/name-field components the
  manual "Track PPF" form uses; the opening date is pre-filled from the earliest imported row as a
  SUGGESTED value, never applied silently. `investedAmount` is always recomputed from the FULL
  resulting `ppfTransactions[]` ledger after a commit (deposits/interest add, withdrawals subtract)
  rather than asked for — the same "derive, don't ask" principle `applyEpfFields` already applies
  to EPF's own corpus, so the card and the transaction list can never disagree.
- **Cross-platform note:** mobile-only, no `apps/web-react` equivalent (frozen, no changes planned).

**PPF — card redesign + "See all transactions" popup (2026-08-08, `apps/mobile` only, per
`docs/mockups/proposals/ppf-card-redesign-v1.html`).** The PPF card had grown four bolted-on
additions (an Import pill, per-FY missing-interest banners, a squeezed "N need review" count, and a
capped inline transaction list) without a step-back pass — this consolidates presentation only, no
new calculation logic (`ppfBuildCardData`, `findMissingPpfInterestFys`, `findAllPpfReviewFlags` are
all reused as-is).

- **Card (`RetirementCard.tsx`):** the old back-to-back stacked maturity/This-FY progress bars
  (which could both render purple at once, reading as one continuous ribbon) are now two-up stat
  tiles, each in its own bordered box with a coloured top edge — Maturity always purple, This-FY blue
  while in progress and green only at 100% (never purple, so it can never be confused with Maturity).
  The April-5 deposit tip is now a quiet caption line inside the This-FY tile (no border/icon-box) —
  it's a timing reminder, not a problem, unlike the two genuine data gaps below it. Missing-interest
  FYs and interest-mismatch review flags — previously N stacked amber banners plus a separate pill
  wedged beside the "Transactions" label — now merge into one consolidated "needs attention" banner:
  each missing FY is a tappable chip (still pre-filling the transaction sheet to that FY's own 31
  March on tap, unchanged), and the review count is a second line in the same banner. The "Import"
  pill is recolored neutral/ghost (matches EPF's own Import/Export treatment) — purple is reserved
  for the one truly primary action, "Add". **The card no longer renders any inline transaction list
  at all** (not even the old capped 5-row + "+N more transactions" text) — a single "See all
  transactions" row (icon + label + count) is the only transaction-related element left on the card,
  shown whenever there's at least one transaction; with zero transactions the card still shows "No
  transactions yet. Tap Add…" as before.
- **New `PpfAllTransactionsSheet` (`RetirementSheets.tsx`):** the only place individual PPF
  transactions are browsable now. Mirrors `EpfAllTransactionsSheet`'s FY-band grouping (most recent
  FY first, each band's own header + row list), with two deliberate divergences from EPF's shape:
  no All/Interest/Transfers filter (PPF's volume per year — 1-2 deposits + 1 interest — doesn't need
  one, unlike EPF's 12+ contribution rows/year) and no repeated "N need review" count in this popup's
  header (it already has one legible home, the card's own "needs attention" banner). Each FY band
  gets its own new `ppfDepositsForFy(txns, fyStartYear)` progress bar (generalizes
  `ppfThisYearDeposits`, which now just calls it with the current FY): the current, still-open FY
  keeps the This-FY tile's actionable blue/green language, while past closed FYs render the same bar
  muted/neutral instead (historical record, not something to act on), with a small "✓" next to a
  maxed closed year's total. Flagged interest rows keep their warning icon (same
  `findAllPpfReviewFlags` check as the card, so the two can never disagree) but are **not** tappable
  for a correction flow — PPF has no equivalent of EPF's "Update to ₹X" popup yet (see
  `ppfReviewFlags.ts`'s own doc comment), so this sheet takes no `onSave` prop at all. A neutral "Add"
  action in the popup header opens the same `PpfTransactionSheet` used everywhere else on the card.
  Transaction-type labels/colors are shared between the card and this sheet via a new
  `ppfTxLabels.ts` (`PPF_TX_LABELS`/`PPF_TX_COLORS`), mirroring EPF's own `epfTxLabels.ts` pattern.
- **Cross-platform note:** mobile-only, no `apps/web-react` equivalent (frozen, no changes planned).

**PPF — withdrawal tile, info icons, edit/delete transaction (2026-08-08, `apps/mobile` only, per
`docs/mockups/proposals/ppf-card-redesign-v1.html` §3/§4, plus one capability added directly without
a mockup — see below).** Additive on top of the card redesign above; nothing there was reopened.

- **Withdrawal tile (`RetirementCard.tsx`):** a new full-width tile below the Maturity/This-FY row,
  own teal accent (distinct from Maturity's purple and This-FY's blue/green — it's a fixed
  eligibility fact plus, once eligible, a real withdrawable amount, not a "make progress toward a
  goal" metric like the other two). Powered by a new core function,
  `ppfWithdrawalEligibility(txns, ppfOpeningDate)` in `ppfCalculations.ts`, returning
  `{ eligible, eligibleFromFy, maxWithdrawable }` — the real PPF partial-withdrawal rule: allowed once
  per financial year, from the 7th financial year onward (i.e. after completing 6 full years), capped
  at 50% of whichever is lower — the balance at the end of the 4th preceding FY, or the balance at the
  end of the immediately preceding FY (a new `ppfBalanceAsOfFyEnd()` helper computes each side of that
  comparison). Returns `null` only when the opening date is unknown at all, matching every other
  PPF-derived value's "never guess a starting point" convention. Not-yet-eligible shows "Available
  from FY X" (`eligibleFromFy`, no rupee amount — `maxWithdrawable` is 0 until eligible); eligible
  shows the real `maxWithdrawable` amount, masked the same way the This-FY tile's amount is (only the
  digits, the " available" suffix stays visible). Always shown regardless of account age, including a
  brand-new account — hiding it for a young account would wrongly imply the rule itself doesn't exist
  yet, when it's a fixed fact about PPF worth knowing early.
- **Three "i" info-icon modals** — this app's first tappable-info-icon → small centered-modal pattern
  (no tooltip/popover primitive existed anywhere before this); a new `PpfInfoModal` component in
  `RetirementSheets.tsx` renders all three from a shared `{ icon, label, body, example? }[]` sections
  list plus an optional personalization line, reusing the existing `Modal` in its default compact
  (non-scrollable, `size="sm"`) mode rather than inventing a popover. Deliberately neutral/slate
  throughout, never amber — general PPF education, not a flag about the user's own account (that's
  what the "needs attention" banner is for). The trigger icon itself is always neutral
  (`theme.textTertiary`) regardless of which tile it sits on or that tile's own color.
  - **This-FY tile's icon:** interest timing (deposit on or before the 5th of a month → earns
    interest that same month; after the 5th → only from the following month) plus the ₹500 minimum
    deposit per financial year to keep the account active (missing it makes it go inactive/dormant;
    reviving costs a ₹50 penalty + ₹500 arrears per defaulted year, e.g. a 2-year gap = ₹100 + ₹1,000
    = ₹1,100).
  - **Withdrawal tile's icon:** the same partial-withdrawal eligibility/cap rule the tile itself
    computes, worded as static reference facts, plus a personalization line ("eligible now" vs.
    "eligible from year 7 (~N more years)") computed from `ppfData.yearsElapsed` — reads the same
    already-computed value the card uses elsewhere, so the tile and the modal's personalization can
    never disagree about eligibility.
  - **Maturity tile's icon (new, no mockup — built directly using the identical established pattern
    from the other two, already approved twice):** the three options at 15-year maturity — (a)
    withdraw the full balance tax-free and close the account; (b) extend WITH further contributions by
    submitting Form H (Form 4) within 1 year of the maturity date, to keep depositing and keep
    claiming the 80C deduction for another 5-year block; (c) extend WITHOUT further contributions (the
    default if nothing is submitted) — balance keeps earning interest, one withdrawal per year still
    allowed, but no further deposits accepted. Missing the 1-year Form H window permanently forfeits
    fresh contributions for that particular 5-year block (falling back to the without-contribution
    mode is still always available).
- **Edit/delete a PPF transaction (explicit user request, no mockup — built directly).** Previously
  there was no way to correct or remove a recorded PPF transaction at all. `PpfTransactionSheet` now
  accepts `editing?: PpfTransaction | null` and `onDelete?: (id: string) => void` — when `editing` is
  set, every field prefills from it, Save replaces that transaction by id in `ppfTransactions[]`
  instead of appending, and a Delete button appears. **Delete is immediate on press, no confirmation
  dialog** — matches this app's own established convention (`PpfModal`/`EntryForm`'s `FormModal`
  usage elsewhere already deletes a whole holding/IOU entry the same way). Every row in
  `PpfAllTransactionsSheet` is now a `Pressable` that opens `PpfTransactionSheet` in edit mode for
  that transaction; the interest-mismatch warning icon on a flagged row doesn't block the tap — a user
  might specifically want to tap a flagged row to correct it, which generic edit already covers with
  no separate "correction flow" needed.
- **Cross-platform note:** mobile-only, no `apps/web-react` equivalent (frozen, no changes planned).

**PPF — multi-year import interest bug, manual-entry FY-gap guard, rate display, live `investedAmount`
(2026-08-24, `apps/mobile` only).** A real bank-statement comparison surfaced a genuine calculation bug
plus three follow-on gaps, all found/fixed in one pass.

- **Import bug: only the first FY's interest ever calculated correctly.** `ppfReconciliation.ts`'s
  interest-row `context` array stripped **every** interest-type row out of the freshly-parsed
  statement (not just that row's own FY), so any FY after the first in a multi-year import computed
  its "Calculated: ₹Y" comparison against a balance basis missing every prior year's already-credited
  interest — silently understating every year after the first. Fixed by scoping the exclusion to only
  the current FY's own interest row, matching the pattern already correctly used for
  `existingTransactions`. Regression test added (`ppfReconciliation.test.ts`), verified via
  `git stash`/`git stash pop` to fail without the fix and pass with it.
- **Manual-entry FY-gap guard (`ppf-manual-entry-fy-guard-v1.html`).** The same bug class can happen by
  hand: adding a deposit/interest for a FY while an earlier FY's own interest was never recorded means
  that later FY's balance basis is wrong from the start. `earliestBlockingPpfFy()` (`ppfCalculations.ts`)
  blocks saving a transaction dated after the earliest FY still missing its own interest (never a FY
  within or before the gap — depositing right up to a still-open FY's own year-end is normal).
  `PpfTransactionSheet` shows a warning banner with an "Add interest" CTA (`handleAddMissingInterest`)
  that switches the same sheet to Interest, pre-fills that FY's 31 March, and shows a 4-state calc
  banner (`renderCalcBanner()`) — matching, mismatched, not-yet-confirmed-rate, or incomplete-history —
  reusing `checkPpfInterestMismatch`'s exact tolerance (`INTEREST_AMOUNT_TOLERANCE`, exported from
  `ppfInterestCalculator.ts` so the two comparisons can never disagree).
- **Card pill UX fix.** When multiple FYs are missing interest, `RetirementCard.tsx`'s nudge banner
  shows all of them but only the earliest (the one `earliestBlockingPpfFy` would actually accept) is
  tappable — the rest are visibly present but greyed, so nobody taps the wrong one and gets redirected.
- **Amount-prefill bug, real root cause: `autoFocus`.** Tapping a missing-FY pill correctly computed the
  calculated interest into state, but the visible Amount field kept showing "0" until the user tapped
  away and back. Root cause: interest rows are meant to arrive pre-calculated, not typed, but the field
  had unconditional `autoFocus` — grabbing focus at mount, before the async rate-table-driven prefill
  landed, and `AmountInput`'s own guard against clobbering active typing (`isFocusedRef`) treats "merely
  focused" the same as "actively typing," so it skipped resyncing the visible text. Fixed with
  `autoFocus={txType !== 'interest'}`, mirroring `EpfTransactionSheet`'s identical existing precedent.
- **Rate shown in the transaction row.** `PpfAllTransactionsSheet`'s per-row subtitle now also shows the
  FY's own rate (`getPpfInterestRateForFy`) alongside the existing FY label, for context without opening
  the calc popup.
- **`investedAmount` never reflected a ledger change.** Unlike the FY tiles/withdrawal-eligibility
  figure (already correctly memoized live off `ppfTransactions`), the PPF card's own headline value —
  and, via net worth's `h.currentValue ?? h.investedAmount` convention, the Retirement page's aggregate
  — was a stored snapshot set once at import/first-save and never recomputed after a later add/edit/
  delete. Fixed the same way EPF's identical `currentValue` staleness bug was already fixed one asset
  class over: a new `ppfCurrentBalance(txns)` (`ppfCalculations.ts`) is now written back onto
  `investedAmount` inside `RetirementSection.tsx`'s single `saveHolding()` choke point, which every PPF
  save (add/edit/delete/import) already flows through — so this one fix covers all of them. Confirmed
  the withdrawal-eligibility figure's own apparent non-responsiveness to a later-year interest
  edit/delete is mathematically correct, not a related bug: the formula caps at 50% of the LOWER of the
  balance 4 FYs back vs. 1 FY back, and the 4-years-back figure is very often the binding (smaller)
  constraint, making it insensitive to the most recent 1-3 years' changes by design of the real PPF
  rule. Also confirmed EPF (already fixed, same choke point) and NPS (a live `units × NAV` mark-to-
  market value, not a stored/derived ledger sum — no equivalent staleness risk exists structurally) did
  not have this bug.

**Key file:** `src/features/portfolio/PortfolioPage.tsx` — Retirement sub-tab rendering for all three account types.

**Mobile (`apps/mobile`):** ported in Track 4 (Portfolio module) — `apps/mobile/src/features/portfolio/holdings/retirement/` mirrors the web files above; this is the single biggest sub-scope in the entire Portfolio port (~1,760 web lines in `RetirementCard.tsx`/`RetirementSheets.tsx` alone — bigger than the whole Loans module). `STATUS.x` colors appear at the highest concentration in the module here (10 sites in `RetirementCard.tsx` alone) → `useThemeColors()`. Three hand-rolled `fixed inset-0` modal overlays found and rebuilt on the real ported `Modal` component: `NpsLifecycleDetail`, a contribution-breakdown popup inside `RetirementSheets` (never converted to `Modal` even on web, despite that file already using `Modal` elsewhere), and a third one found during the port, `EpfAllTransactionsSheet`. `core/nps/npsClient.ts`'s scheme-list cache used synchronous `localStorage` (incompatible with RN) — fixed via `npsClient.native.ts`, which keeps the existing in-memory `schemesMemCache` but drops the persistent cross-session layer (re-fetches once per cold app start instead of once per week), per the same decision applied to IPO's cache. **EPF passbook PDF import + Excel export (2026-08-08)** is a mobile-only capability with no web-react equivalent (see the EPF section above) — new files `EpfImportFlow.tsx`, `EpfImportReviewSheet.tsx`, `epfImportLogic.ts`, `epfInterestOnDemand.ts`, `epfTxLabels.ts`, `epfReviewFlags.ts` in this same directory. **PPF statement import (2026-08-08)** is likewise mobile-only (see the PPF section above) — new files `PpfImportFlow.tsx`, `PpfImportReviewSheet.tsx`, `ppfImportLogic.ts`. **PPF card redesign (2026-08-08)** is likewise mobile-only (see the PPF section above) — new `PpfAllTransactionsSheet` in `RetirementSheets.tsx` and new file `ppfTxLabels.ts` in this same directory. **EPF employer-switch fixes + per-employer ledger (2026-08-11)** is likewise mobile-only (see the EPF section above) — new files `EpfNewEmployerSetupSheet.tsx`, `EpfEmployerPickerSheet.tsx`, `epfEmployerScoping.ts` in this same directory.

## Current limitations

- All data is entered manually — no NPS PRAN statement import (EPF now has passbook PDF import and
  PPF now has bank/post-office statement import — see above). A brand-new employer created purely
  from an import (never seen before, no existing
  Penny record to match against) has no real basic-salary/contribution-% figures to draw from, so
  `basicSalary` is approximated from the passbook's own EPF-wages column and `employeeContribPct`
  defaults to 12% — both editable the same way any manually-added employer's fields are.
- EPF employer contribution split (EPF vs EPS) uses standard statutory rates; actual employer contributions may differ.
- A real EPF contribution transaction whose `wagesMonth` falls OUTSIDE every tracked employer's
  `[fromDate, toDate]` range (e.g. logged before any employer record was ever added, or a typo'd
  wages month) is not picked up by `epfComputeAllMonths()`'s per-employer month loop, so it's
  silently excluded from `employeeTotal`/`employerTotal`/`corpus` even though it still exists in
  `epfTransactions[]` and still exports correctly. In practice this needs at least one Employment
  entry covering the transaction's wage month to count toward the card's totals — noted as a found
  edge case during the 2026-08-07 real-vs-estimate blending fix (see above), not fixed as it wasn't
  in that fix's scope.
- NPS projection does not account for future contributions, only grows existing corpus.
- EPF still has no generic "edit a past transaction" UI (found 2026-08 while building the
  wage-discrepancy "needs review" flag) — only the interest-mismatch popup's own "Update to ₹X"
  action can correct an interest transaction in place; a contribution flagged as lower than the
  employer's current salary model predicts can only be explained, not corrected. PPF closed the
  equivalent gap for itself (see "PPF — withdrawal tile, info icons, edit/delete transaction" above);
  extending PPF's generic edit/delete pattern to EPF is a real follow-up, not yet done — see
  `docs/plans/epf-passbook-import.md` §9.

## Planned improvements

- **Phase 2:** EPF passbook PDF **export** (presentation-only, not re-importable — Excel export/
  re-import already shipped) — see `docs/plans/epf-passbook-import.md` §11.
- **Phase 2:** NPS PRAN statement import to auto-populate fund units and transaction history.
- **Phase 2:** Future contribution modelling in projection (how much to contribute monthly to hit a target corpus).

## Ideas welcome

- Would a combined "retirement readiness" score across NPS + PPF + EPF be useful, or do you prefer to see each account separately?
- What retirement corpus target logic would you want — a multiple of current salary, a custom target amount, or an inflation-adjusted monthly income?
- Are there other retirement instruments (Atal Pension Yojana, Superannuation funds, gratuity) that should be added?
- How much detail do you need in the EPF projection — just the final number at 58, or year-by-year breakdown?
