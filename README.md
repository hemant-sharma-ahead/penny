# Penny

**Chip in. Watch it grow.**

Penny is a personal wealth management app that puts you — not advertisers — in control of your financial life. Built for India. Works entirely on your device.

---

## Your financial life is not a product.

Most free finance apps contain 5–15 ad trackers and treat your spending data as inventory. Penny works differently:

- **Zero trackers.** No Google Analytics, no Facebook pixels, no ad networks. Verified in-app.
- **Zero servers (Phase 1).** Your data never leaves your device. There is no Penny server that can be breached.
- **AES-256 encryption.** Every record is encrypted with a key derived from your passphrase. We never see it.
- **Three external domains, total.** `api.anthropic.com` (AI), `mfapi.in` (mutual fund data), `finance.yahoo.com` (stock prices). You can verify this yourself in DevTools.

---

## What Penny does

| Module | What you get |
|--------|-------------|
| **Portfolio** | Track MF, stocks, FD, NPS, PPF, gold. Live NAV and prices. Chip scores each holding across 5 dimensions. |
| **Expenses** | Categorise spending, set budgets, tag with #hashtags. Auto-detect subscriptions. |
| **Net Worth & Goals** | Assets minus liabilities (12 types). Goal progress rings. On-device SIP and loan calculators. |
| **Insurance** | Policy list with renewal alerts and coverage gap analysis. |
| **Chip AI** | Your AI money coach. Proactive insights with rupee consequences. Context-aware chat on your anonymised data. |

**Chip always shows its reasoning.** Every recommendation tells you what it looked at, what it found, and what happens if you do nothing — in rupees.

---

## Privacy modes

Switch anytime from the top bar:

| Mode | What you see | Use when |
|------|-------------|---------|
| 🟡 **Safe** (default) | Amounts masked as •••• | Someone might glance at your screen |
| 🟣 **Privacy** | Module names only, no amounts | Screen recording or sharing |
| 🟢 **Open** | Everything visible | Your own private time |

**Peek:** Tap any masked value for a 5-second reveal without switching modes.

---

## Install

Penny is a Progressive Web App (PWA) — no app store needed.

1. Open Penny in Chrome or Safari on your phone
2. Tap **Add to Home Screen** (Safari) or **Install** (Chrome)
3. Done. It works offline.

> Phase 2 will bring native iOS and Android apps via the App Store.

---

## How Chip AI works

Chip reads an anonymised snapshot of your financial data — names stripped, amounts banded to ₹10K ranges, bank names replaced with "Bank A" — and gives you specific, actionable advice. You can read the exact anonymised payload in the **Privacy Centre** before and after every call.

Chip never knows your name, PAN, Aadhaar, phone number, or account numbers. This is enforced in code, not policy, and tested in CI.

---

## Roadmap

- **Phase 1** (current): Full app, all features, no AI, no account required
- **Phase 1 + Chip**: AI advisor on anonymised local data
- **Phase 1.5**: Shared expenses with family and trip groups (first account requirement)
- **Phase 2**: Real data via RBI Account Aggregator, trade execution, native apps
- **Phase 3**: Hindi/regional languages, crypto, international equities

See [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) for the full roadmap.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, architecture overview, and contribution guide.

---

## Licence

MIT — free to use, fork, and self-host.
