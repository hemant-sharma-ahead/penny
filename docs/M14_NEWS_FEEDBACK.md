# M14 — Finance News + Contact / Feedback

Planning doc for the M14 milestone. India-first, privacy-first, mobile-first PWA.
Status: ✅ Complete.

Two independent sub-features:

1. **Finance News** — a curated feed of Indian markets/regulatory headlines (ET Markets,
   Mint, RBI, SEBI) with link-out to the source. Read-only, no accounts.
2. **Contact / Feedback** — an in-app way to reach the team via a pre-filled `mailto:`
   deep-link (and optionally a GitHub issue link). No backend, no form submission.

Per the Phase 1 roadmap (CLAUDE.md): _"Finance news (RSS — ET Markets, Mint, RBI, SEBI,
headlines + link-out) + Contact/Feedback (mailto: deep-link). RSS feeds, no backend."_

---

## The core challenge: RSS in a backend-less PWA

Every existing external fetch in Penny (`marketDataClient.ts`, `ipoClient.ts`) hits a
**CORS-permissive JSON API** (MFAPI.in, Yahoo `query1`, investorgain) and is whitelisted
in the strict CSP `connect-src` in `index.html`.

News RSS feeds are different:

- They are **XML**, not JSON — needs parsing (`DOMParser`).
- Publisher feeds (ET, Mint, RBI, SEBI) **do not send `Access-Control-Allow-Origin`**, so
  a browser `fetch()` is blocked by CORS regardless of CSP.

So we cannot fetch publisher RSS directly from the browser. Three delivery options:

| Option                       | Backend?          | Privacy                              | Reliability            | Recommendation          |
| ---------------------------- | ----------------- | ------------------------------------ | ---------------------- | ----------------------- |
| **A. Public RSS→JSON proxy** | None (3rd-party)  | Feed URLs pass through a 3rd party\* | Subject to rate limits | Fits "no backend" today |
| **B. Cloudflare Worker**     | 1 Worker (we own) | Best — we control it                 | Best                   | ✅ Best long-term       |
| **C. Direct fetch**          | None              | Best                                 | ❌ Fails on CORS       | Not viable              |

\* No personal data leaves the device — only which public news feeds are requested. No
user identifiers, amounts, or financial data are ever involved in a news fetch.

**Decision (resolved): Option A — public RSS→JSON proxy.** Build the news client behind a
single `fetchNewsFeed(source)` abstraction so the transport stays swappable, and leave a
clean seam to drop in **Option B** (Cloudflare Worker, alongside the planned IPO worker)
in Phase 2 if proxy rate limits/reliability become a problem.

---

## Sub-feature 1: Finance News

### Sources (candidate RSS feeds — verify URLs at build time)

| Source     | Category        | Feed (candidate)                                               |
| ---------- | --------------- | -------------------------------------------------------------- |
| ET Markets | Markets         | `economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms` |
| Mint       | Markets / Money | `livemint.com/rss/markets`                                     |
| RBI        | Regulatory      | `rbi.org.in/pressreleases_rss.xml`                             |
| SEBI       | Regulatory      | `sebi.gov.in/sebirss.xml`                                      |

**Confirmed for v1:** all four sources above (ET Markets, Mint, RBI, SEBI). The list is
data-driven, so more can be added later.

### Data model

```ts
type NewsSourceId = 'et-markets' | 'mint' | 'rbi' | 'sebi';

interface NewsSource {
  id: NewsSourceId;
  label: string; // "ET Markets"
  category: 'markets' | 'regulatory';
  feedUrl: string;
  color: string; // accent for the source chip
}

interface NewsItem {
  id: string; // hash of link (dedupe key)
  sourceId: NewsSourceId;
  title: string;
  link: string; // open in new tab / external browser
  publishedAt: number; // epoch ms
  summary?: string; // stripped, truncated description
}
```

### Caching

- Cache parsed items in a plain (non-encrypted) store — this is public data, no PII.
  Reuse the `price_cache`-style pattern or a small localStorage blob with a TTL
  (**30–60 min**), mirroring `marketDataClient`'s `isFresh()` approach.
- Show cached items instantly; refresh in the background; manual pull-to-refresh button.

### Files

- `src/core/news/newsClient.ts` — `NEWS_SOURCES`, `fetchNewsFeed(source)`,
  `fetchAllNews(ids)`, XML→`NewsItem[]` parsing, caching + TTL, transport abstraction.
  Transport: AllOrigins raw — `https://api.allorigins.win/raw?url=<encoded feed URL>` —
  returns raw RSS XML, parsed client-side with `DOMParser`. Keep the proxy URL in one
  constant so swapping to a Cloudflare Worker later is a one-line change.
- `src/core/news/newsTypes.ts` — types above.
- `src/features/news/NewsPage.tsx` — source filter chips, list of headline cards
  (title · source · relative time), tap → open `link` externally, empty/error/loading
  states, refresh button.
- `src/features/news/useNews.ts` — hook wrapping the client (loading/error/data),
  matching the `useIpos`/`useRepository` pattern.

### UI

- Headline card: title (2-line clamp), source chip (coloured), relative time
  ("2h ago" via a small helper or `formatDateShort`).
- Filter chips: All · Markets · Regulatory (or per-source).
- No amounts/PII → privacy modes don't affect this screen (nothing to mask).
- Tapping a headline opens the source link in a new tab (`target="_blank"
rel="noopener noreferrer"`) — link-out only, we never reproduce full article text
  (copyright-safe: headline + short summary + attribution + link).

---

## Sub-feature 2: Contact / Feedback

Fully on-device. No form submission, no backend.

- `src/features/feedback/FeedbackPage.tsx` — a short screen with:
  - Feedback type selector (Bug · Suggestion · Question) — drives the email subject.
  - A message textarea (optional — user can also just open their mail app).
  - "Send via email" button → builds a `mailto:` deep-link:
    `mailto:<support>?subject=<type> — Penny&body=<message>%0A%0A---%0AApp v<version>`
  - Optional "Report on GitHub" link-out.
- App version pulled from `package.json` via Vite `define`/`import.meta.env` (no PII).
- **Destination address:** use `feedback@penny.app` as a placeholder constant for now
  (one clearly-marked config value) — swap for the real support inbox before release.
- **Privacy:** never auto-attach financial data, identifiers, or logs. The body is only
  what the user typed plus the app version. The user's own mail client is the sender —
  Penny never transmits anything itself.

> **D-M14-2 (placeholder set):** using `feedback@penny.app` as the destination for now —
> swap for the real support inbox before release. GitHub repo URL still optional/TBD.

---

## Wire-in (both sub-features)

- **Routing:** add `news: '/app/news'` and `feedback: '/app/feedback'` to
  `src/router/paths.ts`; register both in `src/router/index.tsx`.
- **Surfacing:**
  - News → a tile in `TOOL_TILES` in `src/features/home/HomePage.tsx` (+ a `news`
    key in `ModuleVisibility` in `SettingsContext` so it can be hidden), and/or a Modules
    grid tile in the Settings drawer (same pattern as the Calculators "Calc" tile).
  - Feedback → a row in the Settings drawer (natural home, near "Security & Data").
- **CSP:** add the chosen news transport origin to `connect-src` in `index.html`
  (the proxy domain for Option A, or the Worker domain for Option B). `mailto:` needs no
  CSP change.

---

## Privacy & compliance notes

- News is public data; the news cache is a **plain** store (never the encrypted
  repository). No PII flows to the news transport.
- Copyright: show **headline + short summary + source attribution + link only**. Never
  reproduce full articles; link out to the publisher.
- Feedback: the email body contains only user-typed text + app version. No auto-collected
  device fingerprint or financial data.
- No new third-party trackers; the news transport is a data endpoint, not analytics.

---

## Build order (proposed)

1. **M14-1** — Add `https://api.allorigins.win` to CSP `connect-src` in `index.html`. (Support email D-M14-2 only blocks the Feedback page, step M14-5.)
2. **M14-2** — `newsTypes.ts` + `newsClient.ts` (sources, fetch, XML parse, cache) + unit
   tests for the parser/cache (pure parts).
3. **M14-3** — `useNews.ts` + `NewsPage.tsx` (list, filters, states, link-out) + routing.
4. **M14-4** — Surface News (Home tile + module visibility toggle).
5. **M14-5** — `FeedbackPage.tsx` (mailto builder) + Settings drawer entry + routing.
6. **M14-6** — Final gates (Prettier, ESLint, tests, PII gate) + update this doc + CLAUDE.md.

---

## Testing

- **Pure/unit:** RSS XML → `NewsItem[]` parsing (feed-shape fixtures), dedupe by link,
  cache TTL freshness, `mailto:` string builder. Live in `tests/news/`.
- **Manual/browser:** source filtering, loading/empty/error states, link-out opens
  correctly, feedback opens the mail client with the right subject/body.

---

## Open decisions

| #        | Decision                                                            | Status                                                                                                         |
| -------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| D-M14-1  | News transport: public RSS→JSON proxy (A) vs Cloudflare Worker (B)  | ✅ Resolved — Option A (public proxy), behind a swappable seam                                                 |
| D-M14-1b | Which specific proxy endpoint to use                                | ✅ Resolved — AllOrigins (`api.allorigins.win`) raw passthrough; we parse the XML client-side with `DOMParser` |
| D-M14-2  | Support email address + optional GitHub repo URL for feedback links | ⚠️ Placeholder — `feedback@penny.app` for now, swap before release; GitHub URL TBD                             |
| D-M14-3  | News surfacing: Home `TOOL_TILES`, Settings Modules grid, or both   | Open (default: both)                                                                                           |

**Sources confirmed:** ET Markets, Mint, RBI, SEBI.
