# Penny — Technical Specification

**Version:** 1.2 (consolidated from TSD v1–v1.1 + Phase 1 additions)  
**Last updated:** June 2026

---

## Encryption model

### Three-key architecture

```
Passphrase (user sets on first launch)
    │
    └─► PBKDF2-HMAC-SHA-256 (600,000 iterations, 16-byte random salt)
          │
          └─► Master Key (MK) — 256-bit AES-GCM key
                │
                └─► Wraps all data in IndexedDB

PIN (4–8 digits, user sets on first launch)
    │
    └─► PBKDF2-HMAC-SHA-256 (200,000 iterations, 16-byte random salt)
          │
          └─► Key Encryption Key (KEK) — 256-bit AES-GCM key
                │
                └─► Wraps the Master Key for storage
```

**What lives in IndexedDB** (`security` store):

- `mkSalt` — 16-byte salt for MK derivation
- `kekSalt` — 16-byte salt for KEK derivation
- `wrappedMk` — Master Key wrapped with KEK (AES-KW)
- `mkVerifier` — HMAC of a known string with MK (used to verify unlock without decrypting all data)
- `pinRotationDate` — epoch ms of last PIN change

**What lives in memory only:**

- Master Key (in `src/core/crypto/keystore.ts` JS heap)
- KEK (computed during unlock, used once, then discarded)

**What is never stored anywhere:**

- Plaintext passphrase
- Plaintext PIN
- Master Key in any persistent form

### Per-record encryption

Each encrypted record is independently encrypted with the Master Key:

- Algorithm: AES-256-GCM
- IV: 12-byte random, generated fresh per write
- Auth tag: 128-bit (GCM default), ensures integrity
- Stored format: `{ iv: Uint8Array, ciphertext: Uint8Array }`

Only the fields listed in the `EncryptedRepository` configuration are encrypted. Non-sensitive fields (like `id`, index fields) remain plaintext for Dexie query performance.

### PIN lockout

Exponential backoff on failed PIN attempts:

- 1st fail: warn, continue
- 2nd fail: warn
- 3rd fail: 30-second lockout
- 4th fail: 60-second lockout
- 5th+ fails: 300-second lockout (doubling)
- Lockout state persists across app restarts (stored in `security` store)

PIN rotation reminder fires after 21 days of the last PIN change. Shown in the AuthGuard after each successful unlock — not a blocking modal.

### Adversarial self-check

Before shipping anything touching crypto, backup, or storage, review it from a hostile
reverse-engineer's perspective, not just a happy-path one — given the actual shipped
`apps/mobile` APK (a static asset anyone can pull apart), ask concretely:

- Could a decompiled build leak plaintext data at rest, in a log, or in a crash report?
  (`no-console`/no-PII-logging is enforced for exactly this reason — see `CLAUDE.md`.)
- Does anything in the encryption chain above depend on a secret that's actually bundled
  in the APK/JS bundle itself (a hardcoded key, a guessable salt, a debug bypass) rather
  than derived from something only the user knows (passphrase/PIN)?
- Could the exported backup file (`.penny`/JSON) be decrypted or forged without the
  passphrase, given full access to the file and the app's own (public) source?
- Does any code path make PIN/passphrase verification skippable — a flag, a stale dev
  build, a race in `AuthGuard` — that a patched/rebuilt APK could flip?

This isn't a formal audit process, just the standing lens for any change in this area —
if the answer to any of the above is "yes" or "not sure," treat it as a real finding, not
a nitpick.

---

## Database schema

Penny uses Dexie.js v4 (IndexedDB wrapper) with schema versioning.

### Version history

- **v1** — Initial schema: all 19 stores (17 encrypted + 2 plain)
- **v2** — Adds `accounts: 'id'` store (M9: income/transfer tracking)
- **v3** — Drops `assets: null` (superseded by `holdings` with `assetClass` field, M11)

### Complete store definitions

#### Plain stores (no PII, no encryption)

```
price_cache
  key: string (composite e.g. "mf_118834", "stock_RELIANCE")
  data: unknown (raw API response)
  updatedAt: number (epoch ms)
  ttlMs: number

privacy_stats
  domain: string
  callCount: number
  bytesSent: number
  lastCalledAt: number
```

#### Encrypted stores (fields marked with \* are encrypted)

```
profile
  id: string (UUID)
  *displayName: string
  *currency: 'INR'
  *locale: 'en-IN'
  *onboardingCompleted: boolean
  *dob?: string (ISO date) — ADDED Pre-Phase 1.5
  *employmentType?: 'salaried' | 'self_employed' | 'business_owner' | 'student' | 'retired' — ADDED Pre-Phase 1.5
  *username?: string — ADDED Pre-Phase 1.5

holdings
  id: string (UUID)
  *assetClass: 'equity' | 'mf' | 'fd' | 'nps' | 'ppf' | 'epf' | 'gold' | 'vehicle' | 'property' | 'other'
  *name: string
  *units?: number
  *purchasePrice?: number
  *currentValue?: number
  *purchaseDate?: number (epoch ms)
  *assetMeta?: AssetMeta (see types below)
  *note?: string

expenses
  id: string (UUID)
  *amount: number
  *merchant: string
  *categoryId: string
  *date: number (epoch ms)
  *type: 'expense' | 'income' | 'transfer'
  *notes?: string
  *hashtags?: string[]
  *paymentMode?: string
  *accountId?: string
  *toAccountId?: string (for transfers)
  *eventId?: string
  *recurringRuleId?: string
  *isRecurring?: boolean

expense_categories
  id: string (UUID)
  *name: string
  *icon?: string (Tabler icon name or SVG key)
  *color?: string
  *intentGroup: string (parent category tier)
  *isDefault: boolean
  *parentId?: string (unused — intentGroup is the parent)
  *transactionCount?: number (cached, updated on write)

budgets
  id: string (UUID)
  *categoryId: string
  *amount: number
  *period: 'monthly'
  *startDate?: number

hashtags
  id: string (UUID)
  *name: string
  *usageCount: number
  *lastUsed: number
  *eventType?: 'vacation' | 'background' | null
  *isActive?: boolean
  *startDate?: number
  *endDate?: number

goals
  id: string (UUID)
  *name: string
  *targetAmount: number
  *currentAmount: number
  *targetDate?: number
  *sipAmount?: number
  *sipFrequency?: 'monthly' | 'quarterly' | 'yearly'
  *expectedReturn?: number
  *icon?: string
  *color?: string

goal_contributions
  id: string (UUID)
  *goalId: string
  *amount: number
  *date: number
  *note?: string

liabilities
  id: string (UUID)
  *type: 12 liability types (home_loan | car_loan | personal_loan | credit_card | ...)
  *name: string
  *principalAmount: number
  *currentBalance: number
  *interestRate?: number
  *emiAmount?: number
  *startDate?: number
  *endDate?: number
  *lenderName?: string
  *accountNumber?: string
  *22 total fields

insurance_policies
  id: string (UUID)
  *type: 'term_life' | 'whole_life' | 'endowment' | 'ulip' | 'health' | 'vehicle' | 'property' | 'travel' | 'other'
  *name: string
  *insurer?: string
  *policyNumber?: string
  *sumAssured?: number
  *premium?: number
  *premiumFrequency?: 'monthly' | 'quarterly' | 'half-yearly' | 'yearly'
  *startDate?: number
  *renewalDate?: number
  *maturityDate?: number
  *nominees?: string[]
  *note?: string

chip_insights
  id: string (UUID)
  *module: string
  *insight: string
  *reasoning: string
  *doNothingConsequence: string (required — "what if I do nothing?" in rupees)
  *confidence: 'low' | 'medium' | 'high'
  *createdAt: number
  *version: number

ai_call_log
  id: string (UUID)
  *module: string
  *prompt: string (anonymised — PII already stripped)
  *tokensUsed?: number
  *createdAt: number

security
  id: 'singleton' (single record)
  *mkSalt: Uint8Array
  *kekSalt: Uint8Array
  *wrappedMk: ArrayBuffer
  *mkVerifier: ArrayBuffer
  *pinAttempts: number
  *lockedUntil?: number
  *pinRotationDate?: number

subscriptions
  id: string (UUID)
  *name: string
  *amount: number
  *frequency: 'monthly' | 'yearly' | 'weekly'
  *categoryId?: string
  *nextDueDate?: number
  *detectedAt: number
  *confirmedByUser: boolean

personal_ious
  id: string (UUID)
  *personName: string (CATEGORY 1 PII — never sent to AI)
  *direction: 'lent' | 'borrowed'
  *amount: number
  *date: number
  *dueDate?: number
  *description?: string
  *isSettled: boolean

credit_profile
  id: string (UUID)
  *score?: number
  *scoreRange?: string (e.g. "700–750")
  *reportDate?: number
  *summary?: string (safe to send to AI in banded form)
  *raw_report_encrypted?: string (NEVER sent to AI — contains PAN + tradelines)

accounts
  id: string (UUID)
  *name: string
  *type: 'savings' | 'current' | 'credit_card' | 'cash' | 'wallet'
  *bankName?: string
  *openingBalance?: number
  *color?: string
  *icon?: string

activity_log (ADDED Pre-Phase 1.5)
  id: string (UUID)
  *timestamp: number (epoch ms)
  *action: 'CREATE' | 'UPDATE' | 'DELETE' | 'MERGE' | 'BULK_DELETE' | 'BULK_MOVE'
  *entityType: string
  *entityId: string
  *summary: string
  *diff?: string (JSON before/after snapshot, for future undo)
```

### Key `AssetMeta` sub-types (stored in `holdings.assetMeta`)

```ts
// Stocks
assetClass: 'equity'
  stockSymbol: string
  stockExchange: 'NSE' | 'BSE'

// Mutual Funds
assetClass: 'mf'
  schemeCode: string
  mfFundHouse?: string
  mfSchemeCategory?: string
  mfSchemeType?: string

// FD/RD
assetClass: 'fd'
  fdSubType: 'fd' | 'rd'
  fdBank: string
  fdStartDate: number
  fdCompoundingFreq?: 'monthly' | 'quarterly' | 'half-yearly' | 'yearly' | 'at_maturity'
  interestRate: number
  maturityDate?: number
  rdMonthlyInstallment?: number
  rdTenureMonths?: number

// NPS
assetClass: 'nps'
  npsPfm: string (NPS PFM code)
  npsSchemeType: 'LC-75' | 'LC-50' | 'LC-25' | 'BLC' | 'active-choice'
  npsActiveChoiceAllocation?: { equityPct, corporatePct, govtPct }
  npsUnits?: { equity, corporate, govt }

// EPF
assetClass: 'epf'
  epfEmployers?: EpfEmployer[]   // 2026-08-07: gained establishmentId/memberId/balanceCheckpoints;
                                  // 2026-08: gained currentEmploymentConfirmed (only set once the
                                  // user explicitly confirms "still employed" post-import) and
                                  // confirmedFys (FYs with a real import, even a contribution-free
                                  // one — see docs/plans/epf-passbook-import.md §10.6/§10.7)
  epfTransactions?: EpfTransaction[]  // 2026-08-07: gained epfWages/epsWages/sourceParticulars/sourceRef
  epfHikeGroups?: EpfHikeGroup[]
  // See docs/features/portfolio/retirement.md and docs/plans/epf-passbook-import.md for the full
  // field list and the passbook-PDF-import feature these fields support.

// PPF
assetClass: 'ppf'
  ppfAccountNumber?: string
  ppfOpenDate?: number
  ppfTransactions?: PpfTransaction[]

// Gold/Silver
assetClass: 'gold'
  metalType: 'gold' | 'silver'
  metalCategory: 'jewellery' | 'coin' | 'bar' | 'digital' | 'other'
  metalKarat?: 14 | 18 | 22 | 24 (gold only)
  metalPurity?: '999' | '925' | '800' | 'other' (silver only)
  metalWeightGrams: number
  metalPurchasePricePerGram: number

// Vehicle
assetClass: 'vehicle'
  vehicleRegistrationNumber?: string
  vehicleMake?: string
  vehicleModel?: string
  vehicleYear?: number
  vehicleFuelType?: 'petrol' | 'diesel' | 'electric' | 'cng'
  vehicleCategory?: 'two-wheeler' | 'four-wheeler' | 'commercial'
  vehicleChallans?: VehicleChallan[]
```

---

## Chip AI architecture

### Phase 1: Mock mode

All Chip interactions in Phase 1 use `src/core/ai-safety/mockChip.ts`. The `CHIP_MODE` flag must be `'mock'` for all Phase 1 code.

The mock returns simulated insights without any API call. This lets us design the Chip UX and test the data pipeline without incurring API costs.

### Phase 2: Real mode (planned)

When `CHIP_MODE = 'real'`:

1. User action triggers a Chip request (from ChipPage or via an insight button on any module page)
2. `buildUserContext(module)` assembles an anonymised context struct (see PII pipeline below)
3. The context is sent to `anthropicClient.ts` which calls `claude-sonnet-4-6`
4. The response is parsed into a `ChipInsight` struct and saved to the `chip_insights` store
5. The insight is displayed with: reasoning, "what if I do nothing?", module tag, confidence

### Chip insight requirements

Every insight must contain all four fields:

```ts
interface ChipInsight {
  module: string; // which area (portfolio / expenses / goals / loans / etc.)
  insight: string; // the recommendation
  reasoning: string; // data points behind it
  doNothingConsequence: string; // "what happens if I ignore this?" — in rupees where possible
  confidence: 'low' | 'medium' | 'high';
}
```

The `doNothingConsequence` field is the most important field. A Chip insight without it is not useful.

### Chip model settings (Phase 2)

| Setting                    | Value               | Rationale                                             |
| -------------------------- | ------------------- | ----------------------------------------------------- |
| Model                      | `claude-sonnet-4-6` | Best balance of quality + cost for financial analysis |
| Temperature (analysis)     | 0.3                 | Low variance — financial advice must be consistent    |
| Temperature (conversation) | 0.7                 | Slightly warmer for natural chat responses            |
| Max tokens (analysis)      | 1200                | Full insight with reasoning                           |
| Max tokens (conversation)  | 800                 | Concise chat responses                                |

---

## PII anonymisation pipeline

Implemented in `src/core/ai-safety/buildUserContext.ts`.

### Input (raw data from Dexie)

The function reads from multiple stores: holdings, expenses, goals, accounts, liabilities, insurance_policies, chip_insights.

### Transformation steps

1. **Strip identifiers** — name, phone, PAN, Aadhaar, account numbers → removed
2. **Band amounts** — all ₹ amounts → nearest ₹10,000 band
3. **Generalise institutions** — bank name → "Bank A/B/C", lender → "Lender A/B"
4. **Age band** — exact DOB → 5-year band ("29–34")
5. **Replace person names** — IOU names → "Person 1", "Person 2" (ordinal, not consistent)
6. **Category abstraction** — merchant names → category names only

### Output (`UserContext` struct)

```ts
{
  netWorthBand: string            // "₹20–30L"
  monthlyIncomeBand: string       // "₹80K–90K"
  monthlyExpenseBand: string      // "₹30K–40K"
  assetClasses: string[]          // ["equity", "mf", "epf", "fd"]
  goalCount: number
  liabilityCount: number
  insurancePolicies: string[]     // ["term_life", "health"]
  healthScore: number             // 0–100
  ageBand?: string                // "29–34"
  employmentType?: string         // "salaried"
  topExpenseCategories: string[]  // ["Food & Drink", "Transport", "Utilities"]
  emiToIncomePct?: number         // 0.28 (28%)
  savingsRatePct?: number         // 0.22 (22%)
}
```

---

## Subscription detection (3-pass algorithm)

Implemented in `src/core/subscriptions/detector.ts`.

**Pass 1 — Frequency clustering**
Group expenses by merchant name. For each group, check if intervals between transactions are approximately regular (±3 days tolerance for monthly, ±7 days for weekly).

**Pass 2 — Amount stability**
Within a frequency cluster, check if amount variance is < 10%. High-variance recurring charges (e.g. utility bills) are NOT flagged as subscriptions.

**Pass 3 — Minimum recurrence**
Only flag as subscription if the pattern repeats at least 3 times. One-off payments that happen to be monthly are excluded.

---

## Financial calculators (core implementations)

### FD maturity — compound interest

```
P × (1 + r/n)^(n×t)
```

Where: P = principal, r = annual interest rate (decimal), n = compounding frequency per year, t = tenure in years.

Implemented in `src/core/fd/fdCalculations.ts:calcFdMaturity()`.

### RD maturity — iterative quarterly (Indian bank standard)

Each monthly instalment earns interest from its deposit date to maturity. Compounded quarterly. Sum of all instalments + interest.

Implemented in `src/core/fd/fdCalculations.ts:calcRdMaturity()`.

### Loan EMI — standard formula

```
EMI = P × r × (1+r)^n / ((1+r)^n - 1)
```

Where: P = principal, r = monthly rate (annual/12), n = tenure in months.

Implemented in `src/core/loans/calculator.ts:calcEmi()`.

### EPF retirement projection

- Takes employment history (company, basicSalary, fromDate, toDate)
- Applies salary hike groups to project future contributions
- Employee contribution: 12% of basic
- Employer contribution: 3.67% of basic to EPF (8.33% to EPS, capped at ₹1,250/month)
- Interest: current EPFO interest rate (8.25% FY 2025-26)
- Projects to age 58 using current DOB

Implemented inline in `src/features/portfolio/PortfolioPage.tsx` EPF tab section.

### NPS corpus projection

- Takes current corpus, allocation across equity/corporate/govt
- Uses historical returns: equity 12%, corporate 7%, govt 7%
- Lifecycle adjustment: allocation auto-shifts based on age (LC-75: max equity till 35, then reduces)
- Projects to age 60

Implemented in NPS section of PortfolioPage + `src/core/nps/npsLifecycle.ts`.

---

## Amortization utility

Standard reducing-balance amortization:

- Month-by-month: interest = balance × (annual_rate / 12)
- Principal paid = EMI − interest
- Balance next month = balance − principal_paid

Scenarios calculated on-device:

1. Standard EMI schedule
2. Prepayment lump sum (reduce tenure)
3. Extra monthly EMI (reduce tenure)
4. Step-up EMI (annual increase)
5. Balance transfer (new rate + processing fee)
6. Partial prepayment at any point

Implemented in `src/core/loans/amortization.ts`.

---

## Health score model

6 components, 0–100 composite. Implemented in `src/core/health/scorer.ts`.

| Component          | Weight | What it measures                                          |
| ------------------ | ------ | --------------------------------------------------------- |
| Diversification    | 20%    | Asset class spread (equity, debt, real estate, gold)      |
| Emergency fund     | 20%    | Liquid savings vs monthly expense multiple (target: 6×)   |
| Insurance coverage | 20%    | Sum assured vs income × 10 (term), health cover existence |
| Debt management    | 20%    | EMI/income ratio (target: <40%), credit card utilisation  |
| Goal progress      | 20%    | Goals on track vs off track ratio                         |
| Savings rate       | 20%    | Monthly savings / monthly income (target: >20%)           |

Grade bands: 90–100 = A+, 80–89 = A, 70–79 = B, 60–69 = C, <60 = D.

---

## Cash flow forecast engine

Implemented in `src/core/cashflow/forecaster.ts`.

**Inputs:** Last 3 months of expense transactions, recurring expense rules, account balances.

**Algorithm:**

1. Identify confirmed recurring items (expenses with `isRecurring: true` or detected subscription)
2. Project income: last 3 months average income, adjusted for known recurring income dates
3. Project expenses: confirmed recurring + estimated variable (last 3 months average by category)
4. Net: projected balance = current liquid balance + income − expenses

**Output:** Day-by-day balance projection for next 30 days + weekly summary.

---

## IPO data pipeline

Live data from `webnodejs.investorgain.com`. No auth required.

**4 tabs:**

- **Upcoming** — announces, price band not set yet
- **Open** — accepting applications, shows GMP + subscription multiples (live)
- **Closed** — allotment pending
- **Listed** — trading, shows listing gain % vs issue price

Subscription data (QIB/HNI/Retail multiples): fetched per-IPO on detail modal open. Cached for 30 minutes.

GMP and listing gain: computed as `(listingPrice - issuePrice) / issuePrice × 100`.

FY constants in `src/core/ipo/ipoTypes.ts`: `CURRENT_FY` drives the default year picker on the Listed tab.
