# Portfolio Overview

## What it is

Portfolio is Penny's comprehensive asset tracking module. It gives you a single view of your net worth across every asset class an Indian investor might own — stocks, mutual funds, retirement accounts, fixed deposits, gold/silver, vehicles, and property — all in one encrypted, privacy-first place. Net worth is calculated as the sum of all holdings (assets) plus bank account balances, minus all liabilities.

## User-facing capabilities

- View your total net worth at a glance on the Portfolio home screen. **Mobile only, since
  2026-08-01**: this header total is collapsible — collapsed (default) shows just Current
  Value + Return %; tap the row to expand to the full Total Invested/Current Value/Return/
  Return % breakdown.
- Browse holdings across six asset sub-tabs: Stocks, Mutual Funds, Retirement (NPS/PPF/EPF), Fixed Income (FD/RD), Metals (Gold/Silver), and Real Assets (Vehicles/Property). **`apps/mobile` only, since 2026-08-01**: Stocks/Mutual Funds/IPO/News now live one level deeper, under a single **Equity** main tab (see "Mobile — 2026-08-01 Equity consolidation" below); `apps/web-react` (frozen) still has the flat 6-sub-tab-under-Holdings + separate-IPO-tab structure described just above.
- Track open and upcoming IPOs with live GMP and subscription data (web: its own IPO main tab; mobile: Equity → IPO sub-tab).
- Add, edit, and delete holdings manually for any asset class.
- See live or auto-calculated current values for supported asset types (stocks, MFs, gold, silver, NPS, FD/RD).
- **Mobile only**: a per-sub-tab summary card on Equity's Stocks and Mutual Funds sub-tabs — portfolio value for that asset class, then Invested/Returns/Returns % below. No 1-day change figure yet — `Holding` only stores the latest fetched price, not a prior day's, so a genuine day-over-day number isn't computable without adding price-history tracking (a separate future task).
- **Mobile only**: the market strip (Sensex/Nifty/Gold/Silver/USD-INR, configurable via its own "⋮" menu) moved here from Home, pinned above the main asset-class tabs so it's visible regardless of which one is active. It's also no longer a continuously auto-scrolling marquee — small static cards, swiped manually, easier to actually read.
- **Mobile only, since 2026-08-01**: a "Calculators" entry-row section on the Retirement tab
  (Gratuity, Sukanya Samriddhi) and Fixed Income tab (FD/RD Maturity) — tapping a row opens
  that calculator in a Modal, relocated out of Home's now-removed generic Calculators hub. See
  [`docs/features/calculators.md`](../calculators.md).
- All data is stored locally and encrypted — nothing leaves your device.

## How it works

**Data model:** All assets are stored in a single `holdings` Dexie store. The `assetClass` field discriminates the type (e.g. `'equity'`, `'mf'`, `'nps'`, `'ppf'`, `'epf'`, `'fd'`, `'gold'`). Each record carries a free-form `assetMeta` JSON field for type-specific data (e.g. stock symbol, scheme code, EPF employer list).

**Net worth formula:**

```
Net worth = SUM(holdings.currentValue) + SUM(accounts.balance) − SUM(liabilities.currentBalance)
```

**Code structure (vertical slices):** `PortfolioPage.tsx` is a thin housing (~170 lines) — header
totals + Holdings/IPO top tabs + the holdings sub-tab strip that dispatches to the active section.
Each asset category is a self-contained slice under `src/features/portfolio/holdings/<category>/`
(its cards, `<XSection>`, add/edit `<XModal>`(s), field-groups, and class-specific hooks/helpers).
Cross-category form primitives live in `holdings/shared/`; the IPO tab in `portfolio/ipo/`. Per-class
save logic is pure (`core/portfolio/holdingMappers.ts` + `vehicleMeta.ts`, unit-tested); external
APIs in `core/portfolio/*Client.ts`. See `docs/ARCHITECTURE.md` and `penny-standards.md`.

**Sub-tabs:**

- Holdings tab with 6 nested sub-tabs: Stocks, MF, Retirement, Fixed Income, Metals, Real Assets
- IPO tracker tab

All encrypted reads go through `EncryptedRepository<T>` in `src/core/db/repository.ts`. Direct Dexie access is not permitted from feature code.

**Safe Mode masking:** amounts across every holdings sub-tab respect `usePrivacy().shouldMask(!safeModeVisibility.portfolio)` — a single module-wide toggle in Settings → Safe Mode (visible by default; Privacy always masks; Open never does). Holdings don't have per-item categories, so this isn't per-holding. Real Assets → Vehicle is the one exception: its PII fields (registration number, owner name, address, policy/engine/chassis numbers — see `docs/features/portfolio/real-assets.md`) stay hidden outside Open mode regardless of the Portfolio toggle, since they're identity data, not amounts.

**Mobile (`apps/mobile`):** ported in Track 4 (the largest module yet, ~7,462 web lines across 53 files) — `apps/mobile/src/features/portfolio/` mirrors the web structure above: a shared `PortfolioPage.tsx` tab shell (Holdings sub-tabs + IPO tab), `holdings/shared/` (reusable field helpers every asset class imports), and one directory per asset class (`equity/`, `fixed-income/`, `precious-metals/`, `real-assets/`, `retirement/`) plus `ipo/`. Ported in parallel by asset class since, unlike Home/IOU, Portfolio has **no `GroupContext`/Tier 2 dependency at all** — no personal-only scoping decision was needed. Recurring platform fixes applied throughout: `STATUS.x` literal CSS-var colors → `useThemeColors()` (highest concentration yet, ~30+ sites, mostly in `RetirementCard.tsx`); CSS Grid → `flex-row flex-wrap`; several hand-rolled `fixed inset-0` modal overlays (`VehicleDetailModal`, `NpsLifecycleDetail`, an `EpfAllTransactionsSheet`, an inline popup in `RetirementSheets`, `IpoDetailModal`) rebuilt on the real ported `Modal` component instead of translating CSS positioning that has no RN equivalent. Two `packages/core` bugs fixed (same class as Home's `marketDataClient`/`apiBase` fixes): `core/ipo/ipoClient.ts` and `core/nps/npsClient.ts` both cached data via synchronous `localStorage`, incompatible with RN — both got `.native.ts` siblings that keep an in-memory-only cache (session-scoped, not persisted across cold starts) rather than restructuring the caching signatures. All external data fetching (stock/MF/gold/silver prices, NPS NAVs, IPO/GMP data, vehicle RC lookup) already routed through `apiBase.native.ts` (built during Home's port) with zero new base-URL gotchas. Full detail: [`docs/plans/mobile-migration.md`](../../plans/mobile-migration.md)'s Portfolio progress-log entry.

**Mobile — 2026-08-01 Equity consolidation** (`apps/mobile` only, `apps/web-react` untouched/frozen):
`PortfolioPage.tsx`'s main tabs went from `Holdings`/`IPO` (2 tabs, with Holdings' own 6-item sub-tab
pill row) to 5 asset-class tabs — **Equity**, Fixed Income, Precious Metals, Retirement, Real Assets.
Fixed Income/Precious Metals/Retirement/Real Assets are unchanged content, just promoted straight to
their own main tab (still driven by the same `HOLDINGS_SUBTABS` config in `usePortfolioHoldings.ts`,
untouched). Equity gained its own second-level tab strip: **Stocks · MF · IPO · News**. `IpoTab.tsx`
moved in as Equity's IPO sub-tab unchanged (still owns its own virtualized list). The News screen
(`apps/mobile/src/features/news/`) was pulled in whole as Equity's News sub-tab — renamed
`NewsPage` → `NewsView`, dropped its own `SafeAreaView`/background/header-back registration (now
inherited from `PortfolioPage`'s) — and is no longer reachable from Home at all (`ToolsGrid.tsx`'s News
tile and Settings' matching "Modules" toggle were both removed, since there's no longer a screen for
either to point at). Its mood display/filters/tab-switch diverged from web in the 2026-08-01 density
follow-up below. A new `EquitySummaryCard.tsx` shows a per-sub-tab summary (Portfolio Value, then
Invested/Returns/Returns %) on Stocks and MF specifically. The market strip (`MarketTicker.tsx`, moved
from `features/home/` to `features/portfolio/`) relocated from Home to sit pinned above Portfolio's main
tabs, and switched from a continuously auto-scrolling marquee (`react-native-reanimated`) to a static,
manually-swiped row of small cards — same underlying data/config, same "⋮" configure entry.
`GlanceHeader.tsx`'s net-worth-breakdown deep link grew from a flat `holdingsSubTab` route param to
`{ mainTab, equitySubTab }` to address the new two-level structure.

**Mobile — 2026-08-01 density follow-up:** on-device review of the consolidated layout found two
problems, both fixed: (1) the header's Total Invested/Current Value/Return/Return % 2×2 grid ate space
every tab below it needed — now collapsible, defaulting collapsed to just Current Value + Return %
(`summaryExpanded` state in `PortfolioPage.tsx`, tap the row to expand/collapse); (2) News's own chrome
(always-visible mood banner + disclaimer + 2-3 stacked Source/Tone/Holding filter dropdown boxes) left
only ~2 headline cards visible, and its All News/Holdings News tab row read as a 3rd stacked tab layer
under Equity's own main tabs + Stocks/MF/IPO/News sub-tabs — see
[`docs/features/news.md`](../news.md)/[`docs/features/news-sentiment.md`](../news-sentiment.md) for the
`NewsMoodNote`/combined-Filters-modal/`SegmentedControl` fix.

## Current limitations

- Manual entry only — no broker, demat, or bank auto-sync in Phase 1.
- No CAS (Consolidated Account Statement) PDF import yet.
- No net worth trend graph (month-over-month history is not stored).
- No watchlist or price alert feature.

## Contextual tax notes (Track 7)

Each holdings sub-tab shows a compact, collapsible **"Tax on this"** note (`src/components/AssetTaxNote.tsx`) — FD/RD interest & TDS, equity LTCG/STCG, gold GST + cap-gains, property rental/LTCG/stamp duty, and NPS/PPF/EPF rules. Content is the single shared source `src/core/tax/assetTaxInfo.ts`, also reflected on the Tax Awareness screen, so the two never drift. Awareness only — not filing advice.

## Planned improvements

- **Phase 2:** CAS PDF import via CDSL/CAMS for stocks and mutual funds.
- **Phase 2:** EPFO passbook PDF import using PDF.js.
- **Phase 2:** Net worth trend line graph using stored monthly snapshots.
- **Phase 2:** Watchlist with price alerts for stocks and MFs.

## Ideas welcome

- What asset classes are missing from your portfolio that Penny doesn't track yet?
- How would you prefer to visualise net worth over time — line graph, bar chart, or a breakdown by asset class?
- Are there integrations (broker APIs, bank feeds, EPFO, NSDL) that would save you the most time if automated?
- What level of detail matters most to you on the portfolio home screen — just totals, or a full breakdown by asset class?
