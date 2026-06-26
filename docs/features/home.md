# Home

## What it is
The app's main dashboard — the first thing you see after unlocking Penny. It gives you a holistic snapshot of your financial life: your net worth, all your account balances, live market prices, quick links to every module, and AI-powered insights from Chip.

## User-facing capabilities
- See your total net worth at a glance (assets minus liabilities), with a breakdown of assets and liabilities subtotals
- Tap the net worth card to see a full breakdown of what's included
- Scroll through a horizontal strip of all your accounts and their live balances; credit cards show how much credit has been used
- View live prices for 6 market tickers (Sensex, Nifty 50, Gold, Silver, USD/INR, Crude Oil) with the day's change
- Customise which 6 tickers appear in the market strip, chosen from a preset list of approximately 12 options
- Jump directly to any module (Portfolio, Expenses, Goals, Insurance, etc.) from shortcut tiles, each showing a summary stat (e.g. "3 goals, 68% average progress")
- Read AI-generated insights from Chip relevant to your current financial picture
- Control what's visible based on your privacy mode — hide everything, hide numbers only, or see everything

## How it works
Net worth is calculated live each time the Home screen loads: it sums all holdings and account balances (assets) and subtracts all liabilities, reading from `holdingsRepo.getAll()`, `accountsRepo.getAll()`, and `liabilitiesRepo.getAll()`.

Market data is fetched from external price feeds via `marketDataClient.ts` and cached for 15 minutes in the `price_cache` Dexie store to avoid excessive network calls. The market strip reads from this cache first and refreshes in the background when the cache is stale.

Privacy mode (Safe / Privacy / Open) is read from `PrivacyContext`. In Safe mode, net worth and all balances are replaced with `••••`. In Privacy mode, only section titles are shown and all numbers are hidden. In Open mode, everything is displayed normally.

Key files:
- `src/features/home/HomePage.tsx` — thin composition: greeting + NetWorthCard + MarketStrip + AccountsStrip + ToolsGrid
- `src/features/home/useHome.ts` — loads the net-worth snapshot + derives asset groups/totals
- `src/features/home/NetWorthCard.tsx` — net-worth hero card (asset/liability breakdown); fixed dark palette centralised in one `HERO` constant
- `src/features/home/AccountsStrip.tsx` / `ToolsGrid.tsx` — account scroller + tools tiles
- `src/features/home/MarketStrip.tsx` — scrollable market tickers strip
- `src/core/market/marketDataClient.ts` — price fetch + 15-minute cache logic

## Current limitations
- No historical net worth graph — you can see today's number but not how it has changed over time
- "Today's changes" (portfolio gain/loss for the day) is not yet surfaced on Home
- Market ticker customisation is limited to a preset list; you cannot add arbitrary symbols
- Module summary stats are static counts; they do not surface urgency signals (e.g. a goal falling behind)

## Planned improvements
- Phase 2: Net worth trend graph — a month-by-month sparkline showing how your net worth has grown
- Phase 2: "Today's changes" panel showing your portfolio's daily gain or loss in rupees and percentage
- Phase 1.5: Group context switcher — a dropdown at the top to toggle between your personal view and a household group view

## Ideas welcome
- Which additional market tickers would be most useful in the preset list?
- What summary stats on the module tiles would be most helpful at a glance?
- Should the market strip refresh automatically while the app is open, or only on manual pull-to-refresh?
