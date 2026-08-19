# Home

## What it is

The app's main dashboard — the first thing you see after unlocking Penny, and the screen users
visit multiple times a day. It's a **minimal, glance-first** layout that leads with **your own money**
(net worth fused with a live Retirement Corpus projection, spending/insurance/loans facts, financial
health), then Instagram-style **stories**, your household **groups**, accounts, and — only near the
bottom — market context and quick links to every module.

## Layout (top → bottom)

1. **Greeting** — a time-of-day greeting with your first name.
2. **Glance header** (`GlanceHeader`) — one fused, borderless hero unit (2026-08-03 redesign, replacing
   the old Net worth/Safe-to-spend two-column card + asset bar): **Net worth**'s label/number/"View
   breakdown" sit directly over a full-bleed **Retirement Corpus** chart + "% funded" gauge. See
   "Retirement Corpus" below for the full breakdown.
3. **Money stats** (`MoneyStatsCard`) — a single card split into columns: **Spent** this month (with a "Living …" subtext), **Insurance** cover, and **Loans** outstanding, plus a **Tax** story line. Each taps through to its module.
4. **Financial health** (`FinancialHealthCard`) — a folded health score with quick wins.
5. **Stories** — Instagram-style rings (gradient = unseen, muted = seen) surfacing what used to be buried in other tabs, because Home is where users actually go daily. See "Stories" below.
6. **Groups** (`HomeGroupsCard`) — your household/shared-expense groups; tapping through enters a group context (see "Group context" below).
7. **Accounts** (`AccountsStrip`) — horizontal strip of accounts + live balances (credit cards show usage).
   A bank account with an active checkpoint-mismatch/anchor-disagreement/standing-gap finding gets a small
   red warning-triangle indicator on its tile (2026-08-10) — the same "Unverified" signal the Accounts
   screen shows, icon-only here for space. A matching icon appears next to the "Accounts" header label
   whenever ANY account needs attention, regardless of scroll position, since the strip itself scrolls
   horizontally and a flagged tile can otherwise sit off-screen. Computed via the pure
   `computeAccountVerificationStatus()` (`packages/core/src/core/bank-import/accountVerification.ts`),
   deliberately not by mounting `useAccountVerification()` a second time — that hook also owns a
   self-correcting write to `Account.openingBalance`, which must stay singular (owned by the Accounts
   screen alone), not run concurrently from two mounted screens.
8. **Market ticker** — a slim, scrollable tape sitting **near the bottom** (markets sit below your own money, not above it). Tap the ⋯ to choose which tickers appear.
9. **Tools** (`ToolsGrid`) — shortcut tiles to Insurance, Loans, Health, Tax, Cash Flow. **`apps/web-react`
   (frozen) only** — on `apps/mobile`, this section had already shrunk to a single "Calculators" tile
   (Insurance/Loans/Health/Tax/Cash Flow all had their own money-stat-card/stories/other homes by then);
   as of 2026-08-01, Calculators itself relocated out into Portfolio/Goals/Tax Awareness (see
   [`docs/features/calculators.md`](calculators.md)), so `ToolsGrid.tsx` was deleted on mobile and this
   whole layout row doesn't exist there anymore.

## Empty states (no data yet)

`docs/mockups/proposals/home-empty-states-v2.html` (2026-08-05). Before this, several Home widgets
rendered as soon as their async load finished — not when the user actually had any data — producing
misleading or outright false results for a brand-new install:

- **Glance header** (`GlanceHeader`) — gated on the actual *values* (`totalAssets === 0 &&
  summary.netWorth === 0`), not `accountBalances.length` — an account with a genuinely zero balance
  (freshly added, not yet reconciled) still counts as a row in that array, which let the real ₹0 hero
  through even with nothing meaningful to show (found 2026-08-05, a day after the row-count version
  shipped). Checking both values together (rather than `netWorth` alone) still shows the real hero for a
  liabilities-only user (a loan, no assets) — `totalAssets === 0` there but `netWorth` is a real,
  meaningful negative number. When genuinely empty, renders nothing at all (not its own prompt card) —
  `MoneyStatsCard`'s "Track your expenses" empty state (below) already offers the same "+ Add account"
  action, so a second near-identical card here was pure duplication (found 2026-08-05, a day after
  shipping it as its own prompt).
- **Retirement Corpus "on track" chip** (`RetirementFundedSummary`) — `corpusNeeded` (and therefore
  `monthlyGapToClose`) mathematically degenerates to 0 with no expense data entered, which used to read
  as "On track — fully funded" (`gap > 0` was false, not because the plan was genuinely funded). Now
  gated on `projection.corpusNeeded > 0`; shows "Add your monthly expenses to calculate your retirement
  target" instead when there's no real target yet.
- **Money stats** (`MoneyStatsCard`) — Spent, Insurance, and Loans are each independently either a real
  stat column (grouped into one row-card alongside whichever other columns also have data) or their own
  `HomeEmptyPromptCard` ("Track your expenses" — two actions, `+ Add account` straight to `Accounts` and
  `Go to Expenses` for bank-statement import or bringing expenses in from another app; "Track Insurance";
  "Track Loans") — never gated on each other. An earlier version gated all three together (`spentThisMonth
  === 0 && insuranceCover === 0 && loansOutstanding === 0`), which hid the Insurance/Loans prompts again
  the instant *any* figure went non-zero — e.g. a user who'd started tracking expenses but hadn't added
  insurance yet went back to seeing a silent `'—'` for Insurance, defeating the point (found 2026-08-05).
  This is also the only fix for Insurance/Loans/Accounts having no navigation entry point anywhere else
  in the app (confirmed via a full nav-tree search) — a silent `'—'` gave a fresh user no reason to ever
  tap into them. Tax story is gated on `stats.spentThisMonth > 0` too — with no real expense activity
  yet there's no real tax story to tell, so it stays hidden until "Spent" itself has something real to
  show, the same signal deciding whether "Spent" is a real column vs. its own prompt.
- **Financial health** (`FinancialHealthCard`) — with nothing entered, every scoring component earns 0,
  which the grade formula mapped straight to `grade: 'F'`, `gradeLabel: 'Critical'`, a red ring — a false
  alarming verdict, not an actual assessment. Checked against the raw derived inputs directly
  (`hs.derived`'s `avgMonthlyExpenses`/`liquidAssets`/`monthlyEmiObligations`/`totalActiveGoals`/
  `assetClassCount`/`hasLifeInsurance`/`hasHealthInsurance`, plus `hs.incomeNeeded`), not each
  component's own `status` — `insuranceComponent` (`core/health/scorer.ts`) hardcodes `hasData: true`
  unconditionally (having *no* insurance is real, meaningful information there, unlike the other
  components), so it can never report the scorer's own `'no_data'` status; an
  `every(c => c.status === 'no_data')` check across all 6 components silently never became true, quietly
  defeating the empty-state gate entirely (found 2026-08-05, a day after shipping the `'no_data'`-based
  version). `score.total === 0` isn't a safe substitute either — several components can legitimately
  earn exactly 0 from real, entered data (a real savings rate of -5%, real goals with none on track,
  real holdings in only one asset class), which would misclassify a genuinely very poor but real
  financial picture as "no data yet." When genuinely empty, shows a neutral "0–100" ring and copy
  explaining what the score actually measures before asking for engagement — and the outer "Financial
  health" heading + "See all" link are hidden too (the empty-state card already has its own title, and
  there's nothing to "see all" of yet); both come back once real data exists.

Shared empty-state visual: `HomeEmptyPromptCard` (`apps/mobile/src/features/home/HomeEmptyPromptCard.tsx`)
— an icon tile, a title stating plainly what's missing, a one-line explanation, and one or two concrete
next-step buttons. Reused by `GlanceHeader` and `MoneyStatsCard` rather than duplicated per-widget.

## Retirement Corpus (2026-08-03)

Fused into the same borderless hero unit as Net worth — see `docs/mockups/proposals/home-networth-projection-v4.html`
for the approved design and `docs/DESIGN_GUIDELINES.md`'s "fused borderless hero with full-bleed chart"
pattern entry.

- **The chart plots investable corpus, not net worth.** A deliberately smaller, different figure:
  mf/stock/fd/nps/ppf/epf/gold holdings + liquid funds, **excluding** vehicle/property/other — that
  equity can't fund a 4%-withdrawal retirement lifestyle the way a liquid/market-linked holding can
  (`core/calculators/retirementProjection.ts`'s `calcInvestableCorpus()`). Small muted value tags on the
  curve's start/end points ("Corpus ₹38L · today" / "₹5.95Cr proj.") disambiguate it from the net-worth
  number sitting visually on the same unit, since fusing the two into one card makes them easy to
  conflate. Both tags stay in the same violet family as their own chart dot (today's dot/tag use the
  lighter shade, projected's the bolder one) and are theme-aware — light theme gets darker violet
  variants of both, dark theme keeps the original pale lavenders. The "today" tag used to fall back to a
  plain gray (`theme.textTertiary`, unrelated to its own violet dot) and separately sat over a hardcoded
  black corner-glow blob meant for dark theme's own dark background — both found and fixed 2026-08-05,
  the second one being the real reason it still looked dull/unreadable in light theme even after its own
  text color was first fixed.
- **The whole fused hero shares one violet accent, not two different grays.** "Net worth"/"View
  breakdown" (`GlanceHeader.tsx`) and the "Needed"/"Projected"/"Monthly SIP" labels (`RetirementFundedSummary.tsx`'s
  `StatTile`) used to render in plain `theme.textTertiary`, inconsistent with the chart's own
  "today"/"projected" tags right above them — fixed 2026-08-05 to use the same theme-aware violet pair
  (light theme: `#6d28d9`; dark theme: `#a78bfa`), so the entire unit reads as one coherent accented
  group instead of a violet chart sitting over unrelated gray text.
- **Projected forward from today's live investable corpus** to a fixed retirement year
  (`calcRetirementProjection()` — annual compounding, contribution added at year-end), showing a
  dashed target marker + flag pill at the retirement year, a "% funded" gauge, and Needed/Projected/
  Monthly SIP stat rows. A CTA chip suggests the extra monthly SIP that closes any gap by that year.
- **A real historical segment builds up over time.** `useHome.ts` captures a `NetWorthSnapshot`
  (investable corpus + net worth) once per calendar month, first app-open in a new month. The chart's
  historical segment only renders once **≥2** real snapshots exist — before that, it's projection-only
  forward from today, never a fabricated past (holdings have no stored historical price series, unlike
  cash/bank balances which are exactly reconstructable for any past date).
- **One shared plan, edited from two places.** Only `RetirementFundedSummary`'s "Tap for expense
  projection" row (below the chart, not the chart itself) opens `RetirementDrilldownModal` — a
  **centered** modal (never a bottom sheet), leading with a single `Banner variant="info"` combining the
  inflation-assumption note and the shared-plan note, then the expense-projection curve, then a paired
  "Monthly expense today" / "Retirement age" row (same box height/style for both). Both write to the same
  singleton `RetirementPlan` the FIRE Calculator (Goals tab) reads and writes — editing either place
  updates both immediately. "Monthly expense today" defaults to trailing actual living spend
  (`useHomeStats`'s `livingThisMonth`) until the user overrides it, same "own edit always wins" pattern
  the FIRE Calculator already used for age. **Monthly SIP is deliberately not editable from this modal** —
  it doesn't drive the expense projection at all, so it stays a FIRE-Calculator-only field on the same
  shared plan; it defaults to `0` (untouched) until set there.
- **Net worth's own tap target is a nested `Pressable`** over the chart's naturally-empty top-left
  corner — RN's touch-responder system gives the innermost `Pressable` the touch, so tapping the net
  worth text opens its own (unchanged) breakdown modal instead of also triggering the drill-down.
- **The chart itself scrubs instead of opening anything.** Dragging across `RetirementCorpusChart`
  shows a live dashed vertical line + a value/year bubble at the nearest plotted point, released on touch
  end — plain RN responder handlers (`onResponderMove`/`onResponderRelease`), no gesture-handler
  dependency needed for a single-axis nearest-point pick. This is deliberately a different gesture from
  the drill-down tap, so dragging to inspect the curve and tapping to open the expense breakdown never
  compete for the same touch.
- **No full-bleed chart, matching the rest of Home.** The chart keeps the same left/right margin every
  other Home card has — dropped the original full-bleed (`-mx-4`) treatment after seeing it in situ read
  as inconsistent with the stat-tile row/Financial Health card beneath it.

Safe-to-spend and the colored asset-proportion bar / assets-liabilities summary line were **removed
from Home entirely** in the same pass — Safe-to-spend already lives on the Cash Flow screen, and the bar
didn't say anything the net-worth breakdown modal below doesn't already say better.

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

- See **net worth** fused with a live **Retirement Corpus** projection at a glance (see above); tap the
  net worth text for the full asset/liability breakdown — including **net IOU**: net lent shows as an
  **"Owed to You"** asset, net borrowed as an **"Owed to others"** liability. Both rows tap through to
  the Expenses screen's **IOU tab** (`navigate(PATHS.app.expenses, { state: { tab: 'iou' } })`) — there
  is no standalone IOU route. Tap anywhere else on the hero for the expense-projection drill-down.
- See the **money-stats card** (Spent this month · Insurance cover · Loans outstanding, plus a Tax line) and a **financial-health** score, each tapping through to its module.
- See your **household groups** and switch into a **group context** — when a group is active, Home shows that group's dashboard instead of your personal view.
- Glance at, and tap into, daily **stories** (see above) without leaving Home.
- Scroll through a horizontal strip of all your accounts and their live balances; credit cards show how much credit has been used
- View live prices for market tickers (Sensex, Nifty 50, Gold, Silver, USD/INR, Crude Oil) with the day's change, in a slim top ticker; customise the set from a preset list
- Jump directly to any module from shortcut tiles
- Control what's visible based on your privacy mode: **Open** shows everything; **Safe** (the default) shows everything except the specific accounts/categories/modules you've chosen to hide (Settings → Safe Mode)

## How it works

Net worth is calculated live each time the Home screen loads: it sums all holdings and account balances (assets) and subtracts all liabilities, reading from `liabilitiesRepo.getAll()`, `expensesRepo.getAll()`, `holdingsRepo.getAll()`, `accountsRepo.getAll()`, `ledgerEntriesRepo.getAll()`, and `personsRepo.getAll()`. **Net IOU** = Σ`signedAmount` over ledger entries (`core/iou/ledger`), **but only for active (non-archived) persons** — `loadSummary` builds an `activePersonIds` set from `persons.filter((p) => !p.isArchived)` and skips entries whose person is archived, so a deleted IOU (which soft-archives the person while keeping its entries for integrity) no longer lingers in net worth, matching the IOU-tab totals. A positive net is added to assets as an "Owed to You" line and to net worth; a negative net is added to liabilities — which offsets the cash movement of any IOU-linked transaction so net worth stays correct end-to-end.

`useHome` also subscribes to `penny:txn-changed` (`hooks/useTxnRefresh`) so balances/net worth reload live when the IOU screen records or removes a linked transaction, rather than only on navigation.

`useHome.ts` additionally computes `investableCorpus` (`core/calculators/retirementProjection.ts`'s
`calcInvestableCorpus()`, fed by `core/accounts/balanceCalculator.ts`'s `calcLiquidFunds()`) and, on each
load, fire-and-forgets a check for whether this calendar month already has a `NetWorthSnapshot` row —
writing one (never more than once per month, never backfilled) if not.
`features/home/useRetirementProjection.ts` combines that live figure with the shared `RetirementPlan`
(`useRetirementPlan()`), profile-derived current age, trailing actual spend (`useHomeStats`), and past
snapshots into the `RetirementProjectionResult` + chart points `GlanceHeader` renders.

Market data is fetched from external price feeds via `marketDataClient.ts` and cached for 15 minutes in the `price_cache` Dexie store to avoid excessive network calls. The market strip reads from this cache first and refreshes in the background when the cache is stale.

Privacy mode (Safe / Open, 2026-08-18 — a third "Privacy" mode was removed as overkill) is read via `usePrivacy().shouldMask(sensitive)` — the single source of truth for amount masking app-wide (see `docs/ARCHITECTURE.md` → Context providers). Open never masks. Safe masks only what's flagged sensitive: net worth and every Retirement Corpus figure are aggregates and stay visible in Safe, while each account's balance in the Accounts strip respects that account's own `hideInSafeMode` flag (Settings → Safe Mode → Accounts).

Key files:

- `src/features/home/HomePage.tsx` — thin composition, in order: greeting + GlanceHeader + MoneyStatsCard + FinancialHealthCard + StoriesRow + HomeGroupsCard + AccountsStrip + MarketTicker + ToolsGrid. When a group is the active context (`useGroupContext`) it renders `GroupDashboard` instead.
- `src/features/home/useHome.ts` — loads the net-worth summary (incl. active-person-only net IOU) + derives asset groups/totals; also computes `investableCorpus` and captures the monthly `NetWorthSnapshot`
- `src/features/home/useRetirementProjection.ts` — assembles the shared `RetirementPlan`, live investable corpus, past snapshots, current age, and trailing spend into the projection + chart points
- `src/features/home/GlanceHeader.tsx` — the fused Net worth + Retirement Corpus hero, and the (unchanged) net-worth breakdown modal; IOU rows navigate to the Expenses IOU tab
- `src/features/home/RetirementCorpusChart.tsx` — full-bleed `react-native-svg` area/line chart (real computed trajectory, not a decorative shape) + dashed target marker/flag pill/value tags/corner glow
- `src/features/home/RetirementFundedSummary.tsx` — the "% funded" radial gauge + stat rows + CTA chip + tap hint, below (not overlapping) the chart
- `src/features/home/RetirementDrilldownModal.tsx` — centered modal (never a bottom sheet) for editing the shared plan's monthly-expense/retirement-age inputs
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

**Mobile — 2026-08-01 Calculators relocation:** `MarketTicker.tsx` had already moved to
`features/portfolio/` (see `docs/features/portfolio/overview.md`), and `ToolsGrid.tsx` — down to a
single "Calculators" tile by then — was deleted outright once that calculator relocated too. Mobile's
`HomePage.tsx` composition is now: greeting + GlanceHeader + MoneyStatsCard + FinancialHealthCard +
StoriesRow + HomeGroupsCard + AccountsStrip, full stop.

## Current limitations

- The Retirement Corpus chart's historical segment only appears once ≥2 monthly snapshots exist — a
  fresh install shows a projection-only forward curve for its first two calendar months, by design
  (never a fabricated past)
- "Today's changes" (portfolio gain/loss for the day) is not yet surfaced on Home
- Market ticker customisation is limited to a preset list; you cannot add arbitrary symbols
- Module summary stats are static counts; they do not surface urgency signals (e.g. a goal falling behind)

## Planned improvements

- Phase 2: "Today's changes" panel showing your portfolio's daily gain or loss in rupees and percentage

## Ideas welcome

- Which additional market tickers would be most useful in the preset list?
- What summary stats on the module tiles would be most helpful at a glance?
- Should the market strip refresh automatically while the app is open, or only on manual pull-to-refresh?
