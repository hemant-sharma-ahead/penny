# Penny — Database Schema

All stores use Dexie.js (IndexedDB). All primary keys are UUIDs (not auto-increment — required for future cross-device sync).

Encrypted stores use `EncryptedRepository<T>`, which wraps Dexie and transparently encrypts fields on write and decrypts on read via the in-memory Master Key. Plain stores are written directly to IndexedDB with no encryption.

**Store counts:** 38 active stores total — 36 encrypted + 2 plain.

**Schema versions:**

- v1: Initial 19 stores (17 encrypted + 2 plain)
- v2: Added `accounts` (multi-account tracking, M9) — 20 total
- v3: Dropped `assets` store (superseded by `holdings` with `assetClass` field) — 19 total
- v4: Added `activity_log` — 20 total
- v5: Added `merchant_memory` — 21 total
- v6: Added `transaction_templates` — 22 total
- v7: Added `persons`, `ledger_entries` — 24 total
- v8: Added `device_keys`, `group_keys`, `sync_cursor` — 27 total
- v9: Added `groups`, `group_members`, `group_events` — 30 total
- v10: Added `bank_statement_imports`, `bank_narration_overrides` (Bank Statement Import) — 32 total
- v11: Added `payment_modes` (custom/creatable payment modes) — 33 total
- v12: Added `retirement_plan` (singleton, shared by Home's Retirement Corpus card and the FIRE
  Calculator) and `net_worth_snapshots` (one row per calendar month, for the Retirement Corpus chart's
  historical segment) — 35 total
- v13: Added `bank_cash_withdrawal_codes` (narration codes like ATW/NWD/SELF that auto-classify a
  bank statement line as a cash-withdrawal transfer) — 36 total
- v14: Added `sms_transactions`, `sms_account_mappings` (SMS-Based Transaction Tracking, Android
  only) — 38 total
- v15: Added `sms_excluded_senders` (durable per-sender "never a transaction" exclusion) — 39 total

---

## Mobile (React Native) storage engine

Since Track 2 of the [mobile migration](plans/mobile-migration.md), `apps/mobile` runs on
`@op-engineering/op-sqlite` instead of Dexie — Metro resolves `packages/core/src/core/db/schema.native.ts`
in place of `schema.ts` for any native build (verified via bundle inspection; web/`apps/web-react` is
completely unaffected and keeps using Dexie unchanged). This is the third storage engine this file has
used, each swap driven by a real on-device bug:

1. **`expo-sqlite`** (Track 2). Needed a single app-wide FIFO queue serializing every DB call — reads
   included — because its native binding corrupted its statement handle under concurrent reads, not just
   writes. That queue serialized every one of `useExpenses.ts`'s 8 independent table reads on mount, one
   at a time, on top of an async bridge round-trip per call.
2. **`react-native-mmkv`** (2026-07-26). Removed the queue and the per-call bridge cost — MMKV's calls are
   synchronous JSI, no shared connection to corrupt. But every call runs inline on the JS thread, so a bulk
   read of ~1,000 rows became 1,000 synchronous calls blocking the JS thread for the whole loop — user
   confirmed on-device this still didn't feel as smooth as web.
3. **`@op-engineering/op-sqlite`** (2026-07-26, same day). Real async SQLite: `execute()` dispatches to a
   native thread and only the final result crosses back to JS — the same "off-thread, single result
   handoff" shape Dexie/IndexedDB already has on web. WAL journal mode is enabled; only one connection is
   opened, per op-sqlite's own guidance (no manual reader/writer pool).

This version also fixes a second inefficiency present in _both_ prior RN adapters (not unique to MMKV):
both stored each encrypted row as `JSON.stringify({id, iv, ciphertext})` in a single text column/value — a
wrapper layer Dexie never needed, since IndexedDB stores that same `{id, iv, ciphertext}` object directly
via structured clone. The ~27 tables an `EncryptedRepository` always writes in that exact shape now get
real typed columns (`id`/`iv`/`ciphertext` — `CREATE TABLE ... (id TEXT PRIMARY KEY, iv TEXT NOT NULL,
ciphertext TEXT NOT NULL)`), no JSON wrapper at all. Only the 3 tables with genuinely arbitrary per-table
shape (`security`/`price_cache`/`privacy_stats`) keep a JSON `data` column, since a generic `RowStore<T>`
can't know their individual field lists ahead of time the way it can for the fixed `EncryptedRecord` shape.
Unlike the original `expo-sqlite` version, there's no versioned migrations table — `CREATE TABLE IF NOT
EXISTS` for every known table runs unconditionally on every launch (a no-op after the first), since a
table's column set is fixed forever once created this way.

The storage-engine seam is `packages/core/src/core/db/store.ts`'s `RowStore<T>` interface (`get/put/toArray/
delete/count/update/clear`) — `EncryptedRepository<T>`'s constructor takes a `RowStore<EncryptedRecord>`
instead of Dexie's `Table` directly; Dexie's `Table` already structurally satisfies this interface, so this
was a type-only change on the web side, and each RN storage-engine swap needed zero changes to
`EncryptedRepository`, `securityManager.ts`, `priceCache.ts`, or any other caller — they only ever depend
on this interface, never on how storage works underneath it. Cross-engine correctness (PBKDF2/AES-GCM/
deterministic-Ed25519 vectors run under Web Crypto here, to be reproduced on-device against
`react-native-quick-crypto`) is tracked in `packages/core/tests/crypto/crossEngineVectors.test.ts`.

---

## Encrypted stores

### `profile`

Single-record store. The user's identity and app preferences.

| Field              | Type                                                                           | Notes                                                                                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                 | string (UUID)                                                                  | Primary key                                                                                                                                                                                                                                                                                               |
| displayName        | string                                                                         | User's full name (also used as the display name)                                                                                                                                                                                                                                                          |
| currency           | `'INR'`                                                                        | Always INR in Phase 1                                                                                                                                                                                                                                                                                     |
| locale             | `'en-IN'`                                                                      | Always en-IN in Phase 1                                                                                                                                                                                                                                                                                   |
| onboardingComplete | boolean                                                                        | AuthGuard checks profile existence (field name is `onboardingComplete` in code)                                                                                                                                                                                                                           |
| dob                | string?                                                                        | ISO date (YYYY-MM-DD) — Track 2. Encrypted; only a 5-year age band ever sent to AI                                                                                                                                                                                                                        |
| employmentType     | `'salaried' \| 'self_employed' \| 'business_owner' \| 'student' \| 'retired'`? | Track 2; gates EPF visibility, tax deductions, health benchmarks                                                                                                                                                                                                                                          |
| username           | string?                                                                        | Track 2; 3–20 lowercase alphanumeric/underscore. Local now; server-checked for uniqueness in Phase 1.5                                                                                                                                                                                                    |
| userId             | string?                                                                        | Track 2; local identity id, "claimed" on the server at Phase 1.5 registration                                                                                                                                                                                                                             |
| deviceId           | string?                                                                        | Phase 1.5 Track C; random UUID for this device, assigned at account claim. Rides backup/recovery                                                                                                                                                                                                          |
| plan               | `'free' \| 'pro'`?                                                             | Track 2; entitlement marker. Always effectively pro until pricing ships                                                                                                                                                                                                                                   |
| demoSeeded         | boolean?                                                                       | true only while the vault itself is the throwaway Demo Mode one (never true for a real vault, on either the fresh or exit-demo setup path). Persisted here (in addition to the localStorage `penny_demo_seeded` flag) so it rides the encrypted backup and the "Exit Demo Mode" option survives a restore |

> The on-device identity **keypair** and any `licenseToken` are stored in the encrypted DB alongside the profile (private key never leaves the device). Non-indexed fields → no Dexie migration.

---

### `holdings`

Every asset the user owns. Supersedes the old `assets` store (dropped in v3).

| Field         | Type                                                                                                  | Notes                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| id            | string (UUID)                                                                                         | Primary key                                                         |
| assetClass    | `'equity' \| 'mf' \| 'fd' \| 'nps' \| 'ppf' \| 'epf' \| 'gold' \| 'vehicle' \| 'property' \| 'other'` | Determines which UI and calculators apply                           |
| name          | string                                                                                                | Fund name, stock ticker, or descriptive name                        |
| units         | number?                                                                                               | For MF and equity holdings                                          |
| purchasePrice | number?                                                                                               | Per-unit cost for MF/equity; total cost for others                  |
| currentValue  | number?                                                                                               | Updated from price_cache or user input                              |
| purchaseDate  | number?                                                                                               | Epoch ms — used for LTCG/STCG calculation                           |
| assetMeta     | AssetMeta?                                                                                            | Type-specific metadata (see `docs/TSD.md` for shape per assetClass) |
| note          | string?                                                                                               | Free text                                                           |

> **EPF employment confirmation (2026-08, EPF passbook import feedback round):** `assetMeta.epfEmployers[].currentEmploymentConfirmed?: boolean` — `true` only once the user has explicitly answered "yes, still employed here" to the card-level prompt in `RetirementCard.tsx` (`apps/mobile`). Root-cause fix for a real bug where importing a single, strictly-past-FY passbook left an employer's `toDate` unset (= "current") with no actual evidence tying it to the present, so estimated contributions silently ran all the way to today. Never set for a manually-added employer — that flow already asks "current employer?" implicitly by leaving `toDate` blank. See `docs/plans/epf-passbook-import.md` §10.6 and `docs/TSD.md`'s `epfEmployers` entry.

> **EPF confirmed financial years (2026-08, same feedback round):** `assetMeta.epfEmployers[].confirmedFys?: number[]` — FY start years for which a real passbook/Excel export has been imported for this employer, even one with ZERO contribution rows (e.g. after leaving mid-way through a prior year — a real, authoritative "nothing happened" from EPFO, not a gap). `epfComputeAllMonths()` (`packages/core/src/core/portfolio/epfCalculations.ts`) treats any month with no matching real transaction inside a confirmed FY as a confirmed zero rather than running its usual formula-based estimate — fixes a real bug where importing consecutive contribution-free years (after the employee had left) kept fabricating estimated contributions for all of them. See `docs/plans/epf-passbook-import.md` §10.7.

> **EPF transaction employer link (2026-08, same feedback round):** `assetMeta.epfTransactions[].employerId?: string` — which `EpfEmployer.id` a contribution belongs to, stamped at import time. Exists to handle a genuine mid-month employer switch: two DIFFERENT employers can each have a real contribution for the SAME `wagesMonth`, which a wagesMonth-only reconciliation key was treating as one entry conflicting with the other. Absent on a manually-typed contribution (no employer picker exists for that flow) or a transaction written before this field existed; those fall back to date-range containment against `EpfEmployer.fromDate`/`toDate` (`epfEmployerForWagesMonth`), which itself returns nothing rather than guessing if more than one employer's range covers the month. See `docs/plans/epf-passbook-import.md` §10.8. **Update (2026-08-11, §10.9):** now stamped on EVERY import-created transaction type — interest/transfer_in/withdrawal/advance too, not just `contribution` (`buildImportedTxn` in `epfImportLogic.ts`) — closing a gap where a non-contribution row from a switch-month import had no way to disambiguate which employer it belonged to. A manually-typed transaction of any type still has no employer picker in that flow, so it remains unscoped.

> **EPF joining-date confirmation (2026-08-11, employer-switch fixes):** `assetMeta.epfEmployers[].joiningDateConfirmed?: boolean` — `true` once the user has explicitly confirmed a new employer's real joining date via the import-time `EpfNewEmployerSetupSheet` (`apps/mobile`). Distinct from `currentEmploymentConfirmed` above — that one is about still being employed now; this one is about when employment started. Guards `extendEmployerCoverage` from silently moving an already-confirmed `fromDate` backward when a later import reveals an even-earlier real contribution — instead surfaces a new `joiningDateContradiction` review flag for the user to resolve explicitly. See `docs/plans/epf-passbook-import.md` §10.9.

> **EPF Basic-to-Gross ratio (2026-08-11, same round):** `assetMeta.epfEmployers[].basicToGrossPct?: number` — user-editable per employer, defaults to `EPF_DEFAULT_BASIC_TO_GROSS_PCT` (50%) when unset. Feeds `estimateGrossAndCtc()` (`packages/core/src/core/portfolio/epfCalculations.ts`), which powers the new "Estimated Gross Salary / CTC" stat tiles shown in a per-employer EPF ledger view — always presented as an explicit estimate with a formula popup, never asserted as fact. See `docs/plans/epf-passbook-import.md` §10.9.

> **PPF transaction import provenance (2026-08-08, PPF statement import):** `assetMeta.ppfTransactions[].sourceParticulars?: string` and `.sourceRef?: string` — the statement row's own narration and an import-batch id, populated only when a `PpfTransaction` came from a CSV/Excel statement import (`ppfReconciliation.ts`'s `reconcilePpfRows`), mirroring `EpfTransaction`'s identical fields. Both absent for a manually-entered transaction. Reconciliation keys a deposit/withdrawal by `(type, same calendar day)` and an interest credit by `(type, financial year)` — exact-key matching, not bank-import's fuzzy amount/date-proximity matcher, since a bank/post-office statement has at most one transaction per day per type. See `docs/features/portfolio/retirement.md`.

> **EPF interest-mismatch acknowledgment (2026-08-12, fifth on-device round):** `assetMeta.epfTransactions[].interestMismatchAcknowledged?: boolean` — set `true` only when the user explicitly picks "Keep recorded" in the interest breakdown popup's mismatch banner, confirming the recorded (passbook) interest figure is the one to trust over Penny's own recalculation. `checkInterestMismatch` (`epfReviewFlags.ts`) itself is unaffected and always reports the raw disagreement; `findAllReviewFlags` is what actually skips creating the `interestMismatch` flag once acknowledged, so it stops counting toward the card-level "N need review" total and the row's warning badge — same "computed on demand, dismissal tracked separately" pattern as `Account.dismissedVerificationFindings` elsewhere in the app. Absent on any transaction where the recorded figure hasn't been explicitly confirmed (including one that has never had a mismatch at all). See `docs/plans/epf-passbook-import.md` §10.13.

---

### `expenses`

Every income, expense, and transfer transaction.

| Field            | Type                                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id               | string (UUID)                         | Primary key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| amount           | number                                | Always positive; `type` determines direction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| merchant         | string                                | Shown locally only — stripped before any AI call                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| categoryId       | string                                | FK → expense_categories                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| date             | number                                | Epoch ms — **includes the time-of-day** (set via `lib/date.dateInputToEpoch`) so same-day transactions order by entry time                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| type             | `'expense' \| 'income' \| 'transfer'` |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| notes            | string?                               | Free text; hashtags are parsed from here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| hashtags         | string[]?                             | Parsed tags e.g. `['emi', 'travel']`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| paymentMode      | string?                               | e.g. `'UPI'`, `'credit_card'`, `'cash'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| accountId        | string?                               | FK → accounts (source account)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| toAccountId      | string?                               | FK → accounts — transfers only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| eventId          | string?                               | FK → hashtags where eventType is set                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| recurringRuleId  | string?                               | FK → subscriptions or internal rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| isRecurring      | boolean?                              | True if part of a confirmed recurring pattern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| receiptDataUrl   | string?                               | Local receipt photo — compressed JPEG data URL (Track 6 Step 11). Encrypted at rest; never sent to AI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| statementBalance | number?                               | **New (2026-08-08, bank balance sync Stage 1).** GROUND TRUTH ONLY — the bank statement's own stated running balance immediately after this transaction, copied verbatim from a statement row with a mapped Balance column at bank-import commit time. Never recomputed/guessed. Present only on transactions from, or matched against, a `bank`-type-account statement import that had a balance column mapped (credit cards excluded — see `docs/plans/bank-balance-sync.md` §3/§16). THE marker of "checkpointed" — a checkpointed expense is permanently excluded from `matchStatementRows()`'s Tier-2 fuzzy candidate pool for any _other_ import (two-tier matching, plan §5/§17). |
| reconciledSeq    | number?                               | **New (2026-08-08, bank balance sync Stage 0 — field only, no logic yet, that's Stage 5).** Intra-day order (1st, 2nd, 3rd…) among that calendar day's statement rows, set only when the whole day is statement-explained. See `docs/plans/bank-balance-sync.md` §4/§9.                                                                                                                                                                                                                                                                                                                                                                                                                  |

---

### `expense_categories`

Default and user-created categories for classifying expenses.

| Field          | Type                                 | Notes                                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id             | string (UUID)                        | Primary key                                                                                                                                                                                                                                                |
| name           | string                               | e.g. `'Food'`, `'EMI'`, `'Entertainment'`                                                                                                                                                                                                                  |
| icon           | string                               | Tabler icon class (`ti-*`), chosen via the visual icon picker                                                                                                                                                                                              |
| color          | string                               | Hex color for UI chips and charts                                                                                                                                                                                                                          |
| intentGroup    | string?                              | Fixed intent-group key (`'daily_living'`, `'health'`, …) used to group **default** categories. See `INTENT_GROUP_META`.                                                                                                                                    |
| isDefault      | boolean                              | System-provided defaults (editable, not deletable) vs user-created                                                                                                                                                                                         |
| isGroup        | boolean?                             | `true` ⇒ this record is a user-created **parent** (grouping header), not selectable for a transaction                                                                                                                                                      |
| parentId       | string?                              | For a custom leaf category, the id of its parent (`isGroup`) category. Takes precedence over `intentGroup` for grouping.                                                                                                                                   |
| applicableTo   | 'expense' \| 'income' \| 'transfer'? | Defaults to `'expense'`                                                                                                                                                                                                                                    |
| hideInSafeMode | boolean?                             | Safe Mode masks this category's amounts (transactions, budgets); explicit `true`/`false` always wins, `undefined` falls back to the intent-group default — see `isHiddenInSafeMode()` in `core/expenses/categoryGroups.ts`. Set from Settings → Safe Mode. |

> **Grouping (Track 3):** the picker/analytics/filters key off `groupKey(cat) = parentId ?? intentGroup ?? 'other'`; the header label/color comes from the parent record (custom groups) or `INTENT_GROUP_META` (fixed groups). No Dexie store/version change — `isGroup`/`parentId` ride inside the encrypted blob.

> **Sin Goods intent group (Track 7):** a `sin_goods` intent group (in `INTENT_GROUP_META`) with two new default categories — `cat-alcohol` and `cat-tobacco`. These map to high-tax bands in the indirect-tax footprint. Existing users receive them via an **additive, non-destructive** re-seed in `useExpenses.ts` guarded by `penny_cats_v3` (inserts only missing default categories — never re-puts edited ones). No Dexie store/version change.

> **Tax-footprint overrides (Track 7):** stored in `localStorage`, not Dexie — `penny_settings_tax_gross_income`, `penny_settings_tax_direct`, `penny_settings_tax_epf`, `penny_settings_tax_statutory` (optional manual gross-income, income-tax correction, EPF/PF, and professional-tax+LWF overrides for the income waterfall; absent = derive automatically). See `SettingsContext`.

> **Safe Mode visibility:** per-category (`hideInSafeMode` above) and per-account (`accounts.hideInSafeMode`) flags cover Expenses/Income/Accounts. Loans, IOU, Portfolio, Goals, Insurance, and Subscriptions don't have a natural per-item category to hang a flag on, so they use simple module-level toggles stored in `localStorage` under `penny_settings_safe_mode_visibility` (`SafeModeVisibility` in `SettingsContext` — `loans`/`iou`/`portfolio`/`goals`/`insurance`/`subscriptions`; these already store "visible" directly, default `true`). `usePrivacy().shouldMask(sensitive)` is the single source of truth: Open never masks, Safe masks only when `sensitive` is true (a third "Privacy" mode that used to always mask was removed 2026-08-18 — see `docs/PRIVACY.md`). Aggregates (totals, net worth, "Total spent this month", the cash-flow forecast, the Activity Timeline) always pass `sensitive: false` — Safe Mode's premise is that the big picture stays visible and only specific flagged items hide.
>
> **Category defaults are smart, not blank.** An explicit `hideInSafeMode` on a category always wins; when it's `undefined`, `isHiddenInSafeMode()` (`core/expenses/categoryGroups.ts`) falls back to a per-intent-group default — `income`, `transfers`, `family_giving`, `legal`, `sin_goods`, and `financial` default **hidden**; every other default category (daily living, home & utilities, lifestyle, etc.) and any custom category default **visible**. The Settings → Safe Mode toggle matches the field directly (ON = hidden, `hideInSafeMode: true`). Accounts have no group concept and simply default visible (`undefined` → shown).

---

### `budgets`

Monthly spend limits per category.

| Field      | Type          | Notes                                  |
| ---------- | ------------- | -------------------------------------- |
| id         | string (UUID) | Primary key                            |
| categoryId | string        | FK → expense_categories                |
| amount     | number        | Monthly limit in ₹                     |
| period     | `'monthly'`   | Only monthly budgets supported today   |
| startDate  | number?       | Epoch ms — when this budget rule began |

---

### `hashtags`

User-defined tags applied to expenses/income. Event/Vacation Mode state (which tags are "active
events") lives separately in `EventModeContext`/localStorage, not on this record.

| Field          | Type          | Notes                                                                                                                                                                                                                                                                                |
| -------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| id             | string (UUID) | Primary key                                                                                                                                                                                                                                                                          |
| name           | string        | Without `#`, lowercased — e.g. `'goa-trip'`, `'emi'`, `'momgroceries'`                                                                                                                                                                                                               |
| usageCount     | number        | Incremented on each use; drives the "Frequent" row in the expense form's Tags panel and the sort order in Manage Tags                                                                                                                                                                |
| setAside       | boolean?      | **New (2026-07).** Any transaction carrying this tag is excluded from daily-living analytics (`useExpenseAnalytics`'s `classify()`) regardless of category, reported as its own line. Set once per tag (Manage Tags, or inline when the tag is first created), never per transaction |
| hideInSafeMode | boolean?      | **New (2026-07).** Independent of `setAside` — Safe Mode masks any transaction carrying this tag when true. Defaults to mirroring `setAside` at creation but is separately editable (Settings → Safe Mode → Tags)                                                                    |
| createdAt      | number        | Epoch ms                                                                                                                                                                                                                                                                             |

---

### `goals`

Financial goals with SIP planning and progress tracking.

| Field                   | Type                                    | Notes                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                      | string (UUID)                           | Primary key                                                                                                                                                                                                |
| name                    | string                                  | User-given name e.g. `'House Down Payment'`                                                                                                                                                                |
| targetAmount            | number                                  | Goal target in ₹                                                                                                                                                                                           |
| currentAmount           | number                                  | Baseline saved before/outside tracked contributions (2026-08-01) — see `goal_contributions` below; not the full total shown to the user                                                                    |
| targetDate              | number?                                 | Epoch ms — deadline                                                                                                                                                                                        |
| sipAmount               | number?                                 | Planned monthly SIP in ₹                                                                                                                                                                                   |
| sipFrequency            | `'monthly' \| 'quarterly' \| 'yearly'`? | SIP cadence                                                                                                                                                                                                |
| expectedReturn          | number?                                 | Annual return assumption (%) for corpus projection                                                                                                                                                         |
| icon                    | string?                                 | Tabler icon name                                                                                                                                                                                           |
| color                   | string?                                 | Hex color for UI card                                                                                                                                                                                      |
| countsTowardSafeToSpend | boolean?                                | 2026-08-02 — undefined/true = this goal's saved amount is excluded from "Safe to spend" (Home/Expenses/Cash Flow); explicit `false` only for a goal the user personally wants to keep reading as spendable |

---

### `goal_contributions`

Individual contributions credited toward a goal — as of 2026-08-01, the _only_ place a contribution's
amount lives; `goals.currentAmount` is a one-time baseline set via `GoalForm`'s "Already saved" field
and never incremented again. The amount shown/used everywhere is `currentAmount` plus the live sum of
that goal's `goal_contributions` — computed on read, never denormalized, the same way IOU's net balance
is never a stored total either (`core/iou/ledger.ts`'s `netBalance`).

| Field       | Type                    | Notes                                                                                                                              |
| ----------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| id          | string (UUID)           | Primary key                                                                                                                        |
| goalId      | string                  | FK → goals                                                                                                                         |
| amount      | number                  | Contribution amount in ₹                                                                                                           |
| date        | number                  | Epoch ms                                                                                                                           |
| notes       | string?                 | e.g. `'Bonus allocation'`, `'Annual SIP'`                                                                                          |
| origin      | `'manual' \| 'expense'` | `'expense'` = seeded by a linked Expense/Income/Transfer (`ExpenseForm.tsx`'s Goal toggle); `'manual'` = logged from the Goals tab |
| linkedTxnId | string?                 | FK → expenses, both ways — deleting either cascades to the other. Mirrors `ledger_entries.linkedTxnId` (IOU's equivalent).         |
| updatedAt   | number                  | Epoch ms                                                                                                                           |

---

### `liabilities`

All debt obligations — loans, credit cards, BNPL, informal borrowings.

| Field           | Type                                                                                                                                                                              | Notes                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| id              | string (UUID)                                                                                                                                                                     | Primary key                                                 |
| type            | `'home_loan' \| 'car_loan' \| 'personal_loan' \| 'business_loan' \| 'education_loan' \| 'two_wheeler_loan' \| 'gold_loan' \| 'credit_card' \| 'bnpl' \| 'family_loan' \| 'other'` |                                                             |
| name            | string                                                                                                                                                                            | e.g. `'HDFC Home Loan'` — shown locally, generalised for AI |
| principalAmount | number                                                                                                                                                                            | Original loan amount                                        |
| currentBalance  | number                                                                                                                                                                            | Outstanding balance today                                   |
| interestRate    | number?                                                                                                                                                                           | Annual interest rate (%)                                    |
| emiAmount       | number?                                                                                                                                                                           | Monthly instalment in ₹                                     |
| tenureMonths    | number?                                                                                                                                                                           | Total loan tenure                                           |
| startDate       | number?                                                                                                                                                                           | Epoch ms — disbursement date                                |
| endDate         | number?                                                                                                                                                                           | Epoch ms — last EMI date                                    |
| lenderName      | string?                                                                                                                                                                           | e.g. `'HDFC Bank'` — shown locally, generalised for AI      |
| accountNumber   | string?                                                                                                                                                                           | Last 4 digits only — never full account number              |
| note            | string?                                                                                                                                                                           | Free text                                                   |

---

### `insurance_policies`

Life, health, vehicle, and other insurance policies.

| Field            | Type                                                                                                                 | Notes                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| id               | string (UUID)                                                                                                        | Primary key                                   |
| type             | `'term_life' \| 'whole_life' \| 'endowment' \| 'ulip' \| 'health' \| 'vehicle' \| 'property' \| 'travel' \| 'other'` |                                               |
| name             | string                                                                                                               | Policy name or description                    |
| insurer          | string?                                                                                                              | Insurer name e.g. `'LIC'`, `'Star Health'`    |
| policyNumber     | string?                                                                                                              | Encrypted — never shown in logs or sent to AI |
| sumAssured       | number?                                                                                                              | Cover amount in ₹                             |
| premium          | number?                                                                                                              | Premium amount in ₹                           |
| premiumFrequency | `'monthly' \| 'quarterly' \| 'half-yearly' \| 'yearly'`?                                                             | Payment cadence                               |
| startDate        | number?                                                                                                              | Epoch ms — policy start                       |
| renewalDate      | number?                                                                                                              | Epoch ms — next renewal                       |
| maturityDate     | number?                                                                                                              | Epoch ms — for endowment/ULIP                 |
| nominees         | string[]?                                                                                                            | Nominee names — PII, never sent to AI         |
| note             | string?                                                                                                              | Free text                                     |

---

### `chip_insights`

Cached AI-generated insights per module. Generated by `mockChip.ts` in Phase 1; will use Anthropic API in Phase 2.

| Field                | Type                          | Notes                                       |
| -------------------- | ----------------------------- | ------------------------------------------- |
| id                   | string (UUID)                 | Primary key                                 |
| module               | string                        | e.g. `'portfolio'`, `'expenses'`, `'goals'` |
| insight              | string                        | Plain-language headline for the user        |
| reasoning            | string                        | 2–3 lines with supporting numbers           |
| doNothingConsequence | string                        | Always populated — ₹ cost of inaction       |
| confidence           | `'low' \| 'medium' \| 'high'` |                                             |
| createdAt            | number                        | Epoch ms                                    |
| version              | number                        | Schema version of the insight format        |

---

### `ai_call_log`

Audit trail of every AI call. Logged before the call is made.

| Field      | Type          | Notes                                                     |
| ---------- | ------------- | --------------------------------------------------------- |
| id         | string (UUID) | Primary key                                               |
| module     | string        | Feature that initiated the call                           |
| prompt     | string        | Anonymised prompt — no raw PII, only bands and categories |
| tokensUsed | number?       | Filled after response                                     |
| createdAt  | number        | Epoch ms — logged before the call                         |

---

### `security`

Single-record store. Holds the cryptographic material for **envelope encryption** (Track 2): a random DMK wrapped independently by the PIN and the passphrase. (Field names below are illustrative; the live code uses base64 strings — see `src/core/db/types/index.ts` `SecurityRecord`.)

| Field                          | Type          | Notes                                                                                                                                                                                    |
| ------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                             | `'singleton'` | Fixed primary key — always one record                                                                                                                                                    |
| mkSalt                         | string        | Salt retained from the original MK derivation (migration)                                                                                                                                |
| kekSalt                        | string        | Salt for the PIN-derived KEK (PBKDF2, 200K iterations)                                                                                                                                   |
| encryptedMasterKey             | string        | DMK wrapped by the **PIN**-KEK (base64)                                                                                                                                                  |
| encryptedMasterKeyByPassphrase | string?       | **Track 2** — DMK wrapped by the **passphrase**-KEK (base64). Added lazily for migrated vaults; set at init for new ones                                                                 |
| passphraseKekSalt              | string?       | **Track 2** — salt for the passphrase-KEK (PBKDF2, 600K iterations)                                                                                                                      |
| recoverySalt                   | string?       | **Track F (F3)** — base64 salt fed into PBKDF2(passphrase) to derive the account's Ed25519 passphrase-recovery keypair. Non-secret.                                                      |
| recoveryPublicJwk              | string?       | **Track F (F3)** — the Ed25519 recovery PUBLIC key (JWK, JSON string). Uploaded at claim as the server-side recovery verifier; re-derived on passphrase change. Non-secret.              |
| passphraseVerifier             | string        | Verifies the passphrase without unwrapping the DMK                                                                                                                                       |
| pinAttempts                    | number        | Failed PIN attempts (shared across unlock / Open-mode / change-PIN); resets on success                                                                                                   |
| lockedUntil                    | number?       | Epoch ms — exponential-backoff lockout expiry after 5 failed attempts                                                                                                                    |
| pinChangedAt                   | number?       | Epoch ms — drives the 21-day rotation reminder AND the once-per-24h change limit                                                                                                         |
| passphraseAttempts             | number?       | **Track F** — failed passphrase-verification attempts (Forgot-PIN unlock + PIN reset). Separate from `pinAttempts` so exhausting one factor never locks out the other; resets on success |
| passphraseLockedUntil          | number?       | **Track F** — epoch ms — exponential-backoff lockout expiry for `passphraseAttempts`                                                                                                     |
| passphraseChangedAt            | number?       | **Track F** — epoch ms — once-per-24h throttle for `changePassphrase`; not checked by the emergency `resetPinWithPassphrase` path                                                        |
| sessionExpiresAt               | number?       | Epoch ms — session/auto-lock expiry                                                                                                                                                      |
| wipeAfterAttempts              | number?       | **Track 2** — opt-in: erase all data after this many consecutive failed PIN attempts (undefined = off)                                                                                   |

Changing the passphrase or PIN re-derives the relevant KEK and re-wraps the **same** DMK — `encryptedMasterKey*` changes, the data does not.

---

### `subscriptions`

Recurring subscription services, confirmed or auto-detected.

| Field           | Type                                | Notes                                                    |
| --------------- | ----------------------------------- | -------------------------------------------------------- |
| id              | string (UUID)                       | Primary key                                              |
| name            | string                              | e.g. `'Netflix'`, `'Spotify'` — public name, safe for AI |
| amount          | number                              | Subscription cost in ₹                                   |
| frequency       | `'monthly' \| 'yearly' \| 'weekly'` | Billing cycle                                            |
| categoryId      | string?                             | FK → expense_categories                                  |
| nextDueDate     | number?                             | Epoch ms — next charge date                              |
| detectedAt      | number                              | Epoch ms — when first detected or created                |
| confirmedByUser | boolean                             | True once user explicitly confirms this subscription     |

---

### `personal_ious` (legacy — Phase 1)

> **Deprecated** by `persons` + `ledger_entries` (Phase 1.5 Track 1). Retained for one release for
> the `penny_iou_v2` migration backfill and for restoring legacy backups. No new records written.

Flat lent/borrowed records. Fields: `id`, `direction` (`'lent'|'borrowed'`), `amount`, `description`
(person name was stuffed here), `date`, `dueDate?`, `isSettled`, `settledAt?`, `notes?`.

---

### `persons`

Counterparties in the IOU ledger (a pairwise "you ↔ them" relationship). Encrypted; id-only index
(Dexie v7). Name/phone are **Category 1 PII — never sent raw to AI** (use `assignOrdinalLabels` in
`core/iou/aiLabels.ts`).

| Field                 | Type          | Notes                                                       |
| --------------------- | ------------- | ----------------------------------------------------------- |
| id                    | string (UUID) | Primary key                                                 |
| name                  | string        | **PII — never sent raw to AI**                              |
| phone                 | string?       | Local reference only — PII                                  |
| notes                 | string?       | Free text                                                   |
| linkedMemberId        | string?       | Future group-sync hook (Phase 1.5 Track E); null in Track 1 |
| isArchived            | boolean?      | Soft-archived when a person with history is removed         |
| promotedToGroupId     | string?       | Set when this person's ledger was promoted to a real Group (`PromoteToGroupWizard.tsx`, real-device-testing-pass.md Phase 3) — the personal ledger stays archived (never deleted); the Archived section shows a "→ Now in {group}" link instead of Restore/Trash |
| createdAt / updatedAt | number        | Epoch ms                                                    |

### `ledger_entries`

One entry in a person's running ledger. Net balance is **derived** (`core/iou/ledger.ts`), never
stored — there is no `isSettled` flag (a person is settled when net ≈ 0). Encrypted; id-only index
(Dexie v7).

| Field                 | Type                                   | Notes                                                                                                                                                                           |
| --------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                    | string (UUID)                          | Primary key                                                                                                                                                                     |
| personId              | string                                 | FK → `persons.id` (app-level)                                                                                                                                                   |
| kind                  | `'lent' \| 'borrowed' \| 'settlement'` | Sign: lent `+`, borrowed `−`, settlement per `settleDirection`                                                                                                                  |
| amount                | number                                 | Always positive (₹)                                                                                                                                                             |
| date                  | number                                 | Epoch ms                                                                                                                                                                        |
| dueDate               | number?                                | Epoch ms — lent/borrowed only                                                                                                                                                   |
| description / notes   | string?                                | Free text context                                                                                                                                                               |
| settleDirection       | `'they_paid_you' \| 'you_paid_them'`?  | Settlement only                                                                                                                                                                 |
| origin                | `'manual' \| 'expense' \| 'migration'` | Provenance                                                                                                                                                                      |
| linkedTxnId           | string?                                | The account transaction (Expense for lent/you-paid, Income for borrowed/they-paid) recording this entry's money movement. **Linked both ways — deleting either side cascades.** |
| remoteId              | string?                                | Future group-sync hook (Phase 1.5 Track E)                                                                                                                                      |
| createdAt / updatedAt | number                                 | Epoch ms                                                                                                                                                                        |

---

### `credit_profile`

User's credit bureau data. The raw report is encrypted and **never** sent to AI.

| Field                | Type          | Notes                                                                          |
| -------------------- | ------------- | ------------------------------------------------------------------------------ |
| id                   | string (UUID) | Primary key                                                                    |
| score                | number?       | 300–900 credit score                                                           |
| scoreRange           | string?       | e.g. `'750–799'` — banded form safe for AI                                     |
| reportDate           | number?       | Epoch ms — when the report was fetched                                         |
| summary              | string?       | Plain-language summary — safe for AI in banded form                            |
| raw_report_encrypted | string?       | Full bureau report — **NEVER sent to AI** — contains PAN and tradeline details |

---

### `accounts`

Bank accounts, wallets, and cash holdings. Used as source/destination for expense transactions.

| Field                         | Type                                                                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                            | string (UUID)                                                          | Primary key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| name                          | string                                                                 | e.g. `'HDFC Savings'`, `'Cash Wallet'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| type                          | `'cash' \| 'bank' \| 'credit_card' \| 'wallet'`                        | Corrected 2026-08-15 — this row previously documented a stale `'savings'\|'current'\|...` enum that never matched the real code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| openingBalance                | number?                                                                | Balance at time of account creation in Penny                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| color                         | string?                                                                | Hex color for UI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| icon                          | string?                                                                | Tabler icon name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| hideInSafeMode                | boolean?                                                               | Safe Mode masks this account's balance; undefined/false = visible. Set from Settings → Safe Mode.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| openingBalanceAsOfDate        | number?                                                                | **Populated 2026-08-09, bank balance sync Stage 3** (field added Stage 0). Epoch ms — the date `openingBalance` is "as of." Absent = legacy/implicit "before every transaction that exists" (unchanged existing behavior for every account that predates this feature or has never had a bank-statement import). Set on an account's first-ever bank-statement import (§10a), or moved earlier by a later anchor-shift (§14). Convention: this is the SAME calendar day as the anchor transaction's own date, not "the day before" — see `openingBalanceAnchor.ts`'s own doc comment for why. See `docs/plans/bank-balance-sync.md` §4/§10a/§14.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| coveredStatementRanges        | `ImportBatchSummary[]?`                                                | **Populated 2026-08-08, bank balance sync Stage 2.** One entry per completed statement-import batch, for BOTH `bank` and `credit_card` accounts (batch-level history, not the bank-only checkpoint/balance-sync guarantee itself). `ImportBatchSummary = { batchId, start, end, importedAt, fileName, matchedCount, addedCount, skippedCount, skippedRows: { rawNarration, date, amount, direction?, rowIndex? }[] }` — `start`/`end` are the file's own actual min/max transaction date. `skippedRows[].direction` **added 2026-08-10** so the Full Ledger view can render a correctly-signed amount for a still-unresolved row. `skippedRows[].rowIndex` **added 2026-08-11** — the original statement file's own 1-based line number, the precise identity two genuinely-identical-looking-but-separate skipped transactions need to never be confused with each other (see `bank_statement_imports.sourceRowIndex`, the matching field on the resolved side). Both optional because batches committed before each field existed lack it. Powers gap-detection (§11b), deferred lone-wolf escalation (§12), the commit confirmation's skipped-row line, the Import History screen, and the Full Ledger's skipped-row sweep. Append-only. See `docs/plans/bank-balance-sync.md` §4/§7 Stage 2 and `docs/plans/bank-reconciliation-ledger.md`.                      |
| anchorReference               | `{ oldOpeningBalance, oldAnchorDate, newOpeningBalance, detectedAt }?` | **Renamed from `anchorDisagreement` 2026-08-09** (bank balance sync Stage 3/4 redesign — fixed a "frozen forever" bug found via on-device testing: the old field stored a full, once-computed `{ detectedAt, oldOpeningBalance, oldAnchorDate, impliedOldBalance, diff }` snapshot that never updated even after a later corrective import actually fixed the ledger). Now stores ONLY immutable historical facts — what the OLD anchor was, the backfill's OWN un-back-derived claim (`newOpeningBalance`, added 2026-08-09 same day to fix a SECOND bug: without it, the live check trivially agreed with itself since the account's real `openingBalance` is back-derived FROM this comparison — see `openingBalanceAnchor.ts`'s `backDerivedOpeningBalance` doc comment), and when this was first flagged (§14b's "keep the original, flag for later" choice). The comparison against it (`impliedOldBalance`/`diff`/`agrees`) is never stored — always recomputed LIVE from current transactions (`openingBalanceAnchor.ts`'s `recomputeAnchorAgreement`, called from `core/bank-import/accountVerification.ts`), exactly like a checkpoint mismatch already was. Absent = no open disagreement (or a formerly-open one that's since been explicitly resolved). See `docs/plans/bank-balance-sync.md`'s 2026-08-09 entry and §3 decision #10/§14b/§7 Stage 3/4. |
| dismissedVerificationFindings | `{ fingerprint, dismissedAt }[]?`                                      | **New 2026-08-09, bank balance sync Stage 4.** Balance-verification findings explicitly acknowledged via the "I've reviewed this, dismiss" action — scoped to the SPECIFIC finding via a stable fingerprint of its own identifying facts (which checkpoint pair / which standing-gap expense set / which anchor-disagreement event), never a blanket per-account silence. A new, different finding of any kind still surfaces even if an earlier, unrelated one was dismissed. Never auto-pruned — a stale, no-longer-matching fingerprint is simply never re-matched. See `docs/plans/bank-balance-sync.md` §9 Q1/§7 Stage 4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| dismissedSkippedRows          | `{ fingerprint, dismissedAt }[]?`                                      | **New 2026-08-10, `docs/plans/bank-reconciliation-ledger.md` Phase 1.** The Full Ledger view's "not mine, stop flagging this" action for a still-unresolved skipped statement row — same fingerprint-scoped, never-auto-pruned convention as `dismissedVerificationFindings`, but keyed by `batchId` + normalized narration + date + amount (`ledger.ts`'s `buildSkippedRowFingerprint`) rather than a verification-finding identity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| bankId                        | `BankPresetId?`                                                        | **New 2026-08-15, SMS-Based Transaction Tracking** (`docs/plans/sms-transaction-tracking.md` §3). Which bank this account belongs to — optional, settable from the account-edit screen. Used to resolve an SMS's bank sender to this account when exactly one non-archived account shares that `bankId`; falls back to a persisted sender→account mapping (`sms_account_mappings` below) otherwise. Doesn't feed Bank Statement Import, which already receives its target account explicitly. No migration — absent on every account created before this field existed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| last4                         | string?                                                                | **New 2026-08-15**, same feature as `bankId` above. Last 4 digits of THIS ACCOUNT's own number only — never a card number (see `sms_account_mappings`'s `card_last4` mapping kind for that case) and never the full number (`docs/PRIVACY.md` Category-1). Same no-migration treatment as `bankId`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

---

### `activity_log`

User-initiated data changes (Pre-Phase 1.5, Track 4). Encrypted; id-only index (Dexie v4). Powers the
**Timeline**: undo/restore, per-item history, diffs, streaks, the privacy receipt, Money Story, and
restore points. Pruned to the newest ~500 entries.

| Field          | Type                                                                                                                                                     | Notes                                                                                                                                                                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id             | string (UUID)                                                                                                                                            | Primary key                                                                                                                                                                                                                                                                                               |
| timestamp      | number                                                                                                                                                   | Epoch ms                                                                                                                                                                                                                                                                                                  |
| action         | `'CREATE' \| 'UPDATE' \| 'DELETE' \| 'MERGE' \| 'BULK_DELETE' \| 'BULK_MOVE' \| 'BULK_UPDATE' \| 'IMPORT' \| 'UNDO_IMPORT' \| 'RESTORE' \| 'CHECKPOINT'` | `UNDO_IMPORT` (2026-08-06) is its own dated entry logged when an `IMPORT` batch is undone — see `relatedLogId` below                                                                                                                                                                                      |
| entityType     | string                                                                                                                                                   | e.g. `'expense'`, `'holding'`, `'goal'`, `'system'` (checkpoints)                                                                                                                                                                                                                                         |
| entityId       | string                                                                                                                                                   | id of the affected record (or synthetic for bulk/checkpoint)                                                                                                                                                                                                                                              |
| summary        | string                                                                                                                                                   | Human-readable, e.g. `'Deleted expense: Swiggy ₹340'` (₹ masked in UI outside Open mode)                                                                                                                                                                                                                  |
| actor          | string?                                                                                                                                                  | Who performed it; unused in Phase 1 (always self) — for the Phase 1.5 household feed                                                                                                                                                                                                                      |
| snapshot       | string?                                                                                                                                                  | JSON of the deleted record(s) — enables Undo / Recently Deleted restore. `IMPORT`'s snapshot is a list of created expense ids (what to delete); `UNDO_IMPORT`'s snapshot (2026-08-06) is the FULL expense records those ids resolved to at undo time (what to restore) — deliberately not the same shape. |
| cascade        | string?                                                                                                                                                  | JSON `[{ entityType, record }]` of other-type records deleted alongside (e.g. an expense's linked IOU entries) — restored together for atomic Undo                                                                                                                                                        |
| diff           | string?                                                                                                                                                  | JSON `{ field: [before, after] }` for UPDATE — beautiful diffs + future revert                                                                                                                                                                                                                            |
| entityCount    | number?                                                                                                                                                  | Records affected (bulk actions)                                                                                                                                                                                                                                                                           |
| restorePointId | string?                                                                                                                                                  | Groups entries under a named checkpoint (reserved for richer rewind)                                                                                                                                                                                                                                      |
| restored       | boolean?                                                                                                                                                 | `true` once a deleted entry has been restored (hides it from Recently Deleted). For an `IMPORT` entry, also flips back to `false` if its paired `UNDO_IMPORT` entry is itself later restored (see `relatedLogId`) — so the batch becomes undoable again instead of staying in a dead end.                 |
| relatedLogId   | string?                                                                                                                                                  | (2026-08-06) Links an `IMPORT` entry to the `UNDO_IMPORT` entry that reversed it, and vice versa — lets restoring the `UNDO_IMPORT` entry flip the original `IMPORT` entry's `restored` back to `false`. Unused by every other action.                                                                    |

---

### `merchant_memory`

Remembers the category/account/payment last used per merchant for Add-transaction auto-fill (Pre-Phase 1.5, Track 6). Encrypted; id-only index (Dexie v5). Local precursor to the Phase-2 AI categoriser. Written on every non-transfer save via `buildMemory`, and seeded once from existing transaction history via `buildMemoriesFromExpenses` (guarded by the `penny_merchant_memory_v1` localStorage flag). See `core/expenses/merchantMemory.ts`.

| Field       | Type                                  | Notes                                                                                                         |
| ----------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| id          | string                                | `` `${type}::${normalizedDescription}` `` — namespaced so income/expense with the same merchant don't collide |
| description | string                                | Last raw (trimmed) description, for display in the auto-fill hint                                             |
| type        | `'expense' \| 'income' \| 'transfer'` | Transaction type the memory applies to (transfers are never stored)                                           |
| categoryId  | string                                | Remembered category                                                                                           |
| accountId   | string?                               | Remembered account                                                                                            |
| paymentMode | string?                               | Remembered payment mode                                                                                       |
| amount      | number?                               | (2026-08-22) The most recent matching transaction's amount — shown alongside the suggestion and pre-filled (still user-editable) on tap in `ExpenseForm.tsx`. Optional: rows written before this field existed won't have it until the next matching save re-derives them. |
| usageCount  | number                                | Incremented on each matching save                                                                             |
| updatedAt   | number                                | Epoch ms                                                                                                      |

---

### `transaction_templates`

User-saved quick-add presets/favorites (Pre-Phase 1.5, Track 6 Step 10). Encrypted; id-only index (Dexie v6). Tapped to prefill the Add form; created via "Save as template" in the form.

| Field       | Type                                  | Notes                                 |
| ----------- | ------------------------------------- | ------------------------------------- |
| id          | string (UUID)                         | Primary key                           |
| label       | string                                | Chip label (≤24 chars), e.g. "Coffee" |
| type        | `'expense' \| 'income' \| 'transfer'` | Transaction type the template creates |
| description | string                                | Prefilled description                 |
| categoryId  | string                                | Prefilled category                    |
| amount      | number?                               | Optional — omit to prompt on use      |
| accountId   | string?                               | Prefilled account                     |
| paymentMode | string?                               | Prefilled payment mode                |
| createdAt   | number                                | Epoch ms                              |

---

## Sync / identity crypto stores (Phase 1.5 Track B)

Client-side cryptographic material the backend tracks (C/D/E) depend on. All are DMK-encrypted like every other store and ride recovery via `BACKUP_STORES`. Added in Dexie v8; id-only index; populated lazily post-unlock at claim (start empty — no backfill).

### `device_keys`

This device's identity keypairs — one record per kind (`id` = kind). `sign` is an ECDSA P-256 keypair (authenticates worker requests by signing `nonce||method||path||bodyHash`); `wrap` is an ECDH P-256 keypair (receives the DMK during device pairing and Group Keys during grants). Managed via `src/core/crypto/identityKeys.ts`.

| Field      | Type               | Notes                                            |
| ---------- | ------------------ | ------------------------------------------------ |
| id         | `'sign' \| 'wrap'` | Primary key = kind                               |
| kind       | `'sign' \| 'wrap'` | ECDSA signing key vs ECDH wrapping key           |
| publicJwk  | JsonWebKey         | Public half — uploaded to the worker at register |
| privateJwk | JsonWebKey         | Private half — never leaves the device           |
| createdAt  | number             | Epoch ms                                         |
| updatedAt  | number             | Epoch ms                                         |

### `group_keys`

Per-group AES-256-GCM keys at a given rotation epoch. Composite `id` (`${groupId}:${keyEpoch}`) keeps every epoch so a long-offline member can still decrypt old-epoch events after a rotation (Track E).

| Field     | Type       | Notes                              |
| --------- | ---------- | ---------------------------------- |
| id        | string     | Composite `${groupId}:${keyEpoch}` |
| groupId   | string     | The group this key belongs to      |
| keyEpoch  | number     | Rotation epoch                     |
| jwk       | JsonWebKey | AES-256-GCM Group Key              |
| createdAt | number     | Epoch ms                           |
| updatedAt | number     | Epoch ms                           |

### `sync_cursor`

Bookmarks the sync position per scope so pulls resume where they left off.

| Field        | Type    | Notes                                                                      |
| ------------ | ------- | -------------------------------------------------------------------------- |
| id           | string  | Primary key = scope                                                        |
| scope        | string  | e.g. `'personal-blob'`, `group:${groupId}`                                 |
| version      | number? | Optimistic-concurrency version (reserved)                                  |
| seq          | number? | Group-event sequence (Track E)                                             |
| remoteTag    | string? | Track D: the cloud file's change token (Drive `headRevisionId`/mtime)      |
| pushedAt     | number? | Track D: latest activity timestamp included in the last successful push    |
| lastBackupAt | number? | Track D: epoch ms of the last successful backup (cloud upload or snapshot) |
| createdAt    | number  | Epoch ms                                                                   |
| updatedAt    | number  | Epoch ms                                                                   |

---

## Groups & Household OS (Phase 1.5 Track E)

Local **decrypted mirrors** of the server-relayed (ciphertext-only, Model B) group data. Balances are
never stored — they are **derived by folding `group_events`** (event-sourced projection). Added in Dexie
v9; id-only index; DMK-encrypted like every other store and ride recovery via `BACKUP_STORES`. Populated
post-unlock via the groups worker (`workers/groups/`). Per-group AES keys live in `group_keys` (Track B).

### `groups`

A group the user belongs to. `role`/`status` are **this user's own** membership.

| Field             | Type   | Notes                                           |
| ----------------- | ------ | ----------------------------------------------- |
| id                | string | Primary key = server `group_id`                 |
| type              | string | `family` \| `trip` \| `roommates` \| `other`    |
| name              | string | Decrypted group name (server stores `enc_name`) |
| role              | string | `owner` \| `admin` \| `member` (this user)      |
| status            | string | `active` \| `closed`                            |
| ownerId           | string | `userId` of the owner                           |
| keyEpoch          | number | Current Group-Key rotation epoch                |
| historyVisibility | string | `full` \| `from_join`                           |
| joinedAt          | number | Epoch ms                                        |
| createdAt         | number | Epoch ms                                        |
| updatedAt         | number | Epoch ms                                        |

> **`type: 'family'` changes two behaviors (2026-07).** Sharing an expense into a Family-type group
> defaults the participant picker to just the person sharing it — no split, since Indian family
> spend is usually one-directional, not reciprocal (Trip/Roommates still default to splitting evenly
> across all members). Any expense shared into a Family-type group is also excluded from
> daily-living analytics (`useExpenseAnalytics`'s `classify()`), regardless of category or whether
> it ends up split after all.

### `group_members`

| Field          | Type    | Notes                                              |
| -------------- | ------- | -------------------------------------------------- |
| id               | string   | Composite `${groupId}:${userId}`                   |
| groupId          | string   | FK → `groups.id`                                   |
| userId           | string   | Member's account `userId` — for an `accountless` member, a locally-generated pseudo id (`static:<uuid>`) |
| displayName      | string   | Decrypted display name                             |
| role             | string   | `owner` \| `admin` \| `member`                     |
| status           | string   | `active` \| `left` \| `muted` (mute is local-only) |
| linkedPersonId   | string?  | Bridges to a local `Person` (reuses Track 1 IOU)   |
| accountless      | boolean? | **(2026-08-18)** True for a static/placeholder member — name-only, no real account, can't sync/confirm anything itself; a real member manages splits/settlements on their behalf. Added via `addStaticMember()`; materialized on other devices via `syncGroupMembers()` folding `member_joined` events. |
| upgradedToUserId | string?  | **(2026-08-18)** Reserved upgrade hook: once an `accountless` member's real counterpart joins normally, set to their real `userId` so historical shares can be reattributed. Not built yet — reserved so adding it later needs no migration. |
| joinedAt         | number   | Epoch ms                                           |
| leftAt           | number?  | Epoch ms                                           |
| createdAt        | number   | Epoch ms                                           |
| updatedAt        | number   | Epoch ms                                           |

### `group_events`

Append-only shared ledger (local mirror of the server's event rows). Balances fold over these.

| Field     | Type    | Notes                                                                              |
| --------- | ------- | ---------------------------------------------------------------------------------- |
| id        | string  | Primary key = `eventId` (client UUID)                                              |
| groupId   | string  | FK → `groups.id`                                                                   |
| seq       | number? | Server-assigned total order (undefined until synced)                               |
| lamport   | number  | Client logical clock (tie-break)                                                   |
| authorId  | string  | `userId` of the author                                                             |
| keyEpoch  | number  | Group-Key epoch the payload was encrypted under                                    |
| type      | string  | `shared_expense`/`expense_edit`/`expense_delete`/`expense_flag`/`expense_flag_clear`/`settlement`/`settlement_void`/`member_*`/`group_*` (last two added 2026-08-18 — see below) |
| payload   | unknown | Type-specific (e.g. payer/participants/split); decrypted from the epoch key        |
| createdAt | number  | Epoch ms                                                                           |
| updatedAt | number  | Epoch ms                                                                           |

> **`expense_flag`/`expense_flag_clear` and `settlement_void` (2026-08-18, real-device-testing-pass.md
> Phase 3)** — `expense_flag` lets another member flag someone else's `shared_expense` as "not needed"
> (balance-inert, resolved by a later `expense_flag_clear` = the recorder "Keep"s it, or `expense_delete`
> = they delete it); folded via `groupFlags()` in `groupSync.ts`. `settlement_void` reverses a
> `settlement` (real repayment or write-off) — the fold engine excludes the voided settlement entirely,
> restoring the balance to what it was before. `expense_edit` reuses `shared_expense`'s exact payload
> shape (keyed by the same `expenseId`) — no schema change needed for it; the fold engine's "latest
> wins" is a plain `Map` overwrite, and `groupFeed()` now dedupes an edited expense to one feed row
> (fixed a real bug where it used to show as two).

---

## Bank Statement Import

A deliberately separate parser/matching module (`core/bank-import/`) from the multi-app CSV
importer (`core/import/`) — see [`docs/plans/bank-statement-import.md`](plans/bank-statement-import.md)
for the full feature spec. Both stores added in Dexie v10; id-only index.

### `bank_statement_imports`

One resolved bank-statement line (matched to an existing transaction, or newly recorded), written
only at the feature's final commit step. Serves three purposes so a second table isn't needed:
audit trail (a linked transaction can show what statement line it matched), the merchant-memory
backing store (queried globally by `normalizedKey`, joined against `linkedTxnId`'s transaction for
a category/description suggestion), and dedup against a re-uploaded overlapping-range statement.

| Field          | Type                                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| id             | string (UUID)                         | Primary key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| batchId        | string                                | Groups every row committed from one import session                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| accountId      | string                                | FK → `accounts` (the statement's account)                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| rawNarration   | string                                | The statement line's raw description, verbatim                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| normalizedKey  | string                                | See `core/bank-import/normalization.ts`; manual overrides win                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| date           | number                                | Epoch ms — statement line's date (usually date-only, no time)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| amount         | number                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| type           | `'expense' \| 'income' \| 'transfer'` |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| linkedTxnId    | string                                | FK → `expenses` — the existing or newly-created transaction                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| createdAt      | number                                | Epoch ms                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| sourceRowIndex | number?                               | **Added 2026-08-11** (`docs/plans/bank-reconciliation-ledger.md`) — the original statement file's own 1-based line number (`ParsedStatementRow.rowIndex`), set for every record whether live-matched at commit or resolved/relinked later. Lets Full Ledger Phase 2 tell apart two genuinely separate transactions that happen to share identical narration/date/amount, rather than confusing them via value-only matching. Optional because records written before this field existed lack it. |

### `bank_narration_overrides`

Manual overrides for the normalization heuristic — always take priority over its automatic
keyword-stripping guess. Global across all accounts; managed from the Accounts page's
normalization-override screen.

| Field         | Type          | Notes                                                           |
| ------------- | ------------- | --------------------------------------------------------------- |
| id            | string (UUID) | Primary key                                                     |
| keyword       | string        | As typed by the user; matched case-insensitively as a substring |
| normalizedKey | string        | Uppercased, trimmed — what matching lines should normalize to   |
| createdAt     | number        | Epoch ms                                                        |
| updatedAt     | number        | Epoch ms                                                        |

### `bank_cash_withdrawal_codes`

Narration codes/keywords (ATW, NWD, SELF, ...) that identify a bank statement line as a cash
withdrawal, so it can be auto-classified as a Transfer to the user's cash account instead of a plain
expense (2026-08-05). Seeded once from `core/bank-import/cashWithdrawalCodes.ts`'s
`BANK_CASH_WITHDRAWAL_CODE_SEEDS` (`~/hooks/useBankCashWithdrawalCodes.ts`, mirroring
`usePaymentModes.ts`'s exact seeding pattern) — a researched starting point, not a guarantee (see
that file's doc comment for per-entry confidence notes), so every row including the defaults is
user-editable/deletable. `id` is a stable, deterministic slug for the seeded defaults (e.g.
`cwc-hdfc-atw`), a random UUID for user-added ones. Global across all accounts; managed from the
Accounts page's cash-withdrawal-codes screen (`features/bank-import/BankCashWithdrawalCodesPage.tsx`).

| Field     | Type    | Notes                                                                   |
| --------- | ------- | ----------------------------------------------------------------------- |
| id        | string  | Stable slug for defaults, UUID for custom entries                       |
| bankId    | string  | A `BankPresetId` value, or the literal `'any'` for a bank-agnostic code |
| code      | string  | As typed; matched case-insensitively, whole-word, against the narration |
| label     | string  | Short human description of what the code means                          |
| isDefault | boolean | Seeded vs user-added — informational only, doesn't block deletion       |
| createdAt | number  | Epoch ms                                                                |
| updatedAt | number  | Epoch ms                                                                |

### `payment_modes`

Every payment mode — the 5 built-ins (cash/upi/card/net/wallet) AND custom ones — as real rows.
Seeded once from `core/expenses/paymentModes.ts`'s `DEFAULT_PAYMENT_MODES` (`~/hooks/usePaymentModes.ts`,
mirroring how `ALL_DEFAULT_CATEGORIES` is seeded for `expense_categories`) — real rows from the
start, not a read-time-only merge, is what lets a default's icon/colour/label actually be edited in
place, the same way a default `ExpenseCategory` can be (2026-08-03). `isDefault` gates deletability
the same way `ExpenseCategory.isDefault` does: editable, never deletable; a custom mode is both, but
only while unused (`Expense.paymentMode` usage count === 0). `id` is a stable, deterministic slug
(not a random UUID) so existence can be checked with a plain id lookup — this is what lets Bank
Statement Import create a rail-specific mode (NEFT/IMPS/RTGS/Cheque) exactly once, the first time
it's needed, rather than once per transaction. Managed from the Accounts page's "Payment modes"
section (`features/accounts/PaymentModesSection.tsx`).

| Field     | Type    | Notes                                     |
| --------- | ------- | ----------------------------------------- |
| id        | string  | Stable slug, e.g. `neft`, `cheque`        |
| label     | string  | Display label, e.g. "NEFT"                |
| icon      | string  | Tabler icon class                         |
| color     | string  | Hex accent color                          |
| isDefault | boolean | true for the 5 built-ins; never deletable |
| createdAt | number  | Epoch ms                                  |
| updatedAt | number  | Epoch ms                                  |

### `retirement_plan`

Single-record store (same singleton pattern as `profile` — no fixed id assumed, `useRetirementPlan()`
lazily creates it with defaults the first time it's read; there's no onboarding step that seeds it).
Shared by Home's Retirement Corpus card and the FIRE Calculator — editing either place updates both.

| Field                  | Type    | Notes                                                                      |
| ---------------------- | ------- | -------------------------------------------------------------------------- |
| id                     | string  | Primary key                                                                |
| retirementAge          | number  | Default 60                                                                 |
| expectedReturnPct      | number  | Default 12                                                                 |
| inflationPct           | number  | Default 6                                                                  |
| swrPct                 | number  | Safe withdrawal rate, default 4                                            |
| monthlyInvestment      | number  | Default 0                                                                  |
| monthlyExpenseOverride | number? | undefined = derive live from trailing actual spend; set once user edits it |
| createdAt              | number  | Epoch ms                                                                   |
| updatedAt              | number  | Epoch ms                                                                   |

### `net_worth_snapshots`

One row per calendar month, captured at most once per month (first app-open in a new month — see
`useHome.ts`). Builds up a real historical line for the Retirement Corpus chart over time; never
backfilled synthetically (holdings have no historical price series, only cash/bank balances are
exactly reconstructable for a past date).

| Field            | Type   | Notes                                                                     |
| ---------------- | ------ | ------------------------------------------------------------------------- |
| id               | string | Primary key                                                               |
| monthKey         | string | `'YYYY-MM'`                                                               |
| investableCorpus | number | See `core/calculators/retirementProjection.ts`'s `calcInvestableCorpus()` |
| netWorth         | number | Same figure `useHome.ts` returns as `HomeSummary.netWorth`                |
| capturedAt       | number | Epoch ms                                                                  |

---

## SMS-Based Transaction Tracking (Android only)

A deliberately separate module (`core/sms-import/`) from both `core/bank-import/` and `core/import/`
— see [`docs/plans/sms-transaction-tracking.md`](plans/sms-transaction-tracking.md) for the full
feature spec. SMS Tracking is a THIRD, independent way to record a transaction (alongside manual
entry and CSV import), not a replacement for or variant of Bank Statement Import, which stays the
separate reconciliation feature. Both stores added in Dexie v14; id-only index.

### `sms_transactions`

One parsed (or parse-attempted) SMS candidate. Mirrors `bank_statement_imports`' three-purpose shape
(audit trail + merchant-memory-style backing store + re-processing dedup) rather than overloading
`Expense.sourceRef`. Written for EVERY sender-allowlisted SMS regardless of outcome — including one
that matched a known bank's sender but no template (`status: 'unparsed'`, kept visible/exportable on
the Unparsed Messages screen rather than silently dropped), and a dismissed/ignored one — so Tier-1
provenance dedup (`contentHash`) can recognize a re-scanned duplicate at any status.

| Field                   | Type                                                                                                 | Notes                                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                      | string (UUID)                                                                                        | Primary key                                                                                                                                           |
| contentHash             | string                                                                                               | Tier-1 exact-provenance dedup key — hash of (sender, receivedAt, body)                                                                                |
| sender                  | string                                                                                               | Raw SMS sender id/shortcode (e.g. `'VM-HDFCBK'`) — never the phone's own number                                                                       |
| rawBody                 | string?                                                                                              | Retained only while `status` is `'unparsed' \| 'needs_review' \| 'ready'`; cleared once `linked`/`dismissed`. Never reaches `buildUserContext()`/Chip |
| receivedAt              | number                                                                                               | Epoch ms, SMS-received timestamp — always present                                                                                                     |
| date                    | number?                                                                                              | Actual transaction date — body-embedded date if the template captured one, else `receivedAt`. Absent only when `status === 'unparsed'`                |
| amount                  | number?                                                                                              | Absent only when `status === 'unparsed'`                                                                                                              |
| direction               | `'debit' \| 'credit'`?                                                                               | Absent only when `status === 'unparsed'`                                                                                                              |
| transactionType         | `'debit' \| 'credit' \| 'upi_sent' \| 'upi_received' \| 'card_swipe' \| 'refund'`?                   | Absent only when `status === 'unparsed'`                                                                                                              |
| counterparty            | string?                                                                                              | Extracted merchant/counterparty text — feeds merchant-memory suggestions like any other recording method                                              |
| accountLast4            | string?                                                                                              | Masked account tail from the SMS body (never a card number — see `cardLast4`)                                                                         |
| cardLast4               | string?                                                                                              | Masked card tail, when the message is clearly card-rail — resolves via its own mapping tier (`sms_account_mappings`)                                  |
| referenceNumber         | string?                                                                                              |                                                                                                                                                       |
| balance                 | number?                                                                                              | Available-balance figure, shown for context only — never used in matching                                                                             |
| bankId                  | `BankPresetId?`                                                                                      | Which bank this SMS's sender resolved to, independent of whether an `accountId` was matched                                                           |
| paymentModeGuess        | string?                                                                                              | Inferred `payment_modes.id` — always editable, never auto-applied silently                                                                            |
| accountId               | string?                                                                                              | FK → `accounts`. Absent while `reviewReason === 'ambiguous_account'`                                                                                  |
| status                  | `'unparsed' \| 'needs_review' \| 'ready' \| 'linked' \| 'dismissed'`                                 |                                                                                                                                                       |
| reviewReason            | `'ambiguous_account' \| 'possible_match' \| 'possible_duplicate_sms' \| 'reconciled_date_conflict'`? | Only meaningful when `status === 'needs_review'`                                                                                                      |
| possibleMatchExpenseIds | string[]?                                                                                            | Populated for `'possible_match'`/`'reconciled_date_conflict'` — candidates the Possible-match side-by-side screen shows                               |
| possibleDuplicateSmsIds | string[]?                                                                                            | Populated for `'possible_duplicate_sms'` — the other `sms_transactions` id(s) that might describe the same real event                                 |
| linkedTxnId             | string?                                                                                              | FK → `expenses`, set once `status === 'linked'`. That `Expense` is never edited as a result of linking — this is purely the audit pointer             |
| createdAt               | number                                                                                               | Epoch ms                                                                                                                                              |
| updatedAt               | number                                                                                               | Epoch ms                                                                                                                                              |

### `sms_account_mappings`

Persisted, user-confirmed mapping from a normalized SMS bank-string or a card's last-4 digits to one
of the user's configured `accounts` — not a one-shot fuzzy guess re-run every scan. Written the first
time an ambiguous sender/card is resolved, read on every subsequent SMS from the same normalized key.
Editable any time from the SMS Tracking settings sub-page.

| Field      | Type                            | Notes                                                                                                                                                                    |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| id         | string (UUID)                   | Primary key                                                                                                                                                              |
| kind       | `'bank_string' \| 'card_last4'` |                                                                                                                                                                          |
| mappingKey | string                          | `` `${bankId}:${accountLast4 ?? 'unknown'}` `` for `'bank_string'` (built by `buildSmsAccountMappingKey()`, never hand-rolled); the raw last-4 digits for `'card_last4'` |
| rawValue   | string                          | Original human-readable text this mapping was created from — shown in the editable sender-mapping list                                                                   |
| accountId  | string                          | FK → `accounts`                                                                                                                                                          |
| createdAt  | number                          | Epoch ms                                                                                                                                                                 |
| updatedAt  | number                          | Epoch ms                                                                                                                                                                 |

### `sms_excluded_senders`

**New 2026-08-17.** A sender explicitly marked "never a transaction" (a promotional shortcode, a
KYC-reminder service, etc.) — added from the Unparsed Messages screen's per-sender-group "Exclude
sender" action. Checked by `processRawSmsCore` BEFORE it would otherwise create an `'unparsed'`
`sms_transactions` record for a recognized-bank-sender message that didn't match any template — a
matching sender here is dropped exactly like an unrecognized one, never persisted at all, so this
sender's _next_ non-transactional message never resurfaces a fresh "needs review" record either.
Durable and sender-wide, unlike `sms_transactions.status === 'dismissed'` (which only clears ONE
already-created record's instance, not future ones from the same sender) — for a sender that mixes
real transactions with noise, dismissing individual messages stays the right tool, which is why both
exist rather than one replacing the other.

| Field     | Type          | Notes                                                                                                                                                    |
| --------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id        | string (UUID) | Primary key                                                                                                                                              |
| sender    | string        | The literal SMS sender/shortcode string as reported by the OS (e.g. `"VM-HDFCBK-S"`) — NOT normalized, so exclusion stays precise to the exact sender ID |
| createdAt | number        | Epoch ms                                                                                                                                                 |

---

## Server-side tables (NOT Dexie — Cloudflare D1)

These live in the **auth worker's D1 database** (`workers/auth/`, Phase 1.5 Track C), not in the
on-device IndexedDB. Identity metadata only — **no financial data, no PII, no personal blob (Model B)**.
Canonical schema: [`workers/auth/migrations/0001_init.sql`](../workers/auth/migrations/0001_init.sql).

- **`users`** — `user_id` (PK = client `Profile.userId`), `username` (UNIQUE, nullable), `signing_key`
  (account ECDSA public JWK), `kdf_salt?` (unused by Model B recovery), `created_at`, `updated_at`.
- **`devices`** — `device_id` (PK), `user_id`, `signing_key` (device ECDSA public JWK — verifies its
  signed requests), `wrapping_key` (device ECDH public JWK — receives DMK/group keys later), `label`,
  `created_at`, `revoked_at`.

The **groups worker's D1** (`workers/groups/`, Phase 1.5 Track E) holds group metadata + membership +
the events — **ciphertext only** (encrypted name, wrapped key grants; event bodies stored inline). It binds
the auth D1 read-only (`AUTH_DB`) for device-key lookup during signature verification. Canonical schema:
[`workers/groups/migrations/0001_init.sql`](../workers/groups/migrations/0001_init.sql).

- **`groups`** — `group_id` (PK), `type`, `enc_name` (AES-GCM ciphertext), `owner_id`, `key_epoch`,
  `history_visibility`, `status`, `created_at`, `updated_at`.
- **`group_members`** — PK(`group_id`,`user_id`), `role`, `status`, `joined_at`, `left_at`.
- **`invites`** — `token_hash` (PK, `SHA-256(secret)`), `group_id`, `role`, `expires_at`, `max_uses`,
  `uses`, `revoked`, `created_by`, `created_at`. The raw secret lives only in the share link/QR.
- **`group_key_grants`** — PK(`group_id`,`user_id`,`key_epoch`), `wrapped_key` (opaque ciphertext
  envelope: granter's wrapping public JWK + the wrapped Group Key), `created_at`.
- **`group_events`** — PK(`group_id`,`seq`), `event_id` (client UUID, idempotency), `author_id`,
  `key_epoch`, `ciphertext`, `lamport`, `created_at`. Event body = `ciphertext` column =
  `AES-GCM(GroupKey_epoch, eventJson)`, stored inline in D1 (no R2 — the blobs are tiny).

---

## Plain stores (no encryption)

### `price_cache`

Cached market prices fetched from external APIs. No personal data — safe to store unencrypted.

| Field     | Type    | Notes                                                              |
| --------- | ------- | ------------------------------------------------------------------ |
| key       | string  | Composite key e.g. `'mf_118834'`, `'stock_RELIANCE'` — primary key |
| data      | unknown | Raw API response JSON — shape varies by source                     |
| updatedAt | number  | Epoch ms — when this entry was last fetched                        |
| ttlMs     | number  | How long this cache entry is valid (varies by asset class)         |

---

### `privacy_stats`

Aggregated telemetry about AI calls made from this device. No personal data.

| Field        | Type   | Notes                                               |
| ------------ | ------ | --------------------------------------------------- |
| domain       | string | API domain e.g. `'api.anthropic.com'` — primary key |
| callCount    | number | Total calls made to this domain                     |
| bytesSent    | number | Approximate bytes sent to this domain               |
| lastCalledAt | number | Epoch ms — most recent call                         |
