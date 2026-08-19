# IOU (Lend & Borrow)

## What it is

The IOU module is a **person-centric running ledger** for informal money between you and friends or
family. Each person you transact with has their own ledger; Penny derives a single **net balance**
per person ("Rohan owes you ₹7,700", "you owe Asha ₹2,000", "settled up") from all the lends,
borrows, and (partial) repayments recorded against them. It's the privacy-first, offline base of a
Splitwise-style experience — a pairwise (you ↔ one person) ledger now, generalising to N-party group
splits in Phase 1.5 Track E.

## User-facing capabilities

- A **list of people** with their derived net balance, sorted owed-to-you first, settled last
- Drill into a person to see their **full running ledger** (every lend / borrow / repayment, newest first)
- Log a lend or borrow: person (type-ahead with "Create '<name>'"), amount, what-for, date, optional due date
- **Settle up** with partial or full repayments — record what was actually paid (no `isSettled` flag;
  the person is "settled" when the net reaches zero). Over-payments are allowed and flip the balance.
- **A lend/borrow is one event with two views** — real money movement _and_ who-owes-whom:
  - **Lent = an Expense** (money out of an account) + a "they owe you" entry. From the Expense modal,
    toggle "Lent this to someone"; from the IOU screen, you're asked to record the matching expense.
  - **Borrowed = an Income** (money in) + a "you owe them" entry. From the Income modal, toggle
    "Borrowed this from someone"; from the IOU screen, you're asked to record the matching income.
  - **Settle-up** records the repayment movement too (income if they paid you, expense if you paid them).
  - All prompts default ON with the account pre-filled; deleting either the transaction or the ledger
    entry cascades to the other (`linkedTxnId`), and a single **Undo restores both atomically**.
  - **Editing re-syncs both ways:** editing the expense reconciles its IOU entry, and editing a manual
    IOU entry (amount / date / account / lent⇄borrowed) re-syncs its linked transaction — toggling the
    link off deletes the transaction. (Expense-seeded entries are owned by their expense — edit there.)
- **Net worth reflects it:** net lent is a receivable asset, net borrowed a payable liability — which
  offsets the cash movement so your net worth stays correct end-to-end.
- Overdue highlighting when a lend/borrow's due date has passed
- Totals strip: total owed to you vs total you owe
- **Person-name type-ahead (2026-08-18)** — logging a lend/borrow suggests matching existing people as
  you type (pills below the field, single-select), same pattern `EntryForm.tsx` already used elsewhere
  in the app — backed by a fix that makes person matching always consistent (see "How it works").
- **A real delete/archive choice for a person with history (2026-08-18)** — removing a person who still
  has ledger entries with a settled (≈₹0) balance now shows an explicit **Archive** or **Delete
  permanently** warning dialog (`RemovePersonDialog.tsx`), instead of a silent auto-archive. Deleting
  permanently only removes the `Person` + their `ledger_entries` — any linked `Expense`/`Income`
  transactions survive (they just lose the IOU person link). A person with an outstanding (non-zero)
  balance is blocked from permanent deletion.
- **Bulk-add existing transactions to a person's ledger (2026-08-18)** — from the Transactions
  multi-select, pick a person once for the whole batch; Penny auto-splits the selection by expense vs.
  income, asks one category choice per direction present (Lending/Return Borrowed for expenses,
  Borrowed Money/Collected Money for income), then applies the category + person + creates the matching
  `ledger_entries` for each (`BulkAddToIouModal.tsx`).
- **Switch a transaction's type after saving (2026-08-18)** — from `ExpenseForm.tsx`'s edit mode,
  expense ⟷ income can now be changed (Transfer excluded — it structurally needs two accounts);
  switching clears the (type-scoped) category and blocks if the transaction has an IOU ledger link, is
  shared to a Group, or is linked to a Goal contribution.
- **Cash-negative warnings everywhere money leaves an account (2026-08-18)** — the lend/borrow entry
  form and the Settle Up modal now show the same non-blocking `projectedBalance()`-based warning
  `ExpenseForm.tsx` already had, so a lend/settle that would push a cash account negative is flagged
  before saving, not discovered later.
- **Promote a person's ledger to a real Group (2026-08-18)** — a guided wizard (`PromoteToGroupWizard.tsx`)
  creates a Group, adds the person as a placeholder member, seeds it from the ledger (full history or a
  single opening balance, your choice), and generates an invite — then archives (never deletes) the
  personal ledger with a `promotedToGroupId` link and a "→ Now in {group}" shortcut in the Archived
  section. One-way; not designed to be reversed. See [`docs/features/groups.md`](groups.md).

> **Settle-up never touches money.** Penny stores no UPI VPA and generates no payee QR — the actual
> payment happens in whatever UPI/bank app you already trust; Penny only records the settlement.

## How it works

Two encrypted Dexie stores (v7), accessed only via `EncryptedRepository`:

- **`persons`** — the counterparty (name + optional phone/notes). Name/phone are **Category 1 PII**.
- **`ledger_entries`** — `lent` / `borrowed` / `settlement` rows referencing a `personId`.

Net balance is **derived, never stored** (`core/iou/ledger.ts`): lent `+`, borrowed `−`, settlement
per `settleDirection`. A balance under ₹1 is treated as settled for labels only (exact amounts are
always stored).

Person names are **never sent raw to AI**. `core/iou/aiLabels.ts` (`assignOrdinalLabels`) maps person
ids to session-scoped ordinal labels ("Person 1", "Person 2") — the single enforcement point for any
future AI context.

**Migration:** legacy flat `personal_ious` records migrate to the new model via a one-time,
post-unlock backfill (`useIou.ts`, flag `penny_iou_v2`) — encrypted stores can't use a Dexie
`.upgrade()`. Names are parsed from the old free-text description (leading token, else an "Unmatched"
bucket; full text preserved); a settled legacy IOU becomes its lend/borrow plus a matching settlement
so the derived net reproduces the old state. Pure logic in `core/iou/migration.ts`.

The experience is delivered by the shared `IouView` component (privacy mode read internally via
`shouldMask(!safeModeVisibility.iou)` — Safe Mode hides IOU amounts only if the "IOU" toggle in Settings →
Safe Mode is switched off; visible by default), rendered
**only as the Expenses → IOU tab** (via `IouSlice`). There is no longer a standalone `/app/iou` route —
it and `IouPage.tsx` were removed. The Net Worth "IOU" line on Home navigates to the Expenses IOU tab
(`GlanceHeader` → `PATHS.app.expenses` with `state: { tab: 'iou' }`).

**Soft-archive on delete.** Deleting a person who still has ledger entries **soft-archives** them
(`isArchived`) rather than hard-deleting, so their history stays intact (`useIou.removePerson`; a person
with no entries is hard-deleted). `IouView` shows a collapsible **"Archived (n)"** section where you can
**Restore** (`restorePerson`) or **permanently delete** (`purgePerson`) an archived person, or (2026-08-18)
**promote them to a real Group** (`PromoteToGroupWizard.tsx`). Logging a new lend/borrow for an archived
name **revives** them (`getOrCreatePerson` un-archives a matching person).

**Delete/archive confirmation (2026-08-18).** `purgePerson` used to unconditionally cascade-delete a
person's `ledger_entries` **and any linked `Expense` rows** — a real bug, since a recorded transaction
should never be silently removed just because its IOU person link is being deleted. Fixed: it now
deletes only the `Person` + their `ledger_entries`; linked transactions survive (they keep their
category, just lose the person link). `RemovePersonDialog.tsx` is the one place both `PersonForm.tsx`'s
"Remove" button and the Archived section's trash icon route through — for a person with settled
(≈₹0) history it shows an explicit Archive-or-Delete-permanently choice instead of the old silent
auto-archive; a person with a real outstanding balance is blocked from permanent deletion entirely. A
person with zero ledger entries is unaffected — still a direct hard delete, no dialog.

**Person resolution consolidated (2026-08-18).** `getOrCreatePerson` — "resolve a typed name to a
Person, case-insensitively, creating one if needed" — used to be independently reimplemented three
times (`useIou.ts`, `useExpenses.ts`, and `useBankImport.ts`'s `resolvePerson`), each matching against
its own hook instance's possibly-stale in-memory `persons` array. A person created via one screen (e.g.
the Expense form's Lent/Borrowed panel) could be invisible to another already-mounted screen (e.g. the
IOU tab) until that screen's hook happened to reload — typing the same name in both created two separate
`Person` rows instead of resolving to one. Consolidated into a single `packages/core` function,
`core/iou/personResolver.ts`, that always re-reads `personsRepo` fresh (never a caller-supplied array,
generalizing the pattern `useBankImport.ts`'s own `resolvePerson` already used correctly) — all three
call sites now point at it. Backs both the person-name type-ahead above and the duplicate-name fix.

**Totals and Net Worth exclude archived persons.** The "Owed to you" / "You owe" strip is computed from
`activeBalances` (`useIou` filters `!isArchived`), and Home's `netIou` sums only `activePersonIds`
(`useHome` filters `!isArchived`) — so archiving someone removes them from every headline number while
keeping their record recoverable.

Key files:

- `src/features/iou/IouView.tsx` — full interactive experience (list → ledger → add/edit/settle), Archived section (`restorePerson` / `purgePerson` with cascade + Undo); rendered via `src/features/expenses/iou/IouSlice.tsx` as the Expenses IOU tab
- `src/features/iou/useIou.ts` — domain hook: persons + ledger entries, derived `activeBalances` (excludes archived), migration, and `removePerson` (soft-archive vs. hard-delete) / `restorePerson` / `getOrCreatePerson` (revives archived)
- `src/features/iou/PersonListView.tsx` / `PersonLedgerView.tsx` — list + per-person ledger
- `src/features/iou/EntryForm.tsx` / `SettleUpModal.tsx` / `PersonForm.tsx` / `PersonPicker.tsx`
- `src/core/iou/` — `ledger.ts` (balance math), `expenseLink.ts` (both-way reconcile: `reconcileExpenseLink` expense→IOU + `reconcileLinkedTxn` IOU→transaction), `aiLabels.ts`, `migration.ts`

**Mobile (`apps/mobile`):** ported in Track 4 (fourth module) — `apps/mobile/src/features/iou/` mirrors the web files above 1:1 (`useIou.ts` unchanged beyond import paths and swapping `localStorage` for AsyncStorage in the one-time legacy-migration flag check). All 2026-08-18 items above are `apps/mobile`-only (`apps/web-react` is frozen) — the person-suggestion pills live in a new shared `apps/mobile/src/components/shared/PersonTypeahead.tsx` (extracted out of `PersonPicker.tsx` since `ExpenseForm.tsx`'s Lent/Borrowed panel — a different feature folder — needed the same suggestion behavior, and `features/` modules can't import each other; see `docs/ARCHITECTURE.md`'s feature-module-isolation decision). **Scoped as personal-only IOU for this port:** web's `IouView` reads `GroupContext` only to show one informational banner when the user has claimed a username and belongs to groups ("Your personal IOUs. Group balances live in each group."); since `GroupContext` (Phase 1.5's sync/multi-device machinery) isn't ported to mobile yet, that banner and its dependency are dropped entirely — the underlying ledger data model was already personal-only regardless, so no ledger behavior changes. Revisit once Groups lands on mobile. `PersonPicker`'s web version renders its suggestion list as a DOM-positioned overlay; the mobile port renders suggestions inline (normal document flow, pushes the form down) since RN has no absolute-overlay-over-siblings equivalent without a portal. Mobile also adds `IouPage.tsx`, a thin `PageHeader` wrapper — web never gives IOU its own page (always embedded as the Expenses module's IOU tab via `IouSlice.tsx`), but Expenses hasn't been ported yet, so this exists purely to make IOU a coherent standalone screen for the interim `AuthGuard` stand-in stage.

## Current limitations

- Pairwise only — multi-party group splits (uneven shares / who-paid) arrive in Phase 1.5 Track E
- Loans recorded as Expense/Income appear in normal spend/income analytics (no separate category, by
  design) — net worth is corrected via the IOU receivable/payable, but cash-flow shows the movement
- **IOU→transaction default category (updated 2026-08-06):** a **settlement**'s linked transaction now
  defaults to the dedicated `cat-collected-money` (income — someone paid back what you lent them) /
  `cat-return-borrowed` (expense — you paid back what you borrowed) categories instead of the generic
  Other/Other Income fallback (`reconcileLinkedTxn`'s new `defaultCategoryId` override, passed only by
  `IouView.tsx`'s settle call site). A brand-new manual "lent"/"borrowed" ledger entry's own linked
  transaction is unchanged — still defaults to generic Other/Other Income (its own category concept,
  `cat-lending`/`cat-inc-borrowed`, is reachable via the normal Expense/Income form, not this quick-entry
  flow); edit the transaction to refine either way.
- **Four categories now make the person mandatory, not optional (2026-08-06):** `cat-lending`
  ("Lending"), `cat-inc-borrowed` ("Borrowed Money"), `cat-collected-money` ("Collected Money" — new,
  the reverse of Lending), `cat-return-borrowed` ("Return Borrowed" — new, the reverse of Borrowed
  Money). Picking any of these in `ExpenseForm.tsx` (including bank-import's single-row flow) or
  bank-import's `BulkCategorizeModal` auto-opens *and locks open* the Lent/Borrowed panel (the
  `ExtraCircle` toggle becomes unresponsive to taps while one of these is selected — see `IOU_MANDATORY_CATEGORY_IDS`
  in `packages/core/src/core/db/defaultCategories.ts`) instead of leaving it as a manual toggle someone
  might never open before an otherwise-silent validation failure on Save/Apply.
- Person names are local free text — an **existing** personal-IOU person still isn't linkable to an
  **existing** real group member (`linkedMemberId` reserved, unused); the one bridge that does exist is
  one-way and only for a brand-new Group (`promotedToGroupId` — see "Promote a person's ledger to a real
  Group" above), not a reconciliation between two already-independent ledgers.
- No push/OS reminders for due dates (in-app only)

## Planned improvements

- Phase 1.5 Track E: link an **existing** person to an **existing** real group member (`linkedMemberId`)
  so two independently-tracked ledgers reconcile — distinct from the promote-to-new-group flow shipped
  2026-08-18, which only ever creates a brand-new Group.
- Phase 1.5 Track E's N-party split engine (shared expense → shares → who-paid → multi-party settle) has
  shipped — see [`docs/features/groups.md`](groups.md).

**2026-08-01 — this exact two-way link pattern was reused for Goals:** `core/goals/goalLink.ts`
(`reconcileGoalLink`/`reconcileLinkedGoalTxn`) mirrors `expenseLink.ts` field-for-field —
`ExpenseForm.tsx`'s Goal toggle is `Lent`/`Borrowed`'s sibling (shown for expense/income/**and**
transfer, unlike IOU), and `GoalContributionForm.tsx`'s "Record as a transaction" toggle mirrors
`EntryForm.tsx`'s. See [`docs/features/goals.md`](goals.md).

## Ideas welcome

- Should expense→IOU seeding support uneven splits (not just even/full) before groups land?
- Would a per-person "remind me" (in-app) for overdue balances be useful?
