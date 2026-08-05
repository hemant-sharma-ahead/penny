# Penny — Roadmap

Merged from three previously separate, overlapping docs (`ROADMAP.md`, `MILESTONES.md`,
`WHATS_NEXT.md`) into one file with three clearly labeled parts, so there's one place to
check "what's shipped," "what's decided/in progress," and "what's a future idea" instead of
three files that had started drifting apart. Current per-module mobile-parity status lives
in [`docs/MOBILE_PARITY.md`](MOBILE_PARITY.md), not here.

- **[Part 1 — Shipped](#part-1--shipped)**: complete milestone history, M0 through present.
- **[Part 2 — Decided / In Progress](#part-2--decided--in-progress)**: phase scope +
  architectural decisions for Phase 1.5, 2, and 3.
- **[Part 3 — Future ideas](#part-3--future-ideas)**: a thinking space, not a status
  tracker — not all of these will be built.

---

# Part 1 — Shipped

Complete record of every milestone, step, and status from M0 to present.

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

The detailed step-by-step breakdown for M5-M15 (all ✅ complete) has been trimmed from
this doc — it carried no ongoing information beyond "yes, this shipped," which the
one-line summary table above already states. The two items that were genuinely
deferred/skipped rather than done (Chip mock chat UI, desktop/laptop layout, CAS/EPFO PDF
import, Watchlist) are captured in the "Deferred from Phase 1" table further down, not
lost. Full step-by-step history remains in git log / commit messages for that period if
ever needed.

## Pre-Phase 1.5 tracks

| Track    | Feature                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Status                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
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

This LOC-based rationale and the resulting target module structure/verification gate
have moved to `docs/ARCHITECTURE.md`'s decision log (see "Decision: three-layer feature
module split") and `.claude/commands/penny-feature-module.md` respectively, rather than
being duplicated here.

## Phase 1.5 — Groups & Household OS

Planned 2026-06-26. Full plan with why/what/how, locked decisions, and detailed track designs:
[`docs/plans/phase-1.5-groups-household-os.md`](plans/phase-1.5-groups-household-os.md).

Headline decisions: **no phone+OTP** (on-device keypair + username + server-blind encrypted
blob, no PII); recovery/multi-device via username lookup + passphrase + QR device-pairing
(groups reappear with no rejoin); per-group AES-256 keys with one-time/TTL/max-uses invites;
Cloudflare Workers + D1 + R2 + KV backend (API Proxy ships first); **settle-up records a
ledger entry only — Penny never touches the money flow** (no stored VPA/QR).

| Track   | Feature                                                                                                                                                                                                     | Backend? | Status                                        |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------- |
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
phone+OTP** (keypair + username + server-blind, no PII). Gate green (type-check,
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
provisioning + deploy is **user-run** (see `workers/auth/README.md`).

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
encrypted delta; etag CAS.

**Track D update (2026-07-27):** consolidated Backup & Restore from 5 cards to 3 (Automatic backup /
Restore / Reset) — Export and the standalone Drive card were duplicating what Automatic Backup's tabs
already did (see `docs/DESIGN_GUIDELINES.md` §1). Drive/iCloud tabs are now always clickable (each shows
its own info when selected; only the tab-specific "Back up now" disables if that provider isn't
available yet). Shipped real native Google Drive backup (`@react-native-google-signin/google-signin` +
Drive v3 REST, mirroring the web provider) and a real native on-device daily floor
(`localBackup.native.ts`, `expo-file-system`'s persistent storage — previously a no-op, since OPFS
doesn't exist on RN). Also fixed a real restore bug: a stale PIN lockout carried over from the backup's
source device could block the (correct) original PIN after restore — `importBackup()` now resets
`pinAttempts`/`lockedUntil`/etc. while leaving the key-wrapping material untouched. **Blocked on a user
action:** native Google Drive backup can't be tested end-to-end until the Google Cloud Console setup is
done (Android OAuth client keyed to this app's package + SHA-1, plus a Web OAuth client — full steps in
`docs/features/backup.md`'s "Enabling Google Drive backup"); `app.json`'s `extra.googleWebClientId` and
`apps/web-react`'s `VITE_GOOGLE_CLIENT_ID` both still need real values. Until then Drive stays disabled
(honestly, not faked) on every platform.

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
(user-run — see `workers/groups/README.md`); behind the **`sync` entitlement (dark)**.

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
(`groupsClient`/`claim`/`sync providers`), `split` index guard. **Build green + lint + 398 tests.**

**Track E — E5 spine + cash guard + share-to-group + seed cash fix (2026-07-02):** **E5a** —
`balanceCalculator.projectedBalance`, `Expense`/`Goal.shareWith?`, `ActiveEvent.linkedGroupId?`,
`groupsService.shareExpenseToGroup` (equal-split mirror). **E5b** — **cash-negative guard**: a soft,
non-blocking warning banner in `ExpenseForm` when a **cash** account would drop below ₹0 (`accountBalances`
from `useExpenses` → `ExpensesPage` → `TransactionsSlice` → form); **"Share with a group"** picker in
`ExpenseForm` (expense type, sync-entitled) mirroring an equal-split `shared_expense` + recording
`shareWith` (add-time and edit-to-share). **E5c** — demo seed adds a monthly ATM withdrawal + pre-trip
withdrawal + higher cash opening so the Cash Wallet never goes negative (guarded by
`tests/db/seedCash.test.ts`; `seedDemoData` made `window`-safe). Gate: build + lint + **404 tests**.

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

For the mobile migration's own tech-stack rationale and porting lessons, see
[`docs/plans/mobile-migration.md`](plans/mobile-migration.md) — its narrative progress log has been
distilled into a migration playbook there rather than duplicated here.

---

# Part 2 — Decided / In Progress

Records the product roadmap for Phase 1.5, 2, and 3, along with the key architectural
decisions made for each phase, so they don't need to be re-derived in future sessions.

> **Phase 1.5 detailed plan:** [`docs/plans/phase-1.5-groups-household-os.md`](plans/phase-1.5-groups-household-os.md);
> Track A detail: [`docs/plans/phase-1.5-track-A-api-proxy.md`](plans/phase-1.5-track-A-api-proxy.md).
> **Auth reconciled (Track A, 2026-06-27):** phone + OTP is **dropped**. Identity is an on-device
> keypair + an **optional** self-chosen `username` + the existing `Profile.userId`; **no phone, no
> OTP, no PII**.
> **Backup reconciled to Model B (2026-06-27, canonical [`docs/BACKEND_STRATEGY.md`](BACKEND_STRATEGY.md) §5):**
> personal backup/recovery lives in the **user's own Google Drive/iCloud only — our servers store
> nothing personal**; the server keeps only tiny identity + group-membership metadata and per-group
> ciphertext. This supersedes the earlier "server-blind personal blob in our R2" (Model A) wording;
> some Track C/D architecture sub-sections below may still show the older phrasing (the parent plan +
> BACKEND_STRATEGY are authoritative).

## Phase boundaries

| Phase            | Scope                                                                                                                                     | Status                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 1 (M0–M15) | Full financial life tracking, zero paid APIs, zero backend, local-first encrypted                                                         | ✅ Complete                                                                                                                                      |
| Pre-Phase 1.5    | Documentation overhaul, component extraction, onboarding v2, category overhaul, activity log, expense power features, tax-in-context      | ✅ Complete                                                                                                                                      |
| Phase 1.5        | Groups & Household OS — shared expenses, family vaults, joint goals, household net worth ([plan](plans/phase-1.5-groups-household-os.md)) | 🚧 In progress (Tracks 1 ✅, A ✅, B ✅, C ✅, D ✅, E ✅ deployed; **Track F** 🚧 F1–F3 ✅, F4 next). Remaining: Track E live verification + F4 + Stage F |
| Mobile migration (React Native/Expo) | Port `apps/web-react` to `apps/mobile`, folded in from the original "Phase 2 mobile apps" sketch since it's now active, not future | 🚧 In progress — see [`docs/plans/mobile-migration.md`](plans/mobile-migration.md) + [`docs/MOBILE_PARITY.md`](MOBILE_PARITY.md) |
| Phase 2          | Chip real AI, AI auto-categorisation, export PDF/HTML, cloud sync, desktop layout                                            | ⏳ Future                                                                                                                                        |
| Phase 3          | Regional languages, crypto/Web3, international equities, advanced AI advisor                                                              | ⏳ Future                                                                                                                                        |

## Pre-Phase 1.5 — Track 2: Identity, Account & Security

Track 2 expanded from "collect DOB/employment/username" into a Phase-1 **Identity, Account & Security** program. Decisions finalized 2026-06-24.

### Encryption model — envelope encryption (supersedes passphrase-derived MK)

**Problem with the original model:** the Master Key was derived _directly_ from the passphrase, so the data key _was_ the passphrase. Changing the passphrase changed the MK → every record had to be re-encrypted (slow, corruption risk on interrupt). That's why passphrase change was never built.

**Decision:** adopt **envelope encryption**.

- One **random Data Master Key (DMK)** encrypts all data and never changes.
- The DMK is wrapped _independently_ by a passphrase-derived KEK and a PIN-derived KEK (and, later, biometric/device keys). Any factor unwraps the same DMK.
- **Change passphrase / PIN = re-wrap the DMK only** — instant, no data re-encryption. The old wrapping is deleted, so the old secret stops working.
- **Changing the passphrase requires the current passphrase** (defeats a found-unlocked-phone attacker who lacks it).
- DMK is random (leaks nothing about a chosen secret) and held **non-extractable** in memory only while unlocked. This is the standard privacy-first pattern (1Password, Apple, WhatsApp). No key escrow — passphrase lost = data lost.
- **Rejected** full re-encryption on passphrase change: true key-rotation buys ~nothing in a local-only app (a DMK leak implies device compromise, where plaintext is already exposed) and can't touch already-exported backups.
- **Migration:** the existing passphrase-derived MK simply _becomes_ the opaque DMK (data untouched); the passphrase-wrapping is added lazily when the passphrase is next available.

**In plain terms (the locker analogy).** Your data lives in a _locker_ opened by one _metal key_ — that key is the DMK, stamped at random in the factory (not cut from your passphrase). You don't carry the metal key; you drop a copy into two small _combo boxes_ on the wall — one combo is your passphrase, the other your PIN. Dial either combo → get the key → open the locker.

- **Old (passphrase-derived) model:** the passphrase was the metal key's _shape_. A new passphrase = a new key shape = a new lock on the locker = you must haul every item out and re-lock it (slow; half-done if interrupted = corrupted).
- **Envelope model:** the metal key never changes. Changing your passphrase just _re-sets the combo on one box_ — the locker and its contents are untouched. Instant. The old combo opens nothing.

**Why envelope, side by side:**

|                                         | Passphrase-derived MK (rejected) | Envelope / random DMK (chosen)                                                                                                                |
| --------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Change passphrase                       | Re-encrypt **every** record      | **Re-wrap** the key — data untouched                                                                                                          |
| Speed / risk                            | Slow; corruption if interrupted  | Instant; atomic                                                                                                                               |
| Add biometric later                     | Awkward                          | Just another wrapping slot                                                                                                                    |
| Cloud backup across a passphrase change | Breaks / re-keys                 | Works unchanged                                                                                                                               |
| Key rotation if DMK leaks               | Possible (re-encrypt)            | Not possible without re-encrypt — **but** a local DMK leak means the device is already compromised (plaintext exposed), so this buys ~nothing |
| Privacy posture                         | Key tied to a chosen secret      | Random key reveals nothing; non-extractable; no escrow                                                                                        |

Net: envelope wins on every axis that matters for a local-first app; the one thing it gives up (data-key rotation) is near-worthless here. This is also the industry-standard pattern (1Password, Apple Data Protection, WhatsApp backups).

### Identity — local now, server auth later

- Create `userId` + `username` + an **on-device keypair** locally at onboarding. **No backend / no SMS in Phase 1.**
- Phone + OTP server registration becomes an **optional Phase 1.5 upgrade** that "claims" the existing local identity (for cloud sync / groups) — same flow, **no data migration**.
- **Rejected:** phone+OTP from the start (forces the Auth Worker + paid SMS now, reframes the privacy promise); pure-local-no-identity (guarantees a 1.5 migration).

**Username uniqueness — the local-vs-server collision problem.** A locally chosen username is _not_ globally reserved (no backend in Phase 1), so a fully-local user and a server-registered user can both hold "rohan". Resolution:

- **`userId` (UUID) is the permanent anchor**, not the username. It's collision-free by construction and is what the keypair, future group memberships, IOU links, and the eventual server account all reference. **No local or shared data ever keys off the username string** — so the username can change with zero breakage.
- **The local username is explicitly _provisional_ — a wished-for label, not a reservation.** UI copy says so (e.g. "you'll confirm this when you set up sharing"). Username is **optional** in Phase 1, which shrinks the collision surface further.
- **At "claim your account" (Phase 1.5):** run the server availability check. Free → claim it (atomic, enforced by the D1 `username_idx` unique constraint, first-claim-wins for races). Taken → show suggestions and let the user pick another. Because nothing references the string, this is a painless relabel — no migration, no broken references.
- Optional nicety once the availability endpoint exists: a soft online check during onboarding to warn early; in pure-offline Phase 1 we simply set expectations in copy.

### Pulled into Phase 1 (from later phases)

| Feature                        | Was         | Now         | Notes                                                                                                                                                                                 |
| ------------------------------- | ----------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change Passphrase / Change PIN | "planned"   | **Phase 1** | Trivial under envelope (re-wrap). Settings buttons already exist as no-ops.                                                                                                           |
| Cloud backup                   | Phase 1.5/2 | **Phase 1** | Extends the existing `.penny` backup; web = user's own Google Drive (OAuth), we store nothing; iCloud waits for native. Routed through the entitlement gate so it can be gated later. |
| Re-auth to enter Open mode     | —           | **Phase 1** | PIN required to reveal real amounts.                                                                                                                                                  |

### Pricing readiness (no backend required)

Add an **`entitlement` gate that currently always returns pro/true**; route would-be-paid features (e.g. cloud backup) through it. Turning pricing on later = swap the entitlement source + add a "choose plan" step, with zero feature-code changes. Mechanism later: **store receipts** (native) / **offline-verifiable signed license tokens** (web) — neither requires us to store user data. Local `plan` / `licenseToken` concept stored on-device.

### Onboarding v2 flow

Splash → Privacy Promise (+ **Terms/Privacy consent**) → Privacy Demo → Meet Chip → **Simulated Dashboard (preview)** → **"Let us know you"** (one screen: full name [= display name], username, DOB, employment) → **Setup Credentials** (passphrase + 6-digit PIN) → [init encryption → write profile + identity → seed demo] → app. Personal info comes after the preview; credentials last so the DMK exists right before the write.

### Dropped

- **Biometric** — deferred until React Native (Phase 2); WebAuthn-PRF on PWA is patchy. Envelope leaves a wrapping slot to add it later.
- **Recovery key** — a shown-once unstored key is just another passphrase-equivalent; cloud backup is the real recovery path.
- **i18n** — English only.

### DOB privacy

Stored encrypted; only a **5-year age band** ever leaves to the AI (Phase 2). Two pure helpers: `deriveAge(dob)` (exact — FIRE/tax/EPF/NPS) and `deriveAgeBand(dob)` (band — AI). The band helper is the guardrail against wiring raw DOB into AI context. Downstream wiring in scope: FIRE age auto-fill, tax slab by age (senior 60+, super-senior 80+), EPF tab visibility + deductions by employment type, health benchmarks by employment type.

## Phase 1.5 — Groups & Household OS

### What it does

Enables multiple users to share financial data across households, families, and shared living arrangements. A user can be a member of multiple groups simultaneously.

### Group types

| Group type        | Description                  | Features                                                                                     |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Couple/Spouse** | Two-person household         | Shared expenses, joint goals, joint budgets, optional net worth visibility, merged dashboard |
| **Family**        | Multi-generational household | Shared expenses, joint goals, joint budgets, optional net worth visibility, merged dashboard |
| **Flatmates**     | Shared accommodation         | Shared expenses + splitting only                                                             |
| **Custom**        | User-defined                 | Owner configures which features are enabled                                                  |

**Key principle:** A user's personal data always stays personal. Only data explicitly posted to a group crosses the boundary. A user can be in multiple groups simultaneously — each group has completely independent data and encryption.

### Group dashboard & navigation

The **Home screen** gains a **context switcher** — a dropdown at the top that lets users switch between "Personal" and each group they belong to. No new bottom nav tab — the existing 5-tab structure is preserved.

When a group is selected:

- **Couple/Family:** Shows merged net worth (if both members enabled it), joint goals progress, shared expenses summary, joint budgets
- **Flatmates:** Shows shared expenses, who owes whom, shared bills
- Personal home screen remains unchanged when "Personal" is selected

### Group membership & roles

- **Owner** — created the group, can invite/remove members, can delete group
- **Admin** — can invite/remove members
- **Member** — can add shared expenses, view group data

### Leaving a group

1. User triggers "Leave group"
2. App shows **settlement summary**: "You are owed ₹2,340 by Rohan. You owe Priya ₹800. Settle up before leaving?"
3. After settlement (or user skips): local copy of group data is **frozen** (no more sync)
4. User retains **read-only archived** view of all group activity up to their leave date
5. User can export the archive as a local file or delete it entirely
6. Server is notified to revoke access — no future group data is sent to this user

### Personal IOU → Group linking

When a group is created with a named person that already exists in personal IOUs, Chip prompts: "Link Priya's existing IOUs to this group?" Migration is opt-in.

## Phase 1.5 — Backend Architecture

> **Scale + storage strategy:** [`docs/BACKEND_STRATEGY.md`](BACKEND_STRATEGY.md) — the 10M-user cost
> model, the global-data-via-CDN vs per-user-via-Worker rule, the Capacitor deployment model, and the
> proposal to keep **personal data/receipts in the user's own Drive/iCloud (store nothing on our
> servers)**. Read it before building Tracks C–E.

### Platform decision: Cloudflare Workers + D1 + KV

**Chosen over Supabase because:**

- Already using Cloudflare Pages for hosting — zero new vendor
- D1 (SQLite at edge) is sufficient for identity + group membership (not financial data)
- KV covers API response caching (market data, MF NAVs)
- Workers solve CORS + rate limiting for external APIs
- Edge-deployed globally — fast for Indian users
- Free tier: 100K Worker requests/day, 5M KV reads/day, D1 generous free tier

### Four Workers (deployed independently)

Each worker also has its own README under `workers/<name>/README.md` with local-dev/deploy
specifics — this table is the architectural summary, not the operational how-to.

| Worker                | Ships in             | Purpose                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API Proxy**         | Phase 1.5 Track A ✅ | Passthrough + tiered cache for Yahoo / MFAPI / NPS / IPO, market Cron-snapshot, permanent D1 cache & morning queue for vahandetails — fixes CORS, collapses N→1 (`workers/api-proxy/`). **Deployed 2026-07-01** → `penny-api-proxy.hesh.workers.dev`. See also [`docs/EXTERNAL_APIS.md`](EXTERNAL_APIS.md) for the registry of what it proxies.                                                                                                                 |
| **Auth/Identity** ✅  | Phase 1.5 Track C + F | **Built (`workers/auth/`)** — keypair challenge/response signed-request auth, username availability + registration, `users`+`devices` public-key storage; client `signedFetch` + `claim`. **Track F adds passphrase recovery:** a per-account Ed25519 recovery verifier (public key + salt, migration `0003`) + `POST /recover/start`/`/recover/finish` for username+passphrase reclaim. **Personal backup/recovery is the user's own Drive/iCloud (Model B) — no personal blob on our server** (**no phone, no OTP**). Auth worker needs redeploy + migration `0003` for the recovery endpoints |
| **Groups** 🚧 deployed | Phase 1.5 Track E    | Group creation, member management, encrypted shared event ledger, key exchange + rotation. **E1–E5 ✅ + E5 tail ✅, workers deployed** — ciphertext-only relay (event bodies inline in D1, no R2), signed + membership/role-checked routes, per-epoch Group Key with ECDH-wrapped grants, split engine + sync engine + full group UX (switcher/dashboard/composer/settle/members), cash guard, share-with-group, vacation→group link, share-later, demo fixtures. `sync` env-gated; Groups need a claimed username. Pending: **end-to-end live verification** + Stage F                            |
| **Multi-device & recovery** 🚧 | Phase 1.5 Track F | Recovery model on top of C/D/E ([plan](plans/phase-1.5-track-F-multi-device-recovery.md)). **F1 ✅** phantom-claim fix; **F2 ✅** recovery hardening + restore-on-reinstall + account-start flow (Screen A cards → Screen B tabs → handle-recovery; mandatory username + claim at onboarding); **F3 ✅** passphrase reclaim (Ed25519). Three recovery surfaces: restore-on-reinstall, username+passphrase reclaim, **device pairing/QR (F4, next)**. Deferred: group-recovery-after-reclaim, groups-side account-delete cleanup |
| **AI Categorisation** | Phase 2              | Anthropic API proxy, PII stripping, transaction → category suggestion                                                                                                                                                                                                                                                                                                |

### D1 database schema (server-side — no financial data ever, no PII)

```sql
-- Auth/Identity (Track C):
users          -- user_id PK, username UNIQUE (optional/nullable), public_key, kdf_salt, created_at, updated_at  (NO phone, NO phone_hash)
devices        -- device_id PK, user_id, public_key, label, revoked_at
-- NOTE (Model B): NO user_blobs table. The personal .penny blob lives in the user's OWN
-- Google Drive/iCloud — our servers store NOTHING personal. Recovery = sign into Drive → pull blob.
-- Groups (Track E) — shared group data DOES relay through the server (WhatsApp split: membership +
-- ciphertext on server; personal history in Drive):
groups         -- group_id PK, type, enc_name, owner_id, key_epoch, created_at
group_members  -- group_id, user_id, role, joined_at, left_at
group_events   -- group_id, seq, event_id, author_id, key_epoch, r2_key  (encrypted event ledger — group ciphertext only)
-- API Proxy (Track A) — vehicle permanent cache + queue + budget:
vehicle_cache  -- regno PK, data, fetched_at
vehicle_queue  -- regno PK, requested_at, attempts, last_attempt_at
vahan_budget   -- day PK (IST), used
```

### KV cache keys

| Key pattern              | TTL      | Purpose                                  |
| -------------------------- | -------- | ------------------------------------------- |
| `proxy:yf:{path}{query}` | 15 min   | Yahoo market/stock passthrough (Track A) |
| `proxy:mfapi:{path}`     | 24h / 1h | MFAPI NAV (24h) / search (1h)            |
| `proxy:nps:{path}`       | 1wk / 1h | NPS scheme list (1wk) / NAV (1h)         |
| `proxy:ig:{path}{query}` | 15 min   | IPO / GMP passthrough                    |
| `rl:{ip}:{bucket}`       | 60 s     | Per-IP rate-limit counter                |
| `username:{name}`        | 5 min    | Username availability check (Track C)    |

## Phase 1.5 — Authentication

### Approach: on-device keypair + username (NO phone, NO OTP)

Phone + OTP was **dropped** (Track A reconciliation): SMS gateways cost money and a phone number is
maximal PII — both contradict the product. Identity is instead:

- an on-device **keypair** (signing + wrapping) generated lazily at claim time,
- the existing **`Profile.userId`** (UUID, generated at onboarding), and
- a self-chosen **`username`** (the public sharing handle; it can never decrypt anything).

**Chosen because:** zero PII, zero per-message cost, identity continuity (claiming is a pure relabel),
and it keeps the app fully usable offline.

### What the server stores

- **No phone number, no email.** No PII.
- Username: plaintext (it's public — used for invites/sharing)
- Public key(s): the device's signing/wrapping public keys (for auth + group key exchange)
- **No personal blob by default (Model B).** The `.penny` export lives in the user's own
  Drive/iCloud; our servers store only identity + group-membership metadata and per-group
  ciphertext. (An **optional, entitlement-gated** server-blind blob remains available as a
  convenience for users who won't enable Drive — off by default.)

### Username rules

- 3–20 characters, lowercase alphanumeric + underscore only
- **Optional in Phase 1** (auto-suggested from display name; live format validation). The permanent
  anchor is `userId` (UUID) — nothing keys off the username string.
- Uniqueness is **deferred to claim time** (no server in Phase 1) — claiming confirms it's free

### Auth flow (no OTP)

1. Choose username (optional; format-validated locally; uniqueness confirmed at claim).
2. App generates the keypair on-device; the private key lives in the encrypted local DB (DMK-protected).
3. **Register/claim:** upload `user_id`, `username`, public key, `kdf_salt`.
4. **Steady state:** each request is signed (`nonce‖method‖path‖bodyHash`) with the device key; the
   worker verifies against the stored public key.
5. **Recover-from-nothing (Model B):** sign into the user's own Drive/iCloud → pull the encrypted
   `.penny` blob → enter passphrase → DMK + device key + every Group Key restored; the server's
   membership table says which groups to re-pull. The passphrase is the only decryption secret and
   never leaves the device. (Detail in the parent plan, Track C + `docs/BACKEND_STRATEGY.md` §5.)

## Phase 1.5 — Encryption & Backup

### Encryption model: Option A (client-side keys, maximum privacy)

**Decision:** No key escrow. No server-side key recovery. This is the privacy promise.

- Personal data: encrypted with user's Master Key (passphrase-derived). Server never sees it.
- If passphrase is lost: data is permanently unrecoverable. User was warned during onboarding.

### Backup: User-owned cloud storage

- Personal data backed up as an **encrypted blob** to **Google Drive / iCloud** (user's choice)
- We never touch the backup file — it lives in the user's own cloud storage
- Restore: new device → sign into the user's own Drive/iCloud → download the encrypted blob → enter passphrase → decrypt on-device (the server's membership table then says which groups to re-pull)
- This is the same model as WhatsApp backups — users understand it (server holds membership; Drive holds the personal blob + keys)

### Household / group key exchange

Each group has its own **Group Key** (AES-256), completely independent of personal data keys.

**Key exchange during invite:**

1. User A creates a group → app generates Group Key → stores it in User A's encrypted local DB
2. User A invites `@username_b`
3. User B accepts the invite (authenticated via OTP)
4. User A's app encrypts the Group Key with User B's **public key**
5. The encrypted package is sent to User B via the Groups Worker
6. User B's app decrypts the package with their **private key** → stores Group Key in their encrypted local DB
7. Both users now have the Group Key locally. Server only handled the encrypted package — never saw the Group Key.

**Shared expenses** are encrypted with the Group Key before leaving the device. Server stores ciphertext blobs only.

**What the server can see:** User identities (public key + optional username — **no phone, no PII**), group membership graph, and per-group ciphertext events. **No personal blob (Model B — it's in the user's own Drive/iCloud).** Never financial data.

## Phase 2

### Chip — Real AI

- Switch `CHIP_MODE` from `'mock'` to `'real'`
- `buildUserContext()` → PII scanner → Anthropic SDK → `claude-sonnet-4-6`
- Temperature: 0.3 for analysis, 0.7 for conversation
- Max tokens: 1200 (analysis) / 800 (conversation)
- User supplies their own Anthropic API key (stored encrypted with Master Key)
- Optional: shared server-side key with per-user rate limiting (freemium model decision TBD)

### AI Auto-categorisation

**How it works:**

1. User adds a transaction (or imports from bank statement)
2. App sends merchant name + amount band to **AI Categorisation Worker** (strips PII first)
3. Worker calls Claude: "What expense category is this? [merchant, ₹amount band]" → returns category suggestion
4. User confirms or overrides
5. Override is stored locally as a **personal rule**: `{merchant: "BigBasket" → "Groceries"}`
6. Future occurrences of the same merchant use the local rule without any API call

**Privacy:** Only merchant name + amount band leaves the device. No account numbers, no personal details.

**Local rules engine:** After ~3–4 months of corrections, 80–90% of categorisations happen offline via local rules. API calls become rare.

### Mobile apps (iOS + Android) — 🚧 in progress, this is the active `feat/rn-migration` branch

Full plan (locked decisions, tracks, tech-stack rationale, migration playbook):
[`docs/plans/mobile-migration.md`](plans/mobile-migration.md). Current per-module parity status:
[`docs/MOBILE_PARITY.md`](MOBILE_PARITY.md). Superseded from this section's original sketch:

- **Expo (managed workflow)**, not bare React Native CLI, not Capacitor — a single codebase targets iOS,
  Android, and eventually web via `react-native-web`.
- **NativeWind** for styling (not plain RN StyleSheet as originally sketched here) — reuses the same
  semantic token names already in `docs/DESIGN_GUIDELINES.md`, lowering the risk of visual drift
  between platforms.
- Shared: `packages/core/` — business logic, formatters, calculators, repository pattern, all portable
  with near-zero changes.
- Storage/crypto adapters: `@op-engineering/op-sqlite` (behind `EncryptedRepository<T>`'s existing
  interface) and `react-native-quick-crypto` (polyfills `crypto.subtle`).
- **Long-term vision**: once mobile is fully verified at parity, evaluate rendering web via
  `apps/mobile`'s `react-native-web` build and retiring `apps/web-react` as a separate Vite/DOM
  codebase entirely — one codebase for every platform, the same principle Cashew (a mature
  cross-platform budgeting app looked at for structural inspiration) achieves via Flutter's single
  rendering engine. Not started; a real future decision point, not a current plan.

### Other Phase 2 items

- CAS PDF import (casparser SDK) — MF + stocks from CDSL/CAMS statements
- EPFO passbook PDF import (PDF.js)
- Export: wealth snapshot PDF + tax summary PDF
- Desktop layout (≥768px breakpoint, sidebar nav)
- Push notifications (EMI reminders, insurance renewals, goal milestones)
- Watchlist (stocks + MFs with price alerts)
- **Persistent storage on native (Capacitor) builds** — Penny never calls `navigator.storage.persist()`, so a WebView's IndexedDB (which holds the encrypted vault) is "best-effort" and could be evicted by the OS under storage pressure. Before shipping native apps, request persistence on boot and verify it's granted on real devices. Verification steps in [ANDROID_EMULATOR.md → Storage durability on device](ANDROID_EMULATOR.md#storage-durability-on-device-phase-2-to-do).

## Phase 3

- Regional languages (Hindi first, then Tamil, Telugu, Kannada, Marathi)
- Crypto / Web3 asset tracking
- International equities (US stocks, ETFs)
- Advanced AI advisor (life event workflows, personalised financial plan)
- RBI Account Aggregator (AA) framework sync when EPFO joins as FIP

## Deferred from Phase 1 (awaiting Phase 2+)

| Feature                            | Originally planned    | Moving to                                                                                           |
| ------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| CAS PDF import                     | M11 step 70           | Phase 2                                                                                             |
| Watchlist                          | M11 step 71           | Phase 2                                                                                             |
| Export PDF/HTML                    | M8 step 47 (CSV done) | Phase 2                                                                                             |
| Chip mock chat UI                  | M8 step 44            | Phase 2                                                                                             |
| Desktop layout                     | M8 step 48            | Phase 2                                                                                             |
| Real Chip AI                       | All of Phase 1        | Phase 2                                                                                             |
| SMS transaction parsing            | BRD v4                | Phase 2                                                                                             |
| Credit score via bureau aggregator | BRD v4                | Phase 2                                                                                             |
| Biometric auth                     | TSD v1.0              | Phase 2 (native app) — WebAuthn-PRF on PWA too patchy; envelope crypto leaves a wrapping slot ready |
| Cloud backup                       | Phase 1.5/2           | **Pulled into Phase 1** (Track 2) — user-owned Google Drive                                         |
| Change passphrase / PIN            | "planned"             | **Pulled into Phase 1** (Track 2) — trivial under envelope crypto                                   |

## Open decisions

| #   | Decision                                                             | Status                                                              |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| D1  | PBKDF2 iteration counts (600K/200K)                                  | Benchmark on mid-range Android before Phase 2                       |
| D2  | App pricing model (freemium vs subscription vs one-time)             | Decide before Phase 2 launch                                        |
| D3  | Shared Anthropic API key strategy (rate limiting approach)           | Decide with pricing model                                           |
| D4  | Which bureau aggregator (OneScore / Finbox / CreditMantri / Perfios) | Phase 2 — evaluate at time of implementation                        |
| D5  | Petrol/diesel/LPG in market strip                                    | No free client-callable API exists. Plan when backend is available. |

---

# Part 3 — Future ideas

A thinking space for what the app could become — **not all of these will be built, and this
is not a status tracker.** For what's actually built/in-progress, see Parts 1 and 2 above,
[`CLAUDE.md`](../CLAUDE.md), and [`docs/plans/`](plans/).

If you have ideas or feedback, open a GitHub issue referencing the relevant `docs/features/` file.

## Phase 1.5 — remaining (Groups & Household OS)

Most of Groups & Household OS is built (see Part 2 above). Still to do within Phase 1.5:

- **Device pairing / QR (Track F4)** — link a second device / "Penny on laptop"; reuses the ECDH grant machinery. To be designed before building.
- **Group recovery after reclaim** — list-my-groups sync + co-member key re-grant so a reclaimed account can decrypt group history without a backup (deferred Track F follow-up).
- **Stage F closeout** — combined household net-worth view + the remaining Phase-1.5 polish drawn up after Track E/F land.
- **Server-side E2EE data blob** (optional, Phase 2-ish) — store the passphrase-wrapped DMK + encrypted data so username+passphrase can restore *everything* without the user's own cloud (reverses own-Drive Model B + reopens storage cost — a deliberate, costed decision).

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
- **Bank statement PDF import** — CSV and Excel (.xlsx/.xls) are both shipped (Bank Statement Import
  feature, `docs/features/bank-import.md`); PDF is the one remaining format, deferred 2026-08-05.
  Text-layer extraction only, no OCR/scanned-PDF (consistent with Penny's zero-server privacy model).
  Real open risk flagged before deferring: `pdfjs-dist` (the only mature text-extraction library) is
  known to be finicky under Metro/RN (worker scripts, DOMMatrix/canvas assumptions), and a PDF's text
  layer has no real "columns" the way a CSV/Excel grid does — row/column reconstruction from
  positioned text runs is a genuinely harder problem than the two formats already shipped. Recommended
  approach: a small feasibility spike (confirm the library actually bundles + extracts text on-device)
  before designing the row-reconstruction logic, not a design-first approach.
- **Transaction type editable everywhere** — let an already-saved expense/income be converted to a
  transfer (and vice versa) via the normal edit flow, not just during bank-import review (where this
  already works, 2026-08-05 — `ExpenseForm`'s statementPreset mode). Deferred 2026-08-05 pending a
  separate scoping discussion (app-wide edit-form behavior, not specific to bank import).
- **SMS transaction parsing** — Auto-detect expenses from bank SMS alerts. Privacy concern: requires READ_SMS permission.
- **"Import with Chip" conversational review** — Instead of (or as a toggle alongside) the tile-based review screen, let Chip ask about only the genuinely ambiguous items (an unresolved category, a suspected transfer pair) via quick-reply chips + free text, silently auto-applying high-confidence matches, with a "Show full review" escape hatch back to the tile view at any point. Explored as a concept sketch in `docs/mockups/proposals/import-wizard-redesign-v3.html`'s "out of the box" section. Open question flagged there: risk of hiding decisions from the user by auto-applying matches — needs a confidence-threshold and an always-visible audit trail (e.g. "12 rows auto-matched, tap to review") before this could ship, not just a chat UI.

### Export improvements

- **Wealth snapshot PDF** — One-page summary: net worth, top holdings, recent expenses, goals progress.
- **Tax summary PDF** — Capital gains, 80C/80D/24B usage summary for CA filing.
- **Export to CA format** — CSV structured for common CA software (Tally, Zoho Books).

### Asset tracking improvements

- **Watchlist** — Track stocks/MFs without owning them. Price alerts.
- **Demat sync** — Connect Zerodha/Groww/Angel One APIs. Challenge: needs user's broker credentials.
- **NPS statement import** — PRAN statement PDF parsing.
- **Real estate valuation** — Link to housing.com/Magicbricks estimated price for the pin code.

## Phase 3 ideas

- **Regional languages** — Hindi first (most users), then Tamil, Telugu, Kannada, Marathi, Bengali.
- **Crypto / Web3** — Bitcoin, Ethereum, altcoins. Live prices via CoinGecko.
- **International equities** — US stocks and ETFs. Live prices via Yahoo Finance (already integrated for Indian stocks).
- **Advance AI advisor** — Comprehensive financial plan generation. Annual review mode.
- **RBI Account Aggregator (AA) sync** — When EPFO, NPS, and more FIPs join the AA framework, sync automatically. Zero screen-scraping.

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

## Phase 3+ ideas

- **Income tax portal sync** — Connect to the Income Tax e-filing portal (AIS/Form 26AS data) to auto-import advance tax paid, TDS deducted, and capital gains reported. App could retrospectively compare against what it computed and show gaps.
- **Biometric / PIN-free unlock** — Face ID / fingerprint unlock instead of PIN on native apps (Phase 2). Privacy-first framing: biometric never leaves device, used only to unlock the Master Key from the secure enclave. Currently deferred to Phase 2 native app.

## Open UX questions (ideas welcome)

1. **Net worth trend line** — Should it be on the Home screen or Portfolio overview? Both?
2. **Recurring expense confirmation** — Should we ask users to confirm detected subscriptions, or auto-add them to a "suspected" list?
3. **Goal notifications** — Users can't receive push notifications in a PWA (on iOS). Show in-app banners instead?
4. **Multi-currency** — NRIs want USD/GBP investments alongside INR. How to handle FX conversion in net worth?
5. **Joint insurance** — Family floater health insurance covers multiple people. How to attribute premium per person?
6. **Expense sharing pre-Phase 1.5** — Flatmates want to split bills even before groups exist. Could do simple 50/50 split with manual note.
7. **Emergency fund designation** — Mark a specific account as "emergency fund" for health score accuracy.
8. **Charitable donations tracker** — 80G-eligible donations tracked separately. Useful for tax.
