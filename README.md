# Penny

**Chip in. Watch it grow.**

Penny is a privacy-first personal wealth management app built for India. Track your
complete financial life — investments, expenses, retirement corpus, insurance, loans, and
more — entirely on your device, with no data sent to our servers.

---

## Your financial life is not a product.

Most free finance apps contain 5–15 ad trackers and treat your spending data as inventory.
Penny works differently:

- **Zero trackers.** No Google Analytics, no Facebook pixels, no ad networks.
- **Zero servers (Phase 1).** Your data never leaves your device. There is no Penny server
  that can be breached.
- **AES-256 encryption.** Every record is encrypted with a key derived from your
  passphrase. We never see it.
- **Public API calls only.** The app contacts a small set of public market data APIs
  (MFAPI.in, Yahoo Finance, investorgain.com, npsnav.in). No user data is ever sent to
  them — only public lookup parameters like stock tickers and scheme codes. Full registry:
  [`docs/EXTERNAL_APIS.md`](docs/EXTERNAL_APIS.md).

---

## What Penny tracks

| Module | What you get |
| --- | --- |
| **Portfolio** | Stocks, Mutual Funds, NPS, PPF, EPF, FD/RD, Gold/Silver, Vehicles, Property. Live prices and NAVs. Gain/loss across all holdings. |
| **IPO Tracker** | Live IPO lifecycle (Upcoming → Open → Closed → Listed). GMP, subscription multiples, listing gain. |
| **Expenses** | Full transaction tracking (expenses, income, transfers). Category analytics, budgets, recurring rules, hashtag tagging. CSV import/export. |
| **Accounts** | Multiple bank accounts, credit cards, cash. Live balances derived from all transactions. |
| **Goals** | Set targets with target dates. SIP calculator. Progress rings. |
| **Loans** | Amortization schedule, payoff planner (4 scenarios), XLSX export. |
| **Insurance** | Policy list, renewal alerts, coverage overview. |
| **IOUs** | Track money lent or borrowed. Ageing alerts. |
| **Subscriptions** | 3-pass auto-detection of recurring expenses. |
| **Financial Health Score** | 0–100 composite across 6 dimensions. Grade A–D. |
| **Tax Awareness** | 80C/80D/24B tracking, LTCG/STCG capital gains, old vs new regime. |
| **Cash Flow** | Forward-looking projection of income, expenses, and balance. |
| **Groups & Household OS** | Shared expenses, joint goals, and settle-up across couples, families, and flatmates — your personal data always stays personal. |
| **Chip AI** | AI money advisor (Phase 1: smart simulation. Phase 2: Claude AI). Every insight shows reasoning + "what if I do nothing?" in rupees. |
| **10 Financial Calculators** | FIRE, tax regime comparison, HRA, SIP/SWP, FD/RD, lumpsum/CAGR, capital gains, gratuity, Sukanya Samriddhi, inflation. |

---

## Privacy modes

Switch anytime from the top bar:

| Mode | What you see | Use when |
| --- | --- | --- |
| 🟡 **Safe** (default) | Amounts masked as •••• | Someone might glance at your screen |
| 🟣 **Privacy** | Section names only, no amounts | Screen recording or sharing |
| 🔴 **Open** | Everything visible, PIN required | Your own private time |

**Peek:** Tap any masked value for a 5-second reveal without switching modes.

---

## Platforms

Penny is available as a **Progressive Web App** today, and a **native iOS/Android app
(React Native/Expo) is actively in development** — not a future promise, a real in-progress
migration you can track in [`docs/MOBILE_PARITY.md`](docs/MOBILE_PARITY.md).

**Try the PWA today:**

1. Open Penny in Chrome or Safari on your phone
2. Tap **Add to Home Screen** (Safari) or **Install** (Chrome)
3. Done. It works offline.

---

## How Chip AI works

Chip reads an anonymised snapshot of your financial data — names stripped, amounts rounded
to ₹10K bands, bank names replaced with "Bank A" — before any API call is made. The
anonymisation is enforced in code, not policy, and tested in CI
(`packages/core/tests/pii-gate/piiGate.test.ts`).

Chip never knows your name, PAN, Aadhaar, phone number, account numbers, or exact amounts.

---

## Roadmap

| Phase | What's included | Status |
| --- | --- | --- |
| Phase 1 (M0–M15) | Full financial life tracking, zero backend, local-first | ✅ Complete |
| Pre-Phase 1.5 | Documentation, component library, onboarding v2, category overhaul, activity log | ✅ Complete |
| Phase 1.5 | Groups & Household OS — shared expenses, family vaults, joint goals | 🚧 In progress (Groups deployed; multi-device recovery in progress) |
| Mobile migration | React Native/Expo port, one codebase for iOS + Android + eventually web | 🚧 In progress — active branch |
| Phase 2 | Real Chip AI, cloud sync, CAS import, export PDF | ⏳ Future |
| Phase 3 | Regional languages, crypto, international equities | ⏳ Future |

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for full shipped history, architectural decisions,
and future ideas.

---

## Documentation

Full documentation lives in [`docs/`](docs/). Start at [`docs/README.md`](docs/README.md)
for navigation.

| File | What it covers |
| --- | --- |
| [`docs/BRD.md`](docs/BRD.md) | Product vision, target users, competitive positioning |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Codebase map, component inventory, architectural decisions |
| [`docs/PRIVACY.md`](docs/PRIVACY.md) | PII definitions, anonymisation rules, encryption model |
| [`docs/SCHEMA.md`](docs/SCHEMA.md) | All database stores and fields |
| [`docs/EXTERNAL_APIS.md`](docs/EXTERNAL_APIS.md) | Every external API Penny calls, and why |
| [`docs/features/`](docs/features/) | Per-feature documentation |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Shipped history, in-progress work, and future feature ideas — open a GitHub issue to suggest one |

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for local setup (web, mobile, and Capacitor),
architecture overview, branching rules, and the contribution guide.

---

## Licence

MIT — free to use, fork, and self-host.
