# Penny — What's Next

This document captures feature ideas and improvements under consideration for current and future phases. Not all of these will be built — it's a thinking space for what the app could become.

If you have ideas or feedback, open a GitHub issue referencing the relevant `docs/features/` file.

---

> **This is a future-ideas thinking space, not a status tracker.** For what's actually built / in
> progress, see the authoritative sources: [`CLAUDE.md`](../CLAUDE.md) (milestone table),
> [`docs/MILESTONES.md`](MILESTONES.md) (full history), [`docs/ROADMAP.md`](ROADMAP.md) (phase scope +
> decisions), and [`docs/plans/`](plans/). As of 2026-07-05: Phase 1 (M0–M15) ✅, Pre-Phase 1.5 ✅, and
> Phase 1.5 Groups (Track E) is deployed + Track F recovery (F1–F3) is done — remaining Phase 1.5 work is
> Track E live verification, Track F4 (device pairing/QR), and the Stage F closeout.

## Phase 1.5 — remaining (Groups & Household OS)

Most of Groups & Household OS is built (see the trackers above). Still to do within Phase 1.5:

- **Device pairing / QR (Track F4)** — link a second device / "Penny on laptop"; reuses the ECDH grant machinery. To be designed before building.
- **Group recovery after reclaim** — list-my-groups sync + co-member key re-grant so a reclaimed account can decrypt group history without a backup (deferred Track F follow-up).
- **Stage F closeout** — combined household net-worth view + the remaining Phase-1.5 polish drawn up after Track E/F land.
- **Server-side E2EE data blob** (optional, Phase 2-ish) — store the passphrase-wrapped DMK + encrypted data so username+passphrase can restore *everything* without the user's own cloud (reverses own-Drive Model B + reopens storage cost — a deliberate, costed decision).

---

## Phase 2 ideas (AI + Cloud)

### Chip AI improvements

- **Real Chip AI** — Switch from mock to live `claude-sonnet-4-6`. User brings their own API key.
- **Chip chat UI** — Full conversational interface (deferred from M8 step 44).
- **AI auto-categorisation** — Merchant name + amount band → category suggestion via Cloudflare Worker. Local rules engine for repeat categorisations.
- **Life event workflows** — AI-guided flows triggered by detected life events: salary hike, home purchase, marriage, new child, job loss, inheritance. Each event has a structured checklist.
- **Portfolio rebalancing suggestions** — "Your equity allocation has grown from 60% to 72%. Consider rebalancing."
- **Tax optimisation alerts** — "You have ₹45,000 remaining 80C room. Last date is March 31."
- **EPF withdrawal eligibility** — Alert when eligible for partial/advance withdrawal based on purpose rules.

### Import improvements

- **CAS PDF import** — Parse CDSL/CAMS consolidated account statement. Auto-import all MF and stock holdings.
- **EPFO passbook PDF import** — Parse employment history + transactions from EPFO passbook PDF.
- **Bank statement import** — Parse PDF bank statements (Indian banks vary — challenge: no standard format).
- **SMS transaction parsing** — Auto-detect expenses from bank SMS alerts. Privacy concern: requires READ_SMS permission.

### Export improvements

- **Wealth snapshot PDF** — One-page summary: net worth, top holdings, recent expenses, goals progress.
- **Tax summary PDF** — Capital gains, 80C/80D/24B usage summary for CA filing.
- **Export to CA format** — CSV structured for common CA software (Tally, Zoho Books).

### Asset tracking improvements

- **Watchlist** — Track stocks/MFs without owning them. Price alerts.
- **Demat sync** — Connect Zerodha/Groww/Angel One APIs. Challenge: needs user's broker credentials.
- **NPS statement import** — PRAN statement PDF parsing.
- **Real estate valuation** — Link to housing.com/Magicbricks estimated price for the pin code.

---

## Phase 3 ideas

- **Regional languages** — Hindi first (most users), then Tamil, Telugu, Kannada, Marathi, Bengali.
- **Crypto / Web3** — Bitcoin, Ethereum, altcoins. Live prices via CoinGecko.
- **International equities** — US stocks and ETFs. Live prices via Yahoo Finance (already integrated for Indian stocks).
- **Advance AI advisor** — Comprehensive financial plan generation. Annual review mode.
- **RBI Account Aggregator (AA) sync** — When EPFO, NPS, and more FIPs join the AA framework, sync automatically. Zero screen-scraping.

---

## Ideas from user research / competitive analysis

These are features users of INDmoney, Fi Money, and Copilot Money love that are worth considering:

- **Spending projections** — "At this rate you'll spend ₹12,000 more than last month." Early warning before overspend.
- **Bill due date tracker** — Separate from insurance renewals — credit card due dates, utility bills, rent.
- **Net worth trend graph** — Month-by-month net worth over 12 months. Visualise growth.
- **Investment returns vs Nifty benchmark** — "Your portfolio returned 14.2% vs Nifty 50's 11.8%."
- **SIP top-up reminders** — "Annual increase reminder: you set a 10% step-up on this SIP in April."
- **Loan payoff celebration** — When a loan reaches ₹0, celebrate it. Small UX moment.
- **Health insurance claim tracker** — Log claims, reimbursements, deductibles used.
- **Term insurance premium comparison** — Annual reminder to check if a better premium exists.
- **EPF UAN status** — Alert if EPF passbook hasn't been credited in 3+ months.
- **ITR deadline reminders** — Calendar-aware: remind 30 days, 7 days, 1 day before July 31.

---

## Phase 3+ ideas

- **Income tax portal sync** — Connect to the Income Tax e-filing portal (AIS/Form 26AS data) to auto-import advance tax paid, TDS deducted, and capital gains reported. App could retrospectively compare against what it computed and show gaps.
- **Biometric / PIN-free unlock** — Face ID / fingerprint unlock instead of PIN on native apps (Phase 2). Privacy-first framing: biometric never leaves device, used only to unlock the Master Key from the secure enclave. Currently deferred to Phase 2 native app.

---

## Open UX questions (ideas welcome)

1. **Net worth trend line** — Should it be on the Home screen or Portfolio overview? Both?
2. **Recurring expense confirmation** — Should we ask users to confirm detected subscriptions, or auto-add them to a "suspected" list?
3. **Goal notifications** — Users can't receive push notifications in a PWA (on iOS). Show in-app banners instead?
4. **Multi-currency** — NRIs want USD/GBP investments alongside INR. How to handle FX conversion in net worth?
5. **Joint insurance** — Family floater health insurance covers multiple people. How to attribute premium per person?
6. **Expense sharing pre-Phase 1.5** — Flatmates want to split bills even before groups exist. Could do simple 50/50 split with manual note.
7. **Emergency fund designation** — Mark a specific account as "emergency fund" for health score accuracy.
8. **Charitable donations tracker** — 80G-eligible donations tracked separately. Useful for tax.
