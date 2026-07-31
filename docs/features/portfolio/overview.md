# Portfolio Overview

## What it is

Portfolio is Penny's comprehensive asset tracking module. It gives you a single view of your net worth across every asset class an Indian investor might own — stocks, mutual funds, retirement accounts, fixed deposits, gold/silver, vehicles, and property — all in one encrypted, privacy-first place. Net worth is calculated as the sum of all holdings (assets) plus bank account balances, minus all liabilities.

## User-facing capabilities

- View your total net worth at a glance on the Portfolio home screen.
- Browse holdings across six asset sub-tabs: Stocks, Mutual Funds, Retirement (NPS/PPF/EPF), Fixed Income (FD/RD), Metals (Gold/Silver), and Real Assets (Vehicles/Property).
- Track open and upcoming IPOs with live GMP and subscription data on the IPO tab.
- Add, edit, and delete holdings manually for any asset class.
- See live or auto-calculated current values for supported asset types (stocks, MFs, gold, silver, NPS, FD/RD).
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
