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
│   │   ├── backup/             ← Encrypted .penny export/import + mergeBundle (non-destructive LWW sync/recovery merge)
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
│   │   ├── portfolio/          ← PPF/EPF projections; holdingMappers (pure save logic), mfApiClient, stockApiClient, vehicleMeta
│   │   ├── reminders/          ← buildReminders — near-term outflow reminders (Track 6, in-app)
│   │   ├── session/            ← PIN session management + SessionGate
│   │   ├── subscriptions/      ← 3-pass subscription detection
│   │   ├── tax/                ← Tax calc (LTCG/STCG/80C/80D) + Track 7 engine: indirectTaxRates (GST 2.0, dated history), categoryTaxMap, taxBandClassifier, indirectTax (with min/max range), regimeHistory (per-FY slabs 2017→2026), fy, incomeWaterfall, taxScenarios (X-ray), optimizer, itrAdvisor, taxFacts, assetTaxInfo (shared per-asset notes)
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
│   │   └── tax/                ← Tax awareness — 4 pillars: footprint/ (income waterfall + MoneyFlow + share/), explore/ (tax X-ray + rates/), optimize/ (suggestions + deductions/), calculators/ (Regime/HRA/gains/); + DidYouKnow
│   │
│   ├── components/             ← Shared UI (not feature-specific)
│   │   ├── layout/             ← AppShell, BottomNav, SettingsDrawer
│   │   ├── privacy/            ← MaskedValue, PrivacyBadge, PrivacyModeSwitcher
│   │   ├── AssetTaxNote.tsx    ← Collapsible per-asset "Tax on this" note (Portfolio tabs; from core/tax/assetTaxInfo)
│   │   └── ui/                 ← Shared primitives (Card, Modal, Button, etc.) — EXPANDING in Track 1
│   │
│   ├── context/                ← React context providers
│   │   ├── PrivacyContext.tsx  ← Privacy mode (safe/privacy/open)
│   │   ├── SettingsContext.tsx ← Module visibility, theme, font scale
│   │   ├── EventModeContext.tsx← Active events (vacation, background)
│   │   └── ToastContext.tsx    ← Global snackbar (Undo toasts) — useToast()
│   │
│   ├── hooks/                  ← Shared React hooks
│   │   └── useRepository.ts   ← Generic repository hook
│   │
│   ├── lib/                    ← Pure utilities
│   │   ├── formatters.ts       ← Currency, date, compact number formatters + epochToDateInput
│   │   ├── amountToWords.ts    ← Indian-system amount-in-words (crore/lakh) for AmountInput
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

| File                 | Props               | Purpose                                                                                                               |
| -------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `AppShell.tsx`       | `children`          | Sticky 48px header (logo + privacy badge), scrollable page area, 64px bottom nav, settings drawer overlay             |
| `BottomNav.tsx`      | —                   | 5-tab nav: Home, Portfolio, Chip (FAB centre), Expenses, Goals. Respects SettingsContext module visibility.           |
| `SettingsDrawer.tsx` | `isOpen`, `onClose` | Side drawer: module toggles, theme picker, font scale slider, default privacy mode, security actions, demo data clear |

### `src/components/privacy/`

| File                      | Props                 | Purpose                                                                            |
| ------------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| `MaskedValue.tsx`         | `value`, `className?` | Shows `••••` in safe/privacy modes. Tap to peek for 5 seconds in safe mode.        |
| `PrivacyBadge.tsx`        | —                     | Coloured badge (amber/violet/red) showing current mode. Tappable to open switcher. |
| `PrivacyModeSwitcher.tsx` | `isOpen`, `onClose`   | 3-segment toggle. PIN modal fires when switching to Open mode.                     |

### `src/components/ui/`

| File                          | Key Props                                                                                                                                  | Purpose                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChipAvatar.tsx`              | —                                                                                                                                          | Chip AI avatar SVG                                                                                                                                                                                                                                                                                                                                          |
| `PennyLogo.tsx`               | —                                                                                                                                          | Penny coin + wordmark SVG                                                                                                                                                                                                                                                                                                                                   |
| `Card.tsx`                    | `padding?` xs/sm/md/lg · `radius?` md/lg · `onClick?` · `className?`                                                                       | Surface card. Padding tiers: xs=p-3, sm=p-3.5, md=p-4 (default), lg=p-5. Renders `<button>` when `onClick` is provided. Layout classes allowed via `className`; never pass colour/spacing overrides.                                                                                                                                                        |
| `Modal.tsx`                   | `onClose` · `title?` · `footer?` · `size?` sm/md · `nested?` · `level?` 1/2/3 · `scrollable?`                                              | Fixed-overlay centred modal. `nested=true` bumps to `z-70`; `level={3}` → `z-80` (third-tier, e.g. category editors above the picker). Always uses `paddingTop:56, paddingBottom:72` so header + nav remain visible.                                                                                                                                        |
| `Button.tsx`                  | `variant` primary/secondary/danger/ghost · `size?` sm/md/lg · `loading?` · `icon?` · `fullWidth?` · `color?` · `style?`                    | All interactive buttons. `color` overrides background with a runtime hex value. `style` merges with variant styles for one-off positioning (e.g. FAB `bottom`/`right`). Primary/danger use CSS vars; secondary/ghost use semantic tokens.                                                                                                                   |
| `OptionButton.tsx`            | `label` · `selected` · `onClick` · `icon?` · `description?` · `color?` · `disabled?` · `compact?`                                          | Bordered option selector. Default: horizontal card (icon left, label right, `w-full`). `compact=true`: vertical tile (icon above, label below, no `w-full`) for use in 3–4-column grids (policy types, account types, asset classes). `color` defaults to `--color-primary`.                                                                                |
| `ConfirmDialog.tsx`           | `isOpen` · `onClose` · `onConfirm` · `title` · `message` · `confirmLabel?` · `confirmVariant?` · `loading?` · `level?` 1/2/3               | Two-button confirmation dialog. Wraps `Modal` (default `level=2`/`z-70`) + two `Button`s.                                                                                                                                                                                                                                                                   |
| `FormField.tsx`               | `label` · `required?` · `hint?` · `error?`                                                                                                 | Label wrapper. Shows required star, hint text, or error (error takes priority over hint).                                                                                                                                                                                                                                                                   |
| `TextInput.tsx`               | `label?` · `value` · `onChange(value)` · `error?` · `hint?` · `prefix?` · `suffix?` · `inputClassName?`                                    | Controlled text input. `inputClassName` adds extra classes to the inner `<input>` element (e.g. `font-mono uppercase` for ticker inputs). When `label` is provided, wraps with `FormField`.                                                                                                                                                                 |
| `AmountInput.tsx`             | `label?` · `value` (plain numeric string) · `onChange(value)` · `prefix?` (default `₹`) · `showWords?` · `error?` · `hint?` · `autoFocus?` | Money entry field. Live Indian-grouped display, inline calculator (`120+45`, safe hand-rolled evaluator — no `eval`), and an amount-in-words helper beneath (via `lib/amountToWords`). Groups on blur, shows raw draft while focused (no cursor jump). Use for all money inputs in place of a raw `TextInput type="number"`.                                |
| `EmptyState.tsx`              | `icon` · `title` · `description?` · `action?`                                                                                              | Icon + title + optional description + optional CTA button. Use for zero-data states.                                                                                                                                                                                                                                                                        |
| `TabStrip.tsx`                | `options[]{value,label,icon?,count?}` · `value` · `onChange` · `scrollable?`                                                               | Underline-style tab strip. Generic over the tab value type. Horizontally scrollable when `scrollable=true`.                                                                                                                                                                                                                                                 |
| `Badge.tsx`                   | `label` · `color?` · `variant?` solid/subtle · `size?` sm/md                                                                               | Coloured pill. `subtle` variant uses `color` at 10% opacity background.                                                                                                                                                                                                                                                                                     |
| `PageHeader.tsx`              | `title` · `subtitle?` · `leading?` · `actions?` · `children?` · `className?`                                                               | Standard page header: `px-4 pt-4 pb-3` bottom-bordered block. `leading` (e.g. back button) sits left of the title, `actions` right-aligned, `subtitle` renders as a `text-sm text-secondary` line, `children` is a full-width slot below the title row. Use at the top of every feature page.                                                               |
| `SectionLabel.tsx`            | `children` · `className?`                                                                                                                  | Small uppercase `text-tertiary` label titling a section between cards/lists. Spacing is caller-controlled via `className` (default `mb-2`; pass `-mb-2` when the parent supplies a gap).                                                                                                                                                                    |
| `PassphraseStrengthMeter.tsx` | `score` 0–4                                                                                                                                | Five-bar zxcvbn strength meter + label. Used by onboarding setup and Change Passphrase.                                                                                                                                                                                                                                                                     |
| `ListContainer.tsx`           | `children` · `className?`                                                                                                                  | Bordered rounded `surface` that hairline-divides its direct children (`divide-[var(--color-border)]`). Standard wrapper for grouped list rows (accounts, transactions, previews).                                                                                                                                                                           |
| `ProgressBar.tsx`             | `value` 0–100 · `color?` · `size?` xs/sm/md · `animate?`                                                                                   | Horizontal fill bar. Clamps value to 0–100.                                                                                                                                                                                                                                                                                                                 |
| `SegmentedControl.tsx`        | `options[]{value,label,icon?,color?}` · `value` · `onChange` · `cols?`                                                                     | 2–4 option radio group. Active option fills with `color` (default `--color-primary`). Background: `bg-surface-2`.                                                                                                                                                                                                                                           |
| `SelectInput.tsx`             | `label?` · `value` · `onChange(value)` · `options[]{value,label}` · `placeholder?` · `required?` · `disabled?` · `error?` · `hint?`        | Custom dropdown: styled trigger + portal-rendered listbox anchored directly below the field (flips above when space is tight). Renders to `document.body` at `z-index:90` so it escapes modal `overflow` clipping and stacks above `z-80` modals; dismisses on outside-click/Escape; repositions on scroll/resize. Wraps `FormField` when `label` provided. |
| `Toggle.tsx`                  | `value` · `onChange(value)` · `disabled?` · `aria-label?`                                                                                  | iOS-style sliding boolean switch. Active: `--color-primary`; inactive: `--color-surface-3`.                                                                                                                                                                                                                                                                 |
| `index.ts`                    | —                                                                                                                                          | Barrel export for all ui components. Import shared primitives from `@/components/ui` (never deep-import the file).                                                                                                                                                                                                                                          |

---

## Hook inventory

### `src/hooks/`

| File                       | Returns                                                                                | Purpose                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useRepository.ts`         | `{ items, loading, error, save, remove, reload }`                                      | Generic hook to load/write from any EncryptedRepository. Used in most feature pages.                                                                                                                                                                                                                                                                                         |
| `useLoggedRepository.ts`   | same shape as `useRepository`                                                          | Wraps `useRepository`, recording CREATE/UPDATE on save + DELETE on remove to the activity log, and firing an Undo toast (restore + reload). Single-entity modules adopt it with `{ entityType, summarize, diffFields? }`.                                                                                                                                                    |
| `usePassphraseStrength.ts` | `{ score, ready }`                                                                     | Lazy-loads zxcvbn and scores a passphrase (0–4). Used by onboarding setup and Change Passphrase.                                                                                                                                                                                                                                                                             |
| `useProfile.ts`            | `{ profile, loading }`                                                                 | The single profile record (or null). Used by FIRE, tax, health, retirement, and the profile editor to read dob/employmentType.                                                                                                                                                                                                                                               |
| `useForecast.ts`           | `{ loading, nowMs, todayStart, startBalance, events, forecast, dueRecurring, reload }` | Loads recurring-flow sources + accounts, computes current liquid balance, and projects it forward via `core/cashflow` (running balance, lowest point, buffer breach, liquidity-based safe-to-spend) plus the due-recurring set. Shared by the Cash Flow page, the safe-to-spend surfaces (Home, Expenses header), and reminders — lives here so features don't cross-import. |
| `useReminders.ts`          | `{ loading, nowMs, reminders, counts, snooze, markDone, log, cancelSub }`              | Builds the header bell's in-app reminders from `useForecast` + `core/reminders`, holding snooze/done state in localStorage. Actions: snooze, mark done, log a due bill (reuses the recurring occurrence builder), cancel a subscription.                                                                                                                                     |
| `useTxnRefresh.ts`         | `notifyTxnChanged()` + `useTxnRefresh(reload)`                                         | Cross-instance live-refresh for transactions/balances. The IOU screen writes expenses through separate repo instances and calls `notifyTxnChanged()` (a `penny:txn-changed` window event); `useExpenses`, `useForecast`, `useHome`, and `useAccounts` subscribe via `useTxnRefresh` so lists, balances, forecast, and net worth reload live.                                 |

_(Track 1 adds: `useDisclosure.ts`, `useAsync.ts`)_

---

## Core layer detail

### `src/core/crypto/`

Three files, one responsibility each:

| File                 | Purpose                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine.ts`          | Pure crypto: symmetric (`deriveKey()`, `encrypt()`, `decrypt()`, `wrapKey()`, `unwrapKey()`, `generateSalt()`, `deriveVerifier()`) + asymmetric device-identity primitives (Track B): `generateSigningKeypair()`/`generateWrappingKeypair()` (ECDSA/ECDH P-256), `sign()`/`verify()`, JWK export/import, `deriveSharedWrappingKey()` (ECDH → AES-GCM KEK). Only file that calls `window.crypto.subtle`. |
| `keystore.ts`        | In-memory Master Key holder. `setMasterKey()`, `getMasterKey()`, `isUnlocked()`, `lock()`. Never writes to storage.                                                                                                                                                                                                                                                                                     |
| `securityManager.ts` | Orchestrates auth lifecycle: `initialize()`, `unlock()`, `verifyPin()`, `isOnboardingComplete()`, `isPinRotationDue()`. Reads/writes the `security` Dexie store.                                                                                                                                                                                                                                        |
| `identityKeys.ts`    | Device identity keypair lifecycle (Track B): `ensureIdentityKeys()` (lazy + idempotent, called at claim), `getSigningKeypair()`/`getWrappingKeypair()`, `getPublicJwks()`. Stores JWKs in the DMK-encrypted `device_keys` table.                                                                                                                                                                        |

### `src/core/db/`

| File                   | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.ts`            | `PennyDatabase` extends `Dexie`. Defines v1→v8 migrations and all store definitions. Exports `db` singleton. (v7 adds `persons` + `ledger_entries` for the IOU ledger; v8 adds `device_keys` + `group_keys` + `sync_cursor` for Track B sync/identity crypto.)                                                                                                                                                                                                                                            |
| `repository.ts`        | `EncryptedRepository<T>` class. Encrypts on `put()`, decrypts on `get()`/`getAll()`. Uses Master Key from keystore.                                                                                                                                                                                                                                                                                                                                                                                       |
| `repositories.ts`      | Pre-instantiated repositories for all encrypted stores. Import from here — never instantiate directly in features.                                                                                                                                                                                                                                                                                                                                                                                        |
| `types/index.ts`       | TypeScript interfaces for all 40+ entity types.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `defaultCategories.ts` | `ALL_DEFAULT_CATEGORIES`, `INTENT_GROUP_META`, `CATEGORY_MIGRATION_MAP`.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `priceCache.ts`        | Helpers for reading/writing the `price_cache` plain store with TTL support.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `seedDemoData.ts`      | Seeds a realistic **multi-year (Jan 2017 → today)** demo dataset after onboarding, tailored per `employmentType` via a per-persona config. Salary steps through a career arc (`SALARY_ARC`/`salaryFor`, aligned to the EPF employer history) with April/July hikes; the latest 12 months are fully detailed, older months carry the core recurring rows (scaled back by a ~5%/yr `grow()` factor). Exports `seedDemoData(employmentType?)`, `clearDemoData()`, and `reseedForEmployment(employmentType)`. |
| `activityLog.ts`       | Timeline service: `logActivity` (fire-and-forget + prune), `restoreActivity` (restores `snapshot` + any other-type `cascade` records — atomic combined Undo), `restoreDeletionsSince`, `summarizeDiff`.                                                                                                                                                                                                                                                                                                   |
| `entityRegistry.ts`    | `entityType → repo.put` map so `restoreActivity` re-inserts snapshots (and cascade records) generically.                                                                                                                                                                                                                                                                                                                                                                                                  |

### `src/core/iou/`

Pure, unit-tested logic for the person-centric IOU ledger (Phase 1.5 Track 1). No React/repo access.

| File             | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ledger.ts`      | Balance math: `signedAmount`, `netBalance`, `balanceByPerson`, `totalOwedToYou`/`totalYouOwe`, `isSettled`, `overdueEntries`.                                                                                                                                                                                                                                                                                                  |
| `expenseLink.ts` | Both-way reconcile. `reconcileExpenseLink` (expense→IOU) — given an expense's existing seeded entries + a new intent, returns `{toPut, toDelete}`. `reconcileLinkedTxn` (IOU→transaction) — given the existing linked Expense + new intent, returns `{put?, deleteId?}` so editing an IOU entry re-syncs its transaction and toggling the link off deletes it. Types `ExpenseIouIntent`/`ExpenseSeedIntent`/`LinkedTxnIntent`. |
| `aiLabels.ts`    | `assignOrdinalLabels` — the single sanctioned path for putting IOU people into AI context (names → "Person N").                                                                                                                                                                                                                                                                                                                |
| `migration.ts`   | `parsePersonName` + `migrateLegacyIous` — legacy `personal_ious` → persons/ledger entries (run by `useIou`, flag `penny_iou_v2`).                                                                                                                                                                                                                                                                                              |

IOU UI lives in `src/features/iou/` (`IouView` shared by `/app/iou` and the Expenses → IOU tab;
`PersonListView`, `PersonLedgerView`, `EntryForm`, `SettleUpModal`, `PersonForm`, `PersonPicker`).

### `src/core/ai-safety/`

| File                  | Purpose                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `buildUserContext.ts` | Only path to the Anthropic API. Strips/bands/generalises PII. Returns `UserContext` struct. |
| `piiScanner.ts`       | Regex-based PII scanner. Used by the CI gate.                                               |
| `mockChip.ts`         | Phase 1 Chip simulation. All Phase 1 Chip responses come from here.                         |

---

## External APIs

| API                          | Used for                                    | Client file                           | Cache TTL |
| ---------------------------- | ------------------------------------------- | ------------------------------------- | --------- |
| MFAPI.in                     | MF search, NAV, scheme metadata             | `src/core/db/priceCache.ts`           | 24h       |
| Yahoo Finance (unofficial)   | Stock search, live price                    | `src/core/db/priceCache.ts`           | 15 min    |
| investorgain.com (webnodejs) | IPO data (all 4 tabs), GMP, subscription    | `src/core/ipo/ipoClient.ts`           | 30 min    |
| npsnav.in                    | NPS fund NAV                                | `src/core/nps/npsClient.ts`           | 24h       |
| vahandetails.com             | Vehicle RC lookup, depreciation             | `src/core/vehicle/rcClient.ts`        | 30 days   |
| Market data (indices/forex)  | Sensex, Nifty, Gold, Silver, USD-INR, Crude | `src/core/market/marketDataClient.ts` | 15 min    |

**Base-URL resolution (`src/core/net/apiBase.ts`):** every client reads its host from here. When
`VITE_API_PROXY` is set, all of the above route through the **API Proxy Worker** (`workers/api-proxy/`,
Phase 1.5 Track A) for CORS + shared caching; when unset, calls go direct (Yahoo via the Vite dev
proxy) — the app stays fully usable with no backend. The worker passthrough-caches Yahoo/MFAPI/NPS/IPO
in KV and keeps a **permanent D1 cache + morning queue** for the rate-limited vahandetails API; the
vehicle client surfaces the worker's `queued` response via `VehicleQueuedError`. See
[`docs/plans/phase-1.5-track-A-api-proxy.md`](plans/phase-1.5-track-A-api-proxy.md) and
[`workers/api-proxy/README.md`](../workers/api-proxy/README.md).

**Auth/Identity (`workers/auth/` + `src/core/identity/`, Phase 1.5 Track C):** a second worker
(`penny-auth`) stores identity metadata only — D1 `users` + `devices` (public keys, optional
username). **Model B: no personal blob on the server** (personal backup is the user's own
Drive/iCloud). The client layer: `apiBase.ts` resolves `AUTH_BASE` (`VITE_AUTH_PROXY`, else
`${VITE_API_PROXY}/auth`); `signedFetch.ts` is the single choke point for authenticated calls
(challenge → ECDSA-sign `nonce\nMETHOD\npath\nsha256(body)` → `x-penny-*` headers), reused by Tracks
D/E; `claim.ts` runs the register/claim flow (consumes Track B's `ensureIdentityKeys`). All gated
behind the **`sync` entitlement (dark by default)**. See
[`workers/auth/README.md`](../workers/auth/README.md).

**Automatic backup + sync (`src/core/sync/`, Phase 1.5 Track D, Model B):** backs up/syncs the
encrypted `.penny` blob to the user's **own cloud** (nothing on our servers). A **provider abstraction**
`providers/` (`CloudProvider`): `googleDriveProvider` (web, live), `icloudProvider` (**dormant** until
the Capacitor native shell — `src/core/platform/` `isNative()`/`isApple()`), and `localBackup` (OPFS
daily on-device floor). `backupEngine.ts` (pure `decide.ts` + `sync_cursor`) pushes on debounced change
(the new `activityLog` `subscribeActivity` emitter) + a daily timer, and pulls periodically →
`backupManager.openBundleWithDmk` → `mergeBundle` (LWW). `SyncProvider.tsx` (mounted in the unlocked
`AppShell`) runs the engine and exposes `useBackupStatus`; `src/lib/debounce.ts` backs the change
debounce. Destination + status UI in `features/backup/AutoBackupCard.tsx`; `core/backup/cloudBackup.ts`
is now a thin adapter over `googleDriveProvider`. Gated by the free `cloud_backup` entitlement (no
account claim required).

**Groups & Household OS (`workers/groups/` + `src/core/groups/`, Phase 1.5 Track E — E1):** a third
worker (`penny-groups`) relays **ciphertext-only** shared-ledger data (Model B) — D1 (`groups`,
`group_members`, `invites`, `group_key_grants`, `group_events` — with the encrypted event body stored
inline in `group_events.ciphertext` = `AES-GCM(GroupKey, eventJson)`; no R2 needed) + KV (its own
`/challenge` nonces). It binds
the auth D1 read-only (`AUTH_DB`) to look up device signing/wrapping keys, then verifies the same signed
request as Track C **plus a membership/role check**. The client layer: `apiBase.ts` resolves
`GROUPS_BASE` (`VITE_GROUPS_PROXY`, else `${VITE_API_PROXY}/groups`); `signedFetch` gained a `base`
param so the groups worker reuses the choke point; `core/groups/keys.ts` generates the per-epoch
**Group Key**, wraps it to a member's ECDH key as a grant (Track B `deriveSharedWrappingKey`) and
encrypts/decrypts event bodies; `core/groups/groupsClient.ts` wraps the worker endpoints. Local mirrors
in Dexie **v9** (`groups`/`group_members`/`group_events`). Behind the **`sync` entitlement (dark)**;
group UX (create/invite/join/split/settle) lands in E2–E5. See
[`workers/groups/README.md`](../workers/groups/README.md).

---

## Context providers

| Context            | Stored in                  | Key values                                                                    |
| ------------------ | -------------------------- | ----------------------------------------------------------------------------- |
| `PrivacyContext`   | React state + localStorage | `mode: PrivacyMode`, `setMode()`, `maskValue()`, `canUseAI()`                 |
| `SettingsContext`  | localStorage               | `moduleVisibility`, `fontScale`, `theme`, `defaultPrivacyMode`, `setModule()` |
| `EventModeContext` | Dexie (`hashtags` store)   | `activeEvent`, `addEvent()`, `stopEvent()`, `promoteHashtagToEvent()`         |

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

| Tool                | Version      | Purpose                                                                            |
| ------------------- | ------------ | ---------------------------------------------------------------------------------- |
| Vite                | 8.x          | Dev server + build bundler                                                         |
| TypeScript          | 6.x (strict) | Type checking — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Tailwind CSS        | 4.x          | Utility CSS — semantic tokens defined in `src/index.css`                           |
| Dexie               | 4.x          | IndexedDB wrapper with Dexie Table typing                                          |
| VitePWA             | —            | Service Worker, Workbox, PWA manifest                                              |
| Vitest              | 4.x          | Unit + integration tests                                                           |
| ESLint              | 10.x         | Lint + architecture enforcement                                                    |
| Prettier            | 3.x          | Code formatting                                                                    |
| Husky + lint-staged | —            | Pre-commit hooks                                                                   |
| xlsx                | 0.18.x       | XLSX export (loans amortization)                                                   |
| zip.js              | 2.8.x        | AES-256 password-protected ZIP export                                              |
| zxcvbn              | 4.x          | Passphrase strength estimation                                                     |

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
│  • useEffect for data loading + repo calls              │
│  • useCallback mutations (create/update/delete)         │
│  • useMemo derived values (totals, filtered lists)      │
│  • loading/saving flags                                 │
│  • Does NOT own UI state (forms, modals, selections)    │
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

### Example: Expenses feature (before vs after Track 1B)

**Before (wrong — everything in one file):**

```
src/features/expenses/
  ExpensesPage.tsx    ← 3,130 lines: calculations + state + data fetching + UI
  ExpenseForm.tsx     ←   767 lines: state + data fetching + UI
```

**After Track 1B (correct):**

```
src/features/expenses/
  useExpenses.ts         ← domain hook: load txns/categories/accounts, seeding, derived maps
  useSubscriptions.ts    ← domain hook: subscription detection, confirm/dismiss/cancel mutations
  useIou.ts              ← domain hook: IOU CRUD, sorted/filtered derived lists
  useBudgets.ts          ← domain hook: budget CRUD, current-month budgets
  ExpensesPage.tsx       ← thin page: calls all 4 hooks + owns all filter/analytics/form UI state
  ExpenseForm.tsx        ← form layout only

src/core/expenses/
  filterAndAggregate.ts  ← pure: filtering, grouping, category aggregation
```

**Current — vertical slices (mirrors the portfolio pattern):**

`ExpensesPage` is a thin shell (~95 lines): calls `useExpenses` + `useTransactionFilters`, renders
`<ExpensesHeader>` + the tab strip, and dispatches to one self-contained slice per tab. Each slice
owns its own UI state, modals, and FAB — no central modal orchestration.

```
src/features/expenses/
  ExpensesPage.tsx         ← thin shell: header + tab strip → <XSlice>
  ExpensesHeader.tsx       ← header chrome: title/total + events/import/export buttons + their modals
  useExpenses.ts           ← shared domain hook: txns/categories/accounts, seeding, derived maps
  transactions/
    TransactionsSlice.tsx  ← owns filter bar, chips, speed-dial FAB, select mode + bulk bar, ExpenseForm + Filter + MonthPicker modals
    useTransactionFilters.ts ← filter state + filteredExpenses/grouped/total/activeFilterCount
    TransactionsTab.tsx · ExpenseForm.tsx · FilterModal.tsx · MonthPickerModal.tsx · ExpenseExportModal.tsx
    AccountChips.tsx · PaymentModeChips.tsx · paymentModes.ts · BulkAccountPaymentModal.tsx
  categories/              ← category manager (opened from ExpenseForm's Select Category popup)
    CategoryPickerModal.tsx ← Select + Manage modes; parent-aware grouping; bulk move/delete
    CategoryEditorModal.tsx · ParentEditorModal.tsx · IconGridPicker.tsx · types.ts (CategoryManager)
  budgets/
    BudgetsSlice.tsx       ← owns BudgetModal · BudgetsTab.tsx · BudgetModal.tsx · useBudgets.ts
  analytics/
    AnalyticsSlice.tsx     ← owns view/month state, calls useEventMode() + useExpenseAnalytics
    useExpenseAnalytics.ts ← pure-input derivation hook (group/event/prev-month/velocity/annual)
    AnalyticsTab.tsx
  subscriptions/
    SubscriptionsSlice.tsx ← renders the shared <SubscriptionsView> from src/features/subscriptions/
  events/
    EventsModal.tsx        ← create/edit/stop/reactivate events; calls useEventMode() directly
    useEventEditor.ts      ← edit-event flow incl. out-of-range unlink confirmation
  iou/
    IouSlice.tsx           ← summary strip + shared IouListView + FAB + IouForm

src/features/iou/          ← IOU is shared between the /app/iou route and the expenses IOU tab
  useIou.ts                ← domain hook: IOU CRUD + sorted/derived lists (used by both)
  IouCard.tsx · IouListView.tsx ← shared presentation (ListRow + DueDateBadge)
  IouPage.tsx · IouForm.tsx

src/core/expenses/
  filterAndAggregate.ts    ← pure: grouping, category aggregation, calcTxnCountByCategory
  categoryGroups.ts        ← pure: groupKey / groupMeta / buildParentCategoryMap (parent-aware grouping)
  categoryIcons.ts         ← curated category icon set + shared CAT_COLORS palette
  merchantMemory.ts        ← pure: normalizeMerchant / memoryKey / buildMemory (Track 6 auto-fill)
  recurringDue.ts          ← pure: computeDueRecurring / buildOccurrence (Track 6 auto-post inbox)
  annualAnalytics.ts       ← pure: buildAnnualSeries / computeSavingsRate / biggestMovers (annual income vs spend + projection)
  monthlyInsights.ts       ← pure: monthlyRecap / computeAnomalies (Track 6 recap card + anomaly nudges)
src/lib/
  dateUtils.ts             ← toDateKey, dateLabel, offsetMonth, monthLabel (pure, no React)
```

### Example: Portfolio feature (Track 1B)

The portfolio feature is organised as **vertical slices** — each asset category owns its view
cards, add/edit modal(s) and any sheets. `PortfolioPage` is a thin housing (~170 lines): header
totals + Holdings/IPO top tabs + the holdings sub-tab strip that dispatches to the active section.

```
src/features/portfolio/
  usePortfolioHoldings.ts ← domain hook + exports HoldingsSubTab, HOLDINGS_SUBTABS, effectiveValue
  PortfolioPage.tsx       ← thin housing: header + top tabs → <XSection> | <IpoTab>
  holdings/
    fixed-income/         ← FixedIncomeSection, FdCard/RdCard, FdModal, FdFields, useFdPreview
    precious-metals/      ← PreciousMetalsSection, PreciousMetalCard, GoldModal, GoldFields
    real-assets/          ← RealAssetsSection, Vehicle/Property cards, VehicleDetailModal,
                            UpdateValueSheet, Vehicle/Property/Other modals, Vehicle/Property fields,
                            useVehicleLookup, ValidityBadge, realAssetHelpers
    retirement/           ← RetirementSection, RetirementCard, EPF/PPF sheets, RetirementSheets,
                            Nps/Ppf/Epf modals + fields, NpsLifecycleDetail
    equity/               ← EquitySection (stocks+MF grouping/lots), Stock/Mf modals + fields,
                            useLivePrice, useMfSearch, useMfSchemeDetail
    shared/               ← ONLY cross-category form primitives:
      registry.ts         ← ASSET_CLASSES, ASSET_META, holdingFormTitle()
      SharedHoldingFields (Name/value/notes), useSharedHoldingFields, helpers (nowMs)
  ipo/                    ← IpoTab + IpoDetailModal + ipoHelpers
```

Each category module is self-contained: its cards, section, modal(s), field-group(s), class hooks
and class-only helpers live together. `shared/` holds **only** what 2+ categories use.

**Per-category Section** (`<XSection holdings mode onSave onRemove>`): renders the cards and owns
its add/edit modal state — no central form. **Per-class modal** (`<XModal editing onSave onClose
onDelete>`): composes `useSharedHoldingFields` + `SharedHoldingFields` + its `<XFields>`, and on save
builds the base holding via `buildBaseHolding` then applies a pure mapper. Save/validate logic is
pure in `core/portfolio/holdingMappers.ts` (+ `vehicleMeta.ts`), unit-tested in
`tests/portfolio/holdingMappers.test.ts`. Network calls live in `core/portfolio/*ApiClient.ts`.

Complex pages compose multiple focused domain hooks — one per domain concern. The page owns
its own UI interaction state (form fields, modal toggles, which item is being edited).
Bridge functions that read UI state then call a hook mutation live in the page.

### React Native portability by layer

| Layer                          | RN effort                         | Why                                                    |
| ------------------------------ | --------------------------------- | ------------------------------------------------------ |
| `src/core/`                    | Zero changes                      | Pure TypeScript, no browser deps                       |
| Feature hooks (`use{Name}.ts`) | Zero changes                      | React hooks work identically in RN                     |
| Feature UI (`{Name}Page.tsx`)  | Swap component implementations    | Pages call `<Card>`, `<Modal>` — not Tailwind directly |
| `src/components/ui/`           | Create `*.native.tsx` variants    | Same props API, different renderer                     |
| `src/core/db/`                 | Replace Dexie with SQLite         | Isolated behind EncryptedRepository interface          |
| `src/core/crypto/`             | Replace Web Crypto with RN crypto | Isolated in engine.ts                                  |

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

### Decision: Keypair + username auth (NO phone, NO OTP, NO email) — reconciled 2026-06-27

**Rationale (Phase 1.5, Track A reconciliation):** phone + OTP was **dropped** — SMS gateways cost
money and a phone number is maximal PII, both contradicting the product. Identity is an on-device
keypair + a self-chosen `username` + the existing `Profile.userId`; recovery is a server-blind
encrypted blob looked up by username; the passphrase is the only decryption secret. **No PII reaches
the server.** (Superseded the earlier "Phone OTP auth" decision; see `docs/ROADMAP.md` → Authentication
and the parent plan → Track C.)

### Decision: Client-side encryption only, user-owned cloud backup

**Rationale (Phase 2):** Option A (no key escrow). The strongest possible privacy promise: we cannot decrypt your data even if legally compelled. Backup goes to the user's Google Drive / iCloud as an encrypted blob — we never touch it. Users who lose their passphrase lose their data. This is the stated tradeoff (communicated in onboarding).

### Decision: Envelope encryption (random DMK), not passphrase-derived MK

**Rationale (Track 2):** Deriving the Master Key directly from the passphrase makes the data key _be_ the passphrase — so changing the passphrase forces re-encrypting every record (slow, corruption-prone). Switching to a random **Data Master Key** wrapped independently by a passphrase-KEK and a PIN-KEK (the standard "envelope" / key-wrapping pattern) means changing any factor is just a re-wrap — instant, no data re-encryption — and adding biometric later is just another wrapping slot. The DMK is non-extractable and in memory only while unlocked. Full re-encryption was rejected: in a local-only app a DMK leak implies device compromise (plaintext already exposed), so key-rotation buys ~nothing. Changing the passphrase requires the current passphrase. See `docs/ROADMAP.md` → _Pre-Phase 1.5 Track 2_.

### Decision: Local identity now, server registration later

**Rationale (Track 2):** Create `userId` + `username` + an on-device keypair locally at onboarding with no backend. Phone+OTP server registration is an optional Phase 1.5 upgrade that "claims" the existing local identity — so groups/cloud-sync arrive with **no data migration**, while Phase 1 stays backendless and SMS-free.

### Decision: Always-on entitlement gate for pricing-readiness

**Rationale (Track 2):** Route would-be-paid features (e.g. cloud backup) through a single `entitlement` check that currently always returns pro/true. Enabling pricing later (store receipts on native, offline-verifiable signed license tokens on web) swaps the entitlement source without touching feature code and without storing user data.

### Decision: React Native for mobile (not Capacitor)

**Rationale (Phase 2):** Capacitor wraps the web app in a WebView — performance is constrained by CSS rendering and JavaScript layout. React Native renders to native components. The component extraction in Pre-Phase 1.5 (semantic variant props, no Tailwind className in feature files) makes the migration mechanical: swap component implementations, keep all business logic and `src/core/`.

### Decision: Domain hooks, not page-god-hooks

**Rationale:** A single hook that owns everything for a page (all useState, all effects, all form state, all mutations) violates SRP, is hard to test, and returns 20+ values with unclear cohesion. Instead: each hook has one domain responsibility (data loading + mutations for one entity). Form fields, modal toggles, and selection state (`editing`, `deletingId`) stay in the page component — they're local UI state, not business state. Bridge functions that read UI state and call a domain mutation (e.g. `handleSave` reads the form, then calls `saveAccount(form, editing)`) also stay in the page. Complex pages compose multiple focused hooks (e.g. `ExpensesPage` calls `useExpenses`, `useSubscriptions`, `useIou`, `useBudgets`). Each domain hook exports ≤10 values and is independently testable with `renderHook`.

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
