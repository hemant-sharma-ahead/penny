# Penny — Architecture Reference

This document describes the codebase structure, every directory and its purpose, and the key architectural decisions with their rationale.

**Last updated:** July 2026 (Phase 1.5 + Mobile Migration Track 0)

> **UI design guidance lives in [`docs/DESIGN_GUIDELINES.md`](DESIGN_GUIDELINES.md)** — ethos, patterns, themes, colours, and the mockup workflow. This doc covers code structure & architecture only.

---

## Directory structure

**Monorepo restructuring (Mobile Migration Track 0, July 2026):** the repo is now a pnpm workspace. Everything under the old `src/core/`, `src/lib/`, and the framework-agnostic half of `src/hooks/` moved verbatim into `packages/core/` (a new platform-agnostic package, `@penny/core`) so it can eventually be shared with the Expo/React Native mobile app. Everything else (feature UI, components, context, router) moved into `apps/web-legacy/` — the existing app, unchanged in behavior, kept alive as-is until the mobile app reaches parity (see [`docs/plans/mobile-migration.md`](plans/mobile-migration.md)). The Cloudflare Workers (`workers/`) are untouched and remain independent npm projects outside the pnpm workspace.

```
penny/
├── pnpm-workspace.yaml          ← workspace packages: packages/*, apps/* (workers/* stay independent)
├── tsconfig.json                ← root orchestrator: references packages/core + apps/web-legacy
├── vitest.config.ts             ← root-level: tests/worker/** only (Cloudflare Workers tests)
├── eslint.config.js             ← shared lint rules across all packages (architecture enforcement)
│
├── packages/
│   └── core/                    ← @penny/core — pure TypeScript, zero DOM/RN-specific deps (yet)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── src/
│       │   ├── core/            ← same domains as before (accounts, ai-safety, backup, cashflow,
│       │   │                       crypto, db, expenses, export, fd, goals, groups, health, identity,
│       │   │                       import, insurance, iou, ipo, loans, market, metals, net, news, nps,
│       │   │                       platform, portfolio, profile, reminders, sentiment, session
│       │   │                       (sessionStore.ts only — SessionGate.tsx stays app-local, see below),
│       │   │                       subscriptions, sync, tax, vehicle, advisor, entitlement)
│       │   ├── lib/             ← formatters.ts, date.ts, statusColors.ts, amountToWords.ts, debounce.ts, image.ts, maskAmounts.ts
│       │   ├── hooks/           ← the 5 hooks with no React Context/router dependency:
│       │   │                       useDataRefresh, usePassphraseStrength, useProfile, useRepository, useTxnRefresh
│       │   └── index.ts         ← placeholder package entry (nothing imports `@penny/core` by name yet — see note below)
│       └── tests/               ← everything from the old root tests/ except tests/worker
│
├── apps/
│   └── web-legacy/               ← today's app, moved as-is; frozen (bugfixes only) until Track 7 retires it
│       ├── package.json
│       ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
│       ├── vite.config.ts        ← same PWA/proxy config as before, plus the Track 0 alias shim (below)
│       ├── vitest.config.ts      ← placeholder (no UI test suite exists yet)
│       ├── index.html, public/, scripts/
│       └── src/
│           ├── App.tsx, main.tsx, index.css
│           ├── features/         ← unchanged feature modules (one per app section)
│           ├── components/       ← unchanged shared UI (layout/, privacy/, ui/, AssetTaxNote.tsx)
│           ├── context/           ← unchanged (PrivacyContext, SettingsContext, EventModeContext, ToastContext)
│           ├── hooks/             ← the 3 hooks that stayed app-local (React Context/router-coupled):
│           │                        useForecast, useLoggedRepository, useReminders
│           ├── session/           ← SessionGate.tsx (moved back out of core/session — it's router+Context-coupled,
│           │                        not portable business logic; sessionStore.ts stayed in packages/core/src/core/session/)
│           └── router/            ← unchanged (index.tsx, paths.ts, AuthGuard.tsx)
│
├── workers/                      ← unchanged: api-proxy, auth, groups (independent npm projects, own lockfiles)
└── docs/
```

**Track 0 path-aliasing shortcut (temporary):** rather than editing hundreds of `@/core/...`/`@/lib/...` import statements across `apps/web-legacy`, its `tsconfig.app.json` and `vite.config.ts` map those specifiers straight into `packages/core/src/` via relative paths (see the comment in `apps/web-legacy/tsconfig.app.json`). `apps/mobile` (Track 1) will need real package-boundary resolution (`@penny/core`, via `package.json`'s `main`/`exports`) since Metro doesn't support this kind of raw cross-workspace relative aliasing — that's when `packages/core/src/index.ts`'s placeholder gets a real curated export surface.

**Known seam surfaced during Track 0 (flagged, not fixed):** `packages/core/src/core/entitlement/entitlement.ts`, `core/net/apiBase.ts`, and `core/sync/providers/googleDriveProvider.ts` read `import.meta.env.VITE_*` directly — a Vite-ism with no Metro/RN equivalent. Kept as-is (types-only fix: `packages/core/tsconfig.json` now includes `vite/client` types) to preserve behavior; needs a small platform-agnostic env-access abstraction before Track 1's mobile app can consume these files.

**Also surfaced:** `packages/core/src/core/advisor/guidance.ts` used to import `PATHS` from the web router to build "navigate to X" recommendation actions — a real core→app coupling. Fixed during Track 0 (not deferred, since it was a one-line-risk mechanical change): `guidance.ts` now returns a semantic `AppRouteKey` (`'goals' | 'insurance' | ...`), and the one caller (`FinancialHealthCard.tsx`) maps that key to an actual `PATHS` value via a small local lookup. Behavior is unchanged; `packages/core` no longer imports anything router-specific.

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

| File            | Props      | Purpose                                                                                                     |
| --------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `AppShell.tsx`  | `children` | Sticky 48px header (logo + privacy badge), scrollable page area, 64px bottom nav                            |
| `BottomNav.tsx` | —          | 5-tab nav: Home, Portfolio, Chip (FAB centre), Expenses, Goals. Respects SettingsContext module visibility. |

### `src/components/privacy/`

| File                      | Props                 | Purpose                                                                            |
| ------------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| `MaskedValue.tsx`         | `value`, `className?` | Shows `••••` in safe/privacy modes. Tap to peek for 5 seconds in safe mode.        |
| `PrivacyBadge.tsx`        | —                     | Coloured badge (amber/violet/red) showing current mode. Tappable to open switcher. |
| `PrivacyModeSwitcher.tsx` | `isOpen`, `onClose`   | 3-segment toggle. PIN modal fires when switching to Open mode.                     |

### `src/components/demo/`

| File                | Props | Purpose                                                                                                                                                                                                                                                       |
| ------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DemoModeBanner.tsx` | —     | Persistent purple strip mounted in `AppShell`, gated on `profile.demoSeeded`. "Exit Demo Mode" opens a `ConfirmDialog`; confirming calls `wipeDemoData()` and navigates to `/onboarding/let-us-know-you` with `{ state: { fromDemoMode: true } }`, handing off to the real-setup sequence. `SettingsPage`'s danger-zone "Exit Demo Mode" button (same visibility guard, `profile.demoSeeded`) does the identical thing — the two are separate entry points into one behaviour, not two different actions. |

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
| `LifeRow.tsx`                 | `icon` · `label` · `alignTop?` · `children`                                                                                                | Labelled row for one optional "Life & household" field (icon + label left, control right). Shared by Edit Profile and onboarding's `LifeHouseholdScreen`.                                                                                                                                                                                                   |
| `OptionalSeg.tsx`             | `options[]{value,label}` · `value` · `onChange(v \| undefined)`                                                                            | Compact segmented control for an optional, clearable field — tap the active segment again to unset it. Distinct from `SegmentedControl` (which requires a value). Shared by Edit Profile and `LifeHouseholdScreen`.                                                                                                                                        |
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
| `useDataRefresh.ts`        | `notifyCategoriesChanged()`/`useCategoriesRefresh(reload)`, `notifyAccountsChanged()`/`useAccountsRefresh(reload)`, `notifyTagsChanged()`/`useTagsRefresh(reload)` | Same pattern as `useTxnRefresh`, for categories/accounts/tags. `SafeModeSettingsPage` and `ManageTagsPage` edit these through their own repo instances (separate routes from Expenses); `useExpenses` subscribes to all three events, so a Safe Mode or Manage Tags change reflects immediately without waiting for those screens to remount. |

_(Track 1 adds: `useDisclosure.ts`, `useAsync.ts`)_

---

## Core layer detail

### `src/core/crypto/`

Three files, one responsibility each:

| File                 | Purpose                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine.ts`          | Pure crypto: symmetric (`deriveKey()`, `encrypt()`, `decrypt()`, `wrapKey()`, `unwrapKey()`, `generateSalt()`, `deriveVerifier()`) + asymmetric device-identity primitives (Track B): `generateSigningKeypair()`/`generateWrappingKeypair()` (ECDSA/ECDH P-256), `sign()`/`verify()`, JWK export/import, `deriveSharedWrappingKey()` (ECDH → AES-GCM KEK). Only file that calls `window.crypto.subtle`. |
| `keystore.ts`        | In-memory Master Key holder. `setMasterKey()`, `getMasterKey()`, `isUnlocked()`, `lock()`. Never writes to storage.                                                                                                                                                                                                                                                                                     |
| `securityManager.ts` | Orchestrates auth lifecycle: `initialize()`, `unlock()`, `verifyPin()`, `changePin()`, `changePassphrase()` (once/24h throttle), `isOnboardingComplete()`, `isPinRotationDue()`. **Track F Forgot-PIN recovery**: `unlockWithPassphrase()` and `resetPinWithPassphrase()` — an independent passphrase-attempt counter/lockout (`getPassphraseLockoutState()`) kept separate from the PIN's own, so exhausting one factor never blocks the other. **Demo Mode**: `DEMO_PIN`/`DEMO_PASSPHRASE` (fixed, shown constants) + `exitDemoMode()` — re-keys the throwaway demo vault to real credentials, deliberately bypassing the once/24h throttle since the vault is seconds old. Reads/writes the `security` Dexie store.                                                                                                                                                                                                                                        |
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
| `seedDemoData.ts`      | Seeds a realistic **multi-year (Jan 2017 → today)** demo dataset, tailored per `employmentType` via a per-persona config. Salary steps through a career arc (`SALARY_ARC`/`salaryFor`, aligned to the EPF employer history) with April/July hikes; the latest 12 months are fully detailed, older months carry the core recurring rows (scaled back by a ~5%/yr `grow()` factor). Only ever called from `DemoVaultScreen` (the "Explore with Demo Data" branch) — never from the real-setup sequence. Exports `seedDemoData(employmentType?)`, `wipeDemoData()` (wholesale `.clear()` on every financial table, no reload/navigation — both `DemoModeBanner`'s "Exit Demo Mode" and Settings' equivalent button call it directly, then hand off to the real-setup sequence), and `reseedForEmployment(employmentType)`. |
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

IOU UI lives in `src/features/iou/` (`IouView` rendered in the Expenses → IOU tab — the standalone
`/app/iou` route + `PATHS.app.iou` were removed; the Net Worth IOU tap now navigates to that tab;
`PersonListView`, `PersonLedgerView`, `EntryForm`, `SettleUpModal`, `PersonForm`, `PersonPicker`).

### `src/core/sentiment/`

Pure, unit-tested, **on-device, no-AI** news sentiment engine (news-sentiment Phase A + B). Lexicon +
rules only — descriptive/informational, never a recommendation or forecast. See
[`docs/features/news-sentiment.md`](features/news-sentiment.md) and
[`docs/MARKET_SENTIMENT_RESEARCH.md`](MARKET_SENTIMENT_RESEARCH.md).

| File                  | Purpose                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `normalize.ts`        | `tokenize` — lowercase + split a headline into word tokens (keeps contractions for negation).                    |
| `lexicon.ts`          | Bundled finance-tuned word lists: `POSITIVE`/`NEGATIVE` (weighted), `INTENSIFIERS`, `NEGATORS`, `EFFECT_WINDOW`. |
| `scoreHeadline.ts`    | `scoreHeadline(text)` → `{ score, label, matched[] }` with VADER-style negation + intensifier windows.           |
| `aggregate.ts`        | `computeMood(scored[])` → `MoodSummary` (positive/negative/neutral counts + descriptive skew label).             |
| `entityDictionary.ts` | Bundled NSE/BSE company → `{ symbol, name, sector, aliases }` (Phase B). Starter set of widely-held names.       |
| `tagEntities.ts`      | `tagEntities(text)` → `EntityMatch[]` — companies a headline mentions (word-boundary, longest-alias-first).      |
| `types.ts`            | `SentimentLabel`, `ScoredHeadline`, `MatchedTerm`, `MoodSummary`.                                                |

Sentiment UI lives in `src/features/news/`: `useNewsSentiment` (scoring + mood), `SentimentChip`,
`NewsMoodGauge`, and — Phase B — `useHoldingsInNews` + `HoldingsInNews` ("your holdings in the news":
cross-references `holdingsRepo` stock holdings with tagged headlines, recency-ordered). All score the
headlines already fetched by the news module — no new network calls, no AI, no PII.

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

**Auth/Identity (`workers/auth/` + `src/core/identity/`, Phase 1.5 Track C + Track F recovery):** a second worker
(`penny-auth`) stores identity metadata only — D1 `users` + `devices` (public keys, optional
username). **Model B: no personal blob on the server** (personal backup is the user's own
Drive/iCloud). The client layer: `apiBase.ts` resolves `AUTH_BASE` (`VITE_AUTH_PROXY`, else
`${VITE_API_PROXY}/auth`); `signedFetch.ts` is the single choke point for authenticated calls
(challenge → ECDSA-sign `nonce\nMETHOD\npath\nsha256(body)` → `x-penny-*` headers), reused by Tracks
D/E; `claim.ts` runs the register/claim flow (consumes Track B's `ensureIdentityKeys`) and also
exports `reclaimAccount()` (username+passphrase handle reclaim) and `PROFILE_UPDATED_EVENT`
(dispatched on claim/reclaim so non-reactive consumers like `GroupContext` refresh); `recovery.ts`
(**Track F/F3, scheme A**) derives a deterministic Ed25519 keypair from `PBKDF2(passphrase, salt)`
and signs the reclaim challenge — the server stores only the public key. The auth worker adds
`POST /recover/start` + `POST /recover/finish` (Ed25519 verifier) and migration
`migrations/0003_recovery.sql` (adds `users.recovery_salt` + `users.recovery_pubkey`). All gated
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
| `PrivacyContext`   | React state + localStorage | `mode: PrivacyMode`, `setMode()`, `maskValue()`, `shouldMask(sensitive)`, `canUseAI()`, `openModeExpiresAt: number \| null` — `shouldMask` is the single source of truth for amount masking: Open never masks, Privacy always masks, Safe masks only when `sensitive` is true. Open is never a persistent state — `mode` always starts at `defaultPrivacyMode` (Safe or Privacy) on launch, and `setMode('open')` arms an auto-revert `setTimeout` (duration from `openModeDurationMinutes`) plus an immediate revert on `visibilitychange`/backgrounding |
| `SettingsContext`  | localStorage               | `moduleVisibility`, `safeModeVisibility` (`loans`/`iou`/`portfolio`/`goals`/`insurance`/`subscriptions`, all default visible), `fontScale`, `theme`, `defaultPrivacyMode: PersistedPrivacyMode` (Safe/Privacy only — Open excluded from the type, legacy `'open'` values coerce to Safe), `openModeDurationMinutes` (1/5/10/15/30, default 1) + `setOpenModeDurationMinutes()`, `setModule()`, `setSafeModeVisibility()` |
| `EventModeContext` | Dexie (`hashtags` store)   | `activeEvent`, `addEvent()`, `stopEvent()`, `promoteHashtagToEvent()`         |
| `OnboardingDraftContext` | React state (in-memory only) | `fullName`/`username`/`dob`/`employmentType`, Life & household fields (`maritalStatus`/`children`/`homeOwner`/`riskAppetite`), `accountsToCreate: DraftAccount[]`, `backupChoice`, `fromDemoMode` (set from router location state when reached via Exit Demo Mode) + `setDraft(patch)`. Scoped to the `/onboarding/*` route tree (mounted by `OnboardingLayout`) — nothing here persists until the final vault step writes it. |

---

## Router structure

```
/                        → redirect to /onboarding/splash
/onboarding/
  splash                 → SplashScreen
  privacy-promise        → PrivacyPromiseScreen
  privacy-demo           → PrivacyDemoScreen
  chip-intro             → ChipIntroScreen
  simulated-dashboard    → SimulatedDashboardScreen (fork: Explore with Demo Data / Setup my Account)
  start                  → AccountStartScreen (Start fresh / Restore / Reclaim) — "Setup my Account" branch
  account                → AccountRecoveryScreen (segmented new / restore / reclaim)
  demo-vault             → DemoVaultScreen (shown throwaway PIN/passphrase) — "Explore with Demo Data" branch
  let-us-know-you        → LetUsKnowYouScreen — both branches converge here
  life-household         → LifeHouseholdScreen (optional Life & household fields)
  add-accounts           → AddAccountsScreen (optional quick-add accounts)
  backup-setup           → BackupSetupScreen (optional This Device / Drive / iCloud choice)
  setup                  → SetupCredentialsScreen (passphrase + PIN — initialize() or exitDemoMode())

/app/ (all behind AuthGuard → AppShell)
  home                   → HomePage
  portfolio              → PortfolioPage
  expenses               → ExpensesPage
  goals                  → GoalsPage
  insurance              → InsurancePage
  subscriptions          → SubscriptionsPage
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

**Onboarding flow (2026-07, Demo Mode first):** Splash → Privacy Promise → Privacy Demo → Chip Intro →
Preview Dashboard, which forks:

- **"Setup my Account"** → `AccountStartScreen` → `AccountRecoveryScreen` (new tab; restore/reclaim
  tabs recover an existing account and skip everything below) → straight to Let-us-know-you.
- **"Explore with Demo Data"** → `DemoVaultScreen` (fixed, shown `DEMO_PIN`/`DEMO_PASSPHRASE` init the
  vault) → the app, tagged Demo Mode (`DemoModeBanner` in `AppShell`, gated on `profile.demoSeeded`) →
  "Exit Demo Mode" (`wipeDemoData()` + `navigate(..., { state: { fromDemoMode: true } })`) → also lands
  on Let-us-know-you.

Both branches converge on the same real-setup sequence: Let-us-know-you → `LifeHouseholdScreen` →
`AddAccountsScreen` → `BackupSetupScreen` → `SetupCredentialsScreen`. The final step's `handleCreate`
branches on the in-memory `OnboardingDraftContext.fromDemoMode` flag: fresh setup calls
`securityManager.initialize()`; exiting Demo Mode calls `exitDemoMode()` instead, which re-keys the
already-unlocked demo vault (bypassing the once/24h change throttle — the vault is seconds old) so the
demo PIN/passphrase stop working the instant it completes. `seedDemoData()` is only ever called from
`DemoVaultScreen` — neither branch of the real-setup sequence seeds demo data.

On sync builds a username is mandatory and the account is **claimed during onboarding**. Two screens
sit outside the route table: `ChooseHandleScreen` (shown after a restore when a deregistered account's
old handle is taken) and `IdentityReconciler` (mounted in `AuthGuard` — on a restore it re-verifies via
`/whoami`, re-registers the restored identity, and surfaces `ChooseHandleScreen` if the handle was taken).

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
    useExpenseAnalytics.ts ← pure-input derivation hook (group/event/prev-month/velocity/annual). `classify()`'s
                              set-aside paths (2026-07): IOU-linked, shared into a Family-type group, or carrying
                              a Set-Aside tag — each independent of the transaction's own category, the tag path
                              reported as its own line (`tag:<name>`) rather than folded into a category bucket
    AnalyticsTab.tsx
  subscriptions/
    SubscriptionsSlice.tsx ← renders the shared <SubscriptionsView> from src/features/subscriptions/
  events/
    EventsModal.tsx        ← create/edit/stop/reactivate events; calls useEventMode() directly
    useEventEditor.ts      ← edit-event flow incl. out-of-range unlink confirmation
  iou/
    IouSlice.tsx           ← renders the shared <IouView> from src/features/iou/

src/features/iou/          ← IOU UI, rendered in the Expenses → IOU tab (no standalone route)
  useIou.ts                ← domain hook: IOU CRUD + sorted/derived lists
  IouView.tsx              ← tab entry point (PersonListView ⇄ PersonLedgerView)
  PersonListView.tsx · PersonLedgerView.tsx · EntryForm.tsx · SettleUpModal.tsx · PersonForm.tsx · PersonPicker.tsx

src/core/expenses/
  filterAndAggregate.ts    ← pure: grouping, category aggregation, calcTxnCountByCategory
  categoryGroups.ts        ← pure: groupKey / groupMeta / buildParentCategoryMap (parent-aware grouping);
                              isHiddenInSafeMode (category) / isTagHiddenInSafeMode (2026-07 — any of a
                              transaction's tags independently marked hidden in Safe Mode via Manage Tags)
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

This table reflects the approved plan in [`docs/plans/mobile-migration.md`](plans/mobile-migration.md) (single Expo codebase, targeting iOS/Android/web via `react-native-web`; NativeWind for styling; `expo-sqlite` + `react-native-quick-crypto` as native adapters). Track 0 (done) physically separated the two layers below into `packages/core/` and `apps/web-legacy/`; the remaining rows land in later tracks.

| Layer                                | RN effort                                        | Why                                                                        |
| ------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| `packages/core/src/`                  | Near-zero changes                                 | Pure TypeScript; one flagged seam (`import.meta.env`, see above) to abstract |
| Feature hooks (`use{Name}.ts`)         | Zero changes                                      | React hooks work identically in RN                                          |
| Feature UI (`{Name}Page.tsx`)          | Full rewrite (Track 4)                            | NativeWind + View/Text/Pressable, not Tailwind/DOM elements                  |
| `apps/web-legacy/src/components/ui/`  | Full rewrite as `apps/mobile/src/components/`     | Same prop APIs, different renderer (Track 3)                                |
| `packages/core/src/core/db/`          | New `expo-sqlite` adapter behind the same interface | `EncryptedRepository<T>`'s constructor already only needs put/get/getAll/delete/count — narrows cleanly (Track 2) |
| `packages/core/src/core/crypto/`      | `react-native-quick-crypto` polyfills `crypto.subtle` | `engine.ts`/`securityManager.ts`/`identityKeys.ts`/`recovery.ts` need **zero logic changes** (Track 2) |

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

### Decision: React Native (Expo, managed workflow) for mobile — not Capacitor, not bare RN CLI

**Rationale (Mobile Migration, July 2026):** Capacitor wraps the web app in a WebView — performance is constrained by CSS rendering and JavaScript layout, and it never quite achieves native feel. React Native renders to real native components. Expo's managed workflow (not bare RN CLI) was chosen over hand-rolled native projects for its build/signing/OTA tooling (EAS Build/Submit/Update) — a solo/small-team app doesn't benefit from bare RN CLI's extra native-project control. A single Expo codebase targets iOS, Android, **and web** (via `react-native-web`) — the existing web app (`apps/web-legacy/`) is kept alive untouched as a safety net until the new codebase reaches documented parity (see the Track 7 gate in the plan below), not maintained as a second permanent UI layer. An earlier, now-abandoned Capacitor experiment (a generated `android/` project, never committed) was removed during Track 0. Full phased plan: [`docs/plans/mobile-migration.md`](plans/mobile-migration.md).

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
                          └─► <feature pages>
                                ├─► src/core/<domain>
                                │     └─► src/core/db/repositories
                                │           └─► src/core/crypto/keystore
                                ├─► src/components/ui/<primitives>
                                ├─► src/components/privacy/<masking>
                                └─► src/context/<PrivacyContext, etc.>
```
