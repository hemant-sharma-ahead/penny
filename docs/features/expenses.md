# Expenses

## What it is
The expense tracking module — the heart of Penny's day-to-day usage. You log every financial transaction here: money spent, money received, and money moved between your accounts. Over time, Penny builds a detailed picture of where your money goes, surfaced through analytics, budgets, and Chip insights.

## User-facing capabilities
- Add, edit, and delete transactions of three types: expense (money out), income (money in), and transfer (between your own accounts)
- Attach a merchant name, amount, category, date, account, notes, and free-form hashtags to every transaction
- Enter amounts with live Indian thousands grouping, a built-in calculator (type `120+45`), and an amount-in-words helper beneath the field (`1,00,000` → "One Lakh")
- Description is the first field in the Add form; as you type, Penny shows ranked type-ahead suggestions of remembered merchants beneath it (substring match). Each suggestion fills the merchant, category, account, and payment mode on tap — nothing changes until you tap. A merchant you've logged under more than one category surfaces as a separate suggestion per category, ranked by how often you use each.
- View annual analytics: an income line over monthly expense bars, last-year ghost bars for context, a 3-month forward projection (faded), a savings-rate headline, biggest category movers vs your trailing average, and a per-month breakdown
- Monthly analytics surfaces **anomaly nudges** (a category spending notably above its trailing-3-month average) and a **recap card** (spent, net, vs-last-month, transactions, top category)
- A "due to log" inbox surfaces recurring items (rent, bills, SIPs, salary) whose next occurrence has fallen due; confirm to log the real transaction, or skip — it reappears when the next period falls due
- Duplicate a transaction (from the edit form) and save any transaction as a reusable **template/favorite** — saved templates appear as one-tap chips above the transactions list (`transaction_templates` store)
- Swipe a transaction row left to reveal quick **Copy / Delete** actions; tap to edit
- Attach a **receipt photo** to a transaction — compressed and stored locally (encrypted); a paperclip marks rows that have one
- Filter transactions by date range, category, hashtag, account, event, or transaction type — mix and match
- View spending analytics: pie chart and bar chart by category, month-over-month comparison, and a spending trend line
- Set monthly budgets per category and see real-time progress bars; receive alerts when you are close to or over budget
- Import transactions from a Penny CSV template, YNAB export, Cashew export, or MoneyView export — with a 3-step review UI before anything is saved
- Export all or a date-filtered slice of your transactions as an AES-256 password-protected ZIP file containing a CSV
- Set up recurring transaction rules (subscriptions, EMIs, salary, rent) with frequencies: daily, weekly, bi-weekly, monthly, quarterly, half-yearly, or yearly
- Pause recurring rules automatically while a vacation event is active (vacation guard)
- Tag transactions to life events (vacation, wedding, home renovation) for contextual spending views
- Organise categories into parent groups (e.g. "Food & Drink" → "Dining Out", "Groceries") and use hashtags for a third level of detail
- Manage categories from inside the Select Category popup: create/edit/rename, pick an icon from a curated visual grid **or search the full Tabler set**, recolor, move transactions to another category, delete empty custom categories (single or bulk), and create your own parent groups (creating a group requires ≥1 category under it). Income has the same category + group concept as expense.
- Select multiple transactions in the Transactions tab (the list-check button → tap rows) and bulk-update them: change **category**, change **account + payment mode together** (coupled like the entry form — a cash account forces the cash mode), or **delete** the selection

## How it works
Transactions are stored in the encrypted `expenses` Dexie store. Each record includes: amount, merchant, categoryId, date, type (expense/income/transfer), hashtags array, accountId, toAccountId (for transfers), eventId, recurringRuleId, and an isRecurring flag.

The category system has three levels: intentGroup (parent group), ExpenseCategory (child category), and hashtags (free-form tags). Default categories are seeded from `defaultCategories.ts` at first run.

**Category management (Track 3)** lives in `src/features/expenses/categories/`. The `CategoryPickerModal` has a Select mode (tap to pick) and a Manage mode (edit/move/bulk/parent groups), opening `CategoryEditorModal` / `ParentEditorModal` (z-80) on top. Icons are stored as `ti-*` strings; the picker (`IconGridPicker`) shows a curated set from `core/expenses/categoryIcons.ts` and lazy-fetches `public/tablerIconIndex.json` (built by `scripts/build-icon-index.mjs` via `npm run gen:icons` / `predev` / `prebuild`) for search. Default categories are editable but not deletable. Custom parent groups are `ExpenseCategory` records flagged `isGroup`; children reference them via `parentId`. Grouping in the picker, analytics, and filters is unified through `groupKey`/`groupMeta` in `core/expenses/categoryGroups.ts` (`parentId ?? intentGroup ?? 'other'`). "Move transactions" reassigns `categoryId` (source survives); deleting a custom empty category also removes its budgets. Transaction-level bulk edits (`patchExpenses`/`removeExpenses` in `useExpenses`) power the Transactions-tab select mode.

Account balances are derived, not stored — every balance is calculated from the opening balance plus all income, minus all expenses, plus net transfers. This means the expenses store is the single source of truth for account balances.

Import parsers in `importParsers.ts` normalise transactions from four formats into Penny's internal schema before the review step. Export produces a ZIP (using zip.js) with AES-256 encryption; the password is chosen by the user at export time.

The feature is organised as **vertical slices** (mirroring portfolio): `ExpensesPage.tsx` is a thin
shell that renders `ExpensesHeader` + a tab strip and dispatches to one self-contained slice per tab
(`transactions/`, `budgets/`, `analytics/`, `subscriptions/`, `iou/`). Each slice owns its own state,
modals, and FAB. Shared expense data comes from `useExpenses`; the IOU tab reuses `src/features/iou/`
(`useIou`, `IouListView`, `IouCard`) so it stays in sync with the standalone `/app/iou` route.

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
- No photo receipt attachment
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
