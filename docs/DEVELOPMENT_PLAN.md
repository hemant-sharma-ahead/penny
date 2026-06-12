# Penny — Development Plan

## Phase overview

| Phase | AI? | Account? | Key milestone |
|-------|-----|---------|---------------|
| Phase 1 — Core | No | No | Full app on simulated data, local-only |
| Phase 1 + Chip | Yes | No | Chip AI on anonymised local data |
| Phase 1.5 — Groups | Yes | Yes (first time) | Shared expenses, family/trip/household |
| Phase 2 — Real data | Yes | Yes | RBI AA, broker execution, native apps |
| Phase 3 — Scale | Yes | Yes | Languages, crypto, international equities |

---

## Phase 1 — Core (no AI, no account)

### 5 core modules
- **Portfolio** — MF, stocks, FD, NPS, PPF, gold. Manual entry. Live price via MFAPI.in (MF NAV) and Yahoo Finance (NSE/BSE stocks). Chip report card (5 scored dimensions per holding).
- **Expenses** — Category tracking, monthly budgets, hashtag tagging (#emi, #tax, #travel). Date-grouped list. Category filter.
- **Net Worth & Goals** — Total assets minus liabilities. Goal cards with progress rings, target date/amount, risk appetite. On-device SIP calculator. Loan repayment modeller.
- **Insurance** — Policy list: type, insurer, coverage amount, annual premium, renewal date. Renewal alerts. Coverage gap analysis.
- **Privacy system** — Safe/Privacy/Open modes. Peek (5-sec reveal on tap). Auto-lock on inactivity. Privacy Centre with domain call log and AI call log.

### BRD v4.0 additions (all on-device, no API)
- **Subscription detection** — 3-pass algorithm (known merchant → amount consistency → interval verification). User-confirmed before tracking. Trial alerts (7 days, 1 day), price creep detection, unused service alerts (60+ days no usage).
- **IOU tracker** — Local lent/borrowed log. Signal detection from round amounts and reversals. 30+ day ageing alerts. Opportunity cost calculation. Person names are PII and never sent to AI.
- **Loan repayment scenarios** — 6 on-device scenarios using `amortisationSchedule()` (pure TypeScript): extra EMI/year, step-up EMI, lump sum, monthly overpayment, combination, deploy idle savings. Shows months saved and interest saved.
- **Liabilities expanded** — 12 liability types (home, car, personal, education, credit card, BNPL, gold loan, LAP, LAS, OD, informal, rental deposit). 22-field store with amortisation fields, prepayment penalty, LTV ratio.

### WhatsNext features (use existing data, no new integrations)
- **Tax awareness** — 80C (ELSS, PPF, LIC), 80D (health insurance), 24B (home loan interest). LTCG/STCG before any sell action. February alerts for remaining deduction room.
- **Financial health score** — 0–100 composite: emergency fund adequacy (20%), savings rate (20%), debt-to-income ratio (20%), insurance coverage (15%), goal trajectory (15%), diversification (10%).
- **Cash flow forecast** — Week and month ahead: upcoming EMIs + subscription renewals + known expenses vs salary. Alert for months with surprises.

### Security model
- Passphrase → Master Key (PBKDF2, SHA-256, 600K iterations, 32-byte salt, AES-256-GCM non-extractable)
- PIN (6 digits) → Key Encryption Key (PBKDF2, 200K iterations) → wraps/unwraps MK
- 30-minute session expiry, daily random PIN verification, 5-attempt lockout (exponential backoff)
- 21-day PIN rotation prompt
- Passphrase forgotten = data permanently lost (no key escrow, by design)

---

## Phase 1 + Chip (AI layer)

Adds the Anthropic API layer on top of Phase 1. The UI is already built (mock responses replaced with real ones).

- **Proactive insights** — Chip surfaces 3 actionable insights on the home screen. Each has: module tag, headline, reasoning (with numbers), "what if I do nothing?" (₹ consequence), action buttons.
- **Ask Chip (chat)** — Context-aware: Chip knows which screen the user is on. Full-screen chat mode. Streaming responses.
- **Approval flow** — Chip recommends → user reads reasoning → taps Approve → logged.
- **Report card scoring** — Live Chip scores per holding. MF: 5 dimensions (returns vs benchmark 30%, consistency 25%, expense ratio 20%, portfolio overlap 15%, risk-adjusted return 10%). Stocks: quality 30%, valuation 25%, momentum 20%, earnings trend 15%, portfolio fit 10%.
- **AI call log** — Every call logged before it's made. Anonymised payload visible in Privacy Centre with PII verification badge.
- **Credit score analysis** — Bureau score via aggregator API (OneScore/Finbox/CreditMantri). Chip gives one most-impactful action. Raw bureau report never sent to AI.
- **Subscription + IOU Chip analysis** — Chip surfaces unused subs, price creep, trial conversions. IOU ageing and opportunity cost.

**Model:** `claude-sonnet-4-6` | Temperature: 0.3 (analysis), 0.7 (conversation) | Max tokens: 1200 / 800

---

## Phase 1.5 — Groups

First moment an account is required. Introduced transparently: "The only reason we ask for an account is so your group members can identify you."

- Family group (permanent) — shared household expenses, joint net worth view
- Trip group (temporary) — travel split, auto-settle at trip end
- Household group (ongoing) — rent, utilities, recurring shared costs
- IOU-to-group linking — personal IOUs can be linked to a group member
- DPDP Act 2023 compliance review before launch

---

## Phase 2 — Real data + execution

- **RBI Account Aggregator** (Finvu / Perfios / Setu / Saafe) — bank accounts, MF holdings, insurance data. User-consented pull.
- **Real trade execution** — Chip recommends → user approves → Penny executes via BSE StarMF (mutual funds) or Zerodha/Groww (stocks). Requires SEBI Investment Adviser registration.
- **Native mobile apps** — Capacitor wraps the PWA → iOS + Android. App Store privacy label: "no data collected."
- **Zero-knowledge cloud sync** — Supabase stores AES-256-GCM ciphertext blobs. Server cannot decrypt. Only shared expenses synced by default.
- **Live credit score** — Bureau API via aggregator. PAN used for auth only, not stored in IndexedDB.
- **SMS detection** — Device-local ML categorisation of bank SMSes for subscriptions and IOUs. Never transmitted.
- **Biometric unlock** — Off by default. Opt-in with full disclosure. Daily random PIN still required.
- **SIP drift + rebalancing** — Portfolio drift alerts, tax-aware redemption suggestions, SIP step-up for inflation.
- **Life event workflows** — Job change, marriage, baby, job loss, windfall. Personalised checklists with ₹ impact per option.

**Monetisation launches here:**
- Free: Phase 1 + ~20 Chip calls/month
- Penny Pro: ₹299/mo — unlimited Chip, tax awareness, health score, cash flow, life events
- Penny Family: ₹499/mo — Pro × 4 members, household score, joint goals
- Never: data sales, referral fees, ads

**Regulatory milestones:**
- DPDP Act compliance before Phase 1.5 launch
- SEBI IA registration before Phase 2 execution goes live
- RBI AA integration (NBFC-CIC via aggregator partner)

---

## Phase 3 — Scale

- Hindi and regional language localisation
- Crypto and international equities (US stocks, ETFs)
- Multi-bureau credit score comparison (CIBIL vs Experian vs Equifax)
- Debt payoff optimiser (avalanche vs snowball, tax-aware)
- Complete household wealth OS with multi-member view

---

## Build milestones (current session)

| Milestone | Description | Status |
|-----------|-------------|--------|
| M0 | Repo, tooling, docs | ✅ |
| M1 | 5-tab running skeleton | 🔄 |
| M2 | Crypto + DB layer | ⏳ |
| M3 | CI PII gate | ⏳ |
| M4 | Onboarding flow | ⏳ |
| M5 | Feature modules (Phase 1 Core) | ⏳ |
| M6 | PWA + responsive polish | ⏳ |
| M7 | Hardening (PIN lockout, backup) | ⏳ |
| M8 | Phase 1 + Chip (real Anthropic) | ⏳ future |
