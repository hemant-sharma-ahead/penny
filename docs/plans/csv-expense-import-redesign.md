# CSV / Manual Expense Import — Redesign

Status: **✅ Shipped (2026-08-14).** The full scope (§1-§13) plus everything found during real
on-device manual testing against the 9,384-row sample file (§14) is built, independently re-verified
after every round (`tsc -b`, full `packages/core` vitest suite, `apps/web-react` zero-diff isolation),
and committed. Performance work triggered by testing at this scale (Expenses screen slowdown after a
large import) is tracked as its own separate effort, not part of this doc's scope. This document stays
as the permanent design record — self-contained enough that a fresh session with no other context can
still see what was built, every decision made along the way, and why.

## 1. Why this doc exists

Triggered by testing `apps/mobile/src/features/import/` (the CSV/other-apps expense importer,
most recently reworked in PR #30, "Expense Import redesign") against a real, multi-year MoneyView
export — ~9,384 real transaction rows spanning 2015–2025, 79 distinct source categories, and
every one of: cash, bank, wallet, debit-card, credit-card, and mutual-fund account types. That
file surfaced 9 initial UX/correctness issues, and a further code-reading + data pass surfaced
several more. Discussed end-to-end (architecture, root causes, alternatives) before any mockup or
code — this doc is that discussion, captured for tracking and as the implementation brief.

**The sample file itself is real personal financial data and is never reproduced here** — every
example below uses a placeholder ("Person A", "Person B") in place of any real name, account
number, or narration text. Per this repo's privacy rules, the actual file must never be committed
or copied into the repo in any form (`scripts/check-pii.mjs`, `docs/PRIVACY.md`).

## 2. Explicit decision: keep CSV-import and bank-import permanently separate — do not unify

A prior doc, `docs/plans/csv-import-vs-bank-import-comparison.md` (written 2026-08-12, **now
deleted, superseded by this one**), compared the two importers and recommended retiring
CSV-import entirely — folding its one distinct capability (splitting one file across multiple
accounts) into bank-import, and making bank-import the single importer for every tabular format
(real bank statements, Cashew, YNAB, MoneyView, custom CSV). That doc explicitly deferred the
real MoneyView "bank account + several cards + a cash pseudo-account, all in one export"
interleaving problem as "a follow-on design question."

**Decision, made after full discussion: reject unification.** Keep the two features
architecturally isolated — this matches the codebase's existing, deliberate principle (stated in
`bank-import/types.ts` and `useBankImport.ts`): zero shared code between `core/bank-import/` and
`core/import/`, specifically so a bug fixed in one can never regress the other. Instead of
replacing CSV-import's engine with bank-import's, this doc brings CSV-import's own engine up to a
comparable level of sophistication in its own right — a genuine architectural redesign of
`apps/mobile/src/features/import/` and `packages/core/src/core/import/`, not a retirement.

Two claims in the deleted doc are worth noting as context, not as unresolved gaps:

- Its claim that CSV-import's transfer flow had "no destination-account picker at all" is now
  **stale** — `ImportCategorizeModal.tsx` already has one (with a "no other accounts yet"
  fallback state). Something changed in the ~2 days between that doc and this one. That said, the
  exact toAccount-empty scenario the comparison doc's underlying gap pointed at is still real (see
  Issue #6 below) — it's just that the picker itself already exists, the gap is what it's
  populated with.
- Its claims that CSV-import has **no balance/checkpoint awareness on new accounts**
  (`openingBalance: 0` hardcoded, never prompted) and **no dedicated import-history page** are
  real and still true today — both are explicitly **out of scope for this round** (§12), not
  silently dropped.

## 3. The new wizard shape

Today's flow is `Upload → MapColumns → Review` (`apps/mobile/src/features/import/`:
`UploadStep.tsx` → `MapColumnsStep.tsx` → `ReviewStep.tsx`), where `ReviewStep` does account
resolution, category resolution, and per-transaction-group triage all on one screen via bucket
sections (`AccountsSection.tsx` + `PreviewSection.tsx`'s "Needs your input" / "Staged — ready to
import" / "Already imported" tiles).

**New shape** — extend the existing step-wizard pattern with two more granular steps, splitting
what `ReviewStep` currently does into three:

```
Upload → MapColumns → Accounts → Categories → Transactions → Done
```

- **Accounts stage** — resolve every distinct raw account/card name (existing vs. create), plus
  the new card→account merge suggestion (Issue #9) and payment-mode assignment (Issue #6).
- **Categories stage** (new) — resolve every distinct source category (existing vs. create vs.
  transfer vs. skip), including the direction-aware fix (Issue #5) and counterparty sub-splitting
  for transfer/IOU-suspect categories (Issue #8, §7).
- **Transactions stage** — same bucket model as today's `ReviewStep` (Needs input / Staged /
  Skipped / Already imported), reached only once accounts and categories are already
  decided, so this stage is just: assign a row-group to its already-resolved category, override
  it to a different one, mark specific rows as transfer/skip, or (for IOU categories) supply the
  person. **Clarified 2026-08-14** (a first mockup pass mistakenly inferred the kind picker itself
  could be dropped here — corrected after user review, see §11): the full existing/create/
  transfer/skip kind picker (`ImportCategorizeModal`) stays reachable from every tile as a
  standing override, in addition to whatever the Categories stage already decided — it is not
  removed or replaced with a narrower per-tile surface. It simply opens pre-populated with the
  Categories-stage decision as its starting state instead of blank, so overriding a specific
  row-group is always one tap away without going back to the Categories stage.

### 3.1 Nothing touches disk until one final commit

Every stage operates **entirely in memory**. No account, category, or transaction is written to
the encrypted DB until a single final commit action at the end (after the Transactions stage). If
the user abandons the flow at any point, nothing is written — same "leaving discards everything"
behavior both importers already have today, just now spanning three stages instead of one screen.

This eliminates a whole category of complexity: because nothing is real until the final commit,
stepping back to an earlier stage to change something can **always** freely edit in-memory state
— there's no "this was already written, now what" case to design for during the flow itself.

This is not a new mechanic — it extends one that already exists. `core/import/importAccountResolution.ts`
already works exactly this way for accounts today (a `'create'` account resolution lives purely in
memory, referenced by every row via its source name, and is only turned into a real `Account`
record inside `commitAndImport()`). This doc extends the same "draft object, referenced by name,
materialized only at commit" mechanic to categories, which don't have it today.

- **Pickers show both real and draft options.** The Transactions stage's category picker and
  transfer-destination (`toAccount`) picker must show both real (already-in-DB) options and
  in-memory drafts created earlier in this same flow, with the draft ones subtly marked (e.g. a
  small "new" badge) so it's clear they aren't persisted yet.
- **Jumping back mid-flow is supported.** If, while in the Transactions stage, a row needs a
  category that doesn't exist yet, the user can jump back to the Categories stage, map the source
  to a new category under the right intent group (in memory), and return to the Transactions
  stage to find it available in the picker.
- **Resume scope is in-session only.** Stepping back and forward between stages within one open
  wizard run preserves everything in memory. Closing the app or leaving the screen still discards
  the whole in-progress import — no new persisted draft state across app sessions. (A future,
  bigger initiative if ever needed; not attempted here.)
- **Orphaned drafts are never created.** If a draft account/category ends up referenced by zero
  rows at final-commit time (e.g. created, then every row that would have used it got rerouted or
  skipped), it is simply never written to disk. A category/account needs a reason to exist;
  "standard rules" (can't delete one with real transactions) apply naturally since nothing
  unreferenced ever becomes real in the first place.
- **Cascade behavior is already the right shape once Issue #5 is fixed.** A `CategoryResolution`
  object is shared, by reference, by every row/tile under it — editing it from the Categories
  stage should propagate to every Transactions-stage tile still using it, and that's exactly what
  happens once resolutions are correctly keyed per `${categoryName}::${type}` (see Issue #5). A
  row individually moved via `RowOverride` (the existing per-row escape hatch) stays put — it
  doesn't follow the category-level edit, by design.

### 3.2 Partial import — the final commit is the only write, and it's partial by design

At the single final commit (end of the Transactions stage), only rows that are fully resolved —
in the "Staged" or "Skipped" state — actually get written. Rows still in "Needs input" are simply
left out of this run, exactly as `attentionCount > 0` already disables commit today (this
behavior is **kept**, not removed — see Issue #4) — the difference is the gate now applies
per-bucket, not to the whole import.

Re-uploading the same file later picks up the leftover rows: since real dedup (Issue #4/#7's fix,
§8) will correctly recognize what's already been committed, and since most Accounts/Categories
resolutions from the first pass will now auto-match to `'existing'` (their real, now-created
counterparts), a second pass is fast — only the still-unresolved transaction rows need fresh
attention. This is materially cheaper than building bank-import's own durable
`skippedRows`/Full-Ledger revisit mechanism from scratch, and reuses infrastructure CSV-import
already has (its own dedup + account/category exact-name matching).

## 4. The 9 original issues — root cause and where each is addressed

| # | Issue | Root cause (confirmed by reading the code) | Where addressed |
|---|---|---|---|
| 1 | No way to skip a row that needs fixing | `UnparsedRows.tsx`'s `RejectedRowEditor` has only an "Include this row" button, no discard action | §9.1 |
| 2 | "+N more" expands the whole card; no year in row dates | `TileRowList.tsx`'s "+N more" sets `showAllRows(true)`, rendering **every** row via an unbounded `.map()` — the same shape of bug that caused a real on-device crash elsewhere in this same PR. `fmtShortDate()` is day+month only | §9.2 |
| 3 | Skipped groups are unrecoverable | `skippedCount` is computed in `useImport.ts` but never passed to `ReviewStep`/rendered anywhere — dead state, same in web | §9.3 |
| 4 | All-or-nothing import gate | `ReviewStep.tsx`'s Import button `disabled` includes `attentionCount > 0` — a **deliberate** 2026-08-13 fix (previously an unreviewed guess silently imported) | §3.2 (kept, made per-bucket) |
| 5 | Categorizing one expense/income direction-split tile silently re-categorizes its sibling | `resolveCategories()` groups by `categoryName` alone, ignoring `row.type` — one shared `CategoryResolution` object, mutated in place, read by both direction-tiles | §9.4 |
| 6 | No payment-mode mapping; toAccount dropdown empty when destination account doesn't exist yet | `FORMAT_SYNONYMS.moneyview` never maps `paymentMode`; transfer-destination picker only lists real (already-in-DB) accounts | §9.5, §3.1 (draft accounts in pickers) |
| 7 | "Already imported" bucket is read-only, no un-flag | `DuplicatesBucket.tsx` deliberately has no `selection` prop ("nothing to bulk-act on," per its own doc comment) | §8 |
| 8 | No lend/borrow detection or person-required flow | Zero references to `IOU_MANDATORY_CATEGORY_IDS`/person/ledger anywhere in `apps/mobile/src/features/import/` | §7, §9.6 |
| 9 | Cards get tracked as separate accounts instead of mapping to one real account | `moneyview` account-column priority is `Account Id` before `Bank Name`, fragmenting one bank into several pseudo-accounts (one per card) | §9.7 |

## 5. Additional issues found (not in the original 9)

Found via direct code reading and re-reading the real sample file, confirmed (not hypothesized)
unless noted:

- **9.a — Literal `"null"` strings leak into the UI as real values.** The source file's
  `Merchant/Receiver/Sender` and `Notes` columns are sometimes the literal 4-character string
  `"null"` (168 and 4,323 rows respectively, in the ~9,384-row sample). `parseWithMapping()`'s
  `.trim()` doesn't treat that as empty, so it becomes the transaction's real description — this
  is the "Description: null" text seen in the review screen. Fix: any description that resolves
  to `"null"`/`"n/a"`/similar case-insensitively should fall back (e.g. to the category name),
  applied wherever a description is read from a mapped column.
- **9.b — Negative debit values get the wrong direction.** `resolveAmount()`
  (`importMatcher.ts:120-125`) does `Math.abs()` on the outflow column **before** deciding
  direction — so a `refund-reversal`-type row with a negative Debit value (moneyview's own
  convention for a reversal/refund) is misclassified as a same-size positive **expense** instead
  of the credit/reversal it actually represents. Confirmed via direct inspection of real rows in
  the sample file; not a hypothesis. Fix: check the *sign* of the outflow/inflow values before
  taking their absolute value, so a negative debit flips the row to `income` (reversal) rather
  than staying `expense`.
- **9.c — The exact-match dedup key silently drops real, distinct same-day transactions —
  including within a single file, no DB involved at all.** `dedupKey()`
  (`importPipeline.ts:8-10`) truncates the date to **day-only**
  (`new Date(date).toISOString().slice(0, 10)`) before comparing, and the duplicate check runs
  **against earlier rows in the same batch, not just the DB** (confirmed:
  `importPipeline.ts:195-197`). Checked directly against the real sample file: **149 distinct
  (day, amount, description) combinations have 2+ rows with genuinely different timestamps —
  334 rows total (~3.5% of the file)** — e.g. two separate same-day ATM withdrawals of the same
  amount, two same-day wallet top-ups minutes apart, two identical-amount purchases from the same
  merchant hours apart. On a straight import of a file like this today, most of that second/third
  occurrence would be silently flagged and dropped as an "already imported duplicate" of the
  first, despite never actually existing anywhere before. This is not a schema limitation —
  `Expense.date` already stores full epoch-ms precision, and moneyview's own export has
  second-level timestamps; the precision is only lost in how the dedup key is built. **Fix:
  tighten the key to include time (at minimum to-the-minute, ideally full timestamp) instead of
  date-only.** Folded into Issue #7's fix (§8), since it's the same code path.
- **9.d — Investment-movement categories get silently counted as spending.** Rows categorized
  "Investments"/"Mutual Funds"/"Stocks" in the sample file show real amounts (seen: values from
  ~₹14,500 up to ₹100,000 in single transactions) flowing out of a bank account with no special
  handling today — they'd become a plain "Investments" expense category, materially inflating
  spend analytics with what's actually money moving into investments (which Penny already tracks
  separately via the Portfolio feature). **Decision: flag these as transfer-suspect/needs-review
  by default** (extend the existing category-name keyword list, §7) rather than silently
  defaulting to a generic expense category. Explicitly **not** attempting any real Portfolio
  integration in this round (§12) — just don't let it silently misclassify as spend.
- **9.e — `docs/features/expenses.md` line 147 is stale.** It states category resolution "does
  not need to be 100%-complete to import" — this directly contradicts the same doc's own item 8
  (the 2026-08-13 `attentionCount > 0` fix). Needs correcting regardless of anything else in this
  doc, as part of the documentation-maintenance pass once this redesign ships.

## 6. Verified non-issues (checked, ruled out)

- **`"Sept"` (4-letter September) date parsing.** The sample file uses this non-standard
  abbreviation. Verified directly (`node -e`, matching `parseFlexibleDate`'s actual regex) that it
  parses correctly — the regex captures the first 3 letters and absorbs the rest. Not a bug, no
  action needed.
- **Leading space in the real CSV header `" Payment Type"`.** Verified `guessColumnMapping()`
  already trims + lowercases every header before synonym matching (`importMatcher.ts:91`) — the
  leading space does not break the payment-mode mapping fix in §9.5.
- **`Account Type` as a fallback source for payment mode when `" Payment Type"` is blank.**
  Checked the cross-tab: of rows with a blank Payment Type, 344 are plain `bank`-type rows — not
  a reliable signal (a blank-payment-type bank row could be anything: cash, cheque, netbanking).
  Dropped this idea; the direct column mapping in §9.5 is sufficient on its own.

## 7. The counterparty-grouping mechanism (Issue #8, and the real fix for Issue #5's "A/c to A/c" case)

A single source category label can conflate genuinely different real-world things. In the sample
file, "A/c to A/c" covers self-account transfers, lending, and repayments, all under one moneyview
label — even with Issue #5's direction-aware fix, all rows sharing that label-and-direction would
still get forced into one resolution, which is too coarse for a label like this.

**Mechanism, adapted from how bank-import's general merchant/narration grouping happens to
achieve the same separation as a side effect** (bank-import has no lend/borrow-specific detector —
grouping by narration text naturally separates "Person A" from "Person B" from "Some Merchant"
since a P2P transfer's narration *is* the counterparty's name):

- Moneyview's own `Merchant/Receiver/Sender` column already carries the counterparty name for
  these rows (already mapped as the `description` synonym for the `moneyview` format) — no new
  NLP needed.
- For any source category already flagged transfer-suspect (existing `isLikelyTransfer` keyword
  match) **or** IOU-suspect (extend the same keyword approach to catch labels like "Loan"), sub-
  split its rows by a normalized version of that column (adapting bank-import's
  `normalizeNarration()` — strip reference-number noise, uppercase) instead of leaving them as one
  lump resolution.
- **Tiered confidence**: check the normalized name against existing `Person` records (IOU's
  `persons` store) first — a match is a high-confidence pre-fill (suggest Lending/Borrowed,
  person pre-filled). No match falls back to grouping by the raw normalized text as an editable
  candidate, never auto-locked.
- **Scoped, not universal** — this sub-split only applies to categories already flagged
  transfer/IOU-suspect. An ordinary category (e.g. groceries) doesn't need it.
- **Correctable** — the existing per-row override mechanism must also support moving a row out of
  a wrongly-detected counterparty group into the residual bucket, or vice versa (reference-code
  narrations and genuine self-transfers with no name will land in the residual group by default).
- **Decision: this sub-split surfaces as separate top-level rows directly in the Categories
  stage** (each `"A/c to A/c" — Person A` / `"A/c to A/c" — Person B` /
  `"A/c to A/c" — (no clear person)` gets its own resolution), not as a coarser single Categories-
  stage row that defers the real split to the Transactions stage. Keeps one consistent rule:
  everything in the Categories stage is a fully resolvable unit.
- The per-person **IOU person field stays a Transactions-stage (or, here, Categories-stage-row-
  level) concern**, never a blanket per-source-category default — different lend/borrow events
  under the same moneyview label genuinely involve different people, which this sub-split now
  naturally handles since each counterparty gets its own row. **Clarified 2026-08-14** (after user
  review; see §11): "never a...default" rules out one shared person value applied across a whole
  undifferentiated category (e.g. every "A/c to A/c" row getting the same name regardless of which
  real counterparty it belongs to) — it does **not** rule out pre-filling a specific row's own
  already-detected counterparty name (the tiered-confidence match above, or the raw candidate text
  for an unmatched-but-named group) into that row's person field when its resolve panel opens.
  Once the sub-split has already separated "Person A" from "Person B" from "(no clear person)"
  into their own rows, each row's own detected name IS the per-row-level concern this bullet
  requires — carrying it forward as that row's starting value (never locked, always editable) is
  consistent with this rule, not an exception to it. A row with no detected name (the residual
  bucket) still starts blank, same as before.

### 7.1 Self-account-movement generalization (cash withdrawal, wallet top-up, CC bill payment)

Re-reading the category list surfaced that **wallet top-ups** (reloading a Freecharge/Paytm-style
wallet from a bank account) are the same shape of problem as cash withdrawal (Issue #5's
originally-cited example) — money moving from one of the user's own accounts into another of
their own accounts, just wallet instead of cash. Same real-world shape also applies to CC bill
payment (bank → credit-card account) and arguably the investment-movement case (§5, 9.d).

**Decision: design one general "self-account movement" detector**, not three or four separate
bespoke heuristics — covering cash withdrawal, wallet top-up, and CC bill payment uniformly. This
lives alongside the existing transfer-pairing logic
(`core/import/importTransferPairing.ts`) as an extension of it, not a parallel system.

## 8. Duplicate / "already imported" bucket (Issue #7) — light touch, not full bank-import parity

**Decision: light touch.** Add:

- An "not a duplicate — import anyway" per-row action, moving the row into the appropriate
  category tile instead of leaving it permanently excluded.
- The literal-`"null"` description fix (§9.a applies here directly — this is exactly the "null ·
  30 Mar · freecharge" caption seen in the review screen).
- The dedup-key time-precision fix (§9.c/5).

**Explicitly not doing** in this round: porting bank-import's full tiered exact+fuzzy matcher
(`core/bank-import/matcher.ts`'s `±3-day window`/description-similarity/tap-to-reassign model).
That's a meaningfully bigger scope — essentially duplicating bank-import's matching engine into
CSV-import — and there's no evidence in the sample file of the false-positive-duplicate problem
that would justify it. Revisit if it turns out to be needed once the dedup-key fix ships (a wider
matching window could still resurface false positives that a same-day exact match wouldn't have
hit).

## 9. Stage-by-stage fix detail

### 9.1 Transactions stage — discard a broken row (Issue #1)

Add a "Discard" action alongside `UnparsedRows.tsx`'s existing "Include this row" — permanently
excludes the row from this import (distinct from just leaving it unfixed, which today already
silently excludes it with no visibility). Surface a summary line at the Done step: "N discarded,
N still unresolved," so nothing vanishes without the user seeing a final count.

### 9.2 Transactions stage — capped, scrollable row list (Issue #2)

Replace `TileRowList.tsx`'s "+N more" full unbounded-expand with a capped, internally-scrollable
list (fixed max height) — same reliability rule as the codebase's existing "unbounded `.map()`
over bulk data" prohibition (`docs/ARCHITECTURE.md`'s 2026-08-13 entry), not just a UX
preference; this is the identical shape of bug that already caused a real on-device crash
elsewhere in this same PR (`UnparsedRows.tsx`'s 20-row cap exists for exactly this reason). Also
add the year to `fmtShortDate()`'s output — `CarryForwardExcluded.tsx` already has a year-
inclusive formatter to reuse/copy.

### 9.3 Categories/Transactions stage — surface skipped groups (Issue #3)

Add a "Skipped (N)" section/filter as a peer to "Staged"/"Already imported" — reusing the
existing `skippedCount` computation (`useImport.ts`) that's already there but never surfaced, and
the tile's existing fully-editable re-categorize flow (no new edit mechanism needed, just
discoverability).

### 9.4 Categories stage — direction-aware resolution keys (Issue #5)

Key `resolveCategories()`'s output by `` `${categoryName}::${type}` `` instead of `categoryName`
alone — mirrors the pattern `importTileGrouping.ts` already uses one layer up
(`${baseKey}::${row.type}`). Contained, high-confidence bug fix; combined with §7's counterparty
sub-split for transfer/IOU-suspect categories specifically.

### 9.5 Accounts stage — payment mode + account sequencing (Issue #6)

- Add `paymentMode: ['payment type', 'payment mode']` to `FORMAT_SYNONYMS.moneyview` (currently
  entirely absent from that preset; the field and write-through already exist end-to-end for
  every other format).
- Transfer-destination (`toAccount`) picker in the Transactions stage must include in-memory
  draft accounts (not just real ones), resolved to a real id at the same single final commit —
  per §3.1's draft-object mechanic, applied to the one place it's currently missing (the picker
  only reads real accounts today).

### 9.6 Categories/Transactions stage — lend/borrow support (Issue #8)

Port the IOU-mandatory-category pattern from `BulkCategorizeModal.tsx`/`ExpenseForm.tsx` into
`ImportCategorizeModal.tsx`: `IOU_MANDATORY_CATEGORY_IDS.has(categoryId)` check, lock-open person
panel via the shared `ExtraCircle` toggle, required-field validation. **Confirmed reusable as-is**:
`CategoryPickerModal` (the tile-grid picker itself), `IOU_MANDATORY_CATEGORY_IDS` (the constant),
and `ExtraCircle` (the toggle component) are already shared across bank-import, CSV-import, and
the regular `ExpenseForm` — `ImportCategorizeModal.tsx` currently has zero references to any of
the three. What needs building fresh (same shape of work `BulkCategorizeModal.tsx` already did
once): the orchestration logic, plus a commit-time equivalent of bank-import's Person
resolution + `ledger_entries` write (currently only implemented in `useBankImport.ts`, needs an
equivalent in `useImport.ts`'s `commitAndImport()`). Also add keyword/category-name auto-
suggestion (mirroring the existing `isLikelyTransfer` pattern) for labels like "Loan" plus
lent/borrowed/returned-style phrasing — real, strong signal already present in the sample file.

### 9.7 Accounts stage — card→account merge suggestion (Issue #9)

Extend the account-resolution step's existing fuzzy-merge-suggestion UI (already built for near-
duplicate account names, dismissible, never auto-applied) to also trigger when a card-type row
(`Account Type: debit-card`/`credit-card`) shares a `Bank Name` with another resolution — suggest
merging it into that account, and set `paymentMode` from the card instead of creating a separate
Penny account. This is the most novel new UI of the whole redesign — **needs a mockup** for how
the Accounts stage presents "these look like cards on your existing account — merge?"

## 10. Already covered by existing capabilities — no new work needed

Two things raised during discussion turned out to already be fully built:

- **Timeline entry + one-click undo.** CSV-import has had this *longer* than bank-import:
  `core/import/importWriter.ts` calls `logActivityAwaited()` on every commit and exposes
  `undoImportBatch()`, wired into `useImport.ts:680`. Per `docs/features/bank-import.md:205-206`,
  bank-import only gained its own equivalent later (2026-08-06) by copying this exact pattern
  from CSV-import. Already shows as an `IMPORT` entry in Settings → Timeline with an inline Undo
  action, gated behind a confirmation dialog. Nothing to add.
- **Expense-first sequencing nudge.** Already shipped as `ExpenseCoverageNudge.tsx` (PR #30) —
  during bank-import's setup step, if statement lines don't match already-logged expenses for
  that period, an advisory (never a gate) card recommends importing expenses first, with a "Go
  log expenses first" CTA straight into Expense Import. This matches the intended sequencing
  exactly (import expenses, then bank statements, for full reconciliation/balance-match
  checkpoints) and needs no changes — if anything, it becomes more valuable as a side effect of
  this redesign, since more real transactions will land correctly via CSV import for it to match
  against.

## 11. Decisions log (quick reference)

| Decision point | Chosen direction |
|---|---|
| Unify CSV-import into bank-import? | **No** — keep permanently separate (§2) |
| Partial import model | Per-bucket final commit; leftover rows picked up via re-upload + dedup, not a durable skipped-rows-history system (§3.2) |
| Account creation vs. transfer sequencing | Draft accounts shown in the toAccount picker, resolved at the same single commit — not a literal multi-write two-phase wizard (§9.5) |
| Duplicate/"already imported" bucket depth | Light touch — un-flag action + description fix + dedup-key precision fix; full tiered fuzzy-matcher parity deferred (§8) |
| Card→account mapping approach | Extend existing fuzzy-merge-suggestion UI to trigger on shared Bank Name + card Account Type, not a blunt default-to-Bank-Name-only priority swap (§9.7) |
| Lend/borrow detection strength | Manual person-required panel (ported pattern) **plus** keyword/category-name auto-suggestion, not manual-only (§9.6) |
| Counterparty sub-split surfacing | Separate top-level rows in the Categories stage, not a coarser row deferring to the Transactions stage (§7) |
| Resume scope | In-session only; no cross-session persisted draft (§3.1) |
| Orphaned drafts at commit | Never created if zero rows reference them (§3.1) |
| Mockups | Needed before implementation, per standard workflow — deferred until this doc is reviewed/agreed (see §13) |
| Transactions-stage tile — kind picker (resolved 2026-08-14, post-mockup-review) | **Kept, not removed.** The full existing/create/transfer/skip picker stays reachable per tile as a standing override on top of whatever the Categories stage decided, pre-populated with that decision as its starting state rather than blank (§3) |
| IOU person-field pre-fill (resolved 2026-08-14, post-mockup-review) | **Pre-fills from the Categories stage's per-row counterparty detection** when one exists (e.g. "A/c to A/c — Person A" → "Person A"), still fully editable — clarifies §7's "never a...default" language to mean never one shared value across a whole undifferentiated category, not "never pre-fill a per-row guess" (§7). A row with no detected name still starts blank |
| Draft-not-saved indicator (resolved 2026-08-14, post-mockup-review) | A small, persistent badge in the shared stage-header chrome, visible across every mid-flow stage — not a caption sentence repeated per screen |
| Card→account merge suggestion granularity (confirmed 2026-08-14, post-mockup-review) | Independent suggestion per card, no bulk "merge all cards on this bank" shortcut (§9.7) |
| Counterparty sub-split — bulk-resolve on the parent label (confirmed 2026-08-14, post-mockup-review) | No bulk shortcut — each sub-row resolves independently; the parent label stays a pure visual grouping header (§7) |

## 12. Out of scope for this round (explicitly, not silently dropped)

- Unifying with bank-import (§2 — actively rejected, not just deferred).
- Full tiered fuzzy duplicate-matcher parity with bank-import (§8).
- True cross-session resume / persisted partial-import draft state (§3.1).
- Any real integration with the Portfolio feature for investment-movement categories (§5, 9.d) —
  they're flagged transfer-suspect/needs-review, nothing deeper.
- A dedicated import-history page (bank-import's `BankImportHistoryPage.tsx` equivalent) — the
  existing Timeline + Undo entry (§10) already covers "undo the whole import in one click."
- New accounts created via CSV import getting a real opening-balance prompt/checkpoint (still
  hardcoded to `0` today) — flagged as a real, still-open gap from the deleted comparison doc,
  just not tackled here.

## 13. Next steps (original — see §14 for what's actually happened since)

1. ~~Review this doc — confirm the decisions in §11 and the scope boundaries in §12.~~ Done.
2. ~~Mockups for the Accounts-stage merge suggestion, Categories-stage counterparty split,
   Transactions-stage skip recall, and IOU panel.~~ Done — `docs/mockups/proposals/expense-import-redesign-v1.html` (single consolidated file, per the
   one-file-per-discussion convention).
3. ~~Implementation.~~ Done, in two chunks (core resolution logic + Accounts stage, then
   Categories/Transactions stages + wizard chrome + IOU panel), each independently verified.
4. **Documentation pass** — still pending. `docs/features/expenses.md`/`docs/ARCHITECTURE.md`
   still describe the pre-redesign single-Review-screen architecture. Deliberately not done yet —
   this repo's batch-once-right-before-commit cadence means this happens in one pass once manual
   testing (§14) settles, not incrementally after each round.

## 14. Post-implementation manual-testing findings (living section)

Real on-device testing against the 9,384-row sample file surfaced several gaps the original design
missed. Each was fixed and independently re-verified (not just taken on the implementing agent's
word) before moving to the next. In order found:

1. **IOU ledger-entry write path ignored per-row category overrides** (found via code review before
   the first testing round, not manual testing) — a row moved into an IOU-mandatory category via a
   partial-selection override got no ledger entry; a row moved out of one still got a phantom entry.
   Fixed: `commitAndImport()` now resolves each row's actual effective category (override-aware)
   before checking IOU-mandatory status, with a new per-row-index `rowIouPersonNames` map for the
   override case.
2. **No way to skip an account.** Added a `'skip'` kind for account resolution (mirroring
   categories' existing skip) as new, additive, mobile-only types (`AccountActionOrSkip`/
   `AccountResolutionOrSkip`) — `AccountAction` itself, which `apps/web-react` calls directly, stays
   untouched. Skipped-account rows are filtered out before Categories-stage grouping ever sees them.
3. **Accounts/Categories stages were unstructured flat lists**, unlike Transactions stage's
   existing Needs-Review/Staged/Skipped buckets. Extracted a shared `BucketCard`/
   `useBucketExpansion` and applied the same three-bucket pattern to all three stages.
4. **Categories stage blocked advancing to Transactions on 100% resolution** — stricter than
   intended. §3.2's partial-commit design was always about the final commit, never about stage
   navigation. Removed the gate; an unresolved category now flows through to Transactions stage as
   an ordinary "needs attention" item, exactly as it already had to handle unconfirmed `'create'`
   guesses.
5. **The partial-commit gate (§3.2) had never actually been wired up** — the Transactions-stage
   commit button was still gated on zero unresolved items (`attentionCount > 0`), the literal
   all-or-nothing behavior §3.2 explicitly rejected. Worse: this gate had been silently masking a
   real bug in the write path itself — `commitAndImport()`'s category-creation and row-action-building
   loops wrote every group's suggestion unconditionally, never checking readiness; nothing broke only
   because the old gate made that path unreachable while anything was unready. Fixed at the write-path
   level (a new `transactionsReady`/`isRowWritable` check gates category creation, tag-memory, and
   final row actions — a not-ready group is forced to `{skip: true}` and deferred, never written with
   a wrong/placeholder category), not just the button's `disabled` prop. Also fixed a real count-unit
   bug found in the same screenshot: the bucket badge counted tiles, the blocking message counted rows
   summed across those tiles — shown side by side with no indication they measured different things.
6. **Skip required opening the categorize modal** — added a direct "Skip" button to the tile
   footer (`onUpdate({ kind: 'skip' })`, no modal, always whole-group) alongside "Categorize N
   selected".
7. **Categories stage and Transactions stage used two different row-layout components** despite
   needing to look consistent. `CategoryTile.tsx` (Transactions stage's tile) is now the single
   shared shell for both — a new `expandable` prop (default `true`) lets Categories stage render
   header+footer only (no chevron, no body) via `expandable={false}`; `CategoryResolutionRow.tsx` is
   now a thin wrapper around it. Added an info banner to Transactions stage explaining its continued
   purpose now that Categories stage already decides most of it (verify against real transactions,
   adjust a category, or partially import a group now).
8. **No way to prevent leaving mid-commit, and the commit experience itself needed rethinking.**
   Tapping "Import" only showed a spinner in the button with no back-navigation lock — a user could
   navigate away mid-write. Discussed at length (see conversation — not reproduced here) before
   landing on a scoped design, informed by the fact **CSV import is a first-few-times-only
   action** (used mainly during initial setup), not a frequent one — deliberately NOT building
   cross-screen background execution, an app-level store, or blocking manual transaction creation
   elsewhere, since none of those are needed once the user simply can't leave this screen mid-write.
   - **New 3-state screen**, mockup: `docs/mockups/proposals/expense-import-progress-v1.html`.
     Absorbs the existing "Done" wizard step's role rather than becoming a new 7th step — Done was
     always "the step that shows what happened after committing," it just now has a richer
     pre-completion phase first. `DoneStep.tsx`'s existing completion layout is reused verbatim for
     state 3, not redesigned.
     - **State 1 — Pre-start**: shown immediately on tapping "Import," nothing written yet. Shows
       row count + an estimated duration, a neutral "don't close the app" note, and a "Start Import"
       button. Back navigation is still allowed here.
     - **State 2 — Importing**: the write loop actually runs only once "Start Import" is tapped.
       Live progress count + bar, estimated time remaining, a bordered (`secondary`-weight) "Cancel"
       button. Back navigation (header back, hardware back, swipe gesture — all three, not just the
       header chevron) is locked from this point on.
       - Cancel shows a confirm dialog (porting `ConfirmDialog.tsx`'s real shape) before stopping —
         deliberately NOT instant like Skip/Discard, since stopping a live write is a bigger decision
         than a per-row action: "Stop importing? {X} already added will stay — the remaining {N-X}
         will need a re-upload later." Stopping leaves already-written rows in place (undoable via
         the existing batch-undo mechanism), and just defers the rest — same re-upload-picks-up-the-
         rest model as §3.2's partial commit generally.
     - **State 3 — Complete**: two distinct framings sharing `DoneStep.tsx`'s layout — a normal full
       finish (success-green) vs. a stopped-early case (warning-amber, not danger-red, since
       cancelling is a deliberate successful action, not a failure) — plus a "Go to Expenses" button
       as a plain navigation shortcut (not an in-progress escape hatch — that idea was explicitly
       dropped once the "stay on one screen" framing was chosen).
   - **App-killed-mid-import**: explicitly NOT solved by new cancellation logic (once the process is
     actually killed, no JS is running to invoke a cancel handler) — relies on the existing safety net
     instead: each row commits independently, so whatever succeeded stays durably written, and a later
     re-upload of the same file picks up the rest via the dedup fix (§9.c/9.5).
   - **Local push notification if the user switches to a different app** while importing: scoped as
     best-effort only (`expo-notifications` + `AppState`) — flagged as likely reliable on Android,
     not guaranteed on iOS (which aggressively suspends JS execution when backgrounded without a
     registered native background task, a much bigger lift not justified for how rarely this feature
     runs). Not yet implemented as of this writing — pending this round's implementation pass.
   - Two implementation-only notes from the mockup review (not design decisions, just don't miss
     them): the back-lock must cover hardware-back and the swipe-back gesture, not just the header
     back button; the ETA/duration strings need a real estimator (rolling average of ms-per-row so
     far, extrapolated against rows remaining) — the mockup's numbers are placeholders.

Each numbered fix above was independently re-verified after landing: `tsc -b` for every touched
package, `apps/web-react` re-confirmed at zero diff (and its 4 pre-existing, unrelated `tsc` errors
re-confirmed identical via a clean `git stash` comparison), and the full `packages/core` vitest suite
passing (1021/1021 as of the last round before item 8).
