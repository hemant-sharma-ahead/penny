# Home

## What it is

The app's main dashboard — the first thing you see after unlocking Penny, and the screen users
visit multiple times a day. It's a **minimal, glance-first** layout that leads with **your own money**
(net worth + safe-to-spend, spending/insurance/loans facts, financial health), then Instagram-style
**stories**, your household **groups**, accounts, and — only near the bottom — market context and quick
links to every module.

## Layout (top → bottom)

1. **Greeting** — a time-of-day greeting with your first name.
2. **Glance header** (`GlanceHeader`) — a two-stat card: **Net worth** (tap → full breakdown sheet) and **Safe to spend** (tap → Cash Flow), with a slim asset-allocation bar and assets/liabilities totals beneath.
3. **Money stats** (`MoneyStatsCard`) — a single card split into columns: **Spent** this month (with a "Living …" subtext), **Insurance** cover, and **Loans** outstanding, plus a **Tax** story line. Each taps through to its module.
4. **Financial health** (`FinancialHealthCard`) — a folded health score with quick wins.
5. **Stories** — Instagram-style rings (gradient = unseen, muted = seen) surfacing what used to be buried in other tabs, because Home is where users actually go daily. See "Stories" below.
6. **Groups** (`HomeGroupsCard`) — your household/shared-expense groups; tapping through enters a group context (see "Group context" below).
7. **Accounts** (`AccountsStrip`) — horizontal strip of accounts + live balances (credit cards show usage).
8. **Market ticker** — a slim, scrollable tape sitting **near the bottom** (markets sit below your own money, not above it). Tap the ⋯ to choose which tickers appear.
9. **Tools** (`ToolsGrid`) — shortcut tiles to Insurance, Loans, Health, Tax, Cash Flow.

## Group context

The Home screen is context-aware via `useGroupContext` / `GroupContext`. When no group is active it
shows the personal dashboard above. When a group is selected (from `HomeGroupsCard` or the context
switcher), `HomePage` renders `GroupDashboard` for that group instead of the personal view.

## Stories

Tap a ring to open a full-screen, tap-through viewer (segmented progress bars, tap left/right or
hold to pause, auto-advance, cross-story progression). Everything is generated and shared
**on-device** — no network, no AI. The set is built by `useHomeStories` and ordered unseen-first:

- **Your week** — Weekly Wrapped recap (changes, busiest day, added/removed); shareable as an image.
- **On this day** — memories from the same calendar date in past years (only when such activity exists).
- **Streak & milestone** — current tracking streak + the most impressive milestone reached.
- **Insights** — unread Chip insights (headline + "what if I do nothing?"), with a CTA to the relevant module.
- **Tax story** — a teaser ending in a CTA to the full Tax → Footprint story.

Seen state is tracked per-story by a `freshnessKey` in `localStorage` (`penny_stories_seen`), so a ring re-lights when its content changes (a new week, a new insight, a new milestone).

## User-facing capabilities

- See **net worth** and **safe-to-spend** at a glance; tap net worth for the full asset/liability breakdown — including **net IOU**: net lent shows as an **"Owed to You"** asset, net borrowed as an **"Owed to others"** liability. Both rows tap through to the Expenses screen's **IOU tab** (`navigate(PATHS.app.expenses, { state: { tab: 'iou' } })`) — there is no standalone IOU route.
- See the **money-stats card** (Spent this month · Insurance cover · Loans outstanding, plus a Tax line) and a **financial-health** score, each tapping through to its module.
- See your **household groups** and switch into a **group context** — when a group is active, Home shows that group's dashboard instead of your personal view.
- Glance at, and tap into, daily **stories** (see above) without leaving Home.
- Scroll through a horizontal strip of all your accounts and their live balances; credit cards show how much credit has been used
- View live prices for market tickers (Sensex, Nifty 50, Gold, Silver, USD/INR, Crude Oil) with the day's change, in a slim top ticker; customise the set from a preset list
- Jump directly to any module from shortcut tiles
- Control what's visible based on your privacy mode: **Open** shows everything, **Privacy** hides every amount, **Safe** shows everything except the specific accounts/categories/modules you've chosen to hide (Settings → Safe Mode)

## How it works

Net worth is calculated live each time the Home screen loads: it sums all holdings and account balances (assets) and subtracts all liabilities, reading from `liabilitiesRepo.getAll()`, `expensesRepo.getAll()`, `holdingsRepo.getAll()`, `accountsRepo.getAll()`, `ledgerEntriesRepo.getAll()`, and `personsRepo.getAll()`. **Net IOU** = Σ`signedAmount` over ledger entries (`core/iou/ledger`), **but only for active (non-archived) persons** — `loadSummary` builds an `activePersonIds` set from `persons.filter((p) => !p.isArchived)` and skips entries whose person is archived, so a deleted IOU (which soft-archives the person while keeping its entries for integrity) no longer lingers in net worth, matching the IOU-tab totals. A positive net is added to assets as an "Owed to You" line and to net worth; a negative net is added to liabilities — which offsets the cash movement of any IOU-linked transaction so net worth stays correct end-to-end.

`useHome` also subscribes to `penny:txn-changed` (`hooks/useTxnRefresh`) so balances/net worth reload live when the IOU screen records or removes a linked transaction, rather than only on navigation.

Market data is fetched from external price feeds via `marketDataClient.ts` and cached for 15 minutes in the `price_cache` Dexie store to avoid excessive network calls. The market strip reads from this cache first and refreshes in the background when the cache is stale.

Privacy mode (Safe / Privacy / Open) is read via `usePrivacy().shouldMask(sensitive)` — the single source of truth for amount masking app-wide (see `docs/ARCHITECTURE.md` → Context providers). Open never masks; Privacy always masks. Safe masks only what's flagged sensitive: net worth and the "Safe to spend" figure are aggregates and stay visible in Safe (hidden only in Privacy), while each account's balance in the Accounts strip respects that account's own `hideInSafeMode` flag (Settings → Safe Mode → Accounts).

Key files:

- `src/features/home/HomePage.tsx` — thin composition, in order: greeting + GlanceHeader + MoneyStatsCard + FinancialHealthCard + StoriesRow + HomeGroupsCard + AccountsStrip + MarketTicker + ToolsGrid. When a group is the active context (`useGroupContext`) it renders `GroupDashboard` instead.
- `src/features/home/useHome.ts` — loads the net-worth snapshot (incl. active-person-only net IOU) + derives asset groups/totals
- `src/features/home/GlanceHeader.tsx` — the two-stat header (net worth + safe-to-spend), slim asset bar, and the net-worth breakdown sheet; IOU rows navigate to the Expenses IOU tab
- `src/features/home/MoneyStatsCard.tsx` — spent / insurance / loans columns + Tax line (`useHomeStats`)
- `src/features/health/FinancialHealthCard.tsx` — folded financial-health score + quick wins
- `src/features/groups/HomeGroupsCard.tsx` — household groups card; `GroupDashboard.tsx` — the group-context Home; `context/GroupContext.tsx` (`useGroupContext`) — active-group state
- `src/features/home/MarketTicker.tsx` — slim market ticker tape (near the bottom) + manage modal
- `src/features/home/AccountsStrip.tsx` / `ToolsGrid.tsx` — account scroller + tools tiles
- `src/features/home/stories/` — `useHomeStories.ts` (builds the story set), `StoriesRow.tsx` (rings + seen state), `StoryViewer.tsx` (generic full-screen tap-through viewer), `storyTypes.ts` (types + on-device share-image generator)
- `src/core/market/marketDataClient.ts` — price fetch + 15-minute cache logic

> The standalone Weekly Wrapped (`activity/components/WrappedModal.tsx`) and Tax Story
> (`tax/share/TaxStoryModal.tsx`) modals still power their own pages; Home's `StoryViewer` is the
> generalised version of that same tap-through pattern.

**Mobile (`apps/mobile`):** ported in Track 4 (seventh module) — `apps/mobile/src/features/home/` mirrors the web files above (`useHome.ts`/`useHomeStats.ts` unchanged beyond import paths). Initially scoped personal-only, same precedent as IOU (the `useGroupContext`/`activeGroup` branch and `HomeGroupsCard` were dropped until Groups was ported to mobile) — **restored once Groups landed**: `apps/mobile/src/features/home/HomeGroupsCard.tsx` ports the web card, and `HomePage.tsx` now renders `GroupDashboard` in place of the personal view when a group is the active context, same as web. A prerequisite `apps/mobile/src/features/health/` ports the Financial Health card, and a standalone `apps/mobile/src/hooks/useForecast.ts` ports the "safe to spend" hook. Three platform gaps with no direct RN equivalent were solved rather than dropped: `FinancialHealthCard`'s CSS `conic-gradient` score ring is redrawn as a multi-arc `react-native-svg` ring; `MarketTicker`'s CSS `@keyframes` marquee becomes a `react-native-reanimated` seamless `translateX` loop; Stories' canvas + Web Share API share button becomes `react-native-view-shot` (snapshot a real off-screen RN view) + `expo-sharing` (native share sheet), with `expo-linear-gradient` reproducing story-card gradients. Back button dropped, same reasoning as every other module. Full detail: [`docs/plans/mobile-migration.md`](../plans/mobile-migration.md)'s Home and Groups progress-log entries.

## Current limitations

- No historical net worth graph — you can see today's number but not how it has changed over time
- "Today's changes" (portfolio gain/loss for the day) is not yet surfaced on Home
- Market ticker customisation is limited to a preset list; you cannot add arbitrary symbols
- Module summary stats are static counts; they do not surface urgency signals (e.g. a goal falling behind)

## Planned improvements

- Phase 2: Net worth trend graph — a month-by-month sparkline showing how your net worth has grown
- Phase 2: "Today's changes" panel showing your portfolio's daily gain or loss in rupees and percentage

## Ideas welcome

- Which additional market tickers would be most useful in the preset list?
- What summary stats on the module tiles would be most helpful at a glance?
- Should the market strip refresh automatically while the app is open, or only on manual pull-to-refresh?
