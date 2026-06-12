# Penny — Feature Specification

Compiled from BRD v4.0, TSD v1.1, and WhatsNext. This is the authoritative feature list for Phase 1.

---

## Onboarding flow (6 screens, pre-auth, no account)

| Screen | Duration | Key moment |
|--------|---------|-----------|
| 1. Splash | 0–2s | Penny logo + tagline "Chip in. Watch it grow." Amber Safe mode badge visible immediately. |
| 2. Privacy Promise | 2–10s | 0 bytes to servers, 3 permitted domains listed by name, 0 trackers, AES-256. Three animated green dots confirming activation. |
| 3. Passphrase + PIN setup | 10–35s | Passphrase input with zxcvbn strength bar (score ≥ 3 required). 6-digit PIN + confirmation. "Your passphrase is hashing locally right now. It never leaves this device." Spinner during PBKDF2. |
| 4. Interactive privacy demo | 35–50s | User types anything → sees live AES-GCM ciphertext update in real time. Educational, ephemeral key, nothing saved. |
| 5. Chip introduction | 50–55s | Chip avatar. "I'll watch your money, spot opportunities, tell you exactly what to do." Static example insight card. |
| 6. Simulated dashboard | 55–60s | Read-only mock data. Amber "Sample data" banner. 3 pre-loaded Chip insights (health insurance gap, underperforming MF, emergency fund shortfall). CTA "Set up my dashboard". |

**Simulated profile** (pre-loaded for demo):
- Age band: 29–35, monthly income: ₹1L–2L, risk: moderate, goal: retirement
- Three deliberate Chip issues: health insurance gap (₹ shortfall), underperforming MF (exit signal + alternative), emergency fund below 6 months

---

## Privacy system

### Three privacy modes

| Mode | Colour | What you see | Trigger |
|------|--------|-------------|---------|
| Safe | Amber `#F59E0B` | Amounts masked as ••••, module labels visible | Default |
| Privacy | Violet `#7C3AED` | Module names only, amounts + charts hidden | Manual switch |
| Open | Green `#10B981` | Everything visible | Manual switch, PIN required |

**Switching to Open mode** requires PIN re-entry and shows a warning modal:
> "Open mode shows all your financial data. Anyone near you can see it. Penny will auto-lock in 5 minutes if you don't interact."

**Peek feature:** Tap any masked value (•••• ) → 5-second full reveal → auto-masks again. No mode switch required.

**Auto-lock:** Returns to Safe mode after the inactivity period (default: 30 minutes). Configurable in Settings.

### Privacy Centre (accessible from profile/settings)

- **Domain log:** Every outbound call with domain, purpose, timestamp, data size
- **AI call log:** Every Chip call with: timestamp, task type, anonymised payload summary, PII scan result (✓ clean or ⚠ flagged)
- **Weekly digest:** "This week: Chip made X calls. Your bank account was never included."
- **Transparency panel:** "Penny contacts exactly 3 domains. You can see every request we've ever made."

---

## Portfolio module

### What you can track
- Mutual funds (NAV from MFAPI.in)
- Stocks / ETFs (NSE/BSE price from Yahoo Finance)
- Fixed deposits (manual, interest calculated on-device)
- NPS (manual entry)
- PPF (manual entry, 7.1% p.a. compounding)
- Gold (manual entry, price from Yahoo Finance `GOLD` query)

### Chip report card
Each holding gets a 0–100 Chip score broken into 5 dimensions:

**Mutual funds:**
- Returns vs benchmark (30% weight) — rolling 1Y, 3Y, 5Y vs category average
- Consistency (25%) — % of periods outperforming category
- Expense ratio (20%) — vs category average
- Portfolio overlap (15%) — % overlap with other holdings
- Risk-adjusted return (10%) — Sharpe ratio vs benchmark

**Stocks:**
- Quality (30%) — ROCE, debt-to-equity, promoter holding
- Valuation (25%) — P/E, P/B vs sector
- Momentum (20%) — price trend, relative strength
- Earnings trend (15%) — revenue and profit growth
- Portfolio fit (10%) — sector exposure vs existing portfolio

### Three-layer detail (report card drill-down)
1. **Collapsed:** Chip score badge, ticker, current value, gain/loss %
2. **Expanded:** Score breakdown by dimension, headline reasoning
3. **Full analysis:** Complete fundamentals, rolling returns, sector comparison

---

## Expenses module

- Expense list grouped by date (most recent first)
- Quick-add FAB (floating action button)
- Category breakdown chart (Recharts pie/donut)
- Monthly budget tracking with alert at 80% usage
- **Hashtag tagging:** Type `#emi`, `#tax`, `#business` in notes → auto-tagged and filterable
- **Subscription detection** (see below)
- **IOU signal detection** (see below)

### Seed categories (Indian defaults)
Food & Dining, Transport, Groceries, EMI & Loans, Healthcare, Utilities, Entertainment, Shopping, Education, Travel, Insurance Premiums, Investments, Personal Care, Home & Rent, Gifts & Donations

---

## Subscription detection

**3-pass algorithm (fully on-device):**

1. **Known merchant match** — curated list of 150–200 known subscription services. High confidence.
2. **Amount consistency** — same merchant, same amount (±5% tolerance), 2+ occurrences. Medium confidence.
3. **Interval verification** — 28–32 days = monthly, 85–95 = quarterly, 355–370 = annual.

**User flow:** Chip surfaces "I noticed you pay ₹649 to Netflix every month. Want me to track this?" → user confirms → stored in `subscriptions`.

**Ongoing tracking:**
- Trial end alert: 7 days before and 1 day before conversion to paid
- Price creep: current amount > `price_at_start` → Chip flags
- Unused alert: 60+ days no `usage_last_detected` (Phase 2: SMS signal; Phase 1: manual mark)
- Annual vs monthly: if monthly and annual exists, Chip shows annual savings

---

## IOU tracker

**Signal detection:** Chip spots IOU-like transactions from expense notes:
- Keywords: "lent", "borrowed", "gave", "returned", "advance"
- Round amounts: ₹500, ₹1K, ₹2K, ₹5K, ₹10K multiples
- Reversals: similar amount from same person within 60 days

**Tracking:**
- Direction: lent / borrowed
- Amount + date + status (outstanding / partial / settled)
- Amount returned (for partial settlements)
- Ageing: 30+ day alert → "You lent ₹5K to someone 6 weeks ago. Any update?"
- Opportunity cost (opt-in): "That ₹10K could have earned ₹83 in a liquid fund this month"

**Privacy:** Person names are local-only. Never sent to AI. Referred to as "IOU 1", "IOU 2" in Chip context.

---

## Net Worth & Goals

### Net worth calculation
`Net worth = Σ assets + Σ holding values − Σ liability outstanding amounts`

### 12 liability types
1. Home loan (amortisation, all 6 scenarios, balance transfer comparison)
2. Car/vehicle loan (depreciation vs outstanding)
3. Personal loan (payoff priority, prepayment)
4. Education loan (moratorium tracking, 80E tax deduction)
5. Credit card outstanding (minimum due trap alert, 0% EMI conversion)
6. BNPL (exposure tracking, over-reliance flag if >3 active)
7. Gold loan (LTV ratio, auction risk alert at 75% LTV)
8. Loan against property (LAP)
9. Loan against securities (LAS)
10. Overdraft (OD)
11. Informal/personal borrowing
12. Rental deposit (asset side — refundable)

### Loan repayment scenarios (6, all on-device)
Uses `amortisationSchedule()` — pure TypeScript, no AI:
1. Extra EMI per year (13 EMIs instead of 12)
2. Step-up EMI (increase by X% each year)
3. Lump sum prepayment (with prepayment penalty deduction)
4. Monthly overpayment (₹X extra each month)
5. Combination (extra EMI + step-up)
6. Deploy idle savings (use ₹X from liquid fund/FD to prepay)

Each scenario shows: months saved, interest saved, net savings after opportunity cost.

---

## Insurance module

### Tracking
- 6 insurance types: health, life/term, vehicle, home, travel, other
- Per policy: insurer, coverage amount, annual premium, renewal date, nominee
- Renewal alerts: 30 days, 7 days, 1 day before expiry
- Coverage gap analysis: recommended vs actual health insurance coverage (based on age band + income band)

### Chip report card (Phase 1 + Chip)
- Health: coverage amount vs ₹5L per member minimum, family floater vs individual comparison
- Term: sum assured = 15–20× annual income guideline
- Vehicle: third-party only vs comprehensive tradeoff

---

## Financial health score

**0–100 composite score** with 6 dimensions:

| Dimension | Weight | Good threshold |
|-----------|--------|----------------|
| Emergency fund | 20% | ≥6 months of expenses |
| Savings rate | 20% | ≥20% of monthly income |
| Debt-to-income | 20% | EMIs ≤40% of monthly income |
| Insurance coverage | 15% | Health ≥₹5L/member, term ≥15× income |
| Goal trajectory | 15% | On track to reach goals at current SIP |
| Diversification | 10% | Not >50% in any single asset class |

Score displayed as a single number with colour-coded ring and dimension breakdown.

---

## Tax awareness

- **80C tracking** — ELSS, PPF, LIC, ULIP, home loan principal, tuition fees. Annual ₹1.5L limit.
- **80D tracking** — health insurance premiums. ₹25K self/family, ₹50K senior parents.
- **24B tracking** — home loan interest deduction. ₹2L limit for self-occupied.
- **LTCG/STCG calculator** — before any sell action on holdings, Chip shows estimated tax impact
- **February alert** — "₹X of your 80C deduction is unused. Here's what you can do in the next 6 weeks."

---

## Cash flow forecast

- **Week ahead:** Due EMIs, subscription renewals, known recurring expenses
- **Month ahead:** Full month projection — income vs outflow
- **Surplus/deficit:** Clear ₹ number: "You'll have ₹12,400 left over this month"
- **Surprise alerts:** "Your Amazon Prime annual renewal (₹1,499) hits in 4 days"

---

## Chip AI (Phase 1 + Chip — future)

### Insight card anatomy
Every Chip insight has these fields:
1. **Module tag** — which area it relates to (Portfolio / Expenses / Goals / Insurance / Net Worth)
2. **Headline** — plain language, specific to user's data ("Your SBI Blue Chip fund has underperformed its benchmark for 3 straight years")
3. **Reasoning** — 2–3 lines with numbers ("Returned 8.2% vs category average of 13.1% over 3Y. Expense ratio of 1.8% is above category average of 0.9%.")
4. **"What if I do nothing?"** — always populated, in rupees ("At this pace, you'll have ₹2.3L less at retirement than if you switched to a similar fund with better performance.")
5. **Action buttons** — Approve · Dismiss · Ask Chip · See full analysis

### Ask Chip
- Floating button present on every screen
- Context-aware: knows which screen the user is on
- Example: user on Portfolio viewing 6 holdings → "Which fund should I exit first?" → Chip answers about those specific holdings
- Streaming responses (tokens appear as they arrive)

### Tone adaptation (inferred from data, not a user label)
- **First-time investor:** explain jargon, reassurance, no acronyms without definition
- **Busy professional:** direct, brief, action-first
- **Financially aware:** technical terms (alpha, Sharpe ratio, basis points) acceptable
