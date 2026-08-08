# EPF Passbook Import + Interest Calculator — Consolidated Requirements

Status (2026-08-08): **Shipped, `apps/mobile` only.** Core logic (parser, interest calculator, rate
table, reconciliation, Excel export/import) is built and tested in `packages/core`; the full UI
(§10/§11) is implemented in `apps/mobile/src/features/portfolio/holdings/retirement/` —
`EpfImportFlow.tsx`, `EpfImportReviewSheet.tsx`, `epfImportLogic.ts`, `epfInterestOnDemand.ts`,
`epfTxLabels.ts`, plus the entry-point/nudge/assistant wiring in `RetirementCard.tsx`/
`RetirementSheets.tsx`. `apps/web-react` is frozen, so this has no web equivalent — a deliberate,
permanent divergence (see this doc's own mockup footer note), not a pending parity gap. Remaining
open items: PDF export (phase 2, deferred — see §9/§11) and the still-unresolved questions in §9.
This document is self-contained — written so a fresh session with no other context can pick it up
and know what was built, where, and how.

## 1. Why this feature exists, and why NOT credential-based auto-sync

The user's original ask was INDmoney-style automatic EPF tracking: enter your UAN + EPFO
passbook-portal password, and the app logs in on your behalf to fetch your balance
automatically. This was researched thoroughly and **explicitly rejected** — full reasoning below,
kept because it's a real decision with real research behind it, not an assumption.

**What INDmoney actually does (confirmed via their own privacy policy):** they collect the
user's UAN + EPFO passbook-portal password, and store that password **server-side**, in AWS KMS
— specifically so they can log in again later, unattended. Kuvera does the same.

**Why this doesn't fit Penny, even done "better" (on-device only):**

1. **It requires a server.** EPFO's passbook login has a CAPTCHA (confirmed live on the real
   portal today — a low-entropy static image CAPTCHA, trivially solvable by a funded operator's
   server-side OCR/ML pipeline or a paid solving service, which is almost certainly how INDmoney
   makes the CAPTCHA invisible to their users). Solving it and maintaining the scrape needs
   infrastructure Penny doesn't have and whose absence is the whole point of Penny's local-first,
   zero-backend model. On-device automated CAPTCHA-solving is a heavier, more conspicuous, more
   fragile thing to ship in a mobile app than in a data center, and doesn't remove the need for a
   password to be stored and reused _somewhere_ to make it "automatic."
2. **EPFO explicitly advises against this.** Repeated public EPFO advisories (as recently as June 2025) warn members: "never share your UAN, Password, OTP... with anyone," and specifically
   call out fintech companies doing exactly this, stating those apps are "not authorised by
   EPFO." Nothing in EPFO's terms distinguishes _where_ the automation runs — a bot is a bot
   whether server-side or on-device.
3. **Real account-lockout risk.** Repeated automated logins against a portal that's visibly
   tightening security (mandatory Aadhaar linkage from Jan 2026, UMANG face-authentication login)
   risk locking the user out of their own retirement account — a uniquely bad failure mode for an
   app whose entire pitch is protecting the user.
4. **No legitimate API path exists or is coming soon.** EPF is listed as "proposed" (not live) on
   India's Account Aggregator framework as of the most recent check (Sahamati's FI-type registry,
   29 May 2026) — no published timeline, and EPFO sits outside the five regulators (RBI/SEBI/
   IRDAI/PFRDA/DoR) AA-eligible FIPs are normally regulated by, so this isn't just a pending
   integration, it needs a policy decision Penny has no visibility into or control over.

**What's built instead: PDF passbook import.** EPFO already lets a logged-in user download their
own Member Passbook as a PDF. The user does their own login (their own CAPTCHA, their own
session, nothing automated, nothing that can lock them out), downloads the file, and shares it
into Penny — the same "pick a file → parse it → review before writing" shape Penny's existing
bank-statement and CSV importers already use. No password ever touches Penny. This is explicitly
the _intended_ positioning: **"Penny will never ask for your EPFO password" is a real,
differentiated marketing point** given that both INDmoney and Kuvera do the opposite.

## 2. Scope

- **File format: PDF only.** The EPFO passbook portal (`passbook.epfindia.gov.in`) only offers a
  PDF download — no Excel/CSV export exists. Confirmed (see §8) this PDF has a genuine,
  extractable text layer, not a scanned image — no OCR needed.
- **One PDF = one employer = one financial year.** EPFO generates passbooks per "Member ID"
  (one UAN can have multiple Member IDs, one per employer across a career) and — confirmed
  directly from a real sample — **per financial year**, not an aggregated multi-year view. A user
  with N employers across M years of history has up to N×M separate files to obtain and import.
  The upload flow must support importing multiple PDFs, one at a time or in a batch, without
  forcing the user to have gathered every year up front.
- **Existing manual entry is NOT replaced.** This is purely additive — see §5.
- **Interest crediting is in scope for BOTH import and non-import users** — see §6/§7. This
  emerged directly from the research (interest is the single hardest thing to get right manually,
  since it requires knowing the year's declared rate and running EPFO's actual accrual formula)
  and was an explicit, deliberate scope expansion beyond "just parse the PDF."
- **Interest rates are fetched from a small Cloudflare Worker endpoint**, not hardcoded/baked
  into a release — see §7.3. This was an explicit user requirement so a future rate change never
  needs an app-store release.
- **Out of scope for this doc / deferred:**
  - Any credential-based EPFO auto-login/sync (rejected outright — see §1, not "deferred," a
    closed decision).
  - CAS (CDSL/CAMS mutual fund/demat) PDF import — a separate, unrelated document format and
    feature, tracked independently in `docs/ROADMAP.md`. Solving EPF import does not reduce or
    replace the case for CAS import.
  - NPS PRAN statement import — same "manual entry only, PDF import is a future idea" status,
    not addressed by this doc.

## 3. Where this lives in the app

- **Entry point**: the existing EPF holding UI, `apps/mobile/src/features/portfolio/holdings/
retirement/` — a card-level action on the main EPF card (`RetirementCard.tsx`), **not** inside
  `EpfAllTransactionsSheet` — see §10.1 for the corrected placement and why (one PDF can create a
  new employer, not just add transactions to an existing one, so the action can't be nested inside
  either sub-flow). Not a separate global feature module either way: unlike bank-statement import
  (deliberately a fully separate module — see that doc's §3–4), EPF import is small enough and
  specific enough to one existing screen that it belongs there directly.
- **New parsing module**: `packages/core/src/core/portfolio/epfPassbookParser.ts` (naming
  indicative, not final) — pure function(s), no I/O, following the exact same shape as
  `packages/core/src/core/bank-import/xlsxParser.ts`: takes raw bytes in, returns a structured
  result out, no platform-specific code inside it. Platform file-picking/reading
  (`expo-document-picker` + `expo-file-system`) stays in the `apps/mobile` UI layer, exactly as
  every other import flow in this codebase already does it.
- **New interest-calculation module**: `packages/core/src/core/portfolio/epfInterestCalculator.ts`
  (naming indicative) — the month-by-month accrual simulation described in §6, kept separate from
  the parser since it's needed by BOTH the import-reconciliation flow and the manual-entry
  "calculate it for me" flow (§6.3).
- **New rate-fetching module**: something under `packages/core/src/core/` following the existing
  `EXTERNAL_APIS.md`-registered pattern other external-data fetches use (e.g. NPS NAV, MFAPI) —
  fetch + local cache + baked-in fallback, per §7.3.

## 4. The real passbook PDF format (verified against two real samples)

This section records ground truth confirmed directly against actual downloaded passbooks during
this design's research phase — not reconstructed from blog posts or inferred from parser
source code alone (both were also checked, but the real files are the authority).

- **Genuinely text-based, not scanned.** Verified: `pypdf`/`unpdf` both extract full, clean text
  from a real downloaded passbook with zero OCR involved. (One unrelated low-quality "sample" PDF
  encountered during research turned out to be a screenshot-as-PDF from a blog post, with zero
  extractable text — a useful negative example: **always validate a given PDF actually has a text
  layer before attempting to parse it**, don't assume every PDF a user might upload is the real
  thing.)
- **Bilingual headers, Hindi half is mojibake.** The PDF's table headers render in a legacy
  non-Unicode Devanagari font, so text extraction produces garbage for the Hindi half and clean
  text for the English half, e.g. the literal extracted string `deZpkjh 'ks"k / Employee Balance`.
  **Column/row matching must key off the English half only**, via substring match — never assume
  a clean single-language header string.
- **Header block** (verified against real samples), as `label | value` pairs:
  - `Establishment ID/Name` → e.g. `TSTEST0000000001 / SYNTHETIC TEST EMPLOYER PRIVATE
LIMITED`
  - `Member ID/Name` → e.g. `TSTEST00000000019999999 / TEST SYNTHETIC USER` <!-- pii-ignore: synthetic -->
  - `Date of Birth`
  - `UAN`
  - Filename itself follows `<MemberID>_<FinancialYearStartYear>.pdf` — a strong, independent
    confirmation of the "one PDF per employer per FY" structure, and a candidate cheap first-pass
    signal (parse the filename before or alongside the content) for pre-filling which employer/FY
    a given upload is likely for, subject to actual content confirming it.
- **Transaction table columns** (verified): `Wage Month | Transaction Date | Type (CR/DR) |
Particulars | EPF Wages | EPS Wages | Employee contribution | Employer contribution | Pension
contribution`. Two wages columns (EPF-wages, EPS-wages) exist, not one shared column — see the
  schema gap in §5.
- **No running-balance column.** Balance only ever appears via labelled summary rows:
  - `OB Int. Updated upto DD/MM/YYYY` — opening balance for the FY (employee/employer/pension
    columns), inclusive of all interest credited up to that date.
  - `Total Contributions for the year [ YYYY ]`
  - `Total Transfer-Ins/VDRs for the year [ YYYY ]`
  - `Total Withdrawals for the year [ YYYY ]`
  - `Int. Updated upto DD/MM/YYYY` (a second, later occurrence — the year's credited interest,
    NOT itemised per month, split employee/employer/pension — see §6.1 for why pension is always
    0 here)
  - `Closing Balance as on DD/MM/YYYY`
- **Row-level particulars strings observed**: `Cont. for Due-Month <MMYYYY>`, `TRANSFER IN - ...`,
  `OFFICE`, `Old Member Id`. These are useful provenance to keep (see §5's `sourceParticulars`
  field) even though Penny's own `EpfTransactionType` enum already categorizes the row more
  usefully for calculation purposes.
- **A real sample's full numeric self-consistency was verified end to end** (see §6.1) — the
  formula in this doc reproduces the exact credited interest figures in a real passbook, not just
  a plausible-looking approximation.

## 5. Schema changes — what the passbook has that Penny's model doesn't yet

Confirmed via a direct field-by-field audit against `packages/core/src/core/db/types/index.ts`'s
existing `EpfEmployer`/`EpfTransaction` types. Principle applied throughout, per explicit user
decision: **do not infer or assume any field Penny doesn't currently capture — add the field and
capture the real value.** (This reversed an earlier, wrong instinct to just infer a missing
deposit date as "wage month + 1" — the user correctly redirected: if the real date is sitting
right there in the passbook, store the real date, don't approximate it.)

### `EpfEmployer` gains:

- `currentEmploymentConfirmed?: boolean` (2026-08, real-user-feedback round) — `true` only once the
  user has explicitly answered "yes, still employed here" to the "Are you still working at X?"
  card prompt (§10.6). Disambiguates the import path specifically: leaving `toDate` unset because
  there was no LATER employer to bound it against is NOT itself evidence the job is still ongoing
  (importing a single, strictly-past-FY passbook proves nothing about "now"). Never set for a
  manually-added employer — that flow already asks "current employer?" implicitly by leaving
  `toDate` blank.
- `establishmentId?: string` — from the passbook's `Establishment ID/Name` header field.
- `memberId?: string` — from the passbook's `Member ID/Name` header field. **This becomes the
  real matching key for "which employer does this PDF belong to"** during import — company name
  alone is unreliable (e.g. rejoining the same employer later would otherwise be ambiguous).
- `balanceCheckpoints?: { asOfDate: number; employeeBalance: number; employerBalance: number;
pensionBalance: number }[]` — captures the passbook's `OB Int. Updated upto`/`Closing Balance
as on` rows as their own concept, distinct from the transaction ledger. Not currently modelled
  at all (Penny only ever derives a running total by summing transactions). Purpose: validate that
  Penny's computed balance actually agrees with EPFO's stated balance after an import, and detect
  a gap year by chaining FY N's closing checkpoint to FY N+1's opening checkpoint.

### `EpfTransaction` gains:

- `epfWages?: number`, `epsWages?: number` — the wage baseline each contribution was calculated
  on. Penny currently stores only the resulting contribution amounts, discarding the wage figure
  the passbook actually shows.
- `sourceParticulars?: string` — the passbook's own row label (e.g. `Cont. for Due-Month
122014`, `TRANSFER IN - ...`), kept **separate** from the existing `note?: string` field (which
  is user-authored free text) so imported provenance and manual annotation never collide or get
  silently overwritten by each other.
- `sourceRef?: string` / an import-batch identifier — mirroring the dedup/traceability pattern
  bank-import and CSV-import already use for their own imported rows, needed for §6.5's
  reconciliation matching and to distinguish "this row came from a PDF import" from "this row was
  typed in by hand" at a glance.
- `date` (existing field) — for an imported row, this must be the **real transaction/deposit
  date parsed from the passbook**, never an inferred/approximated value, even though the accrual
  rule in §6.1 could technically derive it from `wagesMonth` alone. Store what's actually there.

## 6. Interest — the hardest and highest-value part of this feature

Research found EPF interest is **entirely manual today** — no auto-crediting logic exists
anywhere in `epfCalculations.ts`; `EPF_RATE` (currently hardcoded 0.0825) is only ever used for
the forward-looking retirement-age projection, never to compute what a specific past year's
interest credit should have been. This is almost certainly why real users rarely log an accurate
interest figure by hand — correctly computing it requires knowing the year's declared rate _and_
correctly implementing EPFO's non-obvious accrual timing rule. This makes interest calculation the
single highest-value piece of this whole feature, independent of whether the user ever imports a
PDF at all.

### 6.1 The accrual rule (explicit, user-provided, verified against real data)

> A contribution made for salary month M does **not** earn interest in that same month. Employers
> typically deduct the EPF contribution for month M from salary but deposit it with EPFO by the
> 15th of month M+1. Interest is calculated on each month's **opening balance**; a deposit made
> in month M+1 is not part of that month's opening balance (it's a same-month inflow), so it
> earns **zero interest for month M+1**, and only starts earning interest from month M+2 onward
> — i.e., from the month **after** the month it was actually deposited in.

**Verified exactly against a real passbook** (FY2014–15, rate 8.75%, wage months Nov/Dec/Jan/Feb
with deposits one month later in Dec/Jan/Feb/Mar): running this rule month-by-month against the
real employee contributions (₹851/945/945/945) and summing `(rate/12) × balance` for however many
months each contribution actually sat in the opening balance before FY-end produces **₹39.28 →
rounds to ₹39** for employee interest and **₹12.01 → rounds to ₹12** for employer-EPF interest —
an **exact match** to the real passbook's own credited `Int. Updated upto 31/03/2015` row. Pension
interest computed as ₹0 by the rule, also an exact match (EPS/pension balances never earn
interest — confirmed both by this passbook and by general EPF-domain knowledge; the accrual
simulation should hard-exclude the pension balance from interest calculation entirely, not just
happen to compute 0 for it).

### 6.2 Implementation shape: month-by-month simulation, not a closed-form shortcut

Deliberately NOT "amount × remaining-months-in-FY" as a single formula (which only holds when the
rate is constant for the whole FY) — instead, simulate month by month across the FY (April→March):

1. Carry forward the opening balance from the prior FY's closing checkpoint (0 if none exists —
   e.g. the very first year of a fresh EPF account).
2. For each calendar month in the FY: interest for that month = that month's **opening balance**
   (explicitly excluding any contribution _deposited in_ that same month, per §6.1) × that
   month's applicable monthly rate (`annual rate ÷ 12`, looked up per §7 — this is what makes the
   2000–01 mid-year split "fall out for free," since it's just two different rates applying to
   different months within the same simulation, no special-casing needed anywhere in this logic).
3. Sum all 12 months' interest into one lump figure — **never compound mid-year**; EPFO only adds
   interest to the actual balance once, at FY close, matching real passbook behavior (a fresh
   contribution never earns "interest on interest" within the same year it was credited).
4. The employee-balance and employer-EPF-balance columns are simulated **independently** (each
   has its own running opening balance and its own resulting interest); the pension/EPS balance
   is excluded from this simulation entirely.

This same simulation function serves both the import-reconciliation flow (§6.4, comparing EPFO's
actual credited figure against a recomputation, as a sanity check / conflict input) and the
manual "calculate it for me" flow (§6.3) — one implementation, two callers, not two.

### 6.3 For users who never import a PDF: proactive nudge + on-demand calculator

- **Nudge trigger**: once a financial year has closed (past March 31) and no `interest`-type
  `EpfTransaction` exists yet for that employer for that FY, show a nudge on the EPF card —
  same established visual pattern as the existing PPF "deposit before April 5" `Banner` already
  in `RetirementCard.tsx` (reuse that pattern, don't invent a new one).
- **Every past FY with a gap gets its own nudge**, not just the most recently closed one —
  explicit decision: someone who's used Penny for 3 years without logging interest should see all
  3 gaps surfaced, not just the latest, consistent with this codebase's standing "never silently
  drop something the user should know about" principle (same principle bank-import's carry-
  forward and rejected-row handling already follow).
- **The calculation itself is opt-in, inside the existing "Add transaction" flow**
  (`EpfTransactionSheet`), not automatic: when the user selects transaction type "Interest," show
  a small info card with an explicit button — **"Want me to calculate it for you?"** (user's own
  wording, use verbatim). Tapping it:
  1. Looks up the FY's rate(s) from the cached/fetched rate table (§7).
  2. Runs the §6.2 simulation against whatever contribution data already exists for that
     employer/year — real logged `EpfTransaction`s if present, or the existing auto-estimated
     monthly figures (`epfComputeAllMonths()`, already implemented) if the user has never logged
     anything at all. Works identically either way — no separate code path needed for "has real
     data" vs. "estimate only."
  3. **Pre-fills the amount field. Never auto-saves.** The computed number sits in the form,
     editable, and the user must still tap Save — matching this codebase's universal "always
     reviewable, never silently invented" principle for any computed-on-behalf-of-the-user value.
- **If the rate for the needed FY isn't available yet** (a real, recurring situation — EPFO
  often doesn't declare/ratify a year's rate until well after that year starts; one of the real
  sample PDFs literally showed "Interest details N/A" for this exact reason) — the calculator
  must say so explicitly ("rate not yet available for FY XXXX–YY"), never silently fall back to
  a guessed or prior-year rate.

### 6.4 For users who DO import a PDF: interest is reconciled like any other row

Interest gets **no special-cased UI treatment** in the import-review flow — it uses the exact
same reconciliation mechanism as every other imported transaction (§6.5). The only thing that
makes interest distinctive in practice is that, since almost nobody logs it manually today, most
imported interest rows will land as a clean "fills a gap, nothing to compare against" case rather
than a genuine conflict — see §6.5's UI note about visually distinguishing those two states so a
rare real conflict doesn't get lost among many non-conflicting first-time additions.

### 6.5 Reconciliation model for imported rows

Reconciliation and interest are tightly coupled (interest is the highest-volume case of
reconciliation in practice), so this section sits directly after interest rather than living
somewhere disconnected from it.

This is **not** bank-statement import's fuzzy amount/date-proximity matcher, ported over.
Explicit user decision: EPF contribution (and interest) rows have a natural, exact key already —
**`(employer via memberId, wagesMonth, transaction type)`** — since EPFO can only ever fund one
contribution per employer per wage-month. This is a direct lookup, not fuzzy matching.

For each row in an imported passbook, look up whether an `EpfTransaction` already exists for the
same `(memberId, wagesMonth, type)`:

1. **No existing entry** → clean add, no conflict. (This will be the common case for interest,
   per §6.4, and possibly common for contributions too if the user has never logged this employer
   manually before.)
2. **Existing entry, amounts already agree** (exact or within a trivial rounding tolerance) →
   clean merge; consider a quiet aggregate summary ("12 months already matched, nothing to
   review") rather than listing every non-conflicting row individually, so the review screen
   isn't cluttered with non-decisions.
3. **Existing entry, amounts disagree** → the real conflict case. **The imported value is
   pre-selected as the default** (explicit decision — EPFO's own passbook is ground truth; a
   pre-existing manual entry is more likely to be an estimate or a typo), but both values are
   shown side by side and the user can keep either. Reuse the existing visual pattern
   bank-import's "Matched" bucket already has for exactly this "statement value vs. recorded
   value, side by side" comparison — reuse the _pattern_, not the _matching logic_, which is
   architecturally different (exact key lookup here, not fuzzy candidate scoring).

The review screen should visually distinguish case 1 ("fills a gap you didn't have") from case 3
("contradicts something you already had") — explicit UI requirement from the interest discussion,
generalizes to all row types, not just interest.

## 7. EPF interest rate data — Cloudflare-hosted, not baked into the app

Explicit user requirement: rates change roughly annually (sometimes with a mid-year split, as in
2000–01), and re-shipping an app-store release every time a rate is declared is unacceptable
overhead for something this small. This follows the exact same architectural shape as Penny's
existing external-data-fetch pattern (`docs/EXTERNAL_APIS.md` — NPS NAV, MFAPI, etc.) — nothing
novel, just one more registry entry.

### 7.1 Data — full 1986–87 to 2026–27 table, confirmed with user

| Financial Year | Rate                                    |     | Financial Year | Rate  |
| -------------- | --------------------------------------- | --- | -------------- | ----- |
| 1986–87        | 11.00%                                  |     | 2007–08        | 8.50% |
| 1987–88        | 11.50%                                  |     | 2008–09        | 8.50% |
| 1988–89        | 11.80%                                  |     | 2009–10        | 8.50% |
| 1989–90        | 12.00%                                  |     | 2010–11        | 9.50% |
| 1990–91        | 12.00%                                  |     | 2011–12        | 8.25% |
| 1991–92        | 12.00%                                  |     | 2012–13        | 8.50% |
| 1992–93        | 12.00%                                  |     | 2013–14        | 8.75% |
| 1993–94        | 12.00%                                  |     | 2014–15        | 8.75% |
| 1994–95        | 12.00%                                  |     | 2015–16        | 8.80% |
| 1995–96        | 12.00%                                  |     | 2016–17        | 8.65% |
| 1996–97        | 12.00%                                  |     | 2017–18        | 8.55% |
| 1997–98        | 12.00%                                  |     | 2018–19        | 8.65% |
| 1998–99        | 12.00%                                  |     | 2019–20        | 8.50% |
| 1999–00        | 12.00%                                  |     | 2020–21        | 8.50% |
| **2000–01**    | **12.00% (Apr–Jun) → 11.00% (Jul–Mar)** |     | 2021–22        | 8.10% |
| 2001–02        | 9.50%                                   |     | 2022–23        | 8.15% |
| 2002–03        | 9.50%                                   |     | 2023–24        | 8.25% |
| 2003–04        | 9.50%                                   |     | 2024–25        | 8.25% |
| 2004–05        | 9.50%                                   |     | 2025–26        | 8.25% |
| 2005–06        | 8.50%                                   |     | 2026–27        | 8.25% |
| 2006–07        | 8.50%                                   |     |                |       |

**2000–01 is the only historical mid-year change** — confirmed with user. The data model (§7.2)
must support this without a special case, since it's exactly the kind of thing that could recur.

### 7.2 Data shape — rate periods, not one-rate-per-FY

```json
[
  { "effectiveFrom": "1986-04", "ratePct": 11.0 },
  { "effectiveFrom": "1987-04", "ratePct": 11.5 },
  { "effectiveFrom": "2000-04", "ratePct": 12.0 },
  { "effectiveFrom": "2000-07", "ratePct": 11.0 },
  { "effectiveFrom": "2001-04", "ratePct": 9.5 }
]
```

Each entry means "this rate applies from this month onward, until the next entry's
`effectiveFrom`." The §6.2 month-by-month simulation looks up "what rate was in effect for month
X" against this list directly — the 2000–01 split falls out as two consecutive entries, no
special "isSplitYear" flag or branching logic needed anywhere in the calculator.

### 7.3 Hosting, fetching, caching — explicit decisions

- **Add a new route to the existing `workers/api-proxy` worker** (e.g. `/epf-rates`) — do not
  stand up a new dedicated worker. This is a tiny, static, read-only dataset; it doesn't need its
  own deploy lifecycle.
- **Storage: a static JSON file committed in the worker's own source**, redeployed only on the
  rare occasion a new rate is declared/ratified. No KV/database needed — this changes at most
  once a year, and even then only after EPFO officially ratifies it (historically well into or
  after the FY it applies to).
- **App-side caching**: fetch once, cache indefinitely locally; re-fetch only periodically (e.g.
  monthly) or on-demand when the interest calculator needs a rate it doesn't have cached for a
  given FY — not on every app launch.
- **Offline-first fallback, non-negotiable**: the app ships with the §7.1 table baked in at build
  time as a default. Network access only ever _refreshes_ this table when available; it is never
  _required_ for the calculator to function at all, preserving Penny's local-first principle even
  for this one server-touching feature. A genuinely new/undeclared FY's rate (not yet in either
  the baked-in table or successfully fetched) surfaces as "not yet available," per §6.3 — never a
  silent guess.

## 8. Feasibility spike — already run and passed

Recorded here for completeness since it directly de-risked this whole plan and should not be
re-run or re-litigated by whoever implements this next.

- **Library selected: `unpdf`** (npm, zero runtime dependencies, single bundled serverless-PDF.js
  build, no DOM/Canvas dependency needed for `extractText()`). Chosen specifically because
  Penny's own `zip.js` dependency once broke under Metro's async-require mechanism due to a
  many-submodule dynamic import — `unpdf`'s single-file bundled shape avoids that failure class,
  matching `xlsx`'s already-proven-safe shape rather than `zip.js`'s already-proven-unsafe one.
- **Verified in Node** (isolated from RN, to separate "does the library work" from "does it
  bundle under Metro"): `unpdf`'s `getDocumentProxy()` + `extractText()` successfully extracted
  2,628 characters of clean text from a real downloaded EPFO passbook PDF, matching what `pypdf`
  independently extracted from the same file.
- **Verified on a real Android device**: added `unpdf` to `packages/core`'s dependencies, built a
  throwaway spike screen in `apps/mobile` (file-pick → read bytes → `unpdf.extractText()`), ran a
  full `expo run:android` rebuild (succeeded, no Metro bundling errors), and manually tested
  picking the real sample PDF on the emulator — **confirmed working, text extracted
  successfully, on-device, in a real Hermes/Metro build.**
- The throwaway spike screen and the temporary `App.tsx` swap were both fully reverted after the
  test. The **only lasting change** from the spike is `unpdf` remaining as a real dependency in
  `packages/core/package.json` (and the corresponding `pnpm-lock.yaml` update) — kept
  deliberately, since it's now a proven, needed building block, not leftover scaffolding.
- **Two real sample PDFs were used for this research, neither of which was kept or committed**:
  one genuine multi-employer passbook PDF (a real EPFO export, confirmed via `pypdf` to have a
  full extractable text layer) and one negative example (a screenshot-as-PDF from a blog post,
  zero extractable text, image-only) — the latter useful precisely because it demonstrates the
  parser must validate a real text layer exists before attempting to parse, rather than assuming
  every uploaded PDF is a genuine passbook export. **PII note**: the real passbook's visible image
  had its member ID/UAN/name blacked out by the person who shared it, but the underlying PDF text
  layer still carried all three in plaintext (visual redaction ≠ text-layer redaction — a box
  drawn over text doesn't delete the text object underneath it). The file was used only
  transiently for local verification and was never copied into the repo; every example value in
  this document and in code comments uses the synthetic placeholders from
  `tests/fixtures/epf-passbook-synthetic.pdf` instead. See `scripts/check-pii.mjs` for the
  pre-commit gate added specifically to catch this class of mistake going forward.

## 9. Open items for the next design pass

Resolved via the mockup-first process (`docs/mockups/proposals/epf-passbook-import-v1.html`
through `-v4.html`, all approved) — see §10/§11 below for the decisions:

- ~~Exact UI/mockup for the "Import passbook PDF" entry point and its review screen~~ → §10.1/§10.2.
- ~~Exact copy/visual treatment for the FY-end interest nudge~~ → §10.3 (reuses the PPF `Banner`
  pattern verbatim, placed right after the corpus stat strip).
- ~~Exact copy/visual treatment distinguishing "fills a gap" vs. "conflicts with existing data"~~ →
  §10.2, Direction C (conflict-first triage).
- ~~Multi-file upload UX~~ → §10.4.
- ~~Whether interest transactions should show the rate/calculation used~~ → §10.5 (yes — computed
  on demand, no schema change).

Still genuinely open, not yet resolved:

- Whether `balanceCheckpoints` (§5) should also power a proactive "your computed balance doesn't
  match EPFO's stated balance" validation warning, beyond just being stored data — flagged as a
  good idea during design but not yet scoped as a concrete requirement.
- Exact wording/UX for the "rate not yet available for FY XXXX–YY" state — a first draft exists in
  mockup v2 §4 ("we'll never guess... check back once it's ratified") but hasn't been copy-reviewed.
- Whether establishment/member ID should be editable by the user post-import, and how a
  duplicate-employer-name-different-memberId scenario should surface in the employer-picker UI
  when adding a new employer manually vs. via import.
- PDF export (statement, presentation-only, not re-importable — see §11) is explicitly phase 2,
  deferred until Excel export (phase 1) ships. Needs its own scoping pass (which library — likely
  `expo-print` — and exact statement layout) when picked up.
- **No "edit a past transaction's amount" UI exists anywhere in this feature** (2026-08, found while
  building §10.6's wage-discrepancy flag). The "lower than predicted" case of that flag can only
  explain the discrepancy today, not let the user correct the stale amount in place — the user has
  to already know this and work around it (e.g. delete-and-recreate isn't supported either). A
  proper fix needs its own scoping pass — likely a small edit affordance on `EpfAllTransactionsSheet`
  rows, gated to whichever fields make sense to edit post-hoc — deliberately not built as a
  drive-by inside the wage-discrepancy flag's own scope.

## 10. UI design decisions (finalized via mockup review, 2026-08-07/08)

All four mockup rounds are grounded in the real current screens (not an invented theme/layout —
v1 was rebuilt in v2 after being caught rendering the wrong theme and missing screens) and are
approved. Implementation should follow these exactly; treat the mockup HTML files as the visual
source of truth for spacing/color/copy, this section as the index of _what_ was decided and _why_.

### 10.1 Entry point — card-level action (mockup v2 §1, Direction A)

A single "Import passbook PDF" quiet slate action lives on the main EPF card itself (in
`RetirementCard.tsx`'s EPF section), placed right after the "UAN · birth year · company" meta line
and before the Employment section — **not** inside `EpfAllTransactionsSheet` (v1's mistake). Reason:
one PDF can either create a brand-new employer record or add transactions to an existing one (§2 —
"one PDF = one employer + one FY"), so the action has to sit above both of those sub-flows, not
nested inside either. The untracked "Track EPF" CTA card (`RetirementUntrackedCard`) also gets a
secondary "or import passbook PDF →" link, letting a first-time user skip manual UAN/company entry
entirely if they already have a passbook PDF.

### 10.2 Reconciliation review screen — Direction C, conflict-first triage (mockup v2 §2)

Of three structurally distinct directions explored (bucket sections copying bank-import's
Matched/Possible/Unmatched taxonomy; a single FY-native chronological list; conflict-first triage),
**Direction C** was chosen: the one real conflict (if any) is pinned open at the top under a "Needs
your decision" label; new rows render as a pre-checked, individually-toggleable checklist (borrowed
from bank-import's `UnmatchedBucket` pattern) under "New — will be added"; matched rows collapse
into a single quiet summary line ("3 already matched — nothing to review"), never listed
individually. This directly implements §6.5's own requirement that the conflict case be "the
clearest, most carefully designed state" and that matches "quiet-summarize" rather than list — the
other two directions only achieved this cosmetically, not structurally.

### 10.3 FY-end interest nudge (mockup v2 §3)

Reuses `<Banner variant="warning" icon="ti-calendar-event">` verbatim — the exact component/variant
PPF's "deposit before April 5" nudge already uses in `RetirementCard.tsx`, new copy only ("FY
2024-25 interest not recorded yet — add it via + Add above, or import your passbook PDF."). Placed
immediately after the Employee/Employer/Interest-earned stat strip, before the Monthly Contribution
box. One banner is rendered **per past FY with a gap**, not just the most recent — per the standing
"never silently drop something the user should know about" principle. Stays non-interactive, same
as the PPF banner it copies — the actual add-interest action is still the card's existing "+ Add".

### 10.4 Multi-file batch import (mockup v3 §5)

The file picker allows multi-select (`expo-document-picker`'s `multiple: true`, no extra native
work). Flow: pick N files → a **batch summary screen** listing each file's detected
employer/FY/row-count and a status (`Ready` / `Skip` for a detected duplicate — same employer+FY
picked twice — or an unreadable file, using the same `EpfPassbookParseError` cases §8 already
defined) → **sequential per-file review**, reusing §10.2's Direction C completely unchanged, with a
"File X of N" chip added to the header and the confirm button reading "Import & continue to File
Y of N" until the last file → one **combined done screen** ("3 statements imported — 35 new · 3
matched · 1 conflict resolved · 2 files skipped"). Skipped files are never silently retried or
dropped — always shown with a reason.

### 10.5 Interest rate + calculation display (mockup v4 §6)

User's ask: since the rate can differ by FY, show which rate applied to an interest transaction,
and if possible the calculation itself. **No new schema field required** — both pieces are cheap to
compute on demand at display time from data that already exists:

- **Rate used**: `lookupRateForMonth(table, aprilOfThatFy)` against the already-built rate table
  (§7) — a thin new convenience wrapper, e.g. `getInterestRateForFy(table, fyStartYear)`.
- **Calculation shown**: `calculateEpfInterestForYear()` (§6.2) already runs a month-by-month
  simulation internally via its private `simulateOneStream()` helper but only returns the final
  totals today. Extend `EpfInterestCalculationResult` with an optional `employeeTrace`/
  `employerTrace: { month: string; openingBalance: number; ratePct: number; interest: number }[]`
  populated by that same simulation — purely additive, doesn't change any existing field or break
  existing tests (which assert individual fields, not whole-object equality).

Applies uniformly to every interest transaction regardless of origin — typed manually, produced by
§6.3's "calculate it for me" assistant, or reconciled from an import — always recomputed fresh from
the FY + the employer's currently-logged contributions, never stored as a frozen snapshot (so it
never goes stale if contributions are edited later). Interest rows in `EpfAllTransactionsSheet`
become tappable (they aren't today — only contribution-month rows are, via `selectedMonth`), opening
a new breakdown popup styled like the existing contribution-breakdown popup: rate-used info card,
month-by-month mini-table, and — if the recorded amount doesn't match Penny's fresh recalculation
(e.g. an older manual entry, or contributions edited after the interest was recorded) — a quiet,
non-judgmental note showing both figures side by side rather than asserting either is wrong.

### 10.6 Post-launch real-user-feedback round (2026-08) — employment confirmation + "needs review" flags

Three fixes from real usage, all `apps/mobile`-only (`RetirementCard.tsx`/`RetirementSheets.tsx`/
`epfInterestOnDemand.ts`/new `epfReviewFlags.ts`, plus `epfCheckWageDiscrepancy` in
`packages/core/src/core/portfolio/epfCalculations.ts`):

- **"Are you still working at X?" card prompt** — root-cause fix for a real bug: importing a single,
  strictly-past-FY passbook in isolation (e.g. FY2014-15) left that employer's `toDate` unset (=
  "current"), so `epfComputeAllMonths` silently estimated contributions for every month from that
  import all the way to today. `findEmployersNeedingEmploymentConfirmation`
  (`epfInterestOnDemand.ts`) scans for employers left "current" with no later employer to bound them
  and whose only real contribution evidence is entirely behind the current FY, and `RetirementCard`
  renders one Yes/No prompt per match (`ti-briefcase` icon, warning tint — same visual family as the
  §10.3 nudge but a distinct icon so the two are never confused). Yes sets
  `currentEmploymentConfirmed: true` (explicit, no longer silent); No bounds `toDate` to 31 March of
  the last FY with real evidence.
- **"Needs review" flags** — two independently-detected conditions, computed ON DEMAND (never
  stored, matching every other derived value in this feature) via a single shared function,
  `findAllReviewFlags` (`epfReviewFlags.ts`), so the row badges and the card-level count can never
  disagree with each other:
  - _Interest mismatch_ (`checkInterestMismatch`): a recorded interest transaction whose total
    disagrees with a fresh `computeEpfInterestOnDemand` recalculation for its FY, beyond the ₹1
    tolerance `epfReconciliation.ts` already uses. This is also now the single source of truth for
    the interest-breakdown popup's own recorded-vs-recomputed banner (previously computed inline,
    separately — refactored to call the same function, per the "must never disagree" principle).
  - _Wage discrepancy_ (`checkWageDiscrepancy`, wrapping `epfCheckWageDiscrepancy` in
    `packages/core`): a real contribution whose amount disagrees with what the employer's CURRENT
    salary model (`epfGetSalaryForMonth × employeeContribPct`) would predict, beyond a 2% relative
    tolerance (relative, not flat-rupee, to avoid rounding noise). Higher-than-predicted is flagged
    as a possible unrecorded salary hike, with an opt-in "Add hike: ₹X/mo" action in the
    contribution-breakdown popup that back-calculates a basic salary and appends a new
    `EpfSalaryHike` — never written silently. Lower-than-predicted is flagged as possibly stale
    versus a since-added hike, explanation-only (no edit-transaction-amount UI — see §9's open item
    on this).
  - Both flag types render a small `ti-alert-triangle` badge on their respective row in
    `EpfAllTransactionsSheet` (distinct from the green rate-tag pill), and sum into a single "N need
    review" pill on `RetirementCard` next to "See all transactions", tappable to open that same
    sheet.

### 10.7 Two more real-usage bugs (2026-08-08): employer coverage extension + row-type classification

Found in immediate follow-up real-device testing after §10.6 shipped — both are genuine correctness
bugs, not polish.

- **Employer coverage extension** (`extendEmployerCoverage`, `epfImportLogic.ts`). First discovered
  shape: import FY2014-15 → answer "No" to the employment prompt (bounds `toDate` to March 2015) →
  later import FY2015-16 for the SAME employer (matched by `memberId`) → the new real transactions
  were written correctly but became invisible in both "See all transactions" and the card's totals,
  because `commitUnit`'s merge-into-existing-employer path never moved `toDate`, and
  `epfComputeAllMonths`'s per-employer loop stops there.

  The first fix attempt (extend `toDate` to the newly-imported unit's FY-END whenever any unit for
  that FY lands) was ALSO wrong, caught in the same testing session: importing a year where the
  person had already left mid-way through a PRIOR year (so this unit's real contribution rows stop
  partway through the FY, or there are none at all — just an interest credit, or nothing) is not
  evidence employment continued to the end of that FY. `extendEmployerCoverage` now bounds `toDate`
  (and, symmetrically, `fromDate` backward) to the LATEST/EARLIEST real **contribution** row date
  actually found — never a calendar FY boundary — and a unit with zero contribution rows extends
  neither. Clearing `toDate` outright only happens if the latest real contribution row itself falls
  in the current real-world FY; otherwise the new bound resets `currentEmploymentConfirmed` to
  `false` so §10.6's prompt asks again, now anchored correctly.

  Every imported unit's FY is unconditionally added to a new `EpfEmployer.confirmedFys?: number[]`
  regardless of whether it moves `fromDate`/`toDate` — a contribution-free confirmed year (e.g. 2018,
  2019 in the real bug report: no contributions, just an interest credit then a transfer-out) is
  real, authoritative EPFO data, not a gap to estimate over. `epfComputeAllMonths` now treats any
  month with no matching real transaction inside a `confirmedFys` year as a confirmed real zero
  (`isReal: true`, all amounts 0), not the formula estimate — this is what actually stops the
  "keeps adding contributions past when the person left" symptom; the `toDate` fix alone wasn't
  sufficient once multiple contribution-free years get imported in sequence.

- **Row-type misclassification** (`epfPassbookParser.ts`, `epfReconciliation.ts`, `epfImportLogic.ts`).
  A real, previously-uncaught bug found in the same session: EVERY row in a parsed passbook's
  transaction table was being reconciled and written as a `'contribution'`, regardless of what its
  own particulars text said — a genuine "TRANSFER IN - Old Member Id ..." row was silently imported
  as a fabricated monthly contribution with a made-up `wagesMonth`, never recognized as the one-time
  lump-sum transfer it actually is. The parser's own `ROW_PATTERN` already captured the row's CR/DR
  flag, but it was being discarded (`const [, wageMonthRaw, dateRaw, , particulars, ...] = m` — note
  the empty slot). Fixed: `classifyRow(crDr, particulars)` now classifies each row as
  `'contribution' | 'transfer_in' | 'withdrawal'` (transfer/settlement keywords in particulars first,
  falling back to the CR/DR flag — a DR row with no recognized keyword is still `'withdrawal'`, never
  silently treated as a contribution). `ParsedEpfPassbookRow` gained an optional `rowType` field
  (defaults to `'contribution'` when absent, so `epfExcelImport.ts`'s already-correctly-typed rows —
  which never had this ambiguity in the first place, since by the time data reaches Excel it's
  already split into `employerStatements`/`balanceEvents` by real type — don't need to set it).
  `reconcileUnit` (`epfImportLogic.ts`) now splits a unit's rows by `rowType` before reconciling:
  contribution rows go through the existing wagesMonth-keyed path; transfer_in/withdrawal rows are
  grouped by type (summed if more than one of the same type lands in one FY, mirroring
  `epfExcelImport.ts`'s own same-type-same-FY aggregation) and reconciled via
  `reconcileEpfBalanceEvent`, which gained optional `eventDate`/`label` parameters so a real
  transfer's own date/particulars are used instead of that function's original once-a-year-interest
  defaults (FY-end date, "Int. Updated" label).

### 10.8 Mid-month employer switch (2026-08-08): reconciliation needs to know WHICH employer

A third real bug found in the same follow-up session, reported directly: a genuine mid-month job
switch (e.g. leaving Company A partway through August 2017, joining Company B the same month) means
BOTH employers can have a real, correct contribution for the exact same `wagesMonth`. Before this
fix, `reconcileEpfContributionRows` matched by `wagesMonth` alone against the WHOLE holding's
transactions — so importing Company B's August row saw Company A's already-logged August row as a
false "conflict" to resolve one-or-the-other, when both are legitimately correct and simply belong
to different employers.

Fixed with a new `EpfTransaction.employerId?: string` — stamped on every contribution transaction at
import time (`epfImportLogic.ts` always knows exactly which employer's unit it's committing).
`reconcileUnit` now scopes the `existingTxns` passed to `reconcileEpfContributionRows` to ONLY
transactions belonging to the SAME employer as the unit being imported — via `employerId` where set,
or (for a transaction written before this field existed) `epfEmployerForWagesMonth`'s date-range
containment check, consolidated out of what used to be three near-duplicate private copies of this
logic (`epfExcelExport.ts`, `epfReviewFlags.ts`, and the one this fix needed) into one shared
`packages/core/src/core/portfolio/epfCalculations.ts` function. That shared function deliberately
returns `null`/no match whenever MORE than one employer's range covers a month (a genuine switch
month, for legacy data with no `employerId` to disambiguate it) rather than guessing — the whole
point being import-time `employerId` stamping should make this ambiguity increasingly rare over
time, never that the fallback silently picks a side. A brand-new employer (not yet tracked) always
gets an empty reconciliation scope, since nothing already logged could belong to it.

The wage-discrepancy flag's "lower than predicted" explanation (§10.6) now also mentions a possible
partial/switch month alongside the existing "hike since recorded" explanation, since a pro-rata
reduced contribution in a switch month will always look "lower than a full month's salary would
predict" — that's expected, not a data error, and the copy should say so.

## 11. Full EPF statement export + re-import (Excel phase 1; PDF phase 2, deferred)

New scope, added after the core import/reconciliation work above, addressing: "export the whole
user's EPF statement combined, better than EPFO's own per-employer-per-FY download, and let it be
re-imported later." Split deliberately into two features with different reliability bars:

- **Excel is the structured, round-trippable format** — Penny fully controls its own sheet/column
  layout, so reading it back in is parsing our own schema, not text-scraping an arbitrary PDF (the
  exact fragility that produced two real regex bugs in §8's passbook parser during development). A
  new `epfExcelExport.ts` builds the workbook data as a pure function (mirroring
  `packages/core/src/core/loans/planExport.ts`'s existing "plain arrays in, platform renders to
  `.xlsx`" shape — reuses the `xlsx` dependency already in `packages/core/package.json`, no new
  package needed). A new `epfExcelImport.ts` reads that same workbook shape back into the exact
  same row shape `epfPassbookParser.ts` produces, so **`epfReconciliation.ts` needs zero changes** —
  it already works on structured rows regardless of source format.
- **PDF is presentation-only, explicitly phase 2, and is not promised to round-trip.** Genuinely
  useful for sharing with a CA or printing, but no PDF-generation library exists in this codebase
  yet (`unpdf` only _reads_ PDFs) — would need a new dependency, most likely `expo-print` (pairs
  with the `expo-sharing` dependency already present). Building a second PDF _parser_ to re-read our
  own PDF output would reintroduce the exact fragility Excel-as-source-of-truth was chosen to avoid,
  for no real benefit — so PDF re-import is explicitly out of scope, not just "not yet built."
- **Workbook contents** (mockup v4 §7): one file, `Penny_EPF_Statement.xlsx`, five sheets —
  `Summary` (corpus, per-employer totals, retirement projection, generated-on date), `Employers`
  (one row per employer — name, dates, basic salary, UAN/member ID if known), `Transactions` (every
  transaction across every employer combined, with a rate-used column on interest rows),
  `Interest History` (one row per FY — rate applied, employee/employer interest credited), and
  `Salary Hikes` (one row per hike event per employer).
- **Same entry point handles both directions and both formats.** The "Import" action from §10.1
  accepts either an EPFO PDF passbook or a previously-exported Penny `.xlsx` in the same file
  picker — format is auto-detected from the file content (not just the extension), routing to
  `epfPassbookParser.ts` or `epfExcelImport.ts` respectively, both feeding the same §10.2
  reconciliation review screen. A new "Export" action sits next to it on the card (mockup v4 §7).

## Documentation-discipline reminder

Once any part of this is actually implemented, per `CLAUDE.md`'s standing rule, update whichever
of these actually changed: `docs/features/portfolio/retirement.md` (currently states "no EPFO
passbook PDF import" as a limitation — this doc's implementation removes that limitation),
`docs/SCHEMA.md` (the §5 field additions), `docs/ARCHITECTURE.md` (new parser/calculator/
rate-fetch modules), `docs/EXTERNAL_APIS.md` (the new `/epf-rates` worker route), `docs/
ROADMAP.md` (this moves from "Phase 2 idea" to shipped/in-progress), and `workers/api-proxy`'s own
README if the worker's own docs list its routes.
