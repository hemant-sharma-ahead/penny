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
- **Reconcile** a cash or wallet account to its real-world balance — enter the actual amount and Penny posts a balancing income/expense ("Balance reconciliation") so the tracked balance matches reality
- Hide a specific account's balance in **Safe Mode** (Settings → Safe Mode → Accounts), independent of the other accounts — everyday accounts stay visible by default

## How it works

Account records are stored in the encrypted `accounts` Dexie store with fields: name, type, bankName, openingBalance, color, and icon.

Critically, **balances are not stored** — they are always derived on read. Every time a balance is needed, Penny queries the `expenses` store for all transactions linked to that account and computes: `balance = openingBalance + sum(income) − sum(expenses) + netTransfers`. This ensures the balance is always perfectly in sync with your transaction history and there is no risk of the stored balance drifting out of sync.

Transfers are recorded as a single transaction with both a source `accountId` and a destination `toAccountId`. Income is an expense-store record with type `income` linked to the receiving account.

The Home dashboard's accounts strip reads all accounts and computes their live balances in a single pass.

Each `Account` carries an optional `hideInSafeMode` flag (undefined/false = visible, the default). Both `AccountList` (this page) and `AccountsStrip` (Home) resolve masking per account via `usePrivacy().shouldMask(acc.hideInSafeMode)` — Open never masks, Privacy always masks, Safe masks only flagged accounts. The Total Balance card is an aggregate and stays visible in Safe (hidden only in Privacy). See `docs/ARCHITECTURE.md` → Context providers.

Key files:

- `src/features/accounts/AccountsPage.tsx` — thin shell: header + AccountList + AccountFormModal
- `src/features/accounts/useAccountForm.ts` — add/edit form state; `AccountList.tsx`/`AccountFormModal.tsx` — list + modal
- `src/core/accounts/meta.ts` — account-type metadata (label/icon/colour); `balanceCalculator.ts` — balance math
- `src/features/expenses/ExpenseForm.tsx` — handles income and transfer type transactions (which update account balances)

## Current limitations

- Balances must be seeded with an accurate opening balance; there is no way to import existing transaction history from a bank automatically
- No account archiving — deleted accounts remove all associated transactions
- No multi-currency accounts (all accounts are in INR)
- Credit card statements and minimum payment dates are not tracked
- No automatic bank sync or Open Banking integration

## Planned improvements

- Phase 1.5: Shared accounts — mark an account as shared with a household group, making its transactions visible to group members
- Phase 2: Bank statement import — upload a PDF or CSV statement from your bank to auto-populate transactions and set the correct opening balance

## Ideas welcome

- Should archived/closed accounts be kept for historical reporting rather than deleted?
- Would foreign currency account support (e.g. USD savings account) be useful?
- Should credit card accounts show the statement due date and minimum payment?
