# EPF Passbook Import + Interest Calculator — Consolidated Requirements

Status (2026-08-11): **Shipped, `apps/mobile` only** (2026-08-08 base import feature). Core logic
(parser, interest calculator, rate table, reconciliation, Excel export/import) is built and tested
in `packages/core`; the full UI (§10/§11) is implemented in
`apps/mobile/src/features/portfolio/holdings/retirement/` — `EpfImportFlow.tsx`,
`EpfImportReviewSheet.tsx`, `epfImportLogic.ts`, `epfInterestOnDemand.ts`, `epfTxLabels.ts`, plus
the entry-point/nudge/assistant wiring in `RetirementCard.tsx`/`RetirementSheets.tsx`.
`apps/web-react` is frozen, so this has no web equivalent — a deliberate, permanent divergence (see
this doc's own mockup footer note), not a pending parity gap. **A further employer-switch-
correctness + per-employer-ledger round shipped 2026-08-11 (§10.9)**, immediately followed by **a
second same-day round of 8 more real bugs found testing §10.9 itself, plus a Gross/CTC display
change (§10.10)** — both implemented, with new `packages/core` unit tests for §10.9's pure
functions, but **not yet manually verified on a real device by the user**; treat as
implemented-but-unverified until confirmed. Remaining open items: PDF export (phase 2, deferred —
see §9/§11) and the still-unresolved questions in §9.
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

**Correction, 2026-08-30**: "confirmed working, text extracted successfully, on-device" below turned
out to be true only for the *small* sample PDF this spike happened to use — a real, larger passbook
PDF (with an embedded legacy Devanagari font) hung indefinitely on-device, a genuine Hermes/React
Native bug (`structuredClone`), not caught by this spike at the time. Now fixed — see
`docs/features/portfolio/retirement.md`'s "Real-device bug found and fixed" note and
`docs/ARCHITECTURE.md`'s matching decision-log entry for the full writeup. The rest of this section's
findings (library choice, Node-level verification) still stand.

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
- **Manual EPF entry has no employer link at all.** `EpfTransaction.employerId` is only ever set
  by the import flow — the manual "Add EPF transaction" form has no employer picker, so a
  manually-entered transaction can't be attributed to a specific employer the way an imported one
  can. Not yet scoped.

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

### 10.9 Employer-switch real bugs (2026-08-11): transaction bleed, runaway "current" projection, no join-date confirmation + per-employer ledger

Found via real-device testing in immediate follow-up to §10.8's ship. Two more genuine correctness
bugs in the same "mid-month employer switch" problem class, plus a design gap that was feeding
both, plus a UI/UX change that's the natural companion once employer-scoping is taken seriously
end to end. All `packages/core/src/core/portfolio/epfCalculations.ts` unless noted; UI lives in
`apps/mobile/src/features/portfolio/holdings/retirement/`.

- **Real-transaction bleed across a switch month, in a second consumer of the ledger (root cause
  1).** §10.8 fixed `reconcileEpfContributionRows`' wagesMonth-only matching, but
  `epfComputeAllMonths()` — the function that drives the card's stats and the transactions list —
  had its own, independent copy of the exact same mistake: its month-by-month "did a real
  transaction land in this wage month" lookup also matched by `wagesMonth` alone, so a genuine
  switch month (Company A's and Company B's own real August-2017 rows) could still bleed into each
  other's displayed month entry even after §10.8's reconciliation-time fix, since reconciliation and
  display are two separate code paths over the same data. Fixed with a new `epfResolveTxnEmployer()`,
  which `epfComputeAllMonths` now uses to scope real-transaction matching to the SAME employer being
  simulated for that month — reusing, not re-deriving, the `employerId`-first / date-range-fallback
  resolution §10.8 already established. **Order-independent**: whichever employer's unit gets
  imported first or last, each employer's own per-employer month loop only ever pulls in its own
  transactions, never the other's.
- **Runaway "current" projection independent of whether the nudge is ever answered (root cause
  2).** §10.6's "Are you still working at X?" prompt only fixes the runaway-estimate symptom once
  the user actually taps Yes/No on it — the entire window between "an import creates a new, still-
  unconfirmed current employer" and "the user notices and answers the card prompt" still saw
  `epfComputeAllMonths` fabricate estimated months all the way to today, unconditionally. Fixed by
  capping an unconfirmed "current" employer's projection at `epfLastRealEvidenceMs` — its OWN last
  real evidence timestamp — rather than the present moment, regardless of
  `currentEmploymentConfirmed`. This makes the fix effective the instant the import happens, not
  contingent on the reactive nudge ever being seen or answered.
- **No confirmation of a new employer's real join date at import time (root cause 3 — the design gap
  underlying both bugs above).** `createEmployerFromUnit` was inferring a brand-new employer's
  `fromDate` from the wage-month range of whatever contributions happened to land in the imported
  unit — silent inference, the exact pattern this doc's §5 already rejected for every other field
  ("do not infer or assume any field Penny doesn't currently capture — add the field and capture the
  real value"). Fixed with a new import-time step — `describeNewEmployerSetup`/
  `applyConfirmedJoinDate`/`applyConfirmedSwitch` (`epfImportLogic.ts`), surfaced via a new
  `EpfNewEmployerSetupSheet.tsx` wired into `EpfImportFlow.tsx` — that ALWAYS asks the user to
  confirm a new employer's real joining date before the record is created (never silently inferred
  from a contribution's deposit date), and additionally asks for the OLD employer's last working day
  whenever the new unit looks like a genuine mid-month switch (an existing "current" employer's own
  start date precedes the new unit's earliest wage month). Both suggested dates are pro-rata-aware —
  `estimateProRataEdgeDate()`/`checkProRataConsistency()` — when a partial first/last month's
  contribution amount implies a specific mid-month join/leave date, with a live consistency note
  shown either way (whether or not a partial month exists), so the user always sees why a date is
  being suggested rather than just a blank field. This closes the loophole feeding both bugs above
  at the source: an employer's `fromDate`/`toDate` window is now something the user confirmed at
  import time, not something Penny guessed from contribution timing.
- **`extendEmployerCoverage` could silently override an already-confirmed join date.** A later
  import revealing an even-earlier real contribution for an already-`joiningDateConfirmed: true`
  employer used to move `fromDate` backward automatically — silently overwriting a fact the user had
  explicitly confirmed, with nothing surfaced to say it changed. Now guarded: an already-confirmed
  employer's `fromDate` is never moved automatically; instead a new non-blocking review flag,
  `joiningDateContradiction` (`epfReviewFlags.ts`'s `checkJoiningDateContradiction`, wired into
  `findAllReviewFlags` alongside §10.6's two existing checks so it can never disagree with the
  row/card badge counts), surfaces the disagreement for the user to resolve explicitly instead of
  Penny picking a side for them.

**New data model fields** (all additive, no schema version bump — see `docs/SCHEMA.md`):
`EpfEmployer.joiningDateConfirmed?: boolean` (true once the user has confirmed a real join date
through the new setup sheet — distinct from §10.6's `currentEmploymentConfirmed`, which is about
still being employed now, not about when employment started), `EpfEmployer.basicToGrossPct?:
number` (feeds the Gross/CTC estimate below), `EpfMonthEntry.employerId: string` (which employer a
computed month entry belongs to, needed by the per-employer ledger below), and
`EpfTransaction.employerId` is now stamped on EVERY import-created transaction type — interest/
transfer_in/withdrawal/advance too, not just `contribution` (`buildImportedTxn` in
`epfImportLogic.ts`) — closing a gap where a non-contribution row from a switch-month import still
had no way to disambiguate which employer it belonged to.

**Per-employer ledger (2026-08-11) — the actual UI/UX change.** EPF transactions move from one
centralized cross-employer list to a per-employer view, mirroring EPFO's own portal and
INDmoney's "select Member ID → view that passbook" model — the natural companion to the
correctness fixes above, since the user dealing with an employer switch is exactly the user who
most needs to see one employer's ledger in isolation, not blended with another's.
`EpfAllTransactionsSheet` (`RetirementSheets.tsx`) gained an optional `employerFilter?: EpfEmployer`
prop, filtering both `epfComputeAllMonths` entries and non-contribution transactions to just that
employer via two new shared resolvers in a new file, `epfEmployerScoping.ts` (`employerForDate`,
`resolveAnyTxnOwner`) — `undefined` keeps the old all-employers view, which remains the direct path
for the common 0–1-employer holding (no picker step inserted where there's nothing to pick
between). Tapping an employer row on the EPF card (`RetirementCard.tsx`) now opens that employer's
own scoped ledger directly (new chevron affordance); "See all transactions" instead routes through
a new `EpfEmployerPickerSheet.tsx`, but only when 2+ employers exist.

New "Estimated Gross Salary / CTC" stat tiles appear only in a scoped (per-employer) ledger view —
`estimateGrossAndCtc()` (`epfCalculations.ts`), using an editable-per-employer Basic-to-Gross ratio
(`EpfEmployer.basicToGrossPct`, default `EPF_DEFAULT_BASIC_TO_GROSS_PCT = 50`) and the statutory
gratuity formula (Basic × 15/26 per year of service). Always shown as an explicit estimate with a
formula popup, never asserted as fact — the same "computed on behalf of the user, always
reviewable, never authoritative" convention this doc has used throughout (§6.3, §10.5).

Mockup: `docs/mockups/proposals/epf-employer-switch-v1.html` (approved).

**Status note: implemented, not yet manually verified.** The `packages/core` pure-function
additions (`epfResolveTxnEmployer`, `epfLastRealEvidenceMs`, `epfDaysInMonth`,
`estimateProRataEdgeDate`, `checkProRataConsistency`, `estimateGrossAndCtc`) have new unit tests
appended to `packages/core/tests/portfolio/epfCalculations.test.ts`. The `apps/mobile`-only logic
(`epfImportLogic.ts`'s new setup-step functions, `epfEmployerScoping.ts`, all new sheets) has none —
`apps/mobile` has no test runner configured anywhere in this repo (no jest/vitest config, no `test`
script), so this is consistent with every other function in `epfImportLogic.ts` today, not a new
gap introduced by this round. This whole round has not yet been exercised on a real device by the
user — implementation is done but unverified.

### 10.10 Second on-device round (2026-08-11): 8 more real bugs found testing §10.9 itself

Found via real-device testing performed directly against §10.9's own ship — a direct continuation
of the same "employer switch" problem class, not a new feature area. All `packages/core/src/core/
portfolio/epfCalculations.ts` unless noted; UI lives in `apps/mobile/src/features/portfolio/
holdings/retirement/`.

- **Interest silently overridden across a same-FY employer switch.** `reconcileEpfBalanceEvent`
  matches interest/`transfer_in`/withdrawal rows by `(type, financial year)` only, with no employer
  scoping at all — but a same-FY switch means BOTH employers can legitimately earn interest (or
  have a transfer) in the same FY, since the old employer's balance keeps earning interest until
  it's actually transferred out. Before this fix, importing Company B's FY interest saw Company A's
  already-logged FY interest as the "existing" value and silently overwrote it. Fixed in
  `epfImportLogic.ts`'s `reconcileUnit`: a new `employerScopedNonContribTxns` (mirroring the
  contribution-only `employerScopedTxns` §10.8 already had) is computed via the widened
  `epfResolveTxnEmployer` below and threaded into both the interest and transfer_in/withdrawal
  `reconcileEpfBalanceEvent` calls instead of the unscoped `existingTxns`.
- **`epfResolveTxnEmployer` widened to resolve ANY transaction type, not just contributions.** A
  new exported `epfEmployerForDate(employers, dateMs)` — raw-date containment, parallel to the
  existing wagesMonth-based `epfEmployerForWagesMonth` — lets `epfResolveTxnEmployer` fall back to
  date-based resolution for interest/transfer/withdrawal rows (it still prefers a stamped
  `employerId` first, then `epfEmployerForWagesMonth` for a contribution). This is what makes the
  bug above fixable, and separately fixed transfers/interest resolving incorrectly (or not at all)
  for legacy/no-`employerId` rows in the per-employer scoped ledger. `apps/mobile`'s own
  `epfEmployerScoping.ts` (`resolveAnyTxnOwner`/`employerForDate`) was simplified to just delegate
  to this now-widened core function, removing a duplicated mobile-side copy.
- **Missing `key` prop on the import-flow's review sheets caused stale/cross-contaminated state.**
  Neither `EpfImportReviewSheet` nor `EpfNewEmployerSetupSheet` had a `key` in `EpfImportFlow.tsx`,
  so React reused the same component instance across different import units rendered at the same
  JSX position. Harmless for contribution items (keyed by their own distinct `wagesMonth`), but
  `itemKey()` returns just the bare type string (`"interest"`/`"transfer_in"`) for non-wagesMonth
  items — so a conflict choice made for one FY's "interest" item could silently carry over when the
  next FY's own "interest" item rendered in the reused instance. It also meant
  `EpfNewEmployerSetupSheet`'s `useState` lazy initializers (which only run once per instance) could
  show a stale first-unit's dates for a later "new employer detected" unit in the same batch. Fixed
  with `key={currentUnit.key}` on both.
- **`checkJoiningDateContradiction` compared dates at the wrong granularity, producing a false
  positive on every employer's own joining month.** It compared a wage month's own 1st-of-month raw
  epoch ms directly against `employer.fromDate` (a specific day, since a pro-rata joining date is
  rarely the 1st) — so e.g. joining 15 May 2025 (`fromDate` mid-May) meant the joining month's own
  contribution (`wagesMonth: "2025-05"`) compared 1 May against 15 May and lost, even though it's
  the same month. This was almost certainly the dominant contributor to a reported "See all
  transactions shows 20 need review but nothing looks wrong" mismatch, since this flag only ever
  renders as a banner in that specific employer's own scoped ledger, not a row badge — it was
  quietly inflating the review count with false contradictions nobody could see. Fixed with a new
  exported `epfMonthKeyOf(ms)` ("YYYY-MM" from an epoch ms) — the comparison is now done at month
  granularity, not raw ms.
- **`checkWageDiscrepancy` now skips an employer's own joining/leaving month entirely**
  (`apps/mobile`'s `epfReviewFlags.ts`) — a pro-rata partial month is _expected_ there by
  construction (always "lower than a full month would predict"), so it was never a genuine
  discrepancy. Before this fix the joining/leaving month showed a permanent, never-resolvable
  "lower than predicted" warning with no way to actually confirm anything — this was the reported
  bug ("the starting month... shows the warning without a way to confirm Yes I joined... and same
  for the last month"), and is the reason the new confirm UI below needed to exist.
- **New join/leave-month confirm UI**, `EpfMonthEdgeConfirm` — a new local, non-exported component
  inside `RetirementSheets.tsx` (not a new file), reused by `EpfAllTransactionsSheet`'s existing
  `selectedMonth` popup. Reuses the same "date field + live pro-rata consistency note" pattern
  `EpfNewEmployerSetupSheet.tsx` already established for the import-time step (§10.9), just
  triggered from an existing transaction row instead of at import time. Shows a date picker
  (prefilled with the employer's current `fromDate`/`toDate`), a live `checkProRataConsistency`
  note, and a "Confirm — joined/left on this date" button that writes `fromDate` +
  `joiningDateConfirmed: true` (start edge) or `toDate` + `currentEmploymentConfirmed: false` (end
  edge) back onto the employer. The row itself now shows a neutral `ti-info-circle` badge for the
  joining/leaving month instead of the old warning triangle, via a new `isEmployerEdgeMonth` helper.
- **Three smaller latent bugs found while building the confirm UI above:** (a) the popup's
  `selectedMonthRealTxn` lookup only matched by `wagesMonth`, not employer — for a genuine
  mid-month switch where two employers share the same `wagesMonth`, it could silently show the
  wrong employer's transaction; now also matched against `resolveAnyTxnOwner(...)?.id ===
selectedMonth.employerId`. (b) the month-row list's React `key={entry.month}` collided for a
  shared switch month across two employers — a real duplicate-key bug — changed to
  `key={`${entry.employerId}-${entry.month}`}`. (c) `wageDiscrepancyMonths` (the row-badge `Set`)
  was keyed by bare `wagesMonth` string, so a discrepancy on ONE employer's shared-month row could
  wrongly badge the OTHER employer's same-month row too — now keyed by `${employerId}|
${wagesMonth}`.
- **New "pending transfer" banner.** `epfHasPendingTransfer(employer, employers, transactions)`
  (new, `apps/mobile`'s `epfEmployerScoping.ts`) is a heuristic check for a closed employer whose
  immediate successor (by `fromDate`) has no `transfer_in` transaction attributed to it yet — shown
  as an info banner in that employer's scoped ledger ("Your PF balance from X may not have been
  transferred to your next employer yet"). Explicitly documented in code as a heuristic, not a
  certainty — it can't distinguish "genuinely pending" from "transferred via a route Penny never
  saw" (e.g. claimed directly through the EPFO portal).

**Also this round — Estimated Gross/CTC display change (explicit follow-up ask, not a bug fix).**
`estimateGrossAndCtc`'s signature gained a new 2nd parameter, `monthlyEmployeeContribution` (now
`basicSalary, monthlyEmployeeContribution, monthlyEmployerEpf, monthlyEps, basicToGrossPct?`).
`EpfGrossCtcEstimate` gained `monthlyEmployeeContribution`, `netMonthly` (Gross minus the
employee's own EPF deduction, clamped to ≥0 — deliberately NOT also subtracting income tax, since
there's no payroll tax engine), and `annualGross`/`annualCtc` (× 12). The scoped ledger header in
`RetirementSheets.tsx` now shows three stat tiles in this order: **Est. CTC (annual)**, **Est.
Gross (annual)**, **Net Monthly** — CTC and Gross are quoted annually (the conventional way India
quotes both, e.g. "12 LPA"), Net Monthly stays monthly. The formula popup was extended to show both
the monthly breakdown and the annualized CTC/Gross/Net Monthly rows, each with its own formula.

**Framing note on two items from the original report.** "Hikes not presented for other companies"
and part of "transfers not shown" were diagnosed as likely downstream consequences of the
reconciliation-scoping, key-collision, and wrong-transaction-match bugs above, rather than separate
root causes — this is a reasonable diagnosis given the mechanism, but it has **not been
independently re-verified** now that the underlying scoping bugs are fixed, and should be treated
as "should re-check" rather than "confirmed fixed."

**No Dexie schema changes this round** — all eight bug fixes and the Gross/CTC display change are
logic/UI only, no new persisted fields.

**Status note: implemented, not yet manually verified.** Same caveat as §10.9 — this round has not
yet been exercised on a real device by the user; treat as implemented-but-unverified until
confirmed.

### 10.11 Third on-device round (2026-08-12): net-worth invisibility, interest cross-contamination, LWD-ask flow, edge-detection gap

Found via real-device testing performed directly against §10.10's own ship — same continuation of
the employer-switch problem class, plus one long-standing bug (item 1) that this round's testing
happened to surface for the first time. All `packages/core/src/core/portfolio/` (and
`packages/core/src/core/calculators/`, `packages/core/src/core/portfolio/usePortfolioHoldings.ts`)
unless noted; UI lives in `apps/mobile/src/features/portfolio/holdings/retirement/`.

- **EPF corpus was never flowing into net worth or its breakdown.** Every net-worth aggregator in
  the app — `apps/mobile/src/features/home/useHome.ts`'s `loadSummary()`,
  `packages/core/src/core/calculators/retirementProjection.ts`'s `calcInvestableCorpus()`,
  `usePortfolioHoldings.ts`'s `effectiveValue()` — reads `holding.currentValue ?? holding
.investedAmount`, a deliberately asset-class-agnostic convention used everywhere. PPF/NPS work
  correctly because their own modals collect a manually-typed "Current corpus/balance" figure that
  gets saved straight onto `investedAmount` (`PpfModal.tsx`, `NpsModal.tsx`). EPF has no such field
  — by its own code comment, "Corpus is derived from transaction history... no manual amount is
  taken" — so its real value only ever existed as `epfBuildCardData(holding.assetMeta).corpus`,
  computed on demand purely for the card's own display, and was never persisted onto the `Holding`
  record at all. `currentValue ?? investedAmount` therefore silently evaluated to `0` for every EPF
  holding — dropped from the net-worth total AND invisible in the breakdown view (its `> 0` filter
  excluded it entirely; it wasn't shown as ₹0, it simply never appeared). Fixed at a single choke
  point rather than teaching every aggregator to special-case EPF: a new `saveHolding()` wrapper in
  `RetirementSection.tsx` (used everywhere `RetirementCard`/`RetirementUntrackedCard`/`EpfModal`
  call their `onSave` prop) stamps `currentValue: epfBuildCardData(h.assetMeta ?? {}).corpus` onto
  an `epf` holding before delegating to the real save — the same "write the derived value back on
  save" pattern `usePortfolioHoldings.ts`'s own `refreshPrices()` already uses for a live-priced
  MF/stock holding's `currentValue`. An existing EPF holding created before this fix self-corrects
  the next time ANY save happens on it (a transaction edit, employer confirm, import, etc.) — there
  is no separate one-time backfill/migration step.
- **Interest cross-contamination across a same-FY employer switch — a separate bug from §10.10's
  item 1.** §10.10 fixed `reconcileEpfBalanceEvent`'s import-time RECONCILIATION scoping. This round
  found the CALCULATION engine itself was also unscoped: `buildEpfInterestInput()`
  (`epfInterestCalculator.ts`) collected `realDeposits` by filtering the whole holding's
  transactions by `type === 'contribution' && wagesMonth` and matching financial year, with no
  employer check at all — so computing Company A's FY interest breakdown silently picked up Company
  B's real deposits too whenever they fell in the same financial year (keyed by deposit month).
  Visibly, the interest breakdown popup's month-by-month "opening balance" kept growing every month
  all the way to FY-end even though Company A's own real contributions had actually stopped months
  earlier at their leaving date — producing a real recorded-vs-recalculated mismatch where Penny's
  recalculation came out too high. The recorded figure (straight from the real passbook) was correct
  the whole time; Penny's own math was wrong, not the source data. Fixed by adding a required
  `employers: EpfEmployer[]` parameter to `buildEpfInterestInput()` and scoping `realDeposits` via
  the (already-widened, per §10.10) `epfResolveTxnEmployer`. The same class of bug was also fixed in
  `sumEpfBalanceBeforeFy()` (`apps/mobile`'s `epfInterestOnDemand.ts`) — the FY's opening-balance
  seed was likewise being summed across every employer's transactions ever logged, not just the
  target employer's own; it now takes `employer`/`employers` params and scopes the same way.
  `computeEpfInterestOnDemand()` was updated to pass the full employer list through to both.
- **"Are you still working at X?" → "No" never asked for the real last working day.** Before this
  fix, tapping "No" silently set `toDate` to a guessed date (the last-evidence financial year's own
  31 March) with no way to correct it. `RetirementCard.tsx` now opens a modal asking for the real
  last working day instead, reusing §10.10's exact same row-level edge-confirm form component,
  `EpfMonthEdgeConfirm` — now exported from `RetirementSheets.tsx` instead of being a private local
  component — prefilled via the same pro-rata-inversion suggestion, with the same live consistency
  check.
- **The row-level wage-discrepancy warning for a still-open (unconfirmed) employer's actual final
  month never offered a path to resolve it — a real, previously-unhandled gap in §10.10's own
  edge-detection logic.** §10.10's `selectedMonthEdge` only recognized an edge month when
  `employer.toDate` was ALREADY set matching that month — but for an employer never confirmed as
  having left at all (`toDate` still unset), there was no `toDate` to compare against, so their
  actual last real contribution month fell through to the generic wage-discrepancy banner with no
  resolution path, exactly the reported bug ("the banner detects the user might have left the
  company and still does not ask the LWD"). Fixed by widening `selectedMonthEdge`'s detection
  (`RetirementSheets.tsx`): for a still-open employer, if the tapped month is BOTH (a) the last real
  evidence available (`epfLastRealEvidenceMs`) and (b) pro-rata-low vs. the salary model
  (`epfCheckWageDiscrepancy`'s own 'lower' signal — the same signal the generic banner already used),
  it's now treated as a likely (unconfirmed) departure month and routed to the same
  `EpfMonthEdgeConfirm` flow as an already-known edge. `EpfMonthEdgeConfirm`'s own date-suggestion
  logic was also generalized: when there's no existing same-month confirmed edge date to prefill
  from, it now suggests a day via the same pro-rata inversion `EpfNewEmployerSetupSheet.tsx`'s
  import-time step already uses, instead of defaulting to a bare "1st of the month."

  Once a leaving date IS confirmed through this flow, the previously-reported "post that month,
  contributions still show ₹0 for every subsequent month" complaint resolves automatically as a side
  effect — no separate fix was needed for that part, since `epfComputeAllMonths`'s existing
  per-employer iteration already stops exactly at `employer.toDate` once it's actually set (true
  since §10.9); the underlying issue was purely that `toDate` was never getting set in the first
  place for this specific unconfirmed-departure scenario.

- **User-reported concern about "TRANSFER IN - INTEREST AMOUNT ONLY (Old Member Id-:...)" and
  "TRANSFER IN - SAME OFFICE (Old Member Id-:...)" passbook particulars variants — investigated,
  found to already work correctly, not a bug.** Traced `classifyRow()`'s existing regex
  (`epfPassbookParser.ts`, `/transfer.{0,3}in/i`) against both exact real-world strings and confirmed
  both already classify correctly as `transfer_in`. No code change was needed. Added explicit
  regression test coverage for these two exact variants
  (`packages/core/tests/portfolio/epfPassbookParser.test.ts`) to lock this in against future
  regression, since it was raised as a live concern.

**Also this round — "hike journey" mockup, approved and now implemented.** User asked to
visualize the "hike journey" per employer — CTC/Gross/Net-monthly at each salary point, not just
Basic (today's hike list only shows date + Basic per raise). Mockup built and approved:
`docs/mockups/proposals/epf-hike-journey-v1.html` — turning each entry in the existing expandable
per-employer hike list into a small card showing Basic (as today) plus the same Gross/
Net-monthly/CTC breakdown already shown at the ledger header (§10.10), a growth-% pill vs. the
previous point, and a synthetic "Joined" starting point using the employer's own
`fromDate`/`basicSalary` (not currently a real `EpfSalaryHike` entry). Now built to match the
mockup closely:

- A new pure function `buildEpfHikeJourney(employer: EpfEmployer): EpfHikeJourneyPoint[]`
  (`packages/core/src/core/portfolio/epfCalculations.ts`) synthesizes the "Joined" starting point
  from the employer's own `fromDate`/`basicSalary`, merges in every real `hikeTimeline` entry
  (sorted ascending internally regardless of input order), and returns the combined list
  newest-first, each point carrying a `growthPct` (`null` for the joining point) computed against
  the point immediately before it chronologically. New exported type
  `EpfHikeJourneyPoint { date, basicSalary, isJoined, growthPct }`.
- `RetirementCard.tsx`'s existing expandable per-employer hike list (previously a flat "date →
  Basic salary" row) now renders each point from `buildEpfHikeJourney()` as a small card: a top
  row with the date (or "Joined · <date>" for the first point) plus a growth-% pill (hidden while
  privacy-masked) on the left and Basic salary on the right, then — below a dashed divider —
  three columns for Gross/mo, CTC/yr, and Net/mo, computed per-point via the existing
  `estimateGrossAndCtc()` (using that point's own `basicSalary`, not just the employer's latest)
  and displayed with `formatCompact()`, the same compact ₹-lakh/crore formatting already used
  elsewhere in the app. Respects the existing privacy-mask convention (`••••` when masked).
- Unit tests added (`packages/core/tests/portfolio/epfCalculations.test.ts`,
  `describe('buildEpfHikeJourney', ...)`) covering the no-hikes case (just the joining point),
  newest-first ordering with correct growth-% math, and that an out-of-order `hikeTimeline` input
  is still sorted correctly before computing growth.

**No Dexie schema changes this round** — all five bug fixes are logic/UI only (item 1's
`currentValue` stamp uses a pre-existing generic `Holding` field, not a new one), and
`EpfHikeJourneyPoint` is a derived/computed shape, not a persisted one.

**Status note: implemented, not yet manually verified.** Same caveat as §10.9/§10.10 — `tsc`
(both `packages/core` and `apps/mobile`), `eslint`, `prettier`, and the full `packages/core`
vitest suite (941 tests, 3 new from the hike-journey addition) all pass, and the PII gate is
clean, but this round — including the hike-journey feature — has not yet been exercised
end-to-end on a real device by the user; treat as implemented-but-unverified until confirmed.

### 10.12 Fourth on-device round (2026-08-12): mid-year withdrawal invisible to interest calc, employer-side withdrawal amount silently dropped, reconciliation blind to the fix

Found via a direct real-passbook comparison, not a generic on-device click-through like §10.9-
§10.11: user checked FY2019-20's Penny-recalculated interest against the actual passbook figures
(₹2,350 employee / ₹719 employer recorded) and the two disagreed. Three compounding bugs, found in
sequence as each was investigated — fixing #1 alone wasn't enough, because #1 immediately exposed
#2, which in turn needed #3 before a re-import could actually pick it up. `packages/core/src/core/
portfolio/epfInterestCalculator.ts` and `epfReconciliation.ts`; UI-layer storage bug in
`apps/mobile/src/features/portfolio/holdings/retirement/epfImportLogic.ts`.

- **Bug 1 — the interest engine had no concept of a mid-year withdrawal at all.**
  `calculateEpfInterestForYear`/`buildEpfInterestInput` only ever knew about DEPOSITS
  (`monthlyContributions`); a real withdrawal transaction during the FY was completely invisible to
  the simulation, so the balance kept compounding every remaining month as if the withdrawal never
  happened. Fixed: `EpfInterestCalculationInput` gained an optional `monthlyWithdrawals?: { month:
string; employeeAmount: number; employerAmount: number }[]`. `calculateEpfInterestForYear` now
  merges deposits and withdrawals into one NET monthly flow per stream (employee/employer) before
  simulating, applying a withdrawal at the exact same point in the month-by-month loop (month-END,
  after that month's own interest is already computed) that a deposit is applied — so a mid-month
  withdrawal still earns THAT month's own interest on the pre-withdrawal balance, and only the
  FOLLOWING month's opening balance reflects the reduction, mirroring the existing "a deposit
  doesn't count until the month after" accrual-timing rule from §6.1, just for the withdrawal side.
  `simulateOneStream`'s balance update is also now clamped at `Math.max(0, ...)` so a withdrawal
  larger than the tracked balance can't produce a negative-balance/negative-interest state in a
  later month. `buildEpfInterestInput` now collects real `withdrawal`/`advance` transactions during
  the requested FY (scoped to the correct employer via the existing `epfResolveTxnEmployer`) into
  `monthlyWithdrawals` — a withdrawal predating the FY doesn't need to be listed here, since it's
  already reflected in the FY's own opening balance via the existing `sumEpfBalanceBeforeFy`.
- **Bug 2 — found only after fixing bug 1 still didn't match: the real root cause. A genuine
  data-loss bug in transaction storage, not the interest engine at all.**
  `buildImportedTxn`/`mergeImportedIntoExisting` (`epfImportLogic.ts`) had a dedicated branch for
  `withdrawal`/`advance` transactions that discarded the passbook's real EMPLOYER-side withdrawal
  amount entirely — it stored only `amount = imported.employeeAmount`, never setting
  `employeeAmount`/`employerAmount` on the stored transaction at all. This is exactly why the
  on-device symptom matched: "withdrawal only shows Employee and not employer, while both were
  transferred as per passbook." The sibling `interest`/`transfer_in` branch had always correctly
  preserved both sides — withdrawal/advance were simply never brought in line with that
  already-correct pattern. Fixed by merging withdrawal/advance into that same branch: they now
  store the real `employeeAmount`/`employerAmount` split (already parsed correctly from the
  passbook's own columns — only the storage step was dropping it) plus `amount` as their sum,
  identical treatment to interest/transfer_in. **This fix only applies to a FUTURE import** — it
  does not retroactively repair a withdrawal transaction already sitting in a holding from a prior
  import (no migration/backfill step exists); the same statement/PDF needs to be re-imported to
  pick up the corrected split, which is what bug 3 below actually makes possible.
- **Bug 3 — reconciliation was blind to bug 2's fix, so a re-import would have silently done
  nothing.** `existingAmounts()` (`epfReconciliation.ts`), used by the import reconciliation's
  `amountsAgree` conflict-detection, compared every non-contribution transaction (interest/
  transfer_in/withdrawal/advance) as if it only ever had a single employee-side amount — even once
  bug 2's fix made a real employee/employer split available. Re-importing a statement to pick up
  the corrected employer amount would therefore have silently agreed with the old, wrong value
  instead of flagging a conflict. Fixed: `existingAmounts()` now prefers the transaction's real
  `employeeAmount`/`employerAmount` fields when either is actually set (true for every
  import-created transaction of these types going forward, and for any already-fixed one), falling
  back to the old employee-only-from-`amount` behavior only for a genuinely legacy, manually-typed
  entry that never had a split at all — mirroring `recordedInterestTotal()`'s own identical
  fallback convention in `epfInterestOnDemand.ts`. This is what makes bug 2's fix actually reach
  already-imported data: re-importing the same statement now correctly surfaces the corrected
  employer amount as a resolvable conflict (imported pre-selected as the default, per this
  feature's existing conflict-resolution convention) instead of a silent no-op.

**Net effect for the reported case:** the timing fix (bug 1) alone wasn't sufficient because the
withdrawal transaction's employer-side amount was itself zero/missing due to bug 2 — the interest
simulation had nothing real to subtract from the employer balance stream even once it started
listening for withdrawals at all. All three fixes are needed together to reach the passbook's
₹2,350 (employee) / ₹719 (employer) split. **The user has not yet confirmed the corrected numbers
match** — this needs on-device re-verification: re-import the FY2019-20 statement, then check the
interest breakdown popup again.

**Tests added:** `packages/core/tests/portfolio/epfInterestCalculator.test.ts` — a new `describe
('mid-year withdrawal', ...)` block (balance reduction takes effect the month after the withdrawal,
not during it; only the specified stream(s) get reduced; clamps at zero rather than going
negative) plus two tests on `buildEpfInterestInput` (collects a real withdrawal into
`monthlyWithdrawals`, scoped to the correct employer; excludes a withdrawal outside the requested
FY). `packages/core/tests/portfolio/epfReconciliation.test.ts` — two new tests on
`existingAmounts()`'s fixed behavior via `reconcileEpfBalanceEvent` (a real split that disagrees is
now correctly flagged as `conflict`, not silently "matches"; a real split that agrees is still
correctly `matches`).

**No Dexie schema changes this round** — `monthlyWithdrawals` is a field on the derived/computed
`EpfInterestCalculationInput` calculation-input shape, not a persisted one.

**Status note: implemented, not yet manually verified.** Same caveat as §10.9-§10.11 — `tsc`,
`eslint`, `prettier`, and the full `packages/core` vitest suite (948 tests, 7 new from this round)
all pass, and the PII gate is clean, but the corrected numbers have not yet been re-verified
on-device against the real passbook; treat as implemented-but-unverified until confirmed.

### 10.13 Fifth on-device round (2026-08-12): non-interest rows not tappable, no "keep recorded" option on an interest mismatch, hike journey redesigned card→table

Found via direct on-device feedback on §10.9-§10.12's own ship — two real reported gaps plus one
direct revision of the hike-journey display shipped in §10.11/§10.12. All `apps/mobile/src/
features/portfolio/holdings/retirement/` unless noted.

- **`transfer_in`/`withdrawal`/`advance` rows were not tappable — a real reported gap ("withdrawal
  entry does not open the details like other transactions").** In `EpfAllTransactionsSheet`'s
  non-contribution list, only `interest` rows had an `onPress` (opening the richer rate/
  month-by-month breakdown popup) or a chevron at all; transfer_in/withdrawal/advance rows were
  dead taps. Fixed: every non-contribution row is now tappable. A new, simpler popup
  (`RetirementSheets.tsx`) shows date + `sourceParticulars` (if present), Employee share, Employer
  share, and Total, using the same `DetailRow` list style as the existing contribution breakdown
  popup. Handles a legacy transaction gracefully (one imported before §10.12's employee/employer-
  split fix, or a manually-typed entry with no split at all): falls back to showing the whole amount
  as the employee share — matching `existingAmounts()`'s own established fallback convention
  (§10.12) — with an inline note that the employer share may be understated and re-importing the
  source statement would pick up the real split.
- **No way to tell Penny the recorded (passbook) interest figure is the one to trust — a real
  reported gap ("only Update button comes. No option to keep the recorded").** Previously the
  interest breakdown popup's mismatch banner offered only "Update to ₹X" (overwrite with Penny's
  recalculation). New field `EpfTransaction.interestMismatchAcknowledged?: boolean`
  (`packages/core/src/core/db/types/index.ts`), set when the user explicitly picks "Keep recorded."
  `checkInterestMismatch` itself is UNCHANGED — it still always reports the raw disagreement
  (`recorded`/`recomputed`/`mismatched`), never hiding the truth even once acknowledged (the popup
  still shows both figures on next open). What changed: `findAllReviewFlags` (`epfReviewFlags.ts`)
  now skips creating the `interestMismatch` flag when `t.interestMismatchAcknowledged` is true —
  this is what actually stops it counting toward the card-level "N need review" total and the row's
  warning badge, following this app's existing "computed on demand, dismissal tracked separately"
  pattern (same shape as `Account.dismissedVerificationFindings` elsewhere in the app). In the
  popup: a genuine (unacknowledged) mismatch now shows BOTH "Keep recorded" (secondary button,
  writes `interestMismatchAcknowledged: true`, changes nothing else) and "Update to ₹Y" (existing,
  overwrites the transaction's amounts with Penny's recalculation) side by side. Once acknowledged,
  the banner switches to an info tone confirming the recorded figure is correct, and only
  "Update to ₹Y" remains — still available in case the user changes their mind later (e.g.
  contributions get edited afterward and the recalculation changes).
- **Hike-journey display redesigned from cards to a single table — a direct revision of the
  §10.11/§10.12 card layout, per further on-device feedback.** The card layout (Basic + a 3-cell
  Gross/mo·CTC/yr·Net/mo breakdown per hike) was hard to scan, and Gross was being shown monthly
  inconsistently with the ledger header's own annual convention for CTC/Gross (§10.10). Same
  underlying `buildEpfHikeJourney()` pure function (`packages/core`, unchanged) — only
  `RetirementCard.tsx`'s rendering changed: one table instead of stacked cards, a header row (Month |
  Est CTC | Est Gross | Net Monthly, in that order) followed by one row per salary point — the date
  (with "Joined" or a growth-% pill underneath, muted), then Est CTC and Est Gross both shown ANNUAL
  (`gc.annualCtc`/`gc.annualGross`, matching the ledger header's own convention), then Net Monthly.
  No new mockup round for this — treated as a direct revision of an already-built feature based on
  the user's own precise, unambiguous spec (exact column order and units), the same way earlier
  direct corrections in this feature (e.g. the ledger header's own CTC/Gross/Net-monthly ordering,
  §10.10) were applied without a new mockup cycle.

**New data model field** (additive, no schema version bump — see `docs/SCHEMA.md`):
`EpfTransaction.interestMismatchAcknowledged?: boolean` — a passthrough dismissal flag with no new
calculation logic, so it has no dedicated new test.

**Status note: implemented, not yet manually verified.** Same caveat as §10.9-§10.12 — `tsc`
(both `packages/core` and `apps/mobile`), `eslint`, `prettier`, and the full `packages/core` vitest
suite (948 tests, unchanged count — none of this round's changes were in `packages/core` except the
new passthrough field above) all pass, and the PII gate is clean, but none of this round has been
manually verified on-device by the user yet; treat as implemented-but-unverified until confirmed.

### 10.14 Sixth on-device round (2026-08-30): line-wrap parsing gap, multi-event-per-FY reconciliation collapse, mid-year transfer-in interest gap, checkpoint-drift compounding, stale-snapshot modal bug, pending-transfer resolution overhaul, hike detection, two new rate tables

Found chasing one real multi-employer EPF transfer report end to end — fixing one layer kept
surfacing the next: a parsing gap hid real rows, fixing that exposed a reconciliation gap that
mis-dated them, fixing that exposed an interest-calculation gap for the year they landed in. Two more
independent gaps (a modal snapshot-staleness bug, a chronologically-naive transfer-successor guess)
were found investigating the same report, and two new capabilities (hike detection, two new
Cloudflare-backed rate tables) were added in the same pass. `packages/core/src/core/portfolio/`
unless noted; UI lives in `apps/mobile/src/features/portfolio/holdings/retirement/`.

- **Parsing gap — pdf.js can split ONE transaction row across several physical text lines.**
  `epfPassbookParser.ts`'s `ROW_PATTERN` only ever matched a row complete on one line. A row with
  long particulars text — routinely true for a real "TRANSFER IN - Old Member Id ..." row, far
  longer than a plain "Cont. for Due-Month ..." row — can have its date+CR/DR prefix land on its own
  line with nothing else after it, its particulars text (sometimes an old member ID broken across
  more than one line) wrap across further lines, and its 5 trailing numeric columns end up on a line
  of their own entirely. Such a row was previously invisible to the parser — never even reaching
  `classifyRow` — which is exactly how a real transfer-in credit could be completely absent from
  Penny despite genuinely being present in the passbook's own text. Fixed with a new
  `reflowWrappedRows()`, run on the extracted text before `parseRows`: whenever a line matches ONLY a
  row's own date+CR/DR prefix, it greedily absorbs the following lines onto the same line until the
  merged result is a complete, matchable row — stopping at a blank line, the start of a genuinely new
  row, or a defensive hard cap (`MAX_WRAPPED_CONTINUATION_LINES`), rather than guessing how many
  lines to absorb. A row already complete on one line is untouched (its own line never matches the
  "prefix only" trigger). Confirmed against a real sample: 4 genuine `transfer_in` rows recovered,
  all previously silently dropped, zero false merges against every other already-correctly-parsing
  sample checked.
- **Reconciliation collapse — a single FY can contain SEVERAL distinct transfer_in/withdrawal
  events, not just one.** Once the parsing gap above stopped hiding wrapped rows, a second bug
  surfaced: `reconcileUnit`'s aggregate-by-type-per-FY model (§10.7) grouped every non-contribution
  row in a unit by type and summed them into ONE combined item dated to the LATEST row — correct only
  if at most one such event happens per FY per type. A real passbook proved that false: the actual
  principal transfer posting on one date, followed months later by a separate "TRANSFER IN - INTEREST
  AMOUNT ONLY" catch-up credit, both genuinely real and both belonging in the ledger as their own
  entries. The old aggregation silently discarded the real, earlier date the principal actually moved
  on. Fixed with a new `reconcileEpfBalanceEventAtDate()` (`epfReconciliation.ts`), matching each row
  at its own exact real date (day precision, straight from the passbook) instead of `(type, FY)` — the
  one case this can't distinguish is two genuinely distinct events landing on the exact same calendar
  day, an acceptable, very rare edge case for real passbook data. `reconcileUnit`
  (`epfImportLogic.ts`) now reconciles every non-contribution row individually instead of
  grouping/summing first. `itemKey()` was also fixed in the same pass: it used to be
  `item.wagesMonth ?? item.type` alone, which collapsed two distinct non-contribution items of the
  SAME type in one unit onto an identical review-screen key — one checkbox toggle silently affecting
  both — now `` `${item.type}-${item.date}` ``, unique in practice.
- **Interest gap — a mid-year transfer-in earned zero interest for the year it actually landed
  in.** `sumEpfBalanceBeforeFy` already correctly folded a transfer-in into every LATER year's opening
  balance, but `calculateEpfInterestForYear`/`buildEpfInterestInput` (`epfInterestCalculator.ts`) had
  no concept of an in-year transfer at all — the year the credit actually arrived silently computed
  interest as if the transferred balance had earned nothing for the months after it landed, disagreeing
  with the real passbook's own (correct) recorded interest for that year. Fixed by adding a new
  `monthlyTransfersIn` field to `EpfInterestCalculationInput`, applied the same way an existing
  withdrawal already is: added to the balance at month-end, after that month's own interest is already
  computed — so it starts earning interest from the FOLLOWING month. A transfer's own real posted date
  is used directly with no deposit-month offset, since that lag is specific to a contribution's
  employer-deposits-it-later timing, not a transfer; a transfer predating the FY is already correctly
  reflected via `sumEpfBalanceBeforeFy`, so only a same-FY transfer needs to be simulated here.
- **Checkpoint-drift compounding — an interest recalculation kept disagreeing more with each
  later year, for an employer with an unreconstructable same-FY switch settlement.** Found via the
  same investigation: `sumEpfBalanceBeforeFy` (`apps/mobile`'s `epfInterestOnDemand.ts`) always
  re-derived an FY's opening balance by re-summing every earlier transaction from scratch — any small
  drift between that derived sum and the real passbook figure (e.g. a same-FY employer-switch
  settlement with no corresponding transfer-in row to reconstruct it from) compounded forward through
  every subsequent year's own calculation, since each year built its opening balance from the previous
  year's already-drifted total rather than ever re-anchoring to a real, stated value. Fixed to prefer a
  real passbook-stated `EpfBalanceCheckpoint` (new `latestCheckpointBeforeFy()`) whenever one exists
  for the employer — a value already captured at import time (§5's `balanceCheckpoints`, merged via
  `epfImportLogic.ts`'s `mergeCheckpoints`) but never actually read anywhere until now — falling back
  to the historical transaction sum only when no checkpoint was ever imported for this employer. Any
  gap between Penny's derived total and EPFO's own stated balance now shows up as a one-time
  reconciliation difference against real data, not a silently-compounding one.
- **"Save ratio doesn't work" — a real reported bug traced to a stale snapshot, not a save-logic
  bug at all.** The new `EpfEmployerDetailModal.tsx` (below) originally took an `EpfEmployer` object
  captured at tap time as a prop. A save made from one of ITS OWN stacked child popups (e.g. the new
  pending-transfer confirm sheet) correctly updated the parent `holding`, but the modal kept rendering
  the STALE snapshot object it was opened with — so a value the user had just saved from a child popup
  appeared to silently not have taken effect when viewed back in this modal. Fixed by taking
  `employerId` instead of an `EpfEmployer` object, and re-resolving the live employer fresh from
  `holding` by id on every render; renders nothing if the employer no longer exists (deleted from
  under it) rather than crashing. **General pattern, now also codified in `CLAUDE.md`'s Non-negotiable
  rules**: any modal/popup that can itself open a further stacked child action capable of mutating the
  same parent data it displays must re-derive its own subject from the parent's live data by id on
  every render, never hold onto the object reference it was constructed with.
- **Pending-transfer suggestion assumed the wrong destination.** `epfHasPendingTransfer` (§10.10)
  always suggested the chronologically-next employer by `fromDate`, and considered a gap "resolved"
  only once THAT specific employer had any `transfer_in` at all. A real career broke this assumption:
  per EPFO's own transfer rules, a transfer always targets whichever Member ID is CURRENTLY ACTIVE at
  the time the transfer is actually filed, not necessarily "whichever job came next" — so two
  different old, closed employers (e.g. two jobs held years apart) can both correctly transfer into
  the SAME later, still-current employer, filed together, skipping right over an employer that
  happened to sit chronologically in between; the old logic never recognized the skipped employer's
  gap as resolved. Rebuilt as `epfPendingTransferSuccessor()` (`epfEmployerScoping.ts`, replacing
  `epfHasPendingTransfer` as the real implementation — `epfHasPendingTransfer` now just wraps it as a
  boolean convenience for callers that don't need to know which employer was suggested): defaults the
  suggestion to the CURRENTLY ACTIVE employer (no `toDate`) when one exists, falling back to the
  chronologically-next employer only when nothing is currently active — always just a DEFAULT, never
  enforced; the confirm flow lets the user pick any other employer instead. "Already resolved" is now
  tracked via a new `EpfTransaction.transferredFromEmployerId?: string` (see `docs/SCHEMA.md`) — an
  exact link back to the specific old employer, checked across every employer in the holding, not just
  whichever one happens to be suggested this time — set either by the manual "It was transferred"
  confirm step or auto-attributed at import time. A companion `epfResolvedTransfer()` returns the
  already-confirmed transfer + its destination, powering a small persistent confirmation once resolved
  so the answer doesn't just silently disappear with no trace.
- **New shared hook + confirm modal for the pending-transfer flow.** `useEpfPendingTransfer.ts` (new)
  extracts the state/handlers previously living only in `EpfAllTransactionsSheet` so the SAME logic can
  also back the new Employer Detail popup's own pending-transfer section without duplicating this
  fairly involved mutation logic in two places. Exposes: the suggested successor and any already-
  resolved transfer, a session-only "not sure yet" hide (deliberately not persisted — distinct from the
  real "it was withdrawn" answer, which IS persisted via `pendingTransferDismissed`), a
  destination-picker (defaults to the suggested employer, any other employer selectable), an
  amount draft prefilled from the old employer's own most recent real `withdrawal` (the closing
  settlement amount is, in every real case found so far, the amount that actually moved), and the two
  terminal actions: **"It was transferred"** (`confirmTransfer`) records a real `transfer_in` on the
  chosen destination dated to its own `fromDate`, stamping `transferredFromEmployerId`; **"It was
  withdrawn"** (`dismissAsWithdrawn`) sets the new `EpfEmployer.pendingTransferDismissed?: boolean` (see
  `docs/SCHEMA.md`) so the banner stops asking. New `EpfPendingTransferModal.tsx` is the confirm-step UI
  built on this hook; new `EpfWhyTransferInfo.tsx` is a static "why transfer, not withdraw?" +
  how-to-transfer educational panel (content sourced from EPFO's own published transfer rules),
  reusing the same tappable-info-icon → small centered-modal pattern PPF's info modals already
  established (§"PPF — withdrawal tile, info icons..." above) — shown inside the pending-transfer
  section of the Employer Detail popup.
- **New Employer Detail popup (`EpfEmployerDetailModal.tsx`) — replaces tapping an employer row
  going straight into its transaction ledger.** Real reported gap: "clicking on the tile opens all
  transactions popup... I think we should slightly change this and have a See All button. Clicking on
  the tile should open the company work details." Tapping an employer row now opens: company identity
  (Establishment ID, Member ID), editable exact start/end dates via `DateInput` (writes straight back
  onto the employer, same choke-point save pattern as everywhere else), Experience — a new
  `epfExperienceLabel()` (`epfCalculations.ts`) real calendar-aware "N years, M months, D days"
  formatter, distinct from the existing rounded-month `epfMonthsBetween()` which stays as-is for its
  own callers — per-employer stat totals via a new `epfEmployerTotals()` (employee/employer/pension
  contribution totals + interest earned, reusing `epfComputeAllMonths()` so it can never disagree with
  the card's own holding-wide sum), the full salary-hike table (moved out of the card's own inline
  expand), the pending-transfer section (above), and a "See all transactions" button one tap away —
  instead of the row jumping straight to the ledger. The hike table's per-point Basic-to-Gross ratio
  now looks up the FY-appropriate convention for that point's own date (via the new rate table below)
  rather than one flat default applied to every point regardless of era, unless the employer has an
  explicit override (`basicToGrossPct`) set, which always wins. Also shows a new "In Hand Monthly"
  (post-tax) figure alongside the existing pre-tax "Net Monthly," powered by the new income-tax rate
  table below, for both regimes side by side wherever the New Regime existed yet for that point in
  time.
- **New hike detection (`findUnrecordedEpfHikes`, `epfCalculations.ts`).** Real reported gap: "CTC/
  Gross/Net wrong for every employer except the most recent one." `EpfEmployer.basicSalary` is set
  exactly ONCE, from whichever unit is the FIRST ever imported for that employer
  (`createEmployerFromUnit`) — every LATER re-import of that same employer (`extendEmployerCoverage`)
  extends its date coverage but never re-examines wage data for a change, and `hikeTimeline` is
  otherwise only populated by the separate, fully manual "+ Hike" action. A multi-year employer built
  from several yearly passbooks — the normal way this feature is used — ends up with its entire CTC/
  Gross/Net Monthly display frozen at whatever wage the very first imported year happened to show,
  silently ignoring every real raise later years' own passbooks already prove happened; a current
  employer's own figures can look fine purely by coincidence (few years imported so far), not because
  anything about it is more correct. Scans an employer's real `EpfTransaction.epfWages` for a genuine,
  sustained increase over what `epfGetSalaryForMonth` currently predicts that isn't yet in
  `hikeTimeline`, requiring the row immediately after a candidate to still be at/above the new level
  (so one anomalous or mis-scanned row can't be mistaken for a real, sustained raise) and skipping the
  employer's own joining/leaving wage month (a pro-rata partial there is expected to be lower, never a
  hike — same exclusion `checkWageDiscrepancy` already applies). Evaluates against a "virtual" timeline
  that already includes every hike found earlier in the same scan, so two real raises in one employer's
  history are both detected. Deliberately DETECTION ONLY — never silently writes to `hikeTimeline`; the
  card's new "hike detected" nudge banner always asks the user to confirm/adjust before adding, or
  dismiss via the new `EpfEmployer.dismissedHikeMonths?: string[]` (see `docs/SCHEMA.md`) — adding the
  hike for real also naturally stops the suggestion recurring, since the detector re-checks against the
  updated `hikeTimeline`.
- **New: two Cloudflare-backed rate tables, mirroring the existing EPF/PPF interest-rate
  architecture exactly** (offline-first fallback baked in, 30-day local cache, a small static-JSON
  Worker route — see `docs/EXTERNAL_APIS.md`):
  - `epfBasicToGrossRates.ts` (`workers/api-proxy/src/epfBasicToGrossRates.ts`, route
    `/epf-basic-to-gross-rates`) — replaces the old single flat `EPF_DEFAULT_BASIC_TO_GROSS_PCT`
    default (50%) used for every era with a real convention table: 40% before the Code on Wages 2019's
    "wages must be at least 50% of total remuneration" floor took effect (notified across the labour
    codes around Nov 2025), 50% after. Found via a real mismatch reported against a real Nov 2014 hike
    point, where the actual CTC was meaningfully higher than the flat-50% estimate. Explicitly NOT
    modelled with a `confirmedThrough` "not yet declared" state like the EPF/PPF interest-rate tables
    — this is Penny's own best-effort CONVENTION for a missing real value, not an officially-declared
    fact, so it always has some default regardless of how far in the future a lookup month is, and
    remains just a starting point the user can override with `EpfEmployer.basicToGrossPct`.
  - `epfIncomeTaxRates.ts` (`workers/api-proxy/src/epfIncomeTaxRates.ts`, route
    `/epf-income-tax-rates`) — full Indian personal income-tax slab history FY2014-15 through
    FY2025-26+, modelling BOTH the Old Regime (frozen at its FY2019-20 shape, still a valid choice
    today) and New Regime (introduced FY2020-21, default since FY2023-24) independently — both shown
    side by side in the UI whenever both existed for a given point in time, never a single asserted
    answer. A direct question caught a real bug before shipping: the first version of this file only
    ever computed the New Regime, silently assuming everyone from FY2020-21 onward had chosen it.
    Deliberately simplified — no 80C/HRA/home-loan-interest/NPS/etc. deductions (so the Old Regime
    figure is closer to an upper bound than a real filer's actual liability), Section 87A modelled as a
    hard cliff (exactly correct FY2019-20 onward, an approximation for earlier years), no surcharge, no
    state professional tax — always shown as a labelled estimate, same "computed on behalf of the user,
    never asserted as fact" principle as every other estimate in this feature. Powers the Employer
    Detail popup's new "In Hand Monthly" figure. Written screen-agnostic (not EPF-specific in its own
    shape) so it can be reused later by Tax Footprint / a future ITR-import feature.
  - Both tables get new `apiBase.ts`/`.native.ts`/`.web.ts` exports (`EPF_BASIC_TO_GROSS_RATES_BASE`,
    `EPF_INCOME_TAX_RATES_BASE`) and new routes registered in `workers/api-proxy/src/index.ts`.
- **Smaller fixes, same round:** `EpfEmployerPickerSheet.tsx` now shows a per-employer "N need
  review" badge (previously only a card-level total existed, giving no hint of which employer the
  flagged rows actually belonged to when choosing between employers). `Modal.tsx`'s title now gets
  `flex-1`+`numberOfLines={1}` — without a flex basis, a long title (e.g. an employer name appended to
  a sheet title) had no bound and pushed the close button along with it instead of truncating.
  `EpfImportFlow.tsx`'s batch-summary screen gained `scrollable`+`footer` (previously no scroll, so a
  large file batch made the confirm button unreachable — found with a real 20-file batch) plus a
  15-file render cap with "Show all N," per this project's own bulk-import render-cap rule. A
  contribution row's own total in "See all transactions" previously silently excluded EPS (pension)
  from both the per-month row and the FY-header subtotal — now includes it, still broken down
  individually so the EPS portion (not withdrawable) stays visually distinct.

**New data model fields** (all additive, no schema version bump — see `docs/SCHEMA.md`):
`EpfEmployer.pendingTransferDismissed?: boolean`, `EpfEmployer.dismissedHikeMonths?: string[]`,
`EpfTransaction.transferredFromEmployerId?: string`.

**Tests added:** new `describe` blocks in `packages/core/tests/portfolio/epfPassbookParser.test.ts`
(`reflowWrappedRows`, plus real wrapped-row fixtures), `epfReconciliation.test.ts`
(`reconcileEpfBalanceEventAtDate`), `epfInterestCalculator.test.ts` (`monthlyTransfersIn` timing), and
`epfCalculations.test.ts` (`epfExperienceLabel`, `epfEmployerTotals`, `findUnrecordedEpfHikes`) — plus
two brand-new test files, `epfBasicToGrossRates.test.ts` and `epfIncomeTaxRates.test.ts`, covering the
two new rate tables' lookup/fallback/caching behavior and (for the tax table) both-regime slab/rebate
math.

**Status note: implemented, not yet manually verified.** Same caveat as every prior on-device
round — `tsc` (both `packages/core` and `apps/mobile`), `eslint`, `prettier`, and the full
`packages/core` vitest suite (1284 tests, 1 skipped) all pass, and the PII gate is clean, but none of
this round has been exercised end-to-end on a real device by the user yet; treat as
implemented-but-unverified until confirmed.

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
