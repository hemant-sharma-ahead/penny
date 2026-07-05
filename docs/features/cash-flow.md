# Cash Flow

## What it is

Projects your **total liquid balance** forward and answers two questions: "how much is safe to spend before my next payday?" and "will my balance dip dangerously low this month?". The engine projects from your current account balances plus dated recurring flows (income in, bills out), surfaces the lowest projected point, and computes a liquidity-based safe-to-spend number.

## User-facing capabilities

- **Safe to spend** — a single liquidity-based number: current liquid balance − committed outflows until your next payday − your safety cushion. Framed by payday ("to last the next 8 days till payday") with a per-day allowance. Falls back to month-end when no payday is forecast.
- **Balance projection** — a sparkline of the projected daily balance over the chosen horizon (1 / 3 / 6 months, default 3), marking the lowest point and your buffer floor.
- **Low-balance warning** — a banner when the balance is projected to fall below your safety cushion, with the amount and date ("dips to ₹4,200 on 26 Jun").
- **Net flow** — projected inflows − outflows for the horizon.
- **Upcoming payments** — a month-grouped timeline (July, August, …) of EMIs, subscriptions, insurance renewals, and recurring expenses, with each row showing its due date and a per-month subtotal.
- **Adjustable safety cushion** — a user-set buffer (default ₹5,000) the projection treats as the floor; safe-to-spend and the warning are measured against it.
- **Surfaced beyond the page** — the safe-to-spend number appears as a tappable pill on the Expenses header and a card on Home, both linking here.
- **Recurring-income suggestions** — when income repeats at a regular cadence (e.g. monthly salary) but isn't marked recurring, a card offers to add it to the forecast. Confirming marks the latest matching income transaction recurring (so a payday appears); dismissing is remembered locally.
- **In-app reminders** — a header bell + badge surfaces overdue recurring bills and anything due in the next 7 days (EMIs, subscriptions, insurance, bills) with snooze / mark-done / log / cancel actions. Built from the same forecast + recurring-due data (`core/reminders`, `hooks/useReminders`). In-app only; OS/push reminders are a Phase 2 item.

## How it works

**Pure engine — `src/core/cashflow/forecaster.ts`:**

1. **`forecastEvents`** projects dated events across the horizon, emitting **every occurrence** that falls within it (so a 3-month view shows monthly rent/EMI/subscriptions in each month): loan EMIs (monthly on `emiDueDate` until `endDate`), subscriptions (from `lastChargedAt` stepping `intervalDays`, amount from `detectedAmount`, labelled by `merchantCategory`), insurance renewals (`renewalDate`), recurring expenses (out) and **recurring income** (in). **Only CONFIRMED subscriptions drive the projection** — the forecaster skips any subscription where `!confirmedByUser` or `status === 'cancelled'`. Detected-but-unconfirmed candidates are hidden from the Subscriptions tab, so they deliberately do **not** appear as cash-flow outflows (otherwise Cash Flow would show a payment the user can't see or manage). Each event carries a `direction` (`'in' | 'out'`). Transfers are skipped (net-zero across own liquid accounts). A recurring series is logged every period, so each (type + merchant) is **collapsed to its most recent occurrence** before projecting — otherwise every historical row would project into duplicate events, which means **recurring series must share a stable description** across months (the demo seed does this; per-month suffixes would break it). A charge tracked _both_ as a confirmed subscription and as recurring expenses would be counted twice, so the two shouldn't overlap (the demo seed keeps subscription-backed expense rows non-recurring).

2. **`projectBalance`** starts from the current liquid balance and walks day-by-day to the horizon end, accumulating signed deltas into a running-balance series. It derives the **lowest** point, the first **buffer-breach** day, total in/out, **net flow**, the **next payday** (`nextIncomeMs`), and a liquidity-based **safe-to-spend**: `currentBalance − committedOutflowsUntilPayday − buffer`, divided by the days remaining in that window (until payday, else month-end).

**Current liquid balance** = sum of `computeBalance` over non-archived `cash` / `bank` / `wallet` accounts (credit cards are liabilities, not balance).

**Recurring-income detection — `src/core/cashflow/incomeDetector.ts`:** `detectRecurringIncome` mirrors the subscription detector — groups income transactions by normalized description, matches the median gap to a canonical cadence, and returns candidates with the next projected payday. `useIncomeSuggestions` filters out income already marked recurring + locally dismissed ones; confirming marks the latest matching transaction recurring and reloads the forecast.

**Key files:**

- `src/core/cashflow/forecaster.ts` — `forecastEvents` + `projectBalance` (pure, tested in `tests/cashflow/forecaster.test.ts`); `meta.ts` — event-type icon/colour/label
- `src/core/cashflow/incomeDetector.ts` — `detectRecurringIncome` (pure, tested in `tests/cashflow/incomeDetector.test.ts`)
- `src/hooks/useForecast.ts` — loads sources + accounts, computes the start balance, runs the engine, exposes `reload`; shared by the page and surfaces
- `src/features/cashflow/useIncomeSuggestions.ts` — recurring-income suggestions: detect, filter, confirm (mark recurring), dismiss
- `src/features/cashflow/CashFlowPage.tsx` — safe-to-spend hero, projection sparkline, warning banner, buffer editor, payments timeline
- `src/features/cashflow/useCashFlow.ts` — wraps `useForecast`, owns the horizon, groups outflow events for the timeline
- `src/features/cashflow/CashFlowTimeline.tsx` — day-grouped payment timeline
- `src/features/home/SafeToSpendCard.tsx`, `src/features/expenses/ExpensesHeader.tsx` — safe-to-spend surfaces

**Recurring income** is read from transactions with `type: 'income'` and `isRecurring: true`. The recurring-income detector surfaces a confirmable suggestion when a regular income pattern exists but isn't yet marked recurring, so the projection works without the user hand-marking it.

**No external API calls.** All projection is local.

## Current limitations

- Income counts as a projected inflow once marked recurring (the detector suggests this when a pattern exists, but a single payslip or irregular income won't be detected). Without a projected payday, safe-to-spend uses the more conservative month-end window.
- Variable day-to-day spending is not averaged into the projection — only confirmed recurring flows and dated commitments are modelled. The safe-to-spend number is what's left _after_ commitments, not a predicted spend curve.
- Per-account attribution isn't modelled — the projection is over total liquid balance, so it can't yet warn that one specific account runs dry while another has cash.
- Subscription/EMI debit dates can vary by 1–2 days from the projected date.
- Credit-card bill lump-sum payments and SIP debits aren't projected as outflows.

## Planned improvements

- **Track 6 (Phase C):** recurring auto-post inbox (confirm due bills to log them); local reminders for upcoming dues.
- **Phase 2:** per-account-aware projection ("HDFC runs dry on the 26th"); Chip proactive alerts on breach days; "what if" adjustments; SIP/credit-card-bill outflows.
