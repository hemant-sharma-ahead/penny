# Expenses

## What it is

The expense tracking module — the heart of Penny's day-to-day usage. You log every financial transaction here: money spent, money received, and money moved between your accounts. Over time, Penny builds a detailed picture of where your money goes, surfaced through analytics, budgets, and Chip insights.

## User-facing capabilities

- Add, edit, and delete transactions of three types: expense (money out), income (money in), and transfer (between your own accounts)
- Attach a merchant name, amount, category, date, account, notes, and free-form hashtags to every transaction
- Enter amounts with live Indian thousands grouping, a built-in calculator (type `120+45`), and an amount-in-words helper beneath the field (`1,00,000` → "One Lakh")
- The **Add/Edit screen** leads with a large **hero amount** in the transaction-type colour (expense red · income green · transfer blue), a compact left-aligned type switch with the close (X) at the top right, **category + date chips**, the **account** and **Paid via** icon rows, and circular icons for **Tags / Receipt / Lent-or-Borrowed / Recurring** that expand inline on tap. Description holds first focus. Saving without a required field (**amount, description, category**) highlights the missing one.
- Transactions render as a **day-grouped timeline** — a continuous left rail with category-coloured dots, newest first; same-day items order by the **time they were entered** (`Expense.date` now carries the time-of-day)
- Description is the first field in the Add form; as you type, Penny shows ranked type-ahead suggestions of remembered merchants beneath it (substring match). Each suggestion fills the merchant, category, account, and payment mode on tap — nothing changes until you tap. A merchant you've logged under more than one category surfaces as a separate suggestion per category, ranked by how often you use each.
- View annual analytics: an income line over monthly expense bars, last-year ghost bars for context, a 3-month forward projection (faded), a savings-rate headline, biggest category movers vs your trailing average, and a per-month breakdown
- Monthly analytics surfaces **anomaly nudges** (a category spending notably above its trailing-3-month average) and a **recap card** (spent, net, vs-last-month, transactions, top category)
- A "due to log" inbox surfaces recurring items (rent, bills, SIPs, salary) whose next occurrence has fallen due; confirm to log the real transaction, or skip — it reappears when the next period falls due
- Duplicate a transaction (from the edit form) and save any transaction as a reusable **template/favorite** — saved templates appear as one-tap chips above the transactions list (`transaction_templates` store)
- Swipe a transaction row left to reveal quick **Copy / Delete** actions; tap to edit
- Attach a **receipt photo** to a transaction — compressed and stored locally (encrypted); a paperclip marks rows that have one
- Filter transactions by date range, category, hashtag, account, event, or transaction type — mix and match
- View spending analytics: pie chart and bar chart by category, month-over-month comparison, and a spending trend line
- Set monthly budgets per category — opened from the **🎯 budget icon in the Transactions toolbar** (centred modal), not a separate tab — and see real-time progress bars; receive alerts when close to or over budget
- Mark an expense **Lent to** / an income **Borrowed from** a person to seed an IOU ledger entry; conversely, recording from the IOU screen creates the matching expense/income on a chosen account (see the IOU feature doc)
- Import transactions from a Penny CSV template, YNAB export, Cashew export, or MoneyView export — with a 3-step review UI before anything is saved
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

**Daily-routine vs set-aside (analytics separation).** Each intent group carries a `routine` flag in `INTENT_GROUP_META` (`isRoutineGroup()` in `defaultCategories.ts`). The monthly Analytics tab leads with an **all-inclusive "Total spent this month"** (daily-routine + set-aside + events — `monthTotal`), then shows only **daily-routine** groups in the donut + "Daily-routine spending" list, so a vacation, family support, legal matter, financial move, or money lent never distorts the everyday picture. Travel carries **Trip Prep, Trip Shopping, Trip Fuel, Vehicle Service**; Daily Living adds **Fuel** (everyday) and **Salon & Grooming**; Home & Utilities adds **Home Services**; a new set-aside **Renovation** intent group ships Materials, Labour & Contractor, Furniture, Fixtures & Fittings, Painting, Interior & Design, Appliances, Other Renovation; Education adds **Transportation Fee, School Trip, Competition**. **Income** splits Dividends/Interest into two and adds **Capital Gains, Bonus & Incentive, Reimbursements**. Definition changes that must reach already-seeded records (renames/regroups, blank-icon repairs) are applied by once-flagged migrations in `dedupeDemoCategories.ts` (`repairCategoryIcons`, `reconcileDefaultCategories`); new categories arrive via the additive `penny_cats_v6` seed. Everything non-routine is summarised in a separate **"Set aside · not daily-routine"** card. Non-routine = the set-aside intent groups (**Financial, Travel, Family & Giving, Legal, Other**) **+ money you lent** (any IOU-linked transaction, regardless of its category) under a synthetic **Lending & IOU** bucket. Event/vacation-tagged transactions remain excluded from categories and shown under their own **Events** card (unchanged). Recap, anomalies, spend-velocity and the previous-month comparison all run on the daily-routine basis. Family support is a category (`cat-family-support` under `family_giving`) — no IOU-model change. Legal categories are also wired into the Tax Footprint band map (`core/tax/categoryTaxMap.ts`): advocate/court/government fees are GST-exempt; ancillary spend (typing/printing, transport, food) carries GST.

**Demo categories reuse the defaults.** `seedDemoData` references the real default category ids (via the key→id map in `dedupeDemoCategories.ts`) instead of minting a parallel `demo-cat-*` set, so the picker never shows a staple twice. Databases seeded before this fix are healed once by `dedupeDemoCategories()` (run once from `useExpenses`, flagged `penny_demo_cats_deduped`): it remaps expenses/budgets/templates/merchant-memory off any legacy `demo-cat-*` id to the canonical default and deletes the orphaned demo categories.

**Category management (Track 3)** lives in `src/features/expenses/categories/`. The `CategoryPickerModal` has a Select mode (tap to pick) and a Manage mode (edit/move/bulk/parent groups), opening `CategoryEditorModal` / `ParentEditorModal` (z-80) on top. Icons are stored as `ti-*` strings; the picker (`IconGridPicker`) shows a curated set from `core/expenses/categoryIcons.ts` and lazy-fetches `public/tablerIconIndex.json` (built by `scripts/build-icon-index.mjs` via `npm run gen:icons` / `predev` / `prebuild`) for search. Default categories are editable but not deletable. Custom parent groups are `ExpenseCategory` records flagged `isGroup`; children reference them via `parentId`. Grouping in the picker, analytics, and filters is unified through `groupKey`/`groupMeta` in `core/expenses/categoryGroups.ts` (`parentId ?? intentGroup ?? 'other'`). "Move transactions" reassigns `categoryId` (source survives); deleting a custom empty category also removes its budgets. Transaction-level bulk edits (`patchExpenses`/`removeExpenses` in `useExpenses`) power the Transactions-tab select mode.

**Category tile style + quick-pick rows.** Category tiles use the **icon-tile selector** pattern (see `docs/DESIGN_GUIDELINES.md`): a filled, colour-coded rounded-square icon with the label outside/below it, 6 per row — replacing an earlier bordered-box tile that crammed icon + label into one box. `AccountChips` and `PaymentModeChips` (the Account / Paid via rows on the Add/Edit form) use the same tile treatment for visual consistency. Above the grouped grid, a `QuickPickRow` (shared between Frequent and Travel picks) renders a horizontally-scrollable row of larger tiles: normally **Frequent** (top 8 by `txnCountByCategory`, count > 0); while an `activeVacationEvent` is passed in (an active `immersive`-subtype event from `EventModeContext`), it swaps to **Travel picks** (categories under the `travel` intent group, declared order) with a "Vacation On · {name}" pill and an info banner explaining that travel spend is tracked separately from everyday budget — no category is ever hidden or blocked, the full grouped list is unchanged below either row.

**Safe Mode masking (per-category).** Each `ExpenseCategory` carries an optional `hideInSafeMode` flag toggled from Settings → Safe Mode (ON = hidden in Safe Mode, matching the field name). An explicit value always wins; when unset, `isHiddenInSafeMode()` (`core/expenses/categoryGroups.ts`) falls back to a per-intent-group default — **income, transfers, family & giving, legal, sin goods, and financial default hidden (toggle ON)**; everyday categories (daily living, home & utilities, lifestyle, etc.) and custom categories default **visible (toggle OFF)**. `TransactionsTab` and `BudgetsTab` resolve masking per row via `usePrivacy().shouldMask(isHiddenInSafeMode(cat))` — Open never masks, Privacy always masks, Safe masks only that category's rows. Aggregates (the "Total spent" header, monthly/annual analytics totals and category-breakdown segments, "Safe to spend") are treated as summary views and stay visible in Safe Mode (`shouldMask(false)`), hidden only in Privacy — Analytics does not currently drill down to per-category Safe Mode masking, only the flat Transactions list and Budgets do. See `docs/ARCHITECTURE.md` → Context providers for the `shouldMask` contract, and `docs/SCHEMA.md` → `expense_categories`/`accounts` for the flag definitions.

Account balances are derived, not stored — every balance is calculated from the opening balance plus all income, minus all expenses, plus net transfers. This means the expenses store is the single source of truth for account balances.

Import parsers in `importParsers.ts` normalise transactions from four formats into Penny's internal schema before the review step. Export produces a ZIP (using zip.js) with AES-256 encryption; the password is chosen by the user at export time.

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
time-of-day on form save.

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
- `src/features/import/` — import wizard as step slices (`UploadStep`/`PreviewStep`/`DoneStep`) + `useImport` hook
- `src/core/import/importParsers.ts` — YNAB, Cashew, MoneyView, Penny CSV parsers + format metadata
- `src/core/import/importPipeline.ts` — pure category matching, dedup keys, preview-row enrichment
- `src/core/export/exportCsv.ts` — CSV generation + AES-256 ZIP creation
- `src/core/db/defaultCategories.ts` — seed categories and intent groups

## Current limitations

- No SMS parsing or bank statement auto-import — all transactions must be entered manually or imported via CSV/export file
- Category icons use the Tabler webfont; the picker exposes a curated grid + search rather than arbitrary SVG uploads
- Bulk operations exist for categories (category manager) and individual transactions (Transactions tab select mode → change category, change account + payment mode together, or delete); the account+payment editor enforces the same coupling as the entry form, and only the fields you set are written. Bulk edits don't change a transaction's type.
- Icon search requires the index to load (lazy fetch); offline, only the curated icon grid is available
- Analytics charts are month-based; custom arbitrary date range analytics are not yet supported

## Planned improvements

- Phase 2: AI auto-categorisation — when you type a merchant name, Chip suggests the category based on your history and a merchant database (via a Cloudflare Worker, never raw data)
- Phase 2: Bank statement PDF import — upload a PDF statement and Penny parses transactions automatically

## Ideas welcome

- Which banks' PDF statement formats would be most useful to support first?
- Should there be a "split transaction" feature (one payment split across multiple categories)?
- Would you find a weekly digest view (spending by week, not month) useful?
