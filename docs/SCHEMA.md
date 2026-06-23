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

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| displayName | string | User's chosen display name |
| currency | `'INR'` | Always INR in Phase 1 |
| locale | `'en-IN'` | Always en-IN in Phase 1 |
| onboardingCompleted | boolean | AuthGuard checks this |
| dob | string? | ISO date — added Pre-Phase 1.5 |
| employmentType | `'salaried' \| 'self_employed' \| 'business_owner' \| 'student' \| 'retired'`? | Added Pre-Phase 1.5; affects health score benchmarks |
| username | string? | Added Pre-Phase 1.5; used for group identity in Phase 1.5 |

---

### `holdings`

Every asset the user owns. Supersedes the old `assets` store (dropped in v3).

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| assetClass | `'equity' \| 'mf' \| 'fd' \| 'nps' \| 'ppf' \| 'epf' \| 'gold' \| 'vehicle' \| 'property' \| 'other'` | Determines which UI and calculators apply |
| name | string | Fund name, stock ticker, or descriptive name |
| units | number? | For MF and equity holdings |
| purchasePrice | number? | Per-unit cost for MF/equity; total cost for others |
| currentValue | number? | Updated from price_cache or user input |
| purchaseDate | number? | Epoch ms — used for LTCG/STCG calculation |
| assetMeta | AssetMeta? | Type-specific metadata (see `docs/TSD.md` for shape per assetClass) |
| note | string? | Free text |

---

### `expenses`

Every income, expense, and transfer transaction.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| amount | number | Always positive; `type` determines direction |
| merchant | string | Shown locally only — stripped before any AI call |
| categoryId | string | FK → expense_categories |
| date | number | Epoch ms |
| type | `'expense' \| 'income' \| 'transfer'` | |
| notes | string? | Free text; hashtags are parsed from here |
| hashtags | string[]? | Parsed tags e.g. `['emi', 'travel']` |
| paymentMode | string? | e.g. `'UPI'`, `'credit_card'`, `'cash'` |
| accountId | string? | FK → accounts (source account) |
| toAccountId | string? | FK → accounts — transfers only |
| eventId | string? | FK → hashtags where eventType is set |
| recurringRuleId | string? | FK → subscriptions or internal rule |
| isRecurring | boolean? | True if part of a confirmed recurring pattern |

---

### `expense_categories`

Default and user-created categories for classifying expenses.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| name | string | e.g. `'Food'`, `'EMI'`, `'Entertainment'` |
| icon | string? | Tabler icon name or SVG key |
| color | string? | Hex color for UI chips and charts |
| intentGroup | string | Parent category tier (e.g. `'Needs'`, `'Wants'`, `'Savings'`) |
| isDefault | boolean | System-provided defaults vs user-created |
| parentId | string? | Reserved for future subcategory hierarchy — unused in UI today |
| transactionCount | number? | Cached count for sort/display |

---

### `budgets`

Monthly spend limits per category.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| categoryId | string | FK → expense_categories |
| amount | number | Monthly limit in ₹ |
| period | `'monthly'` | Only monthly budgets supported today |
| startDate | number? | Epoch ms — when this budget rule began |

---

### `hashtags`

User-defined tags that can optionally represent events (vacations, trips, occasions).

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| name | string | e.g. `'goa-trip'`, `'emi'`, `'wedding'` |
| usageCount | number | Incremented on each use |
| lastUsed | number | Epoch ms |
| eventType | `'vacation' \| 'background' \| null`? | Classifies the tag as a named event |
| isActive | boolean? | Whether the event is ongoing |
| startDate | number? | Epoch ms — event start |
| endDate | number? | Epoch ms — event end |

---

### `goals`

Financial goals with SIP planning and progress tracking.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| name | string | User-given name e.g. `'House Down Payment'` |
| targetAmount | number | Goal target in ₹ |
| currentAmount | number | Amount accumulated so far |
| targetDate | number? | Epoch ms — deadline |
| sipAmount | number? | Planned monthly SIP in ₹ |
| sipFrequency | `'monthly' \| 'quarterly' \| 'yearly'`? | SIP cadence |
| expectedReturn | number? | Annual return assumption (%) for corpus projection |
| icon | string? | Tabler icon name |
| color | string? | Hex color for UI card |

---

### `goal_contributions`

Individual contributions credited toward a goal.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| goalId | string | FK → goals |
| amount | number | Contribution amount in ₹ |
| date | number | Epoch ms |
| note | string? | e.g. `'Bonus allocation'`, `'Annual SIP'` |

---

### `liabilities`

All debt obligations — loans, credit cards, BNPL, informal borrowings.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| type | `'home_loan' \| 'car_loan' \| 'personal_loan' \| 'business_loan' \| 'education_loan' \| 'two_wheeler_loan' \| 'gold_loan' \| 'credit_card' \| 'bnpl' \| 'family_loan' \| 'other'` | |
| name | string | e.g. `'HDFC Home Loan'` — shown locally, generalised for AI |
| principalAmount | number | Original loan amount |
| currentBalance | number | Outstanding balance today |
| interestRate | number? | Annual interest rate (%) |
| emiAmount | number? | Monthly instalment in ₹ |
| tenureMonths | number? | Total loan tenure |
| startDate | number? | Epoch ms — disbursement date |
| endDate | number? | Epoch ms — last EMI date |
| lenderName | string? | e.g. `'HDFC Bank'` — shown locally, generalised for AI |
| accountNumber | string? | Last 4 digits only — never full account number |
| note | string? | Free text |

---

### `insurance_policies`

Life, health, vehicle, and other insurance policies.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| type | `'term_life' \| 'whole_life' \| 'endowment' \| 'ulip' \| 'health' \| 'vehicle' \| 'property' \| 'travel' \| 'other'` | |
| name | string | Policy name or description |
| insurer | string? | Insurer name e.g. `'LIC'`, `'Star Health'` |
| policyNumber | string? | Encrypted — never shown in logs or sent to AI |
| sumAssured | number? | Cover amount in ₹ |
| premium | number? | Premium amount in ₹ |
| premiumFrequency | `'monthly' \| 'quarterly' \| 'half-yearly' \| 'yearly'`? | Payment cadence |
| startDate | number? | Epoch ms — policy start |
| renewalDate | number? | Epoch ms — next renewal |
| maturityDate | number? | Epoch ms — for endowment/ULIP |
| nominees | string[]? | Nominee names — PII, never sent to AI |
| note | string? | Free text |

---

### `chip_insights`

Cached AI-generated insights per module. Generated by `mockChip.ts` in Phase 1; will use Anthropic API in Phase 2.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| module | string | e.g. `'portfolio'`, `'expenses'`, `'goals'` |
| insight | string | Plain-language headline for the user |
| reasoning | string | 2–3 lines with supporting numbers |
| doNothingConsequence | string | Always populated — ₹ cost of inaction |
| confidence | `'low' \| 'medium' \| 'high'` | |
| createdAt | number | Epoch ms |
| version | number | Schema version of the insight format |

---

### `ai_call_log`

Audit trail of every AI call. Logged before the call is made.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| module | string | Feature that initiated the call |
| prompt | string | Anonymised prompt — no raw PII, only bands and categories |
| tokensUsed | number? | Filled after response |
| createdAt | number | Epoch ms — logged before the call |

---

### `security`

Single-record store. Holds the cryptographic material for the three-key architecture.

| Field | Type | Notes |
|-------|------|-------|
| id | `'singleton'` | Fixed primary key — always one record |
| mkSalt | Uint8Array | 32-byte salt for Master Key derivation (PBKDF2, 600K iterations) |
| kekSalt | Uint8Array | 32-byte salt for KEK derivation (PBKDF2, 200K iterations) |
| wrappedMk | ArrayBuffer | AES-KW wrapped Master Key |
| mkVerifier | ArrayBuffer | Used to verify passphrase without exposing MK |
| pinAttempts | number | Failed PIN attempts (0–5); resets on success |
| lockedUntil | number? | Epoch ms — lockout expiry after 5 failed attempts |
| pinRotationDate | number? | Epoch ms — tracks 21-day PIN rotation reminder |

---

### `subscriptions`

Recurring subscription services, confirmed or auto-detected.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| name | string | e.g. `'Netflix'`, `'Spotify'` — public name, safe for AI |
| amount | number | Subscription cost in ₹ |
| frequency | `'monthly' \| 'yearly' \| 'weekly'` | Billing cycle |
| categoryId | string? | FK → expense_categories |
| nextDueDate | number? | Epoch ms — next charge date |
| detectedAt | number | Epoch ms — when first detected or created |
| confirmedByUser | boolean | True once user explicitly confirms this subscription |

---

### `personal_ious`

Money lent to or borrowed from people. Category 1 PII — `personName` is **never** sent to AI.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| personName | string | **PII — never sent to AI under any privacy mode** |
| direction | `'lent' \| 'borrowed'` | From the user's perspective |
| amount | number | Original amount in ₹ |
| date | number | Epoch ms — when the IOU was created |
| dueDate | number? | Epoch ms — expected repayment date |
| description | string? | Free text context |
| isSettled | boolean | True once fully repaid |

---

### `credit_profile`

User's credit bureau data. The raw report is encrypted and **never** sent to AI.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| score | number? | 300–900 credit score |
| scoreRange | string? | e.g. `'750–799'` — banded form safe for AI |
| reportDate | number? | Epoch ms — when the report was fetched |
| summary | string? | Plain-language summary — safe for AI in banded form |
| raw_report_encrypted | string? | Full bureau report — **NEVER sent to AI** — contains PAN and tradeline details |

---

### `accounts`

Bank accounts, wallets, and cash holdings. Used as source/destination for expense transactions.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| name | string | e.g. `'HDFC Savings'`, `'Cash Wallet'` |
| type | `'savings' \| 'current' \| 'credit_card' \| 'cash' \| 'wallet'` | |
| bankName | string? | e.g. `'HDFC Bank'` |
| openingBalance | number? | Balance at time of account creation in Penny |
| color | string? | Hex color for UI |
| icon | string? | Tabler icon name |

---

### `activity_log`

Audit trail of all user-initiated data changes. Added in Pre-Phase 1.5.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| timestamp | number | Epoch ms |
| action | `'CREATE' \| 'UPDATE' \| 'DELETE' \| 'MERGE' \| 'BULK_DELETE' \| 'BULK_MOVE'` | |
| entityType | string | e.g. `'expense'`, `'holding'`, `'goal'` |
| entityId | string | UUID of the affected record |
| summary | string | Human-readable description e.g. `'Deleted expense: Swiggy ₹340'` |
| diff | string? | JSON-serialised before/after diff for UPDATE actions |

---

## Plain stores (no encryption)

### `price_cache`

Cached market prices fetched from external APIs. No personal data — safe to store unencrypted.

| Field | Type | Notes |
|-------|------|-------|
| key | string | Composite key e.g. `'mf_118834'`, `'stock_RELIANCE'` — primary key |
| data | unknown | Raw API response JSON — shape varies by source |
| updatedAt | number | Epoch ms — when this entry was last fetched |
| ttlMs | number | How long this cache entry is valid (varies by asset class) |

---

### `privacy_stats`

Aggregated telemetry about AI calls made from this device. No personal data.

| Field | Type | Notes |
|-------|------|-------|
| domain | string | API domain e.g. `'api.anthropic.com'` — primary key |
| callCount | number | Total calls made to this domain |
| bytesSent | number | Approximate bytes sent to this domain |
| lastCalledAt | number | Epoch ms — most recent call |
