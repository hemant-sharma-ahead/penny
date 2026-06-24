# Expenses

## What it is
The expense tracking module — the heart of Penny's day-to-day usage. You log every financial transaction here: money spent, money received, and money moved between your accounts. Over time, Penny builds a detailed picture of where your money goes, surfaced through analytics, budgets, and Chip insights.

## User-facing capabilities
- Add, edit, and delete transactions of three types: expense (money out), income (money in), and transfer (between your own accounts)
- Attach a merchant name, amount, category, date, account, notes, and free-form hashtags to every transaction
- Filter transactions by date range, category, hashtag, account, event, or transaction type — mix and match
- View spending analytics: pie chart and bar chart by category, month-over-month comparison, and a spending trend line
- Set monthly budgets per category and see real-time progress bars; receive alerts when you are close to or over budget
- Import transactions from a Penny CSV template, YNAB export, Cashew export, or MoneyView export — with a 3-step review UI before anything is saved
- Export all or a date-filtered slice of your transactions as an AES-256 password-protected ZIP file containing a CSV
- Set up recurring transaction rules (subscriptions, EMIs, salary, rent) with frequencies: daily, weekly, bi-weekly, monthly, quarterly, half-yearly, or yearly
- Pause recurring rules automatically while a vacation event is active (vacation guard)
- Tag transactions to life events (vacation, wedding, home renovation) for contextual spending views
- Organise categories into parent groups (e.g. "Food & Drink" → "Dining Out", "Groceries") and use hashtags for a third level of detail

## How it works
Transactions are stored in the encrypted `expenses` Dexie store. Each record includes: amount, merchant, categoryId, date, type (expense/income/transfer), hashtags array, accountId, toAccountId (for transfers), eventId, recurringRuleId, and an isRecurring flag.

The category system has three levels: intentGroup (parent group), ExpenseCategory (child category), and hashtags (free-form tags). Default categories are seeded from `defaultCategories.ts` at first run. Users can create custom categories.

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
- `src/features/import/` — import wizard as step slices (`UploadStep`/`PreviewStep`/`DoneStep`) + `useImport` hook
- `src/core/import/importParsers.ts` — YNAB, Cashew, MoneyView, Penny CSV parsers + format metadata
- `src/core/import/importPipeline.ts` — pure category matching, dedup keys, preview-row enrichment
- `src/core/export/exportCsv.ts` — CSV generation + AES-256 ZIP creation
- `src/core/db/defaultCategories.ts` — seed categories and intent groups

## Current limitations
- No SMS parsing or bank statement auto-import — all transactions must be entered manually or imported via CSV/export file
- No photo receipt attachment
- Category icons are stored as Tabler icon name strings; there is no visual icon picker yet (coming in Pre-Phase 1.5)
- No bulk operations — you cannot select multiple transactions to delete or re-categorise at once (coming in Pre-Phase 1.5)
- Analytics charts are month-based; custom arbitrary date range analytics are not yet supported

## Planned improvements
- Pre-Phase 1.5: Visual icon picker for categories, a full category management page (rename, merge, delete), and bulk transaction operations
- Phase 2: AI auto-categorisation — when you type a merchant name, Chip suggests the category based on your history and a merchant database (via a Cloudflare Worker, never raw data)
- Phase 2: Bank statement PDF import — upload a PDF statement and Penny parses transactions automatically

## Ideas welcome
- Which banks' PDF statement formats would be most useful to support first?
- Should there be a "split transaction" feature (one payment split across multiple categories)?
- Would you find a weekly digest view (spending by week, not month) useful?
