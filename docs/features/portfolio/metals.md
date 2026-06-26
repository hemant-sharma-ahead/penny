# Metals (Gold & Silver)

## What it is
Penny tracks physical and digital gold and silver holdings with live price data. Whether you own jewellery, coins, bars, Sovereign Gold Bonds (SGB), or gold/silver ETFs, Penny calculates the current market value automatically — accounting for karat purity on gold and fineness on silver.

## User-facing capabilities
- Add gold holdings by category (jewellery, coin, bar, digital/SGB/ETF, other), karat (14K, 18K, 22K, 24K), weight in grams, and purchase price per gram.
- Add silver holdings by category (jewellery, coin, bar, digital, other), purity (999/pure, 925/sterling, 800, other), weight in grams, and purchase price per gram.
- See the live current value for each holding, adjusted for karat or purity.
- See your total gain/loss in ₹ and % across all gold and silver holdings.
- All metal values roll up into your total net worth.

## How it works
**Live price sources (via MFAPI.in):**
- **Gold:** Scheme code `140088` (Gold BeES ETF). `NAV × 100` = approximate 24K gold price in ₹/gram.
- **Silver:** Scheme code `149758` (Silver ETF). NAV = approximate silver price in ₹/gram.
- Prices are cached alongside other MFAPI prices in the `price_cache` store.

**Karat-adjusted gold value:**
- Formula: `currentValue = weightGrams × (karat / 24) × live24KPrice`
- Example: 22K gold at 10g = `10 × (22/24) × live24KPrice`.

**Silver purity adjustment:**
- Formula: `currentValue = weightGrams × (purity / 1000) × liveSilverPrice`
- Example: 925 sterling silver at 50g = `50 × (925/1000) × liveSilverPrice`.

**Data model:**
- `assetClass: 'gold'` for both gold and silver records.
- `metalType: 'gold' | 'silver'` distinguishes the two.
- Gold fields: `metalCategory`, `metalKarat`, `metalWeightGrams`, `metalPurchasePricePerGram`.
- Silver fields: `metalCategory`, `metalPurity`, `metalWeightGrams`, `metalPurchasePricePerGram`.

**Key files:**
- `src/features/portfolio/PortfolioPage.tsx` — Metals sub-tab, gold and silver card rendering.
- `src/core/metals/metalsClient.ts` — `fetchMetalPrices()` and `goldPriceForKarat()` functions.

## Current limitations
- Jewellery making charges are not separately tracked — users must manually include them in the purchase price per gram or accept that current value excludes making charges.
- Silver purity adjustment is an approximation; actual market value for sterling or 800 silver may differ from the formula output.
- Digital gold instruments (SGB, Gold ETF) are modelled by weight — not by units with NAV, so SGB interest accrual is not tracked.
- No distinction between hallmarked and non-hallmarked jewellery (which affects resale value significantly).

## Planned improvements
- **Phase 2:** Dedicated SGB tracking with unit-based holdings, coupon interest accrual, and maturity date.
- **Phase 2:** Gold loan eligibility calculator (e.g. LTV ratio against hallmarked jewellery value).
- **Phase 2:** Separate field for making charges so net liquidation value vs gross value can be shown.

## Ideas welcome
- Would you want to track gold jewellery by piece (with a photo and description) rather than just total weight and karat?
- Should SGBs have their own sub-type with interest credit tracking, or is grouping them under "digital" gold sufficient?
- Are there other precious metals (platinum, palladium) worth adding, or is gold and silver sufficient for the target audience?
- How should Penny handle gold received as gifts where the purchase price is unknown — a "market price on date received" default, or leave it blank?
