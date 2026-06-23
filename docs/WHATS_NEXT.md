# Penny — What's Next

This document captures feature ideas and improvements under consideration for current and future phases. Not all of these will be built — it's a thinking space for what the app could become.

If you have ideas or feedback, open a GitHub issue referencing the relevant `docs/features/` file.

---

## In progress (Phase 1, M13 — Calculators)

These are being built now by the M13 team:

- **FIRE calculator** — Financial Independence, Retire Early. Input: current corpus, savings rate, target monthly spend in retirement. Output: target corpus, years to FIRE, monthly savings needed.
- **HRA exemption calculator** — Which of the three HRA exemption rules gives maximum benefit. Helps salaried employees know how much rent to claim.
- **PPF maturity calculator** — 40-year projection with annual deposit variations, partial withdrawals, loan against PPF.
- **NPS corpus calculator** — Age-adjusted projection with lifecycle allocation, expected returns by asset class, pension estimate at 60.
- **Step-up SIP calculator** — SIP with annual percentage increase. Shows how a 10% annual step-up compares to flat SIP.
- **Old vs new tax regime comparison** — Side-by-side based on actual income, investments (80C/80D/24B). Shows breakeven point.

---

## Near term (Phase 1, M14 — News & Contact)

- **Finance news feed** — RSS headlines from ET Markets, Mint, RBI, SEBI. Shows title + summary + link-out. No content stored. Filter by topic (markets, IPOs, RBI/SEBI, personal finance).
- **Contact/Feedback page** — mailto: deep-link to `support@penny.app`. Feedback form captured via email, no backend.

---

## Pre-Phase 1.5 (in progress)

- **Shared component library** (`src/components/ui/`) — Card, Modal, Button, TextInput, etc. Consistency + React Native migration readiness.
- **Onboarding v2** — Add DOB (for FIRE/NPS/EPF projections), employment type (gates EPF/tax modules), username (for future household invites).
- **Expense category management** — Rename, merge, delete categories. Visual icon picker (~80 curated SVGs). Bulk transaction operations.
- **Activity log** — Every create/update/delete logged locally. Foundation for undo (Phase 2) and household activity feed (Phase 1.5).

---

## Phase 1.5 (Groups & Household OS)

See `docs/ROADMAP.md` for full technical design.

- **Household groups** — Couple, Family, Flatmates, Custom. A user can be in multiple groups. Home screen context switcher.
- **Shared expenses** — Add expenses to a group, split bills, track who owes whom.
- **Joint goals** — Goals visible to all group members, joint contributions.
- **Optional net worth visibility** — For Couple/Family groups, each member can opt in to showing their net worth to the group.
- **Group dashboard** — Merged view: joint net worth, shared expenses summary, shared goals progress.
- **Group key exchange** — Invite by @username. Group key exchanged via public-key crypto.
- **Leave group flow** — Settlement summary → frozen read-only archive → export or delete.

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
