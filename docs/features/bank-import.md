# Bank Statement Import

`apps/mobile` only (new, 2026-08-02). Full requirements: [`docs/plans/bank-statement-import.md`](../plans/bank-statement-import.md).

## What it is

Manual entry and (future, unbuilt) SMS-based auto-detection can never guarantee full coverage of a
bank account's real transaction history — an entry can be missed, an SMS can fail to arrive, and
Account Aggregator sync isn't usable yet (a documented Phase 3 idea). Bank Statement Import closes
that gap: upload your own bank statement (CSV, v1), Penny parses it, compares every line against
what's already logged for that account, and presents a review screen so missed transactions can be
added and stray/duplicate logged transactions can be caught — without ever assuming an unconfirmed
match.

## User-facing capabilities

- Per-account entry point: a new "Import" action on each bank/credit-card account row on the
  Accounts page (not shown for cash/wallet accounts, which have no bank statement).
- **Zero-account entry point (2026-08-05).** Import was previously unreachable with no accounts at
  all — the only entry point was a per-row action, and the empty Accounts screen had nothing to
  iterate. The empty state now has a secondary "or import a bank statement" action (below the
  primary "Add first account") that creates a new `bank`-type account (no type-picker step) and
  hands off straight into that account's import setup screen — `useAccountForm`'s new
  `openAddWithType(type, onCreated)`.
- One merged setup screen (`SetupStep.tsx`, 2026-08-03 — was 3 separate steps): pick a bank from a
  dropdown (HDFC, ICICI, Kotak, SBI, IndusInd, HSBC, Bank of Baroda, or Custom — a dropdown rather
  than a tile grid since the preset list can grow), upload a CSV, then review the resolved column
  mapping inline as a small card (Date/Narration/Debit/Credit/Balance → the file's real headers),
  with a single "Edit mapping" action opening one popup with every field editable together.
- A four-bucket review screen:
  1. **Matched** (confident, exact-amount) — collapsed by default, shown as a paired tile
     (statement line + recorded line); any pairing can be manually reassigned by tapping it.
  2. **Possible matches** (exact amount, but an ambiguous tie between two or more same-day candidates,
     or a same-window candidate with no clear description-similarity winner — never a close-but-not-
     exact amount; see 2026-08-06 note below) — shown as the same paired-tile style as Matched (amber/
     dashed instead of green/confident), with the top-ranked candidate (or a "N possible" count when
     tied) on the right half. A picker modal (±3 days by default,
     widen range / whole month / search) resolves each one, highlighting the matcher's own
     suggestion(s) with an amber border and a "Suggested" badge; besides picking a match, it also
     offers "No match — add as new" (opens the statementPreset `ExpenseForm`) and a separate "Move to
     'Not yet logged' for later" action.
  3. **Not yet logged** — grouped by merchant with checkboxes (all checked by default); bulk-apply
     one shared category/description/tags/optional Lent-or-Borrowed person to the checked
     occurrences (payment mode is inferred independently per line, never shared across the group);
     unchecked ones stay for a second pass. Each group is independently collapsible, and every row
     shows its narration and amount (red for spend, green for income), not just date and amount.
     The "Categorize N selected ›" action is always visible on the group card regardless of its
     collapsed/expanded state (2026-08-09) — a correctly-grouped batch can be categorized straight
     off the collapsed card; expanding is only needed to inspect individual rows or adjust which
     ones are checked before categorizing.
  4. **Recorded, not in statement** ("lone wolves") — a logged transaction with no statement
     counterpart at all; keep, edit, or delete, at your discretion. One near the statement's own
     date-range edge is flagged softly (may genuinely belong to an adjacent statement).
- A global "Merchant recognition" screen (also from the Accounts page) to add manual normalization
  overrides — e.g. teach Penny that a cryptic statement line always means a specific merchant. A
  read-only "How automatic recognition works" card explains the fixed underlying heuristic (and lists
  its current keyword list) alongside the editable overrides — added 2026-08-03 so the algorithm isn't
  a total black box next to your own overrides. `CONNECTOR_KEYWORDS` (`core/bank-import/
  normalization.ts`) grew a second batch on 2026-08-05 — INFT, TPT, ONL, ECOM, EMI, RET, CHG, TAX,
  AMB, AQB, VPS, IPS — from the same user-sourced research pass as the cash-withdrawal code table
  below; `SI` and the bare `I`/`W` fragments from "I/W CLG" were deliberately left out as too short/
  generic (real risk of stripping an actual merchant's initials instead of noise).
- A second global screen, "Cash-withdrawal codes" (2026-08-05, `BankCashWithdrawalCodesPage.tsx`,
  also from the Accounts page header) — narration codes like ATW/NWD/SELF that identify a statement
  line as a cash withdrawal, grouped by bank plus a bank-agnostic "Any bank" group (NFS, SELF, ...).
  Seeded with researched defaults for the 7 supported banks (`core/bank-import/cashWithdrawalCodes.ts`
  documents per-entry confidence — banks don't publish a single canonical code list, so this is a
  well-researched starting point, not a guarantee), but every row including the defaults is fully
  editable/deletable, since a wrong or missing code should be just as fixable as a custom one. Both
  this screen and Merchant recognition add their entry via a FAB + popup (2026-08-05, matching the
  Expenses tab's own add-transaction FAB), not an inline form pinned to the bottom of the list — per
  direct user feedback that the inline form broke consistency with the rest of the app.
- **Marking a statement row as a transfer (2026-08-05).** `ExpenseForm`'s statementPreset mode used
  to lock Type entirely (shown as static "Add Expense"/"Add Income" text) — now it's a real 2-option
  toggle: the file's own direction (`'expense'`/`'income'`, never changeable to the other, since
  that's a statement fact) versus `'transfer'`. Picking Transfer reveals a "To account" picker (the
  same `AccountChips` component the normal Transfer flow uses, showing every account) — only the
  statement's own side stays locked; a transfer's other side is exactly the judgment call this exists
  to let the user make. This manual override always exists regardless of any auto-detection below —
  by explicit design: a UPI transfer to the user's own account at a bank they haven't imported a
  statement from yet has no narration code and no existing record to cross-reference against, so
  *only* the user knows it's really a transfer.
- **Direction-swap fix (2026-08-05).** The locked statement account always renders in the first chip
  row, but which schema field it actually fills — `accountId` (source) vs `toAccountId`
  (destination) — depends on the row's own direction: a debit's locked account is the source (as
  originally built, matching cash-withdrawal's debit-only shape); a **credit** row means money arrived
  *into* the locked account, so it's the destination, and the chip row is relabeled "To account" with
  the roles swapped when the `Expense` is built. Found while adding the cross-account suggestion below,
  the first feature to actually exercise a credit-direction transfer — without the fix, marking an
  incoming statement line as a transfer recorded the money movement backwards.
- **Auto cash-withdrawal detection (2026-08-05).** Both flows above call
  `suggestCashTransferFor()`/`suggestCashTransferForRow()` against each row's raw narration, using the
  active bank's own codes plus the bank-agnostic ones from the Cash-withdrawal codes screen. A
  confident match (exactly one `'cash'`-type account exists) pre-selects Transfer with that account
  already filled in; an ambiguous match (2+ cash accounts) still pre-selects Transfer but prompts with
  a cash-accounts-only picker first (`PossibleBucket`'s `pendingCashChoice` step) rather than silently
  guessing which one. Zero cash accounts falls back to the general To-account picker with nothing
  pre-filled.
- **Cross-account "possible internal transfer" suggestion (2026-08-05; absorb-in-place fix
  2026-08-09).** A second, much softer signal, `suggestPossibleTransfer()`/
  `suggestAmbiguousTransferCandidates()` (`core/bank-import/matcher.ts`) — for a row with no cash-code
  match, checks whether some *other* account has an already-recorded plain expense/income (never a
  transfer or an IOU-linked entry) with the opposite direction, a matching or close amount, within the
  same ±3-day window `matchStatementRows` itself uses. A hit surfaces "Might be the transfer you
  recorded on `<Account>` (`<date>`, `<amount>`) — Link these ›" as an inline chip in `PossibleBucket`
  (same visual language as `MatchedBucket`'s retroactive-cash-transfer chip), or a picker
  (`AmbiguousTransferPickerModal`) when 2+ equally-plausible candidates tie — always dismissible, never
  auto-applied. **Accepting it now absorbs the existing candidate expense in place**
  (`convertCandidateToTransfer()`, `linkAsCrossAccountTransfer()` in `useBankImport.ts`) rather than
  building a brand-new record alongside it — found + fixed 2026-08-09 after an on-device repro showed
  the original "only converts *this* row, the other leg stays whatever it already was" behavior created
  two records both debiting the source account for the same real-world transfer, corrupting that
  account's own already-verified checkpoint history. This closes the 1:1 candidate case only;
  `BulkCategorizeModal`'s bulk "Mark as transfer" for a merchant *group* of several rows is a genuinely
  different, less precise scenario (many rows to one destination account, not a 1:1 match) and still
  creates fresh records, unchanged. Also structurally can't be confused with a Lent/Borrowed entry: IOU
  money movements are recorded as plain `type: 'expense'`/`'income'` (never `'transfer'`, and
  `toAccountId` only ever exists on a transfer), so a coincidental amount/date match against a real IOU
  entry is a genuine, inherent ambiguity this function can't resolve on its own — exactly why it's a
  suggestion the user confirms, not an auto-classification.
- **"Mark as transfer" generalized in bulk (2026-08-05).** `BulkCategorizeModal`'s toggle — previously
  "Mark as cash withdrawal," gated behind a cash-code match and limited to cash accounts — is now
  always visible regardless of detection, labeled "Mark as transfer," and its account picker offers
  every account (not just cash ones). Auto-detection (cash-code first, falling back to the
  cross-account suggestion above) only decides whether it starts pre-checked and pre-filled, when
  every checked row's own suggestion points at the same account; the manual override is never gated
  behind it. `resolveMerchantGroup`'s transfer branch got the same direction-swap fix as the
  single-row flow (debit → this account is source, credit → destination), and its description is now
  contextual ("Cash withdrawal" for a cash destination, otherwise "Transfer · `<Account name>`")
  instead of a hardcoded "Cash withdrawal" regardless of target.
- **Cash-withdrawal code data, second pass (2026-08-05, same day).** The initial 7-code, one-per-bank
  seed list was replaced with a much fuller table the user sourced directly (own-ATM / other-bank-ATM
  / branch-withdrawal codes across all 7 supported banks), consolidated in
  `core/bank-import/cashWithdrawalCodes.ts` so a code shared by several banks under the same name
  (ATW, NWD, NFS, EAW, ATM, WDL, ...) lives once in the bank-agnostic group instead of being repeated
  per bank; genuinely bank-unique names (Kotak's ATL, ICICI's MAT/VAT, SBI's ATS, BOB's NFS_WDL/CASH
  DEBIT, HSBC's CWDL/BRANCH CASH) stay per-bank. Two real bugs found and fixed in the same pass:
  1. **Separator tolerance.** A multi-word code like "ATM WDL" only ever matched that literal
     space-separated string — a real statement's "ATM/WDL" (slash) or "ATMWDL" (no separator at all)
     silently failed to match. The matcher now builds each code's regex with a flexible
     `[\s/.-]*` gap between words, so any separator (or none) matches.
  2. **Digit-adjacent boundary.** The original word-boundary check (`[^A-Z0-9]` on both sides) treated
     a directly-adjacent digit as "not a real word boundary," which broke the extremely common
     real-world shape of a reference number butted straight up against the code with zero separator
     (`ATMWDL123456`). The boundary now only blocks on an *adjacent letter* (so `SELF` still can't
     match inside `SELFRIDGES`) — a digit on either side is always an acceptable boundary.
  3. **Exclusion list.** A bare `'ATM'` code (SBI/ICICI/BOB/HSBC's own-bank withdrawal term per the
     table) is real but broad — `isCashWithdrawalNarration` now checks the narration against a small
     exclusion list (REV, POS, AQB, AMB) *before* checking withdrawal codes at all, so an ATM
     transaction reversal ("ATM REV" — a failed withdrawal credited back, not a real one) or a
     balance-maintenance fee narration mentioning ATM never gets misclassified as a transfer.
- Nothing is written until one final "Import" tap — leaving the review screen before that discards
  everything staged; there is no resume/draft (an explicit, deliberate trade-off, matching the
  existing multi-app CSV importer's own lack of one).
- An optional post-import nudge if the statement's own closing-balance column doesn't match what
  Penny computes, pointing to the existing Reconcile action — never auto-corrects anything.

## How it works

A deliberately separate module from the existing multi-app CSV importer (`core/import/`,
`features/import/`) — bank-statement parsing and other-apps'-export parsing evolve independently
by design, so a bug in one can't regress the other.

- **Core logic** (`packages/core/src/core/bank-import/`): CSV tokenizer/parser tolerant of common
  Indian bank date formats (`csvParser.ts`), the 7 bank presets + Custom (`presets.ts`), a
  keyword-stripping merchant-normalization heuristic with a user-overridable escape hatch
  (`normalization.ts`), a one-shot ±3-day matching engine with strict 1:1 pairing, a
  description-similarity tie-break for exact-amount candidates, and a closeness-score ranking +
  singleton-claim rule for close-but-not-exact "possible match" candidates (`matcher.ts` —
  `matchStatementRows` for the initial pass, `deriveLoneWolves` exported separately so the UI can
  recompute lone-wolf status reactively as the user reassigns matches during review; see the
  2026-08-06 tolerance/ranking fix below), merchant-group grouping (`grouping.ts`), a merchant-memory
  lookup derived from prior imports (`merchantMemory.ts`), a payment-mode keyword inferrer
  (`paymentModeInference.ts`), and the account-verification unification
  (`accountVerification.ts` — see "Checkpoint-diff diagnostics UI" below; the old one-shot
  `balanceCheck.ts`/`checkBalanceAgainstStatement()` nudge it superseded was fully removed 2026-08-09).
- **Mobile UI** (`apps/mobile/src/features/bank-import/`): a single `useBankImport.ts` hook owns
  the whole `setup → review → done` step machine and every staged-review mutation (`setup` covers
  bank selection, upload, and mapping review together on one screen, `SetupStep.tsx` — merged from
  3 separate steps on 2026-08-03 feedback); nothing is written to the real vault until the final
  `commitAndImport()`. Reuses the
  shared `ExpenseForm` via a new `statementPreset` prop (locks Amount/Date/Account/Type — reusing the
  form's own real components in a disabled state rather than a separate compact locked-field list, so
  it looks and feels like the normal expense form — leaves Category/Description editable and
  auto-focused, payment mode inferred but still editable) for recording a single new transaction; a
  lighter purpose-built modal (`BulkCategorizeModal.tsx`, not `ExpenseForm`) handles
  bulk-categorizing a merchant group, since only category/description/tags/an optional shared
  Lent-or-Borrowed person are bulk-shared there (Amount/Date/Account differ per occurrence and aren't
  editable in bulk). It deliberately mirrors `ExpenseForm`'s own Tags panel (frequent tags, startsWith
  suggestions, inline Set Aside for a brand-new tag) and Lent/Borrowed panel, including the same
  `ExtraCircle` icon-toggle affordance (extracted from `ExpenseForm.tsx` into
  `components/shared/ExtraCircle.tsx` for reuse) — both panels start hidden and are revealed by
  tapping their icon, which lights up once open or already filled in. Its Description field also
  defaults to a generalized, editable guess (`prettifyMerchantKey()`) derived from the merchant's own
  normalized key when there's no prior-import suggestion yet, instead of starting blank.
  Bulk-categorize was previously a plain text category dropdown and free-text tag field with no IOU
  support at all; both gaps were closed 2026-08-03 per explicit feedback. Hashtag usage-count bookkeeping (and IOU ledger
  entry creation, when a person is filled in) for every staged new transaction — bulk or
  single-row — now happens once, in `commitAndImport()`, resolved against a fresh repo read so the
  same brand-new tag or person across many rows in one batch is created exactly once, not once per
  row (mirrors the existing per-batch payment-mode resolve-once pattern below).
- **Undo (2026-08-06).** `commitAndImport()` logs the batch to the activity log via
  `logActivityAwaited` (switched from the fire-and-forget `logActivity` specifically so the entry is
  guaranteed to exist immediately after commit, matching `core/import/importWriter.ts`'s own
  `writeImportBatch()` pattern) — this closes a real gap: unlike the generic CSV importer (which has
  always had a real `undoImportBatch()`-backed Undo), Bank Statement Import previously had **no undo
  capability at all**. It's now undoable the same way, from **Settings → Timeline**'s plain Timeline
  tab (not just immediately after import) — every not-yet-undone `IMPORT` entry shows an inline Undo
  action, gated behind a confirmation dialog naming the transaction count. See
  [`docs/features/timeline.md`](timeline.md).
- **Persistence**: one new encrypted store, `bank_statement_imports` (`BankStatementImportRecord`
  — raw narration, normalized key, linked transaction id, batch id), serves three purposes: an
  audit trail (an imported transaction's edit form shows "Matched from bank statement: ..."), the
  merchant-memory backing store (queried by normalized key, no second table), and dedup against a
  re-uploaded overlapping-range statement. A second store, `bank_narration_overrides`
  (`BankNarrationOverride`), holds the manual normalization overrides — global across accounts.
  Full field lists in [`docs/SCHEMA.md`](../SCHEMA.md).
- **Payment mode is now a real, creatable, editable entity** (not specific to this feature, but built
  to support it): the `payment_modes` store holds every mode as a real persisted row, including the 5
  built-ins (`isDefault: true`, seeded once via `usePaymentModes()`) — no more read-time merge of a
  hardcoded default list. Manageable from the Accounts page (add/edit/delete, delete blocked for
  defaults and for any custom mode still in use). Bank Statement Import creates a rail-specific mode
  (NEFT/IMPS/RTGS/Cheque) exactly once per import batch, the first time it's actually needed — never
  once per transaction.

**Date-format handling (2026-08-05).** `parseStatementDate` now compiles an explicit token format
string (`DD`, `MM`, `YYYY`, `YY`, `MMM`, with any other character taken as a literal separator — or
none at all, for a concatenated form like `DDMMMYYYY`) into a regex, rather than a handful of
hardcoded shapes. Every `BankPreset.dateFormat` (already written in this exact token grammar, e.g.
`'DD/MM/YY'`, `'DD MMM YYYY'`) is now the actual parsing directive, not just a display label — the
separate `dateOrder: NumericDateOrder` field this session briefly added (a narrower day-first/
month-first toggle covering only one numeric shape) was removed the same day after direct user
feedback: real statements vary far more than that, and a fixed 2-option choice was "totally wrong"
for e.g. a `DD-MM-YY` or no-separator `DDMMMYYYY` export. For the Custom preset, `detectDateFormat()`
tries a prioritized list of common real-world shapes against the chosen date column's actual values
and keeps whichever ones every sample fits — confident only when exactly one candidate fully
explains the file. The mapping popup shows the result in a free-text field (not a fixed set of
choices) right next to the Date field, pre-filled and editable, with a low-confidence flag instead of
silently trusting a guess — and the same format now also shows inline on the collapsed mapping
summary card ("Date (DD/MM/YYYY)"), not just inside the edit popup. Day/month are still range-checked
regardless of format, so a mismatched format rejects the row instead of producing a wrong date.

**Mapping-preview prominence + diagnosability (2026-08-06).** The row-count/date-range readout under
the mapping summary card was a single `text-xs text-tertiary` caption — barely visible, and a 0-row
outcome (e.g. a wrong date format silently rejecting every row) looked visually identical to a healthy
one, just with different numbers, with no explanation of *why*. Now a real `Banner`: `info` (row count +
date range as the bold headline) when anything parsed, `warning` when nothing did — surfacing the
*first* row's actual rejection reason from `parseStatementRows`'s `RejectedStatementRow.reason` (already
computed by the parser, just never shown beyond an aggregate count before) and pointing at the current
date format specifically, since a mismatch is the overwhelmingly likely cause. "Continue to review" is
now also disabled when the mapping produces zero usable rows (previously gated only on every field being
*mapped*, not on the mapping actually producing anything).

**"Frequent" categories missing from the category picker (2026-08-06).** `CategoryPickerModal`'s
"Frequent" quick-pick row reads usage counts off `manager.txnCountByCategory` — but every bank-import
call site (`BulkCategorizeModal`, and `ExpenseForm` as used from `PossibleBucket`/`LoneWolfBucket`)
deliberately omits the full `CategoryManager` (no category create/edit/delete needed there), so it
silently fell back to an always-empty count map and "Frequent" never rendered in any bank-import
context. Fixed by adding a standalone `txnCountByCategory` prop to both `CategoryPickerModal` and
`ExpenseForm` — independent of `manager`, so a select-only caller can opt into frequency sorting without
taking on full category management. `useBankImport.ts` computes a real count map from `allExpenses` once
(`bi.txnCountByCategory`) and threads it through all three bank-import call sites.

- **Excel (.xlsx/.xls) import (2026-08-05, issue #4, first half).** `core/bank-import/xlsxParser.ts`'s
  `parseXlsxToGrid()` (built on the `xlsx`/SheetJS library, already a `packages/core` dependency but
  previously unused) reads a workbook's first sheet into the exact same `string[][]` grid
  `tokenizeCsv()` produces for a CSV — every downstream piece (column mapping, date-format detection,
  the whole review pipeline) is already format-agnostic once it has that grid, so an Excel upload
  needs zero special-casing past `useBankImport.ts`'s new `importFromXlsx()`. `SetupStep.tsx`'s file
  picker now accepts both CSV and Excel mimetypes, routing by the file's own extension (not mimeType —
  some Android content-provider URIs report a generic type regardless of the real file). Cells are
  read with `raw: false` so a date/number cell comes through formatted as display text, same as a CSV
  export already is — a genuine Excel date cell becomes a real date string, not a raw serial number.
  No delimiter concept applies to an already-parsed workbook (`MappingEditModal`'s delimiter picker
  hides itself via the new `isXlsxSource`). Verified the `xlsx` package bundles cleanly under Metro (a
  real risk for a large, previously RN-untested library) via a full `expo export --platform android` —
  succeeded, 8520 modules, no resolution errors.

**"Possible match" amount tolerance tightened + ranking/exclusivity fix (2026-08-06).** Real
user-reported bug: statement rows spanning ₹1,162–₹2,418 were all offered as "possible matches" for
the same recorded expense at ₹2,392 — the old tolerance (₹10 or 2%, whichever was larger) was wide
enough to cover differences of ₹24–48, which are clearly distinct transactions, not the same one with
a minor rounding/rate difference. `isCloseAmount()` (`matcher.ts`) is now tuned to ₹2 or 0.5%,
whichever is larger — still catches genuine minor differences (currency-conversion rounding, a
recorded estimate vs. the actual settled amount) without letting distinct transactions through. The
`close` bucket in `matchStatementRows`'s main loop also had no scoring at all (unlike the `exact`
bucket's description-similarity tie-break): candidates are now sorted by a combined closeness score
(amount-diff ratio + a heavily down-weighted date-diff-in-days term, so date only tie-breaks between
otherwise-similar amounts) via a new `closenessScore()` helper, so the array position genuinely
reflects closeness rather than pool order. When a row has exactly one close candidate (an unambiguous
"closest guess," not one of several tied options), that candidate is now claimed the same way an
exact match is — preventing it from being silently offered as a second row's own "closest guess"
without the user ever seeing that it's actually ambiguous across two rows. Tied (2+) close candidates
deliberately stay unclaimed, since that ambiguity is already surfaced to the user as a "N possible"
choice — the rare case where one recorded expense could legitimately answer either of two statement
rows is still resolvable manually via the picker.

**Amount tolerance removed entirely from "possible match" identification (2026-08-06, follow-up to
the tightening above).** Per explicit user decision: even the tightened ≤0.5%/₹2 tolerance above was
still the wrong shape of fix — a "possible match" should never be based on a merely close amount, only
an exact one (the ±3-day date window stays a tolerance; amount does not). `matchStatementRows`' `close`
bucket (and its `closenessScore()` helper) were removed outright — a statement row with no
exact-amount candidate in its date window now goes straight to `unmatched`, full stop. `isCloseAmount()`
still exists but is now used only by the separate, much softer `suggestPossibleTransfer()` heuristic
(unrecorded-transfer-leg suggestions, a distinct dismissible-suggestion feature — not touched by this
change; flag if that one should also lose its tolerance). "Possible matches" now only ever arise from
an exact-amount candidate that's ambiguous (a same-day tie, or no clear description-similarity winner)
— see the bucket description above.

**Payment-mode mismatch flag (2026-08-06).** The Matched bucket (`MatchedBucket.tsx`) now compares
each confirmed pair's statement-row-implied payment mode (via the existing `inferPaymentMode()`,
previously only used for newly-created transactions) against the already-recorded expense's own
`paymentMode`. When they differ, a small inline `theme.warning`-colored note appears under the
"Recorded" side of that pair's tile (e.g. "Statement suggests UPI · recorded as Cash"), matching the
warning-tone inline-note convention already used elsewhere in this feature (`LoneWolfBucket.tsx`).
This is purely informational — nothing is auto-corrected, commit is never blocked, and the database
write is unchanged; the user decides manually whether the recorded mode needs fixing. Skipped
entirely for an older expense with no recorded payment mode at all (nothing to compare against).

**Reassign picker now highlights the current match; correction + persistent surfacing added
(2026-08-06).** Three follow-ups from user feedback on the above:
1. `PossibleMatchPickerModal.tsx` (opened via "Disagree with a match? Tap any pair to re-choose" in
   `MatchedBucket.tsx`) previously opened with nothing highlighted, even though it's replacing an
   already-linked expense — a new `currentlyMatchedId` prop (distinct from `suggestedIds`, bucket 2's
   own "closest guess" highlight) now floats the currently-matched expense to the top with a "Currently
   matched" badge, mirroring "Suggested"'s treatment.
2. **How to actually correct a flagged mismatch**: rather than adding a new fix action to this review
   screen (which is about *matching*, not editing), the fix lives where editing already happens —
   `ExpenseForm`'s pre-existing "Matched from bank statement" audit-trail note (see
   `docs/features/expenses.md`'s Import section) now shows the same mismatch comparison directly above
   the "Paid via" payment-mode picker, re-derived live off the form's current `paymentMode` state — so
   picking a different chip makes the warning disappear immediately, no separate "mark as fixed" step.
3. **Persistent surfacing past the one-time review**: this is no longer scoped to the import review
   screen or the edit form alone — see `docs/features/expenses.md`'s Transactions-list section for the
   permanent, derived (never persisted) surfacing added to the main Transactions tab and its filter.

## Balance sync (2026-08-09 — all 8 stages, 0–7, built; plan fully implemented)

Full design: [`docs/plans/bank-balance-sync.md`](../plans/bank-balance-sync.md). Turns a bank
statement's own balance column into a permanent, per-transaction checkpoint instead of a one-shot
end-of-import nudge, and tracks each import batch's own coverage so gaps/skips are visible rather
than silent. Built so far:

- Every matched/new transaction from a `bank`-type account's statement (with a mapped Balance
  column) gets `Expense.statementBalance` attached — ground truth, never recomputed. A matched
  pair's date (and, when it differs, amount) is corrected to the statement's own value on commit.
  A checkpointed transaction is permanently excluded from any *other* import's fuzzy-match
  candidate pool (two-tier matching: an exact prior-import lookup always runs first).
- Every completed statement-import batch (any account type — `bank` or `credit_card`) records an
  `ImportBatchSummary` on `Account.coveredStatementRanges`: the file's own actual date range, and
  matched/added/skipped counts (+ which rows were skipped) — durable, not just a one-time review
  tally. Powers a gap-detection banner at import time (advisory, never blocking), the post-commit
  summary card, and a new **Import History** screen (`AccountsPage`'s header, next to Merchant
  recognition/Cash-withdrawal codes) listing past batches with a per-batch detail drill-in.
- A Penny transaction near a statement's own boundary that the statement doesn't explain gets a
  soft "provisional" status rather than an immediate flag, escalating only once an adjacent
  period's import has also failed to explain it (`LoneWolfBucket.tsx`).
- **Closed-loop sweep** (plan §3 decision #16, hardening Stage 2): the above `'provisional'`/
  `'escalated'` status only ever runs live, during one specific import's own review screen — nothing
  re-checked a lone wolf left `'provisional'` once an adjacent statement was later imported, unless the
  review screen happened to be revisited. `findStandingCoverageGaps()`
  (`core/bank-import/coverage.ts`) re-derives the full picture instead: any expense dated inside the
  union of an account's own covered statement ranges with no `BankStatementImportRecord` link at all is
  a standing gap, recomputed fresh from the account's whole history every time, not just the current
  import. Shown two places now: a warning banner at the top of the **Import History** screen's batch
  list (kept — still useful in that screen's own narrower context of browsing one account's import
  batches), and, since Stage 4, folded into the account-level "unverified" badge/banner below as one
  of its three unified signal sources — never two separate, competing indicators.

**Opening-balance confirm + anchor-shift (Stage 3, built 2026-08-09).** `bank`-type accounts only
(§3 decision 1/§16 Finding 2, same gate as checkpoint attachment). Trigger logic and the confirm/
anchor-shift screens both live on `SetupStep.tsx`, right where "Continue to review" sits — see
`docs/mockups/proposals/bank-balance-sync-v2.html` §5/§6 for the exact spec:

- **First-ever import** (`Account.coveredStatementRanges` empty — about statement-import history
  specifically, not whether the account has any transactions at all): prompts to confirm the opening
  balance, prefilled from the statement's own first row when it has a mapped Balance column
  (`suggestedOpeningBalance = firstRow.balance − signedAmount(firstRow)`), pure manual entry
  otherwise. Never auto-applied — the prompt always requires an explicit tap to proceed, even when
  prefilled. `Account.openingBalanceAsOfDate` is set to the same calendar day as that first
  transaction (not "the day before" — bank statements have no finer granularity, and "as of &lt;date&gt;"
  is read the standard accounting way: the balance held at the very start of that day, before that
  day's own transactions post).
- **Anchor-shift** (a later import's own date range starts earlier than the account's current
  effective anchor — `openingBalanceAsOfDate` if set, else the earliest existing covered range's own
  start): derives what the new, earlier anchor implies, then runs a disagreement check — projects
  forward from the new anchor across every transaction between the two anchor dates and compares the
  result to the OLD `openingBalance` (±₹1 tolerance). **Agrees (§14a)**: a single-button confirmation,
  the anchor moves to the new value/date, nothing else changes. **Disagrees (§14b)**: a three-choice
  screen, never auto-resolved — "Review the new import's rows first" (proceeds with no anchor change),
  "Accept — shift by ₹X" (trusts the backfill, moves the anchor, shows its own follow-up confirmation
  frame before continuing), or "Keep the original, flag for later" (persists
  `Account.anchorReference`, now surfaced by Stage 4's unified badge below). **Redesigned 2026-08-09**:
  every branch — not just "Accept" — now always moves the anchor DATE to the new, earlier date at
  commit time; only the anchor VALUE differs by choice ("Keep"/"Review rows first" use
  `backDerivedOpeningBalance()` to keep the OLD anchor's own value reproduced exactly). Previously,
  "Keep"/"Review" left the date pinned at the OLD, later date while committing transactions dated
  before it — silently double-counting the whole backfilled period on top of the kept balance (found
  via on-device testing). `Account.anchorReference` itself now stores ONLY the immutable historical
  fact (`{oldOpeningBalance, oldAnchorDate, detectedAt}`) — the comparison against it is always
  recomputed LIVE (`recomputeAnchorAgreement()`), fixing a second on-device bug where a later
  corrective import that actually fixed the ledger left a stale disagreement showing forever.
- Core logic: `packages/core/src/core/bank-import/openingBalanceAnchor.ts` (`isFirstEverImport`,
  `isAnchorShiftImport`, `currentAnchorDate`, `deriveOpeningBalanceSuggestion`,
  `computeAnchorShiftCheck`) — pure, reuses `balanceCalculator.ts`'s own `delta()` rather than
  reinventing debit/credit sign math.
- **Known, explicitly out-of-scope-for-Stage-3 limitation**: the disagreement check above is narrow
  and self-contained (just the two anchor points) — it does NOT implement §10b's general "recompute
  every checkpoint after any retrospective import" rule; Stage 4's diagnostic engine (below) always
  recomputes fresh from the account's whole history on every read instead, so this is a non-issue in
  practice — nothing needs to explicitly "re-run" anything, there's simply nothing stale to re-run.

**Checkpoint-diff diagnostics UI (Stage 4, built 2026-08-09).** `bank`-type accounts only
(`CHECKPOINT_ELIGIBLE`, `useAccountVerification.ts`) — mockup `bank-balance-sync-v2.html`'s Direction
C, built exactly as spec'd (4 connected frames + the badge):

- **Diagnostic engine** (`core/bank-import/checkpointDiagnostics.ts`, `computeCheckpointDiagnostics`):
  walks an account's own transactions chronologically (day-bucketed per §7e — same-day checkpoint
  clusters compare only at end-of-day, never mid-day), comparing Penny's derived running balance
  against every `Expense.statementBalance` checkpoint. Classifies a mismatch as `'steps-partway'`
  (an agreeing checkpoint existed before the gap — look between the last-agreeing/first-disagreeing
  pair for one missing/duplicate transaction) or `'flat-from-start'` (no checkpoint ever agreed, not
  even the first — check the opening balance instead). Tested against the simulation's own §7a/7b/7c/7d
  numbers as exact regressions.
- **Unifying three signal sources into ONE badge** (`core/bank-import/accountVerification.ts`,
  `computeAccountVerificationStatus`) — decision #9's "never three competing indicators" resolved by
  checking all three (this stage's own checkpoint mismatch, Stage 2's `findStandingCoverageGaps()`
  sweep, Stage 3's live-recomputed `Account.anchorReference` disagreement) and picking ONE `activeFinding` to show, in priority
  order checkpoint-mismatch > anchor-disagreement > standing-gap (most-actionable first; a documented
  judgment call, not a spec'd order). Each finding still carries its own kind-specific copy (the
  mobile-side `verificationCopy.ts`) rather than forcing all three into identical wording.
- **Dismiss, scoped to the specific finding** (`Account.dismissedVerificationFindings`, new field): a
  stable fingerprint per finding (which checkpoint pair / which standing-gap expense set / which
  anchor-disagreement event) — dismissing one never silences a later, different finding, even on the
  same account. "Re-open" removes one specific dismissal.
- **UI**: the persistent badge on `AccountList.tsx`'s bank-account rows; the account-detail snapshot
  banner (`AccountVerificationBanner.tsx`, wrapped by `AccountDetailModal.tsx` around the existing
  `EntityTransactionsModal`) in all 6 mockup states (loading/verified/never-imported/mismatch-collapsed/
  mismatch-expanded/dismissed); a transaction-list drill-in (new `checkpointHighlight` prop on
  `TransactionsTab.tsx`) highlighting the exact last-agreeing/first-disagreeing pair for a
  `'steps-partway'` mismatch; and two new full-screen destinations — `CheckpointTimelinePage.tsx` (the
  full ledger-style escape hatch, branching per signature) and `CheckOpeningBalancePage.tsx` (the
  "check your opening balance" destination for `'flat-from-start'` mismatches and anchor disagreements
  alike — "one status slot, two possible causes").

**Two fixes made post-build (2026-08-09)**: (1) `'flat-from-start'` gained the same "View full
reconciliation table" secondary escape hatch into `CheckpointTimelinePage.tsx` that `'steps-partway'`
already had — added to `CheckOpeningBalancePage.tsx` itself, alongside its existing primary actions
(later extended to anchor-disagreement findings too, see the "two self-consistent halves" entry below).
(2) `classifyMismatch()` now
verifies a `'flat-from-start'` diff actually stays constant across every later checkpoint, not just at
the first one — a new `CheckpointMismatch.diffStaysConstant?: boolean` field (`'flat-from-start'` only)
surfaces the honest caveat "the gap size also changes later on, so there may be more than one issue"
when it doesn't, in both `verificationCopy.ts` and `CheckOpeningBalancePage.tsx`. No new signature
category — still exactly `'flat-from-start'`/`'steps-partway'`. See plan §7 Stage 4 for the full
write-up.

**Three more bugs found + fixed via real on-device testing (2026-08-09)** — see plan §7 for the full
root-cause write-up:

1. The standing-gap sweep was flagging 100% of a batch that had just successfully imported, because
   `useAccountVerification.ts`'s `useRepository(bankStatementImportsRepo)` — mounted on the persistent
   `AccountsPage`, which never unmounts while `BankImportPage` is pushed on top of it — had no way to
   learn a commit had just written new provenance records, unlike every sibling repo it reads
   (`accounts`/`txns`), which already had a notify/refresh pair. Fixed by adding
   `notifyBankImportsChanged()`/`useBankImportsRefresh()` (`useDataRefresh.ts`/`.native.ts`), the same
   shape as the four existing pairs.
2. The standing-gap drill-in mislabeled every flagged transaction "First disagreeing" — a
   checkpoint-mismatch-only term it was borrowing from the shared `CheckpointRowMark` badge. Fixed by
   giving the standing-gap case its own mark (`'gap'`, labeled "No matching statement line").
3. `DoneStep.tsx` still showed the old, pre-Stage-4 one-shot "Reconcile now ›" nudge, which was supposed
   to have been fully retired once Stage 4's persistent badge shipped (see "Finding 1" in the plan's
   mockup-decision log) — removed outright, along with the now-fully-dead
   `balanceCheck.ts`/`checkBalanceAgainstStatement()` it called.

**"Two self-consistent halves, one explicit boundary marker" — anchor-disagreement redesign (2026-08-09,
found via on-device testing, see `docs/plans/bank-balance-sync.md`'s dated 2026-08-09 entry for the full
write-up)**. Two bugs, both in the anchor-shift disagreement mechanism:

1. `Account.anchorDisagreement` was a frozen, once-computed snapshot (`{detectedAt, oldOpeningBalance,
   oldAnchorDate, impliedOldBalance, diff}`), written once at import-commit time and never re-derived —
   unlike a checkpoint mismatch, which is fully recomputed live every call. Confirmed on-device: chose
   "Keep original, flag" on a disagreeing anchor-shift, later re-imported a corrected statement that
   fixed the actual ledger error — the account kept showing the stale, now-wrong disagreement forever.
2. Separately, regardless of which §14b choice was made ("Accept", "Keep, flag", "Review rows first"),
   only "Accept" actually moved `Account.openingBalanceAsOfDate` back to the new, earlier anchor date —
   the other two left it pinned at the OLD, later date while committing transactions dated before it,
   silently double-counting the whole backfilled period on top of the kept opening balance
   (`computeBalance()` sums ALL transactions regardless of date).

**Fix**: `Account.anchorDisagreement` renamed to `Account.anchorReference`, now storing ONLY the
immutable historical fact (`{oldOpeningBalance, oldAnchorDate, detectedAt}`) — the comparison against it
is always recomputed LIVE (`openingBalanceAnchor.ts`'s `recomputeAnchorAgreement()`, called from
`accountVerification.ts`), so a later corrective import makes the finding disappear on its own. Every
§14b choice (and the first-import/§14a paths) now always moves the anchor DATE to the new, earlier date
at commit time; only the anchor VALUE differs by choice — `backDerivedOpeningBalance()` for "Keep"/
"Review rows first" (algebra on the existing `AnchorShiftCheck`, reproducing the OLD anchor's own value
exactly when projected forward). `apps/mobile/src/features/bank-import/types.ts`'s
`PendingOpeningBalanceUpdate` collapsed from a `'move'`/`'pin'` discriminated union to one flat shape
(every branch now always sets both fields; an optional `reference` marks a still-open disagreement).

`CheckpointTimelinePage.tsx` extended (mockup `bank-balance-sync-v3.html`'s "#optiond") to render an
`AnchorBoundaryDivider` row at the account's `anchorReference.oldAnchorDate`, splitting the SAME single
`computeCheckpointDiagnostics()` timeline into two labeled sections ("Before … (this backfill)" / "…
onward (already verified)") rather than two separate table cards — since the anchor date fix means one
continuous walk already spans both periods correctly. The divider shows a live "Update"/"Keep" pair when
still disagreeing (reusing the same underlying actions as `CheckOpeningBalancePage.tsx`, extracted into
a new shared `useOpeningBalanceResolution.ts` hook), or a compact "✓ resolved" line once a corrective
import fixes the gap. The "View full reconciliation table" escape hatch (`AccountDetailModal.tsx`,
`CheckOpeningBalancePage.tsx`) now also gates on `'anchor-disagreement'`, not just
`'checkpoint-mismatch'`.

**Full Ledger (built 2026-08-10 — `docs/plans/bank-reconciliation-ledger.md`).**
A second, deeper zoom level on top of `CheckpointTimelinePage.tsx`'s sparse checkpoint-only table —
that page gains a "View full ledger ›" action (shown only in its all-clear, fully-verified state) into
a new `FullLedgerPage.tsx`: a dense, row-by-row Statement ⟷ Expense reconciliation for a bounded,
continuously-growing date window (60-day chunks, "Load earlier transactions" extends the same list
rather than swapping windows, pinned to "now" as of when the screen opened — never pages into the
future). Core: `core/bank-import/ledger.ts`'s `buildLedgerRows()`. One row per transaction the
statement OR the app's own records contain, classified into four kinds:
- `'matched'` — a statement line and its linked `Expense`, side by side. Tap to open "Fix this match":
  **relink** ("This isn't the right match" — reuses `PossibleMatchPickerModal` to pick a different
  existing expense, correcting it to the statement via `reconcileMatchedExpense`) or **unmatch**
  (pulls the pair apart; the `Expense` stays exactly as recorded, and the statement line's own facts
  are appended back to its original batch's `skippedRows` — nothing is ever deleted, the row just
  reappears as an ordinary unresolved one). Core: `core/bank-import/ledgerActions.ts`'s
  `relinkLedgerRow`/`unmatchLedgerRow`.
- `'skipped-unresolved'` — a statement line still sitting in an old batch's `ImportBatchSummary.
  skippedRows` snapshot with no linking `Expense` yet. **Reverses that field's original "read-only,
  never re-parsed/re-actionable" design** (§11a) — checked live at render time (via
  `normalizeNarration()`, never a stored link) against every import record the account has, so a later
  corrective re-import that actually resolved the row makes it disappear from here on its own, without
  ever touching the original batch's own historical snapshot. Tap to open "Resolve this statement
  line": **pick the matching transaction** (an already-recorded expense that was just never linked —
  `resolveSkippedRowToExisting`, reuses the row's own original `batchId` for the new
  `BankStatementImportRecord` rather than inventing a synthetic marker), **add as a new transaction**
  (opens `ExpenseForm` with a `statementPreset`, same path bucket 3's live "add as new" uses — known,
  accepted gap: doesn't route through `useExpenses.ts`'s `saveExpenseWithHashtags`, a
  `features/expenses/`-scoped hook off-limits to `features/accounts/`, so it skips hashtag/merchant-
  memory learning; it does still call `logActivity()` directly), or **dismiss** ("not mine, stop
  flagging this" — `Account.dismissedSkippedRows`, same fingerprint-scoped convention as
  `dismissedVerificationFindings`).
- `'anomaly'` — a recorded `Expense` with no statement link, dated inside a period the account's own
  `coveredStatementRanges` claims is fully covered (reuses `findStandingCoverageGaps()`'s own
  coverage-union logic directly). A genuine "the bank has no record of this" flag. No action of its
  own — resolving its real statement-side counterpart (a `'skipped-unresolved'` row elsewhere in the
  window) via "Pick the matching transaction" and choosing this expense links them and the row
  disappears on its own.
- `'not-covered'` — a recorded `Expense` with no statement link, dated OUTSIDE any imported statement's
  range. Not an anomaly — rendered as "Statement not imported for this period," softer/muted. Same
  no-action-of-its-own reasoning as `'anomaly'`.

All action menus are a centered `Modal` (`docs/DESIGN_GUIDELINES.md`'s non-negotiable "centered
modals, never bottom sheets" rule) — the phase-2 mockup's own bottom-sheet chrome was corrected during
implementation, only its options/content carried over. No drag-to-reorder (same-date ties fall back to
a stable tiebreaker); the two-errors-cancel-out blind spot (§10c) is explicitly unaffected by any of
this — nothing here closes it, by design.

**Intra-day sequencing (Stage 5), inter-account-transfer refinements (Stage 6), and the
cash-withdrawal retroactive-transfer prompt (Stage 7, the final stage) are also built** — see plan §7
for the full per-stage write-up of each. Stage 7 specifically: a statement row carrying a
cash-withdrawal narration code that *matches* an already-existing plain expense (rather than building
a new one) now gets the same "looks like a transfer to your cash account — convert it?" suggestion,
surfaced as a small dismissible chip on that row in the Matched bucket (`MatchedBucket.tsx`).
Accepting it sets the expense's own `type` to `'transfer'` and `toAccountId` to the chosen cash
account, leaving its description/category/amount/date untouched — closing the exact gap simulation
§17 Finding 1 named (both ATM-withdrawal rows in that scenario matched an already-existing plain
expense, so the cash-withdrawal detector never got a chance to fire, permanently under-crediting the
linked cash account). Core: `suggestRetroactiveCashTransfer()`/`applyCashTransferConversion()`
(`core/bank-import/cashWithdrawalCodes.ts`).

## Limitations

- PDF import is deferred (issue #4, second half) — text-layer extraction only, no OCR/scanned-PDF
  support, consistent with Penny's zero-server privacy model. Not yet designed.
- Detecting duplicate/glitched lines *within the same uploaded file* is out of scope.
- No dedicated balance-*correction* mechanism — the balance-sync work above verifies a bank account's
  balance against its own statement checkpoint by checkpoint, but never auto-corrects (by design); the
  existing Reconcile feature remains the manual fallback for any residual drift,
  and credit cards are out of scope for checkpointing entirely (inverted sign convention).
- No resume/draft for an abandoned review session, by deliberate design (see above).
