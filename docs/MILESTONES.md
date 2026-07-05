# Penny — Milestone History

Complete record of every milestone, step, and status from M0 to present. See [`docs/ROADMAP.md`](ROADMAP.md) for future phases.

---

## Phase 1 milestones

| Milestone                            | Status      |
| ------------------------------------ | ----------- |
| M0: Repo + tooling + docs            | ✅ Complete |
| M1: Running skeleton (5-tab layout)  | ✅ Complete |
| M2: Crypto + DB layer                | ✅ Complete |
| M3: CI PII gate                      | ✅ Complete |
| M4: Onboarding flow                  | ✅ Complete |
| M5: Feature modules (no AI)          | ✅ Complete |
| M6: PWA + responsive polish          | ✅ Complete |
| M7: Hardening                        | ✅ Complete |
| M8: Phase 1 polish                   | ✅ Complete |
| M9: Income, transfers & cash         | ✅ Complete |
| M10: IPO tracker + GMP               | ✅ Complete |
| M11: Extended asset tracking         | ✅ Complete |
| M12: Portfolio enhancements          | ✅ Complete |
| M13: Financial calculators           | ✅ Complete |
| M14: Finance news + Contact/Feedback | ✅ Complete |
| M15: UI polish + feature refinements | ✅ Complete |

---

## M5 steps

| Step  | Feature                                                      | Status  |
| ----- | ------------------------------------------------------------ | ------- |
| Infra | formatters, repositories, mockChip, useRepository hook       | ✅ Done |
| 22    | Home dashboard (net worth card, Chip insights, module tiles) | ✅ Done |
| 23    | Expenses (list, form, categories, hashtags, budgets)         | ✅ Done |
| 24    | Goals (cards, progress rings, SIP calculator)                | ✅ Done |
| 25    | Portfolio (holdings, live price fetch, report card)          | ✅ Done |
| 26    | Insurance (policy cards, form, renewal tracker)              | ✅ Done |
| 27    | Subscription detection (3-pass algorithm)                    | ✅ Done |
| 28    | IOU tracker (lent/borrowed, ageing alerts)                   | ✅ Done |
| 29    | Loan scenarios (6 on-device calculations)                    | ✅ Done |
| 30    | Financial health score (0–100 composite)                     | ✅ Done |
| 31    | Tax awareness (80C/80D/24B, LTCG/STCG)                       | ✅ Done |
| 32    | Cash flow forecast (week/month ahead)                        | ✅ Done |

Step 33 (Chip tab) moved to M9.

---

## M6 steps

| Step | Feature                                                  | Status  |
| ---- | -------------------------------------------------------- | ------- |
| 34   | PWA setup (vite-plugin-pwa, Workbox, CSP, offline icons) | ✅ Done |
| 35   | Responsive audit (360/390/768px, tap targets ≥44px)      | ✅ Done |

---

## M7 steps

| Step | Feature                                                                  | Status  |
| ---- | ------------------------------------------------------------------------ | ------- |
| 36   | PIN lockout UI (countdown, exponential backoff, attempt warnings)        | ✅ Done |
| 37   | 21-day PIN rotation banner (AuthGuard always checks, shown after unlock) | ✅ Done |
| 38   | Encrypted backup/restore (.penny export/import, passphrase-derived MK)   | ✅ Done |
| 39   | Final CI pass + CLAUDE.md updated                                        | ✅ Done |

---

## M8 steps

| Step | Feature                                                                    | Status                 |
| ---- | -------------------------------------------------------------------------- | ---------------------- |
| 40   | Visual identity — Penny SVG logo, Chip avatar, updated PWA icons           | ✅ Done                |
| 41   | Settings drawer — module visibility toggles, font scale slider             | ✅ Done                |
| 42   | Privacy mode switcher — 3-segment toggle, PIN gate for Open, theme tinting | ✅ Done                |
| 42b  | Light/dark theme system (Penny Light + Penny Dark)                         | ✅ Done                |
| 43   | Demo data seeding — realistic sample records on first onboarding           | ✅ Done                |
| 44   | Chip mock chat UI                                                          | ⏳ Deferred to Phase 2 |
| 45   | Expense categories rethink + analytics tab + budget tab polish             | ✅ Done                |
| 46   | Import expenses — Penny CSV + YNAB/Cashew/MoneyView parsers, 3-step UI     | ✅ Done                |
| 47   | Export CSV — AES-256 password-protected ZIP, date range picker             | ✅ Done                |
| 48   | Responsive/laptop layout                                                   | ⏳ Deferred to Phase 2 |
| 49   | Final CI pass + CLAUDE.md updated                                          | ✅ Done                |

---

## M9 steps

| Step | Feature                                                                                      | Status  |
| ---- | -------------------------------------------------------------------------------------------- | ------- |
| 50   | Data model — Account type + Dexie v2, accountsRepo, AccountsPage, router wiring              | ✅ Done |
| 51   | TransactionForm — type selector (Expense/Income/Transfer), account selectors, speed dial FAB | ✅ Done |
| 52   | Transactions tab — all types in list with type-specific icons/colors, page rename            | ✅ Done |
| 53   | Demo data — 3 accounts, salary income ×3, freelance income, CC + savings transfers           | ✅ Done |
| 54   | Home dashboard — accounts strip with live balances                                           | ✅ Done |
| 55   | Final CI pass + CLAUDE.md updated                                                            | ✅ Done |

---

## M10 steps

| Step | Feature                                                                                  | Status                                             |
| ---- | ---------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 56   | IPO types + ipoClient (investorgain.com, cache, FY constants)                            | ✅ Done                                            |
| 57   | useIpos hook + IPO_TRACKER.md research doc                                               | ✅ Done                                            |
| 58   | IPO tab in PortfolioPage — sub-tabs (Upcoming/Open/Closed/Listed), refresh, empty states | ✅ Done                                            |
| 59   | CSP fix (webnodejs.investorgain.com) + FY year fix + live data wiring                    | ✅ Done                                            |
| 60   | IPO cards redesign — 2-column layout, financials left, dates right, all 4 tabs           | ✅ Done                                            |
| 61   | Demo data seeding                                                                        | ⏳ Skipped — live data only (investorgain.com API) |
| 62   | IPO detail modal — 4-col grids, subscription API (QIB/HNI/Retail), day-wise table        | ✅ Done                                            |

---

## M11 steps

| Step  | Feature                                                                                     | Status                 |
| ----- | ------------------------------------------------------------------------------------------- | ---------------------- |
| 63    | Holdings sub-tab shell (6 tabs) + Retirement sub-tab (NPS/PPF/EPF cards)                    | ✅ Done                |
| 63+   | NPS live NAV tracking — npsnav.in client, lifecycle fund tables, auto choice allocation     | ✅ Done                |
| 63++  | PPF full tracking — passbook ledger, FY deposit bar vs ₹1.5L, corpus projection             | ✅ Done                |
| 63+++ | EPF full tracking — employment history, transaction ledger, retirement projection           | ✅ Done                |
| 64    | Real Assets — vehicles (RC fetch, IRDA depreciation, challan cards) + property              | ✅ Done                |
| 65    | Fixed Income — FD/RD maturity auto-calc + compound interest projection                      | ✅ Done                |
| 66    | Precious Metals — Gold + Silver live prices via MFAPI.in                                    | ✅ Done                |
| 67    | Stocks — full-width tab, symbol validation, live price × units, weighted avg, lot breakdown | ✅ Done                |
| 68    | Mutual Funds — scheme category + fund house from MFAPI.in, scheme search, lot breakdown     | ✅ Done                |
| 69    | Home dashboard + Portfolio restructure — drop legacy assets store, fix net worth            | ✅ Done                |
| 70    | PDF Imports (CAS + EPFO passbook)                                                           | ⏳ Deferred to Phase 2 |
| 71    | Watchlist                                                                                   | ⏳ Deferred to Phase 2 |
| 72    | Final CI pass + CLAUDE.md updated                                                           | ✅ Done                |

---

## M12 steps

See git log for M12 step details. Key deliverables: MF/stock search with live prices, symbol/scheme grouping, lot breakdown, scheme metadata (fund house, category), weighted average cost basis.

---

## M13 steps (complete)

| Step | Feature                          | Status  |
| ---- | -------------------------------- | ------- |
| —    | FIRE calculator                  | ✅ Done |
| —    | HRA exemption calculator         | ✅ Done |
| —    | PPF maturity calculator          | ✅ Done |
| —    | NPS corpus calculator            | ✅ Done |
| —    | Step-up SIP calculator           | ✅ Done |
| —    | Old vs new tax regime comparison | ✅ Done |

---

## M14 (✅ Complete — Pankhuri)

Finance news (RSS — ET Markets, Mint, RBI, SEBI, headlines + link-out) + Contact/Feedback (mailto: deep-link)

---

## M15 steps

| Step   | Feature                                                                                        | Status                    |
| ------ | ---------------------------------------------------------------------------------------------- | ------------------------- |
| M15-1  | Modal centering — convert all bottom-sheet violations to centred modals                        | ✅ Done                   |
| M15-2  | Events system redesign — conditional delete, edit with unlink dialog, vacation guard           | ✅ Done                   |
| M15-3  | Privacy mode overhaul — open mode red theme, default mode setting, safe mode rethink           | ✅ Done                   |
| M15-4  | Home net worth fixes — credit card in liabilities, Liquid Funds bucket, Chip Insights moved    | ✅ Done                   |
| M15-5  | Market data strip — indices, metals, forex, user-customisable (6 tickers)                      | ✅ Done                   |
| M15-6  | Expenses improvements — transaction filters (incl. event filter), analytics redesign           | ✅ Done                   |
| M15-7  | Recurring transactions expansion — daily/weekly/bi-weekly/monthly/quarterly/half-yearly/yearly | ✅ Done                   |
| M15-8  | IPO Listed tab — FY year picker, search bar, listing gain %                                    | ✅ Done                   |
| M15-9  | Loans module redesign — My Loans + amortization + payoff planner + XLSX download, 2-tab layout | ✅ Done                   |
| M15-10 | EPF salary hike groups — per-employer hike timeline, corpus auto-calc, card redesign           | ✅ Done                   |
| M15-11 | Shared component extraction                                                                    | ➡️ Moved to Pre-Phase 1.5 |

---

## Pre-Phase 1.5 tracks

| Track    | Feature                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Status                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Track 5  | Documentation overhaul — CLAUDE.md, docs/, skills files                                                                                                                                                                                                                                                                                                                                                                                                       | ✅ Complete                  |
| Track 1A | Logic extraction — pure calculations out of component files into src/core/                                                                                                                                                                                                                                                                                                                                                                                    | ✅ Complete                  |
| Track 1B | Feature hooks — extract all state + data fetching into useXxx.ts per feature                                                                                                                                                                                                                                                                                                                                                                                  | ✅ Complete                  |
| Track 1C | Component library — create src/components/ui/ primitives (Card, Modal, Button, etc.)                                                                                                                                                                                                                                                                                                                                                                          | ✅ Complete                  |
| Track 1D | Component wiring — replace all inline patterns in now-thin feature pages                                                                                                                                                                                                                                                                                                                                                                                      | ✅ Complete                  |
| Track 1E | Design-system consolidation — semantic status tokens, Badge/ListRow/StatBox adoption, lib/date consolidation, card convergence onto shared primitives                                                                                                                                                                                                                                                                                                         | ✅ Complete                  |
| Track 2  | Identity, Account & Security — envelope encryption, onboarding v2 (DOB/employment/username + consent + back nav), change PIN/passphrase, PIN hardening (unified lockout, weak-PIN, once/day, opt-in wipe & lock-on-background), local identity + entitlement gate, full reset + config-gated cloud backup, DOB/employment downstream wiring, profile editor                                                                                                   | ✅ Complete                  |
| Track 3  | Expense category overhaul — in-picker category manager, visual icon picker (curated grid + searchable Tabler set), create/edit/rename/recolor, move transactions + delete-when-empty + category bulk, user-created parent groups (expense + income), anchored-popover `SelectInput`, transaction-list multi-select bulk edit (category / account+payment coupled) + delete                                                                                    | ✅ Complete                  |
| Track 4  | Activity log → **Timeline**: encrypted `activity_log` store, all-module logging via `useLoggedRepository`/`logActivity`, Undo toasts + Recently Deleted restore, day-grouped feed, beautiful diffs, per-item history, tracking heatmap + streaks, privacy receipt, On this day, Chip-narrated Money Story, full-screen shareable Weekly Wrapped, milestone moments + confetti, search + action filters, restore points (checkpoint + restore-deletions-since) | ✅ Complete                  |
| Track 6  | Expense productivity & power features — see ordered steps below                                                                                                                                                                                                                                                                                                                                                                                               | ✅ Complete (Step 3 skipped) |
| Track 7  | Tax & calculators in context — tax footprint + calculator re-homing                                                                                                                                                                                                                                                                                                                                                                                           | ✅ Complete                  |

### Track 6 — expense productivity & power features

Backlog captured 2026-06-25 after Track 3; scoped into ordered steps 2026-06-25. All Phase-1 feasible (local-first, no backend). AI auto-categorisation stays a Phase-2/Chip item; local merchant memory is its Phase-1 stepping stone. **Split transactions deferred to Phase 2** (needs a proper data-model design). The old Cash Flow view + the "safe to spend" idea are unified into a single **forecast engine** (Phase C).

Each step runs the verification gate (type-check → lint → test/PII gate → visual) and the doc-update checklist before it's marked done.

**Phase A — Input foundation**

1. ✅ **`AmountInput` primitive** — live Indian thousands grouping in-field, inline calculator (`120+45`), amount-in-words helper beneath (`1,00,000` → "One Lakh"). Adopted across all money inputs (`tests/lib/amountToWords.test.ts`).

**Phase B — Fast capture** 2. ✅ **Description-first reorder + local merchant memory** — Description is the first field in the Add form; encrypted `merchant_memory` store (schema v5) remembers last category/account/payment per merchant and offers a **tap-to-apply suggestion** beneath the field on the next match (nothing fills until tapped). One-time backfill from existing transaction history (`penny_merchant_memory_v1` flag) so it works on upgrade, not just for new saves. Pure helpers in `core/expenses/merchantMemory.ts` (`tests/expenses/merchantMemory.test.ts`). Local precursor to the Phase-2 AI categoriser. 3. ~~Natural-language quick-add~~ — **skipped** (2026-06-25, user decision). Merchant memory already covers fast re-entry; revisit only if a parser proves worth it.

**Phase C — Forecast engine** (absorbs the old Cash Flow view + "safe to spend") 4. ✅ **Net-balance forecast core** — `core/cashflow` projects total liquid balance forward: recurring income inflows alongside outflow events, running-balance series, lowest-balance warning against a **user-set buffer floor** (SettingsContext, default ₹5,000), and a **liquidity-based "safe to spend"** with **payday-aware framing**. Fixed the latent bug where recurring income was counted as an outflow. Shared `hooks/useForecast.ts` powers the rebuilt Cash Flow page (safe-to-spend hero, balance sparkline, breach banner, buffer editor, Week/Month/3M) and the safe-to-spend surfaces on Home + the Expenses header. Tests in `tests/cashflow/forecaster.test.ts`. 5. ✅ **Recurring-income detection** — `core/cashflow/incomeDetector.ts` mirrors the subscription detector; `features/cashflow/useIncomeSuggestions.ts` surfaces a confirmable card on the Cash Flow page. Confirming marks the latest matching income transaction recurring (so a payday appears in the forecast); dismissals are remembered locally. Tests in `tests/cashflow/incomeDetector.test.ts`. 6. ✅ **Recurring auto-post inbox** — `core/expenses/recurringDue.ts` (`computeDueRecurring` + `buildOccurrence`, tested) finds recurring series whose next occurrence is due; a "due to log" banner on the Transactions tab opens `RecurringInboxModal` to confirm (logs a real transaction via the normal save path) or skip. Closes the gap where recurring items were forecast-only. Wired through `useExpenses` (`dueRecurring`/`postRecurring`/`skipRecurring`). 7. ✅ **In-app reminders** — a header **bell + badge** opens a Reminders panel of near-term outflows: overdue recurring bills + anything due in the next 7 days (EMIs, subscriptions, insurance, bills), grouped by urgency. Per-item actions: snooze (1d/3d/1w), mark done, **Log** (recurring bills → reuses the Step 6 occurrence builder), **Cancel** (subscriptions). Pure core `core/reminders/reminders.ts` (`buildReminders`/`reminderCounts`, tested); `hooks/useReminders.ts` holds snooze/done state. **Decision (2026-06-26):** in-app only — no notification/permission APIs. Real OS/scheduled/push reminders need a backend or unsupported/experimental APIs → **deferred to Phase 2**.

**Phase D — Subscriptions upgrade** 8. ✅ **Subscriptions upgrade** — active subs show **next renewal** + **annualised cost** and are ordered by renewal (a renewal calendar); **monthly + yearly** totals; **manual add** form (`SubscriptionForm`, trial toggle); **zombie/unused nudge** banner (`isDormant`, not charged in 2+ cycles → annual saving); **price-hike detail** on detected subs (detector exposes first/latest amount → ₹old → ₹new, +X%). Renewal/trial _reminders_ already flow through the Step 7 bell. Pure helpers in `core/subscriptions/format.ts` (`toAnnual`/`nextRenewal`/`isDormant`, tested) + `detector.ts` price fields (tested).

**Phase E — Polish + UX** 9. ✅ **Tab reorder** — Analytics is now the first tab and the default landing for the Expenses module; order is Analytics · Transactions · Subscriptions · Budgets · IOU. (The add-transaction FAB lives on the Transactions tab.) 10. ✅ **Duplicate + templates + swipe** — Duplicate from the edit form (via a `prefill` path on `ExpenseForm`); **save-as-template** + one-tap template chips on the Transactions tab (encrypted `transaction_templates` store, schema v6); **swipe-left** rows (`SwipeableRow`, pointer-based with `touch-action: pan-y`) reveal Copy / Delete, tap to edit. Disabled in select mode. 11. ✅ **Cash-wallet reconcile + receipt attach** — cash/wallet accounts get a Reconcile action (`useAccounts.reconcileAccount` posts a balancing income/expense to match a counted balance; `ReconcileModal`). Transactions can carry a **receipt photo** — picked, compressed to a JPEG data URL (`lib/image.ts`), stored encrypted on the `Expense` (`receiptDataUrl`, never sent to AI); paperclip indicator on rows. 12. ✅ **Anomaly nudges + monthly recap** — `core/expenses/monthlyInsights.ts` (`computeAnomalies` + `monthlyRecap`, pure, event-exclusion injected, tested). Anomaly banners on the monthly Analytics view ("Dining 42% over your average", trailing-3-month avg pro-rated for the partial current month) + a recap card (spent, net, vs-last-month, transactions, top category).

**Explicitly out of Track 6:** split transactions (→ Phase 2), natural-language quick-add / Web Share Target / SMS-paste / voice quick-add / round-up-to-goal / PWA home-screen shortcut / merchant deep-dive / GST expense tagging (declined for now), AI auto-categorisation (→ Phase 2).

### Track 7 — tax & calculators in context ✅

Captured 2026-06-25, completed 2026-06-26. Spun out of Track 6 so the expense track stays coherent. All work lives on the Tax Awareness screen — nothing added to Expenses/CashFlow/Portfolio views. The Tax screen now has six tabs: **Footprint · Deductions · Capital Gains · Rates · Regime · HRA**.

1. ✅ **Tax footprint view** — reconciles **earn** (gross income → estimated direct tax via `compareTaxRegimes` → take-home; income derived from FY income transactions / annualised recurring income, with manual gross-income + direct-tax overrides), **spend** (total spend → **estimated indirect tax** broken down by regime and rate band), **invest** (unrealised capital-gains tax proxy — "if sold today"). Headline: "earned ₹X, kept ₹Y, paid ₹Z in tax — A% direct, B% indirect, C% on gains." Pure assembler `core/tax/footprint.ts`; `features/tax/footprint/`.
2. ✅ **Indirect-tax engine** — a time-versioned rate table (`core/tax/indirectTaxRates.ts`: GST 0/5/12/18/28 + fuel/alcohol/tobacco/vehicle/toll/exempt, each with `effectiveFrom`-dated entries and a markup/share basis), a category→band map (`categoryTaxMap.ts`), a description-keyword classifier (`taxBandClassifier.ts`) that catches **fuel hidden inside Transport**, **toll**, and **one-time vehicle/road-tax** purchases, and an aggregator (`indirectTax.ts`). Tax is backed out of tax-inclusive amounts at the rate in force on each transaction's date. Tested in `tests/tax/`.
3. ✅ **Sin Goods categories** — new `sin_goods` intent group + `cat-alcohol`/`cat-tobacco` default categories; additive non-destructive re-seed (`penny_cats_v3`).
4. ✅ **Rates awareness tab** — current GST slabs with examples, the non-GST levies explained, and a rate-change history — all driven by the same rate table.
5. ✅ **Re-homed calculators** — Old vs New Regime and HRA Exemption mounted as tabs inside the Tax screen; the existing data-driven Capital Gains tab stays; the searchable Calculators hub remains the global index. Principle: calculators live where you need them. Extends later to other domains (SIP/Lumpsum/FD near Portfolio, etc.).

**Estimates, not filings:** fuel/alcohol/tobacco/vehicle effective rates are approximations (vary by state/product); capital-gains tax is on unrealised gains; TDS is handled via the manual direct-tax correction rather than tracked.

#### Expanded vision (2026-06-26) — Tax Awareness as the "every tax you pay" hub

After v1, the screen was reframed into the one place to see every rupee of tax across earn/spend/save/invest/interest, across all years since 2017, with guidance on paying less — engaging, all in-screen. Built in six layers, reorganised into **four pillars** (Footprint · Explore · Optimize · Calc):

1. **Rate & regime history** — `indirectTaxRates.ts` now models **GST 2.0** (22 Sep 2025: 12% & 28% retired → 5%/18%, new **40%** de-merit slab, individual insurance exempted) as _dated_ changes; `regimeHistory.ts` holds per-FY direct-tax slabs/rebate/cess/surcharge **FY2017-18 → FY2026-27**; `compareTaxRegimes` is now FY-parameterised; `fy.ts` adds FY selection.
2. **Income waterfall** (`incomeWaterfall.ts`) — gross → EPF → prof-tax/LWF → income tax → in-hand → spend/savings, reconciling _"of what you didn't save, how much was direct/indirect tax vs real spending"_; rebuilt `FootprintTab` + `MoneyFlow` visual; all inputs overridable.
3. **Multi-FY switcher** — view any year back to FY2017-18; everything recomputes with that year's rates.
4. **Tax X-ray Explorer** (`taxScenarios.ts` + `explore/`) — fuel, dining, property, vehicle, gold/silver, equity (STT/stamp/DP/GST), FD interest — every embedded levy, live.
5. **Optimize** (`optimizer.ts`, `itrAdvisor.ts`) — regime recommendation, 80C/80D/NPS headroom, what-if simulator, 80G tiers, ITR-form helper; absorbs the Deductions tracker.
6. **Engagement** — shareable on-device **Tax Story** card (`share/TaxStoryModal`) + rotating **"Did you know?"** cards (`taxFacts.ts`).

Tests in `tests/tax/` cover the rate/regime history, FY helpers, income waterfall, scenarios, and optimizer/ITR logic.

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

---

## Phase 1.5 — Groups & Household OS

Planned 2026-06-26. Full plan with why/what/how, locked decisions, and detailed track designs:
[`docs/plans/phase-1.5-groups-household-os.md`](plans/phase-1.5-groups-household-os.md).

Headline decisions: **no phone+OTP** (on-device keypair + username + server-blind encrypted
blob, no PII); recovery/multi-device via username lookup + passphrase + QR device-pairing
(groups reappear with no rejoin); per-group AES-256 keys with one-time/TTL/max-uses invites;
Cloudflare Workers + D1 + R2 + KV backend (API Proxy ships first); **settle-up records a
ledger entry only — Penny never touches the money flow** (no stored VPA/QR).

| Track   | Feature                                                                                                                                                                                                     | Backend? | Status                                        |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------- |
| Track 1 | IOU pairwise-ledger redesign — Person entity, per-person running balance, partial settlement, expense-seeding, settle→income linkage, both-way edit re-sync, combined undo, multi-year demo seed            | No       | ✅ Complete (2026-06-27) — see notes below    |
| Track A | API Proxy worker — passthrough + tiered cache for Yahoo/MFAPI/NPS/IPO, market Cron-snapshot, permanent D1 cache + morning queue for vahandetails, CORS, N→1                                                 | Yes      | ✅ Complete (deployed 2026-07-01) — see notes |
| Track B | Client crypto additions — ECDSA/ECDH P-256 identity keypairs (lazy at claim), `device_keys`/`group_keys`/`sync_cursor` stores (Dexie v8), non-destructive `mergeBundle()` restore                           | No       | ✅ Complete (2026-07-01) — see notes below    |
| Track C | Auth/Identity worker + claim flow — `workers/auth/` (D1 users/devices), signed challenge/response auth, client `signedFetch`/`claim`, `sync` entitlement (dark). Model B: no personal blob/R2 on server     | Yes      | ✅ Complete (2026-07-01) — see notes below    |
| Track D | Automatic backup + multi-device sync — `core/sync/` provider abstraction (Drive live, iCloud dormant, OPFS daily floor), `backupEngine` + `mergeBundle`, destination chooser UI (Model B, user's own cloud) | Yes      | ✅ Complete (2026-07-01) — see notes below    |
| Track E | Groups worker + N-party split engine + group UX — invites/key-grants/events, context switcher, leave + key rotation                                                                                         | Yes      | 🚧 E1–E4 ✅, E5 core ✅, deployed; verify + E5 tail + Stage F pending |

**Track A — API Proxy Worker (2026-06-27):** first backend track; the deploy template for B–E.
A Cloudflare Worker (`workers/api-proxy/`) **transparently proxies + caches** the external finance
APIs — `GET /yf/* /mfapi/* /nps/* /ig/*` (KV TTLs mirroring the client) — fixing CORS and collapsing
N user calls into 1 upstream. `GET /vehicle/:regno` adds a **permanent D1 cache** + the **smart Vahan
queue**: on a cache miss outside the budget/window (or on failure) the reg is queued (deduped) and the
user gets a friendly _"by tomorrow morning"_ response; a **Cron** (06:00/08:30/11:30 IST) drains the
queue within a 900-call/day budget and the first success serves everyone — net upstream ≈ globally-new
regs/day. Per-IP KV rate-limit + `/health`. Clients route through `VITE_API_PROXY` (base-URL swap via
`core/net/apiBase.ts`); **unset = exactly today's direct behavior** (app stays fully usable with no
backend). Pure worker logic is unit-tested in the main gate (`tests/worker/`, 20 tests). The worker is
`wrangler dev`-ready; **actual Cloudflare deploy is user-run** — step-by-step in
[`workers/api-proxy/README.md`](../workers/api-proxy/README.md). Auth design **reconciled off
phone+OTP** in `docs/ROADMAP.md` (keypair + username + server-blind, no PII). Gate green (type-check,
lint, 268 tests, build). **Track A completed + deployed 2026-07-01.** Step 8: the **market ticker
strip** now serves from a **Cron-refreshed KV snapshot** (`GET /market`, edge-cached; client fetches
once via `MARKET_SNAPSHOT`, falls back to per-ticker with no backend) — global data is no longer a
per-user worker call. Step 9: **deployed** — KV `CACHE` + D1 `penny_proxy` (APAC) created, D1 migrated
(local + remote), `wrangler deploy` → **`penny-api-proxy.hesh.workers.dev`**, Cron `*/15` live; local +
live smoke tests passed (`/health`, `/market`, `/yf` MISS→HIT, `/mfapi`, `/vehicle` queued, CORS 204);
app baked with `VITE_API_PROXY`. This is the **deploy template for Tracks B–E**. **Deferred
(post-close):** merchant-dictionary endpoint (with the categorization track), edge Cache API layering.

**Track B — Client Crypto Additions (2026-07-01):** built the client-side cryptographic
primitives Tracks C–E depend on, entirely offline. `engine.ts` gains asymmetric device-identity
primitives — **ECDSA P-256** signing + **ECDH P-256** wrapping keypairs, `sign`/`verify`, JWK
export/import, and `deriveSharedWrappingKey` (ECDH → AES-GCM KEK). New `src/core/crypto/identityKeys.ts`
orchestrates the keypair lifecycle: `ensureIdentityKeys()` is **lazy + idempotent** (called at
claim in Track C — not wired into onboarding here), plus `getSigningKeypair`/`getWrappingKeypair`/
`getPublicJwks`. Three new DMK-encrypted stores (Dexie **v8**, in `BACKUP_STORES` so they ride
recovery): `device_keys` (id = kind), `group_keys` (composite `groupId:epoch` id — keeps rotation
history), `sync_cursor`. `backupManager.ts` adds non-destructive **`mergeBundle()`** (LWW on
`updatedAt`, preserves local `createdAt`, upsert-only) + the pure `shouldApplyIncoming()` helper;
destructive `importBackup` unchanged and `security` is excluded from merge. **Decision:** wrapping
keypair = ECDH P-256. **Limitation:** whole-blob merge can't observe remote deletes — delete
tombstones arrive with the activity-log delta sync in Track D. Gate green (type-check, lint,
**304 tests** incl. new `tests/crypto/identityKeys.test.ts` + `tests/backup/mergeBundle.test.ts`).
**Out of scope (deferred):** `'sync'` entitlement + `claim.ts` wiring (Track C); delta sync (Track D).
**Next: Track C** (Auth/Identity worker + claim flow).

**Track C — Auth/Identity Worker + Claim Flow (2026-07-01):** the first per-user backend, built from
the Track A template. New **`workers/auth/`** worker: D1 **`users` + `devices`** (identity metadata
only — **Model B: no `user_blobs`, no R2 personal blob, no server recover endpoint**; personal
recovery is the user's own Drive/iCloud). Endpoints `POST /username/check`, `POST /register`
(first-claim-wins username, idempotent per userId), `GET /challenge` (single-use KV nonce, 60s), and
**signed** `GET /whoami` + `POST /device`. Signed-request auth verifies an ECDSA P-256 signature over
`nonce\nMETHOD\npath\nsha256(body)` against the device's stored public key — **no passwords/passphrase
ever reach the server**; per-IP + per-username KV rate-limits. Pure logic in `src/lib/` (unit-tested).
Client **`src/core/identity/`**: `signedFetch` (the reusable authenticated-call choke point for D/E)
and `claim` (ensureIdentityKeys → username check → register → persist `Profile.deviceId`/username →
confirm via `/whoami`); `AUTH_BASE` via `VITE_AUTH_PROXY` (falls back to `${VITE_API_PROXY}/auth`).
New **`sync` entitlement is dark by default** (readiness-gated on Track D, not pricing) — the gated
"Account & Sync" claim UI in `ProfilePage` is invisible in normal builds. **Auth foundation only** —
QR/ECDH device-pairing UX deferred. Gate green (type-check, lint, **317 tests** incl.
`tests/worker/auth.test.ts` + `tests/identity/claim.test.ts`; `workers/auth` type-checks). Cloudflare
provisioning + deploy is **user-run** (see `workers/auth/README.md`). **Next: Track D** (Sync layer).

**Track D — Automatic Backup + Multi-Device Sync (2026-07-01):** reframed to Model B — backup/sync to
the user's **own cloud**, our servers store nothing (no `PUT /blob`). A **provider abstraction**
(`src/core/sync/providers/`): `googleDriveProvider` (live on web — silent token so no surprise popup,
`403 storageQuotaExceeded` → `QuotaExceededError`, `headRevisionId` change tag), `icloudProvider`
(**code-complete but dormant** — `isAvailable()` false until the Capacitor native shell provides the
bridge), and `localBackup` (OPFS dated snapshots — the **daily on-device floor** when no cloud is
chosen). `backupManager.openBundleWithDmk` opens a blob with the in-memory DMK (no passphrase) for
background pulls (`ForeignBlobError` for a different-vault blob). **`backupEngine`** (pure `decide.ts` +
`sync_cursor` `remoteTag`/`pushedAt`/`lastBackupAt`) pushes on debounced change (activity-log
`subscribeActivity`) + a daily timer, pulls periodically/on-foreground and `mergeBundle`s (LWW). Mounted
via `SyncProvider` in the unlocked `AppShell`; `useBackupStatus` drives an `AutoBackupCard` (destination
chooser + status + "Back up now" + benefit copy). **Whole-blob; pull-merge-before-push + LWW**
(trade-offs/alternatives recorded in the plan). **Gating:** free `cloud_backup` entitlement — no account
claim required; the on-device daily backup is always on. Gate green (type-check, lint, **339 tests**
incl. `tests/sync/*`, `tests/backup/openBundleWithDmk`, `tests/lib/debounce`). Cloud is **user-run**
(Drive needs `VITE_GOOGLE_CLIENT_ID` + CSP). **Deferred:** the native shell that activates iCloud;
encrypted delta; etag CAS. **Next: native bring-up (iCloud) / Track E** (Groups).

**Track E — Groups & Household OS · E1: worker + group crypto + client wiring (2026-07-01):** the third
per-user backend (`workers/groups/` — `penny-groups`), mirroring the Track C template. **Model B /
ciphertext-only:** D1 holds group metadata + membership + invites + wrapped key-grants + an event index
(five tables in `migrations/0001_init.sql`); event bodies live in **R2** as `gevent/{group_id}/{seq}` =
`AES-GCM(GroupKey_epoch, eventJson)`; the server never sees the group name (`enc_name`), member names,
financial data, or Group Keys. Routes (`src/index.ts`) — create/get group · invite create/redeem/revoke
(stores only `SHA-256(secret)`) · members + member changes (leave/remove/set_role) · key-grant relay +
fetch · event append→R2/fetch · settle-close/reopen — each **signed (challenge/response) + membership/
role-checked**. Signature verification reads the device signing key from the **auth D1 bound read-only
(`AUTH_DB`)**; the worker issues its own `/challenge` nonces in its own KV. Client: `core/groups/keys.ts`
(per-epoch Group-Key gen; `wrapGroupKeyFor`/`unwrapGroupKey` grants via Track B `deriveSharedWrappingKey`;
`encryptForGroup`/`decryptFromGroup`), `core/groups/groupsClient.ts` (endpoint wrappers), `GROUPS_BASE`
(`apiBase.ts`) + a `base` param on `signedFetch` so the choke point is reused. Local mirrors in **Dexie
v9** (`groups`/`group_members`/`group_events`) + repos + `BACKUP_STORES` (ride recovery). Tests:
`tests/worker/groups.test.ts` (roles/invites/visibility/signature) + `tests/groups/keys.test.ts` (grant +
event round-trips). Gate green (worker `type-check`, app `tsc`, lint, **355 tests**). **Not deployed**
(user-run — see `workers/groups/README.md`); behind the **`sync` entitlement (dark)**. **Next: E2**
(create/invite/join/membership UX).

**Track E — E3 split engine + E2 service layer (2026-07-02):** **E3** `src/core/groups/split.ts` (pure,
13 tests) — `computeShares` (equal/unequal/percent/shares, integer-paise so every split reconciles),
`foldGroupBalances` (event-sourced net per member; edits supersede, deletes tombstone, settlements move
money), `whoOwesWhom` (greedy minimal transfers). **E2** `src/core/groups/groupsService.ts` — orchestrates
worker + crypto + local mirror: `createGroup` (encrypt name → create → persist key + local group/owner),
`createInvite`/`buildJoinLink`/`parseJoinSecret` (secret only in the link; server stores only the hash),
`redeemInvite` (join + `awaitingKey`), `syncGroupKeys` (pull grants → unwrap → decrypt name),
`grantKeysToMembers`, `setMemberRole`/`leaveGroup`/`removeMemberAndRotate`/`rotateGroupKey`. New worker
endpoint `POST /group/:id/rotate` (epoch bump + re-encrypt name on leave). Group UX (create/join/composer/
dashboard) wires in E4 with the context switcher. Gate green (app+worker tsc, lint, **394 tests**).

**Track E — E4 sync engine (2026-07-02):** `src/core/groups/groupSync.ts` (4 tests) mirrors the shared
ledger between device and worker (ciphertext-only). `appendGroupEvent` (encrypt payload → local event →
push), `pushPending` (encrypt + append un-synced events, record server `seq`), `pullGroupEvents` (fetch
since cursor → decrypt with the epoch key → **last-writer-wins on `updatedAt`**, skips epochs lacking a
grant, tombstone-aware), `syncGroup`; `groupBalances` folds via `split.ts`, `groupFeed` lists live
shared-expenses/settlements. Cursor scope `group:${groupId}`. This completes the **data/logic spine** of
Track E (worker + crypto + service + split + sync all tested); the remaining E4 work is the **UI**
(context switcher, dashboard, composer, settle) + **E5**. Gate green (tsc, lint, **398 tests**).

**Track E — E4 UI complete (2026-07-02):** **E4b** `src/context/GroupContext.tsx` (active Personal|group
scope) + `ContextSwitcher` (header bar, gated on `hasEntitlement('sync')`) + `CreateGroupModal`/
`JoinGroupModal` + `GroupDashboard` (your balance, members, feed); Home re-scopes to the dashboard when a
group is active. **E4c** `SharedExpenseComposer` (Equal/Unequal/%/Shares with a live breakdown via
`split.ts` → `shared_expense` event), `SettleUpGroupModal` (→ `settlement`), `GroupMembersModal` (roles,
invite link, leave, settle & close/reopen); `groupsService.closeGroup`/`reopenGroup`. All behind the dark
`sync` entitlement. **Also fixed the production build** (`npm run build` = `tsc -b` with `erasableSyntaxOnly`,
which the dev `tsc --noEmit` doesn't enforce and which had been red since Track C/D): typed `req<T>` client
helper (was `.then(ok)` → `unknown`), error classes assign fields instead of param-property constructors
(`groupsClient`/`claim`/`sync providers`), `split` index guard. **Build green + lint + 398 tests.** Remaining:
**E5** (trip↔group link, per-item share, cash-negative guard, seed).

**Track E — E5 spine + cash guard + share-to-group + seed cash fix (2026-07-02):** **E5a** —
`balanceCalculator.projectedBalance`, `Expense`/`Goal.shareWith?`, `ActiveEvent.linkedGroupId?`,
`groupsService.shareExpenseToGroup` (equal-split mirror). **E5b** — **cash-negative guard**: a soft,
non-blocking warning banner in `ExpenseForm` when a **cash** account would drop below ₹0 (`accountBalances`
from `useExpenses` → `ExpensesPage` → `TransactionsSlice` → form); **"Share with a group"** picker in
`ExpenseForm` (expense type, sync-entitled) mirroring an equal-split `shared_expense` + recording
`shareWith` (add-time and edit-to-share). **E5c** — demo seed adds a monthly ATM withdrawal + pre-trip
withdrawal + higher cash opening so the Cash Wallet never goes negative (guarded by
`tests/db/seedCash.test.ts`; `seedDemoData` made `window`-safe). Remaining E5 — vacation→group link UI,
share-later row action, demo group fixtures — deferred to the **Stage-F bring-up** with the live worker.
Gate: build + lint + **404 tests**.

**Track E — Phase 1.5 enablement + deploy (2026-07-02):** auth + groups workers **deployed**
(`penny-auth`/`penny-groups` on `*.hesh.workers.dev`), reusing the api-proxy KV + dedicated D1s, R2
dropped (event ciphertext inline in D1). The `sync` entitlement is now the **env-driven Phase-1.5 launch
switch** — `hasEntitlement('sync')` reads `VITE_ENABLE_SYNC` (ship off, flip on per-deploy; no code
change). Groups additionally require a **claimed username**: the claim modal now makes the username
required (was optional — the Phase-1 artifact), `GroupContext` exposes `claimed`/`username`, and the
context switcher shows a **"Claim a username to use Groups"** CTA (→ Profile) until claimed; the
"Share with a group" entry is gated the same way. `.env.example` documents the flag; `.env.local`
(dev) + `.env.production` set it on. Gate: build (sync on) + worker type-check + lint + **404 tests**.

**Track E — Spending-clarity refinement (categories + analytics, 2026-07-02):** ahead of the group UX,
a taxonomy/analytics pass so "other" money never pollutes everyday spend. Added a **Legal** intent group
(11 categories: Advocate/Court/Stamp/Notary/Filing/Affidavit/Typing/Exemption/Legal-Transport/Legal-Food/
Misc) — seeded as defaults, back-filled to existing users via the additive `penny_cats_v4` seed, and wired
into the Tax Footprint bands (`categoryTaxMap.ts`: advocate/court/govt fees exempt, ancillary spend taxed).
Introduced a **daily-routine vs set-aside** split: `INTENT_GROUP_META` gains a `routine` flag +
`isRoutineGroup()`; the Analytics donut + "Daily-routine spending" list now show only routine groups, while
**Travel, Family & Giving, Legal, Financial, Other, and money lent (IOU-linked, any category)** are
summarised in a separate **"Set aside"** card (lending under a synthetic *Lending & IOU* bucket). Recap /
anomalies / velocity / prev-month all run on the routine basis; event-tagged vacation spend stays excluded
as before. Family support stays a plain category (`cat-family-support`) — **no IOU-model change** (user's
call). `useExpenses` exposes `iouLinkedTxnIds`; threaded through `ExpensesPage → AnalyticsSlice →
useExpenseAnalytics`. Also fixed a **duplicate-category** bug: the demo seed had minted a parallel
`demo-cat-*` set (Groceries/Rent/Transport/Medical/Investments/…) that shadowed the real defaults, so
the picker showed each staple twice. The seed now reuses the real defaults (`ALL_DEFAULT_CATEGORIES` +
a key→default-id map in `dedupeDemoCategories.ts`), and a one-time, once-flagged
(`penny_demo_cats_deduped`) migration heals already-seeded databases — remapping expenses/budgets/
templates/merchant-memory off the legacy ids and deleting the orphaned demo categories (meaning
preserved). Gate green (tsc, lint, **366 tests** incl. `tests/expenses/categoryTaxonomy` +
`tests/db/dedupeDemoCategories`).

Follow-up polish: the Analytics monthly view now leads with an **all-inclusive "Total spent this month"**
(`monthTotal` = daily-routine + set-aside + events) above the routine breakdown; **Travel** gains Trip
Prep / Trip Shopping / Fuel (fuel tax band) / Vehicle Service and **Education** gains Transportation Fee /
School Trip / Competition (additive seed bumped to `penny_cats_v5`, tax bands wired); and two default
icons that were blank in the shipped webfont — **Food on Trip** (`ti-fork`→`ti-tools-kitchen-2`) and
**Savings Transfer** (`ti-piggy-bank`→`ti-pig-money`) — are fixed, guarded by a webfont-icon regression
test. Because definition edits don't reach already-seeded records, two once-flagged migrations were added
in `dedupeDemoCategories.ts`: `repairCategoryIcons` (patches webfont-missing icons in place) and
`reconcileDefaultCategories` (applies name/group changes only when the stored value still matches the old
default, so user edits aren't clobbered).

Category taxonomy round 2 (2026-07-02): **Daily Living** gains everyday **Fuel** + **Salon & Grooming**;
the travel Fuel is renamed **Trip Fuel** (kept); **Home & Utilities** gains **Home Services**; a new
set-aside **Renovation** intent group ships 8 categories (Materials, Labour & Contractor, Furniture,
Fixtures & Fittings, Painting, Interior & Design, Appliances, Other); **Education** gains Transportation
Fee / School Trip / Competition; **Income** splits **Dividends** and **Interest** and adds **Capital
Gains**, **Bonus & Incentive**, **Reimbursements**. Tax-footprint bands wired for all new expense
categories (Fuel/Trip Fuel → fuel band; Salon/Home Services/Renovation → GST 18%); additive seed bumped
to `penny_cats_v6`; migration-map aliases added. Gate green (tsc, lint, **377 tests**).

**Track 1.1 — IOU ↔ transactions + net worth (2026-06-26):** a lend/borrow is now one event with two
views. **Lent = an Expense** (money out) + "they owe you"; **Borrowed = an Income** (money in) + "you
owe them" — fixing the earlier bug where Borrowed sat on the Expense form. From the IOU screen, creating
an entry or settling **asks (default ON, account pre-filled) to record the matching transaction**;
the two are linked by `linkedTxnId` and **deleting either side cascades**. **Net worth** now includes
net IOU (lent = receivable asset, borrowed = payable liability), offsetting the cash movement so net
worth stays correct end-to-end. Settle-up still stores no UPI/QR.

**Track 1.1 follow-ups landed (2026-06-27):**

- **Live cross-instance refresh** — IOU writes broadcast `penny:txn-changed` (`hooks/useTxnRefresh`); `useExpenses`/`useForecast`/`useHome`/`useAccounts` reload, so the IOU-created transaction, account balances, net worth, and safe-to-spend all update **live** (previously only on navigation).
- **Edit/remove IOU from the transaction** — the Lent/Borrowed control now appears in **Edit Expense/Income** too, prefilled from the linked entry; toggling off + save removes it; editing re-syncs it (`iouLinkByTxn` from `useExpenses` → `ExpenseForm.linkedIou`; reconcile on every expense/income save).
- **Net-worth itemisation** — `NetWorthCard` shows net IOU as an **"Owed to You"** asset row (net lent) or **"Owed to others"** liability row (net borrowed), both tapping to `/app/iou`.
- **Same-day ordering** — `Expense.date`/`LedgerEntry.date` now carry the **time-of-day** (`lib/date.dateInputToEpoch`); lists sort by full timestamp so newest-entered shows on top.

**UI work alongside (2026-06-27):** Add/Edit Transaction **redesign** (hero amount in type colour, coloured type tabs, category+date chips, account & Paid-via icon rows, circular Tags/Receipt/Lent/Repeat, validation highlighting; `AmountInput` gained a `hero` variant); **Transactions timeline list** (`TransactionsTab` — uniform `bg-surface-3`, continuous rail through right-shifted day headers, category dots; `SwipeableRow` only mounts actions while swiping); **Budgets** moved from a tab to a 🎯 toolbar modal; **Transactions** is now the default Expenses tab; **Modal** got a full-screen backdrop + border/shadow.

**Track 1 closed (2026-06-27):** the three deferred follow-ups landed, fully closing Track 1.

- **Both-way edit re-sync** — editing a manual IOU entry (amount / date / account / lent⇄borrowed) now re-syncs its linked transaction; toggling the link off deletes it. New pure helper `core/iou/expenseLink.reconcileLinkedTxn` (mirror of `reconcileExpenseLink`); manual entries are now editable in `PersonLedgerView`, expense-seeded ones still owned by their expense. `EntryForm` shows the account/record control on edit (prefilled from the linked txn).
- **Combined Undo** — `ActivityLog` gained an optional `cascade` field (`[{entityType, record}]`); `restoreActivity` restores it alongside the primary snapshot. Deleting an expense now snapshots its cascade-deleted IOU entries, and deleting a linked IOU entry snapshots its cascade-deleted transaction — a single Undo restores both atomically. `useIou` subscribes to `penny:txn-changed` so the IOU view stays live.
- **Full multi-year (Jan 2017 → today) demo seed** — `seedDemoData` now seeds ~9.5 years of continuous history: monthly salary stepping through a career arc (`SALARY_ARC`/`salaryFor`, aligned to the Wipro→Infosys→TCS EPF history) with April/July hikes + annual Diwali bonuses; recurring rent/SIP/bills/staples every month (older months scaled back ~5%/yr via `grow()`, latest 12 fully detailed); a deeper IOU ledger with multi-year settled history. Deterministic; ends at the live ₹120k run-rate.
- New unit tests: `reconcileLinkedTxn` (create/update/delete, direction-flip, settle→txn), net-IOU-in-net-worth, and an `activityLog` cascade-restore test.

Loans still appear in normal spend/income analytics (by design — no separate category). Gate green (type-check, lint, 245 tests, build).

**Track 1 status notes (2026-06-26):** shipped — new `persons` + `ledger_entries` stores (schema v7),
pure core (`core/iou/`: ledger math, expense-link reconcile, AI ordinal labels, legacy migration),
`useIou` rewrite with `penny_iou_v2` post-unlock backfill, full UI (person list → per-person ledger,
add/edit, partial settle-up with optional settle→income, person edit), expense→IOU seeding in the Add
form (create + delete-cascade), backup wiring, and a refreshed IOU demo seed. Unit tests + full gate
green (type-check, lint, 235 tests, build). **Deferred follow-ups (a)–(c) all landed 2026-06-27 — see
"Track 1 closed" above.**

Adjacent (groups-independent): deterministic **rules-based categorization engine** (on-device,
reusing `merchant_memory`) + Worker-served merchant dictionary, the foundation for future
text/voice quick-add — AI is a fallback, not the primary path. See the plan.

**Track E — E5 tail + phantom-claim fix (2026-07-04):** E5 tail landed (vacation→group link in
`EventsModal`, share-later `ShareToGroupModal` swipe action, demo group fixtures `seedGroupFixtures.ts`)
plus a mockup-fidelity realignment (composer reuses the expense `CategoryPickerModal`; `accountBridge.ts`
records the real personal txn on cash-out/settle; Home Groups card `HomeGroupsCard` + `useGroupSummaries`).
**Phantom-claim bug fixed (Track F/F1):** `seedGroupFixtures` had stamped a fake `deviceId`/`username` so
`claimed` read true without a server registration or device keys — Create/Join surfaced but every signed
call failed. Fix: the demo no longer fakes a claim (so `deviceId` is set only by a real `claimAccount()`),
and `HomeGroupsCard` surfaces groups for *viewing* when unclaimed with New/Join → "Claim to create". Groups
are feature-complete + deployed; end-to-end live verification still pending.

**Track F — Multi-Device, Sync & Recovery (2026-07-04/05):** the recovery model, built on the realization
that uninstall/reinstall (and iOS's ~7-day storage eviction) drop normal users into an orphaned-handle
state, so recovery is load-bearing. Plan + rationale: [`docs/plans/phase-1.5-track-F-multi-device-recovery.md`](plans/phase-1.5-track-F-multi-device-recovery.md).
Three recovery surfaces, one shared key-grant mechanism:

- **F1 — phantom-claim fix** ✅ (see above).
- **F2 — recovery hardening + restore-on-reinstall + account-start flow** ✅: deregister-failure surfacing
  on erase (warns before orphaning a claimed handle); **mandatory username at onboarding** (sync builds) +
  live availability check; **claim at onboarding** (`SetupCredentialsScreen` calls `claimAccount`);
  post-claim backup nudge; **account-start flow** — Preview → `AccountStartScreen` (Screen A: Start
  fresh / Restore / Reclaim cards) → `AccountRecoveryScreen` (Screen B: segmented new/restore/reclaim
  tabs); restore-on-reinstall via `importBackup`; **handle-recovery** (`ChooseHandleScreen`) driven by
  `IdentityReconciler` (in `AuthGuard`) — post-restore `/whoami` → re-register → pick a new handle if the
  old one was taken. (Consolidated + removed the interim `RestoreAccountScreen`/`ReclaimAccountScreen`.)
- **F3 — passphrase reclaim (Ed25519 challenge, scheme A over textbook SRP)** ✅: auth worker recovery
  verifier (public Ed25519 key + salt, migration `0003_recovery.sql`) + `POST /recover/start` +
  `POST /recover/finish`; client `src/core/identity/recovery.ts` (deterministic keypair from
  `PBKDF2(passphrase, salt)`) + `reclaimAccount()`; verifier derived at `initialize()`/`changePassphrase`
  and uploaded at claim. Server stores only a public key (DB-leak/replay safe). **Auth worker needs
  redeploy + migration `0003` before live verification.** Key principle captured: SRP is *authentication*,
  not *decryption* — it recovers identity + group membership, never encryption keys (those need a backup or
  a co-member re-grant).
- **F4 device pairing / QR = next** (discuss before building; server `/device` + ECDH grants exist).
  **Deferred:** group recovery after reclaim (list-my-groups + re-grant), groups-side account-delete cleanup.

Also fixed a claim-reactivity bug (`claimAccount`/`reclaimAccount` emit `penny-profile-updated` so
`GroupContext` refreshes) and a backup-export stack overflow (chunked base64 in `backupManager`).

**Adjacent UI/data fixes (2026-07-04/05):** Profile **Life & Household** redesigned as compact inline rows
(`LifeRow`/`Seg`); **Loans** gained per-loan edit + delete (`useLoans.deleteLiability`, `AddLoanModal`
edit mode); **IOU** delete now soft-archives with an **Archived** section (view/restore/purge) and totals +
net worth **exclude archived persons**; **Net Worth** IOU tap routes to the Expenses IOU tab (standalone
`/app/iou` + `IouPage` removed); **Settings** "Clear sample data" marker persisted on the profile
(`demoSeeded`) so it survives restore; bulk transaction delete fixed (correct "undo" copy + cascade linked
IOU ledger entries); **Cash Flow** forecaster only projects **confirmed** subscriptions. Gate green across
these (build + lint + **408 tests**).
