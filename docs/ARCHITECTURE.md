# Penny — Architecture Reference

This document describes the codebase structure, every directory and its purpose, and the key architectural decisions with their rationale.

**Last updated:** July 2026 (Phase 1.5 + Mobile Migration Track 0)

> **UI design guidance lives in [`docs/DESIGN_GUIDELINES.md`](DESIGN_GUIDELINES.md)** — ethos, patterns, themes, colours, and the mockup workflow. This doc covers code structure & architecture only.

---

## Directory structure

**Monorepo restructuring (Mobile Migration Track 0, July 2026):** the repo is now a pnpm workspace. Everything under the old `src/core/`, `src/lib/`, and the framework-agnostic half of `src/hooks/` moved verbatim into `packages/core/` (a new platform-agnostic package, `@penny/core`) so it can eventually be shared with the Expo/React Native mobile app. Everything else (feature UI, components, context, router) moved into `apps/web-react/` — the existing app, unchanged in behavior, kept alive as-is until the mobile app reaches parity (see [`docs/plans/mobile-migration.md`](plans/mobile-migration.md)). The Cloudflare Workers (`workers/`) are untouched and remain independent npm projects outside the pnpm workspace.

```
penny/
├── pnpm-workspace.yaml          ← workspace packages: packages/*, apps/* (workers/* stay independent)
├── tsconfig.json                ← root orchestrator: references packages/core + apps/web-react
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
│   └── web-react/               ← today's app, moved as-is; frozen (bugfixes only) until Track 7 retires it
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

**Track 0 path-aliasing shortcut (temporary, web-react only):** rather than editing hundreds of `@/core/...`/`@/lib/...` import statements across `apps/web-react`, its `tsconfig.app.json` and `vite.config.ts` map those specifiers straight into `packages/core/src/` via relative paths (see the comment in `apps/web-react/tsconfig.app.json`).

**`apps/mobile/` (Track 1, done):** an Expo app targeting iOS/Android/web (via `react-native-web`), consuming `@penny/core` through **real package-boundary resolution** (e.g. `@penny/core/theme/tokens`, `@penny/core/crypto/securityManager` — resolved via `packages/core/package.json`'s `exports` map) since Metro doesn't support raw cross-workspace relative aliasing the way Vite does. Key files: `src/theme/ThemeProvider.tsx` (NativeWind `vars()`-based runtime theming across the same 3 palettes + system as web), `src/navigation/{RootNavigator,AuthGuard,MainTabs}.tsx` (the auth-gated nav shell — `AuthGuard` calls the real `@penny/core` securityManager functions since Track 2). How to run it: [`CONTRIBUTING.md`](../../CONTRIBUTING.md#running-appsmobile-expo--react-native).

**Storage + crypto adapters (Track 2, done; storage engine swapped twice, 2026-07-26):** `packages/core/src/core/db/schema.native.ts` — an `@op-engineering/op-sqlite` implementation of the same `db` shape `schema.ts` (Dexie) exports, satisfying a `RowStore<T>` interface (`packages/core/src/core/db/store.ts`: `get/put/toArray/delete/count/update/clear`) that `EncryptedRepository`'s constructor takes instead of Dexie's `Table` directly. History: originally `expo-sqlite` (Track 2); replaced with `react-native-mmkv` after a user-reported "Transactions tab feels laggy" bug traced to `expo-sqlite`'s single app-wide FIFO queue (needed because its native binding corrupted its statement handle under concurrent reads, not just writes) serializing every one of `useExpenses.ts`'s 8 independent table reads on mount; then MMKV itself was replaced with `op-sqlite` after the user reported it still didn't feel as smooth as web — MMKV's calls are synchronous JSI, so a bulk read of ~1,000 rows is 1,000 calls running inline on the JS thread, blocking it for the whole loop (unlike Dexie/IndexedDB, where the bulk scan happens off-thread in the browser engine). `op-sqlite`'s `execute()` is real async — dispatched to a native thread, only the final result crosses back to JS, matching Dexie's off-thread shape. Also fixed in the same pass: both prior RN adapters stored each encrypted row as `JSON.stringify({id, iv, ciphertext})` in one text column/value, a wrapper layer Dexie never pays (IndexedDB stores that object directly via structured clone) — the ~27 tables an `EncryptedRepository` always writes in that exact shape now get real typed `id`/`iv`/`ciphertext` columns instead; only the 3 tables with genuinely arbitrary shape (`security`/`price_cache`/`privacy_stats`) keep a JSON `data` column. WAL journal mode is enabled; only one connection is opened, per op-sqlite's own guidance. Metro resolves `schema.native.ts` over `schema.ts` for any native build (Vite has no such convention and always resolves `schema.ts`) — verified by inspecting real iOS/Android/web bundles, not just by inference (see the Track 2 progress log in `docs/plans/mobile-migration.md`). Full store-by-store mapping: `docs/SCHEMA.md` → "Mobile (React Native) storage engine". Crypto: `react-native-quick-crypto`'s `install()` (called from a `.native.ts`/`.web.ts`-split polyfill entry, `apps/mobile/src/polyfills/installCrypto.*`) polyfills `global.crypto.subtle` — `engine.ts`/`securityManager.ts`/`identityKeys.ts`/`recovery.ts` needed **zero logic changes**. (One plan assumption turned out to be moot: React Native has shipped native `atob`/`btoa` globals since RN 0.74, so no base64-helper seam was needed either.)

**Core UI component library (Track 3, done):** `apps/mobile/src/components/ui/` — NativeWind + View/Text/Pressable ports of all ~28 components in `apps/web-react/src/components/ui/`, same prop APIs (RN naming conventions aside — `onPress` not `onClick`), same barrel (`index.ts`). Supporting infra: `apps/mobile/src/components/Icon.tsx` (resolves the web app's `ti-*` Tabler webfont-class convention to `@tabler/icons-react-native` SVG components via a name-transform lookup, so callers across the whole app keep using the exact same icon-name strings), `apps/mobile/src/lib/color.ts` (real hex-math `tint()`/`ink()` — RN has no `color-mix()`; `tint` maps directly to RN's native `rgba()` alpha support, `ink` does real channel blending), `apps/mobile/src/theme/useThemeColors.ts` (resolves real hex from the active theme instead of the `var(--color-*)` strings web components use inline). `packages/core/src/lib/amountInput.ts` is a new shared extraction (pure parsing/grouping/inline-calculator logic pulled out of web's `AmountInput.tsx`, which duplicated it locally) — both platforms' `AmountInput` now import the same functions.

**`apps/mobile/src/components/AppText.tsx` (2026-07-26):** app-wide replacement for RN's own `Text`. No file needs to import it directly, and none should — `apps/mobile/metro.config.js`'s custom `resolveRequest` transparently redirects every `import { Text } from 'react-native'` written in app source (not `node_modules`) to `apps/mobile/src/lib/reactNativeShim.ts`, which re-exports everything from real `react-native` except `Text` (swapped for this component). An earlier version of this fix used a one-time scripted codemod to physically rewrite the import across all 189 files that had it — it worked, but wasn't the right shape of fix (every file carried a slightly different import than it would naturally have, and a new file written the normal way would silently opt back out of scaling with no warning); reverted in favor of the Metro-alias version, which has zero per-file footprint and applies automatically to files that don't exist yet. `AppText` itself registers with NativeWind's `cssInterop` so `className="text-sm"` etc. keeps resolving exactly as before, then reads the resolved `fontSize`/`lineHeight` back out and multiplies both by `~/theme/fontScale.ts`'s `useFontScale()` — the real fix for Settings' font-size picker, previously persisted but not applied anywhere (see that file's own comment for the full investigation, including why NativeWind's `rem.set()` doesn't work for this and why RN's `Text` has no monkey-patch seam to use instead). `~/hooks/useReduceMotion.ts` (reads `AccessibilityInfo.isReduceMotionEnabled()`, live-subscribed) is the same-day RN equivalent of web's `@media (prefers-reduced-motion: reduce)`, wired into Home's `MarketTicker` marquee.

**`apps/mobile/src/components/layout/` doesn't exist** — `AppShell`/`BottomNav` are not ported 1:1; React Navigation's stack/tab navigators (`RootNavigator`/`MainTabs`, Track 1) are the RN equivalent, since routing-as-chrome is how RN apps compose their shell. `MainTabs.tsx` matches `BottomNav`'s icon/color/order for visual parity; the rest of `AppShell`'s chrome (`PrivacyModeSwitcher`, `RemindersBell`, `DemoModeBanner`, `SyncProvider`/`GroupProvider`, `ContextSwitcher`, the entitlement-gated group switcher) depends on context/features not ported yet and lands with them in Track 4.

**Verification tool:** `apps/mobile/src/screens/ComponentGalleryScreen.tsx` renders every ported component with representative props. Superseded as `AuthGuard`'s `needs_onboarding` stand-in by the Subscriptions pilot (Track 4) — still useful for a future visual sweep, just no longer wired to a route.

**Track 4 shared infrastructure (Tier 1, done) + Subscriptions pilot (done):** porting the Subscriptions module surfaced three not-yet-ported shared providers nearly every other module also needs — ported once, up front, rather than per-module. `apps/mobile/src/context/PrivacyContext.tsx` and `SettingsContext.tsx` port `apps/web-react/src/context/{PrivacyContext,SettingsContext}.tsx` (`SettingsContext` in full except `theme`/`fontScale`, superseded by mobile's own `ThemeProvider`): `localStorage` (sync) becomes `apps/mobile/src/lib/storage.ts` (AsyncStorage, async — state hydrates in a `useEffect`, same pattern `AuthGuard.tsx` uses), and `document.hidden`/`visibilitychange` (Open-mode auto-revert) becomes RN `AppState`. `apps/mobile/src/context/ToastContext.tsx` ports `ToastContext.tsx` as a real bottom-anchored toast (not a stub) built from `Banner`/`Button`. `apps/mobile/src/hooks/useLoggedRepository.ts` ports the web hook unchanged, pointed at the new `ToastContext`. All three providers wrap `App.tsx` alongside `ThemeProvider`.

Full dependency survey (every `apps/web-react/src/features/*`'s context/hook imports) lives in the Track 4 plan doc (`docs/plans/mobile-migration.md`) — it splits into Tier 1 (Privacy/Settings/Toast/`useLoggedRepository`, done here), Tier 2 (`GroupContext`/`EventModeContext`/`useForecast` — needed once Track 4 reaches Home/Cashflow/Expenses/IOU/Groups), and Tier 3 (`OnboardingDraftContext` — needed for onboarding/security). `useRepository`/`useProfile`/`useDataRefresh`/`useTxnRefresh`/`usePassphraseStrength` were already platform-agnostic in `packages/core/src/hooks/` — no porting needed.

`apps/mobile/src/features/subscriptions/` ports `apps/web-react/src/features/subscriptions/` (`useSubscriptions.ts` unchanged beyond import paths; `SubscriptionsView`/`DetectedSubCard`/`ActiveSubCard`/`SubscriptionForm`/`SubscriptionsPage` rebuilt in RN using the Track 3 kit). `RootNavigator.tsx`'s `onNeedsOnboarding` now renders `SubscriptionsPage` instead of `ComponentGalleryScreen`.

**Two real bugs found and fixed during on-device verification (worth flagging for every later Track 4 module):**
1. Screens rendered outside a `Stack.Navigator` (i.e. straight out of `AuthGuard`, not inside a `Screen`) get no automatic safe-area handling — the status bar overlapped `PageHeader`'s title. Fixed by wrapping `SubscriptionsPage`'s root in `SafeAreaView` (`edges={['top']}`) from `react-native-safe-area-context`.
2. Two sibling `Button`s with `fullWidth` (`w-full`) inside a `flex-row` container overflow off-screen instead of splitting the row evenly — Yoga (RN's layout engine) defaults `flexShrink` to `0`, unlike CSS flexbox's default of `1`, so an explicit `width: 100%` on each sibling doesn't shrink to fit. Every web modal footer / button-pair with this exact `fullWidth`+`flex-row` pattern will hit the same bug when ported. Fix: wrap each `Button` in its own `<View className="flex-1">` instead of relying on `fullWidth` alone.

**Insurance (Track 4, second module, done):** `apps/mobile/src/features/insurance/` ports `apps/web-react/src/features/insurance/` (`useInsurance.ts` unchanged beyond import paths — its `remove()` path is the first real exercise of the Tier 1 `ToastContext`/undo flow, since Subscriptions never called `remove`). Introduced `apps/mobile/src/components/shared/` (`ListRow`, `DueDateBadge`, `FormModal`) — another shared prerequisite the dependency survey flagged as needed by Insurance, Loans, IOU, Goals, and Portfolio; ported once here. `FormModal` bakes in the `flex-1`-wrapped-footer-button fix from the start (see bug #2 above) so every future consumer avoids it by construction. Two more platform notes: `dueDateInfo()` in `packages/core/src/lib/date.ts` returns the literal CSS var string `'var(--color-surface-secondary)'` for its far-future case — a web-only construct with no RN equivalent — so `DueDateBadge` substitutes the active theme's real `surfaceSecondary` hex for that one case (same "flagged platform difference" pattern as `tint()`/`ink()`), rather than changing the shared core function's behavior for web. And CSS Grid (`grid-cols-4`/`grid-cols-2`, used for the policy-type picker and the amount-fields row) has no RN/Yoga equivalent — replaced with `flex-row flex-wrap` containers and explicit-percentage-width (`w-[23%]`) or `flex-1` children. `InsurancePage`'s back button (web's `navigate(-1)`) is dropped for this stand-in stage, same reasoning as documented in the Track 4 progress log.

**Loans (Track 4, third module, done):** `apps/mobile/src/features/loans/` ports `apps/web-react/src/features/loans/` 1:1 (`useLoans.ts`/`useLoanForm.ts`/`usePlanner.ts` unchanged beyond import paths). Its "Download XLSX" button is dropped entirely — a real capability gap, not a platform simplification: `xlsx`'s `writeFile` triggers a browser DOM download with no RN equivalent, and this migration hasn't built a native file-save/share flow (same "no export" scope as the migration's already-out-of-scope PDF/HTML export). CSS Grid (loan-type picker, tenure/rate rows, and the amortization table's `gridTemplateColumns`) becomes `flex-row`/`flex-wrap` with `flex-1` or explicit-percentage-width children, and another `var(--color-surface-secondary)`/`var(--color-primary)` CSS-var pair (the computed-EMI banner) is substituted with real theme hex — same patterns as Insurance. Back button dropped, same reasoning.

**IOU (Track 4, fourth module, done):** `apps/mobile/src/features/iou/` ports `apps/web-react/src/features/iou/` 1:1 (`useIou.ts` unchanged beyond import paths + the `localStorage`→AsyncStorage migration-flag swap). **Scoped as personal-only** — web's `IouView` reads `GroupContext` (Tier 2, not ported) only for one informational banner shown when the user has groups; dropped entirely rather than pulling in Groups' sync/multi-device machinery early, matching the "personal-only IOU" option the Track 4 dependency survey already anticipated. `PersonPicker`'s DOM-positioned overlay suggestion list becomes an inline (normal-flow) list — same reasoning as `SelectInput`'s port note, no RN portal/absolute-over-siblings equivalent. Added `IouPage.tsx`, a mobile-only `PageHeader` wrapper, since web never gives IOU its own page (always embedded in the not-yet-ported Expenses module).

**Two more real bugs found and fixed via on-device verification, both in shared `packages/core` code — not mobile-only files:**
1. `packages/core/src/hooks/useTxnRefresh.ts` used browser-only `window.addEventListener`/`dispatchEvent` to broadcast "transactions changed" between independent hook instances — crashed immediately (`TypeError: undefined is not a function`) the first time a module (IOU) actually called it; Subscriptions/Insurance/Loans never exercised this hook. Fixed with `packages/core/src/hooks/useTxnRefresh.native.ts` (Metro resolves `.native.ts` over the plain file for native builds, Vite always resolves the plain one — same convention as `schema.native.ts`), replacing the DOM event with a plain in-memory listener `Set`.
2. `packages/core/src/lib/statusColors.ts`'s `STATUS` object (`STATUS.success`/`danger`/`warning`/`info`/`neutral`) is entirely literal CSS var strings (`'var(--color-success)'`, …) — meaningless as RN color values, and unlike the crash above this failed *silently* (RN's style engine logs a warning and drops the color rather than throwing), so it had been shipping unnoticed in Subscriptions/Loans since their first on-device verification passes. IOU's on-device check happened to catch the warning in logcat. Fixed by replacing every mobile `STATUS.x` usage with `theme.x` from `useThemeColors()` (which already exposes real hex for the exact same semantic names) across `DetectedSubCard`/`ActiveSubCard` (Subscriptions), `PlannerResults` (Loans), and `EntryForm`/`PersonListView`/`PersonLedgerView`/`SettleUpModal` (IOU) — 7 files across 3 modules. **Any future module importing `STATUS` from core must do the same swap** — `packages/core`'s `STATUS` stays web-only by design (mirrors `tint()`/`ink()` in the same file), so mobile code should never import it directly.

**Known limitation surfaced during IOU, applies to every module ported so far:** on-device save/write actions throw `Error: Session locked — master key not available` (`packages/core/src/core/crypto/keystore.ts`). Every ported screen is currently rendered at `AuthGuard`'s `needs_onboarding` stand-in slot specifically because `isOnboardingComplete()` is false — meaning the Data Master Key is never set (only `initialize()`/`unlock()`, part of onboarding, sets it). Reads work fine; **any save in any already-ported module** would hit this. A fix exists (Demo Mode's `initialize(DEMO_PASSPHRASE, DEMO_PIN)`, the same mechanism web's "Explore with Demo Data" onboarding screen uses, which wouldn't flip `isOnboardingComplete()` since it doesn't create a profile record) but is **deliberately deferred per user decision** — only render/layout verification is possible on-device until real onboarding lands.

**Goals (Track 4, fifth module, done):** `apps/mobile/src/features/goals/` ports `apps/web-react/src/features/goals/` 1:1 (`useGoals.ts`/`useSipCalculator.ts` unchanged beyond import paths). `GoalCard`'s "Suggested" pill/risk badge and `SuggestedGoals`' icon backgrounds swap their `var(--color-primary)`/`color-mix(...)` CSS for the existing `Badge` component and `~/lib/color`'s `tint()` — same pattern as Insurance/Loans, no new gotchas. `GoalForm`'s 3-column risk picker (`grid-cols-3`) becomes `flex-row flex-wrap` with `compact` `OptionButton` tiles.

**Accounts (Track 4, sixth module, done):** `apps/mobile/src/features/accounts/` ports `apps/web-react/src/features/accounts/` 1:1 (`useAccounts.ts`/`useAccountForm.ts` unchanged beyond import paths). **Found and fixed a real bug in shared `packages/core` proactively, before it could crash on-device:** `packages/core/src/hooks/useDataRefresh.ts` (cross-instance refresh signals for accounts/categories/tags edited from Settings) used the exact same browser-only `window.addEventListener`/`dispatchEvent` pattern as `useTxnRefresh.ts` — recognized on sight from the IOU fix and pre-empted with `packages/core/src/hooks/useDataRefresh.native.ts` (same `.native.ts`/Metro-resolution convention) instead of waiting to rediscover it via a crash. `ReconcileModal`'s `ink()` usage moves to `~/lib/color`'s version, which takes the "toward" color as an explicit second argument (`ink(color, theme.textPrimary)`) since RN has no CSS var to default to. `AccountFormModal` uses the shared `FormModal` (web used a raw `Modal` here since it has no delete action) for consistency with every other add/edit form ported so far. Back button dropped, same reasoning as Insurance/Loans/IOU.

**Home (Track 4, seventh module, done) + prerequisite Health module:** `apps/mobile/src/features/home/` ports `apps/web-react/src/features/home/` — `useHome.ts`/`useHomeStats.ts` unchanged beyond import paths; `HomePage.tsx`/`GlanceHeader.tsx`/`AccountsStrip.tsx`/`MoneyStatsCard.tsx`/`ToolsGrid.tsx`/`MarketTicker.tsx`/`stories/*` rebuilt in RN. **Scoped personal-only**, same precedent as IOU: web's `useGroupContext`/`activeGroup` branch (swaps the whole screen for `GroupDashboard`) and `HomeGroupsCard` are both dropped until Groups is ported. A prerequisite `apps/mobile/src/features/health/` ports `apps/web-react/src/features/health/` (`useHealthScore.ts` unchanged; `ScoreGauge`/`ComponentCard`/`ScoringGuide`/`HealthDetailModal`/`FinancialHealthCard` rebuilt), and a standalone `apps/mobile/src/hooks/useForecast.ts` ports the web hook unchanged beyond import paths. **Three genuine "no RN equivalent" gaps, each solved (not dropped) per explicit user decision:** (1) `FinancialHealthCard`'s CSS `conic-gradient` segmented score ring → a stack of `react-native-svg` `Circle`s, one full circle per component shown only as its own arc via `strokeDasharray` + `rotation` (same technique `ProgressRing` already used for one segment). (2) `MarketTicker`'s CSS `@keyframes` marquee → `react-native-reanimated` (new dep, v4.5.0, + `react-native-worklets` peer + a `babel.config.js` plugin entry): render the ticker list twice back-to-back, measure one copy's width via `onLayout`, drive `translateX` with `withRepeat(withTiming(-copyWidth, {duration: 32000}), -1, false)` so each loop restarts exactly on the second copy — confirmed animating on-device. (3) Stories' canvas+Web-Share-API share button → a new `ShareCard.tsx` (rendered off-screen, real mounted RN `View`) wrapped in a `react-native-view-shot` `ViewShot` ref, captured to a temp PNG, shared via `expo-sharing`'s `Sharing.shareAsync()` (two new deps); `expo-linear-gradient` (new dep) reproduces Stories' CSS gradient card backgrounds as a `[string, string]` hex tuple. **Two more `packages/core` bugs found and fixed:** `marketDataClient.ts` called `localStorage` directly (reimplemented against `~/lib/storage`'s `AsyncStorage` wrapper, same storage key); `apiBase.ts` read `import.meta.env` (see the Track 0 seam note below — now fixed for real via `apiBase.native.ts`, not just flagged). `useHome.ts` is the canonical source of the shared `AccountBalance`/`HomeSummary`/`CreditCardAccount`/`AssetGroup` types (`GlanceHeader.tsx`/`AccountsStrip.tsx` import them, having briefly carried local duplicates since they were ported in parallel before `useHome.ts` landed). `StoryViewer`'s `window.addEventListener('keydown', ...)` Escape/Arrow navigation is dropped (tap zones already cover it). Back button dropped, same reasoning as every prior module.

**Portfolio (Track 4, eighth module, done) — largest yet:** `apps/mobile/src/features/portfolio/` ports `apps/web-react/src/features/portfolio/` (~7,462 web lines across 53 files — the original 4,957-line monolithic `PortfolioPage.tsx` was already split by Pre-Phase 1.5 into per-asset-class files, which made this port tractable). Structure: `usePortfolioHoldings.ts`/`PortfolioPage.tsx` (tab shell: Holdings sub-tabs + IPO tab), `holdings/shared/` (reusable field helpers), one directory per asset class (`equity/` — Stocks+MF, `fixed-income/` — FD/RD, `precious-metals/` — Gold/Silver, `real-assets/` — Vehicle/Property/Other, `retirement/` — NPS/PPF/EPF, the single biggest sub-scope at ~1,760 lines), and `ipo/`. Ported in parallel by asset class (independent directories, no shared mutable state) after shared infra landed first. **Unlike IOU/Home, no personal-only scoping decision was needed** — a full dependency survey found zero `GroupContext`/`EventModeContext`/`OnboardingDraftContext` imports anywhere in the module; ported in full. **Two more `packages/core` `localStorage` bugs, a harder variant than `marketDataClient.ts`'s:** `core/ipo/ipoClient.ts` and `core/nps/npsClient.ts` both cache data via *synchronous* `localStorage` feeding otherwise-async fetch functions — a mechanical `AsyncStorage` swap doesn't drop in cleanly, so both got `.native.ts` siblings keeping an in-memory-only cache (session-scoped, not persisted across cold starts) instead. **A real mid-port lesson:** the first draft of `ipoClient.native.ts` dropped `fetchIpos`'s `forceRefresh` parameter on the assumption that only Metro (not `tsc`) resolves `.native.ts` files — wrong for this repo, since `apps/mobile/tsconfig.json`'s `moduleSuffixes: [".native", ""]` makes `tsc` itself resolve them too for any mobile-reachable `packages/core` file; the mismatch surfaced only once the IPO tab actually imported `useIpos`. Fixed by restoring a real in-memory cache instead of dropping the parameter — **`.native.ts` siblings must match their web counterpart's exported signatures exactly**. Several hand-rolled `fixed inset-0` modal overlays (Real Assets' `VehicleDetailModal`, Retirement's `NpsLifecycleDetail`/an `EpfAllTransactionsSheet`/an inline `RetirementSheets` popup, IPO's `IpoDetailModal`) rebuilt on the real ported `Modal` component instead of translated, same rationale as Track 3's `SelectInput` redesign. `STATUS.x` colors (~30+ sites across 9 files, worst in `RetirementCard.tsx`) → `useThemeColors()`, including one variant found in `RdCard.tsx` that hardcoded a literal hex directly rather than referencing `STATUS`. Two integration-time bugs caught and fixed during the final wiring pass: Equity's `MfModal`/`StockModal` were missing the established sibling-`fullWidth`-Buttons-in-a-`flex-row` fix (flagged by a different section's porting agent while reading a neighboring file); and `EquitySection`'s floating FAB used `position: absolute` correctly in isolation but incorrectly here since the section renders *inside* `PortfolioPage`'s own `ScrollView` (absolute positions relative to the section's own content box, not the viewport) — replaced with an inline `Button`, matching every other section's already-independent convention. No new native deps needed — reused everything Home already installed (`react-native-svg`, `react-native-view-shot`, `expo-sharing`, `expo-linear-gradient`, `react-native-reanimated`).

**Expenses (Track 4, ninth module, done) — CLAUDE.md's own flagged "hardest port":** `apps/mobile/src/features/expenses/` ports `apps/web-react/src/features/expenses/` (~7,532 web lines across 33 files — comparable size to Portfolio, but ported more sequentially since its pieces share state through one hook rather than being independent like Portfolio's asset classes). Structure: `useExpenses.ts` (shared data/mutation hook — every one-time category/merchant-memory migration effect's synchronous `localStorage` check became an async `~/lib/storage` check inside the same effect, no behavior change), `ExpensesPage.tsx`/`ExpensesHeader.tsx` (tab shell), `categories/`, `budgets/`, `analytics/`, `events/`, `transactions/`, and thin `subscriptions/`/`iou/` slice wrappers reusing the already-ported Subscriptions/IOU modules directly. **The two flagged-hardest UI translations, both solved per explicit user decision (not simplified):** (1) swipe-to-reveal row actions (`transactions/SwipeableRow.tsx`) rebuilt on `react-native-gesture-handler`'s `ReanimatedSwipeable` (new native dep; `App.tsx`'s root now wraps in `GestureHandlerRootView`) rather than web's hand-rolled Pointer-Events implementation or a hand-rolled Reanimated-only reimplementation — web's manual tap-vs-drag threshold logic wasn't reimplemented since `Swipeable`'s built-in tap gesture already auto-enables/closes based on open state; (2) both SVG charts (`analytics/AnnualChart.tsx`'s bar+line chart, `analytics/AnalyticsTab.tsx`'s `IntentDonut`) ported as plain `react-native-svg`, no new charting library — the donut reuses the exact multi-arc-via-stroked-circles technique already proven in Health's `FinancialHealthCard`, confirming that technique generalizes to a second ring visualization. **Two more capability gaps built now, not dropped:** receipt photo capture (web: `<input type="file">` + canvas-downscale; RN: a new mobile-only `apps/mobile/src/lib/receiptImage.ts`, not a `.native.ts` sibling since the input type differs fundamentally from a browser `File` — wraps two new native deps, `expo-image-picker` + `expo-image-manipulator`, into `captureReceiptPhoto()`/`pickReceiptPhoto()`, returning the same downscaled JPEG data-URL shape web stores) and CSV/ZIP export (`core/export/exportCsv.native.ts`, a new sibling using `expo-file-system`'s `File`/`Paths` API + `expo-sharing`, same share-sheet pattern as Home's Stories flow, with `Uint8ArrayWriter` instead of `BlobWriter` for the AES-256 ZIP since RN's `Blob` shim doesn't support everything `@zip.js/zip.js` needs internally; `expo-file-system`/`expo-sharing` added as direct `packages/core` dependencies, following the `expo-sqlite` precedent from Track 2). **`EventModeContext` (vacation/trip mode) ported as a real prerequisite, not dropped** — unlike every other module's droppable Groups dependency, event tagging is threaded through filtering/analytics/the header banner, so dropping it wasn't a clean option (`apps/mobile/src/context/EventModeContext.tsx`, AsyncStorage-backed, wired into `App.tsx`). `GroupContext` itself is still dropped everywhere it appears: `ShareToGroupModal.tsx` skipped entirely (not ported at all); `shareGroups`/`onShareToGroup`/`onShareLater`/the Share swipe action removed from `ExpenseForm.tsx`/`TransactionsTab.tsx`/`TransactionsSlice.tsx`; `familyGroupIds` removed outright from `useExpenseAnalytics.ts`'s args (the whole classification branch was dead code without it); `EventsModal.tsx`'s entitlement-gated vacation→group-link sub-section dropped along with its now-unused imports. `IconGridPicker.tsx`'s ~620KB icon-search index (`tablerIconIndex.json`, fetched at runtime on web via `import.meta.env.BASE_URL`) is bundled as a static JSON import on mobile instead — no runtime fetch, and the entire fetch/cache/loading-state machinery web needed became unnecessary. A second hand-rolled `fixed inset-0` modal found (`AnalyticsTab.tsx`'s own local `MonthPickerModal`, distinct from the already-`Modal`-based one in `transactions/`) rebuilt on the real ported `Modal`. A real cross-file bug caught by a different section's porting agent (same pattern as Portfolio's Precious-Metals-catches-Equity's-bug): `CategoryPickerModal`'s sticky bulk-action bar (web: `sticky bottom-0`) has no RN sticky-within-`ScrollView` primitive — solved by moving the buttons into the ported `Modal`'s `footer` prop, which already renders outside the `ScrollView` and stays pinned. **A real shared-component bug found during on-device verification, not Expenses-specific:** `apps/mobile/src/components/ui/TabStrip.tsx`'s `scrollable` mode wrapped its tab row in a bare `<ScrollView horizontal>` with no `flexGrow: 0` — an unconstrained horizontal `ScrollView` as a flex child in a column layout stretches to fill all remaining vertical space, pushing its content down to vertically center inside the oversized box (surfaced as a blank gap between `ExpensesPage`'s header and tab strip). Fixed with `style={{ flexGrow: 0 }}` — benefits every other `TabStrip` consumer, not just Expenses.

**Track C (identity/auth) prerequisite, done ahead of Groups:** unlike every module surveyed before it (IOU, Home, Portfolio, Expenses), Groups' feature UI (`apps/web-react/src/context/GroupContext.tsx` + `apps/web-react/src/features/groups/`, ~1,573 lines — the smallest Track-4-sized scope so far) is gated behind a *hard, server-verified* claimed identity with no local-only stand-in: `GroupContext`'s `claimed = Boolean(profile?.deviceId && username)` only becomes true after a real `claimAccount()` round-trip against the live `penny-auth` Cloudflare Worker. Rather than port Groups' UI first (which would render but be unable to create/join/sync/settle-up anything), ported the real Track C client chain: `core/identity/claim.ts` (`claimAccount`/`reclaimAccount`/`checkUsername`/`getClaimState`), `core/identity/signedFetch.ts`, `core/crypto/identityKeys.ts` (device signing/wrapping P-256 keypairs), all reused **completely unmodified** on RN — confirmed via a crypto smoke-test screen (`apps/mobile/src/screens/CryptoSmokeTestScreen.tsx`, kept as a reference tool) that `react-native-quick-crypto`'s ECDSA/ECDH/Ed25519 (including `recovery.ts`'s manually-constructed-PKCS#8 trick) all work correctly on-device, and that the ECDSA signature format is exactly 64 bytes (raw IEEE P1363, matching the worker's `crypto.subtle.verify` expectation — a DER/raw mismatch would have silently broken every signed request). Device-key storage needed no new work at all — it already rides the same `expo-sqlite`-backed `EncryptedRepository` every other table uses. Three real gaps found and fixed: (1) `entitlement.native.ts` (new — see the updated "Known seam" note below) reading `Constants.expoConfig?.extra?.enableSync` via a new `expo-constants` dependency (added to both `apps/mobile` and `packages/core`, following the `expo-sqlite`-in-`packages/core` precedent from Track 2); (2) `apiBase.native.ts`'s `AUTH_BASE`/`GROUPS_BASE` (previously hardcoded `null`) now read the real deployed worker URLs (`https://penny-auth.hesh.workers.dev`, `https://penny-groups.hesh.workers.dev`) from `app.json`'s `extra` field — the same non-secret public URLs already committed in `apps/web-react/.env.production`; (3) `claim.ts`'s one `window.dispatchEvent`-based notification (`PROFILE_UPDATED_EVENT`) was extracted into a new tiny platform-split module, `core/identity/profileChangeBus.ts`/`.native.ts` (native: in-memory listener `Set`, same pattern as `useDataRefresh.native.ts`), rather than duplicating all of `claim.ts`'s security-critical logic into a `.native.ts` sibling just to swap one internal primitive — `claim.ts` itself is otherwise byte-for-byte unchanged. **Verified end-to-end on-device against the live worker** via a second scratch tool (`apps/mobile/src/screens/ClaimSmokeTestScreen.tsx`, also kept as a reference tool): `checkUsername` → real availability check; `claimAccount` → real `userId` from the worker; `signedFetch('/whoami')` → `200` confirming the full challenge→sign→verify loop. As a side effect of finally calling `securityManager.initialize()` on a real device for the first time in this whole migration, this also proves real DMK-based `EncryptedRepository` encrypt/decrypt genuinely works on-device (every prior module hit "Session locked" before ever exercising it) — see the plan's Track C progress-log entry for a debugging false-alarm worth knowing about (a "Cipher.final failed" error that turned out to be a self-inflicted double-tap test artifact, not a real crypto bug).

**Groups (Track 4, tenth module, done) + Home/Expenses integration restored:** `apps/mobile/src/context/GroupContext.tsx` ports `apps/web-react/src/context/GroupContext.tsx` (74 lines) — `localStorage` becomes `~/lib/storage` (async AsyncStorage; `selected` starts at `'personal'` and hydrates once in a `useEffect`, same `PrivacyContext` pattern) and the raw `window.addEventListener(PROFILE_UPDATED_EVENT, ...)` becomes `subscribeProfileChanged`, imported directly from `core/identity/profileChangeBus` (not re-exported through `claim.ts`, which only re-exports the constant). `apps/mobile/src/features/groups/` ports all 9 `apps/web-react/src/features/groups/*` files (`ContextSwitcher`, `GroupDashboard`, `SharedExpenseComposer`, `SettleUpGroupModal`, `GroupMembersModal`, `CreateGroupModal`, `JoinGroupModal`, `useGroupSummaries`, `useServerActionError`) 1:1, flat layout. `packages/core/src/core/groups/*` (943 lines: `groupsClient`/`groupsService`/`groupSync`/`keys`/`split`/`accountBridge`) needed zero `.native.ts` siblings — confirmed platform-agnostic by grep before assuming otherwise, the first Track-4-sized `packages/core` scope this migration didn't need to touch at all. Two real platform swaps, both new to this migration: `GroupMembersModal`'s `navigator.clipboard.writeText` → `expo-clipboard`'s `Clipboard.setStringAsync` (new native dep, `~57.0.1`), and `navigator.share` → RN's built-in `Share.share()` (no new dep), same try/fallback-to-clipboard structure as web. `ContextSwitcher`'s hand-rolled `fixed inset-0` dropdown rebuilt on the real ported `Modal`, same fix pattern as every other hand-rolled-overlay case this migration (Portfolio, Retirement, IPO, Expenses' `AnalyticsTab`). **User decision, beyond a standalone module port:** also restored the three Groups integration points IOU/Home/Portfolio/Expenses had each dropped as personal-only scoping — Home's `activeGroup → GroupDashboard` branch + `HomeGroupsCard.tsx` (new); Expenses' `ShareToGroupModal.tsx` (new) + `shareGroups`/`onShareToGroup`/`onShareLater`/the Share swipe action restored in `ExpensesPage.tsx`/`TransactionsTab.tsx`/`TransactionsSlice.tsx`/`ExpenseForm.tsx`, plus `familyGroupIds` restored in `useExpenseAnalytics.ts`/`AnalyticsSlice.tsx`; and `EventsModal.tsx`'s inline `VacationGroupLink` sub-section restored. IOU stays personal-only, unchanged (not requested). **Verified end-to-end on-device against the live `penny-auth`/`penny-groups` workers** — not just render-only, per Track C's precedent — via a third scratch tool, `apps/mobile/src/screens/GroupsSmokeTestScreen.tsx`: claim → create a group (real worker round-trip + ECDH key wrap/unwrap via `keys.ts`) → `GroupDashboard` renders with the owner member (Home restoration confirmed) → `GroupMembersModal`'s "Create invite link" hit the real worker, copied via `expo-clipboard`, and opened the real Android share sheet via `Share.share()` → `SharedExpenseComposer` renders with live split-breakdown → `ExpenseForm`'s restored "Share with a group" toggle appears once a group exists (Expenses restoration confirmed). One real non-blocking bug found, not fixed here: `groupsService.ts`'s `buildJoinLink` falls back to an empty origin on RN (`location` is undefined), producing a hostless invite link — doesn't crash, flagged for a future pass once mobile has a real deep-link scheme. See the plan's Groups progress-log entry for full detail.

**Onboarding + Settings/Security/Profile/Activity (Track 4, final modules, done) — Track 4 complete:** two
new top-level navigators replace every prior stand-in: `apps/mobile/src/navigation/OnboardingNavigator.tsx`
(a real `native-stack` `Stack.Navigator`, one screen per web's `PATHS.onboarding.*` route) and
`MainNavigator.tsx` (`MainTabs` as its root screen, plus `Profile`/`Settings`/`SafeModeSettings`/
`ManageTags`/`ChangePin`/`ChangePassphrase`/`Timeline`/a `Backup` placeholder/`OnboardingFlow` re-mounting
`OnboardingNavigator` for Exit-Demo-Mode's real nested-navigation case, all pushed on top). A new
`apps/mobile/src/navigation/authRecheckBus.ts` (same in-memory pub/sub shape as `profileChangeBus.native.ts`)
lets onboarding/security screens tell `AuthGuard` to re-run its check after a vault is created, restored, or
wiped — unlike web (a route change or full reload re-triggers `AuthGuard`), RN's version only ever checks
once on mount. All 13 onboarding screens ported 1:1; `SetupCredentialsScreen` is the screen that finally
sets a real Data Master Key on-device via a real UI (every prior on-device module test hit "Session
locked" first — only `ClaimSmokeTestScreen.tsx`'s hardcoded scratch version had ever called `initialize()`
before). `AccountRecoveryScreen`'s restore-from-file path needed a new `expo-document-picker` dependency;
its cloud-restore branch surfaced a `googleDriveProvider.ts` Vite-only `import.meta.env` read (same bug
class as `apiBase.ts`'s original gap) — fixed with a dormant `googleDriveProvider.native.ts` stub matching
`icloudProvider.ts`'s existing precedent. `seedDemoData.ts`'s native storage fix used the plan's own
"inject a storage adapter" alternative to a full `.native.ts` fork: a new `seedDemoStorage.ts`/`.native.ts`
pair seams off its handful of direct `localStorage`/`window` touches. Settings/Security/Profile/Activity
ported as pure UI on top of already-portable `securityManager`/`claim.ts` calls; Profile's avatar picker
reuses Expenses' `~/lib/receiptImage.ts`; `activityMeta.ts`'s `STATUS`-CSS-var bug (the same class first
caught during IOU) was fixed as a `getActionMeta(theme)` function instead of a static export;
`WrappedModal.tsx`'s hand-rolled full-screen overlay was rebuilt on Home Stories' pattern (real `Modal` +
`LinearGradient` + `react-native-view-shot`/`expo-sharing`), not the shared centered `Modal` (wrong shape
for a full-bleed story). **Two real, severe bugs found and fixed during on-device Demo Mode verification**
— both crashed the whole emulator process, not just the app, and both root-caused via code review after
the user redirected away from further blind on-device reproduction: (1) `schema.native.ts`'s shared
`expo-sqlite` connection had no serialization across any table's `get`/`put`/`toArray`/`delete`/`update`/
`clear` — `seedDemoData.ts`'s ~16 `Promise.all(items.map(repo.put))` seeding batches (several hitting
`expenses` concurrently) silently dropped writes under that load and separately corrupted the native
statement pool (`Cannot use shared object that was already released`); fixed with a single FIFO queue
(`enqueue()`) serializing every operation through the one connection — a single choke point, not a patch
to each `Promise.all` call site. (2) `TransactionsTab.tsx` rendered its list via a plain `View`+`.map()`
inside `TransactionsSlice.tsx`'s wrapping `ScrollView` — harmless on web's DOM, but with demo data's
~1,000 seeded transactions this mounted ~1,000 `SwipeableRow` (`react-native-gesture-handler`) instances
simultaneously, crashing severely enough to restart the emulator; fixed by rebuilding `TransactionsTab` on
a virtualized `SectionList` and removing the now-redundant wrapping `ScrollView`. See the plan's Onboarding
progress-log entry for full detail, including on-device verification of the full ~1,000-row demo dataset
post-fix.

**Post-Track-4 restoration pass (2026-07-25):** every Track 4 module (Insurance, Loans, IOU, Accounts,
Subscriptions) had been ported and on-device-verified in isolation via `AuthGuard`'s single stand-in slot,
but never wired into a real navigation graph — `MainNavigator.tsx` didn't register any of them as routes,
and every Home cross-module entry point (`AccountsStrip`, `GlanceHeader`'s breakdown rows, `ToolsGrid`,
`MoneyStatsCard`, Stories' CTAs) was a literal `onPress={() => {}}`. Fixed: the five modules registered as
real `Stack.Screen`s in `MainNavigator.tsx`; a new `apps/mobile/src/components/shared/BackButton.tsx`
(inline, for `PageHeader`'s `leading` slot — documented since Track 3 as "e.g. a back button" but never
wired until a real `Stack.Navigator` existed) added to every pushed (non-tab-root) screen; Home's dead
entry points wired to their web-equivalent destinations (asset-class breakdown rows → `Accounts`/
`Expenses`/`Portfolio`/`Loans`, `MoneyStatsCard` → `Expenses`/`Insurance`/`Loans`, Stories' `NOOP` replaced
with a real `MODULE_ROUTE` map) — anything with no real mobile destination yet (Cashflow, Tax, Calculators,
News) left as a flagged no-op, not a fabricated route. Confirmed on-device: Home → Loans renders the real
`LoanScenariosPage` with a working back button. Also restored in the same pass: IOU's Groups informational
banner (`IouView.tsx`, dropped pre-`GroupContext`, now matches web via `useGroupContext()`). **Loans'
"Download XLSX" export was attempted and confirmed NOT working**: `PlannerResults.tsx` has a real
`downloadXlsx()` (mirrors Expenses' CSV/ZIP export — `buildLoanPlanExport` for the data, `xlsx`'s `write()`
for workbook bytes, `expo-file-system` + `expo-sharing` for the share sheet) but on-device it throws an
**uncaught** Metro module-resolution error inside `await import('xlsx')` that no `try/catch` can
intercept — `xlsx`'s CJS entry has `require('fs')`/`require('stream')` calls Metro's static bundler tries
to resolve regardless of runtime guards; a `metro.config.js` `resolver.extraNodeModules` stub was tried and
reverted (didn't fix it). Not root-caused further — needs a different RN-targeted XLSX library or
dedicated Metro bundling work. Left wired (not reverted) since the surrounding plumbing is correct and
reusable once the `xlsx` import itself is fixed.

**ContextSwitcher wired + top-of-screen safe-area bug fixed (2026-07-25):** `ContextSwitcher` now mounts
in `MainTabs.tsx` above the `Tab.Navigator` (persistent across every tab, gated by
`hasEntitlement('sync')`, mirroring web `AppShell`'s chrome position) instead of being reachable only via
`GroupsSmokeTestScreen`. Its "switch context" action navigates to the `Home` tab
(`navigation.navigate('MainTabs', { screen: 'Home' })`, which needed a typed `TabParamList` exported from
`MainTabs.tsx` and referenced via `NavigatorScreenParams` in `MainNavigator.tsx`'s own param list); its
"Claim a username" row opens the real `Profile` screen; `useServerActionError`'s `NotClaimedError` branch
does the same and now returns `true` (previously always `false`). Separately, all four tab-root screens
(Home/Portfolio/Expenses/Goals) were double-reserving the top safe-area inset: each wrapped itself in
`SafeAreaView edges={['top']}`, on top of the inset `MainTabs`' own `Stack.Screen` header ("Penny" title +
settings button) already consumes — visible as a gap above "Good morning" on Home. Fixed by dropping to
`edges={[]}` on those four specifically; pushed screens with `headerShown: false` (Insurance, Loans, etc.)
correctly keep `edges={['top']}` since they have no Stack header to double up against.

**Feature-folder gap closed — 7 modules ported (2026-07-25):** a full audit of
`apps/web-react/src/features/` (24 folders) against `apps/mobile/src/features/` (16) found 7 modules had
never been ported at all, beyond the two known-open items above — Feedback, Import (expenses CSV import),
Backup & Restore, Cashflow, News, Calculators, and Tax Awareness (Chip is the one remaining gap, out of
scope for Phase 2). All 7 mirror their web files 1:1 wherever the underlying `packages/core` logic was
already platform-agnostic (most hooks needed only import-path changes). Notable platform-specific work:
- **Backup & Restore** (`apps/mobile/src/features/backup/`) — export/import/reset use the established
  `expo-file-system`+`expo-sharing`/`expo-document-picker` patterns, and post-import/-reset use
  `notifyAuthShouldRecheck()` in place of web's full-page reload. The bigger piece: the automatic backup
  engine now actually runs on mobile via a new `packages/core/src/core/sync/SyncProvider.native.tsx`
  (re-runs on `AppState` returning to `'active'` instead of web's `online`/`visibilitychange` DOM events —
  needed adding `react-native` as a direct `packages/core` dependency for the first time, since that file
  lives there) mounted in `RootNavigator.tsx` around `MainNavigator` (post-unlock, mirroring web's
  `AppShell` mount point); `backupPrefs.native.ts` (added earlier, in-memory-only) was upgraded to
  hydrate from/write through to AsyncStorage. Google Drive (needs native Sign-In, unbuilt) and the
  on-device OPFS floor (`isLocalBackupAvailable()` checks a browser-only API) both degrade to their
  existing "not configured" UI rather than crashing — no code changes needed there.
- **News** (`apps/mobile/src/features/news/`) — `core/news/newsClient.ts` needed a real `.native.ts`
  sibling for a genuinely new reason: RN has **no `DOMParser` at all** (every prior "missing browser API"
  case in this migration was `localStorage`/a `window` event, always swappable). RSS parsing became a
  small regex-based tag extractor (`extractTag`, handles `CDATA`-wrapped fields) instead; the 45-minute
  cache drops to in-memory/session-scoped, same precedent as `ipoClient.native.ts`. `FilterDropdown`'s
  hand-rolled DOM dropdown was rebuilt on the shared `Modal`, same fix pattern as every prior
  hand-rolled-overlay case.
- **Calculators** (`apps/mobile/src/features/calculators/`, 10 individual calculators + shared
  `CalcUI.tsx`) — `AmountRow`/`HeroResult` take a `masked` boolean from `usePrivacy().shouldMask(false)`
  instead of porting web's tap-to-peek `MaskedValue` component (no precedent for that interaction
  anywhere else on mobile); web's `divide-y` result-card rows use the same border-top-on-non-first-child
  technique `ListContainer.tsx` already established.
- **Tax Awareness** (`apps/mobile/src/features/tax/`, the largest of the seven at 1,848 web lines) —
  Optimize's "what-if" deduction sliders needed a genuinely new native dependency,
  `@react-native-community/slider` (no RN range-input control existed anywhere else in the app);
  `TaxStoryModal`'s shareable image reuses Home Stories' exact `ShareCard`/`react-native-view-shot`/
  `expo-sharing` solution instead of web's procedural `<canvas>` + `navigator.share`.
- **Feedback**/**Import**/**Cashflow** were the more mechanical three: Feedback's `mailto:` composer swaps
  `window.open` for `Linking.openURL` and reads `app.json`'s `version` via `expo-constants` (first use of
  that field on mobile) in place of a Vite `__APP_VERSION__` define; Import's file-picking UI uses
  `expo-document-picker`+`expo-file-system` (same as `AccountRecoveryScreen`); Cashflow's balance
  sparkline is redrawn with `react-native-svg`, and `useIncomeSuggestions`'s dismissed-set cache swaps
  `localStorage` for `~/lib/storage`.

Entry points previously flagged as no-ops pending these modules are now wired: Home's `ToolsGrid` (News,
Calculators), `GlanceHeader` ("Safe to spend"), `MoneyStatsCard` ("Tax story"); Expenses' `ExpensesHeader`
("Import expenses", "Safe: ₹X"); `SettingsPage` gained "Backup & Restore"/"Contact & Feedback" rows. See
the plan's 2026-07-25 "ContextSwitcher wired... 7-module feature-folder gap closed" progress-log entry for
full detail. **On-device verification of all 7 new modules is now in progress** (started 2026-07-25,
testing across the Android emulator, `expo start --web`, and `apps/web-react` side by side) — see the two
new paragraphs below for what's been found so far, and the plan's 2026-07-25 "RN-web platform gap +
onboarding layout bug + native module linking" progress-log entry for full detail. **Still open:** the
Loans XLSX bug above (user wants to research alternative libraries later), and a native-module-linking
error (`TurboModuleRegistry` can't find `QuickBase64`) blocking further on-device testing — a rebuild was
recommended but not yet confirmed to fix it.

**RN-web platform gap found + fixed (2026-07-25):** `apps/mobile` targets iOS/Android/**web** (via
react-native-web), but Expo's default Metro config (`@expo/metro-config`) explicitly sets
`resolver.platforms: ['ios', 'android', 'tvos', 'macos']` — omitting `'web'` entirely, unlike Metro core's
own default. This meant Metro's file crawler never recognized `foo.web.ts` as a platform variant of `foo`
at all (not a cache issue — a genuine config gap), so three new `.web.ts` siblings added this pass
(`core/entitlement/entitlement.web.ts`, `core/net/apiBase.web.ts`,
`core/sync/providers/googleDriveProvider.web.ts` — all mirroring their existing `.native.ts` counterparts)
were silently never picked up, and RN-web crashed on `import.meta.env` being `undefined` instead. Fixed in
`apps/mobile/metro.config.js` by explicitly appending `'web'` to `resolver.platforms` — requires a full
Metro restart to take effect (platform config is read once at server startup, not hot-reloadable).

**Onboarding layout bug found + fixed across all 11 screens (2026-07-25):** `OnboardingBack`
(`position: absolute`, `top-5 left-5`, meant to sit flush at the top-left of a "full-bleed" screen) was
rendered as the first child inside a `ScrollView` with its own `px-6 py-10` padding. RN's `<ScrollView>`
renders children inside an *inner* scrollable content view, distinct from the *outer* frame the padding
attaches to — so the back button ended up offset ~40px from the true corner. Fixed by moving
`<OnboardingBack />` outside the `ScrollView` (a sibling inside `SafeAreaView`, which has no padding)
across all 11 onboarding screens that use it. `SimulatedDashboardScreen` ("Here's a preview") additionally
got a one-off redesign per user feedback: it's the only one of the 11 with no hero icon above the title,
so the floating corner arrow looked like a mistake with nothing to anchor it — it now uses a local inline
back arrow + centered title in the same row instead of the shared component.

**Known seam surfaced during Track 0 (flagged then, fixed for mobile during Home/Track 4/Track C/RN-web):** `packages/core/src/core/entitlement/entitlement.ts`, `core/net/apiBase.ts`, and `core/sync/providers/googleDriveProvider.ts` read `import.meta.env.VITE_*` directly — a Vite-ism with no Metro/RN equivalent. All three now have both a `.native.ts` (iOS/Android, Track C/Backup) and a `.web.ts` (RN-web, this pass) sibling — `core/net/apiBase.ts`'s finance-data bases reproduce the existing "no backend configured" fallback on both, while `AUTH_BASE`/`GROUPS_BASE` read real worker URLs from `expo-constants` on both. `googleDriveProvider.ts`'s `.native.ts`/`.web.ts` both return `isCloudBackupConfigured() === false` (no native/RN-web Google Sign-In flow built yet), same "dormant until built" shape as `icloudProvider.ts`'s own precedent, so every other provider method stays unreachable in practice rather than needing individual porting.

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

**See [`docs/EXTERNAL_APIS.md`](EXTERNAL_APIS.md) for the full registry** — every external API,
its canonical constants file, and Worker-proxy status. What follows here is the worker-side
architecture (auth, groups, backup) those APIs sit alongside; not a duplicate listing.

**Base-URL resolution (`packages/core/src/core/net/apiBase.ts`):** every client reads its host from here. When
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

This table reflects the approved plan in [`docs/plans/mobile-migration.md`](plans/mobile-migration.md) (single Expo codebase, targeting iOS/Android/web via `react-native-web`; NativeWind for styling; `@op-engineering/op-sqlite` + `react-native-quick-crypto` as native adapters — the storage adapter went `expo-sqlite` → `react-native-mmkv` → `op-sqlite`, all on 2026-07-26). Track 0 (done) physically separated the two layers below into `packages/core/` and `apps/web-react/`; the remaining rows land in later tracks.

| Layer                                | RN effort                                        | Why                                                                        |
| ------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| `packages/core/src/`                  | Near-zero changes                                 | Pure TypeScript; one flagged seam (`import.meta.env`, see above) to abstract |
| Feature hooks (`use{Name}.ts`)         | Zero changes                                      | React hooks work identically in RN                                          |
| Feature UI (`{Name}Page.tsx`)          | Full rewrite (Track 4)                            | NativeWind + View/Text/Pressable, not Tailwind/DOM elements                  |
| `apps/web-react/src/components/ui/`  | ✅ Done — rewritten as `apps/mobile/src/components/ui/` | Same prop APIs, different renderer (Track 3)                          |
| `packages/core/src/core/db/`          | ✅ Done — `@op-engineering/op-sqlite` adapter behind `RowStore<T>` (was `expo-sqlite`, then `react-native-mmkv`, both swapped 2026-07-26) | `EncryptedRepository<T>`'s constructor narrowed from Dexie's `Table` to `RowStore<T>` — type-only change on web |
| `packages/core/src/core/crypto/`      | ✅ Done — `react-native-quick-crypto` polyfills `crypto.subtle` | `engine.ts`/`securityManager.ts`/`identityKeys.ts`/`recovery.ts` needed **zero logic changes** |

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

**Rationale (Mobile Migration, July 2026):** Capacitor wraps the web app in a WebView — performance is constrained by CSS rendering and JavaScript layout, and it never quite achieves native feel. React Native renders to real native components. Expo's managed workflow (not bare RN CLI) was chosen over hand-rolled native projects for its build/signing/OTA tooling (EAS Build/Submit/Update) — a solo/small-team app doesn't benefit from bare RN CLI's extra native-project control. A single Expo codebase targets iOS, Android, **and web** (via `react-native-web`) — the existing web app (`apps/web-react/`) is kept alive untouched as a safety net until the new codebase reaches documented parity (see the Track 7 gate in the plan below), not maintained as a second permanent UI layer. An earlier, now-abandoned Capacitor experiment (a generated `android/` project, never committed) was removed during Track 0. Full phased plan: [`docs/plans/mobile-migration.md`](plans/mobile-migration.md).

### Decision: three-layer feature module split (moved here from docs/ROADMAP.md's "Track 1 rationale")

**Rationale (Pre-Phase 1.5, Track 1):** analysis of the pre-split codebase found major
feature files (`ExpensesPage`: 3,183 lines, `PortfolioPage`: 4,957 lines) mixing pure
calculations, data fetching, state management, and UI rendering in one file — expensive to
port to React Native and impossible to unit-test in isolation. Measured by LOC after the
split: the logic layer (`core/`, `lib/`, feature `use*.ts` hooks — roughly 36% of `src`)
ports directly or behind an isolated adapter (Dexie/Web-Crypto/`window`-event usage stay
swap-behind-interface); the remaining ~64% (`components/ui` + feature JSX) is inherent
UI-renderer rework, made mechanical by the same clean isolation. (An earlier "~85% reuse"
estimate had counted straightforward UI-swap work as "reuse" — the honest logic-only figure
is ~36%; shared-component adoption raises effective UI reuse further.) See
`.claude/commands/penny-feature-module.md` for the resulting target structure and
checklist.

### Decision: Domain hooks, not page-god-hooks

**Rationale:** A single hook that owns everything for a page (all useState, all effects, all form state, all mutations) violates SRP, is hard to test, and returns 20+ values with unclear cohesion. Instead: each hook has one domain responsibility (data loading + mutations for one entity). Form fields, modal toggles, and selection state (`editing`, `deletingId`) stay in the page component — they're local UI state, not business state. Bridge functions that read UI state and call a domain mutation (e.g. `handleSave` reads the form, then calls `saveAccount(form, editing)`) also stay in the page. Complex pages compose multiple focused hooks (e.g. `ExpensesPage` calls `useExpenses`, `useSubscriptions`, `useIou`, `useBudgets`). Each domain hook exports ≤10 values and is independently testable with `renderHook`.

### Decision: `src/features/` not `src/pages/`

**Rationale:** The React community uses `pages/` for file-based routing. We use client-side routing manually, and each folder contains more than just a page (form, hook, types). `features/` better describes self-contained feature modules.

### Decision: platform-variance minimization for `.native.ts`/`.web.ts` files

**Rationale (found via a real bug, 2026-07-26):** an IPO API URL had to be fixed in both
`ipoClient.ts` and `ipoClient.native.ts` because the same literal was hardcoded independently in
each — they'd already silently diverged once before the fix (one had the stale path, both needed
identical correction). Auditing every `.native.ts`/`.web.ts` pair in `packages/core/src/` found 8
more file groups with the same shape. **Rule going forward:** a platform-suffixed file may only
contain logic that's genuinely platform-different (a different storage API, reading
`import.meta.env` vs `expo-constants`, etc.). Any literal — or, per `exportCsv.*`'s case, any
*pure logic* — that's identical across variants belongs in an unsuffixed sibling file (the
`*.constants.ts` convention for literals, or a plain descriptively-named file like
`exportCsv.shared.ts` when whole functions are shared), imported by every variant that needs it.
This is safe under both bundlers: Metro's platform-suffix resolution only matches a fixed short
list (`ios`/`android`/`native`/`web`, plus whatever's explicitly added to `resolver.platforms`),
so an arbitrarily-named file is never mistaken for needing its own platform variant; Vite has no
such resolution convention at all. See [`docs/EXTERNAL_APIS.md`](EXTERNAL_APIS.md) for the
external-API constants this produced, and `.claude/commands/penny-standards.md` for the
enforcement-level restatement of this rule. Inspired partly by looking at Cashew (a mature
cross-platform Flutter app) for structural comparison — see `docs/plans/mobile-migration.md`'s
long-term react-native-web vision, which this same principle also feeds.

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
