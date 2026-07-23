# Penny → React Native Migration Plan (living doc)

> **Status:** 🚧 In progress. **Track 0 ✅ + Track 1 ✅ + Track 2 ✅** (repo restructuring, Expo app
> skeleton, storage + crypto adapters — on-device crypto/storage verification still owed, headless dev
> environment). **Track 3 ✅** (core UI component library: all ~28 `components/ui/` ported to NativeWind +
> View/Text/Pressable, `Icon`/color-utility/theme-color infra built, a `ComponentGalleryScreen` wired as
> the reachable screen for visual verification once a device/simulator exists). **Track 4
> (feature-by-feature migration, pilot: Subscriptions) = next.** Full context: [`CLAUDE.md`](../../CLAUDE.md),
> architecture details in [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), design-pattern notes in
> [`docs/DESIGN_GUIDELINES.md`](../DESIGN_GUIDELINES.md), SQL schema mapping: [`docs/SCHEMA.md`](../SCHEMA.md),
> how to run it: [`docs/RUNNING_MOBILE.md`](../RUNNING_MOBILE.md).
>
> **Update discipline:** append a dated entry to the **Progress Log** (bottom) at every track, and keep
> the **Status** line + `CLAUDE.md`'s milestone table + `docs/ROADMAP.md`'s React Native row in sync.

---

## Why this doc exists

Penny is migrating to a first-class iOS/Android app (primary target) while keeping the existing web PWA
alive as a secondary target during the transition. This is a large, multi-track effort — this doc is the
single source of truth for the plan, the architectural decisions behind it, and what's actually shipped
vs. still pending.

## Locked-in decisions

- **Single Expo codebase** (managed workflow, not bare RN CLI, not Capacitor) targets iOS, Android, and
  eventually web (via `react-native-web`) — not two permanently separate UI folders.
- **`apps/web-legacy/`** (today's Vite app) stays running exactly as-is, untouched, as the live web
  experience until the new Expo/RN-Web build reaches documented parity with it (Track 7 gate).
- **Styling:** NativeWind, reusing the semantic token names already in `src/index.css`/`docs/DESIGN_GUIDELINES.md`.
- **Storage:** `expo-sqlite` on native, behind an interface narrowed from what `EncryptedRepository<T>`
  already uses; RN-Web falls back to the existing Dexie adapter.
- **Crypto:** `react-native-quick-crypto` polyfills `crypto.subtle` — `engine.ts`/`securityManager.ts`/
  `identityKeys.ts`/`recovery.ts` need **no logic changes**, only a base64 helper swap + a polyfill-install step.
- **Explicitly deferred but architecturally anticipated** (see `docs/ARCHITECTURE.md` decision log and
  the "Designed for, not built yet" list below): device pairing/QR (Track F4, unsettled design), real
  Anthropic/Chip integration (still mock-only), push notifications, biometrics, camera/QR scanning,
  receipt uploads, Android SMS-based expense capture, low-storage handling.

## Migration guidelines (apply throughout every track)

1. Reuse before rewrite — check `@penny/core` for existing pure-TS logic before writing anything new.
2. No behavior change without a flagged reason — every track defaults to functionally identical behavior; flag any intentional platform difference explicitly.
3. Security-critical files (`engine.ts`, `securityManager.ts`, `identityKeys.ts`, `recovery.ts`, `db/repository.ts`) get the most scrutiny — verified with cross-engine test vectors before anything is built on top.
4. Preserve architecture rules (Anthropic/Dexie import restrictions, no cross-feature imports, no-console-PII) at every new package boundary.
5. Preserve `docs/DESIGN_GUIDELINES.md` non-negotiables (centered modals, fixed chrome, back button, semantic tokens only) in every new screen.
6. Verify with the method specified per track — not "test it manually and move on."
7. Documentation discipline is part of "done," not a follow-up.
8. Build for extensibility where cheap; don't build deferred features early.
9. Never bundle unrelated changes into a migration commit.
10. No commits until a track is manually verified (automated check **and** side-by-side comparison against `apps/web-legacy`, confirmed with the user).
11. Keep `docs/RUNNING_MOBILE.md` current the first time each new run mode is introduced.

## Tracks

### Track 0 — Repo restructuring + shared core extraction — ✅ done
Moved `src/core/*`, `src/lib/*`, and the 5 framework-agnostic hooks (`useDataRefresh`, `usePassphraseStrength`,
`useProfile`, `useRepository`, `useTxnRefresh`) into `packages/core/src/`, verbatim. Everything else moved
into `apps/web-legacy/`. Stood up `pnpm-workspace.yaml`, per-package `package.json`/`tsconfig.json`, re-scoped
`eslint.config.js`'s `no-restricted-imports` rules. Removed the abandoned Capacitor experiment (`android/`,
`capacitor.config.ts`, `@capacitor/*` deps). Full details, what got fixed along the way, and verification
results are in the Progress Log below.

### Track 1 — RN app skeleton — ✅ done
`apps/mobile` via `create-expo-app`, NativeWind theme wired to `packages/core/src/theme/tokens.ts` (single
source of truth, 3 palettes + runtime dark-mode switching via NativeWind's `vars()`), React Navigation
stack+tabs, `AuthGuard` state machine **stubbed** (see below — not yet wired to real `@penny/core` calls).
Runs in plain Expo Go + web (no native modules yet). `docs/RUNNING_MOBILE.md` written. Details in the
Progress Log below.

### Track 2 — Storage + crypto adapter swap (highest risk) — ✅ done (on-device check owed)
`expo-sqlite` adapter (SQL DDL reimplementing the Dexie v1–v9 migration history) + `react-native-quick-crypto`
polyfill install. `AuthGuard` now calls the real `@penny/core` securityManager functions instead of Track 1's
stub. Verified via bundle inspection (confirms the platform split actually works, not just "should") and a
crypto test-vector suite — see the Progress Log for exactly what could and couldn't be verified in this
headless dev environment. From this track on, device testing needs an EAS development build (Expo Go
doesn't support `expo-sqlite`/`react-native-quick-crypto`) — see `docs/RUNNING_MOBILE.md`.

### Track 3 — Core UI component library port — ✅ done
All ~28 `components/ui/` rebuilt as NativeWind + View/Text/Pressable in `apps/mobile/src/components/ui/`,
preserving prop APIs (RN naming aside) and the centered-modal-only rule. `components/layout/` (`AppShell`/
`BottomNav`) intentionally not ported 1:1 — React Navigation's `RootNavigator`/`MainTabs` (Track 1) is the RN
equivalent. See the Progress Log for the icon/color/theme infra this needed and what got verified.

### Track 4 — Feature-by-feature migration
Pilot: **Subscriptions** (smallest fully-shipped module). Then Insurance/Loans/IOU → Goals → Accounts → Home →
Portfolio → Expenses (deliberately last — swipe gestures + SVG chart are the two hardest UI ports) → Groups →
Onboarding/Settings/Security/Profile/Activity → Backup/News/Calculators/Cashflow/Health/Feedback.

### Track 5 — Sync/backup
Google Drive OAuth swap (`expo-auth-session`), local backup via `expo-file-system`, connectivity/lifecycle via
`NetInfo`/`AppState`. Verified via cross-platform Drive-backup round-trip.

### Track 6 — Polish, E2E, store submission readiness
EAS Build/Submit, Maestro E2E (chosen over Detox — no native test-runner wiring against Expo managed workflow),
minimal CI for `packages/core`/`apps/web-legacy` tests.

### Track 7 — Web cutover
Once `apps/mobile`'s `react-native-web` build reaches documented parity with `apps/web-legacy` (every
`docs/features/*.md` capability, the `max-w-[430px]` layout, cross-platform Drive backup, no functional
regressions), delete `apps/web-legacy` so exactly one codebase remains.

## Designed for, not built yet

Real future features, each with a cheap architectural accommodation already in place or noted, but not
built ahead of schedule: native Google Drive OAuth (the `CloudProvider` interface is the seam), biometric
unlock (a third KEK type alongside PIN/passphrase), camera/QR scanning (Track F4 + receipt capture — Expo
config-plugin addition later), receipt photo upload on the expense form (`EncryptedRepository` already
supports arbitrary encrypted blobs), Android SMS-based expense capture (its own `.android.ts` seam later),
low-storage handling (Track 2's SQLite adapter should surface write errors as a typed error so a future UX
can hook in one place).

## Explicitly out of scope

Track F4 device pairing/QR, real Anthropic/Chip client, push notifications, biometrics, camera/QR scanning,
receipt uploads, Android SMS capture, low-storage handling, CAS/EPFO PDF import, PDF/HTML export, watchlist —
none are implemented or accelerated by Tracks 0–7. Pixel-identical web/mobile parity is not a goal; Track 7
defines the actual parity bar for retiring legacy web.

---

## Progress Log

### 2026-07-23 — Track 0 complete

- Created `feat/rn-migration` branch off `main`.
- Removed the abandoned Capacitor experiment: untracked `android/` directory (50MB, never committed),
  `capacitor.config.ts`, `@capacitor/*` deps.
- Installed `pnpm` (not previously available on the machine).
- Moved `src/` → `apps/web-legacy/src/`; extracted `src/core/*` + `src/lib/*` + 5 portable hooks into
  `packages/core/src/` (kept the `core/` nesting level so `@/core/...` import strings didn't need editing).
- **Fixed two core→app coupling smells surfaced by the move** (both genuine architecture issues, not just
  file-organization noise):
  - `session/SessionGate.tsx` (router + `SettingsContext`-coupled) moved back to `apps/web-legacy/src/session/`;
    `sessionStore.ts` (pure) stayed in `packages/core/src/core/session/`.
  - `advisor/guidance.ts` used to import `PATHS` from the web router to build navigation recommendations.
    Changed to return a semantic `AppRouteKey` (`'goals' | 'insurance' | 'expenses' | 'loans' | 'portfolio'`);
    the one caller (`FinancialHealthCard.tsx`) now maps that key to an actual `PATHS` value locally. Behavior
    unchanged; `packages/core` no longer imports anything router-specific — this was necessary groundwork
    since RN has no URL-path routing at all.
- Stood up `pnpm-workspace.yaml` (`packages/*`, `apps/*` — **not** `workers/*`, which stays on independent
  npm tooling per-worker, untouched), `packages/core/package.json`+`tsconfig.json`+`vitest.config.ts`,
  `apps/web-legacy/package.json` + moved tsconfigs/vite config/vitest config/index.html/public/scripts/env files.
- Re-scoped `eslint.config.js`'s Dexie/Anthropic `no-restricted-imports` rules to the new paths.
- Split `tests/`: all core-domain test folders → `packages/core/tests/`; `tests/worker/` (Cloudflare Workers
  tests) stayed at the repo root with its own new `vitest.config.ts`, since it tests `workers/` directly via
  relative imports and isn't part of either workspace package.
- **Two real bugs found and fixed during verification** (both flagged, not silently patched):
  - `packages/core/tests/identity/claim.test.ts`'s relative import to `workers/auth/src/lib/auth` needed one
    more `../` after the directory moved one level deeper.
  - Vite's alias config for `@/core/*`/`@/lib/*` had a `path.resolve()`-strips-trailing-slash bug causing
    `@/core/ai-safety/piiScanner` to resolve to `.../coreai-safety/piiScanner` (missing separator) — fixed by
    appending the slash explicitly after `path.resolve()`.
  - A phantom dependency surfaced: `@tabler/icons` (used by the icon-index build script) was never a direct
    dependency — it worked under npm's flat hoisting via `@tabler/icons-webfont`'s transitive dependency, but
    pnpm's strict `node_modules` correctly refused to expose it. Declared explicitly in `apps/web-legacy/package.json`.
- **Known seam flagged, not fixed:** `entitlement.ts`, `net/apiBase.ts`, `sync/providers/googleDriveProvider.ts`
  read `import.meta.env.VITE_*` directly (a Vite-ism with no Metro/RN equivalent). Kept as-is (types-only fix)
  to preserve behavior — needs a small env-access abstraction before Track 1's mobile app can consume these files.
- **Verification (all passed):**
  - `packages/core` Vitest suite: 398 tests / 53 files, all passing, zero test-content edits beyond the one
    relative-path fix above.
  - Root `tests/worker` suite: 39 tests / 5 files, all passing, unchanged.
  - `tsc -b` across the full workspace: exit 0, no errors.
  - `eslint` across `packages/core/src` + `apps/web-legacy/src`: exit 0, no errors.
  - `apps/web-legacy`: production build succeeds (`vite build` + PWA precache), dev server boots and serves
    the app correctly (manually curled, HTTP 200, correct HTML).
- Not yet done as part of Track 0: manual side-by-side UI walkthrough against a pre-migration baseline (no
  UI changed in this track, so lower priority — deferred, at the user's direction, to a final review pass
  across all tracks rather than gating each one). **Committed** (`2c40dec`) on `feat/rn-migration` after
  automated verification passed, per the user's explicit go-ahead to proceed and let them verify at the end.

### 2026-07-23 — Track 1 complete

- Scaffolded `apps/mobile` via `create-expo-app` (blank-typescript template), cleaned up its npm artifacts
  (`node_modules`, `package-lock.json`, template's own `AGENTS.md`/`CLAUDE.md`/`LICENSE`) and linked it into
  the pnpm workspace instead. Renamed the app to "Penny" (`app.json`: name/slug/scheme), set
  `userInterfaceStyle: "automatic"` for OS-driven light/dark.
- Extracted theme tokens to `packages/core/src/theme/tokens.ts` — the single source of truth (light/Penny
  Blue/dark palettes) read from `apps/web-legacy/src/index.css`'s CSS custom properties. Gave `@penny/core`
  a real `exports` map (`"./*": "./src/*.ts"`) and added `@penny/core` as an actual `workspace:*` dependency
  of `apps/mobile` — the first real (non-Track-0-shortcut) cross-package import in the monorepo.
- **Dynamic theming, not just static colours:** `tailwind.config.js` maps Tailwind color names to CSS
  variable references (`var(--color-surface)`, etc.); `src/theme/ThemeProvider.tsx` uses NativeWind's
  `vars()` to apply the active palette's actual hex values at runtime, resolving `'system'` via RN's
  `useColorScheme()` — matches the web app's 4-theme model (Light/Penny Blue/Dark/System) rather than
  hardcoding one palette.
- Installed React Navigation (`native`, `native-stack`, `bottom-tabs`) + `react-native-screens`/
  `react-native-safe-area-context` via `npx expo install` (version-matched to the Expo SDK). Built
  `RootNavigator` → `AuthGuard` → `MainTabs` (5 tabs: Home/Portfolio/Chip/Expenses/Goals, per `CLAUDE.md`'s
  nav structure) or `OnboardingStubScreen`.
- **`AuthGuard` is deliberately stubbed, not wired to real `@penny/core` calls yet.** The real
  `isOnboardingComplete`/`isSessionValid`/`isPinRotationDue` in `securityManager.ts` currently run against
  the Dexie/IndexedDB schema, which doesn't exist under Metro/RN — wiring them now would try to bundle
  `dexie` and fail immediately. `src/navigation/AuthGuard.tsx` documents this explicitly; Track 2 replaces
  the stub once the `expo-sqlite` adapter exists.
- Installed `nativewind` + `tailwindcss@^3.4` (pinned independently of `apps/web-legacy`'s v4 — NativeWind's
  RN toolchain is a separate concern) + `babel-preset-expo`, and wrote `babel.config.js`/`metro.config.js`/
  `global.css`/`tailwind.config.js`/`nativewind-env.d.ts`.
- **Two phantom-dependency bugs found and fixed** (same category as Track 0's `@tabler/icons` issue —
  pnpm's strict `node_modules` correctly refuses to expose transitive deps other tools assumed were
  hoisted): `react-native-css-interop` (NativeWind's `jsxImportSource` babel transform requires it directly
  resolvable from the app, not just from within `nativewind`'s own dependency tree) and a missing
  `declare module '*.css'` ambient type (TS couldn't type-check the side-effect `global.css` import).
- **Verification:**
  - `npx expo export --platform web`: bundled cleanly (576 modules, no Dexie/crypto-bundling errors —
    confirms the stub approach avoided pulling in native-only code this early).
  - Served the exported build and confirmed HTTP 200 + correct `<title>Penny</title>` + expected
    react-native-web boilerplate in the HTML.
  - `apps/mobile`'s own `tsc --noEmit`: clean. Root `tsc -b` (now referencing `apps/mobile/tsconfig.json`
    too): clean. `eslint` (root `pnpm lint`, glob already covers `apps/mobile/src`): clean after fixing an
    unused-callback-parameter error and adding `ThemeProvider.tsx` to the existing
    provider-exports-a-hook-too ESLint override. `prettier --check`: clean after formatting 2 files.
  - Full `pnpm test` (core + web-legacy + workers): 398 + 0 + 39 tests, all still passing — Track 1 touched
    no `@penny/core` logic.
  - **Not yet done:** an actual on-device/simulator/Expo-Go visual check (this environment is headless —
    only the web export could be verified here). Flagged for the user's end-of-migration review pass.

### 2026-07-23 — Track 2 complete (on-device verification still owed)

- **Storage adapter:** `packages/core/src/core/db/store.ts` defines `RowStore<T>` (`get/put/toArray/delete/
  count/update/clear` — verified this is the *complete* set of methods every call site in the codebase
  actually uses, including `db.security`'s `.update()` partial-merge and `.tables` array used by
  `wipeAllData()`, and `db.price_cache`'s plain get/put, not just the encrypted-store path). Narrowed
  `EncryptedRepository`'s constructor from Dexie's `Table` to `RowStore<EncryptedRecord>` — type-only change,
  zero behavior change on web.
- `packages/core/src/core/db/schema.native.ts`: an `expo-sqlite` implementation of the same `db` shape,
  every store as `(id TEXT PRIMARY KEY, data TEXT)` holding `JSON.stringify(row)` (no per-table column
  schemas needed — every row was already JSON-serializable under Dexie too), plus a `_migrations` table
  replaying the Dexie v1–v9 history as additive `CREATE TABLE` statements. Full mapping documented in
  `docs/SCHEMA.md` → "Mobile (React Native) storage engine".
- **Real per-platform typed properties**, not a blanket `Record<string, RowStore<unknown>>`: caught during
  verification that collapsing to `unknown` broke `securityManager.ts`'s `SecurityRecord` typing and its
  `db.tables.map((t) => t.clear())` call (Dexie's `.tables` array, used by `wipeAllData()` — a real method
  I'd missed on the first pass by only grepping the *encrypted*-store call sites, not `db.security`'s direct
  usage). Fixed by giving `schema.native.ts`'s `db` object the same explicit named properties `schema.ts`'s
  Dexie class has, plus a `tables` array built from the same instances.
- **Crypto polyfill:** `react-native-quick-crypto` (+ its `react-native-nitro-modules`/`react-native-quick-
  base64` peers) installed in `apps/mobile`. Its `install()` call is NOT unconditional in `index.ts` — it's
  split into `src/polyfills/installCrypto.native.ts` (calls `install()`) / `.web.ts` (no-op), the same
  Metro-platform-resolution pattern as `schema.native.ts`, because an unconditional import would have tried
  to bundle a native-only module into the web target and broken it.
- `AuthGuard.tsx` now imports and calls the real `isOnboardingComplete`/`isSessionValid`/`isPinRotationDue`
  from `@penny/core/crypto/securityManager` (Track 1's stub is gone).
- **Real finding that simplified scope vs. the plan:** React Native has shipped native `atob`/`btoa`
  globals since RN 0.74; `apps/mobile` is on RN 0.86. The plan's assumed base64-helper abstraction
  (`packages/core/src/lib/base64.ts`) turned out to be unnecessary — `repository.ts`'s existing `atob`/
  `btoa` calls needed zero changes. Documented here rather than silently building an abstraction nobody needs.
- **Cleaner package exports:** added `./theme/*`, `./lib/*`, `./crypto/*`, `./identity/*`, `./session/*`,
  `./db/*` to `packages/core/package.json`'s `exports` map (in addition to the general `./*` fallback) so
  consumers don't have to write the awkward double-nested `@penny/core/core/crypto/securityManager` (a side
  effect of Track 0 keeping the `core/` folder nesting for its path-alias shortcut).
- **A second real cross-package-resolution gap found and fixed** (same class of issue as Track 0's
  `EncryptedRepository` narrowing, now hitting `apps/mobile` specifically): `securityManager.ts` uses
  `packages/core`'s own internal `@/*` alias, but since `apps/mobile` now imports it via genuine package
  resolution (not Track 0's raw-path shortcut), TypeScript resolves that file's imports using *whichever
  program included it* — so `apps/mobile/tsconfig.json` needed the same `@/*` → `packages/core/src/*` alias
  defined too. Also needed `moduleSuffixes: [".native", ""]` so `tsc` mirrors Metro's platform-file
  resolution instead of erroring on bare imports that only have `.native.ts`/`.web.ts` variants.
- **Verification — what was and wasn't possible in this headless dev environment (being explicit, per the
  plan's own honesty principle):**
  - ✅ **Bundle inspection** (the strongest check available here): exported real iOS, Android-equivalent,
    and web bundles via `expo export:embed`, then grepped the unminified output. iOS bundle: SQLite adapter
    markers (`_migrations`, `INSERT OR REPLACE INTO`) present, `PennyDatabase`/Dexie completely absent, 129
    hits for the quick-crypto/Nitro module. Web bundle: the reverse — Dexie/`PennyDatabase` present, zero
    real quick-crypto inclusion. This is a real, verified confirmation of the platform split working, not
    an inference from reading the code.
  - ✅ **Crypto test vectors** (`packages/core/tests/crypto/crossEngineVectors.test.ts`, 3 new tests, 401
    total now passing): fixed PBKDF2 derivation, a fixed-key/fixed-IV AES-256-GCM round-trip, and the
    deterministic Ed25519-from-passphrase recovery keypair — all computed and asserted against Node's Web
    Crypto (what `apps/web-legacy` effectively runs). ECDSA deliberately excluded from fixed-vector testing
    since P-256 ECDSA isn't deterministic without RFC 6979.
  - ✅ `tsc -b` (whole workspace), `eslint`, `prettier --check`, full `pnpm test`: all clean.
  - ❌ **Not done, genuinely can't be done here:** running the actual `react-native-quick-crypto` Nitro
    module (requires a real device/simulator — it's native code, not something Node/Vitest can execute) to
    confirm the same fixed vectors reproduce identically; the PBKDF2 600K/200K timing re-benchmark on a
    real mid-range Android device; an actual on-device SQLite read/write smoke test; the backup-bundle
    cross-engine round-trip and seeded-demo-data cross-platform comparison the plan calls for. **All of
    these require the user's own device/simulator** — flagged explicitly rather than assumed passing.

### 2026-07-23 — Track 3 complete

- **Icon infra:** `apps/mobile/src/components/Icon.tsx` resolves the web app's `ti-*` Tabler-webfont-class
  convention to `@tabler/icons-react-native` SVG components via a name-transform lookup (`ti-alert-triangle`
  → `IconAlertTriangle`), so every caller across the whole app — hundreds of distinct icon names in feature
  code, not just these 28 files — keeps using the exact same strings when its screen is ported in Track 4.
  Installed `@tabler/icons-react-native` + `react-native-svg`. Known tradeoff, accepted for now: dynamic
  name lookup means the whole icon set bundles (no per-icon tree-shaking) — revisit only if bundle size
  becomes a real problem (Track 6 territory).
- **Color infra:** `apps/mobile/src/lib/color.ts` reimplements web's `tint()`/`ink()` (which use CSS
  `color-mix()` — a string RN's style engine can't parse) with real hex math. `tint()` maps directly to
  RN's native `rgba()` alpha support (mathematically the same translucent-over-background effect); `ink()`
  does real channel blending since both its inputs are opaque. `apps/mobile/src/theme/useThemeColors.ts`
  resolves real hex from the active theme (via `packages/core/src/theme/tokens.ts`) for every place a web
  component used a `var(--color-*)` string as a prop default or inline style.
- **Real bug caught and fixed before it spread everywhere:** Track 1's `tailwind.config.js` named the
  brand-accent color `primary`, but web's `text-primary`/`bg-surface`/etc. utilities mean something else
  entirely (`text-primary` = *text* color, not brand green) — verified against `apps/web-legacy/src/
  index.css`'s actual utility definitions before porting a single component, and the Tailwind color-key
  vocabulary was rewritten to reproduce the exact same class names (`surface`, `surface-2`, `surface-3`,
  `primary`/`secondary`/`tertiary` as *text* tokens, `theme`/`theme-strong` as border tokens) web already
  uses — a silent miscoloring bug across all 28 components, caught early instead of discovered late.
- **DRY extraction during the port, not a duplication:** `AmountInput`'s parsing/grouping/inline-calculator
  logic (sanitize, Indian-grouping, a hand-rolled calculator evaluator) was pure math duplicated only inside
  web's `AmountInput.tsx`. Extracted to `packages/core/src/lib/amountInput.ts`; both platforms' `AmountInput`
  now import the same functions (web's file shrank by ~100 lines, behavior unchanged, existing tests still
  pass). `caretAfter` (DOM caret-position math) stayed web-only — RN's `TextInput` has no equivalent live
  selection-restoration hook, so the mobile port skips it (a minor, accepted UX simplification, not a
  functional gap: the value/`onChange` contract is identical).
- **`Modal`/`SelectInput` — the two components needing a real redesign, not a mechanical port:** `Modal`
  uses RN's own `Modal` (transparent + fade) with a full-screen dim backdrop and a centred card — matching
  the "centred, never a bottom sheet" rule without a portal library (no DOM to portal into) or a third-party
  bottom-sheet package; `level`/`nested` stacking props were dropped since RN's `Modal` is already a
  separate native layer. `SelectInput` (web: a DOM-positioned dropdown panel via `createPortal`, measuring
  the trigger's bounding rect) has no RN equivalent — reimplemented as the same centred `Modal` with an
  option list, consistent with the same design rule. Documented in `docs/DESIGN_GUIDELINES.md`.
- **`components/layout/` (`AppShell`/`BottomNav`) deliberately not ported 1:1** — both depend on
  not-yet-ported features (`PrivacyModeSwitcher`, `RemindersBell`, `DemoModeBanner`, `SyncProvider`/
  `GroupProvider`, `ContextSwitcher`, the entitlement-gated group switcher). React Navigation's
  `RootNavigator`/`MainTabs` (Track 1) is the real RN equivalent of routing-as-chrome; `MainTabs.tsx` was
  updated to match `BottomNav`'s icon/color/order for visual parity (using the new `Icon` component and
  `ChipAvatar`). A custom elevated-FAB button style for the Chip tab was attempted, then deliberately backed
  out — spreading tab-bar props onto a plain `View` doesn't wire touch handling correctly, and this
  environment has no way to test that live; deferred to Track 6 polish rather than ship unverified.
- **Small other findings:** `DetailRow`/`StatBox`'s `tabular-nums` (CSS font-variant-numeric) has no simple
  RN equivalent — dropped, cosmetic only. `SegmentedControl`'s `cols` prop (CSS Grid column count) dropped —
  RN has no grid primitive; always lays out as one flex-wrap row now. `FormField`'s error text used web's
  `--color-open` (privacy-mode red, not yet ported to `theme/tokens.ts`) — substituted `theme.danger` (same
  visual intent, flagged in a code comment).
- **Verification tool built, not just a smoke test:** `apps/mobile/src/screens/ComponentGalleryScreen.tsx`
  renders every ported component with representative props. Wired as the actually-reachable screen for now
  (`RootNavigator`'s `needs_onboarding` branch, since real onboarding UI doesn't exist until Track 4) —
  doubles as this track's bundle-resolution check *and* the tool for the plan's "visual checklist per
  component against the 4 themes" step once a device/simulator is available. Deleted the Track 1
  `OnboardingStubScreen.tsx` it superseded.
- **Verification:**
  - `tsc -b` (whole workspace), `eslint`, `prettier --check`: all clean.
  - Full `pnpm test`: 401 + 0 + 39 tests, all still passing (the `AmountInput` DRY extraction didn't change
    behavior — same functions, just relocated).
  - `apps/web-legacy` production build: still succeeds after the `AmountInput` refactor.
  - **Real bundle verification, not just type-checking:** exported the full component gallery for both iOS
    (7737 modules) and web (6814 modules) via `expo export:embed` — zero import/resolution errors across all
    28 components, the `Icon`/`react-native-svg`/NativeWind infra, and the theme hook.
  - **Not done, genuinely can't be done here:** actual visual/pixel verification on a device or simulator —
    this environment is headless. `ComponentGalleryScreen` exists specifically so this is a fast, complete
    check once Xcode/an emulator is available; flagged for the user's review pass, not assumed to look right.
