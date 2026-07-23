# Market Sentiment from News — Feasibility & Design (No AI, On-Device)

_Research + design snapshot. Author: Pankhuri. Status: **Phase A ✅ merged** (offline headline
sentiment: chips + news-mood gauge). **Phase B 🚧 in progress** — F3 "your holdings in the news"
implemented (entity dictionary + tagging + News-module section); F4 per-stock strip + Home card
pending. Phase C not started. This documents what is technically and legally feasible for showing "how
market news affects stocks" inside Penny **without any AI and fully on-device**, and where/how to
surface it._

---

## 1. The objective (and how we must reframe it)

The original ask was three things:

1. How a particular market news item can **affect stocks**.
2. **"Best 5 stocks to trade"** in a given news condition.
3. Whether there will be a **market jump or decline**.

Two of these three, taken literally, are **investment advice / price prediction**, and that changes
what we can responsibly ship. So the first job of this doc is to separate _what we can do_ from _what
we must not do_, then design the feasible part well.

| Original ask                    | Literal form                           | Verdict                      | Penny-safe reframing                                                                                                                                 |
| ------------------------------- | -------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| How news affects stocks         | Causal impact of a headline on a price | ⚠️ Partly (descriptive only) | Show a headline's **sentiment** + **which of your holdings it mentions**, alongside the stock's **actual** move. Descriptive, not causal.            |
| Best 5 stocks to trade          | Buy/sell recommendation                | ❌ Do **not** ship           | "**Your holdings in the news today**" — the stocks _you already own/watch_ most in the news, tagged with sentiment. Informational, not a trade call. |
| Will there be a jump or decline | Price-direction forecast               | ❌ Do **not** ship           | "**Today's news mood**" — a descriptive gauge of how today's headlines skew (e.g. 60% negative). Explicitly _not_ a forecast.                        |

**Why the hard "no" on the last two:** under SEBI's **Research Analyst Regulations, 2014** and
**Investment Adviser Regulations, 2013**, providing stock recommendations ("buy these 5"), price
targets, or market-direction calls is a **registered, regulated activity**. An app that does this
without registration takes on real legal exposure — and it contradicts Penny's positioning
(privacy-first, informational, _never_ an adviser; cf. Tax **Awareness** and Health **Score**). The
reframed features stay on the "information about news you already follow" side of that line. See §9.

> **One-line principle for the whole feature:** _We describe the news. We never predict the market or
> recommend a trade._

### 1.1 Legal risk — quick assessment

The non-advisory framing **materially lowers** risk (from "clearly regulated" to "likely defensible as
informational") but does **not** eliminate it. This is not legal advice — get a SEBI-savvy lawyer/CS to
sign off before launch (open question #1).

| Feature                             | Risk with proper framing                              |
| ----------------------------------- | ----------------------------------------------------- |
| Market / sector **news-mood gauge** | Low — general, descriptive                            |
| **"Your holdings in the news"**     | Low–moderate — safe if not presented as picks         |
| **Per-stock sentiment label**       | **Moderate — gray zone; get counsel before shipping** |
| Anything predictive or "5 to trade" | High — don't ship                                     |

The sharpest gray zone: a per-stock sentiment label _could_ be read as an "opinion concerning the
value/price of a security" under the RA Regulations, even when computed mechanically. General market/
sector mood is safe; per-stock labels need a legal read. Guardrails: no buy/sell/predict language, a
persistent "informational only, not investment advice" disclaimer, recency (not "top picks") ordering,
opt-in module, on-device only.

---

## 2. What is feasible with no AI, on-device

Financial-news sentiment **without AI** is a well-established classical-NLP problem: **lexicon + rules**.
Score text by looking words up in a curated dictionary and applying a few grammatical rules.
Deterministic, instant, offline, private, explainable — the same philosophy as Penny's planned
on-device expense categorization engine. **Phase A ships exactly this.**

### 2.1 The techniques (all pure TypeScript, ~tens of KB of data)

1. **Lexicon-based scoring.** Count positive vs negative words; derive a score.
   - **Loughran–McDonald (LM) finance lexicon** — the academic standard for _financial_ text.
     Crucial because general lexicons misread finance words ("liability", "cost", "tax", "cut").
   - **VADER** rules — negation ("not good"), intensifiers ("sharply higher"), caps. Great for headlines.
   - We ship a **small merged, India-tuned list** (not a model). _(Implemented in `lexicon.ts`.)_

2. **Rules layer** (where headline accuracy comes from): negation & intensifier windows; strong
   directional verbs (_surges/plunges_); event keywords (_results, RBI policy, downgrade, fraud, ban_).
   _(Implemented in `scoreHeadline.ts`.)_

3. **Entity recognition ("NER-lite")** _(Phase B)_ — a bundled dictionary of NSE/BSE company names +
   aliases → `{ symbol, sector }`; match against a headline to connect it to the stocks a user owns
   (Penny holdings carry `symbol`, e.g. `stock:RELIANCE`).

4. **Aggregation** — per-stock / per-sector / overall **market-news mood**. _(Market-mood implemented
   in `aggregate.ts`; per-stock/sector is Phase B.)_

5. **Descriptive pairing** _(Phase C)_ — show the news mood next to the real index move from the market
   snapshot ("Sensex −0.8% · news skew negative"). Correlation shown, prediction disclaimed.

### 2.2 Data we bundle (works offline day one)

- `sentiment lexicon` — merged LM (+ VADER rules) trimmed to headline-relevant words, plus an
  Indian-market tune (crore, PSU, promoter, RBI, repo, circuit, bull/bear, multibagger, NPA, haircut).
- `entity dictionary` _(Phase B)_ — top NSE/BSE names + aliases → symbol + sector.

Both are **public, non-personal assets** — no user data is involved in scoring. They can later be
**refreshed via the Track A worker** exactly like the planned merchant dictionary (a versioned
`/sentiment-lexicon` endpoint), uploading nothing about the user.

### 2.3 What this is **not** capable of (be honest in the UI)

- **Sentiment ≠ price direction.** Markets price in expectations; "profit beats" can still fall.
- **Headlines are short & lossy** — sarcasm, nuance, "beat but guidance weak" are missed.
- **No causality.** We can show news and a move side by side; we can't prove one caused the other.
- **Coverage gaps & ambiguity** — unknown tickers, alias clashes ("SBI" vs "SBI Life").
- **Accuracy:** lexicon+rules on headlines lands ~**65–75%** vs humans on clear items, lower on nuance.
  Good for a ▲/▼/– **flag and a mood gauge**; nowhere near good enough for trading. Design for that.

---

## 3. Feature set (tiered, all no-AI, on-device)

**F1 — Headline sentiment tag.** ▲ positive / ▼ negative / – neutral chip per news item. ✅ **Phase A.**

**F2 — "Today's news mood" gauge.** Compact descriptive indicator ("leaning negative, 18/30"), with a
mandatory disclaimer. ✅ **Phase A.**

**F3 — "Your holdings in the news."** Entity-tag headlines to the stocks the user owns; surface + tag
them. _The compliant replacement for "best 5 stocks to trade."_ ✅ **Phase B** (News-module section,
recency-ordered, informational — no aggregate per-stock verdict).

**F4 — Per-stock news strip.** On a stock holding's detail, a sentiment-tagged "In the news" list. ⏳ Phase B (pending).

**F5 — Descriptive news-vs-move context.** Pair mood with the live market snapshot. ⏳ Phase C.

**F6 — Local feedback loop.** Thumbs-up/down a tag → store the correction locally (like
`merchant_memory`) to nudge future scores. Still no AI, on-device. ⏳ Phase C.

---

## 4. Where to show it in Penny

| Surface                            | What appears                                                                    | Feature | Phase |
| ---------------------------------- | ------------------------------------------------------------------------------- | ------- | ----- |
| **News module** (`/app/news`, M14) | Sentiment chip per headline; "news mood" gauge on top; Positive/Negative filter | F1, F2  | A ✅  |
| **News — "For you"**               | "Your holdings in the news today"                                               | F3      | B     |
| **Portfolio → stock detail**       | "In the news" strip scoped to that symbol                                       | F4      | B     |
| **Home dashboard**                 | Small "market news mood" card + holdings-in-news count                          | F2, F3  | B     |
| **(future) Watchlist**             | Same tagging applied to watched (not just owned) symbols                        | F3, F4  | later |

---

## 5. On-device architecture

All pure, unit-testable, no network for scoring, no AI, no PII (news is public). Mirrors the
categorization-engine layout.

```
src/core/sentiment/           ✅ Phase A
  normalize.ts        # tokenize a headline
  lexicon.ts          # bundled merged LM+VADER+India word lists (data)
  scoreHeadline.ts    # pure: headline -> { score, label, matched[] }
  aggregate.ts        # pure: computeMood(scored[]) -> MoodSummary
  types.ts / index.ts
  (Phase B) entityDictionary.ts + tagEntities.ts   # headline -> symbol/sector

src/features/news/            ✅ Phase A (chips + gauge + filter)
  useNewsSentiment.ts # memoized: score cached NewsItems + compute mood
  SentimentChip.tsx · NewsMoodGauge.tsx
  (Phase B) "your holdings in the news" (cross-ref holdingsRepo)

workers/api-proxy/ (Phase C, optional)
  GET /sentiment-lexicon        # versioned public lexicon refresh (like the merchant dict)

tests/sentiment/              ✅ Phase A (scoreHeadline + aggregate, 17 tests)
```

**Data flow (all on device):** RSS feeds (existing) → cached `NewsItem[]` → `normalize` →
`scoreHeadline` → (`tagEntities`, Phase B) → `aggregate` (+ holdings, Phase B) → UI (chips · mood gauge
· "your holdings in the news"). Scoring runs on already-fetched headlines — **no new network calls**.

---

## 6. Answering the three original questions, precisely

- **"How can a market news item affect the stocks?"** — On-device we can (a) score the headline's
  **sentiment**, (b) identify **which stocks/sectors** it mentions (Phase B), and (c) show the actual
  price move next to it (Phase C). Truthful and descriptive; we can't compute a real causal effect
  without quant/AI models, and shouldn't imply one.
- **"Best 5 stocks to trade?"** — We should **not** answer literally (SEBI + ethos). The compliant
  substitute is **"your holdings most in the news today"** with sentiment — info about what you own.
- **"Will there be a jump or decline?"** — We should **not** forecast. The substitute is a descriptive
  **"today's news mood"** gauge, framed as observation, not prediction.

---

## 7. Accuracy, limitations & honest UX

Present sentiment as a **soft signal** (chip + "why these words"), never a tradeable number. Always show
the **source and link** (we do). Expect misses; make tags **correctable** (F6). Indian-market tuning is
essential — an untuned English lexicon misreads PSU/promoter/circuit/crore language.

---

## 8. Phased implementation plan

- **Phase A (MVP, fully offline):** `normalize` + `lexicon` + `scoreHeadline` + `aggregate`; F1 chips +
  F2 mood gauge + a sentiment filter in the News module. Pure unit tests. No backend. ✅ **Done.**
- **Phase B (personalization):** `entityDictionary` + `tagEntities`; F3 ("your holdings in the news") +
  F4 (per-stock strip) + Home card. Cross-reference `holdingsRepo`. ⏳
- **Phase C (polish + freshness):** F5 (news-vs-move context) + worker-served `/sentiment-lexicon`
  refresh + sector view + F6 local feedback learning. ⏳

Each phase is independently shippable and leaves the app fully usable with the feature off.

---

## 9. Compliance & disclaimer rules (non-negotiable)

1. **No recommendations, no predictions, no price targets, no "buy/sell/trade" language** anywhere.
2. Persistent label: **"Informational only. Not investment advice."** on every sentiment surface.
   _(Implemented on the mood gauge.)_
3. Frame everything as _information about news you already follow / stocks you already own_.
4. Keep it an **opt-in module** (Settings toggle) — a follow-up; Phase A ships inside the News module.
5. Legal review before any per-stock label (Phase B) ships.

---

## 10. Open questions for the team

1. Are we comfortable shipping **any** sentiment feature given SEBI exposure? (Quick legal check before Phase B.)
2. Bundle size vs coverage for the lexicon/entity dictionary?
3. Gate F3/F4 to users who hold **stocks**, or show F1/F2 to all?
4. Lexicon **worker-served** from day one, or bundled-only until it matters?
5. Is a **Watchlist** (deferred) a prerequisite to make F3/F4 compelling?

---

_Discussion/feasibility snapshot. Phase A is implemented on `feat/phase-A-news-sentiment`; if we
proceed to B/C, add a canonical plan under `docs/plans/` and update the milestone table + ROADMAP._
