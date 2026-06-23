# Penny — Milestone History

Complete record of every milestone, step, and status from M0 to present. See [`docs/ROADMAP.md`](ROADMAP.md) for future phases.

---

## Phase 1 milestones

| Milestone | Status |
|---|---|
| M0: Repo + tooling + docs | ✅ Complete |
| M1: Running skeleton (5-tab layout) | ✅ Complete |
| M2: Crypto + DB layer | ✅ Complete |
| M3: CI PII gate | ✅ Complete |
| M4: Onboarding flow | ✅ Complete |
| M5: Feature modules (no AI) | ✅ Complete |
| M6: PWA + responsive polish | ✅ Complete |
| M7: Hardening | ✅ Complete |
| M8: Phase 1 polish | ✅ Complete |
| M9: Income, transfers & cash | ✅ Complete |
| M10: IPO tracker + GMP | ✅ Complete |
| M11: Extended asset tracking | ✅ Complete |
| M12: Portfolio enhancements | ✅ Complete |
| M13: Financial calculators | 🚧 In progress (Pankhuri) |
| M14: Finance news + Contact/Feedback | ⏳ Future |
| M15: UI polish + feature refinements | ✅ Complete |

---

## M5 steps

| Step | Feature | Status |
|---|---|---|
| Infra | formatters, repositories, mockChip, useRepository hook | ✅ Done |
| 22 | Home dashboard (net worth card, Chip insights, module tiles) | ✅ Done |
| 23 | Expenses (list, form, categories, hashtags, budgets) | ✅ Done |
| 24 | Goals (cards, progress rings, SIP calculator) | ✅ Done |
| 25 | Portfolio (holdings, live price fetch, report card) | ✅ Done |
| 26 | Insurance (policy cards, form, renewal tracker) | ✅ Done |
| 27 | Subscription detection (3-pass algorithm) | ✅ Done |
| 28 | IOU tracker (lent/borrowed, ageing alerts) | ✅ Done |
| 29 | Loan scenarios (6 on-device calculations) | ✅ Done |
| 30 | Financial health score (0–100 composite) | ✅ Done |
| 31 | Tax awareness (80C/80D/24B, LTCG/STCG) | ✅ Done |
| 32 | Cash flow forecast (week/month ahead) | ✅ Done |

Step 33 (Chip tab) moved to M9.

---

## M6 steps

| Step | Feature | Status |
|---|---|---|
| 34 | PWA setup (vite-plugin-pwa, Workbox, CSP, offline icons) | ✅ Done |
| 35 | Responsive audit (360/390/768px, tap targets ≥44px) | ✅ Done |

---

## M7 steps

| Step | Feature | Status |
|---|---|---|
| 36 | PIN lockout UI (countdown, exponential backoff, attempt warnings) | ✅ Done |
| 37 | 21-day PIN rotation banner (AuthGuard always checks, shown after unlock) | ✅ Done |
| 38 | Encrypted backup/restore (.penny export/import, passphrase-derived MK) | ✅ Done |
| 39 | Final CI pass + CLAUDE.md updated | ✅ Done |

---

## M8 steps

| Step | Feature | Status |
|---|---|---|
| 40 | Visual identity — Penny SVG logo, Chip avatar, updated PWA icons | ✅ Done |
| 41 | Settings drawer — module visibility toggles, font scale slider | ✅ Done |
| 42 | Privacy mode switcher — 3-segment toggle, PIN gate for Open, theme tinting | ✅ Done |
| 42b | Light/dark theme system (Penny Light + Penny Dark) | ✅ Done |
| 43 | Demo data seeding — realistic sample records on first onboarding | ✅ Done |
| 44 | Chip mock chat UI | ⏳ Deferred to Phase 2 |
| 45 | Expense categories rethink + analytics tab + budget tab polish | ✅ Done |
| 46 | Import expenses — Penny CSV + YNAB/Cashew/MoneyView parsers, 3-step UI | ✅ Done |
| 47 | Export CSV — AES-256 password-protected ZIP, date range picker | ✅ Done |
| 48 | Responsive/laptop layout | ⏳ Deferred to Phase 2 |
| 49 | Final CI pass + CLAUDE.md updated | ✅ Done |

---

## M9 steps

| Step | Feature | Status |
|---|---|---|
| 50 | Data model — Account type + Dexie v2, accountsRepo, AccountsPage, router wiring | ✅ Done |
| 51 | TransactionForm — type selector (Expense/Income/Transfer), account selectors, speed dial FAB | ✅ Done |
| 52 | Transactions tab — all types in list with type-specific icons/colors, page rename | ✅ Done |
| 53 | Demo data — 3 accounts, salary income ×3, freelance income, CC + savings transfers | ✅ Done |
| 54 | Home dashboard — accounts strip with live balances | ✅ Done |
| 55 | Final CI pass + CLAUDE.md updated | ✅ Done |

---

## M10 steps

| Step | Feature | Status |
|---|---|---|
| 56 | IPO types + ipoClient (investorgain.com, cache, FY constants) | ✅ Done |
| 57 | useIpos hook + IPO_TRACKER.md research doc | ✅ Done |
| 58 | IPO tab in PortfolioPage — sub-tabs (Upcoming/Open/Closed/Listed), refresh, empty states | ✅ Done |
| 59 | CSP fix (webnodejs.investorgain.com) + FY year fix + live data wiring | ✅ Done |
| 60 | IPO cards redesign — 2-column layout, financials left, dates right, all 4 tabs | ✅ Done |
| 61 | Demo data seeding | ⏳ Skipped — live data only (investorgain.com API) |
| 62 | IPO detail modal — 4-col grids, subscription API (QIB/HNI/Retail), day-wise table | ✅ Done |

---

## M11 steps

| Step | Feature | Status |
|---|---|---|
| 63 | Holdings sub-tab shell (6 tabs) + Retirement sub-tab (NPS/PPF/EPF cards) | ✅ Done |
| 63+ | NPS live NAV tracking — npsnav.in client, lifecycle fund tables, auto choice allocation | ✅ Done |
| 63++ | PPF full tracking — passbook ledger, FY deposit bar vs ₹1.5L, corpus projection | ✅ Done |
| 63+++ | EPF full tracking — employment history, transaction ledger, retirement projection | ✅ Done |
| 64 | Real Assets — vehicles (RC fetch, IRDA depreciation, challan cards) + property | ✅ Done |
| 65 | Fixed Income — FD/RD maturity auto-calc + compound interest projection | ✅ Done |
| 66 | Precious Metals — Gold + Silver live prices via MFAPI.in | ✅ Done |
| 67 | Stocks — full-width tab, symbol validation, live price × units, weighted avg, lot breakdown | ✅ Done |
| 68 | Mutual Funds — scheme category + fund house from MFAPI.in, scheme search, lot breakdown | ✅ Done |
| 69 | Home dashboard + Portfolio restructure — drop legacy assets store, fix net worth | ✅ Done |
| 70 | PDF Imports (CAS + EPFO passbook) | ⏳ Deferred to Phase 2 |
| 71 | Watchlist | ⏳ Deferred to Phase 2 |
| 72 | Final CI pass + CLAUDE.md updated | ✅ Done |

---

## M12 steps

See git log for M12 step details. Key deliverables: MF/stock search with live prices, symbol/scheme grouping, lot breakdown, scheme metadata (fund house, category), weighted average cost basis.

---

## M13 steps (in progress — Pankhuri)

| Step | Feature | Status |
|---|---|---|
| — | FIRE calculator | 🚧 |
| — | HRA exemption calculator | 🚧 |
| — | PPF maturity calculator | 🚧 |
| — | NPS corpus calculator | 🚧 |
| — | Step-up SIP calculator | 🚧 |
| — | Old vs new tax regime comparison | 🚧 |

---

## M14 (Future)

Finance news (RSS — ET Markets, Mint, RBI, SEBI, headlines + link-out) + Contact/Feedback (mailto: deep-link)

---

## M15 steps

| Step | Feature | Status |
|---|---|---|
| M15-1 | Modal centering — convert all bottom-sheet violations to centred modals | ✅ Done |
| M15-2 | Events system redesign — conditional delete, edit with unlink dialog, vacation guard | ✅ Done |
| M15-3 | Privacy mode overhaul — open mode red theme, default mode setting, safe mode rethink | ✅ Done |
| M15-4 | Home net worth fixes — credit card in liabilities, Liquid Funds bucket, Chip Insights moved | ✅ Done |
| M15-5 | Market data strip — indices, metals, forex, user-customisable (6 tickers) | ✅ Done |
| M15-6 | Expenses improvements — transaction filters (incl. event filter), analytics redesign | ✅ Done |
| M15-7 | Recurring transactions expansion — daily/weekly/bi-weekly/monthly/quarterly/half-yearly/yearly | ✅ Done |
| M15-8 | IPO Listed tab — FY year picker, search bar, listing gain % | ✅ Done |
| M15-9 | Loans module redesign — My Loans + amortization + payoff planner + XLSX download, 2-tab layout | ✅ Done |
| M15-10 | EPF salary hike groups — per-employer hike timeline, corpus auto-calc, card redesign | ✅ Done |
| M15-11 | Shared component extraction | ➡️ Moved to Pre-Phase 1.5 |

---

## Pre-Phase 1.5 tracks

| Track | Feature | Status |
|---|---|---|
| Track 5 | Documentation overhaul — CLAUDE.md, docs/, skills files | ✅ Complete |
| Track 1A | Logic extraction — pure calculations out of component files into src/core/ | ✅ Complete |
| Track 1B | Feature hooks — extract all state + data fetching into useXxx.ts per feature | ✅ Complete |
| Track 1C | Component library — create src/components/ui/ primitives (Card, Modal, Button, etc.) | ✅ Complete |
| Track 1D | Component wiring — replace all inline patterns in now-thin feature pages | ⏳ Next |
| Track 2 | Onboarding v2 — DOB, employment type, username field | ⏳ Next |
| Track 3 | Expense category overhaul — management page, visual icon picker, merge, bulk ops | ⏳ Next |
| Track 4 | Activity log foundation — new Dexie store + basic UI | ⏳ Next |

### Track 1 rationale

Analysis of the existing codebase revealed that major feature files (ExpensesPage: 3,183 lines, PortfolioPage: 4,957 lines) mixed pure calculations, data fetching, state management, and UI rendering in a single file. This makes React Native migration expensive and feature logic untestable. The four-sub-track approach fixes the root cause before addressing the surface symptom (inline Tailwind patterns).

**RN migration reusability:**
- Before Track 1: ~33% reusable (pure logic already in src/core/)
- After Track 1 complete: ~85% reusable (feature hooks + thin pages + component swap pattern)

### Target feature module structure (after Track 1)

```
src/features/{name}/
  use{Name}.ts          ← ALL state + ALL data fetching + ALL mutations (RN-portable)
  {Name}Page.tsx        ← thin: layout + calls hook + calls shared components (~300 lines max)
  {Name}Form.tsx        ← thin: form layout only (~150 lines max)

src/core/{domain}/
  {domain}Calculator.ts ← pure functions: calculations, transforms, aggregations (100% RN-portable)
  {domain}Utils.ts      ← pure utilities (date helpers, formatters specific to domain)
```

### Verification gate (after every sub-track step)

1. `npm run type-check` — catches prop mismatches and type errors immediately
2. `npm run lint` — catches architecture violations
3. `npm test -- --run` — PII gate + all tests green
4. Dev server visual check — navigate to the changed feature, verify UI and interactions
