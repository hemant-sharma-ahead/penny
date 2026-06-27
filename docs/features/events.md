# Events

## What it is

The events system lets you tag a period of time as a life event — a vacation, a wedding, a home renovation — so that all related transactions are grouped together and easy to review. It goes beyond simple hashtags by adding time-awareness: while an event is active, new transactions are automatically tagged with it, and recurring payments can be paused so your budget is not disrupted while you are away.

## User-facing capabilities

- Create a time-bounded event with a name, type (vacation or background), and start date
- See a banner on the Expenses page while an event is active, showing which event is running
- Have new transactions automatically tagged with the active event's hashtag — no need to tag manually while a trip is in progress
- Filter your transaction list by event to see everything you spent (or earned) during that period
- Create a Background event for ongoing projects like a home renovation, which groups transactions without pausing recurring rules
- Create a Vacation event, which additionally pauses all recurring transaction rules while active — so your monthly subscriptions and standing orders do not fire while you are away
- End an event manually when it is over
- Edit an event: rename it, change its type, or unlink existing transactions from it (with a confirmation step)
- Promote any existing hashtag into a tracked event (giving it a start date and type)
- Demote an event back to a plain hashtag if you no longer need the event-level tracking

## How it works

Events are not stored in a separate Dexie table — they are implemented as a special kind of hashtag. The `hashtags` store has additional fields: `eventType` ('vacation' | 'background' | null), `isActive` (boolean), `startDate`, and `endDate`. A hashtag becomes an event when `eventType` is set; it becomes a plain hashtag again when `eventType` is null.

The active event state is managed by `EventModeContext.tsx`, which reads the `hashtags` store for any record with `isActive: true` and a non-null `eventType`. This context is available across the entire app, so the expenses form can auto-attach the active event tag to every new transaction.

The vacation guard is implemented in the recurring transactions engine: before generating a scheduled transaction, the engine checks `EventModeContext` for an active vacation event. If one is found, the transaction is skipped for that cycle (not deleted — the rule resumes automatically when the vacation event ends).

Key files:

- `src/context/EventModeContext.tsx` — active event state, consumed by the expenses form and recurring engine
- `src/features/expenses/ExpensesPage.tsx` — event banner display and event-based transaction filter

## Current limitations

- Only one event can be active at a time; you cannot have two simultaneous active events (e.g. a vacation that coincides with a wedding)
- Background events do not pause recurring transactions — this is intentional by design but means you must manage any relevant recurring rules manually
- Event spending summaries (total spend for the period) are not surfaced automatically — you must apply the event filter and sum manually
- There is no calendar view showing past events on a timeline

## Planned improvements

- Phase 1.5: Share vacation events with household group members — all members can see the shared event and contribute tagged transactions, enabling shared trip expense tracking
- Phase 2: Event spending summary — when you end a vacation event, Chip automatically generates a summary: "This Goa trip cost ₹28,000 across 8 days, split across accommodation (40%), food (35%), and transport (25%)"

## Ideas welcome

- Should multiple events be allowed to be active simultaneously?
- Would a pre-built vacation budget (set a spending limit for the trip before you leave) be useful?
- Are there other event types beyond Vacation and Background that you would find useful (e.g. Medical, Moving)?
