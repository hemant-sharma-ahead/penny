# Finance News

## What it is

A curated, read-only feed of Indian markets/regulatory headlines (ET Markets, Mint, RBI,
SEBI) with link-out to the source. No accounts, no personal data involved. Sentiment
scoring on top of this feed is a separate layer — see
[`docs/features/news-sentiment.md`](news-sentiment.md).

## The core challenge: RSS in a backend-less app

Every other external fetch in Penny (market data, IPO/GMP) hits a CORS-permissive JSON
API. News RSS feeds are different: they're XML (needs parsing), and publisher feeds (ET,
Mint, RBI, SEBI) don't send `Access-Control-Allow-Origin`, so a direct browser/app fetch is
blocked by CORS regardless of CSP config. Three options were considered:

| Option | Backend? | Privacy | Reliability | Decision |
|---|---|---|---|---|
| Public RSS proxy (AllOrigins) | None (3rd-party) | Feed URLs pass through a 3rd party — no personal data involved, only which public feeds are requested | Subject to rate limits/timeouts | Fallback only, since 2026-07-27 |
| Cloudflare Worker | 1 Worker (self-owned) | Best — fully controlled | Best | **Chosen, live since 2026-07-27** |
| Direct fetch | None | Best | Fails on CORS | Not viable |

**Now: `workers/api-proxy`'s `/rss/:feedId` route** (`workers/api-proxy/src/news.ts`) —
the same deployed Worker Yahoo/MFAPI/NPS/investorgain already route through, extended with
a dedicated news route (not the generic prefix passthrough, since each feed lives on a
different publisher host and returns XML, not JSON). `fetchNewsFeed(source)` in
`newsClient.ts`/`newsClient.native.ts` prefers this (`NEWS_PROXY_BASE` from `apiBase.ts`)
when a Worker is configured, and falls back to the public AllOrigins proxy
(`api.allorigins.win/raw?url=<feed>`) only when no Worker is set up (e.g. local dev without
`VITE_API_PROXY`/`apiProxyUrl`) — this fallback moved in after AllOrigins started
408-timing-out on the RBI/SEBI feeds specifically. See
[`docs/EXTERNAL_APIS.md`](../EXTERNAL_APIS.md) for the exact endpoint registry.

## Sources

| Source | Category | Feed |
|---|---|---|
| ET Markets | Markets | `economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms` |
| Mint | Markets / Money | `livemint.com/rss/markets` |
| RBI | Regulatory | `rbi.org.in/pressreleases_rss.xml` |
| SEBI | Regulatory | `sebi.gov.in/sebirss.xml` |

The list is data-driven (`NEWS_SOURCES`) — more sources can be added without a schema change.

## Data model

```ts
type NewsSourceId = 'et-markets' | 'mint' | 'rbi' | 'sebi';

interface NewsSource {
  id: NewsSourceId;
  label: string;
  category: 'markets' | 'regulatory';
  feedUrl: string;
  color: string;
}

interface NewsItem {
  id: string; // hash of link (dedupe key)
  sourceId: NewsSourceId;
  title: string;
  link: string;
  publishedAt: number;
  summary?: string;
}
```

## Caching

Parsed items are cached in a **plain** (non-encrypted) store — this is public data, no PII
— with a 30-60 min TTL, mirroring the market-data client's freshness pattern. Cached items
show instantly; refresh happens in the background, plus a manual pull-to-refresh.

## UI

- Headline card: title (2-line clamp), coloured source chip, relative time ("2h ago").
- Filter chips: All · Markets · Regulatory (or per-source).
- No amounts/PII on this screen → privacy modes don't affect it, nothing to mask.
- Tapping a headline opens the source link externally — link-out only; Penny never
  reproduces full article text (copyright-safe: headline + short summary + attribution +
  link).

## Privacy & copyright

- The news cache is a plain store, never the encrypted repository — no PII flows to the
  news transport.
- Copyright: headline + short summary + source attribution + link only, always linking out
  to the publisher rather than reproducing articles.

## Mobile (`apps/mobile`)

Ported. RN has no `DOMParser` at all (a first for this migration), so
`core/news/newsClient.native.ts` reimplements RSS parsing as a small regex-based tag
extractor instead of a `.native.ts` localStorage-only swap — the one genuinely-missing
browser API with no direct RN equivalent found so far. The "All News" feed list (80-150+
items across 4 sources) is rebuilt on `@shopify/flash-list`'s `FlashList` for scroll
performance — see `docs/plans/mobile-migration.md`'s playbook.

## Files

- `packages/core/src/core/news/newsClient.ts` (+ `.native.ts`) — `NEWS_SOURCES`,
  `fetchNewsFeed(source)`, `fetchAllNews(ids)`, XML→`NewsItem[]` parsing, caching + TTL.
- `packages/core/src/core/news/newsTypes.ts` — types above.
- `features/news/NewsPage.tsx` — source filter chips, headline card list, empty/error/
  loading states, refresh button.
- `features/news/useNews.ts` — hook wrapping the client (loading/error/data).
