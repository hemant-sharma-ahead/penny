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

The experience is delivered by the shared `IouView` component (privacy mode read internally), rendered
**only as the Expenses → IOU tab** (via `IouSlice`). There is no longer a standalone `/app/iou` route —
it and `IouPage.tsx` were removed. The Net Worth "IOU" line on Home navigates to the Expenses IOU tab
(`GlanceHeader` → `PATHS.app.expenses` with `state: { tab: 'iou' }`).

**Soft-archive on delete.** Deleting a person who still has ledger entries **soft-archives** them
(`isArchived`) rather than hard-deleting, so their history stays intact (`useIou.removePerson`; a person
with no entries is hard-deleted). `IouView` shows a collapsible **"Archived (n)"** section where you can
**Restore** (`restorePerson`) or **permanently delete** (`purgePerson`) an archived person — the purge
cascades their ledger entries and any linked cash transactions, all reversible with a single **Undo**
(mirrors `deleteEntryAndTxn`). Logging a new lend/borrow for an archived name **revives** them
(`getOrCreatePerson` un-archives a matching person).

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

## Current limitations

- Pairwise only — multi-party group splits (uneven shares / who-paid) arrive in Phase 1.5 Track E
- Loans recorded as Expense/Income appear in normal spend/income analytics (no separate category, by
  design) — net worth is corrected via the IOU receivable/payable, but cash-flow shows the movement
- IOU→transaction uses a default category (`cat-other` / `cat-inc-other`); edit the transaction to refine
- Person names are local free text — not yet linked to real group members (`linkedMemberId` reserved)
- No push/OS reminders for due dates (in-app only)

## Planned improvements

- Phase 1.5 Track E: link a person to a real group member (`linkedMemberId`) so two ledgers reconcile
- Phase 1.5 Track E: N-party split engine (shared expense → shares → who-paid → multi-party settle)

## Ideas welcome

- Should expense→IOU seeding support uneven splits (not just even/full) before groups land?
- Would a per-person "remind me" (in-app) for overdue balances be useful?
