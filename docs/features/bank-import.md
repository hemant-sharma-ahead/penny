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
- One merged setup screen (`SetupStep.tsx`, 2026-08-03 — was 3 separate steps): pick a bank from a
  dropdown (HDFC, ICICI, Kotak, SBI, IndusInd, HSBC, Bank of Baroda, or Custom — a dropdown rather
  than a tile grid since the preset list can grow), upload a CSV, then review the resolved column
  mapping inline as a small card (Date/Narration/Debit/Credit/Balance → the file's real headers),
  with a single "Edit mapping" action opening one popup with every field editable together.
- A four-bucket review screen:
  1. **Matched** (confident, exact-amount) — collapsed by default, shown as a paired tile
     (statement line + recorded line); any pairing can be manually reassigned by tapping it.
  2. **Possible matches** (close-but-not-exact amount, or an ambiguous tie) — shown as the same
     paired-tile style as Matched (amber/dashed instead of green/confident), with the closest guess
     (or a "N possible" count when tied) on the right half. A picker modal (±3 days by default,
     widen range / whole month / search) resolves each one, highlighting the matcher's own
     suggestion(s) with an amber border and a "Suggested" badge; besides picking a match, it also
     offers "No match — add as new" (opens the statementPreset `ExpenseForm`) and a separate "Move to
     'Not yet logged' for later" action.
  3. **Not yet logged** — grouped by merchant with checkboxes (all checked by default); bulk-apply
     one shared category/description/tags/optional Lent-or-Borrowed person to the checked
     occurrences (payment mode is inferred independently per line, never shared across the group);
     unchecked ones stay for a second pass. Each group is independently collapsible, and every row
     shows its narration and amount (red for spend, green for income), not just date and amount.
  4. **Recorded, not in statement** ("lone wolves") — a logged transaction with no statement
     counterpart at all; keep, edit, or delete, at your discretion. One near the statement's own
     date-range edge is flagged softly (may genuinely belong to an adjacent statement).
- A global "Merchant recognition" screen (also from the Accounts page) to add manual normalization
  overrides — e.g. teach Penny that a cryptic statement line always means a specific merchant. A
  read-only "How automatic recognition works" card explains the fixed underlying heuristic (and lists
  its current keyword list) alongside the editable overrides — added 2026-08-03 so the algorithm isn't
  a total black box next to your own overrides.
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
  (`normalization.ts`), a one-shot ±3-day matching engine with strict 1:1 pairing and a
  description-similarity tie-break (`matcher.ts` — `matchStatementRows` for the initial pass,
  `deriveLoneWolves` exported separately so the UI can recompute lone-wolf status reactively as the
  user reassigns matches during review), merchant-group grouping (`grouping.ts`), a merchant-memory
  lookup derived from prior imports (`merchantMemory.ts`), a payment-mode keyword inferrer
  (`paymentModeInference.ts`), and the balance-mismatch check (`balanceCheck.ts`).
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

## Limitations

- CSV only for v1 — Excel and PDF are deferred, no parsing mechanics designed yet.
- Detecting duplicate/glitched lines *within the same uploaded file* is out of scope.
- No dedicated balance-correction mechanism — getting transactions right via matching keeps the
  (always-derived, never-stored) balance right as a side effect; the existing Reconcile feature is
  the fallback for any residual drift.
- No resume/draft for an abandoned review session, by deliberate design (see above).
