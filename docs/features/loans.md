# Loans

## What it is
The loans module tracks all your borrowings and lets you model different repayment strategies without any commitment. You can see exactly how much interest you will pay over the life of each loan, and then explore "what if" scenarios — extra payments, balance transfers, step-up EMIs — to find the fastest and cheapest path to debt freedom.

## User-facing capabilities
- View all active loans in one place: current outstanding balance, monthly EMI, interest rate, and tenure remaining
- See the full amortisation schedule for any loan — a month-by-month table showing principal paid, interest paid, and remaining balance for every single EMI
- Use the Payoff Planner to model repayment scenarios without changing your actual loan data:
  - **Extra lump sum prepayment**: enter an amount you could prepay and see how many months it saves and how much interest it avoids
  - **Extra EMI per month**: see how much faster the loan closes if you pay a fixed extra amount each month
  - **Step-up EMI**: model increasing your EMI by a percentage each year (e.g. +5% annually as your salary grows)
  - **Balance transfer**: enter a new interest rate and processing fee to see the net saving of refinancing your loan
- Download a complete amortisation schedule as an Excel (XLSX) file for offline reference or sharing with a CA
- Add, edit, and delete loans of 12 types: Home loan, Car loan, Personal loan, Business loan, Education loan, Two-wheeler loan, Gold loan, Credit card revolving, Buy Now Pay Later (BNPL), Family/friend loan, Other

## How it works
Loans are stored in the encrypted `liabilities` Dexie store with 22 fields, including: type, name, principalAmount, currentBalance, interestRate, emiAmount, startDate, endDate, and lenderName.

The amortisation schedule is generated entirely on-device by `amortization.ts` using the standard reducing-balance method. For each month it calculates: interest = currentBalance × (annualRate / 12), principal = EMI − interest, newBalance = currentBalance − principal.

Payoff scenarios are computed in `calculator.ts` without modifying stored data — they run the amortisation algorithm forward with the modified parameters and report the difference in total interest paid and tenure. This makes scenario modelling completely safe and reversible.

The XLSX export uses a spreadsheet library to produce a formatted workbook with one sheet per loan, including a header row with loan details and a data table of the full schedule.

Key files:
- `src/features/loans/LoanScenariosPage.tsx` — My Loans tab, Payoff Planner UI
- `src/core/loans/calculator.ts` — EMI calculation and scenario modelling
- `src/core/loans/amortization.ts` — month-by-month schedule generation

## Current limitations
- Loan balances must be updated manually; there is no automatic sync with lenders
- No support for floating-rate loans where the interest rate changes mid-tenure (e.g. home loans linked to repo rate)
- Credit card revolving balance does not integrate with the minimum payment calculation
- BNPL instalments are tracked as a single loan, not broken out per purchase
- No alert when a loan EMI payment date is approaching

## Planned improvements
- Phase 2: Prepayment opportunity alert — when Chip detects a large surplus (e.g. a bonus in your income), it will suggest the optimal prepayment amount and show the interest saving
- Phase 2: Credit score impact simulation — model how paying off a loan or reducing utilisation might affect your credit score

## Ideas welcome
- Would a floating-rate scenario tool be useful (e.g. "what if my rate goes up by 0.5%")?
- Should the Payoff Planner allow combining multiple scenarios (e.g. extra monthly EMI + one lump sum prepayment)?
- Would a "debt avalanche vs debt snowball" comparison across all your loans be helpful?
