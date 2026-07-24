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

Detected candidates are **computed on the fly** by `detectSubscriptions` inside the `useSubscriptions` hook (exposed as `detectedSubs`) — they are **not** persisted to the store. A record is only written to the `subscriptions` Dexie store when the user acts on a candidate:

- **Confirm** writes a record with `confirmedByUser: true` — it then appears in the tracked (active) list.
- **Dismiss** writes a **tombstone** record (`status: 'cancelled'`, `confirmedByUser: false`). Nothing is removed; the tombstone exists so that candidate's key is filtered out of future detection runs (via `subKey` / the `storedKeys` set), so a dismissed item stops resurfacing.

`activeSubs` = stored records where `confirmedByUser === true` **and** `status !== 'cancelled'`, sorted by soonest next renewal (a lightweight renewal calendar). Cancelled and unconfirmed records are excluded from the active list.

**Cash-flow interaction:** only **confirmed** subscriptions drive the Cash Flow balance projection — detected/unconfirmed candidates do not, so a subscription won't affect safe-to-spend until the user confirms it.

Key fields per `Subscription` record: `merchantCategory` (generalised, not the raw merchant name), `detectedAmount`, `intervalDays`, `status`, `trialEndsAt` (optional), `lastChargedAt` (optional), `confirmedByUser`, `createdAt`, `updatedAt`.

Subscription logic and presentation are shared between the standalone `/app/subscriptions` route and
the Expenses → Subscriptions tab: both consume the `useSubscriptions` hook and render the same
`SubscriptionsView` / `DetectedSubCard` / `ActiveSubCard` components, so the two surfaces stay in sync.

Amounts respect `usePrivacy().shouldMask(!safeModeVisibility.subscriptions)` — Safe Mode hides subscription amounts only if the "Subscriptions" toggle in Settings → Safe Mode is switched off (visible by default); Privacy always masks; Open never does. Both entry points compute this independently since they don't share a parent component.

Key files:

- `src/features/subscriptions/SubscriptionsPage.tsx` — standalone route: header + shared `SubscriptionsView`
- `src/features/subscriptions/useSubscriptions.ts` — on-the-fly detection (`detectedSubs`) + confirm/dismiss/cancel + manual `addSubscription` (used by both surfaces)
- `src/features/subscriptions/SubscriptionsView.tsx` / `DetectedSubCard.tsx` / `ActiveSubCard.tsx` — shared UI
- `src/features/subscriptions/SubscriptionForm.tsx` — the manual "add a subscription" form
- `src/features/expenses/subscriptions/SubscriptionsSlice.tsx` — the Expenses → Subscriptions tab surface (IOU-tab-style), consuming the same hook and shared components
- `src/core/subscriptions/detector.ts` — 3-pass detection algorithm; `format.ts` — display/interval/monthly helpers (`subKey`, `nextRenewal`, `toAnnual`)

**Mobile (`apps/mobile`):** ported in Track 4 (the mobile migration's pilot module) — `apps/mobile/src/features/subscriptions/` mirrors the web files above 1:1 (`useSubscriptions.ts` unchanged beyond import paths). One intentional platform simplification: the "Last charged" field is a plain text input (`YYYY-MM-DD`) instead of web's native HTML date picker, since RN has no built-in date input and this pilot didn't pull in a native date-picker dependency for it. Reachable today via `AuthGuard`'s temporary `needs_onboarding` stand-in (real onboarding UI doesn't exist yet) — not yet wired into a permanent nav route.

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
