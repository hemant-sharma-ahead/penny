# Subscriptions

## What it is
The subscriptions module automatically detects recurring charges in your transaction history — streaming services, app subscriptions, gym memberships, insurance premiums — and surfaces them as a managed list. You can see exactly how much you spend on subscriptions each month, confirm or dismiss each detected item, and add ones that were not auto-detected.

## User-facing capabilities
- See a list of automatically detected recurring expenses, pulled from your transaction history
- Confirm a detected subscription to add it to your tracked list, or dismiss it if the detection is wrong
- **Manually add** a subscription (name, amount, billing interval, last charged, free-trial toggle) — for anything not auto-detected
- See each subscription's name, amount, frequency, **next renewal date** ("renews in N days"), and **annualised cost** (₹X/yr)
- Active subscriptions are ordered by next renewal — a lightweight renewal calendar
- View the total **monthly and yearly** subscription cost across all active subscriptions
- **Price-hike detail** on detected subscriptions (₹old → ₹new, +X%) when a charge has crept up
- **Unused/zombie nudge** — active subscriptions not charged in 2+ billing cycles surface a "looks unused — cancelling saves ₹X/yr" banner
- Cancel any subscription from your list (and renewal charges already appear in the header Reminders bell within 7 days)

## How it works
The detection algorithm in `detector.ts` runs a 3-pass analysis over the `expenses` store:

1. **Frequency clustering**: Expenses are grouped by merchant name. For each merchant, the algorithm checks whether the time intervals between consecutive transactions are regular — specifically, whether they cluster within ±3 days of a target period (e.g. 30 days for monthly, 365 days for annual).

2. **Amount stability**: A merchant is only flagged as a subscription if the amount variance across occurrences is less than 10%. This distinguishes true subscriptions (fixed cost) from regular but variable charges like a utility bill.

3. **Minimum recurrence**: At least 3 occurrences are required before a merchant is proposed as a subscription. This prevents one-off or two-off coincidences from being flagged.

Detected candidates are stored in the `subscriptions` Dexie store with `confirmedByUser: false`. Once confirmed, this flag is set to true and the subscription appears in the main tracked list. Dismissed candidates are removed from the store.

Key fields per subscription: name, amount, frequency, categoryId, nextDueDate, detectedAt, confirmedByUser.

Subscription logic and presentation are shared between the standalone `/app/subscriptions` route and
the Expenses → Subscriptions tab: both consume the `useSubscriptions` hook and render the same
`SubscriptionsView` / `DetectedSubCard` / `ActiveSubCard` components, so the two surfaces stay in sync.

Key files:
- `src/features/subscriptions/SubscriptionsPage.tsx` — standalone route: header + shared `SubscriptionsView`
- `src/features/subscriptions/useSubscriptions.ts` — detection + confirm/dismiss/cancel (used by both surfaces)
- `src/features/subscriptions/SubscriptionsView.tsx` / `DetectedSubCard.tsx` / `ActiveSubCard.tsx` — shared UI
- `src/core/subscriptions/detector.ts` — 3-pass detection algorithm; `format.ts` — display/interval/monthly helpers

## Current limitations
- Detection runs on transaction history already in Penny — it cannot detect subscriptions charged to accounts whose transactions have not been imported
- The algorithm uses merchant name as the grouping key; transactions from the same service logged under slightly different merchant names (e.g. "Netflix" vs "NETFLIX.COM") may not be grouped correctly
- Annual subscriptions require at least 3 years of transaction history to be auto-detected reliably
- No way to see the history of past subscription charges linked to a detected subscription

## Planned improvements
- Phase 2: Push notifications for upcoming subscription renewals — get an alert a few days before a subscription is due to charge
- Phase 2: Subscription cost trend — Chip shows you how your total monthly subscription spend has grown over time ("Your subscriptions grew from ₹2,400 to ₹3,800 in 6 months")
- Phase 2: Cancel guidance — for popular services, a direct link to the cancellation page when you want to stop a subscription

## Ideas welcome
- Should subscriptions be linkable to a specific account so you can track which card or account is being charged?
- Would a "subscriptions I forgot about" highlight (inactive services with recent charges) be useful?
- Should Penny flag when a subscription amount increases compared to previous months?
