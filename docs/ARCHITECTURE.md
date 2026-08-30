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

**Core UI component library (Track 3, done):** `apps/mobile/src/components/ui/` — NativeWind + View/Text/Pressable ports of all ~28 components in `apps/web-react/src/components/ui/`, same prop APIs (RN naming conventions aside — `onPress` not `onClick`), same barrel (`index.ts`). Supporting infra: `apps/mobile/src/components/Icon.tsx` (resolves the web app's `ti-*` Tabler webfont-class convention to `@tabler/icons-react-native` SVG components via a name-transform lookup, so callers across the whole app keep using the exact same icon-name strings; gained a `filled` prop 2026-08-02 — resolves `${name}Filled` first, falling back to the outline component if Tabler didn't ship one for that icon — added for the Goal card's icon-fill gauge, see `docs/features/goals.md`), `apps/mobile/src/lib/color.ts` (real hex-math `tint()`/`ink()` — RN has no `color-mix()`; `tint` maps directly to RN's native `rgba()` alpha support, `ink` does real channel blending), `apps/mobile/src/theme/useThemeColors.ts` (resolves real hex from the active theme instead of the `var(--color-*)` strings web components use inline). `packages/core/src/lib/amountInput.ts` is a new shared extraction (pure parsing/grouping/inline-calculator logic pulled out of web's `AmountInput.tsx`, which duplicated it locally) — both platforms' `AmountInput` now import the same functions.

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
2. `packages/core/src/lib/statusColors.ts`'s `STATUS` object (`STATUS.success`/`danger`/`warning`/`info`/`neutral`) is entirely literal CSS var strings (`'var(--color-success)'`, …) — meaningless as RN color values, and unlike the crash above this failed _silently_ (RN's style engine logs a warning and drops the color rather than throwing), so it had been shipping unnoticed in Subscriptions/Loans since their first on-device verification passes. IOU's on-device check happened to catch the warning in logcat. Fixed by replacing every mobile `STATUS.x` usage with `theme.x` from `useThemeColors()` (which already exposes real hex for the exact same semantic names) across `DetectedSubCard`/`ActiveSubCard` (Subscriptions), `PlannerResults` (Loans), and `EntryForm`/`PersonListView`/`PersonLedgerView`/`SettleUpModal` (IOU) — 7 files across 3 modules. **Any future module importing `STATUS` from core must do the same swap** — `packages/core`'s `STATUS` stays web-only by design (mirrors `tint()`/`ink()` in the same file), so mobile code should never import it directly.

**Known limitation surfaced during IOU, applies to every module ported so far:** on-device save/write actions throw `Error: Session locked — master key not available` (`packages/core/src/core/crypto/keystore.ts`). Every ported screen is currently rendered at `AuthGuard`'s `needs_onboarding` stand-in slot specifically because `isOnboardingComplete()` is false — meaning the Data Master Key is never set (only `initialize()`/`unlock()`, part of onboarding, sets it). Reads work fine; **any save in any already-ported module** would hit this. A fix exists (Demo Mode's `initialize(DEMO_PASSPHRASE, DEMO_PIN)`, the same mechanism web's "Explore with Demo Data" onboarding screen uses, which wouldn't flip `isOnboardingComplete()` since it doesn't create a profile record) but is **deliberately deferred per user decision** — only render/layout verification is possible on-device until real onboarding lands.

**Goals (Track 4, fifth module, done):** `apps/mobile/src/features/goals/` ports `apps/web-react/src/features/goals/` 1:1 (`useGoals.ts`/`useSipCalculator.ts` unchanged beyond import paths). `GoalCard`'s "Suggested" pill/risk badge and `SuggestedGoals`' icon backgrounds swap their `var(--color-primary)`/`color-mix(...)` CSS for the existing `Badge` component and `~/lib/color`'s `tint()` — same pattern as Insurance/Loans, no new gotchas. `GoalForm`'s 3-column risk picker (`grid-cols-3`) becomes `flex-row flex-wrap` with `compact` `OptionButton` tiles.

**Accounts (Track 4, sixth module, done):** `apps/mobile/src/features/accounts/` ports `apps/web-react/src/features/accounts/` 1:1 (`useAccounts.ts`/`useAccountForm.ts` unchanged beyond import paths). **Found and fixed a real bug in shared `packages/core` proactively, before it could crash on-device:** `packages/core/src/hooks/useDataRefresh.ts` (cross-instance refresh signals for accounts/categories/tags edited from Settings) used the exact same browser-only `window.addEventListener`/`dispatchEvent` pattern as `useTxnRefresh.ts` — recognized on sight from the IOU fix and pre-empted with `packages/core/src/hooks/useDataRefresh.native.ts` (same `.native.ts`/Metro-resolution convention) instead of waiting to rediscover it via a crash. `ReconcileModal`'s `ink()` usage moves to `~/lib/color`'s version, which takes the "toward" color as an explicit second argument (`ink(color, theme.textPrimary)`) since RN has no CSS var to default to. `AccountFormModal` uses the shared `FormModal` (web used a raw `Modal` here since it has no delete action) for consistency with every other add/edit form ported so far. Back button dropped, same reasoning as Insurance/Loans/IOU. **2026-08-03 redesign (`docs/mockups/proposals/accounts-list-v1.html`, "Direction D — Mini Cards"):** `AccountList.tsx`'s dense single-line rows became per-account gradient mini cards, reusing the `expo-linear-gradient` dependency Home/Stories already added rather than a new one. Text/icon colours drawn on top of the gradient are fixed white/translucent-white regardless of theme (a local `ON_GRADIENT` constant in `AccountList.tsx`), the same "colour is relative to its own card, not the palette" reasoning as `ShareCard.tsx`.

**2026-08-03 v2 follow-up (same day, "Direction D — Mini Cards v2"):** the v1 pass's `accentCardGradient(hex)` derived one gradient per account _type_ from `meta.ts`'s type accent, so two accounts sharing a type (e.g. two "Bank" accounts) rendered an identical, flat card — the reported bug. Replaced with `~/lib/color.ts`'s `accountCardPalette(id, isCashLike)`: two curated arrays of hand-picked dark jewel-tone gradient + bright-glow pairs (`JEWEL_PALETTE`, and a green-only `GREEN_PALETTE` hard-clamped for `cash`/`wallet`), assigned deterministically per account via a simple string hash of `acc.id` modulo the pool length — same `id` always resolves to the same card, no stored assignment needed. `AccountList.tsx`'s card markup also gained three "real card" sheen layers on top of the gradient (an inset top highlight, a diagonal light-sheen streak via a rotated `expo-linear-gradient`, and a second darker glow blob opposite the existing corner glow) as pragmatic RN approximations of the mockup's CSS inset-shadow/blur-filter/repeating-gradient, none of which RN's style engine supports natively; a fourth layer (a repeating diagonal micro-line texture) was judged not worth approximating and was skipped.

**Home (Track 4, seventh module, done) + prerequisite Health module:** `apps/mobile/src/features/home/` ports `apps/web-react/src/features/home/` — `useHome.ts`/`useHomeStats.ts` unchanged beyond import paths; `HomePage.tsx`/`GlanceHeader.tsx`/`AccountsStrip.tsx`/`MoneyStatsCard.tsx`/`ToolsGrid.tsx`/`MarketTicker.tsx`/`stories/*` rebuilt in RN. **Scoped personal-only**, same precedent as IOU: web's `useGroupContext`/`activeGroup` branch (swaps the whole screen for `GroupDashboard`) and `HomeGroupsCard` are both dropped until Groups is ported. A prerequisite `apps/mobile/src/features/health/` ports `apps/web-react/src/features/health/` (`useHealthScore.ts` unchanged; `ScoreGauge`/`ComponentCard`/`ScoringGuide`/`HealthDetailModal`/`FinancialHealthCard` rebuilt), and a standalone `apps/mobile/src/hooks/useForecast.ts` ports the web hook unchanged beyond import paths. **Three genuine "no RN equivalent" gaps, each solved (not dropped) per explicit user decision:** (1) `FinancialHealthCard`'s CSS `conic-gradient` segmented score ring → a stack of `react-native-svg` `Circle`s, one full circle per component shown only as its own arc via `strokeDasharray` + `rotation` (same technique `ProgressRing` already used for one segment). (2) `MarketTicker`'s CSS `@keyframes` marquee → `react-native-reanimated` (new dep, v4.5.0, + `react-native-worklets` peer + a `babel.config.js` plugin entry): render the ticker list twice back-to-back, measure one copy's width via `onLayout`, drive `translateX` with `withRepeat(withTiming(-copyWidth, {duration: 32000}), -1, false)` so each loop restarts exactly on the second copy — confirmed animating on-device. (3) Stories' canvas+Web-Share-API share button → a new `ShareCard.tsx` (rendered off-screen, real mounted RN `View`) wrapped in a `react-native-view-shot` `ViewShot` ref, captured to a temp PNG, shared via `expo-sharing`'s `Sharing.shareAsync()` (two new deps); `expo-linear-gradient` (new dep) reproduces Stories' CSS gradient card backgrounds as a `[string, string]` hex tuple. **Two more `packages/core` bugs found and fixed:** `marketDataClient.ts` called `localStorage` directly (reimplemented against `~/lib/storage`'s `AsyncStorage` wrapper, same storage key); `apiBase.ts` read `import.meta.env` (see the Track 0 seam note below — now fixed for real via `apiBase.native.ts`, not just flagged). `useHome.ts` is the canonical source of the shared `AccountBalance`/`HomeSummary`/`CreditCardAccount`/`AssetGroup` types (`GlanceHeader.tsx`/`AccountsStrip.tsx` import them, having briefly carried local duplicates since they were ported in parallel before `useHome.ts` landed). `StoryViewer`'s `window.addEventListener('keydown', ...)` Escape/Arrow navigation is dropped (tap zones already cover it). Back button dropped, same reasoning as every prior module.

**Portfolio (Track 4, eighth module, done) — largest yet:** `apps/mobile/src/features/portfolio/` ports `apps/web-react/src/features/portfolio/` (~7,462 web lines across 53 files — the original 4,957-line monolithic `PortfolioPage.tsx` was already split by Pre-Phase 1.5 into per-asset-class files, which made this port tractable). Structure: `usePortfolioHoldings.ts`/`PortfolioPage.tsx` (tab shell: Holdings sub-tabs + IPO tab), `holdings/shared/` (reusable field helpers), one directory per asset class (`equity/` — Stocks+MF, `fixed-income/` — FD/RD, `precious-metals/` — Gold/Silver, `real-assets/` — Vehicle/Property/Other, `retirement/` — NPS/PPF/EPF, the single biggest sub-scope at ~1,760 lines), and `ipo/`. Ported in parallel by asset class (independent directories, no shared mutable state) after shared infra landed first. **Unlike IOU/Home, no personal-only scoping decision was needed** — a full dependency survey found zero `GroupContext`/`EventModeContext`/`OnboardingDraftContext` imports anywhere in the module; ported in full. **Two more `packages/core` `localStorage` bugs, a harder variant than `marketDataClient.ts`'s:** `core/ipo/ipoClient.ts` and `core/nps/npsClient.ts` both cache data via _synchronous_ `localStorage` feeding otherwise-async fetch functions — a mechanical `AsyncStorage` swap doesn't drop in cleanly, so both got `.native.ts` siblings keeping an in-memory-only cache (session-scoped, not persisted across cold starts) instead. **A real mid-port lesson:** the first draft of `ipoClient.native.ts` dropped `fetchIpos`'s `forceRefresh` parameter on the assumption that only Metro (not `tsc`) resolves `.native.ts` files — wrong for this repo, since `apps/mobile/tsconfig.json`'s `moduleSuffixes: [".native", ""]` makes `tsc` itself resolve them too for any mobile-reachable `packages/core` file; the mismatch surfaced only once the IPO tab actually imported `useIpos`. Fixed by restoring a real in-memory cache instead of dropping the parameter — **`.native.ts` siblings must match their web counterpart's exported signatures exactly**. Several hand-rolled `fixed inset-0` modal overlays (Real Assets' `VehicleDetailModal`, Retirement's `NpsLifecycleDetail`/an `EpfAllTransactionsSheet`/an inline `RetirementSheets` popup, IPO's `IpoDetailModal`) rebuilt on the real ported `Modal` component instead of translated, same rationale as Track 3's `SelectInput` redesign. `STATUS.x` colors (~30+ sites across 9 files, worst in `RetirementCard.tsx`) → `useThemeColors()`, including one variant found in `RdCard.tsx` that hardcoded a literal hex directly rather than referencing `STATUS`. Two integration-time bugs caught and fixed during the final wiring pass: Equity's `MfModal`/`StockModal` were missing the established sibling-`fullWidth`-Buttons-in-a-`flex-row` fix (flagged by a different section's porting agent while reading a neighboring file); and `EquitySection`'s floating FAB used `position: absolute` correctly in isolation but incorrectly here since the section renders _inside_ `PortfolioPage`'s own `ScrollView` (absolute positions relative to the section's own content box, not the viewport) — replaced with an inline `Button`, matching every other section's already-independent convention. No new native deps needed — reused everything Home already installed (`react-native-svg`, `react-native-view-shot`, `expo-sharing`, `expo-linear-gradient`, `react-native-reanimated`).

**Portfolio — PPF card redesign + "See all transactions" popup (2026-08-08, `apps/mobile` only, per
`docs/mockups/proposals/ppf-card-redesign-v1.html`, layout/grouping only — no new calculation logic):**
`RetirementCard.tsx`'s PPF branch replaces its old back-to-back stacked maturity/This-FY progress
bars (which could both render purple at once) with two-up stat tiles (Maturity always purple,
This-FY blue-in-progress/green-at-100%, never purple); the April-5 tip becomes a quiet caption inside
the This-FY tile instead of a standalone banner; N stacked per-FY missing-interest banners plus a
separate "N need review" pill both merge into one consolidated "needs attention" banner (missing FYs
as tappable chips, review count as a second line) — same `findMissingPpfInterestFys`/
`findAllPpfReviewFlags` inputs, purely restyled; the "Import" pill goes neutral/ghost, matching EPF's
own treatment. **The card no longer renders any inline transaction list at all** (not even the old
capped 5-row + "+N more" text) — a permanent "See all transactions" row is the only transaction
element left on the card, opening a new `PpfAllTransactionsSheet` (`RetirementSheets.tsx`) that
mirrors `EpfAllTransactionsSheet`'s FY-band grouping but deliberately omits EPF's All/Interest/
Transfers filter (PPF's per-year volume is far lower) and its repeated "N need review" header count
(already lives once, in the card's own banner). Each FY band gets a new per-year progress bar via
`ppfDepositsForFy(txns, fyStartYear)` (`packages/core/src/core/portfolio/ppfCalculations.ts` —
generalizes `ppfThisYearDeposits`, which now just calls it with the current FY): the current open FY
keeps the actionable blue/green language, past closed FYs render the same bar muted/neutral instead.
Flagged interest rows keep their warning icon (same `findAllPpfReviewFlags` check as the card) but
stay flag-only, not tappable for a correction — PPF has no equivalent of EPF's "Update to ₹X" popup
yet, so this sheet takes no `onSave` prop. New shared-constants file `ppfTxLabels.ts`
(`PPF_TX_LABELS`/`PPF_TX_COLORS`) mirrors `epfTxLabels.ts`'s same Fast-Refresh-driven split.
`apps/web-react` is frozen and has no equivalent — see `docs/MOBILE_PARITY.md`.

**Portfolio — PPF withdrawal tile, "i" info-icon modals, edit/delete transaction (2026-08-08,
`apps/mobile` only, additive on the card redesign above):** new full-width Withdrawal tile on
`RetirementCard.tsx`, powered by a new core function `ppfWithdrawalEligibility()` (plus its
`ppfBalanceAsOfFyEnd()` helper, both in `ppfCalculations.ts`) — the real partial-withdrawal rule
(eligible from the 7th FY, capped at 50% of the lower of two historical FY-end balances). New
`PpfInfoModal` component (`RetirementSheets.tsx`) — this app's first tappable-"i"-icon →
small-centered-modal pattern (no tooltip/popover primitive existed before), reused for all three info
icons (This-FY deposit rules, Withdrawal rules, Maturity options) from one shared sections-list props
shape rather than three bespoke modals. `PpfTransactionSheet` gained `editing?`/`onDelete?` props
(edit-in-place + immediate no-confirmation delete, matching `PpfModal`/`EntryForm`'s established
`FormModal` convention) — every row in `PpfAllTransactionsSheet` is now tappable into edit mode.
`apps/web-react` is frozen and has no equivalent — see `docs/MOBILE_PARITY.md`.

**Portfolio — EPF passbook/Excel import + export UI (2026-08-08, `apps/mobile` only — wires up the
two `packages/core`-only entries below into the actual EPF card):** five new files in
`apps/mobile/src/features/portfolio/holdings/retirement/`. `epfImportLogic.ts` owns the file
picking/parsing dispatch (extension-routed to `epfPassbookParser.ts`/`epfExcelImport.ts`, doc §11's
"same entry point handles both formats") and every actual `Holding` write — matching an employer by
`memberId` first and never falling back to a plain company-name match once a unit carries a real
`memberId` (protects the "rejoined the same employer under a new Member ID" case §5's `memberId`
field exists to resolve), creating a new `EpfEmployer` when none matches (basic salary approximated
from the passbook's own EPF-wages column, since a brand-new import has no other source for it), and
merging `balanceCheckpoints`. `EpfImportFlow.tsx` is the batch summary → sequential review → done
flow component (kept components-only per this repo's Fast-Refresh lint rule — all non-component
exports live in `epfImportLogic.ts` instead); `EpfImportReviewSheet.tsx` is the conflict-first
triage screen (mockup v4 §2 Direction C) — the one real conflict pinned open with the imported value
pre-selected, new rows a pre-checked checklist borrowed from bank-import's `UnmatchedBucket`
pattern, matches collapsed to one quiet summary line. A single multi-group `.xlsx` file reuses this
exact same per-unit review flow as a batch of PDFs, just flattened into one queue of reconciliation
units instead of files. `epfInterestOnDemand.ts` holds the on-demand interest helpers shared by the
"Want me to calculate it for you?" assistant (`EpfTransactionSheet`) and the interest-breakdown
popup (`EpfAllTransactionsSheet`, whose interest rows are now tappable, previously only contribution
rows were) — deliberately NOT a recursive re-simulation of every prior year's interest (never invent
interest for a year the user didn't actually log); the "prior closing balance" fed into
`calculateEpfInterestForYear()` is a flat sum of whatever's already really on the ledger before that
FY. `epfTxLabels.ts` is a small shared-constants file (`EPF_TX_LABELS`/`EPF_TX_COLORS`) split out of
`RetirementSheets.tsx` for the same Fast-Refresh reason. Export reuses `PlannerResults.tsx`'s
already-solved `write()`/`Uint8Array`/`Blob`-vs-`File` RN gotchas verbatim, no new pattern.
`apps/web-react` is frozen and has no equivalent — see `docs/MOBILE_PARITY.md`.

**Portfolio — EPF real-user-feedback round (2026-08, `apps/mobile` only):** a sixth file,
`epfInterestOnDemand.ts`'s new sibling `epfReviewFlags.ts`, adds two on-demand "needs review" flag
checks (interest mismatch, wage discrepancy) behind one shared function (`findAllReviewFlags`) so a
transaction row's badge and the EPF card's summary count can never disagree — the wage-discrepancy
comparison math itself (`epfCheckWageDiscrepancy`) lives in `packages/core`'s `epfCalculations.ts`
instead, since it's pure calculation with no React dependency (consistent with this feature's
existing core/mobile split) and is unit-tested there. `RetirementCard.tsx` also gained a card-level
"Are you still working at X?" Yes/No prompt (`findEmployersNeedingEmploymentConfirmation`, added to
`epfInterestOnDemand.ts`) — a root-cause fix for a real bug where an import-created employer with no
later employer to bound it stayed "current" with no actual evidence tying it to today.

**Portfolio — EPF full-statement Excel export/import + interest trace (2026-08-08, `packages/core`
only, extends the 2026-08-07 entry below):** two new pure modules —
`epfExcelExport.ts` builds one combined workbook (5 sheets: Summary, Employers, Transactions,
Interest History, Salary Hikes) across every employer/year Penny knows about, unlike EPFO's own
one-employer-one-FY passbook download, mirroring `core/loans/planExport.ts`'s "plain arrays in,
platform renders to `.xlsx`" shape exactly (no `xlsx` import in this file — the actual write call
stays in the apps/mobile UI layer, reusing `PlannerResults.tsx`'s already-solved
`write()`/`ArrayBuffer` RN gotchas). `epfExcelImport.ts` reads that same shape back in — deliberately
does NOT reuse `epfPassbookParser.ts`'s `ParsedEpfPassbook` container type (which requires
non-optional `establishmentId`/`memberId`, unavailable for a manually-entered employer never itself
imported from a PDF) but DOES reuse its row-level `ParsedEpfPassbookRow` shape as-is, so
`epfReconciliation.ts` needed zero changes to accept either source — verified end-to-end with a real
export→bytes→import round-trip test that reconciles every row as an exact `matches` (and a
genuinely-edited amount still correctly reconciles as `conflict`, not a false positive). Split
deliberately from a phase-2, presentation-only PDF export (not re-importable — would need a second
fragile PDF parser for no real benefit, since `unpdf` only reads PDFs, no write library exists yet).
Also: `epfInterestCalculator.ts`'s `calculateEpfInterestForYear()` now returns an optional
`employeeTrace`/`employerTrace` (month-by-month opening balance/rate/interest), and a new
`getInterestRateForFy()` convenience wrapper — both purely additive (no existing field changed,
computed fresh on demand, never stored) so any interest transaction can show its rate and full
calculation regardless of whether it was typed manually, calculated via the app's assistant, or
imported. All UI design decisions for the whole EPF import/export feature are now finalized via 4
rounds of mockup review (`docs/mockups/proposals/epf-passbook-import-v1.html` through `-v4.html`) —
see `docs/plans/epf-passbook-import.md` §10/§11.

**Portfolio — EPF passbook import + interest calculator, core logic (2026-08-07, `packages/core`
only — wired into the `apps/mobile` UI by the 2026-08-08 entry above, see
`docs/plans/epf-passbook-import.md`):** four new pure `packages/
core/src/core/portfolio/` modules.
`epfPassbookParser.ts` — takes raw PDF bytes, uses `unpdf` (chosen after a real on-device
feasibility spike bundling it under Metro; `pdfjs-dist` raw was avoided as the same failure class
that once broke `@zip.js/zip.js`'s dynamic import) to extract text, then regex-parses the
passbook's bilingual (English-clean/Hindi-mojibake) header and transaction table — verified against
a real downloaded EPFO passbook, though the committed test fixture
(`packages/core/tests/fixtures/epf-passbook-synthetic.pdf`) is a synthetic stand-in built to mirror
that real structure exactly (a real passbook's text layer carries PII even with its image visually
redacted, so one was never committed). `epfInterestCalculator.ts` — a month-by-month accrual
simulation of EPFO's real interest rule (a contribution deposited in month M+1 earns zero interest
that month, only starting to accrue from M+2; the year's interest sums once at FY-end, never
compounding mid-year) — verified to reproduce a real passbook's exact credited interest and closing
balance. `epfInterestRates.ts` — the full 1986-87–2026-27 rate table, modelled as rate PERIODS (not
one-per-FY) so the one historical mid-year rate change (2000-01) needs no special-casing; fetched
from a new Worker route (`workers/api-proxy`'s `/epf-rates`, a static JSON response, no upstream
call) with the exact same table baked in as an offline-first fallback — new platform-suffixed
`epfRatesStorage.ts`/`.native.ts`/`.web.ts` trio for its local cache, following the established
`apiBase.ts`/`.native.ts`/`.web.ts` split. `epfReconciliation.ts` — deliberately not bank-import's
fuzzy amount/date matcher; a contribution row has a natural exact key,
`(memberId, wagesMonth, type)`, since EPFO funds at most one contribution per employer per
wage-month. `EpfEmployer`/`EpfTransaction` (`core/db/types/index.ts`) both gained new optional
fields to carry real passbook data without inferring anything Penny didn't previously capture (see
`docs/SCHEMA.md`). This whole feature was scoped as an alternative to INDmoney-style UAN+password
auto-sync, which was researched and explicitly rejected (server-side credential custody, an
EPFO-advisory violation, real account-lockout risk, and no live Account-Aggregator path for EPF) —
see `docs/plans/epf-passbook-import.md` §1 for the full reasoning.

**Portfolio — Equity consolidation (2026-08-01, `apps/mobile` only, `apps/web-react` untouched/frozen):**
`PortfolioPage.tsx`'s main tabs went from `Holdings`/`IPO` (2 tabs, Holdings' own 6-item sub-tab pill
row) to 5 asset-class main tabs — `equity` (new) plus `fixed_income`/`precious_metals`/`retirement`/
`real_assets`, the last 4 now typed as `Exclude<HoldingsSubTab, 'stocks' | 'mf'>` and still driven
entirely by the existing `HOLDINGS_SUBTABS` config in `usePortfolioHoldings.ts` (untouched — single
source of truth for label/icon/asset-classes/empty-message on all 4). Equity gained its own second-level
tab strip (`stocks`/`mf`/`ipo`/`news`). Three moves, not new features: `ipo/IpoTab.tsx` now renders as
Equity's IPO sub-tab (unchanged, still owns its own virtualized list); `features/news/NewsPage.tsx` →
`NewsView.tsx` (renamed to reflect it's no longer a routed screen — dropped its own `SafeAreaView`/
background/`useDefaultHeaderBack` call, otherwise identical) renders as Equity's News sub-tab, and is no
longer reachable from Home at all — `HomeStack.tsx`'s `News` route, `ToolsGrid.tsx`'s News tile, and
Settings' matching "Modules" toggle (`ModuleVisibility.news`) were all removed, since nothing points at
a standalone News screen anymore; `MarketTicker.tsx` moved `features/home/` → `features/portfolio/` and
now renders pinned above Portfolio's main tabs (visible regardless of which asset class is active —
Sensex/Nifty/Gold aren't Equity-specific) instead of on Home. `MarketTicker` itself also dropped its
continuously-auto-scrolling `react-native-reanimated` marquee (`useSharedValue`/`withRepeat`/the
double-copy width-measuring trick, all removed) for a plain static `ScrollView` row of small cards,
manually swiped — same underlying ticker data/config, same "⋮" → `Modal`+`Toggle` configure flow. One
new component, `holdings/equity/EquitySummaryCard.tsx`: a per-sub-tab summary (Portfolio Value, then
Invested/Returns/Returns %) shown on Stocks and MF specifically, reusing `effectiveValue()` from
`usePortfolioHoldings.ts` — deliberately no "1-day change" line, since `Holding` only stores the latest
fetched price (no prior-day snapshot exists anywhere yet to diff against; flagged during mockup review,
shipped without it rather than something misleading). `GlanceHeader.tsx`'s net-worth-breakdown deep link
(`navigate('Portfolio', ...)`) grew from a flat `holdingsSubTab` param to `{ mainTab, equitySubTab }` to
address the new two-level structure — `assetSubTab()` renamed `assetPortfolioTarget()` accordingly.

**News density pass (2026-08-01 follow-up, `apps/mobile` only):** after consolidation, News's own
chrome (source line + `NewsMoodGauge`'s always-visible banner+disclaimer + 2-3 stacked Source/Tone/
Holding filter dropdown boxes) left only ~2 headline cards visible on screen. Fixed with a mockup-
approved redesign, not a placement tweak: `NewsMoodGauge.tsx` and `FilterDropdown.tsx` deleted (mobile-
only; web's originals stand untouched as the frozen reference) and replaced with (1) `NewsMoodNote.tsx`
— a collapsible one-liner reusing `AssetTaxNote`'s exact visual language (tinted bg/border by color,
icon + label + chevron, expands in place to the pos/neutral/negative breakdown + source attribution +
the disclaimer) — living as the first item of the scrolling feed (FlashList's `ListHeaderComponent` /
top of the Holdings-News `ScrollView`) instead of fixed chrome above it; (2) a single "Filters" icon
(`ti-filter`) replacing all 2-3 dropdown boxes, opening one combined `Modal` with a `FilterSection`
per field (Source/Tone always, Holding only on the Holdings-News tab) instead of each field owning its
own popup.

**News pill switch (2026-08-01, second follow-up):** with Equity's own main tabs + Stocks/MF/IPO/News
sub-tabs already stacked above News, `TabStrip`'s underlined All News/Holdings News row read as a 3rd
tab layer — replaced with a compact pill switch, hugging its own label width rather than filling the
row. First tried reusing `components/ui/SegmentedControl.tsx` (already used by `IpoTab.tsx`'s
Mainboard/All filter), but its options are `flex-1` — equal-width, meant to fill its container
edge-to-edge — which stretched to push the Filters icon off-screen next to it (caught on-device, not in
the mockup). Built locally in `NewsView.tsx` instead: two plain `Pressable`s in a `rounded-full
bg-surface-2` container, active one filled `theme.primary`. The Filters modal's `FilterSection` rows
(Source/Tone/Holding) were also restyled to match this same minimal filled-pill look (`flex-row
flex-wrap` of pills) instead of a checkmarked list, per the same round of feedback. Holdings' match
count is now inline text next to the "Holdings" label rather than a separate badge. Also collapsed
`PortfolioPage.tsx`'s own header total: the Total Invested/Current Value/Return/Return % 2×2 grid now
defaults collapsed to just Current Value + Return % (`summaryExpanded` state, tap the row to expand
back to the full grid) — freed-up header space was the actual ask driving both changes this round.

**Calculators relocation (2026-08-01, `apps/mobile` only, `apps/web-react` untouched/frozen):** Home's
"Tools" grid (`ToolsGrid.tsx`) had shrunk to a single "Calculators" tile over prior passes; per direct
review, calculators moved out of Home entirely into contextual entry points on the screens they're
actually about, extending a principle `docs/features/calculators.md` already stated for the 2 originally
skipped calculators (PPF/NPS, EMI — "redundant with what's already tracked/built elsewhere") to the
remaining 8. New shared component: `features/calculators/CalculatorsSection.tsx` — an icon+title+
subtitle `CalculatorEntryRow` that opens a calculator's existing, unchanged form inside the shared
centred `Modal` (never a bottom sheet, per `docs/DESIGN_GUIDELINES.md`) instead of a pushed screen, so
Portfolio didn't need its own nested `Stack.Navigator` just for this (see `MainTabs.tsx`'s doc comment
on why Portfolio/Chip/Goals render directly, no nested stack, today). Placement: **Tax Regime + HRA**
stay exactly where they already were (`tax/calculators/CalculatorsPillar.tsx`, imported as components
directly — unaffected by this pass); **Capital Gains** stays Tax-only too (`CapitalGainsTab.tsx`,
computed from real transactions) — the generic scratch `CapitalGainsCalculator.tsx` had no other host
once the hub was gone and was deleted (mobile-only; web's copy is untouched); **FD/RD Maturity** →
`holdings/fixed-income/FixedIncomeSection.tsx` (`CalculatorsSection ids={['fd-rd']}`); **Gratuity + SSY**
→ `holdings/retirement/RetirementSection.tsx` (`ids={['gratuity', 'ssy']}`); **FIRE, SIP & SWP Planner,
Lumpsum & CAGR** → `GoalsPage.tsx`'s tab strip, rendered inline exactly like the pre-existing "SIP
Calculator" tab (renamed **"Goal SIP"** to disambiguate from the new "SIP & SWP" tab — same topic,
different question); `TabStrip` gained `scrollable` here since 5 tabs no longer fit one screen width.
**Inflation** dissolved into an inline "adjusted for inflation" note on `GoalForm.tsx`'s target-amount/
date fields (assumes 6% p.a., gated on the target being >~6 months out) — `calcInflation()` from
`packages/core/src/core/calculators/inflation.ts` is called directly rather than reusing
`InflationCalculator.tsx`'s full-form UI (deleted on mobile, same reasoning as Capital Gains above: an
orphaned component once nothing hosted its original form-based UI). `calculatorRegistry.ts` shrank from
10 to 6 `CalculatorId`s (only the ones with a `CalculatorsSection` entry point need registry metadata
now — Tax's two are imported directly, Inflation has no detail screen at all) and dropped
`searchCalculators()`/`keywords` (dead once the searchable hub was gone). **Removed as a direct
consequence, not a separate decision:** `CalculatorsPage.tsx` + `HomeStack.tsx`'s `Calculators` route;
`ToolsGrid.tsx` and `HomePage.tsx`'s render of it (no "Tools" section at all now, not left empty);
Settings' entire "Modules" section (`SettingsPage.tsx`'s `MODULES` grid) and the `ModuleVisibility`
concept in `SettingsContext.tsx` (`portfolio`/`goals`/`subscriptions`/`iou`/`backup`/`calc` —
the last three were already-dead flags, defined but never read by any consumer, cleaned up in the same
pass); `MainTabs.tsx`'s `tabBarButton: () => null` hiding logic for the Portfolio/Goals tabs — both are
now permanently-shown tabs, per explicit decision that this capability wasn't worth preserving elsewhere
once Calc's toggle (the only one of the three that was ever about a Home tile) became meaningless.

**Settings redesign (2026-08-01, `apps/mobile` only, `apps/web-react` untouched/frozen):** on review, the
screen read as flat/dull (uniform gray icons, hairline-divided rows directly on the page background, no
card grouping) and buried the most-touched controls (Default privacy mode, Safe Mode visibility, Manage
tags, Timeline) several sections down, under Appearance's two full-height Theme/Text-size grids. Went
through two mockup rounds (`docs/mockups/proposals/settings-redesign-v1.html` →
`settings-redesign-v2.html`, the approved one — its legend has the full before/after reasoning) before
touching code. **New shared local components in `SettingsPage.tsx`:** `Card` (a `bg-surface` rounded
container — finally builds the "Grouped cards + section labels" pattern `docs/DESIGN_GUIDELINES.md` §3
already described, which no Settings-family screen had actually implemented), `Row` gained a `color`
prop (a small tinted icon badge instead of a plain gray icon) and a `first` prop (skips its own
`border-t` so it doesn't double up with the card's outer border), `InlineBlock` (same first-child
divider rule as `Row`, for non-row content like the privacy-mode button group or theme swatches),
`StatusPill` (deliberately **not** pressable — a glance at current Privacy/Theme/PIN state, not a
shortcut; reviewed specifically to make sure this redesign didn't introduce a popup/hidden-navigation
surface, per direct feedback on the v1 mockup). **Colour is per-section, not per-row** (`useSectionColors()`
→ `theme.warning` for Frequent, `theme.privacy` for Security, `theme.info` for Appearance, `theme.neutral`
for Data & activity, `theme.danger` for Danger zone) — deliberately not a rainbow per row, since these
rows don't carry distinct app-wide meaning the way, say, income/expense colours do (`DESIGN_GUIDELINES.md`
§1's "colour is wayfinding, not decoration"). **Reordered:** Profile → status-pill strip → **Frequent**
(Default privacy mode + Open mode duration inline, then Safe Mode visibility/Manage tags/Timeline as nav
rows — Timeline moved here from Data & activity) → Security → Appearance (Theme and Text Size, explicitly
kept as _two_ separate controls, not merged into one, per a v1→v2 correction) → Data & activity (Backup &
Restore, Contact & Feedback) → Danger zone. No control was removed or hidden behind a new screen/modal —
every row from the pre-redesign screen is still here, same navigation targets, same toggles; only layout,
grouping, colour, and order changed.

**Settings — Appearance follow-up (2026-08-01):** the redesign above initially kept Theme/Text Size as
they'd looked in the approved mockup — a live-palette swatch grid (`ThemePreview`, a mini rendered card
per theme) and a 4-box "Aa" grid, each its own `InlineBlock`. On-device review flagged this as still
busy/dated next to the rest of the redesigned card. Two more directions were mocked up
(`docs/mockups/proposals/settings-appearance-refresh-v1.html`) — a live-theme-preview swatch grid kept as
a segmented icon pill, and an iOS-style text-size slider — both passed over for **"Option 3": one
compact `Row` each**, icon badge + current value (e.g. "Dark", "Default") + a new `CompactSegmentedControl`
(icon-only for Theme, short S/A/A+/A++ labels for Text size) in the row's `trailing` slot. `ThemePreview`
was deleted (nothing renders it anymore) — the live-palette-preview quality it gave up is a real
tradeoff, made deliberately in favour of density.

**Goal-transaction linking (2026-08-01, `apps/mobile` only, `apps/web-react` untouched/frozen):**
researched Cashew's (github.com/jameskokoska/Cashew) own goal-linking feature directly from its Flutter
source before designing — its `SelectObjective` widget (`addTransactionPage.dart`) confirmed the
single-select pill pattern for choosing a goal (`SelectChips`, `allowMultipleSelected: false`), though
Cashew shows that row always (an implicit "no goal" pill is the off-state) where this puts it behind a
Tags-style icon toggle instead, to match `ExpenseForm.tsx`'s existing convention. Rather than adopt
Cashew's simpler "goal = live sum over tagged transactions, no separate ledger" model, this reuses
Penny's own two-way IOU↔Expense link shape instead (**"similar to how IOU works both ways" was the
explicit ask**) — a real, previously-dormant `GoalContribution` table already existed in the schema
(defined, demo-seeded, registered for Undo/restore) but nothing had ever actually written to it from a
real user action; "Add contribution" used to just bump `goal.currentAmount` directly. This pass finally
uses it. New pure module, `core/goals/goalLink.ts`, mirrors `core/iou/expenseLink.ts` field-for-field:
`reconcileGoalLink(txnId, existingContributions, intent, now)` (transaction → goal, simpler than IOU's
since a goal link has no "kind" dimension — one relationship, "counts toward X") and
`reconcileLinkedGoalTxn(existing, intent, now)` (goal contribution → transaction, mirrors
`reconcileLinkedTxn` — `intent.destinationAccountId` set ⇒ Transfer, unset ⇒ Expense categorised
`cat-savings`/`cat-tr-bank`, a genuine product decision made via question rather than assumed).

**A real architecture call, not just a port:** `Goal.currentAmount` is redefined as a one-time baseline
(set only via `GoalForm`'s "Already saved" field) rather than a denormalized running total — the amount
shown/used everywhere (`useGoals.ts`'s `effectiveSaved(goal)`) is that baseline **plus** the live sum of
the goal's `GoalContribution`s, computed on read. This mirrors IOU's own `netBalance()`
(`core/iou/ledger.ts`) never storing a denormalized total either — the alternative (keep incrementing
`currentAmount` by delta on every contribution create/edit/delete, across two directions) is exactly the
kind of permanent-drift footgun IOU's design already avoids, so it wasn't worth reintroducing here.
Demo data's three seeded goals had their `currentAmount` reduced by their existing `goalContributions`
sum to keep the same displayed totals under the new model (`seedDemoData.ts`).

**Forward direction (transaction → goal):** `ExpenseForm.tsx` gained a "Goal" `ExtraCircle` tile between
Receipt and Lent/Borrowed — shown for expense, income, **and** transfer (IOU's tile stays
expense/income-only). Its panel reuses the exact pill styling this file's Vacation-event tags already
use (rounded-full, 2px border, tinted fill when selected, coloured dot) rather than a new component —
single-select, tinted by each goal's own risk colour (`getRiskColor`). `useExpenses.ts` gained
`seedGoalFromExpense`/`goalLinkByTxn`/`goalLinkedTxnIds`, mirroring `seedIouFromExpense`/`iouLinkByTxn`/
`iouLinkedTxnIds` exactly, threaded through `ExpensesPage.tsx` → `TransactionsSlice.tsx` →
`ExpenseForm.tsx`/`TransactionsTab.tsx`. A goal-linked transaction shows a small `theme.success`-tinted
`ti-target` icon next to its title in the list — same slot/treatment as the existing receipt-paperclip
and shared-expense-people icons — and is excluded from spending analytics via a new synthetic
`goal_contribution` set-aside group in `useExpenseAnalytics.ts`'s `classify()`, right next to the
existing `iou_lending` one (per explicit product decision — a goal contribution isn't daily-living
spend, same reasoning IOU-linked transactions already get).

**Reverse direction (goal → transaction):** `useGoals.ts` grew from a thin `goalsRepo` wrapper into the
full domain hook (mirroring `useIou.ts`'s scope) — reads `accountsRepo`/`expensesRepo` directly (all
`core/db/repositories` imports, no cross-feature-folder import needed, since Goals and Expenses are
siblings under `apps/*/features/`), exposes `contributionsByGoal`, `effectiveSaved`, `saveContribution`
(create/edit a manual contribution, optional linked transaction via `syncLinkedGoalTxn` — mirrors
`IouView.tsx`'s `syncLinkedTxn`), `removeContribution` (cascades to a manual contribution's own linked
transaction; expense-origin ones aren't deletable from here at all — that link only comes off by editing
the transaction and toggling Goal off, "one capability, one control" per `docs/DESIGN_GUIDELINES.md`),
and `linkTransaction` (retroactively tag an existing unlinked transaction, reusing `reconcileGoalLink`
directly). Three new components: `GoalDetailView.tsx` (a centred `Modal`, same family as IOU's
`PersonLedgerView.tsx` — progress ring, every contribution listed with an "in account" `Badge` when
linked, footer: "Link existing" / "Add contribution"); `GoalContributionForm.tsx` (amount/date +
"Record as a transaction" toggle mirroring `EntryForm.tsx`'s exactly, plus the optional destination-
account toggle for the Transfer case); `LinkTransactionModal.tsx` (a search-filtered, capped-at-50,
non-virtualized picker over every not-yet-linked transaction — same bounded-list tradeoff IOU's own
pickers already make). `GoalCard.tsx` is now tappable (opens `GoalDetailView`) and shows a linked-
contribution-count badge; its existing inline "Quick add" button still creates a fast, no-transaction
manual contribution (unchanged speed, now correctness-safe under the baseline+live-sum model instead of
silently double-counting against real contributions).

**Known gap, scoped out deliberately:** deleting a manual contribution + its linked transaction isn't
yet a single atomically-restorable Undo the way IOU's `deleteEntryAndTxn` is — two separate activity-log
entries for now, noted in `docs/features/goals.md`'s limitations rather than blocking this pass on it.

**"Add contribution" becomes the real Expense form (2026-08-02, `apps/mobile` only) — a redesign review,
not just a restyle:** a real on-device screenshot of `GoalContributionForm.tsx` prompted a wider look at
Goals, which surfaced four overlapping entry points for "this money counts toward a goal" — Quick Add
(card, no transaction at all), Add Contribution (Detail, optionally a transaction via a toggle),
Link Existing (Detail, retags a past transaction), and `ExpenseForm.tsx`'s own Goal picker tile (tags a
new transaction). Quick Add was pure duplication — functionally identical to Add Contribution's toggle
switched off — and `GoalContributionForm.tsx`'s plain labeled fields + `SelectInput` dropdown visibly
predated `ExpenseForm.tsx`'s own redesign, even though both end up creating the same kind of Expense
record. Fixed at the root instead of re-skinning a lookalike:

1. **`ExpenseForm.tsx` relocated** from `features/expenses/transactions/` to
   `apps/mobile/src/components/shared/ExpenseForm.tsx` — it's no longer an Expenses-tab-specific form,
   it's the app's one form for creating/editing a transaction, and Goals is now a second feature module
   that genuinely needs it (the same "needed by 2+ feature modules ⇒ promote to shared" reasoning
   `useAccountForm.ts`/`AccountFormModal.tsx` were promoted under on 2026-08-01). Its own
   `AccountChips.tsx`/`PaymentModeChips.tsx`/`paymentModes.ts` moved alongside it for the same reason (all
   three are generic transaction-entry UI, not Expense-domain-specific) — `BulkAccountPaymentModal.tsx`
   (stayed in `features/expenses/transactions/`) updated its imports accordingly.
   `CategoryPickerModal.tsx`/`categories/types.ts` and `ItemHistory.tsx` **stayed** in their original
   `features/expenses/`/`features/activity/` locations and are now referenced from the relocated
   `ExpenseForm.tsx` via absolute `~/features/...` imports — a deliberate, smaller-scope trade-off rather
   than relocating an entire category-management subsystem for one conditional dependency; not a new
   pattern either, since `CategoryPickerModal.tsx` was already imported cross-feature by
   `features/groups/SharedExpenseComposer.tsx` and `features/import/review/CategoryTile.tsx` before this
   change.
2. **`ExpenseForm.tsx` gained a `goalPreset?: { goalId, goalName }` prop.** When set: the type switch
   drops Income (Expense/Transfer only — Income was never a valid shape for
   `LinkedGoalTxnIntent`/`reconcileLinkedGoalTxn`); a small "Contributing to {name}" caption renders below
   the header; the category tile becomes locked/non-interactive (`disabled`, no `CategoryPickerModal`,
   `categoryManager` made optional on the `Props` interface) defaulting to `cat-savings`/`cat-tr-bank`
   (re-applied on type change too); the description defaults to `Contribution: {name}`. The
   Goal/Lent-Borrowed `ExtraCircle`s+panels need **no explicit hiding logic at all** — they're already
   gated on `!!onSeedGoal`/`!!onSeedIou`, and `GoalsTab.tsx` simply never passes those two props when
   opening this form, so `showGoalSection`/`showIouSection` are naturally `false`. This was a deliberate,
   considered choice: the goalPreset flow does **not** reuse `onSeedGoal`/`reconcileGoalLink` (which would
   produce an `origin: 'expense'` contribution, non-deletable from Goal Detail) — it keeps today's
   `origin: 'manual'` ownership (goal-owned, still editable/deletable from Goal Detail) via a new
   `useGoals.ts` function instead (below), so this redesign doesn't silently change what "delete from Goal
   Detail" does.
3. **`useGoals.ts` grew its own independent `categories`/`hashtags`/`saveAccount`** (same shape as
   `useExpenses.ts`'s and `useAccounts.ts`'s own copies of `saveAccount` — still can't import another
   feature module's hook directly) plus `useAccountsRefresh`/`useTagsRefresh` wiring (the same
   previously-missing-elsewhere gap already closed in `useExpenses.ts` on 2026-08-01), and a new
   **`saveGoalContributionTxn(goalId, expense, editingContribution, newTagSetAside?)`**: persists the
   fully-assembled `Expense` `ExpenseForm` produced (category, tags, receipt, payment mode, custom
   description — everything, unlike `syncLinkedGoalTxn`/`reconcileLinkedGoalTxn`'s narrower reconstruction
   from a `{amount, date, sourceAccountId, destinationAccountId}` intent) directly via `expensesRepo.put`,
   bumps hashtag usage counts, logs the expense's own activity entry, then upserts a matching
   `origin: 'manual'` `GoalContribution` with `linkedTxnId` pointing at it. The pre-existing
   `saveContribution`/`syncLinkedGoalTxn`/`ContributionTxnOption` path is untouched and still used — just
   narrowed to one caller now (below).
4. **`GoalCard.tsx`'s "Quick add"** (inline amount box, `onQuickContribute`, no linked transaction) is
   removed entirely, replaced by **"Link existing" / "Add contribution"** — the exact same pairing
   `GoalDetailView.tsx`'s footer already had — now surfaced directly on the card too (`onLinkExisting`/
   `onAddContribution` props), wired in `GoalsTab.tsx` to the same `setLinkingGoalId`/`setContributionForm`
   state Detail's footer already used. Not a new duplication: same handlers, two natural entry points
   (card for a fast add, Detail when already reviewing the ledger) — the thing being eliminated was two
   _different implementations_ of the same idea, not the idea of reaching it from two places.
5. **`GoalContributionForm.tsx` renamed `LegacyContributionEditModal.tsx`** and trimmed to amount + date
   only, no txn-recording options — since "Add contribution" always goes through `ExpenseForm` now (step
   2), a contribution can never again end up bookkeeping-only (no linked transaction); this component
   exists solely so one created _before_ this change can still be edited/deleted. `GoalsTab.tsx` branches
   on tap: `contribution.linkedTxnId` set ⇒ opens `ExpenseForm` in edit mode for that `Expense` (with
   `goalPreset` still applied); unset ⇒ opens this legacy fallback instead.

**Liquid-fill goal card (2026-08-02, `apps/mobile` only) — a design exploration, not a targeted fix:**
a real screenshot review flagged the ring+text `GoalCard.tsx` layout as "boring" and asked for something
genuinely novel, not a recolour. Researched how Jar (literal 3D jar-fill), Qapital (illustrated bucket
goals), INDmoney (data-dense rings), Monarch Money (trajectory/status framing), and CRED's NeoPOP
(engineered-block material language) each solve "show progress toward a goal," then mocked up 4 real
directions grounded in that research (`docs/mockups/proposals/goal-card-redesign-v1.html`) before the
user picked "liquid fill" — the card itself is the vessel, filled bottom-up to the goal's actual
percentage. Two further refinement rounds
(`goal-card-liquid-icon-v1.html`/`v2.html`) added a large per-goal icon watermark and fixed two issues
found along the way: the icon must never be blank (every goal needs one, not just the 4 suggestion
templates that happen to set `Goal.icon`) and must stay legible **above** the fill, not fade as the
waterline rises past it; "SIP needed" — dropped in an earlier pass — had to come back, since it's
information the user actually relies on, not decoration.

Implementation: `GoalCard.tsx` renders a fixed-height (152dp) rounded box whose background is a plain
`View` sized to `${pct}%` height (bottom-anchored), filled with an `expo-linear-gradient` `LinearGradient`
(lighter risk-colour tint at the waterline → full risk colour at the bottom, via `~/lib/color`'s `ink()`)
plus a small decorative sine-like `react-native-svg` `Path` sitting right at that seam (a fixed-shape
"wave cap", not a recomputed-per-percentage path — simpler and cheap to render for something mounted once
per goal in a list) so a flat percentage-height reads as a liquid surface rather than a hard-edged bar.
The icon watermark is a plain `Icon` (132px, white, 16% opacity, bottom-right, bled off the corner)
rendered **after** the fill `View` in JSX order (later siblings paint on top in RN, same as CSS without
explicit `zIndex`) — this is what keeps it legible over filled liquid, not just empty surface. `core/
goals/meta.ts` gained `resolveGoalIcon(goal)`/`inferGoalIcon(name)`: an explicit `Goal.icon` always wins;
otherwise a small ordered keyword-to-icon table (emergency→shield, trip/vacation/goa→plane, home→house,
car→car, wedding→heart, education→school, retirement→beach, laptop/phone→device) is checked against the
lowercased name, falling back to a plain target icon (`DEFAULT_GOAL_ICON`) if nothing matches — every
goal resolves to _some_ icon, by construction. The risk badge, target date, per-goal "N contributions"
line, "Suggested" pill, and the card's own inline edit-pencil button were all dropped as part of this
redesign (risk reads through the liquid colour now; editing a goal is still one tap away via
`GoalDetailView`'s own pencil, reached by tapping the card) — SIP needed was deliberately kept, per
explicit user correction mid-review.

**Suggested-goals dedup fix, found during the same review:** `SuggestedGoals.tsx`'s existing-goal dedup
compared names via a plain `trim().toLowerCase()`, which missed a real collision — `seedDemoData.ts`
seeds a goal named "Home Down Payment", while `lifeStageGoalTemplates()`'s fixed template name is "Home
down-payment" (different casing/punctuation) — so the panel kept suggesting an effectively-duplicate
goal. Fixed with `normalizeGoalName()` (strips everything but letters/digits before lowercasing/
comparing), which closes this specific case and the broader class of casing/spacing/hyphenation
mismatches between a template's canonical name and however a real goal ended up named.

**Expenses screen — 4 targeted changes (2026-08-02, `apps/mobile` only), mocked up first
(`docs/mockups/proposals/expenses-screen-batch-v1.html`):**

1. **Account moves under the amount.** `TransactionsTab.tsx`'s row subtitle used to be
   `"{category} · {account}"`, crammed onto one line alongside tags. The account name moved to a small
   second line under the amount (right-aligned); the subtitle is now just category + tags.
2. **Vacation note becomes dismissible, per event.** `CategoryPickerModal.tsx`'s explanatory `Banner`
   (why travel spend is tracked separately) re-rendered on every single category pick for the whole
   trip. `Banner` (`components/ui/Banner.tsx`) gained an optional `onDismiss` prop (a small × button,
   top-right) — generic, not vacation-specific, so any future banner that shouldn't keep reappearing can
   reuse it. `CategoryPickerModal` persists dismissal per event id (`AsyncStorage` key
   `penny_vacation_note_dismissed`, same `getJSON`/`setJSON` pattern `useExpenses.ts`'s dismissed-due-
   recurring set already uses) — dismissed once, gone for the rest of _that_ trip, but a future one still
   shows it once. Required threading the event's `id` through: `activeVacationEvent`'s shape widened from
   `{ name }` to `{ id, name }` in both `CategoryPickerModal.tsx`'s `Props` and
   `ExpenseForm.tsx`'s pass-through. The "Vacation On · {name}" status pill stays always-visible
   (unaffected) — only the longer paragraph is dismissible.
3. **Filter by goal.** `FilterModal.tsx`'s `FilterState` gained `goalFilters: Set<string>`, rendered as
   a new pill section directly mirroring the existing Event section (same `chip()` helper, "All goals"
   default). Matching needed a `goalId → linked transaction ids` map — `useExpenses.ts` already fetches
   every `GoalContribution` (for `goalLinkByTxn`/`goalLinkedTxnIds`), so the new `txnIdsByGoal` derivation
   is a small addition there, not new plumbing; `useTransactionFilters.ts` takes it as a third parameter
   and matches identically to how `eventFilters` already works. `goals` itself needed no new prop
   threading — `TransactionsSlice.tsx` already received it for `ExpenseForm`'s own Goal picker tile, just
   wasn't passed into `<FilterModal>` yet.
4. **Monthly Cash Flow card (Analytics).** Not a new "Cash Forward" ledger concept the way Money
   Manager or MoneyView-style imports (`core/import/importCarryForward.ts`) model it — Penny's balance is
   already continuous (`openingBalance + sum of deltas`, no month buckets), so a native carry-forward
   transaction type would fight that model rather than fit it. Instead, a new pure function,
   `core/expenses/cashFlowSummary.ts`'s `computeCashFlowSummary(account, allTxns, monthKey)`, derives
   everything from data that already exists: **Initial** = `computeBalance()` (now also exporting its
   internal `delta()` helper, reused here) bounded to transactions before the month starts (`lib/date.ts`'s
   new `monthBounds(monthKey)`); **Income/Expenses** = the signed sum of every in-month transaction's own
   `delta()`, _excluding_ any entry with `useAccounts.ts`'s fixed `"Balance reconciliation"` description
   (the one reliable way to tell an organic transaction apart from a reconciliation adjustment);
   **Computed left** = `initial + income − expenses`. If the account was reconciled that month, the
   reconciliation's own delta is added on top (`reconciledActual`) and surfaced as a variance note against
   Computed left — arithmetically exact (`reconciledActual` = the same `computeBalance()` would return
   including reconciliation entries, just derived without a second full recompute). Wired through
   `useExpenseAnalytics.ts` (`accounts` is now an input; `cashFlowSummaries` — filtered to
   `type === 'cash' || 'wallet'`, bank/card accounts already have a clear paper trail and don't need this
   — is a new output) → `AnalyticsSlice.tsx` (now also takes `accounts`) → `AnalyticsTab.tsx`, rendering
   one card per account right after the existing "Total spent" card in the monthly view.

**Transactions list — timeline rail merge + dot centering fix (2026-08-02, `apps/mobile` only), a real
on-device screenshot review, mocked up through several rounds
(`docs/mockups/proposals/transactions-list-refinements-v1.html` →
`transactions-date-header-inline-tight-v1/v2/v3.html`):**

1. **Dot centering fixed.** `TransactionsTab.tsx`'s rail dot used `top: '50%'` + `marginTop: -5` on an
   absolutely-positioned sibling — reliable only while every row was the same height, which stopped being
   true once the account line was added under the amount (previous entry). Replaced with a flex column
   (two equal-flex rail segments around the fixed-size marker) inside a top/bottom-anchored (so already
   definite-height) absolute container — pure flexbox distribution, no percentage-of-parent math, the same
   class of fix `MainTabs.tsx`'s `HeaderCenter` needed once for its own on-device-only centering bug.
2. **Rail marker becomes the category/type icon, not a plain dot** — filled, tinted background,
   ~22×22dp, the icon rendered inside at 13px. This is the exact same `accent`/`icon` `TransactionRow`
   already computed for the now-removed separate `w-9 h-9` icon badge next to the description — showing
   it twice (a colour-only dot _and_ a full icon badge) was redundant, so the badge is gone in normal mode
   (select mode, which has no rail at all, keeps its own copy of that badge).
3. **Day header removed; date now sits inline on the rail.** The separate full-width `{ kind: 'header' }`
   row (its own `FlashList` item type, ~40dp of banded background + padding per day) is gone. `Row` is
   now a single shape — `{ key, txn, isLastRowOverall, dateLabel? }` — where `dateLabel` (from
   `groupExpensesByDate`'s existing `g.label`) is set only on a day's _first_ transaction. That row
   renders the label in an ordinary (non-absolute, non-negative-offset) block sitting in normal flow
   right above the transaction's own content, positioned at the rail's own horizontal offset — a
   negative-top overlay was deliberately avoided since a virtualized list may clip a cell's content to its
   own bounds, and content escaping above a cell's box would render unreliably. Net effect: a day
   boundary now costs about one small text line instead of a whole extra row, while the date is still
   shown exactly once per day (never repeated per transaction) — and `getItemType` is gone from the
   `FlashList` entirely, since every row recycles from one pool now instead of two.

**"View transactions" in-place drill-down — Accounts + Analytics (2026-08-02, `apps/mobile` only), a
design discussion, mocked up first (`docs/mockups/proposals/entity-transactions-drilldown-v1.html`):**
the user wanted to see all transactions for a specific account/category/intent group/tag/Set-Aside line
without configuring the Filter modal one dimension at a time. Two shapes were considered: deep-linking to
the Transactions tab with a preset filter (mirroring `GlanceHeader`'s existing `{ initialTab: 'iou' }`
convention), or an in-place modal opened right where the entity is browsed. **The user's preference (an
in-place modal) is what got built, for reasons beyond taste**: navigating away loses whatever
scroll/month/tab state the caller had; a modal preserves it. It also needed no new `FilterState`
dimensions — the Filter modal has no tag filter or "linked to IOU" filter today, so deep-linking those
specifically would have meant adding filter plumbing just for this; the in-place approach just has the
caller (which already holds the full `expenses` array) filter it with plain JS instead.

1. **`TransactionsTab.tsx`'s `onEdit` is now optional.** Read-only rows (no `SwipeableRow` wrapper, no
   tap handler, no swipe actions) render when it's omitted — mounting a real gesture-handler instance for
   a row with nothing to swipe into or tap for would be pure overhead. `TransactionRow` now builds its
   `rowInner` JSX once and only wraps it in `SwipeableRow` when `onEdit` is present; select mode is
   unaffected (it never used `onEdit`).
2. **New shared component: `components/shared/EntityTransactionsModal.tsx`** — `{ title, subtitle?,
statLabel?, statValue?, statColor?, expenses, categoryMap, accountMap, hashtags, shouldMask,
goalLinkedTxnIds?, onClose }`. Internally: `groupExpensesByDate()` on the caller-filtered `expenses`,
   then a centred `Modal` wrapping the real `TransactionsTab` (read-only, `onEdit` omitted) inside a
   `View` sized to `screenHeight * 0.55` — `Modal`'s own card sizes to content by default (no
   `justifyContent: 'stretch'`), so `TransactionsTab`'s internal `FlashList` needs an explicit height to
   size itself against, or it has nothing to fill. Reuses `TransactionsTab` itself rather than a second,
   simpler list renderer (matching `LinkTransactionModal.tsx`'s capped `.map()` picker) since "all
   transactions for an account" isn't naturally small the way a bounded candidate list is — it needed the
   same virtualization the main list already has, not a second implementation to keep in sync.
   `TransactionsTab.tsx` itself stays in `features/expenses/transactions/` rather than moving to shared —
   same trade-off `ExpenseForm.tsx`'s own relocation note documents (imported cross-feature via an
   absolute path instead of relocating a whole subsystem for one new consumer).
3. **Accounts**: `AccountList.tsx`'s row (previously a plain `View`) is now a `Pressable` opening the
   modal, filtered to `accountId === acc.id || toAccountId === acc.id` (so transfers touching the account
   from either side show up) — a small chevron added before the existing edit/reconcile/delete icons,
   which are unaffected (still their own `Button`s, still intercept their own taps). `useAccounts.ts`
   gained its own independent `categoryMap`/`hashtags` reads (same "feature module can't import another
   feature module's hook" reasoning as every other per-feature `saveAccount` copy this session) purely so
   the modal has what it needs to render rows the same way the main list does.
4. **Analytics**: `useExpenseAnalytics.ts` now also returns `classify` (previously internal-only) — the
   exact function `analyticsData`/`setAsideData` already use to bucket each expense into a routine group,
   a synthetic Set-Aside group, or an event. `AnalyticsSlice.tsx` uses it directly to answer "which
   transactions are in this group/category/tag" without a second classification implementation, and now
   also calls `usePrivacy()` itself (previously only received a precomputed `masked` boolean for aggregate
   rows — the drill-down modal needs the real `shouldMask` function for per-row masking, same as the main
   Transactions list). `AnalyticsTab.tsx` gained `onViewGroup`/`onViewCategory`/`onViewTag` callback props,
   wired to: each category row inside an expanded group's breakdown, a new "View all transactions in
   {group}" link at the bottom of that same expanded section, every Set-Aside line (Lending & IOU, Goal
   contributions, Shared with family, per-tag lines), and each "Other hashtags" row (the general tag
   breakdown, separate from Set-Aside's own per-tag lines) — the existing "promote to event" icon on that
   last one stays a separate, unaffected tap target.

**Expense form — three targeted fixes (2026-08-01, `apps/mobile` only, `apps/web-react` untouched/frozen):**
on-device review of the real add-transaction flow, mocked up first
(`docs/mockups/proposals/expense-form-improvements-v1.html`), then built.

1. **Category + Amount combined row.** The amount hero used to sit centred above its own full-width
   "Select category" row — for expense/income, both now share one row: a dashed placeholder tile (fills
   solid with the category's own colour/icon once chosen, tinted the same way the Transactions list
   already colours a category) on the left, the amount right-aligned on the right. `AmountInput.tsx`
   gained a `heroAlign?: 'center' | 'right'` prop for this (`'center'` stays the default everywhere
   else, including `CashFlowPage.tsx`'s own unrelated hero-amount usage — a purely additive change).
   Transfer has no category, so it keeps the original centred hero unchanged. Date, previously paired
   with Category in that row, now stands alone below.
2. **Inline "+ Add account."** `AccountChips.tsx` gained a persistent dashed "+" tile after every real
   account (previously `onAddAccount` only ever showed as an empty-state fallback button, and even then
   just navigated away to the Accounts page, closing the form and discarding progress). Tapping it now
   opens the real `AccountFormModal` as a second `Modal` stacked on top — RN's `Modal` already supports
   this, no new pattern needed. **Required a real architecture fix, not just a UI one:** `ExpenseForm.tsx`
   (the `expenses` feature module) needed `useAccountForm`/`AccountFormModal`, which lived inside
   `features/accounts/` — a feature-module-to-feature-module import `CLAUDE.md`'s architecture rules
   disallow. Both moved to shared locations any feature may import from: `useAccountForm.ts` →
   `apps/mobile/src/hooks/useAccountForm.ts` (now also home to the `AccountInput` shape, previously
   defined inside `features/accounts/useAccounts.ts`), `AccountFormModal.tsx` →
   `apps/mobile/src/components/shared/AccountFormModal.tsx`. `useExpenses.ts` gained its own independent
   `saveAccount` (mirrors `useAccounts.ts`'s implementation — can't import that hook directly for the
   same reason — same repo, same shape, returns the saved `Account` so `ExpenseForm.tsx` can merge it
   straight into its own local account list and auto-select it for the single-account case) plus
   `useAccountsRefresh(reloadAccounts)`, a pre-existing cross-hook signal (`useDataRefresh.ts`) Settings →
   Safe Mode's own account edits already relied on — `useExpenses.ts` just hadn't been wired to listen for
   it yet, a real gap (found while implementing this) beyond what this feature strictly needed to fix but
   worth closing in the same pass. See `docs/features/accounts.md`'s 2026-08-01 note for the full
   before/after paths.
3. **FAB: 2 taps → 1.** `TransactionsSlice.tsx`'s "+" FAB used to reveal an Expense/Income/Transfer
   speed-dial (`showDial`, `DIAL_OPTIONS`) as a mandatory intermediate step before the form opened —
   removed entirely; the FAB now calls `openAdd()` directly (defaulted to Expense), since the form's own
   type switch at the top already covers picking a different type, making the speed-dial a genuinely
   redundant second control for the same choice.

**Expense form — same-day follow-up (2026-08-01, `apps/mobile` only), 4 real-screenshot fixes to the
above pass:**

1. **Category tile width.** The category tile's `flex-1` stretched it to fill roughly half the row —
   content (a small icon + one line of text, left-aligned) left most of that width empty, reading as an
   oversized, half-finished-looking box. Changed to a fixed `width: 108` (amount's container takes the
   freed-up `flex: 1` instead), so the tile is sized close to its content like every other tile in this
   form (`AccountChips`, `PaymentModeChips`).
2. **Date + Time, equal width, both editable.** `Expense.date` already carried a time-of-day, but it was
   never user-editable — `dateInputToEpoch()` silently stamped whatever `Date.now()` was at save time.
   Added `TimeInput`/`TimeInput.web` (`components/ui/`), a `DateInput`-style native/web split built on the
   same `@react-native-community/datetimepicker` (`mode="time"` instead of `"date"`; web falls back to a
   real `<input type="time">` for the same reason `DateInput.web.tsx` does — the native picker package
   ships no web build at all). `lib/date.ts` gained `toTimeKey`/`epochToTimeInput` (the `HH:mm` value-
   format pair, mirroring `toDateKey`/`epochToDateInput`) and `combineDateTime(dateStr, timeStr)`, which
   `ExpenseForm.tsx` now calls instead of `dateInputToEpoch` — both fields default to right now but stay
   independently editable, so a purchase logged later or backdated can carry its real time rather than
   whenever the user happened to open the form. (`dateInputToEpoch` is untouched and still used as-is by
   `GoalContributionForm.tsx`/`iou/EntryForm.tsx` — this only changed `ExpenseForm.tsx`'s own call site.)
3. **Persistent highlight on collapse, for Goal and Lent/Borrowed.** Tags and Receipt already behaved
   correctly: `showTags`/`showReceipt` are pure UI-disclosure toggles, decoupled from the actual saved
   content (`tagInput`/`receipt`), so their `ExtraCircle` stays highlighted whenever content exists even
   after the panel is collapsed. Goal and IOU had conflated the two — `goalEnabled`/`iouEnabled` was both
   "is the panel open" AND "should this be saved," so collapsing the panel (a tap on the circle) silently
   cleared the link too, and the circle went dark even when a goal/person was still filled in. Renamed to
   `showGoalPanel`/`showIouPanel` (pure disclosure, mirroring `showTags`), changed each `ExtraCircle`'s
   `active` to check the underlying value instead (`showGoalPanel || !!selectedGoalId`,
   `showIouPanel || iouPerson.trim().length > 0`), and changed `goalIntent`/`iouIntent`'s save-gating to
   drop the panel-open check entirely (saved whenever `selectedGoalId`/`iouPerson` is actually filled,
   exactly like `hashtags: parseTags(tagInput)` never checks `showTags`). The on-open validation guard
   (submitting with the panel open but nothing picked → scroll-to-and-highlight) is unchanged — it still
   reads `showGoalPanel`/`showIouPanel`, same as `showTags` already did.
4. **Reliable description autofocus.** A bare `autoFocus` on the description `TextInput` was already
   present but unreliable — RN's `Modal` (`animationType="fade"`) mounts its children before the native
   modal window has actually finished presenting, so `autoFocus` often fired before the view was focusable
   and silently no-op'd. `Modal.tsx` gained an `onShow` passthrough to RN's own `Modal.onShow` (fires once
   presentation genuinely completes); `ExpenseForm.tsx` now focuses a `descriptionRef` from there instead
   of relying on mount-time `autoFocus`.

**Expenses header declutter (2026-08-01, `apps/mobile` only), a follow-up mockup round
(`docs/mockups/proposals/expenses-header-declutter-v2.html`) after a real screenshot flagged
`ExpensesHeader.tsx`'s own two-row actions+stats block as visually noisy:** collapsed into one row —
left column shows the **transaction count** ("N transactions", from `filteredExpenses.length`, replacing
the old "All transactions"/month-label text) with the **filtered total** below it; right column now
stacks the **Events/Import/Export** icons above the **Safe-to-spend** pill (previously a separate
icon-only row above the stats row); the active **vacation event**, when one exists, sits in a third
column dead-centre of the whole row. All three are equal-width `flex: 1` columns in one `flex-row` — not
`position: absolute` + centering insets, which `MainTabs.tsx`'s own `HeaderCenter` already found renders
correctly on web but off-centre on-device under this project's NativeWind/`react-native-css-interop`
setup (see that component's doc comment). The centre column simply renders nothing when there's no active
event — same row height either way, no placeholder gap. `ExpensesHeaderProps` gained `transactionCount`
(passed from `ExpensesPage.tsx` as `txnFilters.filteredExpenses.length`) and dropped `monthFilter` (no
longer read now that the label is a count, not a month name).

**Expenses (Track 4, ninth module, done) — CLAUDE.md's own flagged "hardest port":** `apps/mobile/src/features/expenses/` ports `apps/web-react/src/features/expenses/` (~7,532 web lines across 33 files — comparable size to Portfolio, but ported more sequentially since its pieces share state through one hook rather than being independent like Portfolio's asset classes). Structure: `useExpenses.ts` (shared data/mutation hook — every one-time category/merchant-memory migration effect's synchronous `localStorage` check became an async `~/lib/storage` check inside the same effect, no behavior change), `ExpensesPage.tsx`/`ExpensesHeader.tsx` (tab shell), `categories/`, `budgets/`, `analytics/`, `events/`, `transactions/`, and thin `subscriptions/`/`iou/` slice wrappers reusing the already-ported Subscriptions/IOU modules directly. **The two flagged-hardest UI translations, both solved per explicit user decision (not simplified):** (1) swipe-to-reveal row actions (`transactions/SwipeableRow.tsx`) rebuilt on `react-native-gesture-handler`'s `ReanimatedSwipeable` (new native dep; `App.tsx`'s root now wraps in `GestureHandlerRootView`) rather than web's hand-rolled Pointer-Events implementation or a hand-rolled Reanimated-only reimplementation — web's manual tap-vs-drag threshold logic wasn't reimplemented since `Swipeable`'s built-in tap gesture already auto-enables/closes based on open state; (2) both SVG charts (`analytics/AnnualChart.tsx`'s bar+line chart, `analytics/AnalyticsTab.tsx`'s `IntentDonut`) ported as plain `react-native-svg`, no new charting library — the donut reuses the exact multi-arc-via-stroked-circles technique already proven in Health's `FinancialHealthCard`, confirming that technique generalizes to a second ring visualization. **Two more capability gaps built now, not dropped:** receipt photo capture (web: `<input type="file">` + canvas-downscale; RN: a new mobile-only `apps/mobile/src/lib/receiptImage.ts`, not a `.native.ts` sibling since the input type differs fundamentally from a browser `File` — wraps two new native deps, `expo-image-picker` + `expo-image-manipulator`, into `captureReceiptPhoto()`/`pickReceiptPhoto()`, returning the same downscaled JPEG data-URL shape web stores) and CSV/ZIP export (`core/export/exportCsv.native.ts`, a new sibling using `expo-file-system`'s `File`/`Paths` API + `expo-sharing`, same share-sheet pattern as Home's Stories flow, with `Uint8ArrayWriter` instead of `BlobWriter` for the AES-256 ZIP since RN's `Blob` shim doesn't support everything `@zip.js/zip.js` needs internally; `expo-file-system`/`expo-sharing` added as direct `packages/core` dependencies, following the `expo-sqlite` precedent from Track 2). **`EventModeContext` (vacation/trip mode) ported as a real prerequisite, not dropped** — unlike every other module's droppable Groups dependency, event tagging is threaded through filtering/analytics/the header banner, so dropping it wasn't a clean option (`apps/mobile/src/context/EventModeContext.tsx`, AsyncStorage-backed, wired into `App.tsx`). `GroupContext` itself is still dropped everywhere it appears: `ShareToGroupModal.tsx` skipped entirely (not ported at all); `shareGroups`/`onShareToGroup`/`onShareLater`/the Share swipe action removed from `ExpenseForm.tsx`/`TransactionsTab.tsx`/`TransactionsSlice.tsx`; `familyGroupIds` removed outright from `useExpenseAnalytics.ts`'s args (the whole classification branch was dead code without it); `EventsModal.tsx`'s entitlement-gated vacation→group-link sub-section dropped along with its now-unused imports. `IconGridPicker.tsx`'s ~620KB icon-search index (`tablerIconIndex.json`, fetched at runtime on web via `import.meta.env.BASE_URL`) is bundled as a static JSON import on mobile instead — no runtime fetch, and the entire fetch/cache/loading-state machinery web needed became unnecessary. A second hand-rolled `fixed inset-0` modal found (`AnalyticsTab.tsx`'s own local `MonthPickerModal`, distinct from the already-`Modal`-based one in `transactions/`) rebuilt on the real ported `Modal`. A real cross-file bug caught by a different section's porting agent (same pattern as Portfolio's Precious-Metals-catches-Equity's-bug): `CategoryPickerModal`'s sticky bulk-action bar (web: `sticky bottom-0`) has no RN sticky-within-`ScrollView` primitive — solved by moving the buttons into the ported `Modal`'s `footer` prop, which already renders outside the `ScrollView` and stays pinned. **A real shared-component bug found during on-device verification, not Expenses-specific:** `apps/mobile/src/components/ui/TabStrip.tsx`'s `scrollable` mode wrapped its tab row in a bare `<ScrollView horizontal>` with no `flexGrow: 0` — an unconstrained horizontal `ScrollView` as a flex child in a column layout stretches to fill all remaining vertical space, pushing its content down to vertically center inside the oversized box (surfaced as a blank gap between `ExpensesPage`'s header and tab strip). Fixed with `style={{ flexGrow: 0 }}` — benefits every other `TabStrip` consumer, not just Expenses.

**Track C (identity/auth) prerequisite, done ahead of Groups:** unlike every module surveyed before it (IOU, Home, Portfolio, Expenses), Groups' feature UI (`apps/web-react/src/context/GroupContext.tsx` + `apps/web-react/src/features/groups/`, ~1,573 lines — the smallest Track-4-sized scope so far) is gated behind a _hard, server-verified_ claimed identity with no local-only stand-in: `GroupContext`'s `claimed = Boolean(profile?.deviceId && username)` only becomes true after a real `claimAccount()` round-trip against the live `penny-auth` Cloudflare Worker. Rather than port Groups' UI first (which would render but be unable to create/join/sync/settle-up anything), ported the real Track C client chain: `core/identity/claim.ts` (`claimAccount`/`reclaimAccount`/`checkUsername`/`getClaimState`), `core/identity/signedFetch.ts`, `core/crypto/identityKeys.ts` (device signing/wrapping P-256 keypairs), all reused **completely unmodified** on RN — confirmed via a crypto smoke-test screen (`apps/mobile/src/screens/CryptoSmokeTestScreen.tsx`, kept as a reference tool) that `react-native-quick-crypto`'s ECDSA/ECDH/Ed25519 (including `recovery.ts`'s manually-constructed-PKCS#8 trick) all work correctly on-device, and that the ECDSA signature format is exactly 64 bytes (raw IEEE P1363, matching the worker's `crypto.subtle.verify` expectation — a DER/raw mismatch would have silently broken every signed request). Device-key storage needed no new work at all — it already rides the same `expo-sqlite`-backed `EncryptedRepository` every other table uses. Three real gaps found and fixed: (1) `entitlement.native.ts` (new — see the updated "Known seam" note below) reading `Constants.expoConfig?.extra?.enableSync` via a new `expo-constants` dependency (added to both `apps/mobile` and `packages/core`, following the `expo-sqlite`-in-`packages/core` precedent from Track 2); (2) `apiBase.native.ts`'s `AUTH_BASE`/`GROUPS_BASE` (previously hardcoded `null`) now read the real deployed worker URLs (`https://penny-auth.hesh.workers.dev`, `https://penny-groups.hesh.workers.dev`) from `app.json`'s `extra` field — the same non-secret public URLs already committed in `apps/web-react/.env.production`; (3) `claim.ts`'s one `window.dispatchEvent`-based notification (`PROFILE_UPDATED_EVENT`) was extracted into a new tiny platform-split module, `core/identity/profileChangeBus.ts`/`.native.ts` (native: in-memory listener `Set`, same pattern as `useDataRefresh.native.ts`), rather than duplicating all of `claim.ts`'s security-critical logic into a `.native.ts` sibling just to swap one internal primitive — `claim.ts` itself is otherwise byte-for-byte unchanged. **Verified end-to-end on-device against the live worker** via a second scratch tool (`apps/mobile/src/screens/ClaimSmokeTestScreen.tsx`, also kept as a reference tool): `checkUsername` → real availability check; `claimAccount` → real `userId` from the worker; `signedFetch('/whoami')` → `200` confirming the full challenge→sign→verify loop. As a side effect of finally calling `securityManager.initialize()` on a real device for the first time in this whole migration, this also proves real DMK-based `EncryptedRepository` encrypt/decrypt genuinely works on-device (every prior module hit "Session locked" before ever exercising it) — see the plan's Track C progress-log entry for a debugging false-alarm worth knowing about (a "Cipher.final failed" error that turned out to be a self-inflicted double-tap test artifact, not a real crypto bug).

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

**Chrome consolidation, two passes (2026-07-31 + 2026-08-01):** `MainTabs.tsx`'s persistent header
went from a hamburger-as-Settings-shortcut + logo + eye + bell row, plus a separate full-width
`ContextSwitcher` bar, down to one row: `HeaderAvatar` (profile-initial circle, itself the Settings
entry point) on the left of every tab root, `PrivacyModeSwitcher` + `RemindersBell` always on the
right, a center slot showing either the current tab's title or — Home only — `ContextSwitcher`
rendered `variant="inline"` (no background/border/shadow, sized for the header). The Penny Blue
theme and ambient privacy-mode screen-tinting were dropped in the same pass (2026-07-31; see
`ThemeProvider.tsx`/`privacyModeColors.ts`).

The second pass (2026-08-01) went further: every pushed screen inside `HomeStack`/`ExpensesStack`
used to render its _own_ title + back button too (via `PageHeader`'s `title`/`leading`, or a
hand-rolled equivalent in `CashFlowPage.tsx`/`NewsView.tsx`/`CalculatorsPage.tsx`'s detail view) —
a second header row stacked directly below `MainTabs`' own. That row is gone; `MainTabs`' header is
now the _only_ title/back-button any screen renders. Two problems this created, both solved by a
new file, `apps/mobile/src/navigation/HeaderBackContext.tsx`:

1. **Which back, and which stack.** `MainTabs` sits _above_ `Tab.Navigator` as a sibling of
   `HomeStack`/`ExpensesStack` — its own `navigation.goBack()` would pop `MainTabs` itself, not the
   nested stack screen actually on top. Only a pushed screen's _own_ `useNavigation()` reliably
   pops that screen, so the back action has to originate from inside the screen. `HeaderBackContext`
   exports a `HeaderBackProvider` (wraps `MainTabs`' whole subtree) plus `useRegisterHeaderBack`
   (a screen registers its back handler while focused, via `useFocusEffect`, clearing it on
   blur/unmount) and `useDefaultHeaderBack` (the common case — just `navigation.goBack()`).
   `MainTabs`' `HeaderBackChevron` calls whatever's currently registered.
2. **Non-default back behavior.** A few screens don't just want to leave — `ImportPage` steps back
   one wizard stage (`imp.setStep(target)`) before falling through to a real `goBack()`;
   `CalculatorsPage`'s detail view returns to its own list first; `ChangePinPage` registers no
   handler at all during a forced PIN reset (mirroring `MainTabs`' `pinResetForced` gate, which
   already hides the header's whole left slot then). Each of these calls
   `useRegisterHeaderBack` directly with its own custom handler instead of the default hook.

`PageHeader.tsx` lost its `title`/`leading` props entirely — it's now only for what's genuinely
screen-specific (a `subtitle` line, right-aligned `actions`, or free-form `children`), and several
screens (Settings, Loans, Manage Tags, Safe Mode, Change PIN, Change Passphrase, Backup & Restore,
Edit Profile) no longer render it at all, having had nothing but a title to show. The header's
background also changed from a distinct `modeColors.headerBg` (with a 2px accent border underneath)
to the same `modeColors.bg` every screen's own content sits on — no border, no seam — so the header
reads as part of the screen rather than a fixed bar drawn on top of it (the tab bar below keeps its
accent border; only the top header changed).

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
  hand-rolled DOM dropdown was originally rebuilt on the shared `Modal` (same fix pattern as every prior
  hand-rolled-overlay case), then removed entirely in the 2026-08-01 density pass in favor of one
  combined Filters modal — see that entry above.
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

**Import update (2026-07-28):** the "mirrors 1:1" description above no longer holds for Import —
`apps/web-react`'s pipeline was rewritten around a generic column-matching engine, per-distinct-value
category/account resolution, and a partial-success-tolerant writer (see `docs/features/expenses.md`'s
import section for the full detail). `apps/mobile`'s copy still runs the original pipeline unchanged and
still works — `packages/core/src/core/import/importPipeline.ts` deliberately keeps a small legacy
section (`matchCategory`/`buildPreviewRows`) alongside the new resolution-based one specifically so
mobile's existing hook keeps compiling. Porting mobile to the new flow is a separate, later pass.

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
renders children inside an _inner_ scrollable content view, distinct from the _outer_ frame the padding
attaches to — so the back button ended up offset ~40px from the true corner. Fixed by moving
`<OnboardingBack />` outside the `ScrollView` (a sibling inside `SafeAreaView`, which has no padding)
across all 11 onboarding screens that use it. `SimulatedDashboardScreen` ("Here's a preview") additionally
got a one-off redesign per user feedback: it's the only one of the 11 with no hero icon above the title,
so the floating corner arrow looked like a mistake with nothing to anchor it — it now uses a local inline
back arrow + centered title in the same row instead of the shared component.

**Known seam surfaced during Track 0 (flagged then, fixed for mobile during Home/Track 4/Track C/RN-web):** `packages/core/src/core/entitlement/entitlement.ts`, `core/net/apiBase.ts`, and `core/sync/providers/googleDriveProvider.ts` read `import.meta.env.VITE_*` directly — a Vite-ism with no Metro/RN equivalent. All three now have both a `.native.ts` (iOS/Android, Track C/Backup) and a `.web.ts` (RN-web, this pass) sibling — `core/net/apiBase.ts`'s finance-data bases reproduce the existing "no backend configured" fallback on both, while `AUTH_BASE`/`GROUPS_BASE` read real worker URLs from `expo-constants` on both. `googleDriveProvider.ts`'s `.native.ts`/`.web.ts` both return `isCloudBackupConfigured() === false` (no native/RN-web Google Sign-In flow built yet), same "dormant until built" shape as `icloudProvider.ts`'s own precedent, so every other provider method stays unreachable in practice rather than needing individual porting.

**Also surfaced:** `packages/core/src/core/advisor/guidance.ts` used to import `PATHS` from the web router to build "navigate to X" recommendation actions — a real core→app coupling. Fixed during Track 0 (not deferred, since it was a one-line-risk mechanical change): `guidance.ts` now returns a semantic `AppRouteKey` (`'goals' | 'insurance' | ...`), and the one caller (`FinancialHealthCard.tsx`) maps that key to an actual `PATHS` value via a small local lookup. Behavior is unchanged; `packages/core` no longer imports anything router-specific.

**Bank Statement Import (new feature, `apps/mobile` only, 2026-08-02):** full spec in
`docs/plans/bank-statement-import.md`. A deliberately separate module from the multi-app CSV
importer, per an explicit user decision that bank-statement parsing and other-apps'-export parsing
must be able to evolve independently: `packages/core/src/core/bank-import/` (CSV
tokenizer/parser tolerant of Indian bank date formats, 7 named bank presets + a Custom fallback,
a keyword-stripping merchant-normalization heuristic with a user-overridable escape hatch, a
one-shot ±3-day matching engine with strict 1:1 pairing and a description-similarity tie-break,
merchant-memory lookup, and a payment-mode keyword inferrer) and `apps/mobile/src/features/bank-import/`
(a single `useBankImport.ts` hook owning a `setup → review → done` step machine — `setup` merges
bank selection/upload/mapping review into one screen, see the 2026-08-03 entry below — mirroring
`features/import/useImport.ts`'s overall shape but never importing from it). Nothing
writes to the real vault until one final commit (stage-then-single-write model): every resolution
during review — a confirmed/reassigned match, a bulk-categorized merchant group, an individually
recorded new transaction, a lone-wolf deletion — only mutates the hook's own in-memory state.
Reviewed and fixed post-first-pass: the review screen initially had no scroll container (a real
statement runs 100–300+ lines, most of which are expanded-by-default buckets); a transaction bumped
by the "trust the user, reassign" cascade (or freed up by dismissing a possible-match as new)
initially vanished from the review entirely instead of resurfacing as a lone wolf — fixed by
extracting `matcher.ts`'s lone-wolf filter into an exported `deriveLoneWolves()` the hook now calls
reactively off live staged state, not the one-shot pass's frozen result.

**Bank Statement Import, 2026-08-05 additions:** `core/bank-import/matcher.ts` gained
`suggestPossibleTransfer()` — a softer, amount/date-only cross-account heuristic (never touches
narration) for flagging a statement row that might be the unlinked other leg of a transfer already
recorded on a different account; only ever a dismissible suggestion, never an auto-classification
(see the function's own doc comment for why). **2026-08-09 fix:** accepting that suggestion (or its
ambiguous-tie sibling, `suggestAmbiguousTransferCandidates()`) now absorbs the existing candidate
expense in place via a new `convertCandidateToTransfer()` (`matcher.ts`) /
`linkAsCrossAccountTransfer()` (`useBankImport.ts`) pair, instead of building a brand-new record
alongside it — a real on-device bug found two records both debiting the source account for the same
real-world transfer; see `docs/plans/bank-balance-sync.md`'s dated write-up. `core/bank-import/xlsxParser.ts` is a new file — Excel
(.xlsx/.xls) import support, built on the `xlsx`/SheetJS library (already a `packages/core`
dependency, previously unused), converting a workbook's first sheet into the same `string[][]` grid
shape `csvParser.ts`'s `tokenizeCsv()` produces so the entire downstream review pipeline stays
format-agnostic. Full detail on both, plus the same-day `ExpenseForm` credit-row transfer-direction
fix and `BulkCategorizeModal`'s cash-only→any-account generalization, in
[`docs/features/bank-import.md`](features/bank-import.md).

**Bank balance sync, Stages 0–4 (2026-08-08/09, design in
[`docs/plans/bank-balance-sync.md`](../plans/bank-balance-sync.md)):** turns a bank statement's own
balance column into a permanent, per-transaction checkpoint (`Expense.statementBalance`, `bank`-type
accounts only — credit cards' inverted sign convention is out of scope) instead of `balanceCheck.ts`'s
one-shot end-of-import nudge. New file `core/bank-import/checkpoint.ts` (`attachCheckpoint()`/
`reconcileMatchedExpense()` — the latter also corrects a matched pair's date/amount to the statement's
own value on commit). `matcher.ts` gained two-tier matching: an exact prior-import lookup
(`findProvenanceMatch()`) always runs before the existing fuzzy pass, and any already-checkpointed
expense is excluded from fuzzy candidacy for any _other_ import, so a later statement's coincidentally
same-amount row can never be silently absorbed into an already-reconciled transaction. New file
`core/bank-import/coverage.ts` (`detectCoverageGap()`/`countSkippedRows()`) plus a new `Account` field,
`coveredStatementRanges: ImportBatchSummary[]`, populated on every completed import (any
statement-importable account type, not just `bank` — batch history is a separate concern from the
bank-only checkpoint guarantee) — powers a gap-detection banner in `SetupStep.tsx`, a skipped-row
breakdown on `DoneStep.tsx`'s commit confirmation, and a new screen,
`apps/mobile/src/features/bank-import/BankImportHistoryPage.tsx` (registered in `HomeStack.tsx`,
reachable from a new `AccountsPage.tsx` header icon), listing past import batches with a per-batch
detail drill-in. `matcher.ts`'s `LoneWolf` also gained a `status: 'provisional' | 'escalated'` field —
a lone wolf near a statement's own date-range boundary defers to "provisional" until an adjacent
already-completed import's own coverage has also failed to explain it, rather than flagging
immediately. **Stage 3** (opening-balance anchor): new file `core/bank-import/openingBalanceAnchor.ts`
(`isFirstEverImport`/`isAnchorShiftImport`/`currentAnchorDate`/`deriveOpeningBalanceSuggestion`/
`computeAnchorShiftCheck`, all pure, reusing `balanceCalculator.ts`'s `delta()`), two new `Account`
fields (`openingBalanceAsOfDate`, `anchorReference` — renamed 2026-08-09, see below), and a new `apps/mobile/src/features/
bank-import/OpeningBalancePrompt.tsx` rendered by `SetupStep.tsx` in place of "Continue to review"
whenever the trigger fires. **Stage 4** (checkpoint-diff diagnostics UI + the unified "unverified
account" badge): two new pure core modules — `core/bank-import/checkpointDiagnostics.ts`
(`computeCheckpointDiagnostics()`, walks an account's own transactions chronologically comparing
Penny's derived balance against every `statementBalance` checkpoint, day-bucketed per §7e, classifying
a mismatch as `'steps-partway'` vs `'flat-from-start'`) and `core/bank-import/accountVerification.ts`
(`computeAccountVerificationStatus()`, unifying that mismatch with Stage 2's `findStandingCoverageGaps()`
and Stage 3's anchor-shift disagreement into ONE `activeFinding`, priority-ordered, never three competing
indicators) — plus a new `Account.dismissedVerificationFindings` field for per-finding-fingerprint
dismiss/re-open. **Redesigned 2026-08-09**: `Account.anchorDisagreement` (a frozen, once-computed
snapshot) renamed to `Account.anchorReference` (only the immutable `{oldOpeningBalance, oldAnchorDate,
detectedAt}` fact) — the comparison against it is now always recomputed LIVE
(`openingBalanceAnchor.ts`'s `recomputeAnchorAgreement()`), fixing an on-device bug where a later
corrective import that actually fixed the ledger left a stale disagreement showing forever. The same
fix also closes a related write-path bug: every §14b choice (not just "Accept") now always moves the
anchor DATE to the new, earlier date at commit time (`useBankImport.ts`), with only the anchor VALUE
differing by choice (`openingBalanceAnchor.ts`'s `backDerivedOpeningBalance()` for "Keep"/"Review rows
first") — previously, "Keep"/"Review" left the date pinned at the OLD, later date while committing
transactions dated before it, silently double-counting the whole backfilled period on top of the kept
balance. `CheckpointTimelinePage.tsx` also gained an `AnchorBoundaryDivider` row (mockup
`bank-balance-sync-v3.html`'s "#optiond") extending the existing single reconciliation timeline through
the anchor boundary, and a shared `useOpeningBalanceResolution.ts` hook (update/dismiss actions, reused
by `CheckOpeningBalancePage.tsx` and the new divider). New `apps/mobile/src/features/accounts/` files: `useAccountVerification.ts` (the
`CHECKPOINT_ELIGIBLE` gate + the per-account status map + dismiss/reopen actions),
`AccountVerificationBanner.tsx` + `verificationCopy.ts` (the account-detail snapshot banner, all 6
mockup states), `AccountDetailModal.tsx` (wraps `EntityTransactionsModal` with the banner + drill-in
state), `CheckpointTimelinePage.tsx` and `CheckOpeningBalancePage.tsx` (two new screens, registered in
`HomeStack.tsx`). `EntityTransactionsModal.tsx` gained two new generic `banner`/`footer` slots
(`undefined` everywhere else) and `TransactionsTab.tsx` gained an optional `checkpointHighlight` prop
(marks + a scroll-to target via `FlashList`'s `scrollToItem` ref API) — both omitted, so zero behavior
change, for every other existing caller of either component. Full behavior/limitations writeup in
[`docs/features/bank-import.md`](features/bank-import.md)'s "Balance sync" section.

**Full Ledger (2026-08-10, `docs/plans/bank-reconciliation-ledger.md`) — a deeper zoom on the same
reconciliation feature family, not a new one.** `CheckpointTimelinePage.tsx` gained a "View full ledger
›" action (shown only in its all-clear state) into a new `apps/mobile/src/features/accounts/
FullLedgerPage.tsx` (registered in `HomeStack.tsx`): a dense, row-by-row Statement ⟷ Expense
reconciliation for a bounded, continuously-growing date window. Core: `core/bank-import/ledger.ts`
(`buildLedgerRows` — classifies every row as matched/skipped-unresolved/anomaly/not-covered, reusing
`findStandingCoverageGaps()` and `normalizeNarration()` rather than new logic) and `core/bank-import/
ledgerActions.ts` (Phase 2: pure relink/unmatch/resolve-to-existing functions, reusing
`reconcileMatchedExpense()` verbatim). **Required a real architecture fix**: Phase 2's relink/resolve
actions needed the exact same "choose the match" picker `features/bank-import/`'s own bucket 1/2
already use — `PossibleMatchPickerModal.tsx` moved from `features/bank-import/` to
`apps/mobile/src/components/shared/` (added to that folder's barrel) so both feature modules could use
it without a feature-to-feature import, the same reasoning `ExpenseForm.tsx`'s own earlier relocation
documents above. `FullLedgerPage.tsx`'s new "Add as a new transaction" action (for a skipped row)
renders `ExpenseForm` directly with its own locally-sourced `categories`/`hashtags`/`saveAccount` —
mirrors the account-creation snippet `useBankImport.ts`'s `saveAccountForForm` already uses, plus a
`notifyAccountsChanged()` broadcast that one doesn't need (bank-import's own bucket screens read
`bi.accounts` directly, not `useRepository`). All four Phase 2 mutations (relink/unmatch/resolve/add-
new) call `logActivity()` directly (a core function, not `useExpenses.ts`'s own logging) so they still
show up in the activity feed. Known, accepted simplification: none of the four route through
`useExpenses.ts`'s `saveExpenseWithHashtags` (a `features/expenses/`-scoped hook, off-limits to
`features/accounts/`), so they don't update hashtag usage counts or merchant-memory suggestions the way
adding/editing an expense from the Expenses tab does — the expense itself, its activity/balance
visibility, and its statement link are all still fully correct.

**Payment mode made a real creatable entity (2026-08-02):** previously `Expense.paymentMode` drew
from a hardcoded 5-value list (`components/shared/paymentModes.ts`) with no way to add to it. Bank
Statement Import needed this — bank narrations carry rail keywords (NEFT/IMPS/RTGS/Cheque) that
aren't among the 5 defaults, and the plan calls for creating each one exactly once per import
batch. New encrypted `payment_modes` store (Dexie v11) holds only custom/created modes; the 5
built-ins (`core/expenses/paymentModes.ts`'s `DEFAULT_PAYMENT_MODES`) are never persisted as rows —
the full selectable set is always defaults merged with the store's contents (`mergePaymentModes`).
`PaymentModeChips.tsx` now reads live from `paymentModesRepo` instead of a static import, so any
mode created via bank import shows up as a normal chip in the regular Add Expense form afterward
too, and accepts an optional `pendingCandidate` prop so a not-yet-created inferred mode still
displays its real label/icon/color before the batch that would create it actually commits.

**Manual payment-mode creation (2026-08-03):** `PaymentModeChips.tsx` gained a dashed "+" tile
(same pattern as `AccountChips.tsx`'s inline "+ Add account"), opening a new
`PaymentModeFormModal.tsx` (name, icon, colour) that writes to the same `payment_modes` store —
the user-initiated equivalent of what Bank Statement Import already does automatically.
`core/expenses/paymentModes.ts`'s new `generatePaymentModeId()` slugifies the name into a stable,
deterministic id (deduped against whatever already exists), so a manually-created mode's id has the
same shape as an inferred one. `IconGridPicker.tsx` (previously `features/expenses/categories/`-
only, used by `CategoryEditorModal`) moved to `components/shared/` so both this new form and
category editing can use it without a cross-feature import.

**Payment modes made real rows + editable + Accounts-screen management, and the bank-import setup
screens merged (2026-08-03, per explicit user feedback):** two follow-ups landed together.

1. The 5 built-ins are no longer a read-time-only overlay (`mergePaymentModes`, now removed) — they're
   seeded as real `payment_modes` rows once (`~/hooks/usePaymentModes.ts`, mirroring how
   `expense_categories`' own defaults are seeded via `useExpenses.ts`'s additive-seeding effect). Real
   rows from the start is what makes a default's icon/colour/label actually editable, the same way a
   default `ExpenseCategory` already is. `PaymentMode` gained `isDefault: boolean` (mirrors
   `ExpenseCategory.isDefault`): editable, never deletable; a custom mode is both, but delete is
   blocked while any transaction still uses it. `PaymentModeFormModal.tsx` gained `editing`/`onDelete`/
   `usageCount` props for this. New `features/accounts/PaymentModesSection.tsx` lists every mode on the
   Accounts page as an icon tile with a small pencil badge (tap to edit) plus a trailing "+" tile (tap
   to add) — the manage-everything surface, distinct from `PaymentModeChips`' quick-select-plus-create
   role inside the Add-transaction form. `generatePaymentModeId()` no longer needs the merge step
   either — `existing` is always the real, full list now.
2. Bank Statement Import's `PresetStep.tsx`/`UploadStep.tsx`/`MappingStep.tsx` (3 separate wizard
   steps) were deleted and replaced by one `SetupStep.tsx`: a bank **dropdown** (not a tile grid — the
   preset list can grow) that reveals the upload dropzone once a bank is picked, which in turn reveals
   an inline column-mapping review card (Date/Narration/Debit/Credit/Balance → the file's real headers,
   table-style) once a file is uploaded, with one "Edit mapping" action opening a single popup
   (`MappingEditModal.tsx`) with every field editable together (the user's explicit preference over a
   per-field pencil icon). `useBankImport.ts`'s step type collapsed from `'bank'|'upload'|'mapping'|
'review'|'done'` to `'setup'|'review'|'done'` — `selectPreset()`/`importFromText()` no longer change
   step at all, they just reveal more of the same screen.

**Bulk-categorize mirrors the real expense form; hashtag/IOU bookkeeping added to bank-import
(2026-08-03, per explicit feedback that "Not yet logged"'s category field and the bulk-categorize
modal should reuse real app UI, not a plain dropdown):**

1. `UnmatchedBucket.tsx`'s "Categorize N selected" flow (`BulkCategorizeModal.tsx`) swapped its plain
   `SelectInput` category field for the real `CategoryPickerModal` (select-only, `manager` omitted) —
   another cross-feature import (`features/bank-import/` → `features/expenses/categories/`), the same
   already-established, deliberate exception noted above (§`ExpenseForm.tsx` relocation).
   `pickerType`/direction-majority logic mirrors `features/import/review/CategoryTile.tsx`'s own
   approach for the same problem.
2. Its Tags field grew the same frequent-tags/startsWith-suggestions/inline-Set-Aside UI as
   `ExpenseForm.tsx`'s own Tags panel (new `hashtags: Hashtag[]` prop), and it gained a new,
   bulk-shared Lent/Borrowed panel (new optional `iouPersons?: Person[]` prop) — one person name
   applied to every checked occurrence, kind (lent/borrowed) derived from the group's own
   majority direction, never stored separately.
3. **Hashtag usage-count bookkeeping and IOU ledger-entry creation now happen at all** for bank-import
   staged transactions — a real, previously-silent gap: `commitAndImport()` wrote `Expense.hashtags`
   directly but never created/updated the corresponding `Hashtag` rows (no usage count, invisible to
   Manage Tags/Frequent), and there was no IOU path at all. Fixed once, generically, in
   `commitAndImport()`'s existing `stagedNewTxns` loop (applies to every staged new txn regardless of
   which flow created it — bulk or the single-row statementPreset `ExpenseForm`), resolved against a
   fresh `hashtagsRepo`/`personsRepo` read + a local cache so N occurrences of the same new tag/person
   in one batch resolve to exactly one row, mirroring the existing per-batch payment-mode
   resolve-once pattern. `StagedNewTxn` gained optional `newTagSetAside`/`iouPersonName` fields to
   carry this through from staging to commit. `stageNewTxnFromForm()` and `PossibleBucket.tsx`'s
   "add as new" `onSave` now also thread `ExpenseForm`'s own `newTagSetAside` save argument, previously
   silently dropped.
4. The two bottom informational notes ("payment mode is guessed per line…", "applies to N checked
   transactions…") moved to the top as one `Banner variant="info"` card, replacing plain
   `text-tertiary` lines below the fold.
5. **Follow-up (same day):** the Tags and Lent/Borrowed panels were always-visible/manually-toggled
   respectively — didn't match `ExpenseForm`'s icon-toggle affordance. `ExtraCircle` (the circular
   icon-button-with-caption used for Tags/Receipt/Goal/Lent/Repeat) was extracted from
   `ExpenseForm.tsx` into its own `components/shared/ExtraCircle.tsx` (no behavior change, pure
   relocation) so `BulkCategorizeModal.tsx` could reuse the exact same component instead of a
   lookalike custom toggle row. Both panels are now hidden by default and revealed by tapping their
   `ExtraCircle` (Tags: `ti-hash`; Lent/Borrowed: `ti-users`, label/color following the group's own
   expense-or-income direction) — active state lights up once the panel is open or already has a
   value, same rule `ExpenseForm` uses. Also: the Description field now defaults to a generalized,
   still-fully-editable guess (`prettifyMerchantKey()`, new in `core/bank-import/normalization.ts`)
   derived from the merchant's own normalized key when no `MerchantSuggestion` exists yet (first time
   seeing that merchant) — short (≤3-letter) tokens are kept upper-case (acronyms/suffixes like ACH/
   TCS/LTD are common in Indian bank narrations), longer ones are title-cased.
6. **Follow-up (same day): normalization heuristic tuned against 7 real sample bank statements** (one
   per supported preset). Running every distinct narration through `normalizeNarration()` surfaced 3
   rail/direction-indicator keywords leaking into the merchant key as noise, now added to
   `CONNECTOR_KEYWORDS`: `ACH` (dividend/mutual-fund-redemption credits — same treatment as the
   already-stripped NEFT/IMPS/RTGS), `INW` (IMPS inward-transfer indicator), `REV` (reversal
   indicator, e.g. a UPI refund). `OUT` was added proactively as `INW`'s natural counterpart, though
   not directly evidenced in the samples. `paymentModeInference.ts` also gained its own `ach` rail
   (previously fell through to the generic "Net" fallback), mirroring NEFT/IMPS/RTGS.
   **Deliberately NOT changed**: `SENT TO X` / `RECEIVED FROM X` narrations still normalize to two
   different keys per person (`SENT <NAME>` / `RECEIVED <NAME>`) rather than merging to one — raised
   as an explicit question, user confirmed keep-separate: bulk-categorize's Lent/Borrowed panel
   depends on that direction split (a "sent" group gets marked lent, a "received" group gets marked
   borrowed) — merging would force one shared category across both directions for the same person.
7. **Follow-up (same day): normalization visibility + settle-up decision + new categories**, after a
   thorough discussion (external research against Cashew/Splitwise for settle-up precedent) before any
   code:
   - `BankImportOverridesPage.tsx` ("Merchant recognition") gained a read-only collapsible "How
     automatic recognition works" card, listing the fixed heuristic in plain English plus the actual
     current keyword list (`CONNECTOR_KEYWORDS_LIST`, new export from `normalization.ts`) — the screen
     previously only ever showed the user's own editable overrides, never the underlying algorithm.
   - **Settle-up/repayment linking deliberately not built** — Cashew and Splitwise were both
     researched and neither cleanly solves "one transaction represents two ledger effects" (e.g.
     ₹22,000 in = ₹2,000 collecting an old debt + ₹20,000 a new loan); explicit user call: log the
     transaction exactly as the statement shows it (income → `borrowed`, expense → `lent`, unchanged
     from today) and let the free-text Description carry the nuance instead. A standing invariant was
     written down as a result: **one statement line always produces exactly one app transaction** —
     any future feature must preserve this (a ledger-only remainder must be a `LedgerEntry` with no
     `linkedTxnId`, never a second `Expense`/`Income` record).
   - Three new default categories, additive-seeded via `useExpenses.ts`'s new v8 seeding effect
     (`penny_cats_v8`): `cat-food-drinks` ("Food & Drinks", Daily Living — added despite overlapping
     Groceries/Dining & Café, per explicit user request), `cat-lending` ("Lending", Family & Giving,
     expense), `cat-inc-borrowed` ("Borrowed Money", Income). ~~Both IOU categories are free choice,
     not auto-locked to the Lent/Borrowed panel~~ — **superseded 2026-08-06, see below**: picking either
     now auto-opens and locks the panel, person mandatory. `categoryTaxMap.ts` gained `cat-food-drinks`
     (`gst-5`) and `cat-lending` (`exempt`, also added to `SPEND_EXCLUDED` — lending isn't consumption);
     income categories were already outside this map (indirect tax only applies to spend).
   - **Two more IOU categories + a reversed decision (2026-08-06), additive-seeded via `useExpenses.ts`'s
     new v10 seeding effect (`penny_cats_v10`):** `cat-collected-money` ("Collected Money", Income — the
     reverse of Lending: someone paying back what you lent them) and `cat-return-borrowed` ("Return
     Borrowed", Family & Giving, expense — the reverse of Borrowed Money: you paying back what you
     borrowed). Explicit user decision this time reverses v8's "free choice, not auto-locked" call
     above for **all four** Lending/Borrowed-Money/Collected-Money/Return-Borrowed categories: picking
     any of them in `ExpenseForm.tsx` (including bank-import's single-row flow) or bank-import's
     `BulkCategorizeModal` now auto-opens _and locks open_ the Lent/Borrowed panel (`IOU_MANDATORY_CATEGORY_IDS`
     in `core/db/defaultCategories.ts`; `ExtraCircle` gained a `disabled` prop for the lock), and
     Save/Apply is blocked until a person is entered. Also: settling an IOU (`IouView.tsx`'s "Settle"
     button) now defaults its linked transaction to `cat-collected-money`/`cat-return-borrowed` instead
     of the generic Other/Other Income fallback (`reconcileLinkedTxn`'s new `defaultCategoryId` override
     on `LinkedTxnIntent`, passed only by the settle call site — the original manual lent/borrowed
     entry's own linked transaction is unchanged, still generic Other/Other Income). **Real mistake
     found the same day:** the first version shipped with invented icon names
     (`ti-wallet-plus`/`ti-wallet-minus`) that don't exist in the actual bundled Tabler set — corrected
     to `ti-receipt-refund`/`ti-cash-minus`, both verified directly against `tablerIconIndex.json`. A
     device that had already run the v10 seed against the wrong values before the fix landed wouldn't
     pick up the correction on its own (the `penny_cats_v10` flag blocks re-seeding, and seeding only
     ever inserts _missing_ rows, never patches existing ones) — a separate, unconditional one-time
     effect directly patches these two ids' `icon` field if it doesn't match the corrected value.

**Retirement Corpus — Home hero redesign (2026-08-03, `apps/mobile` only, `apps/web-react` untouched/frozen):**
replaced Home's Net worth/Safe-to-spend two-column hero (plus the colored asset-proportion bar and the
Assets/Liabilities summary line) with a single fused, borderless hero unit: Net worth's label/number/"View
breakdown" now sit directly over a new full-bleed `RetirementCorpusChart` (violet area/line chart, plotting
**investable corpus** — a deliberately smaller figure than net worth, excluding vehicle/property/other —
projected forward to a fixed retirement year), with a "% funded" gauge + Needed/Projected/Monthly SIP stat
rows (`RetirementFundedSummary`) below it, not overlapping. Tapping the net-worth text (a nested
`Pressable` — RN's responder system gives the innermost `Pressable` the touch, no explicit
stopPropagation needed) opens the existing net-worth breakdown `Modal` unchanged; tapping anywhere else
opens `RetirementDrilldownModal`, a **centered** `Modal` (never a bottom sheet, per
`docs/DESIGN_GUIDELINES.md`) for editing the shared plan's monthly-expense/retirement-age inputs.
Safe-to-spend was dropped from Home entirely (it already lives on Cash Flow). New core layer:
`core/calculators/retirementProjection.ts` (`calcRetirementProjection()` — a fixed-target-year sibling to
`fire.ts`'s `calcFire()`, plus `calcInvestableCorpus()`), a new `retirement_plan` (singleton, shared by
Home and the FIRE Calculator — editing either updates both, see `useRetirementPlan.ts`) and
`net_worth_snapshots` (one row per calendar month, never backfilled synthetically) Dexie/op-sqlite store
pair (schema v12), and two mobile-only shared hooks (`useInvestableCorpus.ts`/`useTrailingLivingSpend.ts`)
extracted specifically so `features/home` and `features/calculators` — which may not cross-import each
other — can compute the same investable-corpus/trailing-spend figures via shared
`core/accounts/balanceCalculator.ts`/`core/expenses/monthlySpend.ts` pure functions instead of duplicating
that math. Full writeup: `docs/features/home.md`.

**Error boundary + "app must never hard-crash" (2026-08-13) — new `apps/mobile/src/components/shared/
ErrorBoundary.tsx`**, a class component (`getDerivedStateFromError`/`componentDidCatch`) rendering a
themed fallback banner + "Try again" reset instead of letting a render-time exception take down the
whole app. Mounted once at `App.tsx`'s root (every screen covered) and again scoped to
`features/import/ImportPage.tsx` around its review step specifically (a bad/unusual imported file being
the single likeliest place for a rendering surprise; its own reset steps back to the Upload step rather
than just re-rendering the same still-broken data). Added after a real on-device crash whose actual root
cause was two compounding bugs, both fixed alongside this boundary: (1) `core/import/importMatcher.ts`'s
`parseFlexibleDate` relied on the native `Date` constructor's lenient parsing for MoneyView's
`"YYYY/Mon/DD HH:mm:ss"` format — V8 (RN Web, Node) parses it fine, but Hermes (real native builds) does
not, silently rejecting every row of a real 1500+-row file; fixed with an explicit, portable named-month
regex parse instead of relying on either engine's non-portable native lenience. (2)
`features/import/review/UnparsedRows.tsx` then rendered every rejected row's full editor unvirtualized
(no cap) — fine for a handful of rows, but 1500+ of them mounted at once was enough alone to crash a real
device (while RN Web's much cheaper DOM tolerated it) — fixed with the same "first N + show all" render
cap `CategoryTile.tsx` already established for its own row lists. `useImport.ts`'s `importFromText` and
`UploadStep.tsx`'s `pickFile` also gained try/catch around their parsing/file-read paths, surfacing any
failure through the existing `parseError` banner rather than throwing uncaught — matching
`useBankImport.ts`'s own `importFromXlsx` precedent. Standing rule this codifies:
`CLAUDE.md`'s "Reliability" non-negotiables.

**Expense Import review-screen redesign (2026-08-13)** — a full comparison sweep against Bank
Statement Import (real user report: the two flows had drifted apart in maturity) found 10 issues,
all fixed together since several shared the same underlying "tiles are a frozen one-shot snapshot,
not live-recomputed" root cause. New shared component:
**`apps/mobile/src/components/shared/RowCheckbox.tsx`** — a higher-contrast checkbox (1.75px
`theme.borderStrong` border + `theme.surfaceTertiary` fill when unchecked, vs. the previous
barely-visible 1px `theme.border` outline), factored out so it doesn't silently drift between
`CategoryTile.tsx`'s bulk-select checkboxes and any future consumer (Bank Import's own identical
inline checkboxes weren't migrated to it in this pass — a follow-up should, per "keep shared
controls in sync"). New core module **`packages/core/src/core/import/importTileGrouping.ts`**
(`groupRowsIntoTiles`) replaces `PreviewSection.tsx`'s previous inline grouping with a single-pass
function that excludes duplicate and transfer-paired rows from normal category tiles, splits a
source name's rows by `type` (expense/income never share a tile outside a transfer pair), and
synthesizes a fresh tile identity for a row moved to a category with no existing tile of its own
(previously it silently stayed in its origin tile with just a "· moved to X" annotation — the
reported bug). New **`packages/core/src/core/import/importCategoryMemory.ts`** + mobile-side
`apps/mobile/src/features/import/importCategoryMemory.ts` add a cross-session "remembered category"
suggestion via `AsyncStorage` (key `penny_import_category_memory_v1`) — deliberately not a new
Dexie store, since it's a small, non-sensitive UI preference, not vault data; matches the existing
`usePaymentModes.ts`/`useBankCashWithdrawalCodes.ts` precedent for this class of persisted setting.

**Same-day follow-up: bucket-card pattern ported from Bank Import.** New
**`apps/mobile/src/features/import/review/ImportCategorizeModal.tsx`** moves `CategoryTile.tsx`'s
kind picker/tag box/create-transfer fields out of the always-visible tile body and into a modal
(mirroring `apps/mobile/src/features/bank-import/BulkCategorizeModal.tsx`'s chrome, widened to a
4-way kind picker since generic import also needs create/skip, not just existing-or-transfer) —
`CategoryTile.tsx` itself collapses to a header-only bucket card by default, opened via an
always-visible "Categorize N selected ›" footer button (`UnmatchedBucket.tsx`'s exact convention).
`PreviewSection.tsx`'s plain-text section labels became three real bordered bucket cards ("Needs
your input"/"Staged — ready to import"/"Already imported"), and `ReviewStep.tsx`'s Accounts/Preview
sections lost their mutual-exclusion (both can be expanded at once, matching how Bank Import's own
buckets coexist). Full writeup: `docs/features/expenses.md`'s "Review-screen redesign, 2026-08-13"
and "Bucket-card follow-up, 2026-08-13" sections.

**CSV/Manual Expense Import redesign (2026-08-14) — supersedes the single-review-screen shape
above.** `ReviewStep.tsx`, `PreviewSection.tsx`, and `core/import/importTileGrouping.ts` (all three
described in the two entries directly above) are **deleted** — every reference to them elsewhere in
this doc is now historical, not current. Full design doc (rationale, alternatives rejected, every
bug found via real on-device testing against a real 9,384-row file): [`docs/plans/csv-expense-import-redesign.md`](plans/csv-expense-import-redesign.md);
user-facing behavior: `docs/features/expenses.md`.

_Rationale (why a 3-stage wizard, not a bigger single screen):_ the single-review-screen model kept
accounts, categories, and per-transaction triage all resolvable on one page, which worked for a
small file but broke down for a real multi-thousand-row, 79-category import — resolving a category
inherently needed to happen before a transaction tile could show anything meaningful for it, and
cramming both onto one screen meant neither got proper bucket-grouping or partial-progress
support. Splitting into **Accounts → Categories → Transactions**, each a dedicated step with its own
Needs-Review/Ready/Skipped buckets, let each resolution layer be finished (or partially finished) on
its own terms before the next one needs it — matching the same "one clear stage decides one thing"
principle already used for the Upload → Map Columns split. **Explicitly rejected**: unifying this
importer with Bank Statement Import (a prior doc argued for exactly that, `docs/plans/csv-import-vs-bank-import-comparison.md`,
deleted as part of this redesign, superseded) — kept permanently separate instead, preserving the
existing zero-shared-code principle between `core/import/` and `core/bank-import/` (a bug fixed in
one must never regress the other) rather than trading it away for less total code.

New core modules (`packages/core/src/core/import/`, all **additive** — `apps/web-react`'s frozen
`useImport.ts` still calls the original `resolveCategories`/`resolveAccounts`/`buildResolvedPreviewRows`/
`writeImportBatch` unchanged, confirmed via zero `git diff` on `apps/web-react` after every round of
this redesign):

- **`importCounterpartySplit.ts`** — sub-splits a transfer/IOU-suspect category's rows by counterparty
  (tiered: high-confidence `Person` match, editable low-confidence text candidate, residual "no clear
  person" group). Deliberately its own normalization logic, not a shared import from
  `core/bank-import/normalization.ts`, per the same zero-shared-code principle above.
- **`importTransactionsGrouping.ts`** — applies transfer-pair/duplicate exclusion on top of the
  Categories stage's already-formed row groups, for the Transactions stage specifically.
- **`resolveCategoriesDirectional`**/`isDirectionalCategoryResolutionDecided`/`draftCategoryKey`
  (new exports in `importCategoryResolution.ts`) — the real fix for a shared-mutable-resolution bug:
  keys a resolution by `${sourceName}::${type}` instead of `sourceName` alone, so an expense-direction
  and income-direction split of one source category name can never again share one mutable object
  (the earlier bug: categorizing one silently re-categorized the other).
- **`suggestCardAccountMerges`** (new export in `importAccountResolution.ts`) — the card→account merge
  suggestion, extending the existing fuzzy-name-merge-suggestion pattern to also trigger on a shared
  bank name + card account type.
- **`detectSelfAccountMovementPairs`**/`isLikelySelfAccountMovement` (new exports in
  `importTransferPairing.ts`) — one general detector for cash withdrawal/wallet top-up/CC bill payment
  (money moving between two of the user's own accounts), replacing what would otherwise have been
  three separate bespoke heuristics.
- **`writeImportBatchDetailed`** (new export in `importWriter.ts`) — a `writeImportBatch` sibling
  adding live progress/cancellation callbacks and per-row expense ids (needed for the commit-time IOU
  ledger write), for the new Import Progress screen.

New mobile components (`apps/mobile/src/features/import/`): `AccountsStage.tsx`, `CategoriesStage.tsx`,
`TransactionsStage.tsx` (replacing `ReviewStep.tsx`), `WizardProgress.tsx` (cross-stage progress
chrome + the "draft, nothing saved yet" indicator), `ImportProgressStep.tsx` (the new pre-start →
importing → complete flow, folded into the existing "Done" wizard step rather than adding a 7th
step), and `review/BucketCard.tsx` + `review/useBucketExpansion.ts` (the shared Needs-Review/Ready/
Skipped bucket shell, reused by all three resolution stages so the pattern can't drift between them).
`review/CategoryTile.tsx` gained an `expandable` prop (default `true`) so it doubles as the Categories
stage's own row shell (`expandable={false}` — header+footer only, no chevron) via a new thin wrapper,
`review/CategoryResolutionRow.tsx`.

**Reliability lesson this codifies, mirroring the unbounded-`.map()` rule above**: any user-facing
operation that locks navigation for its duration (this screen's back-button/hardware-back/swipe-gesture
lock while writing) must guarantee that lock releases on every exit path — success, user cancellation,
**and an unexpected exception** — via `try/catch/finally`, not just the happy path. Found as a real,
severe bug during this redesign: `commitAndImport()` originally had no exception handling at all, so
any unhandled throw partway through left the phase-tracking state stuck, and since navigation was
locked exactly on that state, the user would have been stranded with no way to leave short of
force-quitting the app. See `CLAUDE.md`'s Reliability non-negotiables.

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

| File                 | Props | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DemoModeBanner.tsx` | —     | Persistent purple strip mounted in `AppShell`, gated on `profile.demoSeeded`. "Exit Demo Mode" opens a `ConfirmDialog`; confirming calls `wipeDemoData()` and navigates to `/onboarding/let-us-know-you` with `{ state: { fromDemoMode: true } }`, handing off to the real-setup sequence. `SettingsPage`'s danger-zone "Exit Demo Mode" button (same visibility guard, `profile.demoSeeded`) does the identical thing — the two are separate entry points into one behaviour, not two different actions. |

### `src/components/ui/`

| File                          | Key Props                                                                                                                                  | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChipAvatar.tsx`              | —                                                                                                                                          | Chip AI avatar SVG                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `PennyLogo.tsx`               | —                                                                                                                                          | Penny coin + wordmark SVG                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `PennyLoader.tsx`             | `size?` sm/lg · `accessibilityLabel?`                                                                                                      | Branded busy/loading indicator (mobile-only; see `docs/mockups/proposals/branded-busy-indicator-v1.html`). Reuses `PennyLogo`'s coin medallion only (not the full square icon). `size` doubles as the animation-style selector, not a free-standing `variant`: `sm` (20px) rotates continuously — wired into `Button.tsx`'s `loading` prop at this size regardless of the button's own `size`; `lg` (72px) pulses/breathes in place — for a standalone full-area busy state. Driven by `react-native-reanimated` (`useSharedValue`/`withRepeat`/`withTiming`), matching `Icon.tsx`'s `spin` prop pattern. |
| `Card.tsx`                    | `padding?` xs/sm/md/lg · `radius?` md/lg · `onClick?` · `className?`                                                                       | Surface card. Padding tiers: xs=p-3, sm=p-3.5, md=p-4 (default), lg=p-5. Renders `<button>` when `onClick` is provided. Layout classes allowed via `className`; never pass colour/spacing overrides.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `Modal.tsx`                   | `onClose` · `title?` · `footer?` · `size?` sm/md · `nested?` · `level?` 1/2/3 · `scrollable?`                                              | Fixed-overlay centred modal. `nested=true` bumps to `z-70`; `level={3}` → `z-80` (third-tier, e.g. category editors above the picker). Always uses `paddingTop:56, paddingBottom:72` so header + nav remain visible.                                                                                                                                                                                                                                                                                                                                                                                      |
| `Button.tsx`                  | `variant` primary/secondary/danger/ghost · `size?` sm/md/lg · `loading?` · `icon?` · `fullWidth?` · `color?` · `style?`                    | All interactive buttons. `color` overrides background with a runtime hex value. `style` merges with variant styles for one-off positioning (e.g. FAB `bottom`/`right`). Primary/danger use CSS vars; secondary/ghost use semantic tokens.                                                                                                                                                                                                                                                                                                                                                                 |
| `OptionButton.tsx`            | `label` · `selected` · `onClick` · `icon?` · `description?` · `color?` · `disabled?` · `compact?`                                          | Bordered option selector. Default: horizontal card (icon left, label right, `w-full`). `compact=true`: vertical tile (icon above, label below, no `w-full`) for use in 3–4-column grids (policy types, account types, asset classes). `color` defaults to `--color-primary`.                                                                                                                                                                                                                                                                                                                              |
| `ConfirmDialog.tsx`           | `isOpen` · `onClose` · `onConfirm` · `title` · `message` · `confirmLabel?` · `confirmVariant?` · `loading?` · `level?` 1/2/3               | Two-button confirmation dialog. Wraps `Modal` (default `level=2`/`z-70`) + two `Button`s.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `FormField.tsx`               | `label` · `required?` · `hint?` · `error?`                                                                                                 | Label wrapper. Shows required star, hint text, or error (error takes priority over hint).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `TextInput.tsx`               | `label?` · `value` · `onChange(value)` · `error?` · `hint?` · `prefix?` · `suffix?` · `inputClassName?`                                    | Controlled text input. `inputClassName` adds extra classes to the inner `<input>` element (e.g. `font-mono uppercase` for ticker inputs). When `label` is provided, wraps with `FormField`.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `AmountInput.tsx`             | `label?` · `value` (plain numeric string) · `onChange(value)` · `prefix?` (default `₹`) · `showWords?` · `error?` · `hint?` · `autoFocus?` | Money entry field. Live Indian-grouped display, inline calculator (`120+45`, safe hand-rolled evaluator — no `eval`), and an amount-in-words helper beneath (via `lib/amountToWords`). Groups on blur, shows raw draft while focused (no cursor jump). Use for all money inputs in place of a raw `TextInput type="number"`.                                                                                                                                                                                                                                                                              |
| `EmptyState.tsx`              | `icon` · `title` · `description?` · `action?`                                                                                              | Icon + title + optional description + optional CTA button. Use for zero-data states.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `TabStrip.tsx`                | `options[]{value,label,icon?,count?}` · `value` · `onChange` · `scrollable?`                                                               | Underline-style tab strip. Generic over the tab value type. Horizontally scrollable when `scrollable=true`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Badge.tsx`                   | `label` · `color?` · `variant?` solid/subtle · `size?` sm/md                                                                               | Coloured pill. `subtle` variant uses `color` at 10% opacity background.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `PageHeader.tsx`              | `subtitle?` · `actions?` · `children?` · `className?`                                                                                      | Secondary, screen-specific content row below `apps/mobile`'s global header (2026-08-01 chrome consolidation: the title + back-button row this used to own via `title`/`leading` moved into `MainTabs`' own header — see the navigation section below). `subtitle` renders as a `text-sm text-secondary` line, `actions` right-aligned, `children` a full-width slot below. Only render this component when a screen actually has a subtitle/actions/children to show.                                                                                                                                     |
| `SectionLabel.tsx`            | `children` · `className?`                                                                                                                  | Small uppercase `text-tertiary` label titling a section between cards/lists. Spacing is caller-controlled via `className` (default `mb-2`; pass `-mb-2` when the parent supplies a gap).                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `PassphraseStrengthMeter.tsx` | `score` 0–4                                                                                                                                | Five-bar zxcvbn strength meter + label. Used by onboarding setup and Change Passphrase.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `ListContainer.tsx`           | `children` · `className?`                                                                                                                  | Bordered rounded `surface` that hairline-divides its direct children (`divide-[var(--color-border)]`). Standard wrapper for grouped list rows (accounts, transactions, previews).                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `ProgressBar.tsx`             | `value` 0–100 · `color?` · `size?` xs/sm/md · `animate?`                                                                                   | Horizontal fill bar. Clamps value to 0–100.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `SegmentedControl.tsx`        | `options[]{value,label,icon?,color?}` · `value` · `onChange` · `cols?`                                                                     | 2–4 option radio group. Active option fills with `color` (default `--color-primary`). Background: `bg-surface-2`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `SelectInput.tsx`             | `label?` · `value` · `onChange(value)` · `options[]{value,label}` · `placeholder?` · `required?` · `disabled?` · `error?` · `hint?`        | Custom dropdown: styled trigger + portal-rendered listbox anchored directly below the field (flips above when space is tight). Renders to `document.body` at `z-index:90` so it escapes modal `overflow` clipping and stacks above `z-80` modals; dismisses on outside-click/Escape; repositions on scroll/resize. Wraps `FormField` when `label` provided.                                                                                                                                                                                                                                               |
| `Toggle.tsx`                  | `value` · `onChange(value)` · `disabled?` · `aria-label?`                                                                                  | iOS-style sliding boolean switch. Active: `--color-primary`; inactive: `--color-surface-3`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `LifeRow.tsx`                 | `icon` · `label` · `alignTop?` · `children`                                                                                                | Labelled row for one optional "Life & household" field (icon + label left, control right). Shared by Edit Profile and onboarding's `LifeHouseholdScreen`.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `OptionalSeg.tsx`             | `options[]{value,label}` · `value` · `onChange(v \| undefined)`                                                                            | Compact segmented control for an optional, clearable field — tap the active segment again to unset it. Distinct from `SegmentedControl` (which requires a value). Shared by Edit Profile and `LifeHouseholdScreen`.                                                                                                                                                                                                                                                                                                                                                                                       |
| `index.ts`                    | —                                                                                                                                          | Barrel export for all ui components. Import shared primitives from `@/components/ui` (never deep-import the file).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

---

## Hook inventory

### `src/hooks/`

| File                       | Returns                                                                                                                                                                                                                                                                            | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useRepository.ts`         | `{ items, loading, error, save, remove, reload }`                                                                                                                                                                                                                                  | Generic hook to load/write from any EncryptedRepository. Used in most feature pages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `useLoggedRepository.ts`   | same shape as `useRepository`                                                                                                                                                                                                                                                      | Wraps `useRepository`, recording CREATE/UPDATE on save + DELETE on remove to the activity log, and firing an Undo toast (restore + reload). Single-entity modules adopt it with `{ entityType, summarize, diffFields? }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `usePassphraseStrength.ts` | `{ score, ready }`                                                                                                                                                                                                                                                                 | Lazy-loads zxcvbn and scores a passphrase (0–4). Used by onboarding setup and Change Passphrase.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `useProfile.ts`            | `{ profile, loading }`                                                                                                                                                                                                                                                             | The single profile record (or null). Used by FIRE, tax, health, retirement, and the profile editor to read dob/employmentType.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `useForecast.ts`           | `{ loading, nowMs, todayStart, startBalance, events, forecast, dueRecurring, goalReserved, goalBreakdown, safeToSpendRaw, safeToSpend, safeToSpendPerDay, reload }`                                                                                                                | Loads recurring-flow sources + accounts, computes current liquid balance, and projects it forward via `core/cashflow` (running balance, lowest point, buffer breach, `forecast.discretionary` — a pure, goal-agnostic balance/commitments/buffer figure). Shared by the Cash Flow page, the safe-to-spend surfaces (Home, Expenses header), and reminders — lives here so features don't cross-import. **2026-08-02:** also independently loads goals + `GoalContribution`s (can't import `features/goals/useGoals.ts` — a shared hook depending on one feature's own hook) and uses `core/goals/progress.ts` to exclude every "counts" goal's saved amount from `forecast.discretionary`, exposed as `safeToSpend` (clamped ≥0) / `safeToSpendRaw` (unclamped, for an overcommitted check) / `safeToSpendPerDay`; `goalBreakdown` feeds Cash Flow's expandable "Excludes ₹X saved for goals" list. All three "Safe to spend" surfaces read `safeToSpend`, not `forecast.discretionary`. |
| `useReminders.ts`          | `{ loading, nowMs, reminders, counts, snooze, markDone, log, cancelSub }`                                                                                                                                                                                                          | Builds the header bell's in-app reminders from `useForecast` + `core/reminders`, holding snooze/done state in localStorage. Actions: snooze, mark done, log a due bill (reuses the recurring occurrence builder), cancel a subscription.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `useTxnRefresh.ts`         | `notifyTxnChanged()` + `useTxnRefresh(reload)`                                                                                                                                                                                                                                     | Cross-instance live-refresh for transactions/balances. The IOU screen writes expenses through separate repo instances and calls `notifyTxnChanged()` (a `penny:txn-changed` window event); `useExpenses`, `useForecast`, `useHome`, and `useAccounts` subscribe via `useTxnRefresh` so lists, balances, forecast, and net worth reload live.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `useDataRefresh.ts`        | `notifyCategoriesChanged()`/`useCategoriesRefresh(reload)`, `notifyAccountsChanged()`/`useAccountsRefresh(reload)`, `notifyTagsChanged()`/`useTagsRefresh(reload)`, `notifyGoalsChanged()`/`useGoalsRefresh(reload)`, `notifyBankImportsChanged()`/`useBankImportsRefresh(reload)` | Same pattern as `useTxnRefresh`, for categories/accounts/tags/goals/bank-statement-import records. `SafeModeSettingsPage` and `ManageTagsPage` edit categories/accounts/tags through their own repo instances (separate routes from Expenses); `useExpenses` subscribes to those three events, so a Safe Mode or Manage Tags change reflects immediately without waiting for those screens to remount. **2026-08-09:** `notifyBankImportsChanged()` added — `useBankImport.ts`'s `commitAndImport()` calls it after writing `bankStatementImportsRepo` provenance records, so `useAccountVerification.ts`'s own separately-mounted `useRepository(bankStatementImportsRepo)` (on the persistent `AccountsPage`, which never unmounts under a pushed `BankImportPage`) doesn't keep sweeping against a stale, pre-commit snapshot — a real bug found via on-device testing, see `docs/plans/bank-balance-sync.md`.                                                                        |

_(Track 1 adds: `useDisclosure.ts`, `useAsync.ts`)_

---

## Core layer detail

### `src/core/crypto/`

Three files, one responsibility each:

| File                 | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine.ts`          | Pure crypto: symmetric (`deriveKey()`, `encrypt()`, `decrypt()`, `wrapKey()`, `unwrapKey()`, `generateSalt()`, `deriveVerifier()`) + asymmetric device-identity primitives (Track B): `generateSigningKeypair()`/`generateWrappingKeypair()` (ECDSA/ECDH P-256), `sign()`/`verify()`, JWK export/import, `deriveSharedWrappingKey()` (ECDH → AES-GCM KEK). Only file that calls `window.crypto.subtle`.                                                                                                                                                                                                                                                                                                                |
| `keystore.ts`        | In-memory Master Key holder. `setMasterKey()`, `getMasterKey()`, `isUnlocked()`, `lock()`. Never writes to storage.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `securityManager.ts` | Orchestrates auth lifecycle: `initialize()`, `unlock()`, `verifyPin()`, `changePin()`, `changePassphrase()` (once/24h throttle), `isOnboardingComplete()`, `isPinRotationDue()`. **Track F Forgot-PIN recovery**: `unlockWithPassphrase()` and `resetPinWithPassphrase()` — an independent passphrase-attempt counter/lockout (`getPassphraseLockoutState()`) kept separate from the PIN's own, so exhausting one factor never blocks the other. **Demo Mode**: `DEMO_PIN`/`DEMO_PASSPHRASE` (fixed, shown constants) + `exitDemoMode()` — re-keys the throwaway demo vault to real credentials, deliberately bypassing the once/24h throttle since the vault is seconds old. Reads/writes the `security` Dexie store. |
| `identityKeys.ts`    | Device identity keypair lifecycle (Track B): `ensureIdentityKeys()` (lazy + idempotent, called at claim), `getSigningKeypair()`/`getWrappingKeypair()`, `getPublicJwks()`. Stores JWKs in the DMK-encrypted `device_keys` table.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### `src/core/db/`

| File                   | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.ts`            | `PennyDatabase` extends `Dexie`. Defines v1→v8 migrations and all store definitions. Exports `db` singleton. (v7 adds `persons` + `ledger_entries` for the IOU ledger; v8 adds `device_keys` + `group_keys` + `sync_cursor` for Track B sync/identity crypto.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `repository.ts`        | `EncryptedRepository<T>` class. Encrypts on `put()`, decrypts on `get()`/`getAll()`. Uses Master Key from keystore.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `repositories.ts`      | Pre-instantiated repositories for all encrypted stores. Import from here — never instantiate directly in features.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `types/index.ts`       | TypeScript interfaces for all 40+ entity types.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `defaultCategories.ts` | `ALL_DEFAULT_CATEGORIES`, `INTENT_GROUP_META`, `CATEGORY_MIGRATION_MAP`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `priceCache.ts`        | Helpers for reading/writing the `price_cache` plain store with TTL support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `seedDemoData.ts`      | Seeds a realistic **multi-year (Jan 2017 → today)** demo dataset, tailored per `employmentType` via a per-persona config. Salary steps through a career arc (`SALARY_ARC`/`salaryFor`, aligned to the EPF employer history) with April/July hikes; the latest 12 months are fully detailed, older months carry the core recurring rows (scaled back by a ~5%/yr `grow()` factor). Only ever called from `DemoVaultScreen` (the "Explore with Demo Data" branch) — never from the real-setup sequence. Exports `seedDemoData(employmentType?)`, `wipeDemoData()` (wholesale `.clear()` on every financial table, no reload/navigation — both `DemoModeBanner`'s "Exit Demo Mode" and Settings' equivalent button call it directly, then hand off to the real-setup sequence), and `reseedForEmployment(employmentType)`. |
| `activityLog.ts`       | Timeline service: `logActivity` (fire-and-forget + prune), `restoreActivity` (restores `snapshot` + any other-type `cascade` records — atomic combined Undo), `restoreDeletionsSince`, `summarizeDiff`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `entityRegistry.ts`    | `entityType → repo.put` map so `restoreActivity` re-inserts snapshots (and cascade records) generically.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

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

| Context                  | Stored in                    | Key values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PrivacyContext`         | React state + localStorage   | **`apps/web-react` (frozen) — unchanged:** `mode: PrivacyMode`, `setMode()`, `maskValue()`, `shouldMask(sensitive)`, `canUseAI()`, `openModeExpiresAt: number \| null` — `shouldMask` is the single source of truth for amount masking: Open never masks, Privacy always masks, Safe masks only when `sensitive` is true. Open is never a persistent state — `mode` always starts at `defaultPrivacyMode` (Safe or Privacy) on launch, and `setMode('open')` arms an auto-revert `setTimeout` (duration from `openModeDurationMinutes`) plus an immediate revert on `visibilitychange`/backgrounding. **`apps/mobile` diverged 2026-08-18** — `PrivacyMode` is `'safe' \| 'open'` only (no `'privacy'`, no `openModeExpiresAt`/timer); `shouldMask` behavior for Safe/Open is unchanged; `mode` always starts at `'safe'`; Open auto-reverts to Safe on `AppState` backgrounding instead of `visibilitychange`. See `docs/PRIVACY.md`. |
| `SettingsContext`        | localStorage                 | `moduleVisibility`, `safeModeVisibility` (`loans`/`iou`/`portfolio`/`goals`/`insurance`/`subscriptions`, all default visible), `fontScale`, `theme`, `defaultPrivacyMode: PersistedPrivacyMode` (Safe/Privacy only — Open excluded from the type, legacy `'open'` values coerce to Safe), `openModeDurationMinutes` (1/5/10/15/30, default 1) + `setOpenModeDurationMinutes()`, `setModule()`, `setSafeModeVisibility()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `EventModeContext`       | Dexie (`hashtags` store)     | `activeEvent`, `addEvent()`, `stopEvent()`, `promoteHashtagToEvent()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `OnboardingDraftContext` | React state (in-memory only) | `fullName`/`username`/`dob`/`employmentType`, Life & household fields (`maritalStatus`/`children`/`homeOwner`/`riskAppetite`), `accountsToCreate: DraftAccount[]`, `backupChoice`, `fromDemoMode` (set from router location state when reached via Exit Demo Mode) + `setDraft(patch)`. Scoped to the `/onboarding/*` route tree (mounted by `OnboardingLayout`) — nothing here persists until the final vault step writes it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

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
    retirement/           ← RetirementSection, RetirementCard, EPF/PPF sheets (incl.
                            PpfAllTransactionsSheet), RetirementSheets, Nps/Ppf/Epf modals + fields,
                            NpsLifecycleDetail, EPF import/export (epfImportLogic, EpfImportFlow,
                            EpfImportReviewSheet, epfInterestOnDemand, epfReviewFlags, epfTxLabels),
                            EPF employer-switch fixes + per-employer ledger
                            (EpfNewEmployerSetupSheet, EpfEmployerPickerSheet, epfEmployerScoping),
                            PPF statement import (ppfImportLogic, PpfImportFlow,
                            PpfImportReviewSheet, ppfInterestOnDemand, ppfReviewFlags, ppfTxLabels)
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

**What belongs in the hook (Layer 2):** all `useEffect` data loading, all `useCallback`
mutations, all `useMemo` derived values that depend on fetched data, loading/saving flags.
**What stays in the page (Layer 3), never the hook:** form field state, modal open/close
state, which item is being edited/selected, `useNavigate`/routing, `usePrivacy()`/masking —
these are UI concerns, not business state — plus the bridge functions above.

**When a page outgrows ~400 lines, decompose in this order:** (1) **modals** → their own
files, each owning its own internal state, parent holds only the show/hide boolean; (2)
**tab content** → their own files, each receiving only the data it renders; (3) **row
components** → their own files once a `.map()` item exceeds ~10 lines; (4) **pure
helpers** → `lib/` (not the feature folder) — anything with zero React belongs there so
it's importable anywhere and testable in isolation. A page hosting several independent
domains (not just modals/tabs of one domain) uses the vertical-slice pattern instead — see
the Portfolio/Expenses examples above.

### React Native portability by layer

This table reflects the approved plan in [`docs/plans/mobile-migration.md`](plans/mobile-migration.md) (single Expo codebase, targeting iOS/Android/web via `react-native-web`; NativeWind for styling; `@op-engineering/op-sqlite` + `react-native-quick-crypto` as native adapters — the storage adapter went `expo-sqlite` → `react-native-mmkv` → `op-sqlite`, all on 2026-07-26). Track 0 (done) physically separated the two layers below into `packages/core/` and `apps/web-react/`; the remaining rows land in later tracks.

| Layer                               | RN effort                                                                                                                                 | Why                                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/`                | Near-zero changes                                                                                                                         | Pure TypeScript; one flagged seam (`import.meta.env`, see above) to abstract                                    |
| Feature hooks (`use{Name}.ts`)      | Zero changes                                                                                                                              | React hooks work identically in RN                                                                              |
| Feature UI (`{Name}Page.tsx`)       | Full rewrite (Track 4)                                                                                                                    | NativeWind + View/Text/Pressable, not Tailwind/DOM elements                                                     |
| `apps/web-react/src/components/ui/` | ✅ Done — rewritten as `apps/mobile/src/components/ui/`                                                                                   | Same prop APIs, different renderer (Track 3)                                                                    |
| `packages/core/src/core/db/`        | ✅ Done — `@op-engineering/op-sqlite` adapter behind `RowStore<T>` (was `expo-sqlite`, then `react-native-mmkv`, both swapped 2026-07-26) | `EncryptedRepository<T>`'s constructor narrowed from Dexie's `Table` to `RowStore<T>` — type-only change on web |
| `packages/core/src/core/crypto/`    | ✅ Done — `react-native-quick-crypto` polyfills `crypto.subtle`                                                                           | `engine.ts`/`securityManager.ts`/`identityKeys.ts`/`recovery.ts` needed **zero logic changes**                  |

### RN/Metro export & debugging gotchas

Recurring, engine/bundler-level gotchas found across multiple binary-file-write/export
features (Expenses' CSV/ZIP export, Loans' XLSX download) — read before touching any
export/file-write feature, not just the two case studies below where each was first found:

- **"Works on RN Web, fails on native" is a strong signal the bug is Blob/native-module
  related, not a Metro bundling issue.** RN's `Blob` implementation is incomplete compared
  to a browser's — notably missing `.arrayBuffer()` — so code that reads a Blob's bytes
  needs a platform-suffixed path on native. See `docs/features/expenses.md`'s CSV/ZIP
  export entry for the concrete fix.
- **`console.error`'s output in LogBox doesn't show `err.stack`** — a caught error logged
  this way looks like a bare message with no useful trace on-device. Log the stack
  explicitly (or use a temporary `console.log(err.stack)`) when diagnosing a native-only
  crash.
- **A dynamic `import()` of a library like `zip.js` can behave differently under Metro**
  than it does in a browser/Node bundler — confirm the actual resolved module shape rather
  than assuming parity. See `docs/features/expenses.md`'s export entry.
- **`xlsx.write()` returns a bare `ArrayBuffer`, not a typed array** — code expecting a
  `Uint8Array` needs an explicit `new Uint8Array(...)` wrap before writing it to a native
  file. See `docs/features/loans.md`'s "Download XLSX" entry.
- **When two competing theories exist for a bug, test one directly with a quick standalone
  `node some-script.mjs` from the repo root** (isolating the pure logic outside the app)
  before spending more time reasoning about it inside the running app — this is often the
  fastest way to rule a theory in or out.

---

## Anti-patterns — never do these

**Logic in component files** — a calculation belongs in `core/`, not inline in a
component's `useMemo`:

```tsx
// WRONG
const totalSpend = useMemo(
  () => expenses.reduce((sum, e) => (e.type === 'expense' ? sum + e.amount : sum), 0),
  [expenses]
);
// RIGHT
import { totalExpenseAmount } from '@/core/expenses/filterAndAggregate';
const totalSpend = useMemo(() => totalExpenseAmount(expenses), [expenses]);
```

**Data fetching in page components** — repo calls belong in the feature hook, never a
`useEffect` inside the page itself.

**Duplicate utility functions across files** — one copy in `lib/`, imported everywhere;
the second copy appearing anywhere is the signal to extract, not a shrug.

**Monolithic feature files** — a file over ~400 lines mixing UI and logic is a code smell;
split it (see the decomposition order above).

**Parent holding modal state** — a modal owns its own internal form state; the parent
holds only the open/close boolean and passes the minimum data the modal needs:

```tsx
// WRONG
const [exportRange, setExportRange] = useState('this_month');
{showExportSheet && <ExportModal range={exportRange} setRange={setExportRange} ... />}
// RIGHT
{showExportSheet && <ExportModal expenses={expenses} onClose={() => setShowExportSheet(false)} />}
```

**Prop-drilling instead of direct hook consumption** — a modal/child component calls the
shared hook itself rather than receiving its whole return value threaded down as props;
the parent passes only what it uniquely owns.

**Live-threaded filter setters** — a buffered filter modal owns its own local state and
applies on "Done" (`onApply`), rather than the parent threading 6 setter-pairs down as
props.

**A `shared/` folder that isn't actually shared** — a file used by exactly one category
belongs in that category's own folder, not `shared/`. Grep its importers before placing a
file in `shared/`; one importing folder → it lives there.

## File naming conventions

- Components: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Utilities / clients: `camelCase.ts`
- Types: colocated in `packages/core/src/core/db/types/index.ts` or feature-local `types.ts`
- Tests: `fileName.test.ts`
- Route/screen pages: `ModulePage.tsx` (e.g. `ExpensesPage.tsx`)

## When to refactor a component

Refactor when you observe any of these — they're signals the code has already crossed a
line, not suggestions:

1. **The file exceeds ~400 lines** (200 for a form) of JSX/logic — count only what's
   genuinely in the file; if it's large because it duplicates logic that belongs in
   `core/`/`lib/`, extract that first.
2. **A modal has 5+ state variables in the parent** — state that only exists while a modal
   is open belongs inside the modal.
3. **You're passing 4+ props only used inside one child** — that child should own that
   state instead; pass the initial value + an `onApply` callback.
4. **The same inline JSX block appears in 3+ places** — a shared component is overdue.
5. **A tab/section's JSX is longer than the page's own logic** — extract it into its own
   file.
6. **A utility function is copy-pasted across 2+ files** — the second copy is the signal,
   not the first; move it to `lib/`.

**When NOT to refactor:** a 250-line component that reads clearly (line count is a proxy,
not the goal); mid-feature-delivery (refactor before or after, not during); a stable
component with no active development; a component used exactly once with no reuse
potential.

## India-specific conventions

- **Currency:** always `formatCurrency()` from `lib/formatters.ts` — never format ₹
  amounts inline. Always `en-IN` locale.
- **Large numbers:** `formatCompact()` for lakhs/crores, not millions/billions —
  ₹1,00,000 = ₹1L, ₹1,00,00,000 = ₹1Cr.
- **Financial year:** Indian FY runs April–March; FY 2026 = April 2025–March 2026. Use the
  shared `CURRENT_FY` constant, don't recompute it inline.
- **Dates:** always through `lib/formatters.ts` helpers — never
  `new Date().toLocaleDateString()` directly (locale must stay `en-IN`).
- **Tax slabs:** senior citizen = 60+, super senior = 80+ — these thresholds drive
  different tax-calculator branches.

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

**Reinforced 2026-08-18:** the same rule tripped 3 separate times in one pass (`PersonTypeahead.tsx`, `WizardProgress.tsx`, `useServerActionError.ts` — see the real-device-testing-pass decision entry below) when a second feature needed a component/hook that had only ever lived inside another feature's own folder. The fix was identical each time: promote the file out into `components/shared/` or `hooks/`, never let one feature import from another's folder. If two features need the same component, it belongs in `components/shared`/`hooks/` from the start — not a special case, the expected outcome of this rule.

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
is ~36%; shared-component adoption raises effective UI reuse further.) See this doc's own
"Feature module architecture" section below for the resulting target structure.

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
_pure logic_ — that's identical across variants belongs in an unsuffixed sibling file (the
`*.constants.ts` convention for literals, or a plain descriptively-named file like
`exportCsv.shared.ts` when whole functions are shared), imported by every variant that needs it.
This is safe under both bundlers: Metro's platform-suffix resolution only matches a fixed short
list (`ios`/`android`/`native`/`web`, plus whatever's explicitly added to `resolver.platforms`),
so an arbitrarily-named file is never mistaken for needing its own platform variant; Vite has no
such resolution convention at all. See [`docs/EXTERNAL_APIS.md`](EXTERNAL_APIS.md) for the
external-API constants this produced, and `CONTRIBUTING.md`'s "Architecture rules" for the
enforcement-level restatement of this rule. Inspired partly by looking at Cashew (a mature
cross-platform Flutter app) for structural comparison — see `docs/plans/mobile-migration.md`'s
long-term react-native-web vision, which this same principle also feeds.

---

### Decision: SMS-Based Transaction Tracking (Android only) — a third recording method, own native module (2026-08-15)

**Rationale:** full design in [`docs/plans/sms-transaction-tracking.md`](plans/sms-transaction-tracking.md).
A few structural choices worth recording here specifically:

- **`core/sms-import/` is a deliberately separate module** from both `core/bank-import/` and
  `core/import/` — SMS Tracking is a third, independent way to _record_ a transaction (alongside
  manual entry and CSV import), not a replacement for or variant of Bank Statement Import, which
  stays the separate reconciliation feature. It reuses only the matching _algorithm_ shape from
  `core/bank-import/matcher.ts` (`matchesDirection` was exported and generalized to a minimal
  `{ direction }` structural type specifically so `core/sms-import/smsTransactionMatch.ts` could
  reuse it instead of duplicating it), never Bank Statement Import's own types or role.
- **`BankPresetId` and `paymentModeInference.ts` were promoted out of `core/bank-import/`** into
  `core/db/types/index.ts` (next to `AccountType`, since that file is deliberately self-contained
  with zero imports of its own) and `core/expenses/`, respectively, once SMS Tracking needed the
  same identifier set and rail-keyword vocabulary as Bank Statement Import. `bank-import/types.ts`
  re-exports `BankPresetId` so its own ~16 internal `from './types'` imports kept resolving it
  unchanged; `paymentModeInference.ts`'s 6 real consumers were repointed directly (small enough
  list that a compatibility re-export shim wasn't worth it).
- **`BucketCard.tsx`/`useBucketExpansion.ts` were promoted out of `features/import/review/`** into
  `components/shared/`/`hooks/` respectively, once `features/sms-tracking/` needed the same
  bucket-shell UI — a feature module importing directly from another feature module's internals is
  an ESLint violation (feature modules may only import from `core/`, `components/`, `context/`,
  `hooks/`, `lib/`), so this is a straight move, not a fork; the 3 pre-existing CSV-import
  consumers were repointed to the new shared path with zero behavior change.
- **`processRawSmsCore()`/`deriveStatusForAccount()` live in `packages/core`, not only inside the
  `useSmsTracking` React hook** — a Headless JS task (the native live-capture path's background
  processing step) has no React tree to call a hook from, so the "what happens when one raw SMS
  needs to become a `SmsTransactionRecord`" logic had to be reachable from a plain async function.
  The hook wraps these core functions rather than reimplementing them — exactly one place this
  logic lives, consumed identically by the foreground manual-scan path and the headless task.
- **`apps/mobile/modules/expo-sms-capture/` is Penny's first bespoke local Expo Module** (Kotlin,
  Expo Modules API) — not a third-party npm package. Chosen deliberately: off-the-shelf SMS-reading
  libraries mostly stop at "hand you the SMS text on a broadcast," and the durable
  `BroadcastReceiver` → `WorkManager` → Headless JS plumbing this feature actually needs is custom
  work regardless of the base library; writing it as an owned local module avoids depending on an
  unaudited third-party package touching sensitive SMS content, consistent with this app's
  privacy-first ethos. Scaffolded via the real `create-expo-module@latest --local` CLI. A
  `BroadcastReceiver` (`SmsReceiver.kt`) does the absolute minimum allowed by Android's ~10s
  execution budget (persist to a small SharedPreferences-backed queue, `SmsQueueStore.kt`, then
  enqueue one `WorkManager` job) rather than any real parsing/matching/DB work inline.
  `SmsProcessingWorker.kt` starts `SmsHeadlessTaskService.kt` (RN's real `HeadlessJsTaskService`),
  which drains that queue through the exact same `processRawSmsCore` pipeline the manual scan uses.
  `startService()` is wrapped in try/catch since Android 8+'s background-service-start
  restrictions can legitimately reject it when the app process is fully backgrounded — this is the
  plan's own documented, accepted fallback (messages stay durably queued natively until the app's
  own next-foreground drain picks them up), not a bug.
- **The Headless JS task checks `keystore.isUnlocked()` before touching anything** — a headless
  context spun up because the app process was fully killed has no Data Master Key available to
  decrypt an `EncryptedRepository` read/write, and there's no way to prompt for a passphrase from a
  headless context. In that case it's a no-op and the native queue stays intact for the next
  foreground drain; never a silent data-loss path.
- **`apps/mobile/src/lib/smsCapture.ts` (a single unsuffixed stub) became a real
  `.native.ts`/`.web.ts` pair** once Android gained a real implementation (iOS/RN-Web still have
  none — no SMS API exists on either). The native module itself is loaded via a lazy dynamic
  `import()`, not a top-level import, specifically so the file loading on iOS (which Metro's
  `.native.ts` resolution covers too) never crashes at import time, since
  `expo-sms-capture`'s `expo-module.config.json` declares `platforms: ["android"]` only.

### Decision: "Did You Know" tips — three delivery tiers, one shared content library (2026-08-16)

**Rationale:** full design in [`docs/features/did-you-know-tips.md`](features/did-you-know-tips.md).
A whole-app sweep found a large amount of genuinely useful, non-obvious capability with nowhere
surfacing it — the design question was how to tell users without cluttering the UI or nagging them.
Settled on three tiers rather than one: **contextual nudges** (earned by real behavior, fire once
ever), a **rotating/daily card** (ambient, low-stakes), and a **"Discover Penny" hub** (on-demand, the
full catalogue). A few structural choices worth recording:

- **One content library (`packages/core/src/core/tips/didYouKnowFacts.ts`), tagged `curated: boolean`
  per fact** — rather than maintaining separate lists per tier. Only `curated: true` facts (~39,
  hand-picked for genuine surprise/value) ever feed contextual nudges or the rotating cards; "Discover
  Penny" shows the full library regardless of the flag. This is also why the flag lives on the fact
  itself, not on the tier — the same fact can be curated-and-ambient AND full-catalogue-browsable at
  once, with zero duplication.
- **`features/tax/DidYouKnow.tsx` (the one pre-existing precedent — a Tax-only, non-persisted
  fact-cycling card) was generalized into a shared `DidYouKnowCard`, not left as a special case.**
  `taxFacts.ts` stays the single source of truth for those specific facts, folded into the shared
  library as `module: 'tax'` entries; Tax's own screen becomes a thin wrapper passing `module="tax"`,
  with no behavior change for that screen.
- **Home's daily card (`DailyTipCard.tsx`) is a genuinely separate component from the ambient
  `DidYouKnowCard`**, not a variant/prop of it — its sequential "reveal one new curated tip per
  calendar day, stop once all have been shown" state machine is meaningfully different from
  `DidYouKnowCard`'s simpler "always show something, tap cycles freely" ambient behavior (used by
  Analytics and Tax). Keeping them separate avoided forcing one component to carry two different
  state models behind a mode flag.
  - Its placement (the very top of Home, above the at-a-glance summary) was a real back-and-forth —
    an initial mockup placed it lower (below the Financial Health Card) specifically to avoid
    displacing the numbers users open the app to check; the user reconsidered and asked for the very
    top instead, reasoning Home is the most-visited screen and deserves the highest-visibility spot.
    Deferred to that explicit call after voicing the tradeoff once.
- **Dismiss/seen persistence follows the exact existing `Set<string>`-JSON-in-AsyncStorage convention**
  already used by `penny_vacation_note_dismissed`/`penny_recurring_due_dismissed`/
  `penny_milestone_seen` (`apps/mobile/src/lib/tipsStorage.ts`) — no new persistence pattern introduced.
- **Trigger conditions (`core/tips/tipTriggers.ts`) are plain, unit-tested pure functions taking
  primitives** (a count, a boolean, a computed "months tracked" number) — never coupled to a specific
  screen's hook shape, so each screen computes its own already-available state and just calls the
  matching trigger function, keeping the core logic screen-agnostic and cheaply testable.
- **Deliberately no cross-surface "only one new fact app-wide per day" coordination** between Home's
  daily card and the ambient cards (Analytics/Tax) — considered and simplified away: Home's card alone
  carries the "special, once-a-day" framing; the ambient cards staying simple, always-on tap-cycle
  surfaces (matching the original Tax precedent's own simplicity) was judged not worth the added
  cross-component state-coordination complexity for the marginal anti-repetition benefit.

### Decision: `tools/` — a new top-level home for dev tooling, outside the pnpm workspace (2026-08-16)

**Rationale:** the SMS parser needed a way for non-developer testers (people with years of real bank SMS
history, not codebases) to test the real parsing logic without needing the app, a device, or Node/pnpm
installed. `tools/sms-parser-verifier/` is the first thing here — a standalone, offline HTML page (see
`docs/features/sms-tracking.md`'s own section and the tool's own README) bundling the **real**
`packages/core/src/core/sms-import/{smsParser,smsPatterns}.ts` (via `esbuild`, `scripts/build-sms-verifier.mjs`,
`pnpm build:sms-verifier`) into one dependency-free file, rather than hand-duplicating the matching logic
into a second copy anywhere. A few choices worth recording:

- **`tools/` is deliberately NOT added to `pnpm-workspace.yaml`'s `packages` list** — nothing inside it
  needs its own `package.json`/dependencies or participates in the monorepo's `tsc -b` project-reference
  graph; it's built by a root-level script using a root-level `esbuild` devDependency, mirroring how
  `apps/mobile/builds/`'s committed APKs are generated artifacts living outside any package boundary. A
  small standalone `tools/sms-parser-verifier/tsconfig.json` exists purely so a developer can manually
  `tsc --noEmit` the tool's own glue code after an edit — esbuild itself only transpiles, never type-checks.
- **The generated HTML is committed, not gitignored** — same precedent as the mobile APKs: the intended
  audience (real-world testers) needs to be able to grab and open a single file with no build step of
  their own, not run `pnpm install`.
- **`import.meta.env` (Vite-only, used transitively by `core/net/apiBase.ts`) is statically replaced with
  `{}` at build time** (esbuild's `define` option) rather than avoided by not importing the real
  `smsPatterns.ts` module — this tool only ever calls `parseSms()` directly against the bundled
  `SMS_PATTERNS_FALLBACK`, never `getSmsPatternBundle()`'s live-fetch path by default, so the resulting
  `undefined` env values are harmless; importing the unmodified production file (rather than a trimmed
  copy) is what keeps this a single source of truth.
- **A real bug caught before shipping:** the build script's first version used
  `template.replace('/*__SCRIPT__*/', script)` (a string replacer) to inline the bundled JS into the HTML
  shell — `String.replace` interprets `$`-patterns (`$&`, `$1`, etc.) in a _string_ replacement argument
  even when the search value is a plain string, and the bundled JS legitimately contains a literal `$&`
  (from a regex-escaping helper elsewhere in `packages/core`), corrupting the output. Fixed by using a
  function replacer (`() => script`), whose return value is always inserted verbatim — a real,
  non-obvious gotcha worth remembering for any future "inline this string into a template" script.

**Follow-up — Command Center redesign (2026-08-16):** after user feedback that the first version's two
plain tabs hid too much ("the parsers are hidden, there is no way to know if a message was checked
against all configured [templates] or only a single one"), the tool was rebuilt around a real diagnostic
primitive rather than just a nicer skin:

- **`traceSms()` added to `smsParser.ts`** (`packages/core/src/core/sms-import/smsParser.ts`) — a full
  per-template match trace (`SmsParseTrace`/`SmsTemplateTraceEntry`), with `parseSms()` reduced to a thin
  `return traceSms(...).outcome` wrapper so there remains exactly one copy of the matching logic, and
  every existing caller/test is unaffected (verified by rerunning the full pre-existing test suite before
  adding new `traceSms`-specific tests). Recording `attempted: false` (not "didn't match") for any
  template after an earlier one already won is the key faithfulness detail — it mirrors `parseSms`'s real
  "first structural match wins, stop looking" short-circuit instead of implying an ambiguity production
  code never actually reaches.
- **Capture-group highlighting everywhere, always on:** the regex is additionally compiled with the `d`
  (`hasIndices`) flag inside `traceSms()` only (parseSms's own historical `i`-only compilation is
  untouched) to recover each named group's character offsets, letting the UI wrap the exact matched
  substring in a colored `<mark>` — one shared rendering helper used by both the browse view and the
  test-your-own view, not two implementations.
- **A 3-mode "Command Center" shell** (persistent bank sidebar + main content, dark theme) replacing the
  old 2 tabs: Known templates (every configured template per bank, not just a synthetic pass/fail),
  Test your own (paste/upload, reworked into filter tabs + a dense one-line-per-message table with
  click-to-expand trace detail — a full-width card per message, the first version's approach, doesn't
  scale to the thousands of real messages testers actually have), and a new Add a parser mode (drafts a
  candidate template, session-scoped via `localStorage`, live-tested against pasted samples, exportable
  as ready-to-paste `SmsTemplateEntry` code — never auto-written to any file).
- Followed the project's mockup-first workflow throughout: `docs/mockups/proposals/sms-verifier-redesign-v1.html`
  (3 alternative designs, Command Center recommended) then `-v2.html` (same file, iterated twice within
  one approval cycle per this doc's own "one file per discussion" convention) before any of the above was
  implemented.

**Follow-up — Add-a-parser split-pane (2026-08-16):** real usage of the Command Center's "Add a parser"
mode surfaced a UX bug — the New-bank-ID and Sender-ID-pattern fields updated form state but never
re-triggered a live re-test, so fixing a broken regex and only touching those two fields left the preview
looking silently stale. Fixed alongside a requested redesign
(`docs/mockups/proposals/sms-verifier-add-parser-redesign-v1.html`, Option B chosen): a split pane (fields
left, bulk paste-and-test right, reusing "Test your own"'s `---`-block format instead of a single
sender/body pair) with an explicit ▸ Test button replacing continuous auto-retest — one deliberate action
that always re-tests off the full current form state, regardless of which field was last edited.

**Follow-up — "Unified Workspace" redesign (2026-08-16):** further real-usage feedback found the 3-mode
split itself to be the root cause of several complaints at once, not three independent gaps: "why 3
tabs," "can't define a sender for a new template on an existing bank," "can't edit a known template,"
"no way to export everything," "the results table needs richer inline info," "test any sender freely
isn't discoverable," and "help users write a new regex." Rather than patching each individually on the
existing 3-mode shell, `entry.ts` was rebuilt around one workspace per sidebar selection — a bank, or a
pinned "Bulk test — all banks" entry — with:

- **A new session-state model** (`SessionState`: `newBankIds`, `extraSenderPatterns`, `newTemplates`,
  `overrides`, replacing the old flat `DraftTemplate[]`/`smsVerifierCustomTemplates`) — `overrides` is new:
  a session-local replacement of an official bank's template at a given array index, never mutating
  `SMS_PATTERNS_FALLBACK` itself; "Revert to official" just removes the entry. `effectiveBundle()` is the
  one place all four pieces merge, read by every other function in the file.
- **Regex ↔ message side-by-side, same color mapping**: `findNamedGroupSpans()` statically parses a
  regex's own `(?<name>...)` spans (a balanced-paren walk over the pattern source, not a runtime match);
  the previous `highlightedText()` was refactored into a lower-level `markedNodes()` primitive that both
  the message-highlighting and the new `highlightedPattern()` build on — one shared "wrap ranges in
  colored `<mark>`" implementation, not two. While editing, the live preview re-tests the in-progress
  regex against that template's own original sample (`smsSampleMessages.ts`) on every keystroke.
- **Editable sender patterns for every bank** (not just brand-new ones) with a live, non-blocking overlap
  warning: `literalFragments()`/`sharesSignificantPrefixOrSubstring()` pull out and compare a pattern's
  literal uppercase "bank code" run against every other bank's patterns — cheap and explainable rather
  than executing arbitrary regexes against candidate strings. The same heuristic powers a "did you mean
  `<bank>`?" suggestion for an unrecognized sender in the results table (e.g. "SBIPSG" sharing SBI's
  "SBIINB" prefix), one click away from being added as that bank's own custom sender pattern.
- **Results table upgrade** (shared by the bank-scoped tester and Bulk test — one `renderResultsTableInto()`,
  not two): the Message column renders through the real highlighting primitive instead of flat gray text,
  plus a compact trace-strip column (colored dot per template attempt: matched/tried-no-match/skipped).
- **Auto-detect vs Force-against-this-bank** tester toggle — Force builds a synthetic single-bank bundle
  with `senderIdPatterns: ['.*']` so a message's body can be tested against a bank's current templates
  independent of whether its sender is recognized yet, isolating the two questions.
- **Export/Import** — Export serializes `effectiveBundle()` to JSON (confirmed, by reading
  `workers/api-proxy/src/index.ts`'s actual `/sms-patterns` handler, to be identical in shape to its real
  response — not assumed); Import parses a same-shaped JSON and merges every bank/template into the
  session's drafts additively (never attempting fine-grained per-template conflict resolution — a
  deliberately simple v1 scope, disclosed as such rather than over-built).
- **Regex helper panel** next to every pattern field: a curated "common patterns" snippet list grounded by
  grepping the real, already-shipped `smsPatterns.ts` for its actual capture-group idioms (not invented),
  click-to-insert-at-cursor, plus a general regex-syntax cheat sheet tab.
- Followed the mockup-first workflow again:
  `docs/mockups/proposals/sms-verifier-unified-workspace-v1.html`, iterated in place through several
  rounds of feedback within one approval cycle (adding the fuzzy-suggestion/overlap-warning/import ideas,
  then the regex↔message side-by-side pairing) before any of this was implemented.

**Follow-up — "Unified Workspace v2" light-theme redesign + module split (2026-08-16):** real feedback on
the v1 dark theme was sharp and specific: the dark theme itself was hard to use, and — the bigger
structural problem — a bank's page put its 3 templates ahead of the actual testing space, when testing
thousands of messages per bank is the tool's primary job, not a secondary one. Rebuilt around a real,
interactive prototype rather than another static mockup (`docs/mockups/proposals/sms-verifier-unified-
workspace-v2.html` — built with a fake 2,400-row dataset specifically so real pagination/search/progress-
bar behavior could be seen working before any app code changed, since static mockups had repeatedly proven
"confusing... I do not realize until it's built" per that same feedback):

- **Light theme, three columns**: left sidebar (banks + pinned Bulk test, drag-resizable), middle column
  dedicated ENTIRELY to test input + results (never templates/sender patterns — that was the root cause
  being fixed), right panel as a read-only-at-a-glance reference (sender patterns + template "paper"
  cards, also drag-resizable via a plain mousedown/mousemove/mouseup handle, no library).
- **`entry.ts` split into focused modules** after separate, explicit feedback that one ~1,874-line file was
  itself making edits slower and more error-prone ("Maybe longer files are creating a problem for you to
  properly edit them without breaking?"): `state.ts` (session/data layer, zero dependency on rendering
  code — `SessionState`, `effectiveBundle()`/`effectiveBundleForTesting()`, later also the editable Common
  Patterns library), `dom.ts` (the `el()` builder, clipboard-with-legacy-fallback, download, toast),
  `highlighting.ts` (the one shared `markedNodes()` "wrap ranges in colored `<mark>`" primitive), and
  `regexAuthoring.ts` (compile checks, fuzzy heuristics, the regex helper panel). The convention: a
  reassigned (not just mutated) module-level primitive needs an explicit setter function for cross-module
  writes (`setSelection()`, `setModal()`, etc.) since ES module named imports are live bindings for reads
  only. Verified the split preserved 100% of existing behavior via a full functional smoke-test re-run
  (jsdom driving the actual built HTML) before any further feature work — every subsequent round of fixes
  in this file then stayed small, targeted edits rather than repeated full-file rewrites.
- Two large sequential rounds of concrete UX fixes followed on this new foundation, each fully verified
  (jsdom functional tests against the real built HTML + the standard `tsc`/eslint/prettier/vitest/PII-gate
  sweep) before being reported back: an 11-item round (drag-resizable sidebars; an editable original
  sample instead of read-only; disable-vs-delete for templates so a toggled-off one stays visible to
  re-enable; a real in-tool "New bank" popup replacing a native `prompt()`; bank-scoped Export actually
  downloading, not just copying; results hidden until Test/Parse is actually clicked; a Trace column
  replacing redundant expanded-row content; the per-row copy icon moved inside the message cell; a Bank
  column; a sender-recognized/unrecognized color cue; a template's sender field actually re-tested against
  the bank's real patterns instead of a silent `.*` catch-all); then a 4-item round (a new/edited
  template's test message persisted as its real reference sample — which is also what makes its matched/
  no-match pill appear at all; the results table's Message column no longer truncated with an ellipsis).
- **Follow-up — further hardening (2026-08-16):** a later pass added: a fully editable Common Patterns
  library (add/edit any entry, live duplicate detection that visually highlights the existing match, not
  just a text warning); a proactive warning when a template's regex names a capture group the real parser
  doesn't recognize (explains, rather than leaves a mystery, why a field silently isn't highlighted in a
  real test message — `CAPTURE_GROUP_NAMES` was exported from `smsParser.ts` specifically so the tool could
  check against the SAME closed list production code reads, not a hand-copied duplicate of it); a post-save
  suggestion to catalog a template's own uncatalogued capture-group sub-pattern into Common Patterns;
  dynamic per-distinct-name color assignment for capture groups (previously only a fixed handful of names
  colored at all, leaving any custom name uncolored — extended the palette from 4 to 6 colors so `ref`/
  `balance`/`dateStr` also stopped sharing one color); a clear inline error (instead of an empty results
  block quietly rendering) when Test/Parse is clicked with nothing pasted and no file uploaded; the Test
  sender/Test message body fields moved to sit directly below the regex pattern field in the same column
  (filling space that used to sit empty next to the taller helper panel) instead of their own separate
  full-width row; and every modal made user-resizable via the native CSS `resize` property (opt-in, from
  the bottom-right corner, with sane min/max bounds) rather than a fixed size.

**Follow-up — TRAI 2025 sender-header-suffix support (2026-08-17):** TRAI's SMS header suffix mandate
(effective 6 May 2025, per the amended TCCCPR regulations) requires every registered header to carry a
single-letter category suffix appended after the existing 6-character brand code: `-T`
(Transactional), `-S` (Service — real-world DLT registrations show plenty of banks' own transactional
alerts filed under this category, not just `-T`), `-P` (Promotional), `-G` (Government). Every bank in
`smsPatterns.ts`/`workers/api-proxy/src/smsPatterns.ts` (kept in sync, confirmed byte-identical data)
gained two additive `-[TSPG]`-tolerant sender patterns (prefixed and unprefixed) alongside its
originals — old, un-suffixed patterns are untouched, since a historical multi-year scan keeps
encountering plenty of genuine pre-May-2025 messages that never had a suffix at all. Caught one real
bug this surfaced in the tool: `literalFragments()` (the fuzzy sender-suggestion heuristic) was reading
a `[TSPG]` character class as a literal 4-letter fragment — fixed by stripping bracket expressions
before matching.

**Follow-up — sender/message exclusion, both the tool and the real app (2026-08-17):** real usage
surfaced that "Partial/Unparsed" was conflating two genuinely different things: a real coverage gap
(recognized bank, wrong wording — worth a new template) vs. not a transaction at all (OTP, promotional,
government, non-financial service pings — no template should ever be written for these). Both surfaces
gained the same split, though with different mechanics given their different stakes:

- **The tool** (session-only, low-stakes test data): `-P`/`-G` senders auto-bucket into an Excluded
  filter (reversible per-sender via `autoExcludeOverrides`, since suffix categorization isn't
  guaranteed accurate); manual exclusion exists at BOTH sender level (`excludedSenders`) and per-message
  level (`excludedMessageKeys`, keyed by `` `${sender}::${body}` ``), since a sender can genuinely mix
  real transactions with noise. A new "Senders in this batch" summary strip doubles as the "select a
  sender to see all its messages" drill-down (reuses the existing search box rather than a second
  filter mechanism). `effectiveOutcomeKind()`/`exclusionReasonFor()` in `state.ts` are the one place
  every stat card/filter/badge/export reads the EFFECTIVE bucket from, rather than the raw
  `traceSms()` outcome directly.
- **The real app** (durable, touches actual user data — a deliberately more conservative design given
  the higher stakes of auto-excluding real financial messages): a new `sms_excluded_senders` Dexie
  table (schema v15, `docs/SCHEMA.md`), sender-level only (no per-message durable exclusion — the
  existing per-message `dismissed` status already covers that case for one already-created record). No
  auto-exclusion by suffix at all — every exclusion here is an explicit "Exclude sender" tap on the
  already-shipped Unparsed Messages sender-group accordion. `processRawSmsCore` checks
  `ProcessRawSmsContext.excludedSenders` before parsing at all, dropping a match exactly like an
  `unrecognized_sender` — applies uniformly across historical scan, foreground live capture, and the
  Headless JS background path, since all three funnel through this one function. "Exclude sender" also
  dismisses that sender's currently-showing `'unparsed'` records (via the existing `dismissUnparsed`),
  so excluding clears the current batch immediately rather than only preventing future recurrence.

**Follow-up — HDFC/IndusInd/HSBC real-world templates + capture-group schema rename (2026-08-18):**
HDFC's 3 templates (previously synthetic) and IndusInd/HSBC's single invented templates were replaced
with a verified real-world set (9/8/10 templates respectively), sourced from real, user-verified
message wording. The provided regexes were kept as-given rather than "cleaned up" — every named group
(currency, bank name, description, etc.) is preserved exactly as provided even where the schema
doesn't read it, and `account`/`card` capture the FULL masked token each bank's SMS actually presents
(e.g. IndusInd's `159***660960`), not a trimmed last-4-digit substring. This means
`smsAccountMatch.ts`'s exact-string auto-linking won't match for these three banks' real messages — a
known, accepted gap (`docs/features/sms-tracking.md`'s "Current limitations") rather than something
patched around in the regex. Three HSBC wordings that captured `credited|debited` at match time were
split into matched credit/debit template pairs, since `transactionType` is a fixed property per
template here, not something derivable from a capture at runtime — extending the parser to support a
capture-driven `transactionType` was considered and explicitly declined in favor of keeping the split.
One genuine regex defect was fixed (not a stylistic change): HDFC's debit-card-alert wording was
missing an optional `On ` that 2 of its own 4 real samples actually have.

Separately, `SmsCaptureGroupName` (`smsParser.ts`) was renamed from `acctLast4`/`cardLast4`/`ref`/
`dateStr` to `account`/`card`/`reference`/`date` — adopting the verified source's own naming
convention as Penny's canonical schema, rather than renaming the provided regexes to fit Penny's
prior names. This is a global rename (all 12 banks' templates, `CAPTURE_GROUP_NAMES`, the verifier
tool's `GROUP_COLOR_CLASS`/`BUILTIN_SNIPPETS`/UI label text) — `ParsedSmsCandidate`'s own output field
names (`accountLast4`, `cardLast4`, `referenceNumber`, `date`) are a separate, already-decoupled layer
(explicitly mapped inside `traceSms()`) and were not touched, so no consumer of a parsed candidate
needed any change. `workers/api-proxy/src/smsPatterns.ts` was updated identically (confirmed
byte-identical `pattern` strings against the core file) and redeployed live.

**Real bug found via this same on-device pass, not yet fixed:** rolling out the HDFC/IndusInd/HSBC
templates above to a real device that already had an earlier Penny install exposed that
`getSmsPatternBundle()`'s local cache (`penny_sms_patterns_v1`, `smsPatterns.ts`) has **no version/hash
check** — it trusts anything under 7 days old regardless of whether it matches what the current build
actually ships, so an APK update-in-place (not uninstall/reinstall) can silently keep running a
pre-update template set for up to a week. See `docs/features/sms-tracking.md`'s "Current limitations"
for the full detail and the intended fix (stamp the cache with a version/hash of the shipped bundle,
invalidate on mismatch).

### Decision: Real-device-testing-pass Phases 1–3 (2026-08-18) — `apps/mobile` + `packages/core` + `workers/groups` only

**Rationale:** a batch of real-device testing findings, fully detailed in
[`docs/plans/real-device-testing-pass.md`](../plans/real-device-testing-pass.md). `apps/web-react` is
frozen, so none of this touches it — mobile diverges further from web on every item below, by design.
A few pieces worth a durable architectural note beyond what the feature docs (`docs/features/iou.md`,
`docs/features/groups.md`, `docs/features/backup.md`, `docs/features/sms-tracking.md`) already cover:

- **`apps/mobile/src/lib/modalStack.ts` (new)** — a tiny module-level open-modal counter fixing "toast
  blocks app interactivity." Root cause: Android's Dialog-backed `Modal` window intercepts every touch
  within its bounds at the OS level, before RN's own `pointerEvents` logic ever runs — no prop can opt a
  Modal's window out of this, it's inherent to how Android dispatches touches. `~/components/ui/Modal.tsx`
  registers itself here on mount/unmount; `ToastContext.tsx` only wraps a toast in a real `<Modal>` when
  another modal is already open (the one case that still needs to stack above it) — otherwise it renders
  as a plain high-`zIndex` sibling `View`, letting taps and the hardware back button reach whatever's
  underneath with zero interception.
- **`packages/core/src/core/db/normalizeHashtagCase.ts` (new)** — a boot-time idempotent repair pass
  lowercasing every `Hashtag.name`/`Expense.hashtags[]` entry and merging any that collapse to the same
  lowercase form, following the exact same pattern as `repairCategoryIcons()`/`reconcileDefaultCategories()`
  in `dedupeDemoCategories.ts` (safe to run every app start, cheap no-op once already normalized) rather
  than a versioned Dexie migration — chosen because encrypted stores can't use Dexie's `.upgrade()`
  hooks at all (same reasoning as the pre-existing IOU `personal_ious` migration).
- **`packages/core/src/core/iou/personResolver.ts` (new)** — consolidates three independent
  reimplementations of "resolve a typed name to a Person, creating one if needed"
  (`useIou.ts`/`useExpenses.ts`/`useBankImport.ts`'s own `resolvePerson`) into one function that always
  re-reads `personsRepo` fresh rather than matching against a caller's possibly-stale in-memory array —
  the real root cause of a duplicate-person bug (typing the same name in two different, already-mounted
  screens created two `Person` rows instead of resolving to one). `useBankImport.ts`'s own
  `resolvePerson` already did this correctly; this generalizes from that reference rather than inventing
  a new approach.
- **Three cross-feature shared-component extractions, same underlying pattern each time** —
  `apps/mobile/src/components/shared/PersonTypeahead.tsx` (out of `features/iou/PersonPicker.tsx`, needed
  by `components/shared/ExpenseForm.tsx`'s Lent/Borrowed panel), `apps/mobile/src/components/shared/
WizardProgress.tsx` (moved from `features/import/`, needed by the new `BulkAddToIouModal.tsx` and
  `PromoteToGroupWizard.tsx`), and `apps/mobile/src/hooks/useServerActionError.ts` (moved from
  `features/groups/`, needed by `PromoteToGroupWizard.tsx`, an `features/iou/` file). All three hit the
  exact same wall: **a `features/` module cannot be imported by `components/shared` or by another
  `features/` module** (the existing "Feature module isolation" decision above) — confirmed 3 times in
  one pass that this rule holds and that the fix is always the same (promote the shared file out of
  whichever feature folder it happened to be born in), not a new rule.
- **A real bug found via audit, not a bug report:** `packages/core/src/core/db/seedDemoData.ts`'s Student
  persona's simulated Cash account actually went to **−₹920** on a seeded date — an unscaled "wobble"
  term in the simulation broke proportionally at the Student persona's low expense scale (a term sized
  for a salaried persona's larger numbers became disproportionately large relative to a student's small
  ones). Fixed, plus a new regression test covering all 5 employment-type personas
  (`packages/core/tests/db/seedCash.test.ts`) so this can't silently regress again.
- **Groups (Track E) redesign — the largest single piece of this pass:** see
  [`docs/features/groups.md`](../features/groups.md) for the full detail (new event types, static
  members, admin-less server-side protection, delete-when-empty, orphaned-shared-transaction
  tombstoning, the `groupFeed()` dedup bug fix, write-off/undo-write-off) and
  [`docs/features/iou.md`](../features/iou.md) for the personal-ledger-side changes (duplicate-person
  fix, person type-ahead, real delete/archive confirmation, bulk-add-to-ledger, edit-mode type toggle,
  cash-negative warnings, promote-to-group).

### Decision: Real-device-testing-pass Phases 4–6c (2026-08-19) — account cards, About Penny, Analytics, backup/restore, CSV import

**Rationale:** continues the same real-device-testing pass above, fully detailed in
[`docs/plans/real-device-testing-pass.md`](../plans/real-device-testing-pass.md). `apps/web-react` stays
untouched (frozen). Durable architectural notes beyond what the feature docs
(`docs/features/accounts.md`, `docs/features/backup.md`, `docs/features/expenses.md`,
`docs/DESIGN_GUIDELINES.md`) already cover in full:

- **Account list: gradient mini card replaced with a grouped flat list + tap-to-reveal actions.**
  `AccountList.tsx` rewritten wholesale — see `docs/DESIGN_GUIDELINES.md`'s "Grouped flat list +
  tap-to-reveal actions" entry (its "Identity-colour gradient mini card" predecessor is marked
  superseded there, not deleted, for history) and `docs/features/accounts.md`. `accountCardPalette()`/
  `JEWEL_PALETTE`/`GREEN_PALETTE` (`~/lib/color.ts`) are removed, not left as dead code. New
  `apps/mobile/src/components/shared/BankLogo.tsx` is the single resolution seam for "what icon does
  this account show" (real per-bank logo when `account.bankId` matches a sourced mark, else the
  existing generic `Icon`/`account.color` fallback) — every account-icon render site should go through
  it rather than calling `<Icon>` directly, so sourcing a new bank's logo only means adding one entry to
  `BANK_LOGOS`, not rewiring call sites. Now covers HDFC/ICICI/Axis/HSBC (Simple Icons CC0 marks,
  verified against two independent CDN mirrors, not fabricated); the remaining 8 presets checked again
  and confirmed to have no safely-redistributable logo _mark_ — but colors aren't copyrightable, so
  `bankAccentColor()` (`components/shared/bankAccentColor.ts` — its own file, not `BankLogo.tsx`, since
  a component file can't carry a second non-component export under `react-refresh/only-export-
components`) tints the generic fallback icon/badge with each bank's real brand color for 3 of those 8
  (SBI, Kotak, IndusInd) where that color was verified; the other 5 (BoB, Yes Bank, PNB, Canara, IDFC
  First) have no verified color either and stay on the plain account-type default.
- **About Penny + a new standalone Privacy Promise page (`AboutPennyPage.tsx`,
  `PrivacyPromisePage.tsx`, `whatsNew.ts`, `apps/mobile/src/lib/appVersion.ts`,
  `apps/mobile/src/features/onboarding/privacyPillars.ts`) — mobile-only, no `apps/web-react`
  equivalent, same precedent as `PennyLoader`/"Did You Know."** The existing onboarding
  `PrivacyPromiseScreen` has no header/back button by design (meant to be seen exactly once,
  pre-unlock) — linking an already-onboarded user there from Settings would strand them with no way
  back, so a second screen with identical content plus a real back button was added rather than adding
  a back button to the onboarding screen itself (which would have changed onboarding's own flow for no
  reason). Both screens now read from one shared `privacyPillars.ts` (mission statement + pillar
  content factored out of `PrivacyPromiseScreen.tsx`) so the two copies can't drift apart. Routes
  registered in `HomeStack.tsx`, not `MainNavigator.tsx` (only holds `MainTabs`/`OnboardingFlow`).
- **`MonthScrubBar.tsx`: a native-bridge measurement call is not a portable fix for an RN-Web bug.**
  The previous fix for its auto-scroll race used `View.measureLayout` for a fresh same-tick read —
  correct on real native devices, but `react-native-web`'s shim for that call doesn't reliably return
  scroll-aware coordinates, so the bug reappeared on RN Web specifically. Replaced with a plain
  `onLayout`-cached offset (identical on every platform) plus deferring the read two
  `requestAnimationFrame` ticks, fixing the actual underlying race (a state update landing before its
  own layout pass has run) instead of trying to win it with a platform-specific measurement call.
  Worth remembering for any future fix that reaches for `measureLayout`/`measureInWindow`/similar
  native-bridge measurement APIs: verify on RN Web too, not just native, before calling it done.
- **Backup/restore: two severe bugs found via a real "can't restore any backup" report** — a missing
  `await` on `expo-file-system`'s async `File.write()` in six call sites, and `BACKUP_STORES` having
  silently drifted 8 real tables behind `schema.ts` (`accounts` most severely — every
  `Expense.accountId` references it). Full detail in `docs/features/backup.md`. Worth a standing habit,
  not just a one-time fix: whenever a new encrypted Dexie store is added to `schema.ts`, check whether
  it belongs in `backupManager.ts`'s `BACKUP_STORES` in the same change — nothing currently enforces
  that the two stay in sync.
- **CSV import: the 2026-08-13 bulk-import render-cap rule (`CLAUDE.md`'s Reliability non-negotiables)
  had an incomplete application, not a wrong one.** `TransactionsStage.tsx` capped the _rows_ inside one
  tile (`TileRowList.tsx`) but rendered the _tiles themselves_ — `needsInputGroups`/`stagedGroups`/
  `skippedGroups` — via a plain unbounded `.map()`. Same "Show N more" pattern added to all three, plus
  `review/CarryForwardExcluded.tsx`'s own previously-uncapped row list. A reminder that this rule needs
  checking at every `.map()` over bulk/imported data in a render tree, not just the first one found.

### Decision: Real-device-testing-pass follow-up session (items 59–68) — `apps/mobile` + `packages/core` only

**Rationale:** a further round of real-device findings on top of the two entries above, fully detailed
in [`docs/plans/real-device-testing-pass.md`](../plans/real-device-testing-pass.md)'s "7th batch" (plus
items 59–64). `apps/web-react` stays untouched (frozen). Most items are one-file bug fixes already fully
covered by `docs/features/backup.md`, `docs/features/expenses.md`, and `docs/SCHEMA.md` — one is a
genuinely reusable lesson worth its own note here:

- **A dynamic `zIndex` toggle on Android can recreate a native view mid-keystroke and silently dismiss
  the soft keyboard.** `PersonTypeahead.tsx` (the shared person-suggestion field used by
  `ExpenseForm.tsx`'s Lent/Borrowed panel and `BulkAddToIouModal.tsx`) toggled its outer wrapper's
  `zIndex` between `50` and `undefined` depending on whether its suggestion dropdown was showing. On
  Android, changing a view's `zIndex` at the native rendering layer isn't a cheap style tweak — it can
  force that view to be torn down and recreated, and when that happened to land mid-keystroke while the
  soft keyboard's IME still held focus, the IME was dismissed with no error, no crash, just a keyboard
  that silently closed while typing. This is the _real_ root cause of a bug two earlier fix rounds
  (items 24/36, a missing `onShow`+ref pattern for `autoFocus` inside a `Modal`) had misattributed —
  that pattern is real and still correct for its own bug (`ExpenseForm.tsx`'s description field), but it
  never explained this one, and wasn't confirmed end-to-end on-device before being treated as the fix.
  The actual fix: keep `zIndex` fixed at all times, and toggle only the dropdown's own
  `display: 'flex'/'none'` to show/hide it — never let a visibility toggle double as a style change that
  can trigger a native view remount. Worth checking for on any other Android-facing component that
  conditionally applies `zIndex` (or other native-remount-prone style props) based on transient UI state,
  not just this one.
- New mobile-only `apps/mobile/src/components/shared/BackupProviderLogo.tsx` (`DriveLogo`, `AppleLogo`,
  `DRIVE_BLUE`) — real colored Drive/Apple marks for the Automatic Backup card's destination tabs,
  rendered via `IconBadge`'s `iconElement` prop; see `docs/features/backup.md`.
- `apps/mobile/src/components/ui/Card.tsx` gained an optional `style` prop (mobile's `Card`, distinct
  from the `className`-based web-react `Card.tsx` documented in the Component inventory above) so
  `IpoTab.tsx` could render a colored left-edge GMP stripe without a one-off wrapper component.
- **A live-preview path and a final-commit path in the same pipeline can drift out of sync, and a fix
  applied only to one of them won't be visible to the user until commit.** The Cashew CSV import
  transfer-pairing bug (item 68) took 3 rounds to actually close: rounds 1–2 were real, correct fixes in
  isolation (a category-defaulting improvement, then a pure function that resolved confirmed transfer
  pairs) but both landed only in the commit-time path (`useImport.ts`'s `commitAndImport()`) while the
  _live_ `rowActions` memo — the thing actually driving what the categorization UI shows the user while
  reviewing — kept re-poisoning the same rows. Round 3 applied the identical resolution at the live memo
  too. Worth checking both paths, not just the one a unit test can reach, whenever a bug report describes
  something the user sees mid-flow (not just in the final imported result).

### Decision: Real-device-testing-pass 8th/9th batches (2026-08-23) — MoneyView CSV import review + Penny CSV export/import + Groups-leave review

**Rationale:** two dedicated reviews on top of the general real-device-testing pass above, fully detailed
in [`docs/plans/real-device-testing-pass.md`](../plans/real-device-testing-pass.md)'s "8th batch" (items
69–75, MoneyView CSV import) and "9th batch" (items 76–80, Penny CSV export/import + a Groups fix found
while investigating it). `apps/web-react` stays untouched (frozen). Full detail already covered by
`docs/features/expenses.md`'s two new dated entries and `docs/features/groups.md`'s new "Leaving a group"
section; one cross-cutting note worth keeping here:

- **New files**: `packages/core/src/core/import/importCashWithdrawalGrouping.ts`
  (`groupCashWithdrawalCandidates`, unit-tested) partitions a cash-withdrawal category's rows by resolved
  source account _before_ generating suggestions, so a category spanning several real accounts produces
  one accurate suggestion per account instead of one vague "Multiple accounts" fallback.
  `apps/mobile/src/features/import/review/CashWithdrawalSeeAllModal.tsx` (virtualized date+amount list,
  same `Modal` shell as `TransactionBrowserModal.tsx`), `DuplicatesSeeAllModal.tsx` (same shell, reused
  for a duplicates group's own paired-card list), and `DuplicatePairRow.tsx` (the paired CSV-row/matched-
  expense card, extracted so `DuplicatesBucket.tsx`'s inline list and its new "See all" modal share one
  implementation instead of two).
- **A generic import pipeline paying off again**: item 77 (resolving a re-imported Penny CSV's IOU-person
  column) needed zero bespoke branching anywhere in `importPipeline.ts`/`importAccountResolution.ts`/
  `importCategoryResolution.ts`/`importWriter.ts` — confirming the same "Penny/Cashew/MoneyView/Custom are
  presets over one generic engine, not per-format code paths" design (see the platform-variance
  decision above and `docs/features/expenses.md`'s Import section) held up cleanly for a fully new column
  a year after the engine was first built.
- **`GroupStatus` gaining `'left'`** (`leaveGroup()` no longer deletes the local group/`group_events` on
  leave) is the same event-sourced, never-delete-history principle the rest of Groups already follows
  (balances/feed are folded projections, never mutated in place) — leaving is now just another status
  transition alongside `closed`/`active`, not a special-cased hard delete.
- Two pre-existing lint errors (unrelated to this batch, found only because it happened to touch the same
  test files) were fixed while here rather than left to block the eventual commit — see the plan doc's
  8th-batch verification note for the exact commits they trace to.

### Decision: PPF import/manual-entry fixes, onboarding Add-Account reuse, Backup History, controlled-input bug class (2026-08-24)

**Rationale:** four independent items landed in one session, none part of the real-device-testing-pass
punch list above — full detail in `docs/features/portfolio/retirement.md` (PPF), `docs/features/
onboarding.md` (Add Accounts), and `docs/features/backup.md` (Backup History). Cross-cutting notes worth
keeping here:

- **PPF's multi-year import bug and its manual-entry counterpart are the same root cause, one FY apart**:
  `ppfReconciliation.ts` computing a FY's "Calculated" interest against a balance basis missing a prior
  FY's own already-credited interest. The import fix scoped an over-broad exclusion filter; the manual-
  entry fix (`earliestBlockingPpfFy()`) is a forward-looking guard against the same gap being created by
  hand. `investedAmount`'s staleness fix is the third instance of the exact bug class EPF's `currentValue`
  fix already established (a derived value never written back on save) — now fixed at the same
  `RetirementSection.tsx` `saveHolding()` choke point for a second asset class.
- **Onboarding's "Add your accounts" now stages drafts through the real `AccountFormModal`** instead of a
  bespoke inline form — the general principle (never invent a one-off account-creation UI; every entry
  point injects its own `saveAccount` into the one shared `useAccountForm`) already existed
  (`CashWithdrawalSuggestionCard.tsx`, `ResolveAccountModal.tsx`) but onboarding had drifted from it. The
  fix needed a real data-model change (`OnboardingDraftContext`'s `DraftAccount` widened to the full
  `AccountInput` shape), not just a UI swap, since a fake in-memory `saveAccount` needs somewhere to stage
  the same fields the modal collects.
- **Backup History turns a single-overwrite-file model into a real rolling log** — see `docs/features/
backup.md`'s own writeup for the naming/retention/backward-compat design. Architecturally notable:
  `CloudProvider`'s new `list()`/`delete()`/`downloadEntry()` members are **optional**, specifically so
  the frozen `apps/web-react`-only `googleDriveProvider.ts` and the still-dormant `icloudProvider.ts`
  don't need touching at all to keep compiling — an interface-widening technique worth reusing whenever a
  capability is being added to some, not all, implementations of a shared interface that spans a
  frozen/dormant surface.
- **A recurring controlled-`TextInput` bug class, now fixed at its second occurrence**: forcing a JS-
  transformed string (`.toUpperCase()`) back into a controlled `TextInput`'s own `value` on every
  keystroke desyncs the native text buffer from React state — on Android this manifests as duplicated/
  re-inserted characters, not just a case mismatch. First seen in `VehicleFields.tsx` (partially fixed —
  only the redundant CSS-transform layer was removed, the underlying re-injection risk wasn't), then
  `StockFields.tsx` (the actual reported bug). Both now let the native keyboard handle it via
  `autoCapitalize="characters"` and uppercase only at the point of use. Promoted to a full
  `CLAUDE.md` non-negotiable rule (Reliability section) given it's now recurred once already.
- **`react-hooks/set-state-in-effect` fix pattern reused twice more** (`RetirementSheets.tsx`'s PPF
  calc-prefill effect, `BackupHistoryModal.tsx`'s load-on-mount effect) — wrap the actual state-setting
  call in a same-tick `setTimeout(fn, 0)` with a matching `clearTimeout` cleanup, the same mechanical fix
  `useLivePrice.ts` already established. Now documented as a standing convention in `CONTRIBUTING.md`'s
  TypeScript standards rather than left to be independently rediscovered per effect.

### Decision: onboarding's Add-Account-modal reuse — release-only fresh-install crash, reverted then root-caused and re-shipped (2026-08-25)

**Rationale:** the previous entry's onboarding Add-Account-modal-reuse fix was committed and pushed as
part of v1.6.0's release APK without being verified on a real device first (a real process failure, not
a tooling gap — the build succeeded and the embedded version string was verified with `aapt`, which is
not the same thing as the app actually running). It crashed 100% of the time on a genuinely fresh
install, immediately at launch (`TypeError: Cannot read property 'create' of undefined`, RN's
`[runtime not ready]` prefix, surfacing natively as `std::terminate()` → `SIGABRT`).

Bisection findings (each confirmed by an actual rebuild + on-device test, not inferred):

- **Debug (Metro-served JS) never reproduced it** — only a release build did, ruling out a plain logic
  bug reproducible in dev.
- **A `./gradlew clean` failure + building anyway** (the exact cause of the _prior_ 2026-08-23 v1.5.2
  incident — `clean` fails on a known CMake/ninja codegen ordering issue, and running `assembleRelease`
  straight after reuses a mix of stale and fresh build outputs) was suspected first, since it matched
  known prior art, but a **genuinely clean rebuild** (`rm -rf android/app/build android/app/.cxx
android/build` before `assembleRelease`) **still crashed identically** — ruling that out as the cause
  this time, though it remains a real, separate gotcha worth avoiding regardless (see `CONTRIBUTING.md`'s
  "Building a standalone Android APK" gotchas).
- **Disabling JS minification did not fix it either** — this result was initially reported as a fix but
  was invalid: Gradle's `createBundleReleaseJsAndAssets` task reported `UP-TO-DATE` (it never actually
  re-ran with the new flag), so the "successful" test was unknowingly re-testing the exact same bundle.
  Confirmed by re-testing that same cached build 5 times in a row afterward with no crash at all — which
  led to the next, correct finding below rather than a false minifier conclusion.
- **The real variable was fresh-install vs. warm-relaunch, not minification or determinism.** A
  genuinely fresh install (`adb uninstall` then install) crashed 5/5 times; a warm relaunch
  (`am force-stop` + relaunch) of an _already-installed_ app with existing data survived 5/5 times, using
  literally the same APK. This is what actually explains the earlier "flaky" result — the two test
  conditions were never actually the same scenario.
- **The pre-session release APK (extracted from git history, commit `21a7f75`) did not crash on a fresh
  install** — confirming this was introduced by the current session's diff, not a latent pre-existing bug
  finally surfacing.
- **File-level bisection** (temporarily reverting individual files to their pre-session versions,
  rebuilding, re-testing fresh-install each time) isolated it to `AddAccountsScreen.tsx` specifically —
  reverting just that file (keeping `OnboardingDraftContext.tsx`/`SetupCredentialsScreen.tsx` at their
  new versions) already fixed the crash. The exact mechanism inside that file was **not** pinned down to
  a single line/import before the fix shipped — the leading hypothesis is a module-evaluation-order/
  timing issue specific to Hermes-bytecode release compilation exposed by this file's new import graph
  (`AccountFormModal`/`useAccountForm`/`ACCOUNT_TYPE_META`, none of which are new to the app, just new to
  this _screen_'s — and thus the Onboarding stack's — early-loaded import graph), but this remains
  unconfirmed via an actual symbolicated JS stack trace.

**Interim fix shipped** (v1.6.1): all three touched onboarding files (`AddAccountsScreen.tsx`,
`OnboardingDraftContext.tsx`, `SetupCredentialsScreen.tsx`) reverted byte-for-byte to their pre-2026-08-24
state (verified via `git diff` against the last known-good commit showing zero diff) — the onboarding
Add-Account consistency fix fully rolled back, not partially, to get a known-working build shipped first.

**Root cause found and the feature re-shipped the same day (v1.6.2).** With a device available again,
live instrumentation (each of `AddAccountsScreen.tsx`'s imports individually wrapped in its own
try/catch, rebuilt and re-tested fresh-install each time) isolated the crash to one single line: the
static `import { useAccountForm } from '~/hooks/useAccountForm'`. Confirmed by minimal bisection —
converting every _other_ import in the file back to a normal static `import` one at a time while
leaving only `useAccountForm` as a plain `require()` call never crashed (6/6 on-device launches: 3 fresh
installs, 3 warm relaunches); converting `useAccountForm` itself back to a static `import` reproduced the
crash again immediately. `useAccountForm.ts` has no circular import in its own dependency graph
(`@/core/accounts/meta`/`accountValidation.ts` only import types), and the identical named export is
already statically imported without issue from `AccountsPage.tsx` elsewhere in the app — so this isn't
"the hook is broken," it's specific to `AddAccountsScreen.tsx` being one of the _first_ consumers of that
export reached during cold boot (Onboarding's stack is eagerly `require()`'d by the root navigator,
confirmed directly from the built bundle's own require-graph — confirming, incidentally, that the
require-graph itself is NOT gated on onboarding status the way the leading hypothesis in the interim fix
above assumed). The leading theory: a Babel/Metro ESM-interop live-binding timing race specific to
Hermes-bytecode release compilation, where a plain `require()` snapshot sidesteps whatever the compiled
`import` statement's interop wrapper does differently for an early cold-boot consumer. Never reproduced
in a debug/Metro-served build, nor on a warm relaunch of an already-onboarded install — only a genuinely
fresh install did, at 100% before the fix and 0% after (6/6 clean launches). Fix: `AddAccountsScreen.tsx`
now imports `useAccountForm` via an explicit, heavily-commented `require()` instead of a static `import`,
with the full investigation trail written into the code comment itself so nobody "cleans this up" back to
a normal import without reading why first. This is a targeted workaround for one call site, not a fix to
the underlying Babel/Metro/Hermes interaction — if the same symptom appears in a different early-loaded
screen's import in the future, this same require()-based workaround is the known escape hatch, but the
real upstream cause is still open.

**Process fix** (the actual point of this entry, and the reason it's written up this thoroughly): this is
the second time in three days a committed release APK crashed on launch after being shipped without
on-device verification (v1.5.2's `./gradlew clean`-failure incident, then this one). `CONTRIBUTING.md`'s
"Building a standalone Android APK" section and `CLAUDE.md`'s Reliability rules both now require running
the new `apps/mobile/scripts/verify-release-apk.sh` — not hand-typed `adb` commands, a real script — before
ever committing a rebuilt release APK. It verifies a real connected device launches the APK on **both** a
genuinely fresh install (`adb uninstall` first) **and** 3 warm relaunches of that same install, exiting
non-zero with the crash signature if either fails. Both are required — this incident is direct proof the
two are genuinely different code paths that crash independently of each other; a fresh-install check alone
would have looked "verified" while still missing a warm-relaunch-only crash, or vice versa. The manual
`adb`-command version of this rule (written into the same commit as this incident's interim revert) was
followed correctly for both fixes in this incident, but turning it into a real script removes any future
reliance on remembering/retyping the exact command sequence correctly under time pressure — the actual
failure mode that let the _first_ two incidents (v1.5.2, then v1.6.0) ship with no check running at all.

### Decision: IOU/Goals sync-bug pass + Add IOU/Settle Up redesign + Health Score staleness fix (2026-08-26/27) — `apps/mobile` + `packages/core` only

**Rationale:** a real user's screenshot/repro chain surfaced a cluster of "two things that should stay
in sync silently drift apart" bugs across IOU, Goals, and Portfolio — the same root pattern
(`notifyTxnChanged()`/`useTxnRefresh` — this app's hand-rolled pub/sub — either never called from a
mutation path, or a hook bypassing its own repository wrapper to write directly) already documented
once for `useExpenses.ts` (2026-08-10) and now confirmed recurring. Full per-bug detail lives in
`docs/features/iou.md`/`goals.md`/`health-score.md`/`portfolio/overview.md`; this entry is the
cross-cutting architectural summary.

- **Origin-agnostic linking.** `reconcileExpenseLink`/`reconcileGoalLink` (`packages/core/src/core/iou/
expenseLink.ts` / `core/goals/goalLink.ts`) used to match an existing linked record only by
  `origin === 'expense'`, making an entry/contribution created the _other_ way invisible to a
  same-transaction edit from the other side — fixed to match on `linkedTxnId` alone in both, `origin`
  preserved (not forced) since UI elsewhere still reads it.
- **Direct-repo-bypass staleness.** `IouView.tsx`/`useGoals.ts` had mutation functions calling
  `expensesRepo.put()`/`.delete()` directly instead of their own `useRepository`/`useLoggedRepository`
  wrappers — since `useRepository` only loads once at mount with no refresh subscription, a screen's
  local array could go stale (including from its own prior write) and mint a duplicate record on a
  second edit within the same visit. `useGoals.ts`'s `linkTransaction` had an independent instance of
  the same bug, plus a fully missing `notifyTxnChanged()` call.
- **Holdings joined the refresh bus for the first time.** `usePortfolioHoldings.ts` never broadcast on
  save/remove at all — confirmed root cause of a stock add-then-delete leaving Health Score unchanged.
  `useHealthScore.ts` also had zero refresh subscription of its own (loaded once at mount) — both fixed.
- **`kindForIouCategory()`** (new, `core/iou/ledger.ts`) is the one place "which of the 4 IOU category
  ids means which ledger `kind`/`settleDirection`" now lives — `ExpenseForm.tsx`'s Lent/Borrowed panel
  used to derive `kind` from the transaction's `type` alone, ignoring the actual category, silently
  mislabeling a "Return Borrowed" expense as a new "lent" entry instead of a settlement.
  `EntryForm.tsx`'s 4-tile picker was refactored onto the same helper, replacing its own duplicate
  inline derivation.
- **Add IOU / Settle Up visual redesign** (mockup-gated, `docs/mockups/proposals/
iou-popups-expenseform-alignment-v1.html`): new shared `apps/mobile/src/components/shared/
IouCategoryChips.tsx` — the same icon-chip-row visual `AccountChips`/`PaymentModeChips`/the real
  category picker's own quick-pick row already use — replaces the `OptionButton` 2×2 grid in both
  `EntryForm.tsx` and `SettleUpModal.tsx`; `SettleUpModal.tsx`'s account field moved from a plain
  `SelectInput` to `AccountChips` to match. `ExtraCircle.tsx` gained a second, distinct disabled-visual
  prop — `locked` (dimmed + a small lock badge, `onPress` still fires so the caller can explain why via
  a toast) — kept separate from the pre-existing `disabled` (a real native `Pressable.disabled`, still
  used by `BulkCategorizeModal.tsx`/`ImportCategorizeModal.tsx`'s own older "locked ON" Lent/Borrowed
  circle, deliberately untouched by this pass) since the two need genuinely different behavior: one
  still needs to be tappable to explain itself, the other doesn't.
- **Category-gating decision.** Following a design discussion on where a shared/split cost belongs,
  `ExpenseForm.tsx`'s Lent/Borrowed panel dropped its free-standing toggle — the panel now only opens
  for the 4 real IOU categories, full stop (with a legacy-link escape hatch so a pre-existing link under
  a non-IOU category doesn't silently vanish on next save). Shared/partial costs under an unrelated
  category are explicitly Groups' job now, not personal IOU's — see `docs/features/iou.md`'s matching
  entry and the exploratory `docs/mockups/proposals/iou-split-vs-groups-v1.html` for the fuller reasoning
  (kept as a discussion record even though its "editable split amount" direction wasn't the one chosen).
- **Two small CSV-import bugs, same pass:** `ImportCategorizeModal.tsx`/`BulkHashtagModal.tsx`'s
  "Frequent"/suggestion tag chips never highlighted a match against the current field value (fixed in
  both — same gap, same original pattern); `DoneStep.tsx`'s "Undo this import" had no confirmation at
  all before removing a whole batch (now gated behind `ConfirmDialog`).

### Decision: Bank Import review-pass fixes + default/closed accounts (2026-08-27) — `apps/mobile` + `packages/core` only

**Rationale:** a real-device review of Bank Statement Import surfaced 6 gaps (unmatch not reachable at
import time, Full Ledger's own escape hatch disappearing whenever an unrelated finding was open, cash
transfers being withdrawal-only with a real direction bug baked in, an unsorted icon-less bank picker,
and two year-less date spots) — full per-item detail in `docs/features/bank-import.md`'s matching
2026-08-27 entry, not duplicated here. Alongside that, a genuinely new feature: a default account +
payment mode, and a real "Closed" account status distinct from the still-unused `isArchived`.

- **`Account.isDefault`/`Account.isClosed`** (both new, optional, no migration) — at most one account
  may be default; closed is mutually exclusive with default on the same account. The cross-account
  exclusivity (clearing `isDefault` from whichever OTHER account previously held it) couldn't live
  inside any single feature's `saveAccount` implementation — this codebase has 3+ independent ones
  (`useAccounts.ts`, `ExpenseForm.tsx`'s and `IouView.tsx`'s own inline "+ Add account" flows), since
  the no-cross-feature-imports rule means none of them can call another's. It lives instead in
  `useAccountForm.ts`'s `save()` — the one hook genuinely shared by all of them — which calls the
  injected `saveAccount` callback a second time (for whichever account is losing default) after the
  user confirms a popup. New pure core helper: `core/accounts/accountDefaults.ts`'s
  `findPreviousDefaultAccount()`.
- **`BankPickerModal.tsx`** (new, `apps/mobile/src/components/shared/`) — real logo/brand-color icon +
  name, alphabetical, replacing a plain `SelectInput` in two places (`AccountFormModal.tsx`'s bank
  field, Bank Import's `SetupStep.tsx`) that had the identical gap.
- **`isCashWithdrawalNarration` renamed `isCashTransferNarration`**, gained a `direction` filter — and
  `applyCashTransferConversion()`'s real bug (always treating the bank account as transfer source,
  backwards for a deposit) is fixed to branch on the matched expense's own `type`, mirroring
  `matcher.ts`'s `convertCandidateToTransfer`. `BankCashWithdrawalCode` gained an optional `direction`
  field; existing rows default to `'withdrawal'`, no migration.

**Same-day follow-up round** — two more real-device findings plus a resulting app-wide sweep:

- **Transactions' Account filter missed transfers into an account.** `useTransactionFilters.ts` only
  ever matched `e.accountId` — for a transfer that's the source account only, so a transfer landing in
  the filtered account via `toAccountId` was silently excluded. Fixed to match either field, the same
  `accountId === X || toAccountId === X` convention already used everywhere else account-scoped
  (`useHome.ts`, `FullLedgerPage.tsx`, `AccountDetailModal.tsx`, etc.) — this hook was the one outlier.
- **The year-less-date bug, found in Full Ledger's own range header, turned out to be a recurring
  pattern, not a one-off.** Full Ledger's "from" date used `formatDateShort()` while the "to" date used
  `formatDate()` — the identical asymmetric-range shape as the row-date bug fixed just above. Auditing
  every date-formatting call site in `apps/mobile` for the same shape found and fixed it in
  `EventsModal.tsx` (Events "Tracked" list), plus plain missing-year dates in `BankImportHistoryPage.tsx`,
  `SetupStep.tsx`, `verificationCopy.ts`, Goals, IOU ledger entries, SMS tracking review, per-item
  edit-history timestamps, the IPO tracker, and subscriptions' "last charged" — full list in
  `docs/features/bank-import.md`'s matching entry. Dates paired with self-disambiguating relative
  wording ("Due", "Renews in N days", "Overdue") were deliberately left alone — not the same bug shape.
  Full Ledger's "Load earlier transactions" button also switched from a plain bordered `Pressable` to
  the shared `Button` component (`variant="primary"`).

### Decision: Transaction-storage performance fix — cache, notify coalescing, indexed queries (2026-08-28) — `apps/mobile` + `packages/core` only

**Rationale:** real-device report — at ~10k transactions, app open took seconds, screen switches
showed nothing for a while, and editing a single transaction took ~20 seconds (confirmed live via
logcat: `Skipped 2062 frames!`, one continuous Choreographer stall). Root cause traced to the storage
layer, not any one screen: `RowStore` can only `get(id)` or `toArray()` (full scan) — every field but
`id` is opaque AES-GCM ciphertext, so no table can ever be filtered/sorted without decrypting
everything first. On top of that, 12 independent call sites each called `expensesRepo.getAll()` with
no sharing, and `notifyTxnChanged()` had 14 independent subscribers — so a single write fanned out
into up to 14 redundant full-table decrypts, serialized through op-sqlite's single connection. Fixed
in 3 parts (referred to during the session as "Tier 1/2/3" — unrelated to the Track 4 provider-porting
tiers referenced elsewhere in this doc's early Track 4 entries):

- **In-memory cache inside `EncryptedRepository`** (`packages/core/src/core/db/repository.ts`) — every
  repo is a true module-level singleton (`repositories.ts`), so caching lives at exactly the right
  level to be shared by every caller with zero call-site changes. `getAll()` caches its decrypted
  result and de-dupes concurrent in-flight calls into one real decrypt; `put()`/`delete()` patch the
  cache (always a NEW array reference, never mutated in place — plenty of code keys a `useMemo`/
  `useEffect` off that reference's identity). The only 4 writes that bypass `EncryptedRepository`
  entirely (`securityManager.ts`'s `wipeAllData()`, `seedDemoData.ts`'s `wipeDemoData()`,
  `backupManager.ts`'s `importBackup`/`mergeBundle`) call the new `invalidateAllRepositoryCaches()`
  immediately after. `packages/core/tests/setup.ts` gained a global `beforeEach` calling the same
  function — the whole test suite's `db.<table>.clear()` reset pattern would otherwise leave a
  previous test's cached rows visible to the next one.
- **Coalesced `notifyTxnChanged()`** (`useTxnRefresh.ts`/`.native.ts`) — onto a microtask, so several
  near-simultaneous calls collapse into one flush instead of firing every listener N times over.
- **Real indexed queries for `expenses`** — the one table with genuine row-count pressure. New
  `IndexedExpenseRow`/`ExpenseRowStore` (`store.ts`) — 5 plaintext, indexed columns (`date`,
  `accountId`, `toAccountId`, `categoryId`, `type`) alongside the normal `id`/`iv`/`ciphertext`
  envelope, a deliberate, documented reversal of `schema.ts`'s "index id only" rule for exactly these
  5 structural/opaque-id fields — amount, description, hashtags, and notes stay fully encrypted as
  before. Implemented natively in `schema.native.ts` (real SQL `ALTER TABLE`/indexes/`WHERE` queries)
  and mirrored in `schema.ts` (Dexie `.where(...)`) since `apps/web-react` (frozen) and the entire
  vitest suite run against the Dexie file, not the SQLite one, per this codebase's own established
  rule. `EncryptedRepository` gained `queryByDateRange`/`queryByAccount`/`queryByCategory` — real on
  `expensesRepo` (constructed with the indexed store + a field extractor in `repositories.ts`), a
  correctness-preserving `getAll()` + JS-filter fallback on every other repo. A one-time backfill
  (`useExpenses.ts`, flag `penny_expense_index_v1`, same pattern as `penny_merchant_memory_v3`) fills
  the 5 columns for rows written before this shipped. `FullLedgerPage.tsx`/`CheckpointTimelinePage.tsx`
  switched their own account-scoped `expenses` load from `getAll()` to `queryByAccount()` — every use
  of that data in both files was already scoped to one account, so this was a transparent swap.
  Deliberately NOT swapped: `useExpenses.ts`'s own core `expenses` state (feeds too many other
  consumers — merchant-memory backfill, IOU seeding, hashtag counts — that genuinely need the full
  table; Tier 1's cache already makes that full read cheap after the first decrypt per session).
- Considered indexing `hashtags`/IOU `personId` too — declined. Tags are user-authored free text (can
  be genuinely sensitive, e.g. "therapy"), not an opaque id, and need a multi-entry/junction index, not
  a plain column; `Expense` has no `personId` field at all (IOU links live on the much smaller
  `ledger_entries` table instead) — not part of this table's scaling problem.
- Loading indicators added for the "shows nothing for a while" half of the report: `HomePage.tsx`
  (`GlanceHeader`/`AccountsStrip`'s slot), `AccountsPage.tsx`/`AccountList.tsx` (new `loading` flag on
  `useAccounts.ts` — previously indistinguishable from "genuinely zero accounts," both start as `[]`),
  and `FullLedgerPage.tsx`/`CheckpointTimelinePage.tsx` (previously showed "Account not found" during
  every cold load, not just a real deletion, since both repos start empty pre-fetch).
- Verified live on-device (OnePlus 8T): pre-fix, editing a transaction produced `Skipped 2062 frames!`
  (~20s stall); post-fix (Tier 1 + coalescing only, same device, same data, installed as an update —
  not a fresh install), zero Choreographer stall events across the same flow, worst single frame 218ms.

**Same-day follow-ups, found continuing the real-device pass:**

- **Batched the one-time index backfill.** The original `Promise.all` of ~10,000 individual
  `backfillIndexColumns()` calls cost a real, measurable ~2s one-time stall on its only run (confirmed
  via a controlled repeat-cold-open test: stall present on the first post-upgrade open, gone on the
  next two). Replaced with `backfillIndexColumnsBatch()` — one `executeBatch()` call natively (same
  "many statements, one transaction" primitive `restoreTables()` already uses) and one real
  `db.transaction()` on Dexie — cutting ~10,000 autocommit writes down to one round-trip.
- **Fixed a real, separate bug in `useAccounts.ts`**: `.filter().sort()` always allocates a new array,
  even when the underlying `accountsRepo.getAll()` result is the identical (Tier-1-cached) reference —
  so `useAccountVerification.ts`'s own `useMemo` (checkpoint diagnostics for every account) recomputed
  on every screen focus regardless of whether anything changed. Fixed by skipping the transform when
  the raw `getAll()` reference is unchanged since last time.
- **Found and fixed the real account-tile bottleneck** (traced via temporary `console.log` timing
  instrumentation on a debug build, then removed): `groupExpensesByDate()` — 700ms–1.5s for ~5,000
  rows, and running TWICE per tap. The double-run was `AccountDetailModal.tsx`'s own `accountTxns`
  being a plain, unmemoized `.filter()` computed fresh on every render (this component reliably
  re-renders twice on open) — `EntityTransactionsModal.tsx`'s `groupExpensesByDate` is itself
  `useMemo`'d on that array's identity, so a fresh reference each render defeated the memo entirely.
  Fixed with a real `useMemo` there. The per-call cost itself was `groupExpensesByDate`
  (`core/expenses/filterAndAggregate.ts`) grouping into a `Map` first, then separately `.sort()`ing AND
  spread-copying every individual day's own item array — thousands of tiny sort/copy operations for an
  account with transactions spread across thousands of distinct days. Rewritten to sort the whole array
  once, globally, then do a single O(n) grouping pass with no further sorting/copying (same-day rows
  are already contiguous once sorted). New test coverage: `tests/expenses/filterAndAggregate.test.ts`.
- **Fixed a real, separate race in bank-import matching**: `useBankImport.ts`'s `confirmMapping()` (the
  "Continue to review" action, 3 separate entry points) ran the two-tier matcher against whatever
  `importRecords`/`allExpenses`/etc. happened to be loaded at that instant — none of the underlying
  `useRepository()` loads were gated. Reaching that action before `importRecords` finished its first
  load meant Tier 1's exact-provenance lookup found nothing for a previously-imported statement, and
  Tier 2's fuzzy fallback (which excludes already-checkpointed expenses by design) couldn't help either
  — landing rows in "unmatched" that should have provenance-matched instantly. Fixed with a `dataLoading`
  flag gating the action itself (not just one button), so no future entry point can reintroduce the race.
- **Found, but reverted, a separate real matching bug**: `matcher.ts`'s `findProvenanceMatch()` has no
  way to avoid re-matching the same stored import record to two DIFFERENT statement rows when they
  share identical accountId/date/amount/narration (e.g. two same-day cash withdrawals of the same
  amount) — the first row claims the record correctly, the second gets the identical record back, sees
  its linked expense already claimed, and falls through to Tier 2's checkpoint exclusion into
  "unmatched" even though its real counterpart is sitting right there. A fix (excluding already-claimed
  records from the lookup) was implemented and unit-tested, but reverted the same day after an
  unresolved, ambiguous real-device crash (`TypeError: Cannot read property 'create' of undefined` at
  startup) that could not be cleanly reproduced in an isolated debug-build+emulator bisection — leaving
  genuine ambiguity about whether this function was really the cause or a stale release-build cache
  was. Left in place as a documented known limitation (`findProvenanceMatch`'s own doc comment,
  `matcher.test.ts`'s matching test kept as `it.skip`) rather than re-risked without a clean bisection.
- **Real build-tooling trap, hit twice**: `./gradlew assembleRelease` can report `packageRelease
UP-TO-DATE`/`createBundleReleaseJsAndAssets UP-TO-DATE` and skip re-bundling the JS entirely even
  after `packages/core`/`apps/mobile` source changed — silently shipping a stale bundle with an
  installed-looking-successful build. Confirmed by explicitly checking for the `Android Bundled Xms
apps/mobile/index.ts` line in the build output, not just `BUILD SUCCESSFUL`; forcing a real re-bundle
  requires deleting `apps/mobile/android/app/build/generated/assets/react` before rebuilding. See
  `CONTRIBUTING.md`'s release-APK build steps for the now-explicit warning.

### Decision: retire `apps/web-react` entirely; `schema.ts` drops Dexie (2026-08-29)

**Rationale:** `apps/web-react` had been frozen since 2026-07-31 (see the Mobile Migration decision
above) — kept only as a historical design/behavior reference, never updated past that point, with
`apps/mobile` fully superseding it in every module. Once a DB-structure review (prompted by a
performance investigation into Analytics/Subscriptions) surfaced that `packages/core/src/core/db/
schema.ts` (Dexie/IndexedDB) existed purely to serve two consumers — `apps/web-react`'s own runtime,
and the entire `vitest` suite (`schema.native.ts`, what `apps/mobile` actually runs on, has zero
automated test coverage by this codebase's own established rule) — retiring the frozen app made the
Dexie dependency itself removable, not just the app.

**The one real blocker, handled first:** deleting `schema.ts`'s Dexie backing without giving
`EncryptedRepository`'s tests something else to run against would have deleted the DB layer's entire
automated safety net at the same time — exactly the "tests pass, real engine breaks" gap that already
caused one real bug (`backupManager.ts`'s `.bulkPut()`, a Dexie-only method called against
`schema.native.ts`). Sequencing: rewrote `schema.ts` in place (same filename, same import path,
same exported shape — `db`, `expensesIndexedStore`, `restoreTables()`) as a plain in-memory
`Map`-backed implementation of the exact same `RowStore<T>`/`ExpenseRowStore` contract
`schema.native.ts` already implements, confirmed the full 1224-test suite still passed unchanged
against it, **then** deleted `apps/web-react`.

**Why the file kept its name/path instead of being deleted and replaced with a new test double:**
every consumer (`repositories.ts`, `securityManager.ts`, `backupManager.ts`, `seedDemoData.ts`,
`priceCache.ts`, the market-data clients) already imports the bare specifier `./schema`/
`@/core/db/schema`, and Metro's platform-extension resolution already sends `apps/mobile` to
`schema.native.ts` for that same bare specifier. Keeping the filename meant zero import-site changes
anywhere in the codebase — the same "swap the engine underneath, callers never notice" property
`store.ts`'s `RowStore<T>` seam was always designed to give every prior storage-engine swap (expo-
sqlite → MMKV → op-sqlite, see `schema.native.ts`'s own history comment).

**What changed as a result:**

- `packages/core/package.json`: `dexie` + `fake-indexeddb` dependencies removed entirely.
- `eslint.config.js`: the "Dexie may only be imported from `packages/core/src/core/db/`" rule is now
  "Dexie must never be imported anywhere" (no override left for `core/db/`, since nothing there needs
  it anymore) — kept as a defensive rule against reintroduction, not deleted outright.
- `packages/core/tests/backup/backupManager.test.ts`'s rollback-regression test now spies on
  `db.accounts.put` instead of Dexie's `bulkPut` — `restoreTables()`'s own snapshot/rollback (added to
  the new in-memory `schema.ts`, mirroring the atomicity Dexie's `transaction()`/op-sqlite's
  `executeBatch()` already gave the two real engines) is what the test now exercises.
- Root `tsconfig.json` (dropped the `apps/web-react` project reference), root `package.json` (`dev`/
  `build`/`test` scripts no longer target `web-react`), `pnpm-workspace.yaml` (needed no change — its
  `apps/*` glob just naturally stopped matching a deleted directory).
- Retired alongside the app itself (nothing left for them to do): `docs/MOBILE_PARITY.md`,
  `docs/ANDROID_EMULATOR.md` (both docs), and `.claude/agents/web-developer.md`/
  `.claude/agents/parity-auditor.md`/`.claude/skills/parity-sweep/` (both agents + the skill existed
  solely to work on or audit against `apps/web-react`). `mobile-developer`/`ui-designer`/
  `code-reviewer`/`test-writer`'s agent definitions and `ui-design-check`'s skill had their
  web-react-comparison instructions removed (cross-platform consistency checking has no second
  platform to check against anymore).
- **Explicitly NOT swept**: the very large number of historical "ported from `apps/web-react`'s X"
  provenance comments scattered across `apps/mobile/src/` (a legitimate, still-accurate record of
  where each piece of code originated, not a functional dependency) — rewriting all of those was
  judged disproportionate to this task and would destroy real historical context for no functional
  benefit. Also not swept: whether any `.native.ts`/`.web.ts` pair's _unsuffixed_ base file (e.g. the
  `googleDriveProvider.ts`/`.web.ts`/`.native.ts` trio) is now genuinely dead code because its only
  reason to exist was serving `apps/web-react`'s Vite bundler specifically — flagged here as a real,
  separate follow-up audit, not chased down in this pass.

**Verification:** `tsc -b` clean across the whole workspace, `eslint packages/*/src apps/*/src` clean,
full `vitest` suite (`packages/core` + root `workers/` tests) passing identically before and after
(1224 passed/1 skipped in `@penny/core`, 43 passed at root).

### Decision: DB-structure review — future-restructure shape decided in advance, never store personal data server-side (2026-08-29)

**Rationale:** a performance investigation into Analytics/Subscriptions surfaced a broader question —
should Penny move toward real DB-level referential integrity (real `FOREIGN KEY` constraints, no
duplicate plaintext/encrypted columns) instead of Tier 2's current duplicate-column pattern
(`docs/SCHEMA.md`'s `expenses` "Storage note")? Full analysis lived in a session plan file, not
committed as its own doc; the two durable conclusions are recorded here so they survive even though
the bigger restructure itself was **not** undertaken now (a cheap JS consistency-checker for
referential integrity was recommended instead — not yet built; a real, separate follow-up).

**1. If the restructure is ever done, use the hybrid shape — not true per-field encryption, and not
Tier 2's duplication, extended everywhere:**

| Approach                                      | Shape                                                                                                                                                                                         | Why not                                                                                                                                                                                                |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| True per-field encryption                     | Every sensitive field gets its own `iv`/`ciphertext` pair, as separate columns                                                                                                                | Real IV+auth-tag overhead (~28 bytes) **per encrypted field, per row** — multiplies storage cost for no benefit over the alternative below                                                             |
| Tier 2's duplication, extended to every table | Real plaintext columns alongside an unchanged, still-full encrypted blob                                                                                                                      | A field lives in two places at once — the exact "why 2 columns?" question Tier 2 already had to answer for `expenses` specifically; fine for one table, not a pattern to generalize                    |
| **Hybrid (recommended, if ever done)**        | One small `ciphertext` blob holding _only_ the still-sensitive fields (amount, description, notes, free text) + separate real plaintext columns for everything structural (ids, dates, enums) | One encrypt/decrypt op per row like today, zero duplication (a field lives in exactly one place), and real plaintext id columns make genuine SQL `FOREIGN KEY` constraints possible for the first time |

**2. Never store personal transaction data in Cloudflare — encrypted or not — reaffirming
`docs/BACKEND_STRATEGY.md`'s settled Model B decision (2026-06-27), not a new question.** Raised again
in this session as a hypothetical ("what if we stored a heavy user's full history in D1"); walked
through concretely rather than dismissed on principle alone:

- **Storage:** ~300 MB estimated for one 1M-row user's `expenses` table alone → **~16 such users**
  before D1's entire 5 GB free tier is gone.
- **Reads:** a single All-Time Analytics view for one such user is ~1M row-reads — **20% of the
  entire free tier's daily 5M-read budget, in one screen tap, from one user.**
- **Performance:** would make the app _slower_, not faster, for Penny's actual access pattern
  (single-user, single-device, local SQLite reads are sub-millisecond; a Cloudflare round-trip is
  100s of ms and fails entirely offline — a real regression for the BRD's India/patchy-connectivity
  target market).
- **Privacy:** even encrypted, reverses "server holds ciphertext or nothing" into "server holds every
  user's full history" — a single breach exposes everyone at once, a fundamentally different risk
  class than one compromised phone; at "unencrypted" (as the hypothetical also considered), it ends
  the "local-first, zero backend" claim entirely.

No code or docs changed to reverse Model B — this is a confirmation, filed here (not only in
`docs/BACKEND_STRATEGY.md`) because the concrete numbers above are new and worth keeping alongside
the rest of this session's DB-structure findings.

### Decision: referential-integrity consistency checker + Analytics lazy view computation (2026-08-29)

**Rationale:** the two lowest-risk, highest-value follow-ups from the DB-structure review above,
picked up the same day. A third (a cached running balance to eliminate `computeBalance()`'s repeated
full-array scans on Home/Analytics/IOU) was deliberately deferred — see below.

**1. `packages/core/src/core/db/consistencyCheck.ts` — `findOrphanedReferences()`.** The cheap
alternative to a full per-field-encryption/real-`FOREIGN KEY` restructure: scans every FK-shaped
relationship this codebase actually relies on (the ER diagram in the entry above) after decryption,
and reports any reference pointing at an id that doesn't exist in the table it's supposed to
reference. Read-only, reports only, never repairs. Checked: `expenses.accountId`/`toAccountId`/
`categoryId`, `expense_categories.parentId` (self), `goal_contributions.goalId`/`linkedTxnId`,
`ledger_entries.personId`/`linkedTxnId`, `persons.promotedToGroupId`, `group_members.linkedPersonId`,
`bank_statement_imports.accountId`/`linkedTxnId`, `sms_transactions.accountId`/`linkedTxnId`.
Deliberately NOT checked (see `consistencyCheck.ts`'s own doc comment): `hashtags` (matched by name,
not id), `activity_log.entityId` (genuinely polymorphic), `bankId` fields (a shared enum, not a table
reference), and the lower-risk `categoryId`/`accountId`/`paymentMode` fields on `subscriptions`/
`transaction_templates`/`merchant_memory`/`sms_transactions`. Covered by
`packages/core/tests/db/consistencyCheck.test.ts` (a fully-consistent dataset reports zero issues; a
dataset with one dangling reference per checked relationship is caught exactly once each; an absent
optional reference is correctly never flagged). Not yet wired into anything that runs automatically
(no CI job, no on-device diagnostic) — that's its own future step if it proves useful.

**2. Analytics eager 3-view computation → lazy, active-view-only.** `useExpenseAnalytics.ts` gained a
new required `analyticsView: 'monthly' | 'annual' | 'allTime'` input (threaded from
`AnalyticsSlice.tsx`'s existing `analyticsView` state, previously not passed to the hook at all).
Every one of the ~25 real `expenses`-array-scanning computations (`buildGroupData`/
`buildSetAsideData`/`buildIncomeData`/`buildEventsData`/`buildHashtagSummary`/`buildAnnualSeries`/
`biggestMovers`/`computeCashFlowSummary`/the hand-rolled `monthTotal`/`annualRecap`/`allTimeTotal`/
`allTimeNet`/`allTimeRecap`/`allTimeAvgPerDay` loops) is now gated behind `isMonthly`/`isAnnual`/
`isAllTime` and returns a cheap, correctly-typed empty default (`[]`, `0`, or an empty
recap/Map shape) when its view isn't the one on screen — cutting steady-state cost by roughly 2/3 and
removing the tax of recomputing all three every time `expenses` changes anywhere in the app
(including in the background, while a different tab is focused). Purely derived values (totals/maxes
computed by reducing an already-small, already-gated array) were left ungated — they're already cheap
once their base input is empty. Switching to a previously-viewed tab still recomputes that tab's real
data from scratch (deliberate, matches "lazily compute... on switch," not a full per-view cache) —
cheap because it only happens on a user-initiated tab switch, not on every background write.

**3. Cached running balance — deferred, not built.** The higher-risk alternative fix for
`computeBalance()`/`computeCashFlowSummary()`'s repeated full-`expenses`-array scans (Home's
still-open Phase 3 item, Analytics' Cash Flow tile, `IouView.tsx`) was explicitly not built this
round. Two real options exist: (a) a persisted, incrementally-updated `accounts.cachedBalance` field
— genuinely O(1) reads, but requires an exhaustive, perpetually-maintained audit of every
`expenses`-writing code path (manual add/edit/delete, bulk delete/move, CSV/bank/SMS import, backup
restore/merge, reconciliation, goal contributions, IOU settle-up) to keep it in sync, with silent
balance drift — no error, just a wrong number — as the failure mode if any path is ever missed; or
(b) a safer single memoized grouped pass computing every account's balance in one `O(n)` scan over
`expenses`, shared across Home/Analytics/IOU and automatically self-healing on every `expenses`
change (no persisted field, nothing to keep in sync, but doesn't reach true O(1)). Flagged to the
user as a real risk trade-off before starting; the user chose to pick this up later rather than
decide between the two now.

### Decision: Real-device-testing-pass 10th batch — 16-item punch list (2026-08-29) — `apps/mobile` + `packages/core` only

**Rationale:** a 16-item punch list the user provided directly in one message, unrelated to any
prior testing batch — split per the user's own explicit two-step gate into "fix now, no mockup
needed" and "one combined mockup, then implement together" before any code changed. Full per-item
writeup lives in `docs/plans/real-device-testing-pass.md`'s 10th batch (items 81-95); this entry
covers only the pieces that are genuinely architectural.

**New `coverage.ts` pattern — a non-badge signal living alongside a closed finding system.**
`accountVerification.ts`'s `VerificationFindingKind` is a deliberately closed 3-kind priority system
(its own doc comment says so explicitly). The new "unverified tail" sweep (transactions recorded
after an account's last verified statement date, with no import link) is a genuinely different kind
of signal — not negative/actionable in the same sense — so it was built as two new, independent pure
functions in `coverage.ts` (`computeVerifiedThroughDate()`, `findUnverifiedTailExpenses()`) rather
than as a 4th finding kind. Precedent for future signals of this shape: extend the closed enum only
for things that genuinely compete for the *same* one-badge slot; build a parallel, independent
pure-function signal (surfaced by the UI layer alongside, not instead of, the badge) for anything
that doesn't.

**New hook: `apps/mobile/src/components/privacy/useOpenModeGate.tsx`.** Extracted the PIN +
pre-Open shoulder-surfing-warning modal flow out of `PrivacyModeSwitcher.tsx` (`requestOpen(onConfirmed?)`
+ `modal`) so the new Settings "default to Open" row could drive the exact same gate rather than a
second, parallel PIN check. Any future entry point into Open mode should go through this hook, not
re-implement the PIN/warning flow inline.

**New lib: `packages/core/src/lib/defaultOpenMode.ts`.** Platform-agnostic helpers for the 3-day
default-to-Open feature (arm duration, urgency threshold, countdown-label formatting) — kept in
`packages/core` rather than `apps/mobile` despite having exactly one caller today, since it's pure
date-math with no RN dependency, consistent with this repo's general preference for
platform-agnostic logic to live in `packages/core` even before a second consumer exists.

**`App.tsx` provider order changed:** `ToastProvider` now wraps `SettingsProvider`/`PrivacyProvider`
(previously nested between them) — `PrivacyContext`'s new default-to-Open reconciliation effect
needs `useToast()` to show the one-time "switched back to Safe" expiry toast. Every existing
`useToast()` call site is unaffected, since `RootNavigator` (and everything under it) sits inside
all three providers regardless of their relative order — only `PrivacyContext`/`SettingsContext`
themselves could have been affected by the reorder, and neither calls `useToast()` except for this
new effect.

**`PrivacyContext.tsx`'s existing `AppState`-background auto-revert-to-Safe now has a real
exception**, not just a future one hypothesized: it skips itself while a default-to-Open window is
armed (`defaultOpenArmedUntil` in the future). See `docs/PRIVACY.md`'s "3-day default-to-Open"
entry for the full privacy-relevant writeup of this behavior and its accepted trade-off.

### Decision: two unrelated real-device bugs found chasing one EPF PDF import report — `apps/mobile` + `packages/core` only (2026-08-30)

**Rationale:** a real user report ("import passbook PDF selects a file, then nothing happens")
uncovered two completely independent, previously-unknown bugs during investigation — one blocking
every release build from launching at all, the other specific to real (larger, non-Latin-font)
passbook PDFs. Recorded together since both were found in the same investigation session and both
needed real-device/emulator instrumentation (console logging alone wasn't enough for either) to
actually root-cause, not just work around.

**1. Release-build-only launch crash: `apps/mobile/src/lib/reactNativeShim.ts`'s `import * as
RealReactNative from 'react-native'`.** Confirmed via a symbolicated Hermes crash stack (using the
release build's own generated sourcemap + `metro-symbolicate`, not guessed): every release build
crashed on launch with `TypeError: Cannot read property 'create' of undefined`, traced to
`apps/mobile/src/features/home/stories/ShareCard.tsx`'s `StyleSheet.create(...)` — one of only two
call sites in the whole app still using classic `StyleSheet.create` instead of NativeWind. Root
cause: real React Native's own `index.js` exports several properties (`StyleSheet` included) as
lazy getters; Babel's ESM-interop copy for `import * as X from 'react-native'` against this shim's
own module evaluation only broke — specifically under Hermes bytecode's evaluation order — in a
real release build, never in a debug/Metro-interpreted session, which is why this was never caught
before. Fixed by switching to a plain `require('react-native')` (no interop copy, forwards straight
to RN's own live getters) — confirmed crash-free across a fresh install and 3 warm relaunches, on
both a real device and the Android emulator. Separately, added a missing `react-native-screens`
ProGuard keep rule (`apps/mobile/plugins/withProguardRules.js`, a new config plugin, since
`android/app/proguard-rules.pro` is gitignored/regenerated by every `expo prebuild`) — found while
investigating this same crash; not the actual cause, but a real, separately-missing protection
worth keeping now that R8 minification is on.

**2. EPF passbook PDF parsing hangs indefinitely on-device — a real Hermes/React Native bug in its
own built-in `structuredClone`.** `packages/core/src/core/portfolio/epfPassbookParser.ts`'s
`getDocumentProxy()`/`extractText()` (via `unpdf`) hung forever on a real, larger passbook PDF —
reproduced identically on a real device and the Android emulator, in both debug and release builds
— despite the exact same call completing in ~30ms against the exact same file under plain Node.js.
Root-caused via direct runtime instrumentation (not guesswork): isolated an in-process `PDFWorker`
handshake (instant, correct), ruled out `structuredClone` itself for small payloads, ruled out
`Promise.withResolvers`, ruled out any network `fetch` involvement (the only fetches observed were
Metro's own unrelated dev-server symbolication calls), then patched `globalThis.structuredClone`
with a logging wrapper and caught it *throwing* `TypeError: Cannot read property 'json' of null` —
specifically on the *reply* message PDF.js's internal "fake worker" message-passing protocol
(`LoopbackPort.postMessage()`) sends back after successfully parsing the document; the *request*
message clones fine every time. Since that internal message-passing has no error handling around
the clone call, the reply is silently dropped and the original caller's promise waits forever for a
response that will never arrive — a genuine bug in Hermes's/RN's own `structuredClone`
implementation, not in PDF.js, `unpdf`, or this app's own code. Fixed by replacing
`globalThis.structuredClone` globally with a manual recursive deep-clone
(`ensureWorkingStructuredClone()`) before PDF.js ever runs — safe here specifically because PDF.js's
"fake worker" never actually crosses a real thread boundary (confirmed `typeof Worker ===
'undefined'` in this environment; PDF.js's own serverless build is hard-coded to skip the real-
`Worker` path entirely), so a plain copy is behaviorally equivalent to a true structured clone for
this use case. Also disabled PDF.js's font-substitution path (`useSystemFonts: false,
disableFontFace: true` — this file's embedded legacy Devanagari font otherwise triggers
browser-only font-substitution machinery `extractText()` never actually needs) and added a 15s hard
timeout as a defensive safety net for any other, still-undiscovered on-device PDF.js issue. **General
lesson, worth remembering beyond this one bug**: any library using a `postMessage`/`structuredClone`-
based message-passing protocol internally (common for libraries originally written for
worker-thread or cross-realm use, like PDF.js) is a real risk area on Hermes — verify it against a
realistic, real-world-sized payload on an actual device or emulator, not just a small synthetic
fixture under a debug/Metro session, before trusting a "works on-device" spike result.

### Decision: EPF passbook-import sixth round — line-wrap parsing gap, multi-event reconciliation collapse, mid-year transfer-in interest gap, checkpoint-drift compounding, stale-snapshot modal bug, pending-transfer resolution overhaul, hike detection, two new rate tables (2026-08-30) — `apps/mobile` + `packages/core` + `workers/api-proxy` only

**Rationale:** found chasing a real multi-employer EPF transfer report end to end — one real
transfer surfaced a parsing gap, which once fixed surfaced a reconciliation bug, which once fixed
surfaced an interest-calculation gap, plus two longer-standing correctness/UX gaps (a modal
snapshot-staleness bug, a chronologically-naive transfer-successor guess) found investigating the
same report. Recorded together since they were all found and fixed in one session against the same
underlying data, alongside two new, unrelated capabilities (hike detection, two new Cloudflare-backed
rate tables) added in the same pass.

**1. pdf.js text extraction can split ONE transaction row across several physical lines —
previously silently invisible rows.** `epfPassbookParser.ts`'s `ROW_PATTERN` only ever matched a row
complete on one line; a row with long particulars text (routinely true for a real "TRANSFER IN - Old
Member Id ..." row) can have its date+CR/DR prefix, its wrapped particulars, and its trailing numeric
columns land on three or more separate lines — such a row never even reached `classifyRow`, so a real
transfer-in credit could be completely absent from Penny despite being genuinely present in the
passbook's own text. Fixed with a new `reflowWrappedRows()`, run before `parseRows`: whenever a line
matches ONLY a row's own date+CR/DR prefix with nothing else on it, greedily absorbs following lines
onto the same line until the merged result is a complete, matchable row — stopping at a blank line, the
start of a genuinely new row, or a defensive hard cap, never guessing how many lines to absorb. A row
already complete on one line is untouched. Confirmed against a real sample: 4 genuine `transfer_in`
rows recovered, all previously silently dropped, zero false merges against every other already-correct
sample checked.

**2. A single FY can contain SEVERAL distinct transfer_in/withdrawal events — the old
aggregate-by-type-per-FY reconciliation model silently collapsed them into one, wrong-dated entry.**
`epfImportLogic.ts`'s `reconcileUnit` used to group every non-contribution row in a unit by type and
sum them into one combined item dated to the LATEST row — correct only if at most one such event
happens per FY per type, which a real passbook (once bug 1 above stopped hiding wrapped rows) proved
false: e.g. the actual principal transfer posting on one date, followed months later by a separate
"TRANSFER IN - INTEREST AMOUNT ONLY" catch-up credit. The old aggregation silently discarded the real,
earlier date the principal actually moved on. Fixed with a new `reconcileEpfBalanceEventAtDate()`
(`epfReconciliation.ts`), matching by each row's own exact real date instead of `(type, FY)` — every
genuinely distinct event now stays its own item. `itemKey()` (`epfImportLogic.ts`) was also fixed in
the same pass: it used to be `item.wagesMonth ?? item.type` alone, which collapsed two distinct
non-contribution items of the same type in one unit onto an identical review-screen key (one checkbox
toggle silently affecting both) — now `` `${item.type}-${item.date}` ``, unique in practice.

**3. A mid-year transfer-in was invisible to the interest simulation for the exact year it
landed in.** `sumEpfBalanceBeforeFy` already correctly folded a transfer-in into every LATER year's
opening balance, but `calculateEpfInterestForYear`/`buildEpfInterestInput`
(`epfInterestCalculator.ts`) had no concept of an in-year transfer at all — the year the credit
actually arrived silently computed interest as if the transferred balance had earned nothing for the
months after it landed. Fixed by adding `monthlyTransfersIn` (mirroring `monthlyWithdrawals`'s existing
shape/timing exactly): added to the balance at month-end, after that month's own interest is already
computed, so it starts earning interest from the following month — a transfer posts on its own real
date, not subject to a contribution's wage-deposit lag, so no offset is applied the way a contribution's
`wagesMonth` gets one.

**4. Balance-seed drift compounded forward year over year for an employer with a same-FY switch
settlement Penny can't fully reconstruct.** `sumEpfBalanceBeforeFy` (`apps/mobile`'s
`epfInterestOnDemand.ts`) always re-derived an FY's opening balance by re-summing every earlier
transaction — any small drift from the real passbook (e.g. a settlement with no corresponding
transfer-in row to reconstruct it from) fed forward into every subsequent year's own calculation,
since each year built its opening balance from the previous year's already-drifted total rather than
ever re-anchoring to a real, stated value. Fixed to prefer a real passbook-stated
`EpfBalanceCheckpoint` (`latestCheckpointBeforeFy`) whenever one exists for the employer — a value
already captured at import time (`epfImportLogic.ts`'s `mergeCheckpoints`) but never actually read
anywhere until now — falling back to the historical transaction sum only when no checkpoint was ever
imported. Removes the compounding entirely for any employer with real passbook checkpoints.

**5. "Save ratio doesn't work" — a modal holding a snapshot object instead of re-resolving its
subject live, by id, on every render.** `EpfEmployerDetailModal.tsx` (new) originally took an
`EpfEmployer` object captured at tap time; a save made from ITS OWN stacked child popup (e.g. the
pending-transfer confirm sheet) correctly updated the parent `holding`, but the modal kept rendering
the stale snapshot object it was opened with, so a value written by the child action appeared to not
have saved at all when reflected back in this modal's own UI. Fixed by taking `employerId` instead and
re-resolving `allEmployers.find((e) => e.id === employerId)` fresh from `holding` on every render,
rendering nothing if the employer no longer exists rather than crashing. **General pattern worth
remembering**: a modal/popup that can itself open a further child action capable of mutating the same
parent data it displays must re-derive its own subject from the parent's live data by id on every
render — never hold onto the object it was opened with, even though "just pass the object" looks
simpler and works fine until exactly this stacked-mutation shape happens.

**6. Pending-transfer suggestion assumed the wrong destination — real EPFO transfers target
whichever Member ID is CURRENTLY ACTIVE, not "whichever job came next."** `epfHasPendingTransfer`
used to always suggest the chronologically-next employer by `fromDate` and considered a gap "resolved"
only once THAT specific employer had any `transfer_in` at all. Real career data broke this: two
different old, closed employers (jobs held years apart) can both correctly transfer into the SAME
later, still-current employer, filed together, skipping right over an employer that happened to sit
chronologically in between — the old logic never recognized the skipped employer's gap as resolved.
Rebuilt as `epfPendingTransferSuccessor()` (renamed from `epfHasPendingTransfer`, which now wraps it as
a boolean convenience): defaults the suggestion to the CURRENTLY ACTIVE employer (no `toDate`) when one
exists, falling back to the chronologically-next employer only when nothing is currently active — but
it's always just a default, never enforced; the confirm flow (new `useEpfPendingTransfer.ts` hook +
`EpfPendingTransferModal.tsx`) lets the user pick any other employer instead. "Already resolved" is now
tracked via a new `EpfTransaction.transferredFromEmployerId` (see `docs/SCHEMA.md`) — an exact link back
to the specific old employer, checked across every employer in the holding, not just whichever one
happens to be suggested this time. A companion `epfImportLogic.ts` function,
`resolveTransferSourceEmployerId()`, auto-attributes this same field on a freshly IMPORTED transfer_in
row too, by matching the passbook's own "Old Member Id" text against a known employer's `memberId` — a
real, deterministic identification (the same value that employer's own passbook import already stored
as its `memberId`), not a heuristic guess.

**7. New: hike detection from real imported wage data (`findUnrecordedEpfHikes`,
`epfCalculations.ts`).** Real reported gap: `EpfEmployer.basicSalary`/`hikeTimeline` is set once from
whichever unit is the FIRST ever imported for an employer; a later re-import extends date coverage but
never re-examines wage data for a change, so a multi-year employer built from several yearly passbooks
had its entire CTC/Gross/Net Monthly display frozen at the first imported year's wage, silently
ignoring every real raise later years' own passbooks already proved happened. Scans an employer's real
`EpfTransaction.epfWages` for a sustained increase over what `epfGetSalaryForMonth` currently predicts
that isn't yet in `hikeTimeline`, requiring the row immediately after a candidate to still be at/above
the new level (so one anomalous row can't be mistaken for a real raise) and skipping the employer's own
joining/leaving wage month. Detection only — never silently writes to `hikeTimeline`; the card's new
"hike detected" nudge banner always asks the user to confirm/adjust before adding (or dismiss via the
new `EpfEmployer.dismissedHikeMonths`, see `docs/SCHEMA.md`).

**8. New: two Cloudflare-backed rate tables, mirroring the existing EPF/PPF interest-rate
architecture exactly** — `packages/core/src/core/portfolio/epfBasicToGrossRates.ts` (`/epf-basic-to-
gross-rates`) and `epfIncomeTaxRates.ts` (`/epf-income-tax-rates`), both offline-first with a 30-day
cache and a baked-in fallback table, both registered in `docs/EXTERNAL_APIS.md`. The Basic-to-Gross
table replaces a single flat `EPF_DEFAULT_BASIC_TO_GROSS_PCT` default (50%) used for every era with a
real convention change (40% pre-Nov-2025 Code on Wages, 50% after) — found via a real mismatch reported
against a 2014 hike point. The income-tax table models BOTH the Old Regime (frozen at its FY2019-20
shape, still valid today) and New Regime (from FY2020-21) independently, shown side by side rather than
asserting one — the first version of this file computed only the New Regime, silently assuming everyone
from FY2020-21 onward had chosen it, caught by a direct question before shipping. Powers a new "In Hand
Monthly" (post-tax) figure in the EPF hike breakdown popup, alongside the existing pre-tax "Net
Monthly." Both tables are deliberately labelled estimates/conventions, never asserted as fact, same
principle as every other computed-on-behalf-of-the-user value in this feature.

**Smaller fixes in the same round:** the Employer Detail popup (`EpfEmployerDetailModal.tsx`, new)
replaces tapping an employer row going straight into its transaction ledger — company identity,
editable exact dates, per-employer totals (`epfEmployerTotals`, new), and the full hike table now live
there, reached by tapping the row, with the ledger one explicit "See all transactions" tap away.
`Modal.tsx`'s title now gets `flex-1`+`numberOfLines={1}` (a long title, e.g. an employer name appended
to a sheet title, had no bound and could squeeze the close button off-screen). `EpfImportFlow.tsx`'s
batch-summary screen gained `scrollable`+`footer` plus a 15-file render cap with "Show all" — a large
batch previously made the confirm button unreachable. `EpfAllTransactionsSheet`'s contribution-row
total previously silently excluded EPS (pension) from both the per-month row and the FY-header
subtotal — now includes it. `EpfEmployerPickerSheet.tsx` now shows a per-employer "N need review"
badge (previously only a card-level total existed).

---

## Dependency graph (simplified)

**Updated 2026-08-29** — this used to describe `apps/web-react`'s entry chain
(`main.tsx`/`App.tsx`/`router/index.tsx`/`AppShell`/`BottomNav`); that app is retired. Below is
`apps/mobile`'s real equivalent.

```
index.ts
  └─► App.tsx
        ├─► PrivacyContext
        ├─► SettingsContext
        ├─► EventModeContext
        └─► navigation/RootNavigator.tsx
              └─► AuthGuard
                    └─► MainNavigator.tsx
                          └─► MainTabs.tsx (persistent tab bar + header chrome)
                                └─► HomeStack / ExpensesStack / <other per-tab stacks>
                                      └─► <feature pages>
                                            ├─► @/core/<domain>
                                            │     └─► @/core/db/repositories
                                            │           └─► @/core/crypto/keystore
                                            ├─► components/ui/<primitives>
                                            ├─► components/privacy/<masking>
                                            └─► context/<PrivacyContext, etc.>
```
