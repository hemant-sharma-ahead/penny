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
- **Payment mode**: inferred from keywords in the raw narration (UPI, NEFT, IMPS, POS, ATM,
  cheque, etc.) — same keyword-inference technique already used for goal icons
  (`packages/core/src/core/goals/meta.ts`'s `GOAL_ICON_KEYWORDS` is the precedent to follow). If
  the inferred payment mode doesn't already exist for the user, create it on submit — but
  **checked-then-created once per needed mode across the whole import session/batch**, not once
  per individual transaction (importing 10 NEFT lines must not attempt to create "NEFT" 10
  times).
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

## 13. Status: ready for mockups

Every open question raised during scoping has been resolved (file-format priority, entry point,
column-mapping presets, matching algorithm and its edge cases, manual-override cascade behavior,
the four-bucket review structure, bulk merchant-group actions, the reused transaction-entry form
and its prefills, merchant memory scope, the normalization heuristic and its override screen, the
persistence model, the commit model, and balance-correction scope). Nothing is pending from the
discussion phase — next step is mockups.
