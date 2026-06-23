# Penny — Architecture Reference

This document describes the codebase structure, every directory and its purpose, and the key architectural decisions with their rationale.

**Last updated:** June 2026 (Pre-Phase 1.5)

---

## Directory structure

```
penny/
├── src/
│   ├── App.tsx                  ← Root component; wires all context providers
│   ├── main.tsx                 ← React entry point (ReactDOM.createRoot)
│   ├── index.css                ← Tailwind v4 + semantic token definitions
│   │
│   ├── core/                   ← Infrastructure layer (features import FROM here)
│   │   ├── accounts/           ← balanceCalculator.ts — account balance from transactions
│   │   ├── ai-safety/          ← PII pipeline, buildUserContext, mock Chip
│   │   ├── backup/             ← Encrypted .penny export/import
│   │   ├── cashflow/           ← Cash flow forecasting engine
│   │   ├── crypto/             ← AES-256-GCM encryption (Web Crypto API)
│   │   ├── db/                 ← Dexie schema + EncryptedRepository pattern
│   │   ├── expenses/           ← filterAndAggregate.ts — grouping, category spend aggregation
│   │   ├── export/             ← CSV export + AES-256 password-protected ZIP
│   │   ├── fd/                 ← FD/RD maturity calculation
│   │   ├── goals/              ← sipCalculator.ts — SIP needed + monthsUntil
│   │   ├── health/             ← Financial health score engine
│   │   ├── import/             ← CSV import parsers
│   │   ├── ipo/                ← IPO data client + types + hook
│   │   ├── loans/              ← Loan/EMI calculators
│   │   ├── market/             ← Market data (indices, forex, commodities)
│   │   ├── metals/             ← Gold/silver price client
│   │   ├── nps/                ← NPS NAV client + lifecycle fund tables
│   │   ├── portfolio/          ← ppfCalculations.ts, epfCalculations.ts — PPF/EPF projections
│   │   ├── session/            ← PIN session management + SessionGate
│   │   ├── subscriptions/      ← 3-pass subscription detection
│   │   ├── tax/                ← Tax calculations (LTCG/STCG/80C/80D)
│   │   └── vehicle/            ← Vehicle RC lookup
│   │
│   ├── features/               ← Feature modules (one per app section)
│   │   ├── accounts/           ← Accounts management
│   │   ├── backup/             ← Backup/restore UI
│   │   ├── cashflow/           ← Cash flow page
│   │   ├── chip/               ← Chip AI (Phase 1: stub)
│   │   ├── expenses/           ← Expense tracking
│   │   ├── goals/              ← Goals tracking
│   │   ├── health/             ← Health score page
│   │   ├── home/               ← Home dashboard
│   │   ├── import/             ← Import page
│   │   ├── insurance/          ← Insurance policies
│   │   ├── iou/                ← IOU tracker
│   │   ├── loans/              ← Loan scenarios
│   │   ├── onboarding/         ← Onboarding flow (6 screens)
│   │   ├── portfolio/          ← Portfolio (all asset classes)
│   │   ├── subscriptions/      ← Subscription detection
│   │   └── tax/                ← Tax awareness
│   │
│   ├── components/             ← Shared UI (not feature-specific)
│   │   ├── layout/             ← AppShell, BottomNav, SettingsDrawer
│   │   ├── privacy/            ← MaskedValue, PrivacyBadge, PrivacyModeSwitcher
│   │   └── ui/                 ← Shared primitives (Card, Modal, Button, etc.) — EXPANDING in Track 1
│   │
│   ├── context/                ← React context providers
│   │   ├── PrivacyContext.tsx  ← Privacy mode (safe/privacy/open)
│   │   ├── SettingsContext.tsx ← Module visibility, theme, font scale
│   │   └── EventModeContext.tsx← Active events (vacation, background)
│   │
│   ├── hooks/                  ← Shared React hooks
│   │   └── useRepository.ts   ← Generic repository hook
│   │
│   ├── lib/                    ← Pure utilities
│   │   ├── formatters.ts       ← Currency, date, compact number formatters + epochToDateInput
│   │   └── dateUtils.ts        ← Date key helpers (toDateKey, dateLabel, offsetMonth, monthLabel)
│   │
│   └── router/                 ← Routing config
│       ├── index.tsx           ← createBrowserRouter with all 19 routes
│       ├── paths.ts            ← PATHS constants (no magic strings)
│       └── AuthGuard.tsx       ← Session check, onboarding gate, PIN rotation check
│
├── public/                     ← Static assets (icons, splash, manifest)
├── tests/                      ← Test files (PII gate + others)
│   └── pii-gate/
│       └── piiGate.test.ts     ← CI PII gate (must never skip)
├── docs/                       ← Documentation
├── .claude/commands/           ← Skill files for Claude sessions
├── vite.config.ts              ← Build config, PWA, CSP
├── tailwind.config.ts          ← Tailwind v4 config
└── eslint.config.js            ← Lint rules (architecture enforcement)
```

---

## Layer architecture

```
┌─────────────────────────────────────────────────┐
│                   features/                      │
│   (ExpensesPage, PortfolioPage, HomePage, ...)   │
│   May import from: core/, components/, context/  │
│   May NOT import from: other features/           │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│              components/ + hooks/                │
│   (Shared UI primitives, shared hooks)           │
│   May import from: core/, context/               │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│                   core/                          │
│   (DB, crypto, AI safety, calculators, clients)  │
│   May NOT import from features/ or components/   │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│              Web APIs + IndexedDB                │
│   (Web Crypto API, Dexie, Service Worker)        │
└─────────────────────────────────────────────────┘
```

**Rule enforced by ESLint:**
- `@anthropic-ai/sdk` → only from `src/core/ai-safety/anthropicClient.ts`
- `dexie` → only from `src/core/db/`
- Feature modules → no cross-feature imports

---

## Component inventory

### `src/components/layout/`

| File | Props | Purpose |
|---|---|---|
| `AppShell.tsx` | `children` | Sticky 48px header (logo + privacy badge), scrollable page area, 64px bottom nav, settings drawer overlay |
| `BottomNav.tsx` | — | 5-tab nav: Home, Portfolio, Chip (FAB centre), Expenses, Goals. Respects SettingsContext module visibility. |
| `SettingsDrawer.tsx` | `isOpen`, `onClose` | Side drawer: module toggles, theme picker, font scale slider, default privacy mode, security actions, demo data clear |

### `src/components/privacy/`

| File | Props | Purpose |
|---|---|---|
| `MaskedValue.tsx` | `value`, `className?` | Shows `••••` in safe/privacy modes. Tap to peek for 5 seconds in safe mode. |
| `PrivacyBadge.tsx` | — | Coloured badge (amber/violet/red) showing current mode. Tappable to open switcher. |
| `PrivacyModeSwitcher.tsx` | `isOpen`, `onClose` | 3-segment toggle. PIN modal fires when switching to Open mode. |

### `src/components/ui/` *(expanding in Pre-Phase 1.5 Track 1)*

| File | Purpose |
|---|---|
| `ChipAvatar.tsx` | Chip AI avatar SVG |
| `PennyLogo.tsx` | Penny coin + wordmark SVG |
| *(Track 1 adds: Card, Modal, Button, ConfirmDialog, TextInput, FormField, IconChip, SegmentedControl, Badge, EmptyState, SectionHeader)* |

---

## Hook inventory

### `src/hooks/`

| File | Returns | Purpose |
|---|---|---|
| `useRepository.ts` | `{ items, loading, error, save, remove, reload }` | Generic hook to load/write from any EncryptedRepository. Used in most feature pages. |

*(Track 1 adds: `useDisclosure.ts`, `useAsync.ts`)*

---

## Core layer detail

### `src/core/crypto/`

Three files, one responsibility each:

| File | Purpose |
|---|---|
| `engine.ts` | Pure crypto: `deriveKey()`, `encrypt()`, `decrypt()`, `wrapKey()`, `unwrapKey()`, `generateSalt()`, `deriveVerifier()`. Only file that calls `window.crypto.subtle`. |
| `keystore.ts` | In-memory Master Key holder. `setMasterKey()`, `getMasterKey()`, `isUnlocked()`, `lock()`. Never writes to storage. |
| `securityManager.ts` | Orchestrates auth lifecycle: `initialize()`, `unlock()`, `verifyPin()`, `isOnboardingComplete()`, `isPinRotationDue()`. Reads/writes the `security` Dexie store. |

### `src/core/db/`

| File | Purpose |
|---|---|
| `schema.ts` | `PennyDatabase` extends `Dexie`. Defines v1→v3 migrations and all store definitions. Exports `db` singleton. |
| `repository.ts` | `EncryptedRepository<T>` class. Encrypts on `put()`, decrypts on `get()`/`getAll()`. Uses Master Key from keystore. |
| `repositories.ts` | Pre-instantiated repositories for all 17 encrypted stores. Import from here — never instantiate directly in features. |
| `types/index.ts` | TypeScript interfaces for all 40+ entity types. |
| `defaultCategories.ts` | `ALL_DEFAULT_CATEGORIES`, `INTENT_GROUP_META`, `CATEGORY_MIGRATION_MAP`. |
| `priceCache.ts` | Helpers for reading/writing the `price_cache` plain store with TTL support. |
| `seedDemoData.ts` | Seeds realistic demo data (expenses, holdings, goals, accounts) after onboarding. |

### `src/core/ai-safety/`

| File | Purpose |
|---|---|
| `buildUserContext.ts` | Only path to the Anthropic API. Strips/bands/generalises PII. Returns `UserContext` struct. |
| `piiScanner.ts` | Regex-based PII scanner. Used by the CI gate. |
| `mockChip.ts` | Phase 1 Chip simulation. All Phase 1 Chip responses come from here. |

---

## External APIs

| API | Used for | Client file | Cache TTL |
|---|---|---|---|
| MFAPI.in | MF search, NAV, scheme metadata | `src/core/db/priceCache.ts` | 24h |
| Yahoo Finance (unofficial) | Stock search, live price | `src/core/db/priceCache.ts` | 15 min |
| investorgain.com (webnodejs) | IPO data (all 4 tabs), GMP, subscription | `src/core/ipo/ipoClient.ts` | 30 min |
| npsnav.in | NPS fund NAV | `src/core/nps/npsClient.ts` | 24h |
| vahandetails.com | Vehicle RC lookup, depreciation | `src/core/vehicle/rcClient.ts` | 30 days |
| Market data (indices/forex) | Sensex, Nifty, Gold, Silver, USD-INR, Crude | `src/core/market/marketDataClient.ts` | 15 min |

---

## Context providers

| Context | Stored in | Key values |
|---|---|---|
| `PrivacyContext` | React state + localStorage | `mode: PrivacyMode`, `setMode()`, `maskValue()`, `canUseAI()` |
| `SettingsContext` | localStorage | `moduleVisibility`, `fontScale`, `theme`, `defaultPrivacyMode`, `setModule()` |
| `EventModeContext` | Dexie (`hashtags` store) | `activeEvent`, `addEvent()`, `stopEvent()`, `promoteHashtagToEvent()` |

---

## Router structure

```
/                        → redirect to /onboarding/splash
/onboarding/
  splash                 → SplashScreen
  privacy-promise        → PrivacyPromiseScreen
  setup                  → SetupCredentialsScreen (passphrase + PIN)
  privacy-demo           → PrivacyDemoScreen
  chip-intro             → ChipIntroScreen
  simulated-dashboard    → SimulatedDashboardScreen

/app/ (all behind AuthGuard → AppShell)
  home                   → HomePage
  portfolio              → PortfolioPage
  expenses               → ExpensesPage
  goals                  → GoalsPage
  insurance              → InsurancePage
  subscriptions          → SubscriptionsPage
  iou                    → IouPage
  loans                  → LoanScenariosPage
  health                 → HealthScorePage
  tax                    → TaxAwarenessPage
  cashflow               → CashFlowPage
  chip                   → ChipPage
  backup                 → BackupPage
  import                 → ImportPage
  accounts               → AccountsPage
```

`AuthGuard` checks: onboarding completion → session unlock → PIN rotation due → passes through.

---

## Build & tooling

| Tool | Version | Purpose |
|---|---|---|
| Vite | 8.x | Dev server + build bundler |
| TypeScript | 6.x (strict) | Type checking — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Tailwind CSS | 4.x | Utility CSS — semantic tokens defined in `src/index.css` |
| Dexie | 4.x | IndexedDB wrapper with Dexie Table typing |
| VitePWA | — | Service Worker, Workbox, PWA manifest |
| Vitest | 4.x | Unit + integration tests |
| ESLint | 10.x | Lint + architecture enforcement |
| Prettier | 3.x | Code formatting |
| Husky + lint-staged | — | Pre-commit hooks |
| xlsx | 0.18.x | XLSX export (loans amortization) |
| zip.js | 2.8.x | AES-256 password-protected ZIP export |
| zxcvbn | 4.x | Passphrase strength estimation |

---

## Feature module architecture (target state after Pre-Phase 1.5 Track 1)

Every feature module follows a strict three-layer pattern. This was established after analysis revealed that files like `ExpensesPage.tsx` (3,183 lines) and `PortfolioPage.tsx` (4,957 lines) were mixing pure calculations, data fetching, state management, and UI rendering — making them untestable, hard to maintain, and expensive to migrate to React Native.

### The three layers

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3: Feature UI (src/features/{name}/{Name}Page)   │
│  • Calls feature hook for all data/actions              │
│  • Calls src/components/ui/ for all UI                  │
│  • ZERO calculations, ZERO repo calls                   │
│  • ≤400 lines for a page, ≤200 lines for a form         │
│  • Needs UI rewrite for React Native                    │
└──────────────────────────┬──────────────────────────────┘
                           │ calls
┌──────────────────────────▼──────────────────────────────┐
│  Layer 2: Feature Hook (src/features/{name}/use{Name})  │
│  • ALL useState, useEffect, useCallback, useMemo        │
│  • ALL repository calls (getAll, add, put, delete)      │
│  • ALL mutations with optimistic updates                │
│  • Imports calculations from Layer 1                    │
│  • 100% React Native portable (hooks work identically)  │
└──────────────────────────┬──────────────────────────────┘
                           │ imports
┌──────────────────────────▼──────────────────────────────┐
│  Layer 1: Core Logic (src/core/{domain}/*)              │
│  • Pure TypeScript functions only                       │
│  • ZERO JSX, ZERO React, ZERO browser APIs              │
│  • Independently testable without mounting a component  │
│  • 100% React Native portable — zero changes needed     │
└─────────────────────────────────────────────────────────┘
```

### Example: Expenses feature (before vs after Track 1)

**Before (wrong — everything in one file):**
```
src/features/expenses/
  ExpensesPage.tsx    ← 3,183 lines: calculations + state + data fetching + UI
  ExpenseForm.tsx     ←   767 lines: state + data fetching + UI
```

**After (correct):**
```
src/features/expenses/
  useExpenses.ts      ← ~400 lines: all state + repo calls + mutations
  ExpensesPage.tsx    ← ~350 lines: thin layout + calls hook + calls shared components
  ExpenseForm.tsx     ← ~180 lines: thin form layout only

src/core/expenses/
  filterAndAggregate.ts  ← pure: filtering, grouping, category aggregation
  eventAggregator.ts     ← pure: hashtag/event spending summaries
```

### React Native portability by layer

| Layer | RN effort | Why |
|---|---|---|
| `src/core/` | Zero changes | Pure TypeScript, no browser deps |
| Feature hooks (`use{Name}.ts`) | Zero changes | React hooks work identically in RN |
| Feature UI (`{Name}Page.tsx`) | Swap component implementations | Pages call `<Card>`, `<Modal>` — not Tailwind directly |
| `src/components/ui/` | Create `*.native.tsx` variants | Same props API, different renderer |
| `src/core/db/` | Replace Dexie with SQLite | Isolated behind EncryptedRepository interface |
| `src/core/crypto/` | Replace Web Crypto with RN crypto | Isolated in engine.ts |

---

## Key architectural decisions

### Decision: UUID primary keys everywhere
**Rationale:** Auto-increment integers break when syncing data across devices — gaps, conflicts. UUID PKs let two devices add records independently and merge without collision. Sync-readiness from day 1, even before Phase 1.5 backend arrives.

### Decision: EncryptedRepository pattern (never raw Dexie from features)
**Rationale:** Centralises encryption/decryption. Any feature that calls `db.expenses.toArray()` directly bypasses encryption. ESLint rule enforces the boundary. Adding a new encrypted field is a one-line change in the repository config, not a scattered change across all feature files.

### Decision: Three-key architecture (passphrase → MK, PIN → KEK)
**Rationale:** Separates two concerns: the Master Key (long-term, derived from passphrase, hard to brute force at 600K PBKDF2 iterations) and the Key Encryption Key (daily use, derived from PIN, fast to unlock at 200K iterations). This means: fast daily unlock via PIN, but changing the PIN doesn't require re-encrypting all data (just the wrapped MK).

### Decision: Master Key in memory only
**Rationale:** The most critical security property. An attacker with access to IndexedDB (e.g. via another browser extension) can only see ciphertext. The MK never touches persistent storage — it lives in `keystore.ts` in the JS heap, cleared on session expiry.

### Decision: Feature module isolation (no cross-feature imports)
**Rationale:** Keeps each feature independently testable and understandable. Prevents the "everything imports everything" antipattern. Also necessary for React Native migration — each feature can be ported independently since it only depends on `core/`.

### Decision: buildUserContext() as the only Anthropic path
**Rationale:** The PII pipeline cannot be bypassed by accident. Any developer who wants to call the Anthropic API must go through `buildUserContext()`, which enforces all PII stripping rules. The `@anthropic-ai/sdk` import restriction in ESLint makes it impossible to call the SDK from anywhere else.

### Decision: Cloudflare Workers + D1 + KV (not Supabase)
**Rationale (Phase 1.5):** We're already on Cloudflare Pages. D1 is SQLite at the edge — sufficient for the identity/membership data (users, groups, group_members). Supabase would add a new vendor and its PostgreSQL row-level security model is overcomplicated for our needs. D1 + KV keeps everything on one platform and under the generous Cloudflare free tier.

### Decision: Phone OTP auth (no email, no OAuth)
**Rationale (Phase 1.5):** No inbox to phish. No Google/Apple dependency for OAuth. SMS OTP is universally understood in India. Fits the privacy-first positioning — we don't need to know your email.

### Decision: Client-side encryption only, user-owned cloud backup
**Rationale (Phase 2):** Option A (no key escrow). The strongest possible privacy promise: we cannot decrypt your data even if legally compelled. Backup goes to the user's Google Drive / iCloud as an encrypted blob — we never touch it. Users who lose their passphrase lose their data. This is the stated tradeoff (communicated in onboarding).

### Decision: React Native for mobile (not Capacitor)
**Rationale (Phase 2):** Capacitor wraps the web app in a WebView — performance is constrained by CSS rendering and JavaScript layout. React Native renders to native components. The component extraction in Pre-Phase 1.5 (semantic variant props, no Tailwind className in feature files) makes the migration mechanical: swap component implementations, keep all business logic and `src/core/`.

### Decision: `src/features/` not `src/pages/`
**Rationale:** The React community uses `pages/` for file-based routing. We use client-side routing manually, and each folder contains more than just a page (form, hook, types). `features/` better describes self-contained feature modules.

---

## Dependency graph (simplified)

```
main.tsx
  └─► App.tsx
        ├─► PrivacyContext
        ├─► SettingsContext
        ├─► EventModeContext
        └─► router/index.tsx
              └─► AuthGuard
                    └─► AppShell
                          ├─► BottomNav
                          ├─► SettingsDrawer
                          └─► <feature pages>
                                ├─► src/core/<domain>
                                │     └─► src/core/db/repositories
                                │           └─► src/core/crypto/keystore
                                ├─► src/components/ui/<primitives>
                                ├─► src/components/privacy/<masking>
                                └─► src/context/<PrivacyContext, etc.>
```
