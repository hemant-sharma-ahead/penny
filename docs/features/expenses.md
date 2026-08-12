# Expenses

## What it is

The expense tracking module — the heart of Penny's day-to-day usage. You log every financial transaction here: money spent, money received, and money moved between your accounts. Over time, Penny builds a detailed picture of where your money goes, surfaced through analytics, budgets, and Chip insights.

## User-facing capabilities

- Add, edit, and delete transactions of three types: expense (money out), income (money in), and transfer (between your own accounts)
- Attach a merchant name, amount, category, date, account, notes, and free-form hashtags to every transaction
- Enter amounts with live Indian thousands grouping, a built-in calculator (type `120+45`), and an amount-in-words helper beneath the field (`1,00,000` → "One Lakh")
- The **Add/Edit screen** leads with a compact left-aligned type switch and the close (X) at the top
  right. **`apps/mobile`, 2026-08-01:** for expense/income, the **category picker and amount now share
  one row** — a dashed placeholder tile, sized to its content rather than stretched full-width (fills
  solid with the category's own colour/icon once chosen), on the left, the amount right-aligned on the
  right, replacing the previous full-width centred **hero amount** sitting above a separate "Select
  category" row (transfer, which has no category, keeps the original centred hero on its own). **Date and
  Time** now sit side by side as two equal-width fields below — both default to right now but are
  independently editable (`TimeInput`, a `DateInput`-style native/web-split component), for logging an
  expense after the fact or backdating one. The **account** and **Paid via** icon rows follow, then
  circular icons for **Tags / Receipt / Goal / Lent-or-Borrowed / Recurring** that expand inline on tap —
  each of Tags/Receipt/Goal/Lent-or-Borrowed stays highlighted whenever it already has content (a tag, a
  receipt, a picked goal, a person) even while its own panel is collapsed, exactly like Tags always did;
  collapsing a panel is a pure visibility toggle and never clears what's already filled in (removing a
  goal/person still requires reopening the panel and deselecting/clearing it, same as clearing a tag).
  Description holds first focus, reliably — `Modal`'s new `onShow` prop (fires once the native modal has
  actually finished presenting, unlike a bare `autoFocus` on a `TextInput` mounted before that) drives a
  ref-based `.focus()` instead. Saving without a required field (**amount, description, category**)
  highlights the missing one — the same applies to each conditional panel's own required field (Goal's
  picker, Lent/Borrowed's person, Share-with-group's group, Recurring's interval) **only while that
  panel's toggle is on**: submitting with one on-but-empty scrolls to, focuses, and highlights it instead
  of silently succeeding or silently dropping it.
- **`apps/mobile`, 2026-08-01:** the Account row's chips gained a persistent **"+ Add"** tile (after
  every real account, not just the empty-state fallback) — opens the real Add Account form as a second
  centred `Modal` stacked on top, without leaving or losing progress on the transaction you're mid-way
  through. Saving refreshes this form's own account list immediately (and auto-selects the new account,
  for the single-account case) and also the Accounts page's own list, via the same cross-hook
  `notifyAccountsChanged`/`useAccountsRefresh` signal Settings → Safe Mode's account edits already use.
- **`apps/mobile`, 2026-08-01:** the "+" FAB on the Transactions list now opens the Add form directly
  (defaulted to Expense) instead of first revealing an Expense/Income/Transfer speed-dial to pick from —
  cut from 2 taps to 1, since the form's own type switch at the top already covers what the speed-dial
  did.
- **`apps/mobile`, 2026-08-01:** the Expenses tab's own header row (`ExpensesHeader.tsx`) was
  decluttered — a single row now reads, left-to-right, as **transaction count** ("N transactions") with
  the **filtered total** below it, the active **vacation event** (if any) centred over the whole row on
  both axes, and the **Events/Import/Export** icons stacked above the **Safe-to-spend** pill on the
  right. Previously these were two separate rows (an icon-only actions row, then a label+total crammed
  against a Vacation text label and a bordered Safe pill) reading as visually noisy. The centre column is
  a third equal-width flex column, not absolute positioning — `MainTabs.tsx`'s own `HeaderCenter` already
  hit an on-device-only centering bug with `position: absolute` + matching insets under this project's
  NativeWind/interop setup, so the same three-equal-`flex: 1`-column technique used there is reused here.
  The vacation pill simply doesn't render on a day with no active event — no placeholder gap, no layout
  shift.
- **`apps/mobile`, 2026-08-11:** `ExpensesHeader.tsx` gained a full-width, tappable **account
  verification banner** below the header row (`docs/mockups/proposals/expenses-account-verification-
  badge-v2.html`) — Expenses is where users spend the most day-to-day time, so an unverified bank
  account (checkpoint mismatch, anchor disagreement, or standing gap — the same
  `computeAccountVerificationStatus()` signal Home/Accounts already surface) needed a visible presence
  here too, not just those two screens. Renders nothing at all when every account is verified (or not
  `CHECKPOINT_ELIGIBLE`) — pixel-identical to before this existed. Names the specific account directly
  when exactly one needs attention; stays generic ("N accounts need attention") for 2+, since the
  Accounts screen it links to (`navigate('Home', { screen: 'Accounts' })`, the same cross-tab pattern
  the header's own Safe-to-spend pill already uses for CashFlow) shows which ones. `useExpenses.ts`
  also gained a `useBankImportsRefresh` subscription it was missing (found alongside this — the same
  staleness class of bug `useHome.ts` hit and fixed 2026-08-10: a commit while Expenses sits mounted
  underneath the import flow would otherwise leave this banner reading a stale, empty snapshot of
  import records).
- The **Tags panel** shows a horizontally-scrollable **Frequent** row (your top-8 tags by usage) and any active-event tags immediately when opened — no typing required — plus a **Manage tags** link straight to the full list. Typing a genuinely new tag surfaces an inline, editable **Set aside** toggle; picking an existing tag instead shows its current Set Aside status read-only (changing an already-established tag's classification only happens in Manage Tags, since it retroactively affects every past transaction carrying it).
- Transactions render as a **day-grouped timeline** — a continuous left rail, newest first; same-day items order by the **time they were entered** (`Expense.date` now carries the time-of-day). **`apps/mobile`, 2026-08-02:** the account name moved from the subtitle line (which crammed category, account, and tags onto one row) to a small second line under the amount, right-aligned — the subtitle is now just category + tags.
- **`apps/mobile`, 2026-08-02:** the rail's plain colour dot is now the transaction's own category/type
  icon (filled, tinted), doing what the separate icon badge next to the description used to — that badge
  is gone, since it was showing the same thing twice. The day-boundary "date header" (a separate
  full-width banded row) is gone too: the date now sits directly on the rail, right above that day's
  first transaction, as a small tight label — still shown exactly once per day, just costing one small
  text line instead of a whole extra row's height. Mocked up first (`docs/mockups/proposals/
  transactions-date-header-inline-tight-v3.html` and its predecessors).
- **`apps/mobile`, 2026-08-02:** the Category Picker's Vacation-mode explanation banner (why travel
  spend is tracked separately) is now dismissible — persisted per-event (`AsyncStorage`, not just
  per-session), so closing it once means it stays gone for the rest of that trip specifically, not just
  until the app restarts. The "Vacation On · {name}" status pill above it stays always-visible.
- **`apps/mobile`, 2026-08-06:** `CategoryPickerModal` now renders both the fixed intent groups and any
  user-created parent groups **fully alphabetically by label** (no group, including "Other", is pinned
  last — there was no functional reason for it to sit apart, just `INTENT_GROUP_META` declaration-order
  history), and sorts the categories within each group alphabetically by name too. The "Frequent"
  quick-pick row is unaffected (still sorted by `txnCountByCategory` descending).
- **`apps/mobile`, 2026-08-06:** `CategoryPickerModal` gained a `disabledCategoryIds` prop — tiles whose
  id is in the set render dimmed (opacity 0.35, matching `AccountChips`' existing disabled-tile
  convention) and non-pressable, without hiding them. Both "move transactions to a different category"
  destination pickers, which previously used a plain `SelectInput` dropdown, now reuse the same
  grouped/sorted tile-grid UI (via a shared internal `CategoryTileGrid`) with the source categor(y/ies)
  being emptied out disabled instead of filtered out of the list: `CategoryPickerModal`'s own bulk-move
  sub-picker (manage mode → multi-select → "Move all to…"), and `CategoryEditorModal`'s single-category
  "Move to…" picker (opens `CategoryPickerModal` itself as a nested select-only modal).
- Description is the first field in the Add form; as you type, Penny shows ranked type-ahead suggestions of remembered merchants beneath it (substring match). Each suggestion fills the merchant, category, account, and payment mode on tap — nothing changes until you tap. A merchant you've logged under more than one category surfaces as a separate suggestion per category, ranked by how often you use each.
- View annual analytics: an income line over monthly expense bars, last-year ghost bars for context, a 3-month forward projection (faded), a savings-rate headline, biggest category movers vs your trailing average, and a per-month breakdown
- **`apps/mobile`, 2026-08-02: Annual view now mirrors Monthly** — the Daily Living ring + top groups,
  the "Total spent" pulse card, the Cash Flow tile, the Events/Set-aside/Daily-routine-spending/hashtag
  breakdowns all appear in the annual view too, computed over the whole calendar year instead of one
  month (same aggregation helpers in `useExpenseAnalytics.ts`, scoped by year instead of month — not a
  second implementation). Nothing existing was removed: the savings-rate headline, income-vs-spend chart,
  and biggest-movers list are all still there. Order in both views: Daily Living card, (annual only:
  savings-rate headline, income-vs-spend chart), Total spent, Cash Flow, (annual only: biggest movers),
  Events, Set aside, Daily-routine spending, hashtags.
- **`apps/mobile`, 2026-08-02: "Total spent" pulse card** — the period total, the routine/set-aside/
  events breakdown (as dot+amount chips instead of a run-on sentence), the vs-prior-period trend, and the
  **recap** stats — net, transactions, top category, **avg/day** — all in one non-wrapping row. (Monthly
  only) **anomaly nudges** (a category spending notably above its trailing-3-month average) sit in the
  same card. The recap's own "spent" figure was dropped since it repeated the card's own hero number.
  Shown in **both** the monthly view ("vs last month") and the annual view ("vs last year") — same
  `PulseCard` component in `AnalyticsTab.tsx`.
- **`apps/mobile`, 2026-08-02: Cash Flow card** — one merged tile (monthly **and** annual), a 4-column
  grid — Initial / Income / Spend / **Computed left** — with the column labels shown once, above every
  account row (not repeated per row): that single header is what keeps every account's figures lined up
  in the same vertical columns. Values use a compact ₹79.6L-style format with an auto-shrink safety net so
  a large balance never wraps to a second line. "Computed left" is labelled explicitly (not just "Left")
  because it's a derived figure from your logged transactions — it matches the account's real running
  balance carried into the next period *unless* that account was reconciled during this one, in which case
  the row also shows the real reconciled figure and the gap against the computed one ("You reconciled to
  ₹X — ₹Y more/less than your logged transactions account for") — the one genuinely useful part of apps
  like Money Manager's monthly cash ritual, surfaced as a passive insight instead of a forced monthly step.
  Not a new "Cash Forward" ledger concept — entirely derived from the account's existing continuous balance
  model (`core/expenses/cashFlowSummary.ts`, generalized to take an explicit `{start, end}` range so the
  same function serves a month via `monthBounds()` or a year via `yearBounds()`), no period-bucketed
  storage.
- **`apps/mobile`, 2026-08-02: "View transactions" drill-down** — tapping a daily-routine category (in
  the expanded group breakdown), "View all transactions in {group}", any Set-Aside line (Lending & IOU,
  Goal contributions, Shared with family, a per-tag line), or an "Other hashtags" row opens a modal
  listing exactly those transactions for the selected month, right there in Analytics — no navigating to
  the Transactions tab, no manually reconfiguring the Filter popup one category at a time. Same drill-down
  exists on the **Accounts** page — tap any account row (previously inert) to see all its transactions.
  See `docs/features/accounts.md` and the `EntityTransactionsModal` architecture note for why this is an
  in-place modal rather than a deep-link.
- A "due to log" inbox surfaces recurring items (rent, bills, SIPs, salary) whose next occurrence has fallen due; confirm to log the real transaction, or skip — it reappears when the next period falls due
- Duplicate a transaction (from the edit form) and save any transaction as a reusable **template/favorite** — saved templates appear as one-tap chips above the transactions list (`transaction_templates` store)
- Swipe a transaction row left to reveal quick **Copy / Delete** actions; tap to edit
- Attach a **receipt photo** to a transaction — compressed and stored locally (encrypted); a paperclip marks rows that have one
- Filter transactions by date range, category, hashtag, account, event, goal, or transaction type — mix
  and match. **`apps/mobile`, 2026-08-02:** filtering by goal reuses whichever transactions any
  `GoalContribution` (any origin — manual or expense-seeded) links to, via `useExpenses.ts`'s
  `txnIdsByGoal` map; each Goal pill also shows the goal's own resolved icon (tinted by risk colour),
  matching the colour dot Event pills already had. The Account/Category tile grids in this same Filter
  popup now auto-fit 4–6 columns to the modal's actual measured width instead of a fixed-width tile that
  left unused space on a wider screen.
- View spending analytics: pie chart and bar chart by category, month-over-month comparison, and a spending trend line
- Set monthly budgets per category — opened from the **🎯 budget icon in the Transactions toolbar** (centred modal), not a separate tab — and see real-time progress bars; receive alerts when close to or over budget
- Mark an expense **Lent to** / an income **Borrowed from** a person to seed an IOU ledger entry; conversely, recording from the IOU screen creates the matching expense/income on a chosen account (see the IOU feature doc)
- Import transactions from a Penny CSV template, YNAB export, Cashew export, MoneyView export, or **any arbitrary CSV** (Custom, with a smart pre-filled column-mapping guess, not a blank one). Flow: map columns (Custom only) → a single merged **review** screen (accordion **Accounts** + **Preview** sections, in one continuous scroll — no separate resolve/preview steps, no tabs) → import (each row independent — one failure never blocks the rest) → done, with a real one-tap **undo** for the whole batch. The review screen is fully reactive: category/account resolutions, per-account and per-category ready/attention/duplicate counts, and a live "N rows read vs. M actual transactions" summary all recompute on every change — no category/account is actually created in the vault until the final "Import" tap. Accounts is a dense pill-row list (one row per distinct source account name, with a fuzzy "same account, written two ways?" merge suggestion where two names normalise to the same thing — both against **other source names in the same file** and against **accounts already in Penny**, e.g. "HDFC XX1234" vs. an existing "HDFC1234") and gates the import CTA; category resolution does **not** need to be 100%-complete to import — undecided categories just count toward "attention" and the batch imports with whatever's decided. Preview also surfaces structurally-unparseable rows (missing date/amount/description) inline with editable fields, distinct from category-undecided rows, and collapses confident **linked transfer pairs** (e.g. a cash withdrawal between two of the user's own accounts, within 3 days, matching amount, opposite direction) into one compact card counted once in the transaction total instead of two separate line items — and written as a single native transfer record (see below), not two independent expense/income rows. A pair involving an already-imported (duplicate) or skipped leg is still shown (never silently hidden) but visually marked "Already imported" and excluded from the count/write, same as a plain duplicate row. MoneyView-style monthly **carry-forward markers** (e.g. "Cash Forward" — leftover cash rolled from one calendar month into the next) are a separate, third case: not a spending category and not a transfer (there's no second account to pair with), so only the chronologically-earliest marker per account is ever imported (as a plain income row via the normal category flow); every later occurrence for that same account is redundant — already reflected in the real transactions in between — and is excluded from the batch, surfaced in its own distinctly-labeled "N recurring carry-forward markers excluded" card (never silently dropped). No two accounts (created via import or the manual Add Account form) may ever share the same name.
- Export all or a date-filtered slice of your transactions as an AES-256 password-protected ZIP file containing a CSV
- Set up recurring transaction rules (subscriptions, EMIs, salary, rent) with frequencies: daily, weekly, bi-weekly, monthly, quarterly, half-yearly, or yearly
- Pause recurring rules automatically while a vacation event is active (vacation guard)
- Tag transactions to life events (vacation, wedding, home renovation) for contextual spending views
- Organise categories into parent groups (e.g. "Food & Drink" → "Dining Out", "Groceries") and use hashtags for a third level of detail
- Manage categories from inside the Select Category popup: create/edit/rename, pick an icon from a curated visual grid **or search the full Tabler set**, recolor, move transactions to another category, delete empty custom categories (single or bulk), and create your own parent groups (creating a group requires ≥1 category under it). Income has the same category + group concept as expense.
- The category picker leads with a horizontally-scrollable **Frequent** row (your top 8 categories by actual usage) above the grouped list, so the common pick rarely needs a scroll. While a **Vacation** (immersive) event is active, Frequent is replaced by **Travel picks** (the Travel group's categories) plus a short note on why trip spend is tracked separately — a soft default, not a restriction: every other group stays one scroll away for the non-travel spend (medicine, EMI, a subscription) that still happens on a trip.
- Select multiple transactions in the Transactions tab (the list-check button → tap rows) and bulk-update them: change **category**, change **account + payment mode together** (coupled like the entry form — a cash account forces the cash mode), or **delete** the selection

## How it works

Transactions are stored in the encrypted `expenses` Dexie store. Each record includes: amount, merchant, categoryId, date, type (expense/income/transfer), hashtags array, accountId, toAccountId (for transfers), eventId, recurringRuleId, and an isRecurring flag.

The category system has three levels: intentGroup (parent group), ExpenseCategory (child category), and hashtags (free-form tags). Default categories are seeded from `defaultCategories.ts` at first run. A **Legal** intent group (Advocate Fee, Court Fee, Stamp Duty, Notary, Filing & Documentation, Affidavit, Typing & Printing, Exemption Fee, Legal Transport/Food, Other Legal Fees) ships as defaults and is back-filled to existing users via the additive `penny_cats_v4` seed in `useExpenses`.

**Daily-routine vs set-aside (analytics separation).** Each intent group carries a `routine` flag in `INTENT_GROUP_META` (`isRoutineGroup()` in `defaultCategories.ts`). The monthly Analytics tab leads with an **all-inclusive "Total spent this month"** (daily-routine + set-aside + events — `monthTotal`), then shows only **daily-routine** groups in the donut + "Daily-routine spending" list, so a vacation, family support, legal matter, financial move, or money lent never distorts the everyday picture. Travel carries **Trip Prep, Trip Shopping, Trip Fuel, Vehicle Service**; Daily Living adds **Fuel** (everyday) and **Salon & Grooming**; Home & Utilities adds **Home Services**; a new set-aside **Renovation** intent group ships Materials, Labour & Contractor, Furniture, Fixtures & Fittings, Painting, Interior & Design, Appliances, Other Renovation; Education adds **Transportation Fee, School Trip, Competition**. **Income** splits Dividends/Interest into two and adds **Capital Gains, Bonus & Incentive, Reimbursements**. Definition changes that must reach already-seeded records (renames/regroups, blank-icon repairs) are applied by once-flagged migrations in `dedupeDemoCategories.ts` (`repairCategoryIcons`, `reconcileDefaultCategories`); new categories arrive via the additive `penny_cats_v6` seed. Everything non-routine is summarised in a separate **"Set aside · not daily-routine"** card. Non-routine = the set-aside intent groups (**Financial, Travel, Family & Giving, Legal, Other**) **+ money you lent** (any IOU-linked transaction, regardless of its category) under a synthetic **Lending & IOU** bucket **+ (2026-07)** any expense shared into a **Family-type group** (its own **"Shared with family"** line) **+** any expense carrying a **Set Aside tag** (its own `#tagname` line, per tag — see below). Event/vacation-tagged transactions remain excluded from categories and shown under their own **Events** card (unchanged). Recap, anomalies, spend-velocity and the previous-month comparison all run on the daily-routine basis. Family support is a category (`cat-family-support` under `family_giving`), alongside **Occasions, Religious & Cultural, Donations,** and **Miscellaneous** (2026-07) — no IOU-model change. Legal categories are also wired into the Tax Footprint band map (`core/tax/categoryTaxMap.ts`): advocate/court/government fees are GST-exempt; ancillary spend (typing/printing, transport, food) carries GST.

**Three new default categories (2026-08-03)**, back-filled via the additive `penny_cats_v8` seed: **Food & Drinks** (`cat-food-drinks`, Daily Living — alongside the existing Groceries/Dining & Café, kept deliberately distinct despite the overlap), **Lending** (`cat-lending`, Family & Giving, expense), and **Borrowed Money** (`cat-inc-borrowed`, Income). The latter two exist for `ExpenseForm`'s Lent/Borrowed panel and bank-import's bulk equivalent, but are **free choice, not auto-assigned/locked** — a shared-bill split with a friend is often deliberately kept under its real category (e.g. Dining) for future reference, so forcing a generic category would lose that context; the existing Lending & IOU exclusion from daily-routine analytics (above) already works off the transaction's IOU link, not its category, so this doesn't weaken that separation. `cat-food-drinks` is `gst-5` and `cat-lending` is `exempt` (and excluded from the spend base entirely, alongside `cat-sip`/`cat-savings`) in `categoryTaxMap.ts`.

**Cash Income (2026-08-05)**, back-filled via the additive `penny_cats_v9` seed: **Cash Income** (`cat-inc-cash`, Income, `ti-cash`) — for informal/off-books cash earnings (tips, cash gigs, cash sales) that don't fit Salary, Freelance & Business, or the other named income categories. Distinct from the existing **Cash** payment mode (`paymentModes.ts`) — a transaction can be categorized "Cash Income" and paid via any payment mode, same as any other category/payment-mode pairing; the two aren't coupled.

**Family spend that shouldn't count as your own daily living (2026-07).** Two independent, non-exclusive paths land in the same "set aside" bucket, deliberately without a dedicated boolean field on the expense itself (a flag scoped to "family" doesn't generalise to a friend, colleague, or anyone else you support — see the design discussion for the fuller reasoning):
- **Set Aside tags** — any `hashtags` record can be marked `setAside` (once, per tag, in **Manage Tags** — Settings → Manage tags, or inline in the Add form's Tags panel the moment a brand-new tag is created). Every transaction carrying that tag is excluded from the daily-living split regardless of category, budgets are unaffected (a tagged grocery run still counts against your Groceries budget — tags only change the routine/set-aside split, not the money). `hideInSafeMode` is a second, independent field on the same record (Settings → Safe Mode → Tags) — a tag can be set aside without being hidden, or hidden without being set aside.
- **Sharing to a Family-type group** — any expense shared into a Family-type group (as opposed to Trip/Roommates) is excluded the same way, whether or not it ends up actually split. Family-type groups default the participant picker to just the person sharing it (no split) when enabled, since Indian family spend is usually one-directional; Trip/Roommates keep the existing "split evenly" default.

**Demo categories reuse the defaults.** `seedDemoData` references the real default category ids (via the key→id map in `dedupeDemoCategories.ts`) instead of minting a parallel `demo-cat-*` set, so the picker never shows a staple twice. Databases seeded before this fix are healed once by `dedupeDemoCategories()` (run once from `useExpenses`, flagged `penny_demo_cats_deduped`): it remaps expenses/budgets/templates/merchant-memory off any legacy `demo-cat-*` id to the canonical default and deletes the orphaned demo categories.

**Category management (Track 3)** lives in `src/features/expenses/categories/`. The `CategoryPickerModal` has a Select mode (tap to pick) and a Manage mode (edit/move/bulk/parent groups), opening `CategoryEditorModal` / `ParentEditorModal` (z-80) on top. Icons are stored as `ti-*` strings; the picker (`IconGridPicker`) shows a curated set from `core/expenses/categoryIcons.ts` and lazy-fetches `public/tablerIconIndex.json` (built by `scripts/build-icon-index.mjs` via `npm run gen:icons` / `predev` / `prebuild`) for search. Default categories are editable but not deletable. Custom parent groups are `ExpenseCategory` records flagged `isGroup`; children reference them via `parentId`. Grouping in the picker, analytics, and filters is unified through `groupKey`/`groupMeta` in `core/expenses/categoryGroups.ts` (`parentId ?? intentGroup ?? 'other'`). "Move transactions" reassigns `categoryId` (source survives); deleting a custom empty category also removes its budgets. Transaction-level bulk edits (`patchExpenses`/`removeExpenses` in `useExpenses`) power the Transactions-tab select mode.

**Category tile style + quick-pick rows.** Category tiles use the **icon-tile selector** pattern (see `docs/DESIGN_GUIDELINES.md`): a filled, colour-coded rounded-square icon with the label outside/below it, 6 per row — replacing an earlier bordered-box tile that crammed icon + label into one box. `AccountChips` and `PaymentModeChips` (the Account / Paid via rows on the Add/Edit form) use the same tile treatment for visual consistency. Above the grouped grid, a `QuickPickRow` (shared between Frequent and Travel picks) renders a horizontally-scrollable row of larger tiles: normally **Frequent** (top 8 by `txnCountByCategory`, count > 0); while an `activeVacationEvent` is passed in (an active `immersive`-subtype event from `EventModeContext`), it swaps to **Travel picks** (categories under the `travel` intent group, declared order) with a "Vacation On · {name}" pill and an info banner explaining that travel spend is tracked separately from everyday budget — no category is ever hidden or blocked, the full grouped list is unchanged below either row.

**`apps/mobile`, 2026-08-03: payment mode is a creatable, editable entity.**
`PaymentModeChips` (the "Paid via" row) ends with a dashed "+" tile, same pattern as
`AccountChips`' own inline "+ Add account" — opens `PaymentModeFormModal` (name, icon via the
shared `IconGridPicker`, colour swatch) and writes to the `payment_modes` store
(`core/expenses/paymentModes.ts`'s `generatePaymentModeId` slugifies the name into a stable id,
deduping against whatever already exists). This was originally built to let **Bank Statement
Import** (see [`docs/features/bank-import.md`](bank-import.md)) create a rail-specific mode
(NEFT/IMPS/RTGS/Cheque) it infers from a bank narration; the manual "+" tile is the equivalent
user-initiated path onto the same store.

Unlike the first pass (which kept the 5 built-ins as a never-persisted, read-time-only overlay),
all 5 (cash/upi/card/net/wallet) are now seeded as real rows too (`~/hooks/usePaymentModes.ts`,
mirroring how `expense_categories`' own defaults are seeded) — this is what makes editing a
default's icon/colour/label possible at all, the same way a default `ExpenseCategory` already
works. The Accounts page's new **Payment modes** section (`features/accounts/PaymentModesSection.tsx`)
lists every mode as an icon tile with a small pencil badge — tap to edit (defaults included) or
add a new one; delete lives in the same popup, blocked for defaults and for any custom mode still
in use by an existing transaction. `IconGridPicker` (previously `features/expenses/categories/`-
only) moved to `components/shared/` so this form and `CategoryEditorModal` can both use it without
a cross-feature import.

**Safe Mode masking (per-category).** Each `ExpenseCategory` carries an optional `hideInSafeMode` flag toggled from Settings → Safe Mode (ON = hidden in Safe Mode, matching the field name). An explicit value always wins; when unset, `isHiddenInSafeMode()` (`core/expenses/categoryGroups.ts`) falls back to a per-intent-group default — **income, transfers, family & giving, legal, sin goods, and financial default hidden (toggle ON)**; everyday categories (daily living, home & utilities, lifestyle, etc.) and custom categories default **visible (toggle OFF)**. `TransactionsTab` and `BudgetsTab` resolve masking per row via `usePrivacy().shouldMask(isHiddenInSafeMode(cat))` — Open never masks, Privacy always masks, Safe masks only that category's rows. Aggregates (the "Total spent" header, monthly/annual analytics totals and category-breakdown segments, "Safe to spend") are treated as summary views and stay visible in Safe Mode (`shouldMask(false)`), hidden only in Privacy — Analytics does not currently drill down to per-category Safe Mode masking, only the flat Transactions list and Budgets do. See `docs/ARCHITECTURE.md` → Context providers for the `shouldMask` contract, and `docs/SCHEMA.md` → `expense_categories`/`accounts` for the flag definitions.

Account balances are derived, not stored — every balance is calculated from the opening balance plus all income, minus all expenses, plus net transfers. This means the expenses store is the single source of truth for account balances.

**Import (rewritten 2026-07-28; review screen merged 2026-07-28).** One generic column-matching engine (`importMatcher.ts`) — Penny/YNAB/Cashew/MoneyView are presets (priority-ordered synonym lists) over it, not bespoke per-format parsers; Custom uses the same engine with no format bias, so its starting guess is never blank. Column resolution is two-pass (exact header match across all columns, then substring) so a more specific column (e.g. MoneyView's "Account Id") wins over a more generic one (e.g. "Bank Name") regardless of column order — found via real MoneyView export data, which has both, and whose actual shape (split `Credit`/`Debit` columns, no single "amount" column; a `Merchant/Receiver/Sender` description header) the original per-format parser didn't handle at all. Category/account resolution (`importCategoryResolution.ts` / `importAccountResolution.ts`) suggests once per **distinct source value**; a source category that looks like inter-account bookkeeping (e.g. Cashew's "Balance Correction", MoneyView's "A/c to A/c") is offered as a proper `type: 'transfer'` resolution against `DEFAULT_TRANSFER_CATEGORIES`, not forced into a spending category. A third, distinct case (found 2026-07-29): MoneyView's "Cash Forward" and similar carry-forward markers (`isLikelyCarryForward()`) look similar but aren't transfers at all — there's no second account to pair with, and writing one as an unpaired `type: 'transfer'` row would incorrectly *decrease* the account's calculated balance (`balanceCalculator.ts`'s `delta()` treats any unpaired transfer as a debit against its own account, regardless of the source row's real direction — carry-forward rows are always an inflow). `importCarryForward.ts`'s `identifyRedundantCarryForwardRows()` groups these rows **per account** (never globally) and keeps only the chronologically-earliest one — Penny computes balance continuously (`openingBalance` + every transaction's delta) so it never needs more than that one marker; every later occurrence for the same account is redundant and excluded from the write, surfaced in the review screen's dedicated `CarryForwardExcluded.tsx` card rather than silently dropped. The earliest occurrence itself isn't special-cased further — it just flows through the normal category-tile resolution as a plain (never pre-suggested-as-transfer) category, same as any other unrecognised source name. `importTransferPairing.ts`'s `detectTransferPairs()` conservatively pairs two rows into one displayed "linked transfer" only when confident (same amount within a paisa, opposite expense/income direction, two different accounts, dates within **3 days** of each other — widened from 1 day to tolerate real-world data-entry lag, confirmed against a real MoneyView export with a 2-day gap — at least one side transfer-like or both sharing an identical title+note) — never on category match alone, since a wrong pairing would misrepresent the user's data. Every detected pair is shown in the "Linked transfers" list, even one whose leg is a duplicate/skipped row (marked "Already imported" rather than silently hidden, so a re-uploaded file's already-imported transfers are still visible, just excluded from the count). Unparseable rows are surfaced with a reason (never silently dropped) and editable inline. The former separate Resolve and Preview steps are now one **review** step (`ReviewStep.tsx` + `src/features/import/review/`): the live preview (`buildResolvedPreviewRows` output, ready/attention/duplicate counts, per-account/per-category breakdowns) is computed reactively via `useMemo` off the in-progress resolutions — nothing is written to the vault until the single final "Import" action, which is when `useImport`'s `commitAndImport()` creates any new categories/accounts (deduping two source account names that share an identical merge-suggested name+type into one real account, and — app-wide rule — never creating a second account sharing an existing account's exact name; see `core/accounts/accountValidation.ts`'s `findDuplicateAccountName()`) and calls `importWriter.ts`. Each CONFIRMED transfer pair (both legs ready) is collapsed via `importPipeline.ts`'s `applyConfirmedTransferPairs()` into ONE `ResolvedPreviewRow` — `type: 'transfer'`, `accountId` = the outgoing account, `toAccountId` = the incoming account — matching Penny's native transfer model (a single `Expense` record, not two independent expense/income rows that used to double-debit both accounts instead of debiting one and crediting the other). `importWriter.ts` writes each row independently (one failure never blocks the rest, and is retryable) and persists `toAccountId` when present; it also logs an activity-log entry whose snapshot is the created expense ids — the whole batch can be undone via `undoImportBatch()`, the mirror-image of the existing delete-undo mechanism (which re-inserts a snapshot; import-undo deletes one instead). **`apps/mobile` now mirrors this flow in full** (ported 2026-07-29, see Mobile section below) — same reactive review screen, Custom format, and retry/undo-capable Done step. Export produces a ZIP (using zip.js) with AES-256 encryption; the password is chosen by the user at export time.

**Two real bugs found and fixed 2026-08-06, both specific to RN Web (`apps/mobile` run via `pnpm web`)
— a blank screen immediately on selecting a file to import:**
1. `~/components/ui/SearchInput.tsx` had `{value && (<Pressable>...)}`, where `value` is a plain
   `string` prop — an empty string isn't `false`, so React renders it as a literal (empty) text node.
   Native RN silently tolerates a stray text-node child of a `View`; react-native-web's stricter DOM
   rendering throws "Unexpected text node" warnings for it. Fixed to `{value.length > 0 && (...)}`.
   Several other components have the identical risky pattern (`Banner`, `Badge`, `EmptyState`,
   `FormField`, `OptionButton`, `TextInput`'s prefix/suffix, `Button`'s icon, `SegmentedControl`,
   bank-import's `Pill`) — none of them are actually reachable from the CSV-import screen today (none
   currently get passed an empty string), so they're latent, not live, but worth hardening the same way
   the next time one of them is touched.
2. `ImportPage.tsx`'s `stepBack` callback depended on the *entire* `useImport()` return object (`imp`)
   instead of just the stable `setStep` setter it actually calls — `useImport()` returns a fresh object
   literal every render (never memoized), so `stepBack` got a new identity on every render, which fed
   into `useRegisterHeaderScreen`'s own `useFocusEffect` (whose deps include this screen's
   `backHandler`), re-firing `setScreen(...)` on the shared header context every render → re-render →
   new `imp` → new `stepBack` → forever. This is the actual "Maximum update depth exceeded" crash —
   reproducible on any CSV import regardless of file size, since it has nothing to do with data volume.
   Fixed by destructuring `setStep` out of `imp` first and depending on that directly — the exact same
   bug, already found and fixed once before in the parallel `BankImportPage.tsx` (see
   `docs/features/bank-import.md`), which this port didn't inherit the fix for.

**Three more real bugs found and fixed 2026-08-06, in this generic CSV/Cashew/YNAB/MoneyView import
flow specifically (distinct from Bank Statement Import — see `docs/features/bank-import.md`):**
1. The Done step's "Go to Expenses" button called `navigation.navigate('Expenses')`, but `ImportPage`
   is pushed as the `'Import'` route inside `ExpensesStack` (which has no route named `'Expenses'`,
   only `'ExpensesMain'`/`'Import'` — `'Expenses'` only exists as the parent `Tab.Navigator`'s screen
   name in `MainTabs.tsx`). Since that tab was already focused, the call bubbled up and no-op'd
   silently — the button appeared broken on both the normal "just imported" Done screen and the
   "import undone" Done screen (same `onDone` prop). Fixed to `navigation.goBack()`, the same
   already-proven-correct pattern `BankImportPage.tsx` uses for its own Done step.
2. `useImport.ts` had no equivalent of `useBankImport.ts`'s `txnCountByCategory` memo, so
   `CategoryTile`'s "Map Existing" → `CategoryPickerModal` never got a `txnCountByCategory` prop and
   silently lost its "Frequent" quick-pick row for this import flow. Fixed by computing the same
   per-category count map off the already-fetched expenses list (see bug 3 below) and threading it
   through `ImportPage` → `ReviewStep` → `PreviewSection` → `CategoryTile` → `CategoryPickerModal`.
3. `useImport.ts`'s one-shot reference-data effect (`expenseCategoriesRepo.getAll()` /
   `expensesRepo.getAll()` / `accountsRepo.getAll()`, empty deps, silently-swallowed `catch`) could
   permanently leave `categories`/`accounts` empty for the entire Import session: category/account
   repos decrypt via `keystore.getMasterKey()`, which throws synchronously if the encryption session
   isn't unlocked yet — a real, transient race (e.g. a privacy/PIN re-lock timer firing right as the
   user navigates into Import). Since the effect never retried, hitting that race once meant every
   subsequent "Map Existing" category picker opened completely empty with no indication why —
   matching the confirmed repro ("during import of bank statement or other app data when mapping
   transactions to an existing category"). Fixed with a 3-attempt retry with backoff (300ms/800ms/
   1500ms) before giving up; if all retries are exhausted, `categoriesLoadError` is exposed from the
   hook and `ReviewStep.tsx` shows an inline "Couldn't load categories — tap to retry" affordance
   (`onRetryLoadCategories`, wired back to the same `loadReferenceData` function).

**Rejected-row editor now shows the full original row, 2026-08-06.** `UnparsedRows.tsx`'s
`RejectedRowEditor` previously only prefilled Date/Amount/Description from `RejectedRow.raw` (the full
original CSV columns for that row, already carried on the type but never rendered beyond those 3
fields) — a row rejected for e.g. "Missing description" showed only "Row 12 · Missing description" with
no way to see what the source file actually contained short of opening the CSV outside the app. Fixed
by rendering every `row.raw[i]` value labeled with its original header column name (`header[i]`,
threaded down from `useImport.ts`'s existing `header` state via `ImportPage` → `ReviewStep` →
`PreviewSection` → `UnparsedRows`, falling back to "Column N" for any index without a header label).

**Bulk row-select within a category tile, 2026-08-06 — ported (in scoped-down form) from Bank
Statement Import's bulk-select.** Bank-import's own bulk-select lets the user check an arbitrary subset
of rows and bulk-apply a decision to just those (`docs/features/bank-import.md`'s "Not yet logged"
bucket). This generic CSV import flow's resolution model is structurally different — `CategoryResolution`/
`toConfirmedCategoryMap`/`buildResolvedPreviewRows` are all keyed only by **source category name**, never
by individual row, so one resolution decision has always applied to every row sharing that name by
construction. Full parity (arbitrary rows spanning multiple source-category groups) would need a bigger
pipeline change than this feature is worth; what got built instead, per explicit user decision, is scoped
to **within one already-expanded `CategoryTile`**: check a subset of that tile's own rows (not none, not
all — selecting everything is equivalent to the tile's own group-level decision, so no override kicks in
below that threshold) to reveal:
1. A **"Move N selected to…"** button, opening the same `CategoryPickerModal` "Map Existing" already
   uses, moving just the checked rows to a different existing category — the rest of that source
   category's rows keep whatever the tile's own group-level resolution says. Deliberately narrower than
   bank-import's bulk actions: a row-level override can only ever move to an EXISTING category, never
   create/skip/mark-as-transfer — those remain exclusively group-level decisions.
2. The tile's existing **"Tag all transactions" field switches meaning** while a strict subset is
   checked — it reads/writes only the SELECTED rows' own tag (placeholder changes to "Tag N selected"),
   instead of the whole tile's group-level tag, so tagging a subset never touches the rest of the
   group's tag. Selecting 0 or literally everything reverts it to the plain group-level field, unchanged.
- **Core (`packages/core/src/core/import/importPipeline.ts`)**: a new `RowOverride` type
  (`{ categoryId?, categoryName?, tag? }`) and a new optional 5th parameter on `buildResolvedPreviewRows`
  — `rowOverrides?: Map<number, RowOverride>`, keyed by plain index into `parsedRows` (a stable identity
  for one review session since that array is append-only, never reordered/spliced). When present for a
  row, its `categoryId`/`categoryName` win over the group's resolution entirely (including un-skipping a
  row whose group resolved to 'skip', and reverting `type: 'transfer'` back to the row's natural
  expense/income type — a row-level move always means "resolve to a normal category"); its `tag`
  replaces (not adds to) the group's own tag for that row only.
- **`useImport.ts`**: new `rowOverrides` state, `moveRowsToCategory(rowIndices, categoryId, categoryName)`
  and `tagRows(rowIndices, tag)` mutators, threaded into both the live `preview` memo and
  `commitAndImport()`'s final write. `rowTriage` treats any overridden row as `'ready'` (an explicit
  per-row decision, same as a touched group-level resolution).
- **UI** (`CategoryTile.tsx`): a checkbox per row (only reachable once the tile is expanded), a
  "Select all"/count header, and a "show all"/"show fewer" toggle for tiles with more than 8 rows (the
  original hard 8-row cap stayed for the collapsed default view, but selection needs to reach every row,
  not just the ones currently rendered). An overridden row shows "· moved to X" / "· #tag" inline so its
  divergence from the rest of the group is visible without re-opening the picker.

The feature is organised as **vertical slices** (mirroring portfolio): `ExpensesPage.tsx` is a thin
shell that renders `ExpensesHeader` + a tab strip and dispatches to one self-contained slice per tab.
Tabs are **Transactions (default) · Analytics · Subscriptions · IOU**; **Budgets** is no longer a tab —
it opens as a centred modal from the 🎯 icon in the Transactions toolbar (`BudgetsSlice overlay`).
Each slice owns its own state, modals, and FAB. Shared expense data comes from `useExpenses`; the IOU
tab reuses `src/features/iou/` (`useIou`, `IouView`) via `IouSlice` — IOU has no standalone route (the
former `/app/iou` page was removed; the Home Net Worth IOU line opens this tab). The transactions list is
`TransactionsTab` — a day-grouped **timeline** on a single uniform
background (`SwipeableRow` foreground uses `bg-surface-3`); same-day ordering is by full timestamp
(`b.date - a.date || b.createdAt - a.createdAt`), with `lib/date.dateInputToEpoch` stamping the
time-of-day on form save. **Transfer rows show both accounts, 2026-08-06:** the small account-name line
below the amount previously showed only the source account (`accountMap.get(txn.accountId)`) even
though the destination (`Expense.toAccountId` — a transfer is one record, not two paired rows; no async
lookup needed, `accountMap` already has both) was sitting right there unused. A transfer row now shows
`{fromAccount} → {toAccount}` in that same slot, so confirming a transfer's destination no longer
requires opening the row.

**Payment-mode mismatch: correction UX + persistent surfacing (2026-08-06).** Follow-up to bank-import's
mismatch flag (see `docs/features/bank-import.md`) after user feedback on the edit form's presentation:
- `ExpenseForm`'s "Matched from bank statement" audit-trail note (docs/plans/bank-statement-import.md
  §10a) was a cropped single-line icon+text row (`numberOfLines={1}`) that also didn't follow the app's
  info/warning/success `Banner` convention at all. Now a proper `Banner` (`variant="info"`), full text
  wrapping, no truncation.
- Directly below it, a second `Banner` (`variant="warning"`) shows the SAME payment-mode mismatch
  comparison bank-import already flags at import time — re-run live here via `inferPaymentMode()` +
  `usePaymentModes()` against the form's current `paymentMode` state (not a frozen import-time
  snapshot), so picking a different "Paid via" chip makes the warning disappear immediately. This is
  also where the user actually corrects a mismatch — no new "fix" affordance was added anywhere else;
  the picker was already right there.
- **Persistent surfacing past the one-time import review or a single edit**: `useExpenses.ts`'s new
  `paymentModeMismatchTxnIds` (a `Set<string>`, `useMemo`'d off the existing `bankImportLinkByTxn` audit
  map + `inferPaymentMode` + each expense's current `paymentMode` — no schema change, nothing persisted,
  same "derived, not stored" principle account balances already follow) now covers **every** past
  import, not just the one currently being reviewed, and is automatically self-healing the moment a
  mismatch is fixed. Two consumers:
  1. `TransactionsTab.tsx` shows a small `ti-alert-triangle` icon next to a flagged row's title, same
     conditional-icon pattern already used for the receipt/shared-group/goal-linked icons.
  2. A new "Payment mode mismatch" toggle in `FilterModal.tsx`/`useTransactionFilters.ts` (a single
     boolean, not a multi-select set like the other filters — there's only one thing to filter by) lets
     the user isolate flagged transactions instead of having to scroll a long list looking for the icon;
     the section only renders at all when at least one mismatch exists (same convention already used
     for Event/Goal). No dismiss/acknowledge mechanism was added for an intentionally-different
     recorded mode — deferred until it's actually shown to be a real annoyance in practice, per
     explicit decision, rather than building it speculatively.

**IOU ↔ transactions:** an expense/income can seed an IOU entry (`useExpenses.seedIouFromExpense` +
`core/iou/expenseLink`), and the IOU screen can create the matching expense/income — linked both ways
by `LedgerEntry.linkedTxnId`, so deleting either side cascades. Because the IOU screen writes through
separate repo instances, it broadcasts `penny:txn-changed` (`hooks/useTxnRefresh`); `useExpenses`,
`useForecast`, `useHome`, and `useAccounts` listen and reload so balances/forecast/net-worth stay live.

Key files:

- `src/features/expenses/ExpensesPage.tsx` — thin shell: header + tab strip → slice components
- `src/features/expenses/transactions/` — transactions slice: filter bar, list, `ExpenseForm`, filter hook
- `src/features/expenses/analytics/` — analytics slice + `useExpenseAnalytics` derivations
- `src/features/expenses/categories/` — category manager: `CategoryPickerModal`, `CategoryEditorModal`, `ParentEditorModal`, `IconGridPicker`
- `src/core/expenses/categoryGroups.ts` — `groupKey`/`groupMeta`/`buildParentCategoryMap` grouping helpers
- `src/core/expenses/categoryIcons.ts` — curated icon set + shared `CAT_COLORS`
- `scripts/build-icon-index.mjs` — generates `public/tablerIconIndex.json` for icon search
- `src/features/import/` — import wizard as step slices (`UploadStep`/`MapColumnsStep`/`ReviewStep`/`DoneStep`) + `useImport` hook
- `src/features/import/review/` — the merged review screen's sub-components: `AccountsSection.tsx` (dense pill-row accounts list — same-file merge suggestion AND a separate "same account, written differently?" banner for a fuzzy match against a real existing account), `PreviewSection.tsx` (summary + unparsed rows + transfer pairs + category tiles), `CategoryTile.tsx` (per-source-category tile — its 4 action pills (Map Existing/New Category/Skip/Mark as Transfer) sit in a horizontally-scrollable single row rather than wrapping; "Map Existing" opens `expenses/categories/CategoryPickerModal.tsx` in select-only mode — Penny's real grouped-by-intent-group category picker — instead of a flat dropdown, so mapping an import source to an existing category shows the same hierarchy as everywhere else in the app; each tile also has an optional "Tag all transactions" field that applies one custom hashtag to every transaction under that source category, independent of which category it resolves to; a bulk row-select mode (2026-08-06, see the dated section above) lets a checked subset of the tile's own rows be moved to a different existing category and/or tagged independently of the rest of the group), `TransferPairCard.tsx` (dims + labels "Already imported" when its pair's `alreadyImported` flag is set), `UnparsedRows.tsx`, `CarryForwardExcluded.tsx` (distinctly-labeled card listing every redundant carry-forward marker excluded from the batch, per `importCarryForward.ts` — never silently dropped), `Pill.tsx` (compact pill action button, single-consumer so it lives here rather than `components/ui/`), `accountMergeSuggestion.ts` (same-file merge suggestion; its `normalize()` fuzzy-matching helper now lives in `importAccountResolution.ts` since it's shared core matching logic, not UI-only)
- `src/core/import/importMatcher.ts` — the generic column-guessing engine (exact-then-substring header matching, split debit/credit + single-amount resolution, flexible date parsing) every format preset sits on top of
- `src/core/import/importParsers.ts` — CSV tokenizer, the 5 format presets (Penny/YNAB/Cashew/MoneyView/Custom) over importMatcher, rejected-row tracking
- `src/core/import/importCategoryResolution.ts` — per-distinct-source-category resolution (existing/transfer/create/skip), transfer-keyword + intent-group-keyword suggestion, `isLikelyCarryForward()` (carry-forward-keyword detection, kept separate from `isLikelyTransfer()`'s keyword list)
- `src/core/import/importCarryForward.ts` — `identifyRedundantCarryForwardRows()`: per-account, chronologically-earliest-only resolution for MoneyView-style carry-forward markers (a row-level exclusion, distinct from category-name-level resolution)
- `src/core/import/importAccountResolution.ts` — per-distinct-source-account resolution (existing/create), `normalize()` (shared fuzzy-match helper), and `fuzzyExistingMatch` on `AccountResolution` (a normalized-fuzzy, never-auto-applied match against a real existing account)
- `src/core/import/importPipeline.ts` — dedup keys (incl. in-batch), the resolution-based preview-row builder, `applyConfirmedTransferPairs()` (collapses a confirmed transfer pair's two rows into one `toAccountId`-carrying row before write), plus a **legacy** section (`matchCategory`/`buildPreviewRows`) that predates the 2026-07-28 resolution-based rewrite — kept only so any old references still compile; no current caller on either platform uses it. `toConfirmedCategoryMap()` takes an optional per-source-category `tags: Map<sourceName, tag>` (from `CategoryTile`'s "Tag all transactions" field), normalises it (trim/strip leading `#`/lowercase, same as the manual hashtag input elsewhere), and `buildResolvedPreviewRows()` appends it onto each matching row's own `hashtags` (deduped, never overwritten) — reflected live in the preview and applied identically at `commitAndImport()`.
- `src/core/import/importTransferPairing.ts` — conservative `detectTransferPairs()` for the review screen's "linked transfer" cards (3-day date tolerance)
- `src/core/import/importWriter.ts` — partial-success-tolerant batch writer (persists `toAccountId`) + `undoImportBatch()`
- `src/core/accounts/accountValidation.ts` — `findDuplicateAccountName()`, the app-wide no-duplicate-account-name check shared by the manual Add Account form and the import flow's account-creation path
- `src/core/export/exportCsv.ts` — CSV generation + AES-256 ZIP creation
- `src/core/db/defaultCategories.ts` — seed categories and intent groups
- `src/features/settings/ManageTagsPage.tsx` (2026-07) — search + per-tag Set Aside toggle, reachable from Settings and from the Add form's Tags panel
- `src/hooks/useDataRefresh.ts` — `notifyTagsChanged`/`useTagsRefresh`, same cross-instance live-refresh pattern as categories/accounts

**Mobile (`apps/mobile`):** ported in Track 4 (ninth module, ~7,532 web lines across 33 files — comparable in size to Portfolio, the previous largest) — `apps/mobile/src/features/expenses/` mirrors the web structure (`useExpenses.ts`, `ExpensesPage.tsx`, `ExpensesHeader.tsx`, `categories/`, `budgets/`, `analytics/`, `events/`, `transactions/`, thin `subscriptions/`/`iou/` slice wrappers reusing the already-ported Subscriptions/IOU modules). CLAUDE.md flagged this module's swipe gestures and SVG chart as the two hardest ports in the whole migration; both were solved rather than simplified, per explicit user decisions:
- **Swipe-to-reveal row actions** (`transactions/SwipeableRow.tsx`) — web's hand-rolled Pointer-Events implementation was rebuilt on `react-native-gesture-handler`'s `ReanimatedSwipeable` (new native dep, needs `GestureHandlerRootView` wrapping the app root, done in `App.tsx`) rather than a hand-rolled Reanimated-only reimplementation.
- **Two SVG charts** (`analytics/AnnualChart.tsx`'s bar+line chart, `analytics/AnalyticsTab.tsx`'s `IntentDonut`) — both ported as plain `react-native-svg`, no new charting library. The donut reuses the exact multi-arc "one stroked circle per segment" technique already proven in Health's `FinancialHealthCard` score ring.
- **Receipt attachment** (web's `<input type="file">` + canvas-downscale flow) — built now with two new native deps, `expo-image-picker` (camera + library) and `expo-image-manipulator` (canvas-downscale equivalent); a new mobile-only `apps/mobile/src/lib/receiptImage.ts` (not a `.native.ts` sibling — the input type is fundamentally different, a picker URI vs. a browser `File`) wraps both into `captureReceiptPhoto()`/`pickReceiptPhoto()`, returning the same downscaled JPEG data-URL shape web stores.
- **CSV/ZIP export** (`ExpenseExportModal.tsx`) — built now via a new `core/export/exportCsv.native.ts` sibling using `expo-file-system` + `expo-sharing` (same pattern as Home's Stories share flow), replacing web's Blob/object-URL/synthetic-`<a>` download.
  - **A real, hard-to-diagnose bug found and fixed 2026-08-05:** the password-protected ZIP export
    (`downloadProtectedZip`) reliably threw `TypeError: undefined is not a function` on native only
    (worked fine on RN Web). Root cause, found via a real stack trace captured through `adb logcat`
    (the on-device error overlay only ever showed the bare message with no origin, since RN's LogBox
    doesn't render a caught `Error`'s own `.stack` unless it's logged as its own string): `TextReader`
    (used to feed the CSV string into `@zip.js/zip.js`'s `ZipWriter`) extends zip.js's `BlobReader`,
    whose `readUint8Array()` calls `blob.arrayBuffer()` on a `Blob` it builds internally — but RN's own
    `Blob` class (`Libraries/Blob/Blob.js`) implements exactly `constructor`/`slice()`/`close()`, no
    `.arrayBuffer()` at all. Fixed by using `Uint8ArrayReader` (a direct, Blob-free `Reader`) fed
    pre-encoded bytes via `TextEncoder` instead of `TextReader` — the same underlying
    RN-Blob-incompatibility class of bug as the Loan Planner's `downloadXlsx` fix the same day (see
    `docs/features/loans.md`'s "Download XLSX" entry), just a different missing method in a different
    library. Two other theories were seriously investigated and
    ruled out via direct Node reproductions before finding the real cause (kept only as a cautionary
    note, not current behavior): `react-native-quick-crypto`'s WebCrypto shim breaking zip.js's
    AES-256/PBKDF2 path, and RN lacking the Streams API entirely — neither reproduced this error.
    Separately, `@zip.js/zip.js` itself had to move from a lazy `await import(...)` to a static
    top-level import (and an explicit `@zip.js/zip.js/index-native.js` subpath, not the bare specifier)
    after its dynamic import reproducibly crashed Metro's async-require mechanism with `Requiring
    unknown module "NNNN"` — confirmed not a stale-cache issue (reproduced across multiple from-scratch
    rebuilds) and not fixed by disabling Metro's dev-only lazy-bundling (`EXPO_NO_METRO_LAZY=1`).
- **`EventModeContext`** (vacation/trip mode) — ported as a real prerequisite (not dropped): unlike IOU/Home's single droppable Groups banner, event tagging is threaded through filtering, analytics, and the header banner, so it was ported in full (`apps/mobile/src/context/EventModeContext.tsx`, AsyncStorage-backed).
- **Groups (Tier 2), initially dropped everywhere it appears** (`ShareToGroupModal` skipped, `shareGroups`/`onShareToGroup`/`onShareLater`/`familyGroupIds`/the Share swipe action removed — same personal-only-scope precedent as IOU/Home/Portfolio) **— restored once Groups was ported to mobile**: `apps/mobile/src/features/expenses/transactions/ShareToGroupModal.tsx` ports the web modal; `shareGroups`/`onShareToGroup`/`onShareLater`/`sharingExpense`/the Share swipe action are back in `ExpensesPage.tsx`/`TransactionsTab.tsx`/`TransactionsSlice.tsx`/`ExpenseForm.tsx` (the restored "Share with a group" toggle), `familyGroupIds` is back in `useExpenseAnalytics.ts`/`AnalyticsSlice.tsx`, and `EventsModal.tsx`'s inline `VacationGroupLink` sub-section is restored too. See [`docs/plans/mobile-migration.md`](../plans/mobile-migration.md)'s Groups progress-log entry.
- `IconGridPicker.tsx`'s icon-search index (`tablerIconIndex.json`, fetched at runtime on web via `import.meta.env.BASE_URL`) is bundled directly as a static JSON import on mobile instead — no runtime fetch needed.
- A real shared-component bug found and fixed during on-device verification: `apps/mobile/src/components/ui/TabStrip.tsx`'s `scrollable` mode wrapped its row in a bare `<ScrollView horizontal>` with no `flexGrow: 0` — as a flex child in a column layout, an unconstrained horizontal `ScrollView` stretches to fill all remaining vertical space, pushing its own content down to vertically center inside the oversized box. Fixed with an explicit `style={{ flexGrow: 0 }}`; benefits every other screen using `TabStrip`'s scrollable mode, not just Expenses.
- **A real, severe scaling bug found during Demo Mode on-device verification (Onboarding track):** `TransactionsTab.tsx` originally rendered its full list via a plain `View`+`.map()` inside `TransactionsSlice.tsx`'s wrapping `ScrollView` — harmless on web's DOM, but with a demo-sized dataset (~1,000 transactions) this mounted ~1,000 `SwipeableRow` (`react-native-gesture-handler`) instances simultaneously, crashing severely enough on-device to restart the emulator, not just the app. Fixed by rebuilding `TransactionsTab` on a virtualized `SectionList` (`grouped` day-buckets become `sections`, same row/rail/swipe-action visuals via `renderItem`/`renderSectionHeader`) and removing the now-redundant wrapping `ScrollView`. Verified on-device against the full ~1,000-row demo dataset post-fix. See [`docs/plans/mobile-migration.md`](../plans/mobile-migration.md)'s Onboarding progress-log entry for full detail (including a related `schema.native.ts` `expo-sqlite` concurrency fix found in the same investigation).
- **Import** (`apps/mobile/src/features/import/`) was fully rebuilt 2026-07-29 to match web's resolution-based rewrite + merged review-screen redesign (see the Import section above) — the Custom/map-your-own-columns format, the live Accounts+Preview review accordion, and the retry/undo-capable Done step are all now ported. `SelectInput` (`components/ui/`) gained a `triggerClassName` prop (matching `TextInput`'s existing `inputClassName`) to support the pill-styled kind-dropdown/tag-box treatment; web's `position: sticky` progress header became a fixed `View` above a `ScrollView` (RN has no CSS sticky).

## Current limitations

- No SMS parsing or bank statement auto-import — all transactions must be entered manually or imported via CSV/export file
- Category icons use the Tabler webfont; the picker exposes a curated grid + search rather than arbitrary SVG uploads
- Bulk operations exist for categories (category manager) and individual transactions (Transactions tab select mode → change category, change account + payment mode together, or delete); the account+payment editor enforces the same coupling as the entry form, and only the fields you set are written. Bulk edits don't change a transaction's type.
- Icon search requires the index to load (lazy fetch); offline, only the curated icon grid is available
- Analytics charts are month-based; custom arbitrary date range analytics are not yet supported
- The Set Aside tag / Family-group-share exclusions (2026-07) only apply to the Analytics tab's routine/set-aside split (`useExpenseAnalytics`). The Home dashboard's "daily living this month" glance stat (`useHomeStats`) and Health Score use a simpler, independent routine calculation that doesn't yet know about IOU-linked, Set-Aside-tagged, or Family-group-shared exclusions — a pre-existing scope boundary, not new to this change

## Planned improvements

- Phase 2: AI auto-categorisation — when you type a merchant name, Chip suggests the category based on your history and a merchant database (via a Cloudflare Worker, never raw data)
- Phase 2: Bank statement PDF import — upload a PDF statement and Penny parses transactions automatically

## Ideas welcome

- Which banks' PDF statement formats would be most useful to support first?
- Should there be a "split transaction" feature (one payment split across multiple categories)?
- Would you find a weekly digest view (spending by week, not month) useful?
