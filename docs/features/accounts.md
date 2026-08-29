# Accounts

## What it is

The accounts module manages all your bank accounts, cash on hand, and digital wallets. Every transaction in Penny is linked to an account, which means your balances are always accurate and up to date — no manual balance entry needed after the initial setup.

## User-facing capabilities

- Add multiple accounts of five types: Savings account, Current account, Credit card, Cash, and Wallet (Paytm, PhonePe, or any other)
- Set a name, bank name, opening balance, colour, and icon for each account
- See the live balance of every account, updated instantly as you add income, expense, or transfer transactions
- For credit cards, see how much credit has been used (rather than a positive balance)
- Transfer money between accounts — the transfer shows as a debit on the source account and a credit on the destination, keeping both balances accurate
- Log income transactions (salary, freelance income, dividends, rental income, any money coming in) directly from the expenses module
- See all your accounts in the scrollable accounts strip on the Home dashboard for a quick balance overview
- Edit account details (name, bank, colour, icon) at any time; delete accounts that are no longer active
- **Reconcile** a cash or wallet account to its real-world balance — enter the actual amount and Penny posts a balancing income/expense ("Balance reconciliation") so the tracked balance matches reality. **`apps/mobile`, 2026-08-02:** Expenses → Analytics now surfaces a monthly **Cash Flow** card per cash/wallet account (Initial → Income → Expenses → Computed left) that also flags the gap against any reconciliation posted that month — see [`docs/features/expenses.md`](expenses.md)
- Hide a specific account's balance in **Safe Mode** (Settings → Safe Mode → Accounts), independent of the other accounts — everyday accounts stay visible by default
- **`apps/mobile`, 2026-08-02:** tap any account row to see **every transaction linked to it** (expense,
  income, or transfer in/out) in a modal, right there on the Accounts page — no need to navigate to the
  Transactions tab and configure the Filter popup. The row's edit/delete/reconcile icons are unaffected;
  tapping the row body itself is the new action.
- **`apps/mobile`, 2026-08-02:** a new **Import** action on each bank/credit-card account row (not
  shown for cash/wallet, which have no bank statement) starts **Bank Statement Import** — upload a
  bank statement, review it against what's already logged, and add whatever was missed. A second,
  global "Merchant recognition" entry point manages normalization overrides. See
  [`docs/features/bank-import.md`](bank-import.md) for the full feature.
- **`apps/mobile`, 2026-08-03:** a **Payment modes** section lists every payment mode (the 5
  built-ins plus any custom ones) as an icon tile with a small pencil badge — tap to edit
  (icon/colour/label, defaults included) or add a new one via the trailing "+" tile. Delete lives
  in the same popup, for custom modes not currently in use only.
- **`apps/mobile`, 2026-08-03:** the account list itself was redesigned from a dense single-line row
  (icon + truncated name + balance + up to 4 inline icons/chevron all fighting for space) to **mini
  cards** — one per account, stacked vertically (no carousel/swipe), each with a gradient background.
  Top row: icon tile + type pill ("CREDIT CARD"/"BANK"/"CASH"/"WALLET"). Middle row: account name
  (left) and balance (right, with "Included in net worth"/"Not counted in net worth" beneath it — both
  states now shown, not just the included case). Bottom row: Import (or Reconcile for cash/wallet) +
  Edit as tinted icon chips, Delete separated at the far right so it's never a stray tap next to Edit.
  All existing interactions (tap card → view transactions, Import → Bank Statement Import, Reconcile,
  Edit, Delete-with-confirm) are unchanged — only the visual treatment changed.
- **`apps/mobile`, 2026-08-03 (v2 follow-up, same day):** the first version above coloured every card
  from the account's own free-pick `color` field with no glow/sheen at all, which is why cards looked
  flat and near-identical for two accounts of the same type (e.g. two "Bank" accounts). **v2** replaces
  this: card colour is now drawn from a small curated set of dark jewel-tone gradient + bright-glow
  pairs, assigned **per account** (a deterministic hash of `acc.id`, not the account's type or its
  `color`) — see `~/lib/color.ts`'s `accountCardPalette(id, isCashLike)`. The one hard rule: `cash`/
  `wallet` accounts always clamp into a separate green-only subset regardless of the hash, so "green =
  cash" stays a reliable cue; every other type hashes freely across the jewel-tone set. Each card also
  gained a "real card" sheen: an inset top highlight, a diagonal light-sheen streak, and a second darker
  glow blob opposite the main corner glow — see `docs/DESIGN_GUIDELINES.md`'s "Identity-colour gradient
  mini card" entry for what's a faithful port vs. a pragmatic RN approximation (RN has no inset
  box-shadow, CSS blur filter, or repeating-linear-gradient). See `docs/mockups/proposals/
accounts-list-v1.html`'s "Direction D — Mini Cards v2" section for the approved reference.
- **`apps/mobile`, 2026-08-19: account list redesigned again — gradient mini cards dropped.** Real-device
  testing reported the v2 gradient cards as not following the theme, wasting space, and still not
  showing real bank icons everywhere despite the logos below. Replaced (7 mockup concepts explored,
  `docs/mockups/proposals/account-list-redesign-v1.html` through `-v3.html`'s "✅ FINAL DIRECTION")
  with: accounts grouped by type into three sections (**Bank Accounts / Cash & Wallets / Credit
  Cards**, a group hidden entirely if it has no accounts), each section one bordered container of flat,
  divided rows (no gradient). Each row's balance carries a `ti-dots-vertical` kebab that **tap-reveals**
  that row's Import-XOR-Reconcile + Edit + Delete icons underneath it, independently per row; whole-row
  tap still opens the transactions-for-this-account modal, unchanged. The "Included in net worth"/"Not
  counted in net worth" caption and the persistent unverified-account warning glyph both carried over
  unchanged. See `docs/DESIGN_GUIDELINES.md`'s "Grouped flat list + tap-to-reveal actions" entry (the
  gradient mini card entry above is now marked superseded there, kept only for history).
- **`apps/mobile`, 2026-08-19: real per-bank logos, HSBC added; brand-color tinting for 3 more.**
  `BankLogo.tsx` (a new shared component every account-icon render site should go through) swaps in a
  real, CC0-licensed brand mark (Simple Icons) for **HDFC, ICICI, Axis, and now HSBC** whenever
  `account.bankId` matches. For **SBI, Kotak, and IndusInd** — no licensed mark exists (Simple Icons
  has no entry for them, and the one other source with real marks ships with no LICENSE file, so
  redistributing it would be an unclear-rights risk) — the generic fallback `Icon` is tinted with each
  bank's real official brand color instead (`bankAccentColor()`, its own file since a component file
  can't have a second non-component export under Fast Refresh's rule) rather than left on the generic
  account-type default; both the icon glyph and its badge background (`AccountList.tsx`) use it. The
  remaining 5 presets (BoB, Yes Bank, PNB, Canara, IDFC First, custom) have no verified logo _or_ color
  yet — inventing either would be equally dishonest, so they stay on the plain account-type default.
- **`apps/mobile`, 2026-08-27: default account + payment mode, and a real Closed status.** Bank/Credit
  Card/Wallet accounts (never Cash, already the implicit fallback) gain two new toggles in Add/Edit
  Account, mutually exclusive on the same account:
  - **Set as default account** — pre-fills this account, and a type-appropriate payment mode (Cash→Cash,
    Credit Card→Card, Bank/Wallet→UPI), on every new expense/income. Only one account across the whole
    set may hold this — turning it on for one account while a DIFFERENT account already has it shows a
    confirm popup naming that account before anything is saved; Cancel leaves both untouched.
  - **Closed** — the account is no longer operational (you closed it with the bank). Distinct from
    _archived_ (still operational, just not something you want to keep logging to — that's a separate,
    still-unbuilt idea, see Current limitations): a closed account is hidden from every picker that
    assigns a NEW/edited transaction (this form's own inline "+ Add account", `EntryForm.tsx`/
    `SettleUpModal.tsx`, bulk account-reassign, Groups' composer, bank-import's cash-transfer target) but
    still shown on this page itself, in its own collapsed "Closed (n)" section — same pattern IOU's
    Archived section already uses — and still contributes to net worth/analytics like any other account
    with real history.
  - The account list shows a "Default" pill next to the name for whichever account holds it.
  - New shared `apps/mobile/src/components/shared/BankPickerModal.tsx` — the same bank-selection popup
    (real logo/brand-color icon + name, alphabetical) now used by both this form's "Bank (optional)"
    field and Bank Statement Import's own bank-preset field (`docs/features/bank-import.md`), replacing
    a plain text-only dropdown in both places.

## How it works

Account records are stored in the encrypted `accounts` Dexie store with fields: name, type, bankName, openingBalance, color, and icon.

Critically, **balances are not stored** — they are always derived on read. Every time a balance is needed, Penny queries the `expenses` store for all transactions linked to that account and computes: `balance = openingBalance + sum(income) − sum(expenses) + netTransfers`. This ensures the balance is always perfectly in sync with your transaction history and there is no risk of the stored balance drifting out of sync.

Transfers are recorded as a single transaction with both a source `accountId` and a destination `toAccountId`. Income is an expense-store record with type `income` linked to the receiving account.

The Home dashboard's accounts strip reads all accounts and computes their live balances in a single pass.

**Performance, 2026-08-28:** `useAccounts.ts` now shows a real loading state (`AccountList.tsx`'s
`loading` prop) instead of silently reusing the "no accounts yet" empty prompt during the first load —
both used to start as `[]` and were indistinguishable. Opening an account's transaction list
(`AccountDetailModal.tsx`) is also substantially faster for accounts with thousands of transactions —
its own `accountTxns`/balance computation is now memoized (was recomputing, and re-grouping the whole
list by date, on every one of the two renders this modal reliably does on open), and the shared
`groupExpensesByDate()` (`core/expenses/filterAndAggregate.ts`) itself was rewritten to sort once
globally instead of separately sorting and copying every individual day's row group. Full writeup in
`docs/ARCHITECTURE.md`'s matching 2026-08-28 decision-log entry.

Each `Account` carries an optional `hideInSafeMode` flag (undefined/false = visible, the default). Both `AccountList` (this page) and `AccountsStrip` (Home) resolve masking per account via `usePrivacy().shouldMask(acc.hideInSafeMode)` — Open never masks, Safe masks only flagged accounts. The Total Balance card is an aggregate, never flagged sensitive, so it always stays visible in Safe. See `docs/ARCHITECTURE.md` → Context providers.

Key files:

- `src/features/accounts/AccountsPage.tsx` — thin shell: header + AccountList + AccountFormModal
- `src/features/accounts/useAccountForm.ts` — add/edit form state; `AccountList.tsx`/`AccountFormModal.tsx` — list + modal
- `src/core/accounts/meta.ts` — account-type metadata (label/icon/colour); `balanceCalculator.ts` — balance math
- `apps/mobile/src/components/shared/BankLogo.tsx` — real per-bank logo resolution (`account.bankId` →
  a sourced Simple Icons mark, or the generic `Icon`/`account.color` fallback); mobile-only, added
  2026-08-19
- `apps/mobile/src/components/shared/BankPickerModal.tsx` — shared bank-selection popup (2026-08-27);
  `packages/core/src/core/accounts/accountDefaults.ts` — `findPreviousDefaultAccount()`, the one place
  "which other account currently holds `isDefault`" is decided, called from `useAccountForm.ts`'s
  `save()` rather than any one feature's own `saveAccount` (there are 3+ independent implementations —
  see the Mobile section below)
- **`apps/mobile`, 2026-08-03 (v2, superseded 2026-08-19 — history only):** each mini card's gradient +
  glow was looked up, not computed from the account's own type/colour — `~/lib/color.ts`'s
  `accountCardPalette(id, isCashLike)` hashed the account's `id` into one of two curated palettes
  (`JEWEL_PALETTE` for everything else, `GREEN_PALETTE` clamped for `cash`/`wallet`), each entry a
  hand-picked dark gradient pair plus a matching bright glow colour. Text/icon/divider colours on top
  of the gradient (`ON_GRADIENT` in `AccountList.tsx`) were intentionally fixed white/translucent-white
  regardless of app theme — same rationale as `ShareCard.tsx`'s hardcoded white text on its own
  gradient. **None of this exists in the current `AccountList.tsx`** — the 2026-08-19 redesign above
  dropped the gradient entirely for a themed flat row, so `accountCardPalette`/`JEWEL_PALETTE`/
  `GREEN_PALETTE` were removed rather than left as dead code.
- `src/features/expenses/ExpenseForm.tsx` — handles income and transfer type transactions (which update account balances)

**Mobile (`apps/mobile`):** ported in Track 4 (sixth module) — `apps/mobile/src/features/accounts/` mirrors the web files above 1:1 (`useAccounts.ts`/`useAccountForm.ts` unchanged beyond import paths). Surfaced a real bug in **shared `packages/core`**: `useDataRefresh.ts`'s cross-instance refresh signals (`useAccountsRefresh`/`useCategoriesRefresh`/`useTagsRefresh`) used the same browser-only `window` events as `useTxnRefresh` (already fixed for IOU) — fixed proactively with `packages/core/src/hooks/useDataRefresh.native.ts` before it could crash on-device. `ReconcileModal`'s `ink()`/`STATUS` usage swaps to `~/lib/color`'s `ink(color, theme.textPrimary)` (mobile's version takes the "toward" color as an explicit argument, since there's no CSS var to default to) — same pattern as other modules. `AccountFormModal` reuses the shared `FormModal` (web used a raw `Modal` here) for consistency with every other add/edit form ported so far. Back button dropped, same reasoning as Insurance/Loans/IOU.

**Mobile — 2026-08-01 relocation (diverges from web here):** `ExpenseForm.tsx` (the `expenses` feature
module) needed its own inline "+ Add account" — mounting `useAccountForm`/`AccountFormModal` from
`features/accounts/` directly would have been a feature-module-to-feature-module import, which
`CLAUDE.md`'s architecture rules disallow. Both moved to shared locations any feature module may import
from: `useAccountForm.ts` → `apps/mobile/src/hooks/useAccountForm.ts` (now also exporting the
`AccountInput` shape both `features/accounts/useAccounts.ts`'s and `features/expenses/useExpenses.ts`'s
own independent `saveAccount` implementations conform to), `AccountFormModal.tsx` →
`apps/mobile/src/components/shared/AccountFormModal.tsx`. `AccountsPage.tsx` updated its imports
accordingly; no behavior change for the Accounts page itself. See
[`docs/features/expenses.md`](expenses.md) for the inline "+" tile this made possible.

**Mobile — 2026-08-02, `ExpenseForm.tsx` itself relocated too:** once Goals also needed the same
transaction-entry form ("Add contribution" — see [`docs/features/goals.md`](goals.md)), `ExpenseForm.tsx`
moved from `features/expenses/transactions/` to `apps/mobile/src/components/shared/ExpenseForm.tsx`
alongside `AccountChips.tsx`/`PaymentModeChips.tsx`/`paymentModes.ts` (the same "needed by 2+ feature
modules" reasoning as the relocation above). No behavior change for the Accounts page or Expenses tab.

## Current limitations

- Balances must be seeded with an accurate opening balance; there is no way to import existing transaction history from a bank automatically
- Deleting an account is still a real hard delete (`accountsRepo.delete()`) — it doesn't remove linked
  transactions (they just lose their account link), but there's no Undo-by-restoring-the-account the way
  IOU persons/goals get. **Closed** (2026-08-27, see above) covers "keep it, stop using it, mark it
  no-longer-operational" — a genuine **Archive** (still operational, just not something you're
  logging to in Penny — distinct from Closed) remains unbuilt; `Account.isArchived` exists on the type
  but nothing sets it yet.
- No multi-currency accounts (all accounts are in INR)
- Credit card statements and minimum payment dates are not tracked
- No automatic bank sync or Open Banking integration

## Planned improvements

- Phase 1.5: Shared accounts — mark an account as shared with a household group, making its transactions visible to group members
- Phase 2: Bank statement import — upload a PDF or CSV statement from your bank to auto-populate transactions and set the correct opening balance

## Ideas welcome

- A real **Archive** action (distinct from the new Closed status — see Current limitations) — keep an
  account's history without deleting it, for one still-operational but no-longer-tracked in Penny.
- Would foreign currency account support (e.g. USD savings account) be useful?
- Should credit card accounts show the statement due date and minimum payment?
