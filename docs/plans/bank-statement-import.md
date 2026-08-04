# Bank Statement Import — Consolidated Requirements

Status: **fully discussed and scoped, not yet designed or implemented.** This document is
self-contained — written so a fresh session with no other context can pick it up and know
what to build, where, and how. Next step after this doc is mockups (`docs/mockups/proposals/`),
then implementation, following this repo's standard mockup-first workflow
(`.claude/skills/ui-design-check/`, `docs/DESIGN_GUIDELINES.md`).

## 1. Why this feature exists

Penny currently supports manual expense/income/transfer entry, and (documented as a future,
not-yet-built, Android-only idea) SMS-based auto-detection. Neither guarantees full coverage of
a bank account's real transaction history — manual logging can be missed, SMS can fail to
arrive. RBI Account Aggregator sync is a documented **Phase 3** idea (gated on more Financial
Information Providers joining that framework) and isn't usable today.

The fallback: let the user upload their own bank statement. Penny parses it, compares every
statement line against what's already logged for that account, and presents a review screen so
missed transactions can be added, and stray/duplicate/erroneous logged transactions can be
caught too. This is conceptually similar in spirit to (but architecturally **separate** from —
see §3) the existing "Import transactions from other apps" feature.

## 2. Scope

- **File formats**: CSV, Excel, PDF — in that priority order. **Build CSV only for v1.** Excel
  and PDF are explicitly deferred; no parsing mechanics have been designed for either yet.
- **Transfers between the user's own tracked accounts are in scope for v1** (not deferred) —
  see §5's transfer handling.
- **Out of scope, explicitly decided:**
  - Detecting duplicate/glitched lines *within the same uploaded statement file* (bank export
    glitches, a genuine double-charge appearing twice in one file) — not a v1 concern.
  - Setting or correcting an account's opening balance as a dedicated mechanism — see §11.
  - Resuming an in-progress review after leaving/closing it — see §10.

## 3. Where this lives in the app

- **Per-account entry point**: the Accounts page, on each account's row — alongside the existing
  Edit / Delete / Reconcile Balance / See Transactions actions, add a new **Import** action.
  Statement import is inherently scoped to one account (a bank issues one statement per
  account), so this is the natural, only entry point for the actual import flow. See
  `apps/mobile/src/features/accounts/AccountList.tsx` for the existing per-row action pattern to
  extend.
- **A second, separate, global entry point** (also reachable from the Accounts page, e.g. a
  header/overflow action — exact placement is a mockup decision) for the **normalization
  override management screen** (§9) — this is global (not per-account), since merchant memory
  and the normalization layer apply across every account.
- **New feature module**: this should NOT live inside or share code with
  `apps/mobile/src/features/import/` (the existing multi-app CSV import) — see §4 for why. A
  new sibling module (e.g. `apps/mobile/src/features/accounts/statementImport/` or a top-level
  `apps/mobile/src/features/statementImport/` — naming is an implementation decision) is the
  right shape.

## 4. Parsing — deliberately a separate module

**Do not share or extend the existing Import feature's parser** (`packages/core/src/core/import/`,
`apps/mobile/src/features/import/`). This was an explicit decision: keeping bank-statement
parsing fully separate from the other-apps CSV importer means each can evolve independently
(bank formats change; other apps' export formats change) without one change risking regressions
in the other, and bugs stay isolated to the system they belong to.

- **Per-bank column-mapping presets**, editable by the user, plus a configurable delimiter for
  CSV. This avoids needing fuzzy/heuristic column detection — the mapping is either a known
  preset or a user customization.
- **Initial preset list (confirmed)**: HDFC, ICICI, Kotak, SBI, IndusInd, HSBC, Bank of Baroda.
- A custom/manual column-mapping mode should remain available as a fallback for any bank
  without a preset (mirrors the existing Import feature's own `'custom'` mode, conceptually —
  but implemented independently per the separation above).

## 5. Matching engine

For each statement line, look for a candidate among the account's already-recorded transactions:

- **Candidate window**: ±3 days of the statement line's date.
- **Exact amount match required for a confident/auto match.** A close-but-not-exact amount is
  **never** auto-accepted — it becomes a "possible match" needing explicit confirmation (§6,
  bucket 2).
- **Same-day match is prioritized** over a match on a different day within the window.
- **Strict 1:1 pairing**: one recorded transaction can be claimed by at most one statement line,
  and one statement line can claim at most one recorded transaction. No double-claiming in
  either direction.
- **Ambiguity resolution** (multiple candidates tie on same day + same exact amount): use
  description similarity as a **ranking/tie-break signal only** — bank narration vocabulary and
  the user's own logged description rarely match verbatim, so this must be a loose/token-level
  similarity (e.g. shared substring/merchant-name overlap), not exact-string comparison.
  - If one candidate clearly scores highest → treat as the confident match.
  - If scores are tied or all candidates are too generic to distinguish → do **not** guess.
    Surface every tied candidate in "possible matches" for manual choice.
- **"Lone wolves"**: a recorded transaction for this account, dated within the statement's
  covered date range, with **no** statement counterpart at all. Surface as its own bucket (§6,
  bucket 4) — could be a duplicate entry, a mis-logged account, or a real error.
  - **Exclude "Balance reconciliation" synthetic entries** from lone-wolf detection and from
    matching candidacy generally — Penny's Reconcile feature posts a marked adjustment
    transaction (`RECONCILIATION_DESCRIPTION` constant in
    `packages/core/src/core/expenses/cashFlowSummary.ts`) that is not a real bank-side event and
    would otherwise always false-flag.
  - **Statement date-range edge effect**: a recorded transaction within a few days of the
    statement's start/end boundary might genuinely belong to an *adjacent* statement (settlement
    lag) rather than being truly missing. Flag these softly ("near the edge of this statement's
    range — may appear in an adjacent one"), not as a confident duplicate/error.
- **Transfers**: a statement line may represent money moved between two of the user's own
  tracked Penny accounts. This needs:
  - Matching against existing `type: 'transfer'` records, checking either `accountId` or
    `toAccountId` equal to this account (not just expense/income records).
  - When recording a new, unmatched transfer-type line (§7), the form must also capture the
    other side of the transfer (destination or source account) — not just category/description.
- **Manual override of *any* pairing, including confident "Matched" ones** — the user can
  disagree with an auto-match (not just a "possible match") and pick a different transaction via
  the same picker (§6, bucket 2's modal). **If the newly-picked transaction is already claimed
  by a different statement line, trust the user**: create the new link and remove the other
  statement line's previous association. That bumped statement line reverts to unresolved and
  re-enters the normal review flow (no automatic attempt to find *it* a replacement match).

## 6. Review UI — four buckets

Guiding principle for all four: **never silently hide or silently decide something uncertain.**
Every ambiguous case is surfaced for explicit user confirmation.

1. **Matched** (confident — exact amount, within window). Shown as a paired tile (statement
   line + recorded line together), styled like the existing Expenses Transactions tab's own
   transaction tile, so the pairing is visually verifiable at a glance. **Collapsed by default**
   (e.g. "✓ 42 already logged — tap to review") — a real statement can run 100–300+ lines and
   this bucket needs no action by default — but never hidden, always expandable. Supports the
   manual-override picker described in §5.
2. **Possible matches** (close-but-not-exact amount, or ambiguous same-day/same-amount ties).
   Expanded by default — needs a decision. Resolved via a picker modal, adapted from the existing
   "Link existing" pattern already shipped for Goals
   (`apps/mobile/src/features/goals/LinkTransactionModal.tsx`): defaults to showing candidates
   within ±3 days, with controls to widen the date range or view the entire month, a search box,
   tap to pick — or a way to fall through to "no match, add as new."
3. **Not yet logged** (no candidate found at all). Expanded by default — the primary actionable
   list. Statement lines here are **grouped by merchant** with checkbox-based bulk actions (§7),
   and recorded via the reused Expense/Income/Transfer form (§8).
4. **Recorded, not in statement** (the lone wolves, §5). Expanded by default — action is
   keep / fix / delete, at the user's discretion.

## 7. Grouping repeat merchants + bulk actions (bucket 3: "Not yet logged")

The same merchant can appear many times in one statement (e.g. "Zomato" × 7). Presenting every
occurrence individually would make the feature tedious to use.

- **Group unmatched lines by normalized merchant key** (§9) — e.g. "ZOMATO · 7 transactions" —
  with each occurrence listed underneath, each with a **checkbox**, all checked by default.
- This single grouped UI serves two cases identically:
  - **No merchant memory yet**: category/description/tags fields start blank; the user fills
    them in once and applies to whichever occurrences are checked.
  - **Merchant memory exists** (§9): those fields come pre-filled from the last-used values; the
    action becomes "review the checkboxes, confirm."
- **Checkboxes let the user peel off exceptions within a group** — e.g. of 7 Zomato charges, 5
  are the user's own and 2 are family's: uncheck the 2, bulk-apply category/description/tags to
  the checked 5, and the group **shrinks to the remaining 2** for an immediate second pass
  (select both, apply a different tag, submit) — without leaving the screen.
- **Bulk-apply gives one shared category/description/tags to every checked transaction** in that
  action; each individual transaction keeps its own date/amount from its own statement line. A
  later per-transaction tweak (a specific one needs a different description) is a normal one-off
  edit afterward — the bulk flow itself doesn't need to support per-line customization.

## 8. Recording unmatched/new transactions

- **Reuse the existing shared `ExpenseForm`** (`apps/mobile/src/components/shared/ExpenseForm.tsx`)
  via a new locked "preset" — the same established pattern already used for Goal contributions
  (`goalPreset`). Call it something like `statementPreset`.
- **Pre-filled fields**: date (from the statement line — most statements carry no time
  component, date-only is expected), amount, account (this statement's account), type
  (expense/income/transfer, inferred from the statement's debit/credit or transfer indicator).
- **Payment mode**: inferred from keywords in the raw narration (UPI, NEFT, IMPS, RTGS, POS, ATM,
  cheque, etc.) — same keyword-inference technique already used for goal icons
  (`packages/core/src/core/goals/meta.ts`'s `GOAL_ICON_KEYWORDS` is the precedent to follow;
  `core/bank-import/paymentModeInference.ts` implements it). Payment mode is a real, creatable
  entity (`PaymentMode` type, `payment_modes` encrypted store, `paymentModesRepo` —
  `docs/SCHEMA.md`): 5 built-ins (cash/upi/card/net/wallet) are never persisted as rows, everything
  else (NEFT/IMPS/RTGS/Cheque) is created on demand. If the inferred mode doesn't already exist,
  create it on submit — but **checked-then-created once per needed mode across the whole import
  session/batch**, not once per individual transaction (importing 10 NEFT lines must not attempt
  to create "NEFT" 10 times). Once created it persists like any other payment mode and shows up as
  a selectable chip in the normal Add Expense form afterward too.
- **Category + description are left for the user** to fill in (or pre-filled as an editable
  suggestion from merchant memory, §9, when available) — **description field auto-focused**,
  matching the existing regular Add Expense form's own auto-focus convention.
- **Transfer-type unmatched lines** additionally need the other-side account captured (§5).

## 9. Merchant memory + normalization (the "learning" system)

Two distinct layers, decided to be kept separate:

### 9a. Normalization layer: raw narration → normalized merchant key

- **Not blocked on real statement samples** — a general-purpose heuristic can be built now and
  refined later:
  1. Split the narration on common delimiters (`-`, `/`, spaces).
  2. Drop tokens that are purely numeric or mostly numeric (reference numbers, UTRs, account
     digits, dates).
  3. Drop generic connector keywords that don't identify a merchant (UPI, NEFT, IMPS, POS, ATM,
     TXN, REF, VPA, and similar).
  4. The remaining alphabetic token(s) — uppercased, trimmed — become the normalized key. E.g.
     `UPI-SWIGGY-411223344-YBL` → `SWIGGY`.
- **This heuristic does not self-learn.** It's a fixed, deterministic rule set — running more
  statements through it does not make the rules themselves smarter. Improving it over time
  requires either (a) a manual code-level rule refinement once real statements expose a gap, or
  (b) the user-facing override screen below.
- **Normalization override screen (in scope for v1 from the start, not deferred)** — a
  screen reachable from the Accounts page (global entry point, §3) where the user can:
  - View existing raw-line/description ↔ normalized-value mappings.
  - **Add a manual override, keyed on a stable keyword/substring the user types directly** (not
    the full exact raw line — reference numbers change every transaction, so an exact-line
    override would never fire again next month; typing the keyword directly was chosen over
    "paste an example line and auto-suggest the substring" for predictability).
  - Manual overrides always take priority over the automatic heuristic's guess.

### 9b. Merchant memory layer: normalized key → category + description

- **Scope: global across all accounts**, not per-account — a merchant seen on one account's
  statement should inform suggestions the next time it appears on a *different* account's
  statement too.
- Every resolved statement line — whether manually categorized (bucket 3) or confidently matched
  (bucket 1) — is a training signal: normalized key ↔ category + description used.
- Always surfaced as an **editable suggestion** the next time that merchant reappears — never
  silently auto-applied.
- This is what makes the feature progressively less work over time, especially for a user who
  never logs manually and uses statement import as their primary bookkeeping method: month 1 is
  fully manual, every month after gets faster as recurring merchants become one-tap confirms.

## 10. Persistence model + import commit model

### 10a. One consolidated table, not two

A single per-resolved-statement-line record, containing: raw narration, normalized/fuzzy key,
the linked Expense id (or null if it became a newly-created transaction), account, date, amount,
and which statement-import batch it came from. This one table/store serves three purposes:

1. **Audit trail** — opening a recorded transaction that has a link can show "matched from bank
   statement: `<raw narration>`, `<date>`" (transparency/trust).
2. **Merchant-memory backing store** (§9b) — queried globally by normalized key, no second table.
3. **Bonus**: recognizing/skipping already-resolved lines if a statement with an overlapping
   date range gets re-uploaded later (people often re-export "last 3 months" repeatedly).

Local, encrypted, private, never leaves the device — same posture as every other store in the
app (`CLAUDE.md`'s zero-backend-in-Phase-1 rule; new stores must go through
`EncryptedRepository<T>`, never accessed directly — see `packages/core/src/core/db/repository.ts`
and `docs/SCHEMA.md`).

### 10b. Commit model: preview → stage → one final write

- As the user resolves items during review (confirms a match, bulk-applies a category to a
  checked group, handles a lone wolf), each finalized item moves into a **staging / "ready to
  import" state** — nothing is written to the real vault yet.
- **One final "Import" action writes everything staged, all at once**: new Expense/Transfer
  records, any newly-created Payment Modes (deduped once per batch, §8), and the persistence
  table rows (§10a).
- This mirrors the existing multi-app CSV Import's own architecture (nothing committed until a
  single final `commitAndImport()`-equivalent action) — consistent with precedent, not new.
- **No persisted draft, no resume.** If the user leaves the review screen before the final
  "Import" tap, all staged progress is discarded. Resuming means re-uploading the statement and
  redoing the entire review from scratch. This is an explicit, deliberate trade-off (matching
  the existing Import feature's own lack of a resume/draft concept), not an oversight.

## 11. Balance correction — explicitly out of scope as a dedicated mechanism

Penny never stores account balances — they're always derived on read
(`openingBalance` + every transaction, see `packages/core/src/core/accounts/balanceCalculator.ts`
and `docs/features/accounts.md`). Getting the *transactions* right via this feature therefore
gets the balance right automatically, as a side effect — no separate "fix the balance" mechanism
belongs in this feature.

- The existing **Reconcile** feature (`apps/mobile/src/features/accounts/ReconcileModal.tsx`) is
  the fallback/safety net for any residual drift (an untracked cash leg, an imprecise opening
  balance from an account added mid-history).
- **Optional validation nudge (confirmed, included in v1)**: if the statement includes its own
  running "Balance" column, after the final import compare Penny's own computed balance for
  that account against the statement's stated closing balance. If they don't match, nudge the
  user toward the existing Reconcile feature. This is purely a confidence check, not a new
  balance-setting mechanism, and should not attempt to auto-correct anything itself.

## 12. Architecture notes for whoever implements this

- Respect `CLAUDE.md`'s non-negotiable rules: `dexie` only imported from `core/db/`; new
  persistence goes through `EncryptedRepository<T>`; feature modules must not cross-import each
  other (reuse via `components/shared/`, `core/`, `hooks/` as this doc's precedents indicate);
  every UI design change goes through a mockup first (`docs/mockups/proposals/`) before any
  `apps/mobile` code changes.
- After implementation, update per `CLAUDE.md`'s documentation-discipline list: a new
  `docs/features/` entry (or a section in `accounts.md`/`expenses.md`), `docs/SCHEMA.md` for the
  new store, `docs/ARCHITECTURE.md` for new files/modules, and this plan file's own status line.

## 13. Status: implemented, on branch, not yet committed

Every open question raised during scoping was resolved (file-format priority, entry point,
column-mapping presets, matching algorithm and its edge cases, manual-override cascade behavior,
the four-bucket review structure, bulk merchant-group actions, the reused transaction-entry form
and its prefills, merchant memory scope, the normalization heuristic and its override screen, the
persistence model, the commit model, and balance-correction scope).

Mockups done (2026-08-01): `docs/mockups/proposals/bank-statement-import-v1.html` — comprehensive
first pass across all screens/flows, approved as the starting direction.

**Implementation complete (2026-08-02), on branch `feature/bank-statement-import`, not yet
committed:**

- **Core module** (`packages/core/src/core/bank-import/`): CSV parser, 7 bank presets + Custom,
  normalization heuristic + override support, the matching engine (`matchStatementRows` for the
  one-shot pass, `deriveLoneWolves` exported separately so the UI can recompute lone-wolf status
  reactively), merchant grouping, merchant-memory lookup, payment-mode inference, balance check.
  21+ unit tests, full monorepo typecheck/lint clean.
- **Mobile UI** (`apps/mobile/src/features/bank-import/`): the full step-driven wizard (bank
  preset → upload → column mapping → 4-bucket review → commit), the possible-match picker, bulk
  merchant categorization, a new `ExpenseForm` `statementPreset` mode, the normalization-overrides
  screen, and Accounts-page entry points — built by an agent, then code-reviewed against this doc
  and fixed for two real bugs found in that review: a missing scroll container in the review screen
  (a real statement runs 100–300+ lines, mostly in expanded-by-default buckets), and a bumped/
  orphaned transaction vanishing from the review instead of resurfacing as a lone wolf (violated
  §6's own "never silently hide something uncertain" principle) — fixed via a reactively-recomputed
  lone-wolf derivation instead of the matcher's frozen one-shot result. Also fixed: bulk-categorize
  was applying one shared payment mode across a whole merchant group (§7/§8 only share
  category/description/tags in bulk; payment mode is inferred per line); §10a's audit-trail purpose
  (showing "matched from bank statement" on an edited transaction) was initially unwired, now
  surfaced in `ExpenseForm`'s edit mode.
- **Payment mode made a real creatable entity** (mid-implementation correction, per explicit user
  decision): originally assumed non-creatable since nothing creatable existed in the codebase at
  the time; a new `payment_modes` store + `core/expenses/paymentModes.ts` now makes it one, and
  `paymentModeInference.ts` infers distinct NEFT/IMPS/RTGS/Cheque candidates (not folded into a
  generic "Net") — created once per import batch, the first time each is actually needed.

Docs updated alongside: `docs/SCHEMA.md` (3 new stores), `docs/ARCHITECTURE.md`, new
`docs/features/bank-import.md`, `docs/features/accounts.md`'s entry-point note.

**Follow-up round (2026-08-03), same branch, still uncommitted:**

- Bank/upload/column-mapping steps merged into one `SetupStep.tsx` screen, per explicit user
  feedback: `PresetStep.tsx`/`UploadStep.tsx`/`MappingStep.tsx` deleted. Bank selection is now a
  **dropdown** (was a tile grid — the preset list can grow past what a grid comfortably shows), and
  the resolved column mapping is reviewed **inline** as a small table-style card as soon as a file
  uploads, with one "Edit mapping" popup (`MappingEditModal.tsx`) editing every field together
  (user's explicit choice over a per-field pencil icon). `useBankImport.ts`'s step type collapsed
  from 5 values to `'setup' | 'review' | 'done'`.
- Payment mode's architecture changed again, per explicit user request to support **editing**
  existing modes (defaults included) from a new Accounts-page list: the 5 built-ins are no longer a
  virtual, read-time-only overlay — they're seeded as real `payment_modes` rows once
  (`~/hooks/usePaymentModes.ts`), with a new `isDefault` flag gating deletability (editable, never
  deletable — mirrors `ExpenseCategory`). `features/accounts/PaymentModesSection.tsx` is the new
  manage-everything list (icon tile + pencil badge, edit/add/delete-if-unused); `PaymentModeChips`
  (inside the Add-transaction form) keeps its own "+" tile for quick inline creation only.

Docs updated again: `docs/SCHEMA.md` (`payment_modes`' `isDefault` field), `docs/ARCHITECTURE.md`,
`docs/features/bank-import.md`, `docs/features/expenses.md`, `docs/features/accounts.md`.

**Second follow-up round (2026-08-03), same branch, still uncommitted — review-screen UX + bulk-categorize
parity with the real expense form, per explicit user feedback on a review-screen screenshot:**

- Possible matches now render as the same paired-tile style as Matched (amber/dashed), and the picker
  modal highlights the matcher's own suggestion(s) with an amber border + "Suggested" badge (stable
  double-sort: date-order preserved within the suggested/non-suggested split). A distinct "Move to
  'Not yet logged' for later" action now sits alongside "No match — add as new" (both call the
  existing `dismissPossibleAsNew`, only the latter also opens the form).
- The statement-preset `ExpenseForm` no longer renders a separate compact "locked fields" list
  (`LockRow`, deleted) — it reuses the exact same components as the normal form (`AmountInput`/
  `DateInput`'s own `disabled` prop, `AccountChips` wrapped in a non-interactive `View`), so it visibly
  looks like the real expense form, not a lookalike. A real, previously-unnoticed bug was also fixed
  here: the review screen's summary-strip counts (Matched/Possible/New/Lone) were frozen from the
  one-shot matcher snapshot and never updated as items moved between buckets during review; now
  computed live from the staged state.
- "Not yet logged" groups are now individually collapsible (a merchant can run to 50+ occurrences),
  and each row shows its narration (not just date), with the amount colored red for spend / green for
  income instead of a flat neutral color.
- `BulkCategorizeModal.tsx` (the "Categorize N selected" flow) closed two gaps flagged directly
  against a screenshot: its category field was a plain `SelectInput` dropdown instead of the app's
  real `CategoryPickerModal` (now fixed — select-only, cross-feature import same as the already-
  established `CategoryPickerModal` exception), and it had no Lent/Borrowed support at all despite
  every occurrence being a real transaction that could need it. Its Tags field now matches
  `ExpenseForm`'s own (frequent tags/suggestions/inline Set Aside), and a new bulk-shared Lent/Borrowed
  panel applies one person to every checked occurrence (kind derived from the group's own majority
  direction). This also surfaced and fixed a genuine, previously-silent gap: bank-import's
  `commitAndImport()` wrote `Expense.hashtags` directly but never created/updated `Hashtag` rows (no
  usage count, invisible to Manage Tags/Frequent) for either the bulk or single-row flow — now fixed
  once, generically, for every staged new transaction.
- The two informational notes at the bottom of the bulk-categorize modal moved to the top as one
  `Banner variant="info"` card.
- **Immediate follow-up feedback** on the above: Tags/Lent-Borrowed should use the same icon-toggle
  affordance as the real expense form, not an always-visible field / a custom pressable-row toggle.
  `ExtraCircle` extracted from `ExpenseForm.tsx` to `components/shared/ExtraCircle.tsx` (pure
  relocation, reused as-is) — both panels now hidden by default, revealed via their own icon, which
  lights up once open or filled in. Also: Description now defaults to a generalized guess
  (`prettifyMerchantKey()`, new in `core/bank-import/normalization.ts`) derived from the merchant's own
  normalized key for a first-time merchant, instead of starting blank.

Docs updated again: `docs/ARCHITECTURE.md`, `docs/features/bank-import.md`.

**Third follow-up round (2026-08-03), same branch, still uncommitted — normalization tuned against
real sample statements:** the user supplied 7 real-shaped sample CSVs, one per supported bank preset
(HDFC, ICICI, Kotak, SBI, IndusInd, HSBC, Bank of Baroda), all sharing the same underlying
transactions reformatted per bank's own column layout. Running every distinct narration through the
real `normalizeNarration()` (not guessed by hand) found `ACH`/`INW`/`REV` leaking into the merchant
key as noise (e.g. `ACH CR/DIVIDEND INCOME/TCS LTD` → `ACH DIVIDEND INCOME TCS LTD` instead of
`DIVIDEND INCOME TCS LTD`) — all three now added to `CONNECTOR_KEYWORDS`, plus `OUT` proactively as
`INW`'s counterpart. `paymentModeInference.ts` also gained `ACH` as its own creatable rail (previously
fell through to "Net"). One judgment call was raised explicitly rather than silently changed: whether
`SENT TO X`/`RECEIVED FROM X` should collapse to one merchant group per person regardless of
direction — user said no, keep them separate, since the Lent/Borrowed panel depends on that split
(sent → lent, received → borrowed).

Docs updated again: `docs/ARCHITECTURE.md`.

**Fourth follow-up round (2026-08-03), same branch, still uncommitted — Lent/Borrowed & categories,
discussed thoroughly before any code, per explicit user request:**

Four decisions came out of a multi-turn discussion (researched via a sub-agent against
`packages/core`/`apps/mobile` for factual grounding, plus a second sub-agent researching Cashew/
Splitwise's own loan-repayment UX for external precedent):

1. **Normalization rule visibility**: the "Merchant recognition" screen only ever showed the user's own
   editable overrides — the fixed heuristic (`CONNECTOR_KEYWORDS`) was invisible. Added a read-only
   "How automatic recognition works" collapsible card to `BankImportOverridesPage.tsx`, listing the
   general rule in plain English plus the actual current keyword list (`CONNECTOR_KEYWORDS_LIST`, new
   export from `core/bank-import/normalization.ts`) — informational only, not editable there (a code
   change updates it, not a settings screen).
2. **Settle-up / repayment detection — deliberately NOT built.** Researched Cashew (dedicated Loans
   section, per-loan child "Collected"/"Paid" transactions, partial repayments) and Splitwise
   ("Settle all balances") for precedent on linking a repayment back to a specific original loan.
   Neither has solved the "one transaction represents two different ledger effects" case (e.g. ₹22,000
   in = ₹2,000 collecting an old debt + ₹20,000 a brand-new loan, a common India pattern per the user)
   — even Cashew has an open, unimplemented GitHub issue for a related cross-account case. Explicit
   user decision: **log the transaction as-is** (an income marked Lent/Borrowed via bank-import is
   always `borrowed`, an expense always `lent`, exactly as today — no auto-detection, no schema
   change), and let the free-text Description field carry the nuance in the user's own words (e.g.
   "Amit returned 2000, also borrowed 20000"). No further work planned here.
3. **Standing invariant, written down explicitly**: **one statement line always produces exactly one
   app transaction** (`Expense`/`Income` record) — never split, never merged. Verified against the
   current implementation: Matched/resolved-Possible rows link to an *existing* transaction (no new
   record created), and every "new" path (bulk-categorize, single-row add-as-new) creates exactly one
   record per row. The one intentional exception is lone wolves — transactions already in the app with
   no matching statement line at all — which aren't sourced from the statement being imported, so they
   don't count against its row total. Any future feature (including a settle-up mechanism, if ever
   revisited) must preserve this invariant — e.g. a settlement's "ledger-only remainder" must be a
   `LedgerEntry` with no `linkedTxnId` (already optional in the schema), never a second `Expense`
   record from the same statement line.
4. **Categories**: added three new default categories (`packages/core/src/core/db/defaultCategories.ts`,
   additive-seeded via `useExpenses.ts`'s new v8 seeding effect, `penny_cats_v8` flag) —
   `cat-food-drinks` ("Food & Drinks", Daily Living, alongside the existing Groceries/Dining & Café —
   added anyway per explicit user request despite the overlap), `cat-lending` ("Lending", Family &
   Giving, expense), and `cat-inc-borrowed` ("Borrowed Money", Income). Both IOU categories are **free
   choice, not auto-locked** to the Lent/Borrowed panel — explicit user reasoning: a shared-bill split
   with a friend is often deliberately kept under its real category (e.g. Dining) "for remembrance",
   so forcing a generic category would lose that context. `categoryTaxMap.ts` gained `cat-food-drinks`
   (`gst-5`, same as its siblings) and `cat-lending` (`exempt`, added to `SPEND_EXCLUDED` too — lending
   money isn't consumption, no GST applies); income categories were already outside this map entirely
   (indirect tax only applies to spend), so `cat-inc-borrowed` needed nothing there.

Docs updated again: `docs/ARCHITECTURE.md`, `docs/SCHEMA.md` (categories aren't schema fields, so no
change there — noted for completeness), `docs/features/expenses.md`.

**Committed 2026-08-04** (`2fed167`, bundled with the Accounts mini-cards redesign and Home
Retirement Corpus in one commit per explicit user instruction) — re-verified against the actual
code before committing, not just this log's own claims: core module + all 5 test files present,
all 13 mobile UI files present, Accounts-page per-row "Import" action (bank/credit_card accounts
only) and the global "Merchant recognition" entry point both wired in `AccountsPage.tsx`, the
statement-preset `ExpenseForm` mode present, and §11's balance-check nudge genuinely wired
end-to-end (`useBankImport.ts` calls `checkBalanceAgainstStatement`, `DoneStep.tsx` renders the
"Reconcile now ›" call-to-action) rather than only computed and never surfaced.

**Everything in scope (§2) is implemented.** What remains is exactly what was scoped out
explicitly, not a gap: Excel/PDF parsing (CSV-only v1, §2), in-same-file duplicate/glitch
detection (§2), resuming an in-progress review after leaving (§10b, deliberate — re-upload and
redo), and a dedicated balance-correction mechanism (§11 — Reconcile is the intended fallback,
by design). The statement-preset `ExpenseForm`'s category tile already reuses the real
`CategoryPickerModal` (it always did — the user's separate, now-resolved feedback about "utilize
our category picker instead" turned out to be about `BulkCategorizeModal`'s field, fixed in the
second follow-up round above, not this one).
