# News Sentiment

## What it is

An on-device, **no-AI** reading of the tone of finance-news headlines, shown inside the News module. It
tells you, at a glance, whether today's headlines lean positive, negative, or neutral — and tags each
headline the same way. It is **informational only**: it describes the news, it does **not** recommend
trades or predict the market. (Design rationale + legal framing: [`docs/MARKET_SENTIMENT_RESEARCH.md`](../MARKET_SENTIMENT_RESEARCH.md).)

This page covers **Phase A** (headline sentiment + news-mood gauge) and **Phase B — F3** ("your
holdings in the news"). A per-stock strip in Portfolio (F4) and a lexicon-refresh backend are planned
for later phases.

## User-facing capabilities

- **Sentiment chip on every headline** — a small ▲ Positive / ▼ Negative / – Neutral pill.
- **"Today's news mood" gauge** — a proportional bar + label ("Leaning negative", "Mixed", "Quiet")
  summarising all fetched headlines, with a persistent _"informational only, not investment advice"_
  disclaimer.
- **Filter by tone** — an "All / Positive / Negative" filter alongside the existing Markets/Regulatory
  source filter.
- **Your holdings in the news** (Phase B) — a section that surfaces headlines mentioning the stocks you
  actually own, each tagged with the headline's tone. Recency-ordered (not "top picks"), informational
  only. Appears only when you hold stocks and some are in the news.

## How it works

- **Pure on-device pipeline** (no network, no AI): the headlines the News module already fetches (RSS
  via the AllOrigins proxy, 45-min cache) are scored locally.
- `src/core/sentiment/` (pure, unit-tested):
  - `normalize.ts` — `tokenize()` lowercases + splits a headline (keeps contractions for negation).
  - `lexicon.ts` — a small, finance-tuned, India-aware word list (`POSITIVE`/`NEGATIVE` weighted,
    `INTENSIFIERS`, `NEGATORS`), inspired by the Loughran–McDonald finance lexicon + VADER rules.
  - `scoreHeadline.ts` — `scoreHeadline(title)` walks the tokens once, applying negation and
    intensifier windows, and returns `{ score, label, matched[] }` (matched terms power an
    explainable "why" later).
  - `aggregate.ts` — `computeMood(scored[])` → counts + a descriptive `skew` label.
  - `entityDictionary.ts` — bundled NSE/BSE company → `{ symbol, name, sector, aliases }` (Phase B).
  - `tagEntities.ts` — `tagEntities(title)` → the companies a headline mentions (word-boundary,
    longest-alias-first so "SBI Life" doesn't also match bare "SBI").
- `src/features/news/`:
  - `useNewsSentiment(items)` — memoized: scores each headline + computes the mood.
  - `useHoldingsInNews(items)` (Phase B) — reads the user's stock holdings once via `holdingsRepo`,
    tags each headline, and returns the headlines mentioning an owned stock (recency-ordered).
  - `SentimentChip.tsx`, `NewsMoodGauge.tsx`, `HoldingsInNews.tsx` — presentational, using the semantic
    status tokens (`STATUS`/`tint`/`ink`).
- **No PII, no data leaves the device.** News is public; scoring + holdings cross-reference are local.
  Honors the `no-console`/PII and semantic-color rules.

**Mobile (`apps/mobile`):** ported alongside the rest of Track 4's remaining-modules pass — `useNews.ts`/`useNewsSentiment.ts`/`useHoldingsInNews.ts` unchanged beyond import paths. `core/news/newsClient.ts` needed a `.native.ts` sibling: RN has no `DOMParser` at all (unlike the usual `localStorage`-only swap elsewhere), so RSS parsing is a small regex-based tag extractor instead (handles `CDATA`-wrapped titles/descriptions); the 45-minute cache also drops to in-memory-only (session-scoped), same "flag, don't fake" precedent as `ipoClient.native.ts`.

**2026-08-01 Portfolio consolidation + density pass:** News moved from a standalone Home tile into
Portfolio's Equity tab as a sub-tab (`NewsPage.tsx` → `NewsView.tsx`), and mobile's presentation of the
mood gauge and filters diverged from web here: the always-visible `NewsMoodGauge` banner + stacked
Source/Tone/Holding filter dropdown boxes left too little room for actual headlines, so mobile replaced
them with `NewsMoodNote.tsx` — a collapsible one-liner (same visual language as the `AssetTaxNote` "tax
on this" cards) living as the first item of the scrolling feed instead of fixed chrome — plus a single
"Filters" icon that opens one combined modal for all three fields instead of each having its own popup
(`FilterDropdown.tsx` removed on mobile; web's still stands as the frozen reference).

## Current limitations

- **Sentiment ≠ price direction.** It reflects the _tone of a headline_, not what a stock will do.
- **Headlines only** (title, not article body); short text loses sarcasm/nuance and mixed signals
  ("beat estimates but guidance weak").
- **Lexicon coverage is finite** — unusual phrasing or new terms may score neutral.
- **Entity dictionary is a starter set** (~50 widely-held names) — a headline about a stock outside the
  list, or referred to only by an unlisted alias, won't be tagged to your holdings yet.
- Accuracy is roughly **65–75%** on clear-cut headlines, lower on nuanced ones — intentionally surfaced
  as a soft flag, never a number to act on.

## Planned improvements

- **Phase B (remaining):** a per-stock "In the news" strip on a stock's detail in Portfolio (F4), and a
  Home surface. _(A per-stock aggregate sentiment verdict needs a SEBI legal check first — see the
  research doc §1.1; the shipped F3 avoids this by showing only each headline's own tone, recency-ordered.)_
- **Phase C:** pair the mood with the real index move (descriptive, not predictive); refresh the lexicon
  from the API-proxy worker (`/sentiment-lexicon`, like the merchant dictionary); a local thumbs-up/down
  feedback loop; sector heatmap.
- A dedicated **opt-in module toggle** (currently ships inside the always-on News module).

## Ideas welcome

- Which Indian-market phrases most need tuning in the lexicon (e.g. "circuit", "promoter pledge")?
- Should the mood gauge also appear on Home, or stay inside News?
- Is a Watchlist (track stocks you don't own yet) needed to make the personalized views compelling?
