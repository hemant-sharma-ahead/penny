# News Sentiment

## What it is

An on-device, **no-AI** reading of the tone of finance-news headlines, shown inside the News module. It
tells you, at a glance, whether today's headlines lean positive, negative, or neutral — and tags each
headline the same way. It is **informational only**: it describes the news, it does **not** recommend
trades or predict the market. (Design rationale + legal framing: [`docs/MARKET_SENTIMENT_RESEARCH.md`](../MARKET_SENTIMENT_RESEARCH.md).)

This page covers **Phase A** (headline sentiment + news-mood gauge). Personalization (news about the
stocks you own) and a lexicon-refresh backend are planned for later phases.

## User-facing capabilities

- **Sentiment chip on every headline** — a small ▲ Positive / ▼ Negative / – Neutral pill.
- **"Today's news mood" gauge** — a proportional bar + label ("Leaning negative", "Mixed", "Quiet")
  summarising all fetched headlines, with a persistent _"informational only, not investment advice"_
  disclaimer.
- **Filter by tone** — an "All / Positive / Negative" filter alongside the existing Markets/Regulatory
  source filter.

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
- `src/features/news/`:
  - `useNewsSentiment(items)` — memoized: scores each headline + computes the mood.
  - `SentimentChip.tsx`, `NewsMoodGauge.tsx` — presentational, using the semantic status tokens
    (`STATUS`/`tint`/`ink`).
- **No PII, no data leaves the device.** News is public; scoring is local. Honors the `no-console`/PII
  and semantic-color rules.

## Current limitations

- **Sentiment ≠ price direction.** It reflects the _tone of a headline_, not what a stock will do.
- **Headlines only** (title, not article body); short text loses sarcasm/nuance and mixed signals
  ("beat estimates but guidance weak").
- **Lexicon coverage is finite** — unusual phrasing or new terms may score neutral.
- **No entity/ticker tagging yet** — it can't yet tell you _which_ of your stocks a headline is about
  (Phase B).
- Accuracy is roughly **65–75%** on clear-cut headlines, lower on nuanced ones — intentionally surfaced
  as a soft flag, never a number to act on.

## Planned improvements

- **Phase B — personalization:** entity dictionary (company/alias → NSE symbol + sector); "your
  holdings in the news today"; a per-stock "In the news" strip in Portfolio; a Home mood card.
  _(Per-stock sentiment labels need a SEBI legal check first — see the research doc §1.1.)_
- **Phase C:** pair the mood with the real index move (descriptive, not predictive); refresh the lexicon
  from the API-proxy worker (`/sentiment-lexicon`, like the merchant dictionary); a local thumbs-up/down
  feedback loop; sector heatmap.
- A dedicated **opt-in module toggle** (currently ships inside the always-on News module).

## Ideas welcome

- Which Indian-market phrases most need tuning in the lexicon (e.g. "circuit", "promoter pledge")?
- Should the mood gauge also appear on Home, or stay inside News?
- Is a Watchlist (track stocks you don't own yet) needed to make the personalized views compelling?
