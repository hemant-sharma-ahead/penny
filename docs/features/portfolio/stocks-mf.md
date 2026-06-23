# Stocks & Mutual Funds

## What it is
Penny tracks your direct equity (stock) holdings and mutual fund (MF) investments with live market prices. You add each purchase lot manually, and Penny groups them by stock symbol or fund scheme to show your consolidated position with real-time gain/loss.

## User-facing capabilities
- Search for any NSE/BSE-listed stock by symbol or company name and add it to your holdings.
- Search for any mutual fund scheme by name and add SIP or lump-sum purchase lots.
- See live prices for stocks (refreshed every 15 minutes) and live NAV for mutual funds.
- View your total invested amount, current value, and absolute + percentage gain/loss for each stock and fund.
- Expand any stock or fund to see the individual lot breakdown (each purchase entry with its own cost basis).
- Edit or delete individual purchase lots.

## How it works
**Stocks:**
- Symbol search and validation via the Yahoo Finance unofficial chart API.
- Live prices are fetched and cached for 15 minutes in the `price_cache` Dexie store (`src/core/db/priceCache.ts`).
- Holdings are grouped client-side by `assetMeta.stockSymbol`. Gain/loss per lot = `(currentPrice × units) − (purchasePrice × units)`. Totals are summed across all lots for the grouped view.
- `assetMeta` fields: `stockSymbol`, `stockExchange`.

**Mutual Funds:**
- Scheme search and NAV data from [MFAPI.in](https://mfapi.in) (free, no auth).
- On scheme selection, fund house and scheme category are fetched from `GET /mf/{schemeCode}` and stored in `assetMeta`.
- Holdings are grouped by `assetMeta.schemeCode` with expandable SIP lot breakdown.
- Gain/loss calculation is identical to stocks: `(currentNAV × units) − (purchaseNAV × units)`.
- `assetMeta` fields: `schemeCode`, `mfFundHouse`, `mfSchemeCategory`.

**Data model:**
- `assetClass: 'equity'` for stocks, `assetClass: 'mf'` for mutual funds.

**Key files:**
- `src/features/portfolio/PortfolioPage.tsx` — Stocks and MF sub-tabs, grouping and display logic.
- `src/features/portfolio/HoldingForm.tsx` — Add/edit holding form for both asset types.
- `src/core/db/priceCache.ts` — Price fetch, cache read/write, TTL logic.

## Current limitations
- Manual lot entry only — no broker or demat account sync.
- Symbol grouping (weighted average cost basis) is computed client-side on every render, not persisted.
- No CAS (Consolidated Account Statement) import.
- No XIRR/annualised return calculation — only absolute gain/loss.
- No portfolio allocation chart (e.g. sector breakdown, fund category split).

## Planned improvements
- **Phase 2:** CAS PDF import (CDSL/CAMS) to automatically populate both stock and MF lots.
- **Phase 2:** XIRR calculation for each holding and total portfolio.
- **Phase 2:** Sector/category allocation breakdown chart.

## Ideas welcome
- Would you find XIRR (annualised return) more useful than simple gain/loss percentage?
- How do you want SIPs modelled — as individual lots or as a single consolidated position with average NAV?
- Are there data points beyond price, units, and gain/loss that would help you make decisions directly inside Penny?
- Any specific MF categories (index funds, ELSS, debt funds) that need special treatment in the UI?
