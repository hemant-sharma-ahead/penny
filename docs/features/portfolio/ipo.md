# IPO Tracker

## What it is

Penny's IPO Tracker shows you the full lifecycle of Indian IPOs — from announcement through listing — with live grey market premium (GMP), subscription data, and a searchable history of listed IPOs filtered by financial year. It's a read-only research tool: you can follow IPOs, but application tracking requires broker integration (Phase 2).

## User-facing capabilities

- Browse IPOs across four lifecycle tabs: Upcoming, Open, Closed, and Listed.
- See live GMP (Grey Market Premium) in ₹ and as a percentage above issue price for open IPOs.
- See live subscription multiples broken down by investor category: QIB, HNI (NII), Retail (RII), and Total.
- View a day-wise subscription table showing how subscription built up over each day.
- Tap any IPO for a detailed modal with company details, financials, issue dates, price band, lot size, issue size, and promoter holding.
- Filter the Listed tab by financial year (April–March) and search by company name.
- See listing gain/loss percentage for every listed IPO.

## How it works

**Data source:** [investorgain.com](https://webnodejs.investorgain.com) (free, no authentication required). This is an unofficial API used for data aggregation.

**Lifecycle tabs:**

- **Upcoming:** IPOs announced but subscription not yet open.
- **Open:** Actively accepting applications. GMP and subscription multiples refresh with each fetch.
- **Closed:** Subscription closed, allotment pending. GMP may still be shown.
- **Listed:** Trading on exchange. Shows listing price and listing gain %.

**Data per IPO record (`IpoItem` type):**

- Company name, sector, price band (lower–upper ₹), lot size, issue dates (open/close), issue size (₹ Cr), promoter holding %.
- GMP in ₹ and % above issue price.
- Subscription multiples: QIB, HNI, Retail, Total (as `x` multiples).
- Day-wise subscription table (`IpoSubDetail[]`).
- Listing price and listing gain % (Listed tab only).

**Caching:** All IPO data is cached for 30 minutes in the `price_cache` Dexie store to avoid hammering the source.

**FY filtering:** The Listed tab uses `CURRENT_FY` constant defined in `src/core/ipo/ipoTypes.ts` (April–March boundary). Users can switch to prior FYs via a year picker.

**Key files:**

- `src/core/ipo/ipoClient.ts` — API calls to investorgain.com.
- `src/core/ipo/ipoTypes.ts` — `IpoItem`, `IpoSubDetail`, `CURRENT_FY`, and related types.
- `src/core/ipo/useIpos.ts` — React hook for fetching, caching, and exposing IPO data to the UI.
- `src/features/portfolio/PortfolioPage.tsx` — IPO tab rendering, detail modal, FY picker, search.

## Current limitations

- Live data only — demo mode does not seed IPO data (intentionally skipped; live API is read-only and safe to call).
- Dependent on investorgain.com free tier; no SLA or rate limit guarantees.
- No IPO application tracking — would require broker API integration.
- No notification or alert when a tracked IPO opens for subscription or allotment results are published.
- No personal watchlist to mark IPOs you're interested in.

## Planned improvements

- **M14 (Finance News):** IPO news feed as part of broader financial news integration.
- **Phase 2:** IPO application tracker — connect to broker APIs (Zerodha, Groww, etc.) for application status and allotment results.
- **Phase 2:** Personalised IPO watchlist with push notifications for open/allotment/listing events.

## Ideas welcome

- What information matters most to you when evaluating an IPO — GMP, subscription numbers, financials, or something else?
- Would you want to log your IPO applications manually (amount applied, lot count, allotment result) even without broker integration?
- Are there other IPO data points (anchor investor details, registrar, market maker) that would help your research?
- How should unlisted/SME IPOs be handled — separate tab, same list with a badge, or filtered out entirely?
