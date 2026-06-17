# IPO Tracker — Technical Reference

Research and decisions made during M10 planning. Read this before touching
any IPO-related code or reconsidering data sources.

---

## Data source decision

**Primary source: investorgain.com internal JSON API**

After evaluating 6 sources, investorgain.com's internal API is the right
call. It requires zero API keys, zero signup, returns clean JSON with CORS
headers that allow direct browser calls, and covers everything we need in
one endpoint.

Sources evaluated and rejected:

| Source | Why rejected |
|--------|-------------|
| ipoguru.in | Proper API but requires email signup for key. investorgain covers same data without a key. Keep as noted fallback if investorgain breaks. |
| ipoalerts.in | 25 req/day free tier, no GMP on free plan, too restrictive |
| chittorgarh.com | No public API, ASP.NET pages, some JS-rendered, high scrape complexity |
| IndianAPI.in | No IPO or GMP API at all |
| Community projects | ipo-gmp-pro (Utsav173) was the only relevant one — Worker endpoint dead as of Dec 2024 |

---

## investorgain.com API

### Main list endpoint

```
GET https://webnodejs.investorgain.com/cloud/report/data-read/331/1/6/{year}/{fy}/0/all?search=&v={timestamp}
```

- `{year}` = current calendar year (e.g. `2026`)
- `{fy}` = financial year string (e.g. `2026-27`)
- `{timestamp}` = `Date.now()` to bust cache
- **Update required every April** when the financial year rolls over
- No auth headers needed
- No CORS issues — verified June 2026 by calling directly from browser

### GMP history endpoint (per IPO)

```
GET https://webnodejs.investorgain.com/cloud/ipo/ipo-gmp-read/{id}/true
```

Returns an `ipoGmpTable` field containing an HTML table string.
Parse with `DOMParser` in browser context, or `htmlparser2` in a Worker.

### Subscription detail endpoint (per IPO)

```
GET https://webnodejs.investorgain.com/cloud/ipo/ipo-subscription-read/{id}
```

Returns per-day QIB/NII/RII breakdown for a live IPO.

---

## Response data structure

### Clean fields (use directly, no parsing needed)

| Field | Content | Example |
|-------|---------|---------|
| `~ipo_name` | IPO name | `"Ather Energy"` |
| `~id` | Unique ID (used for detail endpoints) | `1885` |
| `~gmp_percent_calc` | GMP % as number string | `"56.52"` |
| `~Srt_Open` | Subscription open date (ISO) | `"2026-06-23"` |
| `~Srt_Close` | Subscription close date (ISO) | `"2026-06-25"` |
| `~Srt_BoA_Dt` | Basis of allotment date (ISO) | `"2026-06-29"` |
| `~Str_Listing` | Listing date (ISO) | `"2026-07-01"` |
| `~IPO_Category` | Type | `"IPO"` or `"SME"` |
| `~Highlight_Row` | Status signal (see below) | `"color-green"` |
| `~urlrewrite_folder_name` | Detail page path on investorgain | `"/gmp/ather-energy-ipo/1885/"` |
| `Sub` | Total subscription multiple | `"304.11x"` or `"-"` |
| `Price (₹)` | Issue price | `"152"` |
| `Lot` | Lot size | `"98"` |

### Fields requiring simple regex

| Field | Raw value | How to extract |
|-------|-----------|----------------|
| `GMP` | `"₹<b>78</b> (56.52%)"` | Number between `<b>` tags → GMP in ₹ |
| `Name` | `"...L@268 (39.58%)..."` | Regex `L@([\d.]+)\s*\(([-\d.]+)%\)` → listing price + gain % |

### Status derivation from `~Highlight_Row`

| Value | Status |
|-------|--------|
| `"color-lightyellow"` | Upcoming |
| `"color-green"` | Open (currently accepting subscriptions) |
| `"color-antiquewhite"` | Closed (allotment/listing pending) |
| `""` (empty) | Listed |

Cross-check with `~Srt_Open`, `~Srt_Close`, `~Str_Listing` vs `Date.now()`
for additional reliability. The `~Highlight_Row` field alone is sufficient
for tab categorisation.

---

## Architecture

### M10 — direct browser calls (current)

No backend needed. Call investorgain.com directly from the app.
Cache responses in the existing `price_cache` Dexie plain store with a
timestamp. Refresh hourly between 10:00–17:00 IST on weekdays.

Refresh logic (IST = UTC+5:30):

```ts
const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
const h = nowIST.getUTCHours();
const day = nowIST.getUTCDay(); // 0 = Sunday, 6 = Saturday
const isMarketHours = h >= 10 && h < 17 && day !== 0 && day !== 6;
```

Cache key: `ipo_list` in `price_cache`. Store the raw `reportTableData`
array + `fetchedAt` timestamp. On app load, serve cache if fresh
(< 60 min during market hours, or any age outside market hours).

### Scale migration — Cloudflare Worker + KV (when going public)

When scaling to many users, add a Cloudflare Worker that:
1. Fetches from investorgain.com once per hour via Cron Trigger
2. Stores the merged JSON in Workers KV
3. Serves the KV blob to all app clients (one URL change in the app)

Free tier comfortably covers this:
- Workers KV: 100K reads/day free
- Cron Triggers: 5 free cron jobs
- investorgain.com sees: 7 requests/day regardless of user count

The app only needs a one-line URL constant change — no other code changes.

---

## GMP display strategy

GMP is shown inline on each IPO card. Content varies by lifecycle stage:

| Tab | GMP treatment |
|-----|--------------|
| Upcoming | Show if available (`~gmp_percent_calc > 0`), labelled muted grey, marked speculative |
| Open | Prominent green/red badge — key signal for apply/skip decision |
| Closed | Final pre-listing GMP |
| Listed | GMP at listing (from Open date field inline HTML) vs actual listing gain side by side |

Badge format: `₹42  +14.2%` — green if positive, red if negative, grey `—` if unavailable.

---

## IPO subscription hours (India)

- **UPI-based retail (RII):** 10:00 AM – 5:00 PM IST, each subscription day
- **ASBA (HNI/QIB):** Same window via bank portals
- Subscription multiples update throughout the day during these hours
- Weekends and public holidays: no updates, serve stale cache

Hourly refresh between 10–17 IST on weekdays is the correct cadence.

---

## Financial year URL maintenance

The main list endpoint URL contains a financial year segment:

```
.../data-read/331/1/6/2025/2025-26/0/all
```

This needs updating every April (Indian FY starts April 1). Centralise this
in a single constant in `src/core/ipo/ipoClient.ts` so it's a one-line
change each year:

```ts
const IPO_FY = { year: '2025', fy: '2025-26' }; // update each April
```

---

## Scale considerations

A naive "each user calls investorgain directly" approach can break at scale:
- investorgain may rate-limit or block high-frequency hits from many IPs
- No control over data freshness across users

The Cloudflare Worker + KV cache pattern solves this permanently at zero
cost on the free tier. Migrate before any public launch or marketing push.

React Native migration was also evaluated (June 2026). Short answer: ~3–4
months of effort to rebuild M0–M9, not justified for Phase 1. Capacitor
wrapping the existing PWA is the correct mobile path. See session transcript
for full breakdown.
