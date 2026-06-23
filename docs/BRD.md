# Penny — Business Requirements Document

**Version:** 4.1 (consolidated from BRD v1–v4 + Pre-Phase 1.5 additions)  
**Last updated:** June 2026

---

## Vision

**Penny** is an India-first personal wealth management PWA with an AI advisor called **Chip**.

The core promise: *Know your complete financial picture — privately.*

Every Indian earns, saves, invests, and spends across a fragmented landscape: salary in one bank, EPF deducted by the employer, SIPs in a different app, property and vehicles, a home loan, credit cards, LIC policies, IPOs, and parents asking for money. No single tool shows all of this together, privately, without requiring bank logins or sharing data with a third party.

Penny solves this by being local-first, AES-256 encrypted, and requiring zero backend in Phase 1. Your data never leaves your device unless you choose to back it up — and even then, it's encrypted before it leaves.

---

## Target users

**Primary:** Urban Indian professional, 25–40 years old
- Has a salary account, one or more investments (MF/stocks/EPF), a credit card, and possibly a home loan
- Frustrated by fragmentation across apps (Zerodha, Groww, CAMS, EPFO portal, bank apps)
- Values privacy — wary of apps that want bank login credentials
- English-literate, uses a smartphone for most financial tasks

**Secondary:** Indian investor, 30–55 years old
- Actively manages a portfolio (direct equity, MFs, NPS, PPF, real estate)
- Wants a consolidated view without screen-scraping
- Willing to manually enter data for accuracy and control

**Future (Phase 1.5+):** Couples and families who want to manage shared expenses and goals together without merging finances entirely.

---

## Core principles

1. **Privacy-first.** All financial data is AES-256 encrypted on-device. No backend in Phase 1. We see nothing.
2. **Local-first.** The app works fully offline. Data is never dependent on our servers.
3. **India-specific.** EPF, NPS, PPF, IPOs, Indian financial year (April–March), ₹ lakh/crore formatting, Indian tax slabs — not bolted on, built in.
4. **Comprehensive.** Tracks everything: cash flow, investments, retirement corpus, insurance, loans, property, vehicles, goals, taxes.
5. **No gimmicks.** No gamification, no social features, no push notifications asking you to open the app. Chip gives advice when you ask, not when we want engagement.
6. **User-friendly first.** Privacy should not compromise usability. Features are designed to be as easy to use as possible while maintaining the privacy promise.

---

## Feature requirements

### Core modules (Phase 1, all complete)

#### Portfolio
Track all asset classes in one place:
- **Stocks** — symbol lookup via Yahoo Finance, live price × units, weighted average cost basis, lot breakdown, gain/loss
- **Mutual Funds** — scheme search via MFAPI.in, live NAV, fund house + category metadata, SIP lot breakdown
- **NPS** — lifecycle fund tables (LC-75/50/25/BLC), auto choice allocation, active choice NAV × units, year-by-year projection
- **PPF** — passbook ledger (deposit/interest/withdrawal), before/after-5th badges, FY deposit bar, corpus projection
- **EPF** — employment history (company + basic salary + from/to), transaction ledger, retirement corpus projection at age 58, salary hike groups with timeline
- **FD/RD** — maturity auto-calc, compound interest projection (FD), iterative quarterly calculation (RD, Indian bank standard)
- **Gold/Silver** — live prices via MFAPI.in (Gold BeES NAV×100 = ₹/gram 24K), karat/purity adjustment
- **Vehicles** — RC fetch via vahandetails.com, IRDA depreciation model, challan cards
- **Property** — manual entry, 90-day staleness indicator

#### Expenses
- Transaction list (expense/income/transfer) with type-specific display
- Category system: intentGroup (parent) → ExpenseCategory (child) → Hashtags (free-form tags)
- Recurring transactions: daily/weekly/bi-weekly/monthly/quarterly/half-yearly/yearly rules with vacation guard
- Import: Penny CSV template + YNAB/Cashew/MoneyView parsers, 3-step UI
- Export: AES-256 password-protected ZIP with CSV, date range picker
- Analytics tab: spending by category, trends, month comparison
- Budgets: per-category budget with spend tracking

#### Accounts
- Multiple accounts: savings, current, credit card, cash, wallet
- Live balance calculation from all transactions
- Income entries and transfers between accounts
- Accounts strip on Home dashboard

#### Goals
- Goal cards with progress rings
- SIP calculator: contribution frequency, target date, expected rate
- Manual contributions

#### Insurance
- Policy cards for all policy types
- Renewal tracker with advance warnings
- Premium and coverage tracking

#### Loans
- My Loans view with current balance
- Amortization schedule
- Payoff planner (lump sum / extra EMI scenarios)
- XLSX download of schedule

#### IOUs
- Lent/borrowed tracking
- Ageing alerts for old outstanding amounts

#### Subscriptions
- 3-pass detection algorithm: frequency analysis on recurring expenses
- Manual subscription list

#### Home Dashboard
- Net worth card (assets − liabilities)
- Accounts strip with live balances
- Market data strip: 6 configurable tickers (Sensex/Nifty/Gold/Silver/USD-INR/Crude)
- Module shortcut tiles

#### IPO Tracker
- 4 lifecycle tabs: Upcoming / Open / Closed / Listed
- GMP (Grey Market Premium) and GMP%
- Subscription multiples: QIB / HNI (NII) / Retail (RII)
- Day-wise subscription table
- FY year picker on Listed tab, listing gain %

#### Financial Calculators (M13, in progress)
- FIRE (Financial Independence, Retire Early)
- HRA exemption (rent vs HRA component)
- PPF maturity (40-year projection with partial withdrawals)
- NPS corpus (age-adjusted, lifecycle allocation)
- Step-up SIP (annual increase % on SIP amount)
- Old vs new tax regime comparison

#### Supporting features
- **Financial health score** (0–100 composite across 6 domains)
- **Tax awareness** (80C/80D/24B, LTCG/STCG, FY tracker)
- **Cash flow forecast** (week/month ahead, based on recurring patterns)
- **Events system** (life events tied to recurring transactions)

---

### Privacy system

Three privacy modes accessible from the top header:
- **Safe** (amber, default) — amounts masked as ••••
- **Privacy** (violet) — module names only, no amounts
- **Open** (red) — all data visible, PIN required to switch to

PIN lockout with exponential backoff. 21-day PIN rotation reminder.

Encrypted backup (.penny file) with passphrase-derived key.

---

## Phase 1.5 requirements (Groups & Household OS)

See `docs/ROADMAP.md` for full technical architecture.

### Core requirement
A user can belong to multiple groups simultaneously. Each group is financially independent. Personal data stays personal unless explicitly posted to a group.

### Group types
| Type | Core features |
|---|---|
| Couple / Spouse | Shared expenses, joint goals, joint budgets, optional net worth visibility, merged dashboard |
| Family | Same as Couple, designed for multiple members |
| Flatmates | Shared expenses + splitting only |
| Custom | Owner-configured feature set |

### Sharing model
- Only data explicitly added to a group crosses the privacy boundary
- Server stores encrypted ciphertext blobs only — cannot read financial data
- Group key exchange via public-key cryptography during invite

### Settlement on leave
When leaving a group: settlement summary → frozen read-only local archive → option to export or delete archive permanently.

---

## Phase 2 requirements (AI + Cloud)

- **Real Chip AI** — user-supplied Anthropic API key (or shared key with per-user rate limiting)
- **AI auto-categorisation** — merchant name + amount band → category suggestion. Local rules engine after corrections.
- **CAS PDF import** — MF + stocks from CDSL/CAMS statements via casparser SDK
- **EPFO passbook PDF** — employment history + transactions via PDF.js
- **Export PDF/HTML** — wealth snapshot + tax summary
- **Desktop layout** — sidebar nav for ≥768px screens
- **Push notifications** — EMI reminders, insurance renewals, goal milestones
- **Watchlist** — stocks + MFs with price alerts
- **Mobile apps** — React Native (iOS + Android), shared core logic

---

## Phase 3 requirements

- Regional languages (Hindi first)
- Crypto/Web3 asset tracking
- International equities (US stocks, ETFs)
- Advanced AI advisor (life event workflows, personalised financial plan)
- RBI Account Aggregator (AA) framework sync when EPFO joins as FIP

---

## Free API sources (Phase 1)

| API | Used for | Cost |
|---|---|---|
| MFAPI.in | MF search, NAV, scheme info | Free, no auth |
| Yahoo Finance (unofficial) | Stock search, price | Free, no key |
| investorgain.com (webnodejs) | IPO metadata + GMP + subscription | Free tier |
| npsnav.in | NPS NAV | Free, no auth |
| vahandetails.com | Vehicle RC lookup | Free |
| RSS feeds | Finance news (M14) | Free |

---

## Competitive positioning

| Feature | Penny | INDmoney | Fi Money | Copilot Money |
|---|---|---|---|---|
| Privacy-first E2E encryption | ✅ | ❌ | ❌ | ❌ |
| No bank login required | ✅ | ❌ (screen-scrapes) | ❌ (requires account) | ✅ |
| EPF/NPS/PPF tracking | ✅ (manual) | ✅ (auto) | ❌ | ❌ |
| IPO tracker | ✅ | ✅ | ❌ | ❌ |
| India-specific tax module | ✅ | Partial | ❌ | ❌ |
| Offline-first PWA | ✅ | ❌ | ❌ | ❌ |
| Free to use | ✅ | Free tier | ❌ (requires account) | $95/year |

**Our sustainable edge:** Privacy is increasingly valued. INDmoney's screen-scraping violates EPFO ToS. Fi requires a banking relationship. Penny requires none of this.

---

## Non-requirements (explicitly out of scope)

- **No real-time portfolio sync** — manual entry is the price of privacy
- **No broker integration** — demat sync requires broker API credentials (Phase 2 consideration)
- **No bill payment** — payments processing requires RBI licenses
- **No credit card spending import** — would require bank credentials
- **No social features** — no leaderboards, no sharing portfolio with strangers
- **No advertising** — ever
