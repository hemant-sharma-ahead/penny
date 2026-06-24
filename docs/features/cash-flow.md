# Cash Flow

## What it is

Projects your cash balance for the next 30 days based on confirmed recurring income and expenses plus historical spending patterns. It answers the question "will I have enough money on any given day this month?" — and flags the specific days when your balance could drop dangerously low.

## User-facing capabilities

- See a day-by-day projected cash balance for the next 7 days
- See a weekly summary bar chart for the next 30 days
- See an income vs expense waterfall chart for the current month
- Identify risk days — days when your projected balance may drop below ₹5,000 (yellow warning) or ₹0 (red critical)
- See which specific transactions are driving a risk day (e.g. "Amazon Prime + phone bill both hit March 12")
- Distinguish between confirmed recurring items (your SIPs, subscriptions, EMIs) and estimated variable spend

## How it works

**Forecast engine — 5-step process:**

1. **Confirm recurring items:** Expenses with `isRecurring: true` and records in the `subscriptions` store (confirmed by user) are treated as certain. EMI amounts from `liabilities` are included on their due dates.

2. **Project income:** Average of last 3 months' income transactions (type `'income'` in the expenses store) plus any known recurring income dates (e.g. salary credit patterns).

3. **Project variable expenses:** Per-category 3-month rolling average, applied as a smooth daily draw. Categories with zero variance (e.g. rent, SIP) are treated as deterministic.

4. **Day-by-day balance:** Starting from the current liquid account balance (sum of `accounts` records with type `'savings'`, `'current'`, or `'cash'`), the engine adds projected income and subtracts projected expenses for each day to produce a running balance curve.

5. **Flag risk days:** Any day where the projected balance crosses ₹5,000 (warning) or ₹0 (critical) is tagged. The risk label includes the specific recurring items landing that day.

**Key files:**
- `src/core/cashflow/forecaster.ts` — all projection logic; `meta.ts` — event-type metadata (icon/colour/label)
- `src/features/cashflow/CashFlowPage.tsx` — thin shell: header + horizon toggle + summary + timeline
- `src/features/cashflow/useCashFlow.ts` — loads sources, forecasts events, groups by day, owns horizon state
- `src/features/cashflow/CashFlowTimeline.tsx` — grouped day-by-day event timeline

**Inputs from:** `expenses` (recurring + historical), `accounts` (current balances), `liabilities` (EMI amounts and due dates), `subscriptions` (confirmed recurring charges)

**No external API calls.** All projection is done locally from stored data.

## Current limitations

- Variable expense projection is a simple 3-month category average. Seasonal spending (festivals, vacations, year-end gifts) can significantly skew projections for months that follow an unusual spend period.
- EMI payment projections use the stored `emiAmount` from `liabilities` but bank debit dates can vary by 1–2 days; the projection uses the stored `endDate` field as a proxy.
- Credit card bill payments are not projected — only the individual purchase transactions are tracked. The lump-sum bill payment that hits your savings account is not captured.
- SIP debits reduce your account balance but are not currently factored into the cash flow projection (they go into holdings, not expenses).
- The tool requires at least 1 month of expense history for meaningful projections; new users see mostly static estimates.

## Planned improvements

- **Phase 2:** Chip proactive alert when a projection shows a risk day — "Your balance may drop below ₹5,000 on March 12 — your Amazon Prime renewal and phone bill both land that day."
- **Phase 2:** Factor SIP debits into the cash flow projection so the balance curve accounts for investment outflows.
- **Phase 2:** Seasonal adjustment — detect months with consistently higher spend (e.g. October for Diwali) and apply a category-level multiplier for those months.
- **Phase 2:** Credit card bill payment projection — estimate the bill amount due from current-cycle spend and include the payment on the statement due date.
- **Phase 2:** "What if" mode — let users temporarily adjust an amount (e.g. "what if I spend ₹10,000 less this month?") and see the updated projection.

## Ideas welcome

- What is the right threshold for a "warning" vs "critical" balance — is ₹5,000 the right floor, or should it be relative to monthly income?
- Should the tool project 30 days, 60 days, or let users choose the window?
- Is a waterfall chart the most intuitive view, or would a simple line graph of daily balance be easier to read on mobile?
