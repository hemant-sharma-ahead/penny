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
| M13: Financial calculators | ✅ Complete |
| M14: Finance news + Contact/Feedback | 🚧 In progress (Pankhuri) |
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

## M13 steps (complete)

| Step | Feature | Status |
|---|---|---|
| — | FIRE calculator | ✅ Done |
| — | HRA exemption calculator | ✅ Done |
| — | PPF maturity calculator | ✅ Done |
| — | NPS corpus calculator | ✅ Done |
| — | Step-up SIP calculator | ✅ Done |
| — | Old vs new tax regime comparison | ✅ Done |

---

## M14 (in progress — Pankhuri)

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
| Track 1D | Component wiring — replace all inline patterns in now-thin feature pages | ✅ Complete |
| Track 1E | Design-system consolidation — semantic status tokens, Badge/ListRow/StatBox adoption, lib/date consolidation, card convergence onto shared primitives | ✅ Complete |
| Track 2 | Identity, Account & Security — envelope encryption, onboarding v2 (DOB/employment/username + consent + back nav), change PIN/passphrase, PIN hardening (unified lockout, weak-PIN, once/day, opt-in wipe & lock-on-background), local identity + entitlement gate, full reset + config-gated cloud backup, DOB/employment downstream wiring, profile editor | ✅ Complete |
| Track 3 | Expense category overhaul — in-picker category manager, visual icon picker (curated grid + searchable Tabler set), create/edit/rename/recolor, move transactions + delete-when-empty + category bulk, user-created parent groups (expense + income), anchored-popover `SelectInput`, transaction-list multi-select bulk edit (category / account+payment coupled) + delete | ✅ Complete |
| Track 4 | Activity log → **Timeline**: encrypted `activity_log` store, all-module logging via `useLoggedRepository`/`logActivity`, Undo toasts + Recently Deleted restore, day-grouped feed, beautiful diffs, per-item history, tracking heatmap + streaks, privacy receipt, On this day, Chip-narrated Money Story, full-screen shareable Weekly Wrapped, milestone moments + confetti, search + action filters, restore points (checkpoint + restore-deletions-since) | ✅ Complete |
| Track 6 | Expense productivity & power features — see ordered steps below | 🚧 In progress |
| Track 7 | Tax & calculators in context — tax footprint + calculator re-homing | ⏳ Future |

### Track 6 — expense productivity & power features

Backlog captured 2026-06-25 after Track 3; scoped into ordered steps 2026-06-25. All Phase-1 feasible (local-first, no backend). AI auto-categorisation stays a Phase-2/Chip item; local merchant memory is its Phase-1 stepping stone. **Split transactions deferred to Phase 2** (needs a proper data-model design). The old Cash Flow view + the "safe to spend" idea are unified into a single **forecast engine** (Phase C).

Each step runs the verification gate (type-check → lint → test/PII gate → visual) and the doc-update checklist before it's marked done.

**Phase A — Input foundation**
1. ✅ **`AmountInput` primitive** — live Indian thousands grouping in-field, inline calculator (`120+45`), amount-in-words helper beneath (`1,00,000` → "One Lakh"). Adopted across all money inputs (`tests/lib/amountToWords.test.ts`).

**Phase B — Fast capture**
2. ✅ **Description-first reorder + local merchant memory** — Description is the first field in the Add form; encrypted `merchant_memory` store (schema v5) remembers last category/account/payment per merchant and offers a **tap-to-apply suggestion** beneath the field on the next match (nothing fills until tapped). One-time backfill from existing transaction history (`penny_merchant_memory_v1` flag) so it works on upgrade, not just for new saves. Pure helpers in `core/expenses/merchantMemory.ts` (`tests/expenses/merchantMemory.test.ts`). Local precursor to the Phase-2 AI categoriser.
3. ~~Natural-language quick-add~~ — **skipped** (2026-06-25, user decision). Merchant memory already covers fast re-entry; revisit only if a parser proves worth it.

**Phase C — Forecast engine** (absorbs the old Cash Flow view + "safe to spend")
4. ✅ **Net-balance forecast core** — `core/cashflow` projects total liquid balance forward: recurring income inflows alongside outflow events, running-balance series, lowest-balance warning against a **user-set buffer floor** (SettingsContext, default ₹5,000), and a **liquidity-based "safe to spend"** with **payday-aware framing**. Fixed the latent bug where recurring income was counted as an outflow. Shared `hooks/useForecast.ts` powers the rebuilt Cash Flow page (safe-to-spend hero, balance sparkline, breach banner, buffer editor, Week/Month/3M) and the safe-to-spend surfaces on Home + the Expenses header. Tests in `tests/cashflow/forecaster.test.ts`.
5. ✅ **Recurring-income detection** — `core/cashflow/incomeDetector.ts` mirrors the subscription detector; `features/cashflow/useIncomeSuggestions.ts` surfaces a confirmable card on the Cash Flow page. Confirming marks the latest matching income transaction recurring (so a payday appears in the forecast); dismissals are remembered locally. Tests in `tests/cashflow/incomeDetector.test.ts`.
6. ✅ **Recurring auto-post inbox** — `core/expenses/recurringDue.ts` (`computeDueRecurring` + `buildOccurrence`, tested) finds recurring series whose next occurrence is due; a "due to log" banner on the Transactions tab opens `RecurringInboxModal` to confirm (logs a real transaction via the normal save path) or skip. Closes the gap where recurring items were forecast-only. Wired through `useExpenses` (`dueRecurring`/`postRecurring`/`skipRecurring`).
7. ✅ **In-app reminders** — a header **bell + badge** opens a Reminders panel of near-term outflows: overdue recurring bills + anything due in the next 7 days (EMIs, subscriptions, insurance, bills), grouped by urgency. Per-item actions: snooze (1d/3d/1w), mark done, **Log** (recurring bills → reuses the Step 6 occurrence builder), **Cancel** (subscriptions). Pure core `core/reminders/reminders.ts` (`buildReminders`/`reminderCounts`, tested); `hooks/useReminders.ts` holds snooze/done state. **Decision (2026-06-26):** in-app only — no notification/permission APIs. Real OS/scheduled/push reminders need a backend or unsupported/experimental APIs → **deferred to Phase 2**.

**Phase D — Subscriptions upgrade**
8. ✅ **Subscriptions upgrade** — active subs show **next renewal** + **annualised cost** and are ordered by renewal (a renewal calendar); **monthly + yearly** totals; **manual add** form (`SubscriptionForm`, trial toggle); **zombie/unused nudge** banner (`isDormant`, not charged in 2+ cycles → annual saving); **price-hike detail** on detected subs (detector exposes first/latest amount → ₹old → ₹new, +X%). Renewal/trial *reminders* already flow through the Step 7 bell. Pure helpers in `core/subscriptions/format.ts` (`toAnnual`/`nextRenewal`/`isDormant`, tested) + `detector.ts` price fields (tested).

**Phase E — Polish + UX**
9. ✅ **Tab reorder** — Analytics is now the first tab and the default landing for the Expenses module; order is Analytics · Transactions · Subscriptions · Budgets · IOU. (The add-transaction FAB lives on the Transactions tab.)
10. ✅ **Duplicate + templates + swipe** — Duplicate from the edit form (via a `prefill` path on `ExpenseForm`); **save-as-template** + one-tap template chips on the Transactions tab (encrypted `transaction_templates` store, schema v6); **swipe-left** rows (`SwipeableRow`, pointer-based with `touch-action: pan-y`) reveal Copy / Delete, tap to edit. Disabled in select mode.
11. ✅ **Cash-wallet reconcile + receipt attach** — cash/wallet accounts get a Reconcile action (`useAccounts.reconcileAccount` posts a balancing income/expense to match a counted balance; `ReconcileModal`). Transactions can carry a **receipt photo** — picked, compressed to a JPEG data URL (`lib/image.ts`), stored encrypted on the `Expense` (`receiptDataUrl`, never sent to AI); paperclip indicator on rows.
12. ✅ **Anomaly nudges + monthly recap** — `core/expenses/monthlyInsights.ts` (`computeAnomalies` + `monthlyRecap`, pure, event-exclusion injected, tested). Anomaly banners on the monthly Analytics view ("Dining 42% over your average", trailing-3-month avg pro-rated for the partial current month) + a recap card (spent, net, vs-last-month, transactions, top category).

**Explicitly out of Track 6:** split transactions (→ Phase 2), natural-language quick-add / Web Share Target / SMS-paste / voice quick-add / round-up-to-goal / PWA home-screen shortcut / merchant deep-dive / GST expense tagging (declined for now), AI auto-categorisation (→ Phase 2).

### Track 7 — tax & calculators in context

Captured 2026-06-25. Spun out of Track 6 so the expense track stays coherent. Tax-domain work on the existing Tax Awareness screen.

1. **Tax footprint view** — reconcile the three numbers people never see together: **earn** (gross income → direct tax/TDS computed from income + regime + deductions → take-home), **spend** (total spend + an **estimated GST slice** via per-category effective rates, clearly labelled an estimate), **invest** (realised gains → capital-gains tax). Headline: "earned ₹X, kept ₹Y, paid ₹Z in total tax — A% direct, B% indirect, C% on gains."
2. **Re-home tax calculators** — mount Old vs New Regime, HRA Exemption, and Capital Gains as tabs/sections inside the Tax screen; the searchable Calculators hub stays the global index. Principle: calculators live where you need them. Extends later to other domains (SIP/Lumpsum/FD near Portfolio, etc.).

### Track 1 rationale

Analysis of the existing codebase revealed that major feature files (ExpensesPage: 3,183 lines, PortfolioPage: 4,957 lines) mixed pure calculations, data fetching, state management, and UI rendering in a single file. This makes React Native migration expensive and feature logic untestable. The four-sub-track approach fixes the root cause before addressing the surface symptom (inline Tailwind patterns).

**RN migration reusability (measured by LOC, post Track 1D):**
- **Logic layer (~36% of `src`) ports directly or behind an isolated adapter** — `src/core/` (minus Dexie/Web-Crypto), `src/lib/`, all feature `use*.ts` hooks. Dexie (`core/db`), Web Crypto (`core/crypto`, one file), and `context/` localStorage are swap-behind-interface.
- The remaining ~64% is `components/ui` + feature JSX markup — inherent RN UI rework (swap renderers, keep prop contracts). The clean isolation (Web Crypto in 1 file, Dexie in 4, FileReader/xlsx in leaf components) makes that port mechanical.
- Earlier "~85%" estimates counted the component-swap UI as "reuse"; by LOC the honest logic-reuse figure is ~36%. Track 1E (shared-component adoption) raises effective UI reuse by shrinking bespoke markup.

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
