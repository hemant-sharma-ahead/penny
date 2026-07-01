# Penny — Database Schema

All stores use Dexie.js (IndexedDB). All primary keys are UUIDs (not auto-increment — required for future cross-device sync).

Encrypted stores use `EncryptedRepository<T>`, which wraps Dexie and transparently encrypts fields on write and decrypts on read via the in-memory Master Key. Plain stores are written directly to IndexedDB with no encryption.

**Store counts:** 19 active stores total — 17 encrypted + 2 plain.

**Schema versions:**

- v1: Initial 19 stores including `accounts`
- v2: Added index on `accounts.id`
- v3: Dropped `assets` store (superseded by `holdings` with `assetClass` field)

---

## Encrypted stores

### `profile`

Single-record store. The user's identity and app preferences.

| Field              | Type                                                                           | Notes                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| id                 | string (UUID)                                                                  | Primary key                                                                                            |
| displayName        | string                                                                         | User's full name (also used as the display name)                                                       |
| currency           | `'INR'`                                                                        | Always INR in Phase 1                                                                                  |
| locale             | `'en-IN'`                                                                      | Always en-IN in Phase 1                                                                                |
| onboardingComplete | boolean                                                                        | AuthGuard checks profile existence (field name is `onboardingComplete` in code)                        |
| dob                | string?                                                                        | ISO date (YYYY-MM-DD) — Track 2. Encrypted; only a 5-year age band ever sent to AI                     |
| employmentType     | `'salaried' \| 'self_employed' \| 'business_owner' \| 'student' \| 'retired'`? | Track 2; gates EPF visibility, tax deductions, health benchmarks                                       |
| username           | string?                                                                        | Track 2; 3–20 lowercase alphanumeric/underscore. Local now; server-checked for uniqueness in Phase 1.5 |
| userId             | string?                                                                        | Track 2; local identity id, "claimed" on the server at Phase 1.5 registration                          |
| plan               | `'free' \| 'pro'`?                                                             | Track 2; entitlement marker. Always effectively pro until pricing ships                                |

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

---

### `expenses`

Every income, expense, and transfer transaction.

| Field           | Type                                  | Notes                                                                                                                      |
| --------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| id              | string (UUID)                         | Primary key                                                                                                                |
| amount          | number                                | Always positive; `type` determines direction                                                                               |
| merchant        | string                                | Shown locally only — stripped before any AI call                                                                           |
| categoryId      | string                                | FK → expense_categories                                                                                                    |
| date            | number                                | Epoch ms — **includes the time-of-day** (set via `lib/date.dateInputToEpoch`) so same-day transactions order by entry time |
| type            | `'expense' \| 'income' \| 'transfer'` |                                                                                                                            |
| notes           | string?                               | Free text; hashtags are parsed from here                                                                                   |
| hashtags        | string[]?                             | Parsed tags e.g. `['emi', 'travel']`                                                                                       |
| paymentMode     | string?                               | e.g. `'UPI'`, `'credit_card'`, `'cash'`                                                                                    |
| accountId       | string?                               | FK → accounts (source account)                                                                                             |
| toAccountId     | string?                               | FK → accounts — transfers only                                                                                             |
| eventId         | string?                               | FK → hashtags where eventType is set                                                                                       |
| recurringRuleId | string?                               | FK → subscriptions or internal rule                                                                                        |
| isRecurring     | boolean?                              | True if part of a confirmed recurring pattern                                                                              |
| receiptDataUrl  | string?                               | Local receipt photo — compressed JPEG data URL (Track 6 Step 11). Encrypted at rest; never sent to AI.                     |

---

### `expense_categories`

Default and user-created categories for classifying expenses.

| Field        | Type                                 | Notes                                                                                                                    |
| ------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| id           | string (UUID)                        | Primary key                                                                                                              |
| name         | string                               | e.g. `'Food'`, `'EMI'`, `'Entertainment'`                                                                                |
| icon         | string                               | Tabler icon class (`ti-*`), chosen via the visual icon picker                                                            |
| color        | string                               | Hex color for UI chips and charts                                                                                        |
| intentGroup  | string?                              | Fixed intent-group key (`'daily_living'`, `'health'`, …) used to group **default** categories. See `INTENT_GROUP_META`.  |
| isDefault    | boolean                              | System-provided defaults (editable, not deletable) vs user-created                                                       |
| isGroup      | boolean?                             | `true` ⇒ this record is a user-created **parent** (grouping header), not selectable for a transaction                    |
| parentId     | string?                              | For a custom leaf category, the id of its parent (`isGroup`) category. Takes precedence over `intentGroup` for grouping. |
| applicableTo | 'expense' \| 'income' \| 'transfer'? | Defaults to `'expense'`                                                                                                  |

> **Grouping (Track 3):** the picker/analytics/filters key off `groupKey(cat) = parentId ?? intentGroup ?? 'other'`; the header label/color comes from the parent record (custom groups) or `INTENT_GROUP_META` (fixed groups). No Dexie store/version change — `isGroup`/`parentId` ride inside the encrypted blob.

> **Sin Goods intent group (Track 7):** a `sin_goods` intent group (in `INTENT_GROUP_META`) with two new default categories — `cat-alcohol` and `cat-tobacco`. These map to high-tax bands in the indirect-tax footprint. Existing users receive them via an **additive, non-destructive** re-seed in `useExpenses.ts` guarded by `penny_cats_v3` (inserts only missing default categories — never re-puts edited ones). No Dexie store/version change.

> **Tax-footprint overrides (Track 7):** stored in `localStorage`, not Dexie — `penny_settings_tax_gross_income`, `penny_settings_tax_direct`, `penny_settings_tax_epf`, `penny_settings_tax_statutory` (optional manual gross-income, income-tax correction, EPF/PF, and professional-tax+LWF overrides for the income waterfall; absent = derive automatically). See `SettingsContext`.

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

User-defined tags that can optionally represent events (vacations, trips, occasions).

| Field      | Type                                  | Notes                                   |
| ---------- | ------------------------------------- | --------------------------------------- |
| id         | string (UUID)                         | Primary key                             |
| name       | string                                | e.g. `'goa-trip'`, `'emi'`, `'wedding'` |
| usageCount | number                                | Incremented on each use                 |
| lastUsed   | number                                | Epoch ms                                |
| eventType  | `'vacation' \| 'background' \| null`? | Classifies the tag as a named event     |
| isActive   | boolean?                              | Whether the event is ongoing            |
| startDate  | number?                               | Epoch ms — event start                  |
| endDate    | number?                               | Epoch ms — event end                    |

---

### `goals`

Financial goals with SIP planning and progress tracking.

| Field          | Type                                    | Notes                                              |
| -------------- | --------------------------------------- | -------------------------------------------------- |
| id             | string (UUID)                           | Primary key                                        |
| name           | string                                  | User-given name e.g. `'House Down Payment'`        |
| targetAmount   | number                                  | Goal target in ₹                                   |
| currentAmount  | number                                  | Amount accumulated so far                          |
| targetDate     | number?                                 | Epoch ms — deadline                                |
| sipAmount      | number?                                 | Planned monthly SIP in ₹                           |
| sipFrequency   | `'monthly' \| 'quarterly' \| 'yearly'`? | SIP cadence                                        |
| expectedReturn | number?                                 | Annual return assumption (%) for corpus projection |
| icon           | string?                                 | Tabler icon name                                   |
| color          | string?                                 | Hex color for UI card                              |

---

### `goal_contributions`

Individual contributions credited toward a goal.

| Field  | Type          | Notes                                     |
| ------ | ------------- | ----------------------------------------- |
| id     | string (UUID) | Primary key                               |
| goalId | string        | FK → goals                                |
| amount | number        | Contribution amount in ₹                  |
| date   | number        | Epoch ms                                  |
| note   | string?       | e.g. `'Bonus allocation'`, `'Annual SIP'` |

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

| Field                          | Type          | Notes                                                                                                                    |
| ------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| id                             | `'singleton'` | Fixed primary key — always one record                                                                                    |
| mkSalt                         | string        | Salt retained from the original MK derivation (migration)                                                                |
| kekSalt                        | string        | Salt for the PIN-derived KEK (PBKDF2, 200K iterations)                                                                   |
| encryptedMasterKey             | string        | DMK wrapped by the **PIN**-KEK (base64)                                                                                  |
| encryptedMasterKeyByPassphrase | string?       | **Track 2** — DMK wrapped by the **passphrase**-KEK (base64). Added lazily for migrated vaults; set at init for new ones |
| passphraseKekSalt              | string?       | **Track 2** — salt for the passphrase-KEK (PBKDF2, 600K iterations)                                                      |
| passphraseVerifier             | string        | Verifies the passphrase without unwrapping the DMK                                                                       |
| pinAttempts                    | number        | Failed PIN attempts (shared across unlock / Open-mode / change-PIN); resets on success                                   |
| lockedUntil                    | number?       | Epoch ms — exponential-backoff lockout expiry after 5 failed attempts                                                    |
| pinChangedAt                   | number?       | Epoch ms — drives the 21-day rotation reminder AND the once-per-24h change limit                                         |
| sessionExpiresAt               | number?       | Epoch ms — session/auto-lock expiry                                                                                      |
| wipeAfterAttempts              | number?       | **Track 2** — opt-in: erase all data after this many consecutive failed PIN attempts (undefined = off)                   |

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

| Field          | Type                                                            | Notes                                        |
| -------------- | --------------------------------------------------------------- | -------------------------------------------- |
| id             | string (UUID)                                                   | Primary key                                  |
| name           | string                                                          | e.g. `'HDFC Savings'`, `'Cash Wallet'`       |
| type           | `'savings' \| 'current' \| 'credit_card' \| 'cash' \| 'wallet'` |                                              |
| bankName       | string?                                                         | e.g. `'HDFC Bank'`                           |
| openingBalance | number?                                                         | Balance at time of account creation in Penny |
| color          | string?                                                         | Hex color for UI                             |
| icon           | string?                                                         | Tabler icon name                             |

---

### `activity_log`

User-initiated data changes (Pre-Phase 1.5, Track 4). Encrypted; id-only index (Dexie v4). Powers the
**Timeline**: undo/restore, per-item history, diffs, streaks, the privacy receipt, Money Story, and
restore points. Pruned to the newest ~500 entries.

| Field          | Type                                                                                                                                    | Notes                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| id             | string (UUID)                                                                                                                           | Primary key                                                                                                                                        |
| timestamp      | number                                                                                                                                  | Epoch ms                                                                                                                                           |
| action         | `'CREATE' \| 'UPDATE' \| 'DELETE' \| 'MERGE' \| 'BULK_DELETE' \| 'BULK_MOVE' \| 'BULK_UPDATE' \| 'IMPORT' \| 'RESTORE' \| 'CHECKPOINT'` |                                                                                                                                                    |
| entityType     | string                                                                                                                                  | e.g. `'expense'`, `'holding'`, `'goal'`, `'system'` (checkpoints)                                                                                  |
| entityId       | string                                                                                                                                  | id of the affected record (or synthetic for bulk/checkpoint)                                                                                       |
| summary        | string                                                                                                                                  | Human-readable, e.g. `'Deleted expense: Swiggy ₹340'` (₹ masked in UI outside Open mode)                                                           |
| actor          | string?                                                                                                                                 | Who performed it; unused in Phase 1 (always self) — for the Phase 1.5 household feed                                                               |
| snapshot       | string?                                                                                                                                 | JSON of the deleted record(s) — enables Undo / Recently Deleted restore                                                                            |
| cascade        | string?                                                                                                                                 | JSON `[{ entityType, record }]` of other-type records deleted alongside (e.g. an expense's linked IOU entries) — restored together for atomic Undo |
| diff           | string?                                                                                                                                 | JSON `{ field: [before, after] }` for UPDATE — beautiful diffs + future revert                                                                     |
| entityCount    | number?                                                                                                                                 | Records affected (bulk actions)                                                                                                                    |
| restorePointId | string?                                                                                                                                 | Groups entries under a named checkpoint (reserved for richer rewind)                                                                               |
| restored       | boolean?                                                                                                                                | `true` once a deleted entry has been restored (hides it from Recently Deleted)                                                                     |

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

| Field     | Type    | Notes                                                    |
| --------- | ------- | -------------------------------------------------------- |
| id        | string  | Primary key = scope                                      |
| scope     | string  | e.g. `'personal-blob'`, `group:${groupId}`               |
| version   | number? | Optimistic-concurrency version for the personal blob (D) |
| seq       | number? | Group-event sequence (Track E)                           |
| createdAt | number  | Epoch ms                                                 |
| updatedAt | number  | Epoch ms                                                 |

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
