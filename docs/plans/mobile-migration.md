# Penny → React Native Migration Plan (living doc)

> **Status:** 🚧 In progress. **Track 0 ✅ + Track 1 ✅ + Track 2 ✅** (repo restructuring, Expo app
> skeleton, storage + crypto adapters — on-device crypto/storage verification still owed for Track 1/2
> specifically). **Track 3 ✅** (core UI component library: all ~28 `components/ui/` ported to NativeWind +
> View/Text/Pressable, `Icon`/color-utility/theme-color infra built, a `ComponentGalleryScreen` verification
> tool built). **Track 4 ✅ — Tier 1 shared infra ✅ + Subscriptions ✅ + Insurance ✅ + Loans ✅ + IOU ✅ +
> Goals ✅ + Accounts ✅ + Home ✅ + Portfolio ✅ + Expenses ✅ + Groups ✅ + Onboarding ✅ +
> Settings/Security/Profile/Activity ✅** (all thirteen modules verified on-device, an Android emulator; PrivacyContext/
> SettingsContext/ToastContext/`useLoggedRepository` ported as reusable prerequisites — see the
> dependency-survey Tier 1/2/3 split below; `components/shared/` (`ListRow`/`DueDateBadge`/`FormModal`)
> ported alongside Insurance as another shared prerequisite for Loans/IOU/Goals/Portfolio; real bugs found
> + fixed on-device: missing safe-area top inset outside a `Stack.Navigator`, sibling `fullWidth` Buttons
> in a `flex-row` overflowing instead of splitting evenly, a core `dueDateInfo()` CSS-var fallback with no
> RN equivalent, CSS Grid with no Yoga equivalent, Loans' dropped "Download XLSX" export (real capability
> gap, no native file-save/share flow built), and — all in **shared `packages/core`, not mobile-only
> files** — `useTxnRefresh` and `useDataRefresh` both using browser-only `window` events (the first crashed
> and got a `.native.ts` fix; the second was pre-empted with the same fix before it could crash) and
> `STATUS`'s colors being literal CSS var strings that silently failed across 3 already-shipped modules
> until IOU's on-device check caught the warning (fixed by swapping every mobile `STATUS.x` to `theme.x`,
> 7 files). IOU is scoped **personal-only** — its one `GroupContext` (Tier 2) dependency, an informational
> banner, is dropped rather than pulling Groups' sync machinery in early. **Home is also personal-only**
> (same precedent) — the web `activeGroup`/`GroupDashboard` branch and `HomeGroupsCard` are both dropped.
> Home also required porting a whole prerequisite **Health** module (`FinancialHealthCard`'s segmented
> score ring, a CSS `conic-gradient` with zero RN equivalent, redesigned as a multi-arc `react-native-svg`
> ring) and pulled in three new native deps for the first time since Track 3:
> `react-native-reanimated`(v4, for `MarketTicker`'s continuous-scroll marquee, no CSS-keyframe
> equivalent), `react-native-view-shot` + `expo-sharing` (Home's Stories feature renders a real RN `View`
> off-screen and snapshots it to share, replacing web's `<canvas>`+Web Share API — built now, not dropped,
> per user decision). **Portfolio is the largest Track 4 module yet** (~7,462 web lines across 53 files,
> ported by asset class in parallel) but — unlike IOU/Home — has **no `GroupContext`/Tier 2 dependency at
> all**, so no personal-only scoping decision was needed; ported in full. Two more `packages/core`
> `localStorage` bugs found and fixed the same way as `marketDataClient.ts`: `core/ipo/ipoClient.ts` and
> `core/nps/npsClient.ts` both get `.native.ts` siblings keeping an in-memory-only cache (session-scoped,
> not persisted across cold starts) instead of a mechanical `AsyncStorage` swap (their caches are
> synchronous, feeding async fetch functions — can't swap mechanically). Several hand-rolled `fixed
> inset-0` modal overlays across Real Assets/Retirement/IPO were rebuilt on the real ported `Modal`
> component rather than translated. **Expenses is the ninth module and CLAUDE.md's flagged "hardest
> port"** (~7,532 web lines, swipe gestures + an SVG chart both explicitly called out as the two hardest
> UI translations in this migration) — both solved rather than simplified, per user decision: swipe-to-
> reveal row actions rebuilt on `react-native-gesture-handler`'s `ReanimatedSwipeable` (new native dep,
> needs `GestureHandlerRootView` at the app root); both SVG charts (an annual bar+line chart, a donut
> reusing Health's exact multi-arc-via-stroked-circles technique) ported as plain `react-native-svg`, no
> new charting library. Receipt photo attachment and CSV/ZIP export were both built now, not dropped, via
> two more new native deps (`expo-image-picker` + `expo-image-manipulator` for receipts; `expo-file-system`
> + `expo-sharing`, reusing Home's Stories pattern, for export). **`EventModeContext` (vacation/trip mode)
> is the first Tier 2-adjacent context ported as a real prerequisite rather than dropped** — unlike
> IOU/Home's single droppable Groups banner, event tagging is threaded through filtering/analytics/the
> header, so dropping it wasn't a clean option; `GroupContext` itself is still dropped everywhere it
> appears (`ShareToGroupModal` skipped entirely, matching the personal-only precedent). Sub-page back
> buttons (web's
> `navigate(-1)`) are dropped for every module ported before real navigation exists — decided during
> Insurance, applies going forward. **Known limitation, applies to every module ported so far:** on-device
> saves throw "Session locked" — the temporary stand-in slot never runs onboarding/unlock, so the DMK is
> never set; only render/layout verification is possible until real onboarding lands (fix exists via Demo
> Mode's `initialize()`, deliberately deferred per user decision). **Track C (identity/auth) prerequisite
> ✅** — ported and verified end-to-end against the live `penny-auth` worker (see progress log): device
> keypair generation/storage, `signedFetch`, `claimAccount`, and — as a side effect of finally calling
> `securityManager.initialize()` on a real device for the first time in this whole migration — real
> DMK-based `EncryptedRepository` encrypt/decrypt is now confirmed working on-device too (previously only
> theoretically portable; every module up to now hit "Session locked" before ever exercising it). This
> doesn't change the "Session locked" limitation above (real onboarding still doesn't exist), but Groups'
> own hard prerequisite — a real claimed identity — is now unblocked. **Groups ✅** — `GroupContext` +
> all 9 `features/groups/*` components (`ContextSwitcher`, `GroupDashboard`, `SharedExpenseComposer`,
> `SettleUpGroupModal`, `GroupMembersModal`, `CreateGroupModal`, `JoinGroupModal`,
> `useGroupSummaries`/`useServerActionError`) ported, **plus** (user-requested, beyond a standalone
> module) the three Groups integration points previously dropped as personal-only scoping in Home and
> Expenses were restored: Home's `activeGroup → GroupDashboard` branch + `HomeGroupsCard`; Expenses'
> `ShareToGroupModal` + `shareGroups`/`onShareToGroup`/`onShareLater`/the Share swipe action +
> `familyGroupIds` in `useExpenseAnalytics`; and `EventsModal`'s inline `VacationGroupLink` sub-section.
> Almost no new platform-specific work was needed — `packages/core/src/core/groups/*` (943 lines) was
> already platform-agnostic, and the two browser-only bits `GroupContext` needed (`localStorage`, a
> `window` profile-change event) were already solved by Track C's `~/lib/storage` and
> `profileChangeBus.native.ts`. Two new native-API swaps, both confirmed working on a real device:
> `expo-clipboard` (new dep) for `GroupMembersModal`'s invite-link copy, and RN's built-in `Share` API for
> the invite share sheet. `ContextSwitcher`'s hand-rolled `fixed inset-0` web dropdown was rebuilt on the
> real ported `Modal`, same fix pattern as every other hand-rolled-overlay case this migration. **Verified
> end-to-end on-device against the live `penny-auth`/`penny-groups` workers** (not just render-only, unlike
> most prior modules) via a new scratch tool, `GroupsSmokeTestScreen`: claim → create a group → real
> worker round-trip (group + key creation) → `GroupDashboard` renders with the owner member → invite link
> created, copied via `expo-clipboard`, and shared via the real Android share sheet →
> `SharedExpenseComposer` renders with live split-breakdown → Expense form's restored "Share with a group"
> toggle appears once a group exists. One real (non-blocking) bug found on-device: `groupsService.ts`'s
> `buildJoinLink` falls back to an empty origin (`typeof location !== 'undefined' ? location.origin : ''`)
> on RN since `location` is undefined, producing an invite link with no host
> (`/app/groups/join#secret...`) — doesn't crash (already guarded) and wasn't fixed since it's shared
> `packages/core` code outside this step's scope; flagged for a future pass once mobile has a real deep-
> link/URL scheme to build the link against. **Onboarding + Settings/Security/Profile/Activity ✅** — real
> onboarding (13 screens, a new top-level `Stack.Navigator`/`OnboardingNavigator`/`MainNavigator`) finally
> sets a real Data Master Key on-device via a real UI for the first time in this migration, closing out
> the standing "Session locked" limitation every prior module hit; Settings/Security/Profile/Activity
> ported alongside it. Two real, previously-latent bugs were found and fixed during on-device
> verification, both severe enough to have crashed not just the app but the emulator process itself: (1)
> `schema.native.ts`'s single shared `expo-sqlite` connection had no serialization, and `seedDemoData.ts`'s
> `Promise.all(items.map(repo.put))` seeding pattern (~16 call sites, several hitting `expenses`
> concurrently) could silently drop writes and corrupt the native statement pool under that load — fixed
> with a single FIFO queue over every DB operation in `schema.native.ts`, not a per-call-site patch; (2)
> `TransactionsTab.tsx` rendered its full list via a plain `View`+`.map()` inside a parent `ScrollView` —
> harmless on web's DOM, but with demo data's ~1,000 seeded transactions this mounted ~1,000
> `SwipeableRow`s (each a real `react-native-gesture-handler` instance) simultaneously, which crashed hard
> on-device — fixed by rebuilding it on a virtualized `SectionList` (removing the now-redundant wrapping
> `ScrollView` in `TransactionsSlice.tsx`). **This module order now covers everything Track 4 originally
> scoped — Track 4 is complete.** Post-Track-4, a "restore what was dropped since Track 0" pass (user
> request) covered: full app navigation + back buttons ✅ (see the 2026-07-25 "full app navigation wiring"
> progress-log entry), IOU's Groups banner ✅, Loans' XLSX export ⚠️ **attempted, confirmed NOT working —
> see below**. ContextSwitcher's real entry point ✅ and a top-of-screen safe-area double-inset bug on
> Home/Portfolio/Expenses/Goals ✅ were also fixed (see the 2026-07-25 "ContextSwitcher wired" progress-log
> entry). **Beyond that restoration pass, a full feature-folder audit (`apps/web-legacy/src/features/` vs
> `apps/mobile/src/features/`) found 7 modules never ported at all — Feedback ✅, Import ✅, Backup &
> Restore ✅, Cashflow ✅, News ✅, Calculators ✅, Tax Awareness ✅ — all now ported and wired (see that
> same progress-log entry for full per-module detail). Chip is the one remaining unported web feature
> folder, and stays explicitly out of scope (Phase 2, full Chip AI).**
>
> **▶ Resume here:**
> 1. **Loans' "Download XLSX" is broken** — code is written and wired (`PlannerResults.tsx`) but throws an
>    uncaught Metro module-resolution error on-device (`Requiring unknown module "NNNN"` from
>    `await import('xlsx')`) that no in-app `try/catch` can intercept. Root cause: `xlsx`'s CJS entry has
>    `require('fs')`/`require('stream')` Metro can't fully stub (a `metro.config.js`
>    `resolver.extraNodeModules` stub was tried and reverted — didn't fix it). Needs either a different,
>    RN-targeted XLSX-writing library, or dedicated Metro bundling work. See the 2026-07-25 "IOU Groups
>    banner restored; Loans XLSX export attempted" progress-log entry for the full investigation.
>    (User has asked to research alternative XLSX libraries later — not started yet.)
> 2. **On-device verification of the 7 newly-ported modules is in progress** (see the 2026-07-25 "RN-web
>    platform gap + onboarding layout bug + native module linking" progress-log entry below) — two real
>    bugs found and fixed so far (RN-web's missing `.web.ts` platform resolution; the onboarding
>    `OnboardingBack` layout bug across all 11 onboarding screens), **one still open and blocking further
>    testing**: `TurboModuleRegistry.getEnforcing(...): 'QuickBase64' could not be found` on-device —
>    `react-native-quick-base64` (nested under `@craftzdog/react-native-buffer` → `react-native-quick-
>    crypto`) isn't linked into the currently-installed native APK. Native rebuild (`npx expo run:android`)
>    was recommended as the fix but not yet confirmed working — **if a rebuild doesn't clear it, the
>    autolinking of this nested dependency needs real investigation**, not just another rebuild attempt.
>
> **Uncommitted work as of 2026-07-25**: everything from Track C onward (Groups, Onboarding,
> Settings/Security/Profile/Activity, the two demo-mode bug fixes, and this whole restoration pass) is
> sitting uncommitted in the working tree — `git status` will show a large diff. Check with the user
> before committing (a prior mid-session commit already landed Track 4 modules 1–9 + Track C + Groups as
> `6d1c2a3`; everything since is new).
>
> Full context:
> [`CLAUDE.md`](../../CLAUDE.md),
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
Pilot: **Subscriptions** (smallest fully-shipped module) — ✅ done. **Insurance** — ✅ done. **Loans** — ✅ done.
**IOU** — ✅ done (personal-only scope, see progress log). **Goals** — ✅ done. **Accounts** — ✅ done.
**Home** — ✅ done (personal-only scope, see progress log). **Portfolio** — ✅ done (no group dependency,
ported in full — see progress log). **Expenses** — ✅ done (deliberately-last hardest module; swipe
gestures + SVG chart both solved, see progress log). **Groups** — ✅ done (standalone module + restored
Home/Expenses integration points, see progress log). Then
Onboarding/Settings/Security/Profile/Activity → Backup/News/Calculators/Cashflow/Health/Feedback.

**Sub-page navigation (decided during Insurance):** modules with a back button (`navigate(-1)` on web) drop it for
now — reached only as `AuthGuard`'s temporary `needs_onboarding` stand-in, there's no `Stack.Navigator` and thus no
real "back" destination yet. Applies to every remaining sub-page module until real onboarding/tab navigation lands.

**Shared-infra dependency survey (done once during the Subscriptions pilot, not per-module):** every
`apps/web-legacy/src/features/*`'s `@/context/*`/`@/hooks/*` imports were grepped up front, splitting into
three tiers so later modules don't rediscover the same prerequisites one at a time:
- **Tier 1 (ported, Subscriptions pilot):** `PrivacyContext`, `SettingsContext`, `ToastContext`,
  `useLoggedRepository` — needed by Subscriptions, Insurance, Loans, Goals, Accounts, Activity, Portfolio,
  Health outright, and a subset of what Home/Cashflow/Tax/Settings/Expenses need too. `useForecast` was
  ported during Home (pure hook, no cross-module dependency once actually surveyed — see Home's progress
  log entry) and is now also Tier 1.
- **Tier 2:** `GroupContext` — Phase 1.5's sync/multi-device machinery (env-gated, worker/D1-backed), real
  weight, deliberately not pulled in early; IOU/Portfolio still drop it (see their progress log entries).
  `EventModeContext` was ported during Expenses (a real prerequisite, not dropped) and is now Tier 1.
  `GroupContext` itself was ported during the Groups step (see its progress log entry) — Home and Expenses'
  previously-dropped integration points were restored at that point too, so it's no longer purely dropped
  everywhere, but it's still only pulled in where a module actually needs group-scoped behavior.
- **Tier 3 (not yet ported):** `OnboardingDraftContext` — needed for onboarding/security.

`useRepository`/`useProfile`/`useDataRefresh`/`useTxnRefresh`/`usePassphraseStrength` were already
platform-agnostic in `packages/core/src/hooks/` — no porting needed for any tier.

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

### 2026-07-23 — Track 4 Tier 1 shared infra + Subscriptions pilot complete

- **Planned as a shared-infra pass first, not a per-module port:** porting Subscriptions in isolation kept
  surfacing not-yet-ported providers (`PrivacyContext`, `SettingsContext`, `ToastContext`) one at a time.
  Before writing any Subscriptions code, grepped every `apps/web-legacy/src/features/*` for its
  `@/context/*`/`@/hooks/*` imports and split the results into three tiers (see the Track 4 section above)
  — Tier 1 covers the large majority of near-term modules and was ported once, up front.
- **Tier 1 ported:** `apps/mobile/src/lib/storage.ts` (AsyncStorage helper — new dependency
  `@react-native-async-storage/async-storage`, requiring a native rebuild); `apps/mobile/src/context/
  PrivacyContext.tsx` (same API as web; `document.body`/`visibilitychange` → dropped/RN `AppState`; async
  hydration mirrors `AuthGuard.tsx`'s checking-state pattern); `apps/mobile/src/context/SettingsContext.tsx`
  (ported in full except `theme`/`fontScale`, already superseded by mobile's own `ThemeProvider`);
  `apps/mobile/src/context/ToastContext.tsx` (a real bottom-anchored toast, not a stub — every future
  Tier-1 module's delete-with-undo flow needs it working); `apps/mobile/src/hooks/useLoggedRepository.ts`
  (unchanged logic, points at the new `ToastContext`). All three providers wrap `App.tsx`.
- **Subscriptions pilot ported:** `apps/mobile/src/features/subscriptions/` — `useSubscriptions.ts`
  unchanged beyond import paths; `SubscriptionsView`/`DetectedSubCard`/`ActiveSubCard`/`SubscriptionForm`/
  `SubscriptionsPage` rebuilt in RN using the Track 3 kit. One flagged platform simplification: "Last
  charged" is a plain `YYYY-MM-DD` text field instead of web's native HTML date input (no native
  date-picker dependency pulled in for this pilot). `RootNavigator.tsx`'s `onNeedsOnboarding` now renders
  `SubscriptionsPage` instead of `ComponentGalleryScreen` (per user call — no temporary dev switcher; full
  visual verification happens once more of the migration is done, not screen-by-screen).
- **Real on-device verification this time, not just bundle/type-checking** — an Android emulator
  (`penny_pixel` AVD) was available this session. `npx expo run:android` needed `JAVA_HOME` pointed at
  Android Studio's bundled JDK (`/Applications/Android Studio.app/Contents/jbr/Contents/Home` — no
  system-wide `java` was on `PATH`) and, once, a stale Metro dev server from earlier in the session killed
  and restarted (a long-lived `expo run:android` process reused across unrelated rebuilds can silently
  serve stale JS — `Skipping dev server` in its log is the tell). `pnpm android`/`pnpm start` do **not**
  work for this — see `docs/RUNNING_MOBILE.md`; only `npx expo run:android` builds a real dev client.
- **Two real bugs found and fixed via actual screenshots + a view-hierarchy dump (`adb exec-out screencap`,
  `uiautomator dump`), not assumed correct:**
  1. Status bar overlapped the `PageHeader` title — screens rendered outside a `Stack.Navigator` (straight
     out of `AuthGuard`) get no automatic safe-area handling. Fixed with `SafeAreaView` (`edges={['top']}`).
  2. The Add-subscription modal's footer ("Cancel"/"Add", both `fullWidth` in a `flex-row`) rendered with
     "Add" pushed almost entirely off-screen. Root cause: RN's Yoga layout engine defaults `flexShrink` to
     `0` (CSS flexbox defaults to `1`), so two siblings each with an explicit `width: 100%` don't shrink to
     fit. Fixed by wrapping each `Button` in its own `<View className="flex-1">`. **Flagged for every later
     Track 4 module:** any web modal footer using this exact `fullWidth`-pair-in-`flex-row` pattern will hit
     the same bug when ported.
- **Verification:** `tsc -b` (whole workspace), `eslint`, `prettier --check` all clean; full `pnpm test`
  (401 + 39 tests) unchanged/passing; real device verification — installed and exercised on the
  `penny_pixel` Android emulator (tab switching, empty states, Add-subscription modal open/fill/close,
  hardware-back dismissal — no crashes, confirmed via `adb logcat`).

### 2026-07-23 — Track 4 Insurance module complete

- **Second Track 4 module, second real prerequisite gap found the same way as Subscriptions':** before
  writing any Insurance code, traced its imports and found `apps/web-legacy/src/components/shared/`
  (`ListRow`, `DueDateBadge`, `FormModal` — 119 lines total) is used by Insurance **and** Loans/IOU/Goals/
  Portfolio, i.e. exactly what's coming next. Ported once to `apps/mobile/src/components/shared/` rather
  than rediscovering it per-module, same reasoning as the Tier 1 context survey.
- **`useInsurance.ts` is the first real exercise of the `useLoggedRepository`/`ToastContext` undo-on-delete
  path** — Subscriptions never calls `remove()`, so its Toast/undo wiring was built but unverified in
  practice; Insurance's delete-policy flow uses it for real.
- **`FormModal` bakes in the Subscriptions-bug fix from the start:** its Cancel/Delete/Save footer uses the
  same `fullWidth`-pair-in-`flex-row` pattern that overflowed in `SubscriptionForm` — wrapped each button in
  its own `flex-1` View here from day one, so every future `FormModal` consumer (Loans, IOU, Goals,
  Portfolio, and Insurance itself) avoids the bug by construction instead of hitting it independently.
- **A third portability gap found while porting `DueDateBadge`:** core's `dueDateInfo()` (`packages/core/
  src/lib/date.ts`) returns the literal CSS var string `'var(--color-surface-secondary)'` for its
  far-future case — meaningless to RN's style engine. Rather than changing shared core behavior (which
  would alter web's live-theme-following background for that one state), `DueDateBadge` substitutes the
  active theme's real `surfaceSecondary` hex for that specific string, matching Track 3's `tint()`/`ink()`
  precedent for "web CSS-only construct needs a platform swap at the RN call site, not in core."
- **CSS Grid has no Yoga equivalent** (again, per Track 3's `SegmentedControl` note) — `PolicyForm`'s
  `grid-cols-4` policy-type picker became a `flex-row flex-wrap` of `w-[23%]` tiles; its `grid-cols-2`
  amount-fields row became `flex-row gap-3` with `flex-1` children.
- **Navigation decision made here, applies to every future sub-page module:** `InsurancePage`'s back button
  (web's `navigate(-1)`) needs a real `Stack.Navigator`/`useNavigation()` context that doesn't exist yet
  (screens are still just swapped into `AuthGuard`'s `needs_onboarding` stand-in). Asked the user rather
  than assuming; decided to drop the back button for now rather than stand up navigation early — revisit
  once onboarding + tab navigation are real. `RootNavigator.tsx` now renders `InsurancePage` in that slot
  (superseding Subscriptions, which superseded `ComponentGalleryScreen`).
- **Verification:** `tsc -b`, `eslint`, `prettier --check` all clean; full `pnpm test` (401 + 39) unchanged;
  real device verification on `penny_pixel` — screenshots confirmed the empty state, the FAB, and the full
  Add-policy form (4→2-row type grid, both amount fields with live Indian-grouped formatting **and**
  amount-in-words helper text rendering correctly, confirming `packages/core/src/lib/amountInput.ts`/
  `amountToWords.ts` work unchanged on RN). Stopped short of confirming a full submit-and-list round trip
  live — blocked by an `adb`-only interaction quirk (the on-screen keyboard covering the footer button, and
  a synthetic back-press closing both the keyboard and the modal in one event), not an app bug; the
  underlying `save`/`useLoggedRepository` path is unchanged from Subscriptions' already-verified one.

### 2026-07-23 — Track 4 Loans module complete

- **Third Track 4 module, biggest so far (~900 web lines across 7 files, two tabs: My Loans + Planner).**
  `useLoans.ts`/`useLoanForm.ts`/`usePlanner.ts` all ported unchanged beyond import paths — pure logic,
  same as every hook so far.
- **One real capability gap dropped, not a platform simplification:** web's "Download XLSX" button
  lazy-loads the `xlsx` package and calls its browser-only `writeFile` (triggers a DOM download) — no RN
  equivalent exists without a native file-save/share flow, which this migration hasn't built. Treated the
  same as the migration's already-out-of-scope PDF/HTML export rather than trying to build a
  `expo-file-system`+share-sheet flow mid-port; flagged in `docs/features/loans.md` as a real feature gap,
  not glossed over as a "platform difference."
- **CSS Grid shows up twice more** (loan-type picker, tenure/rate rows, and — the biggest one yet — the
  6-column amortization table's `gridTemplateColumns: '2rem 4.5rem 1fr 1fr 1fr 1fr'`) — same `flex-row`
  swap as Insurance, fixed-width `View`s for the `#`/Date columns and `flex-1` for the four amount columns.
  Verified live: filled in a real loan scenario (₹40L @ 9.3% over 20 years) and scrolled through all 240
  amortization rows on-device — EMI/principal/interest/balance all computed correctly, balance reaching
  exactly ₹0 at month 240, confirming both `calcAmortization` (unchanged core math) and the new flex-based
  table layout render correctly together.
- **Another CSS-var pair found** (the computed-EMI banner's `var(--color-surface-secondary)`/
  `var(--color-primary)`) — same `useThemeColors()` substitution pattern as `DueDateBadge`.
- **Verification:** `tsc -b`, `eslint`, `prettier --check` all clean; full `pnpm test` (401 + 39) unchanged;
  real on-device verification on `penny_pixel` — My Loans empty state, the Planner tab's full input surface
  (Loan Basics/Accelerators/Lump Sum Prepayments cards, `SelectInput` month/year dropdowns pre-populated
  with the real current date), the Summary comparison card, and the full amortization table all confirmed
  rendering correctly with real computed data. Also hit (and worked around, not an app bug) the same
  `adb`-only quirks as Insurance: a stale/backgrounded app needing a `force-stop`+relaunch to pick up the
  latest JS, and a synthetic back-press exiting the app entirely at this screen's root (expected given no
  `Stack.Navigator` exists yet — matches the already-agreed dropped-back-button decision).

### 2026-07-23 — Track 4 IOU module complete

- **Fourth Track 4 module (~1258 web lines across 7 files), and the first to genuinely need a Tier 2
  ("not yet ported") dependency decision.** Traced exactly how `IouView` uses `GroupContext` before
  assuming anything: it's read only to show one informational banner ("Your personal IOUs. Group balances
  live in each group.") when the user has a claimed username and belongs to groups — the actual ledger data
  model (`useIou.ts`) was already personal-only regardless. Scoped this port as **personal-only IOU**
  (the option the Tier 1/2/3 survey already anticipated) — dropped the banner and its `GroupContext`/
  `hasEntitlement('sync')` dependency entirely rather than pulling in Groups' sync/multi-device machinery
  early. `useIou.ts`/`useLoanForm`-equivalent logic ported unchanged beyond import paths and the
  `localStorage`→AsyncStorage swap for the one-time legacy-migration flag.
- **`PersonPicker` rebuilt, not just re-skinned:** web renders its type-ahead suggestions as a DOM-positioned
  `absolute` overlay. RN has no equivalent (same reasoning as `SelectInput`'s existing port note), so this
  renders suggestions inline in normal document flow below the field — verified on-device: typing "Alex"
  correctly showed a "+ Create 'Alex'" affordance pushing the rest of the form down, not floating over it.
- **Added `IouPage.tsx`, a mobile-only wrapper** — web never gives IOU its own page (`IouView` is always
  embedded as the Expenses module's IOU tab via `IouSlice.tsx`); since Expenses isn't ported yet, this is a
  thin `PageHeader` shell purely so IOU is reachable as a coherent standalone screen for this interim stage.
- **Two more real bugs found on-device, both in shared `packages/core` — not mobile-only files, meaning
  they were latent in already-shipped modules too:**
  1. `packages/core/src/hooks/useTxnRefresh.ts` (cross-hook-instance "transactions changed" signal) used
     browser-only `window.addEventListener`/`dispatchEvent` — crashed immediately
     (`TypeError: undefined is not a function`) the moment IOU became the first module to actually call it
     (Subscriptions/Insurance/Loans never needed cross-instance refresh). Fixed with
     `packages/core/src/hooks/useTxnRefresh.native.ts` — Metro resolves `.native.ts` over the plain file
     for native builds (Vite always resolves the plain one, same convention as `schema.native.ts` from
     Track 2) — replacing the DOM event with a plain in-memory listener `Set`. Required killing and
     restarting Metro after adding it: a long-lived session didn't pick up the *new* file even after the
     fix was written, matching the earlier lesson that stale Metro state can serve outdated JS silently.
  2. `packages/core/src/lib/statusColors.ts`'s `STATUS` object is entirely literal CSS var strings
     (`STATUS.success = 'var(--color-success)'`, etc.) — meaningless as RN color values. Unlike bug #1 this
     failed **silently** (RN logs `"var(--color-success)" is not a valid color or brush` as a warning and
     drops the color rather than crashing), so it had been shipping unnoticed since Subscriptions' and
     Loans' on-device passes — small colored elements (badges, icons) were likely rendering with no color
     at all and it wasn't visually obvious in screenshots. IOU's on-device check happened to surface the
     warning in `adb logcat`. Fixed by replacing every mobile `STATUS.x` usage with `theme.x` from
     `useThemeColors()` (already exposes real hex for the identical semantic names) across 7 files:
     `DetectedSubCard`/`ActiveSubCard` (Subscriptions), `PlannerResults` (Loans), and
     `EntryForm`/`PersonListView`/`PersonLedgerView`/`SettleUpModal` (IOU). **Flagged for every future
     module:** `packages/core`'s `STATUS` (and its co-located `tint()`/`ink()`) stay web-only by design —
     mobile code must never import `STATUS` directly, always resolve status colors via `useThemeColors()`.
- **Verification:** `tsc -b`, `eslint`, `prettier --check` all clean; full `pnpm test` (401 + 39) unchanged;
  real on-device verification on `penny_pixel` — empty state, the full Add-IOU form (OptionButton colors
  now rendering correctly post-fix, inline PersonPicker create-affordance), all confirmed via screenshots
  and `adb logcat` (no crashes, no color warnings) after the fix.
- **Known limitation surfaced here, applies to every Track 4 module already ported (not an IOU-specific
  bug):** pressing "I lent this" threw `Error: Session locked — master key not available`
  (`packages/core/src/core/crypto/keystore.ts`). Every ported screen is currently rendered at `AuthGuard`'s
  `needs_onboarding` stand-in slot precisely because `isOnboardingComplete()` is false — which means the
  Data Master Key has never been set (that only happens via real `initialize()`/`unlock()`, part of
  onboarding, which doesn't exist on mobile yet). Reads work fine (nothing to decrypt yet); **any save in
  any already-ported module** (Subscriptions, Insurance, Loans, IOU) would hit this same error — it just
  hadn't been triggered yet, since earlier `adb` tap-timing issues kept save buttons from actually firing.
  Penny already has a mechanism that would fix this (Demo Mode's `initialize(DEMO_PASSPHRASE, DEMO_PIN)`,
  the same one web's "Explore with Demo Data" onboarding screen uses, which wouldn't flip
  `isOnboardingComplete()` since it doesn't create a profile record) — **explicitly deferred per user
  decision**: don't auto-bootstrap a session now, accept that only render/layout verification is possible
  on-device until real onboarding lands. Future modules' on-device checks should expect the same limitation
  for any save/write action and not treat it as a new bug.

### 2026-07-24 — Track 4 Goals module complete

- **Fifth Track 4 module, smallest since Subscriptions (528 web lines across 7 files) — no new
  prerequisite gaps, no new bugs.** `useGoals.ts`/`useSipCalculator.ts` ported unchanged beyond import
  paths. All the CSS-portability patterns needed here (CSS var/`color-mix()` → `Badge` + `~/lib/color`'s
  `tint()`; CSS Grid → `flex-row flex-wrap`) were already established during Insurance/Loans — this module
  applied them without discovering anything new, a good sign the Tier 1 survey + accumulated port patterns
  are paying off.
- `GoalForm`'s 3-column risk picker uses `compact` `OptionButton` tiles (RN's icon-above-label small-tile
  variant, documented as built for exactly this) rather than mechanically porting web's non-compact
  full-width `OptionButton` into a 3-column layout — a deliberate adaptation, not a mechanical port.
- **Verification:** `tsc -b`, `eslint`, `prettier --check` all clean; full `pnpm test` (401 + 39) unchanged;
  real on-device verification on `penny_pixel` — empty state, SIP Calculator tab (info box, all fields,
  SegmentedControl), and the full Add-goal form (target date correctly pre-filled to today + 1 year,
  3-column risk picker rendering with correct colors) all confirmed via screenshots. Also re-confirmed
  `AmountInput`'s Indian-grouping/words helper with a real value entered live (₹20,00,000 → "Twenty Lakh").

### 2026-07-24 — Track 4 Accounts module complete

- **Sixth Track 4 module (547 web lines across 6 files).** `useAccounts.ts`/`useAccountForm.ts` ported
  unchanged beyond import paths.
- **Found and fixed another `packages/core` bug proactively, before it could crash on-device this time:**
  `useDataRefresh.ts` (cross-instance refresh signals for accounts/categories/tags, used when Settings →
  Safe Mode edits one through a separately-mounted repo instance) has the exact same
  `window.addEventListener`/`dispatchEvent` pattern as `useTxnRefresh.ts` (fixed for IOU last session).
  Recognized the pattern on sight while reading `useAccounts.ts`'s imports and pre-emptively added
  `packages/core/src/hooks/useDataRefresh.native.ts` (same `.native.ts`/Metro-resolution convention, same
  in-memory-listener-`Set` fix) *before* attempting on-device verification, instead of waiting to
  rediscover it via a crash like last time. Worth remembering for any future module: **grep any new
  `packages/core` hook import for `window.`/`document.` before first on-device run**, not after.
- `ReconcileModal`'s `ink()` call moves to `~/lib/color`'s version, which — unlike core's `statusColors.ts`
  version — takes the "toward" color as an explicit second argument (`ink(color, theme.textPrimary)`)
  since there's no CSS var default to fall back to on RN.
- `AccountFormModal` uses the shared `FormModal` even though web used a raw `Modal` here (no delete
  action) — for consistency with every other add/edit form ported in Track 4 so far, not because it was
  strictly required.
- **Verification:** `tsc -b`, `eslint`, `prettier --check` all clean; full `pnpm test` (401 + 39) unchanged;
  real on-device verification on `penny_pixel` — proactively killed and restarted Metro before testing
  (since a new `.native.ts` file was added, matching the lesson from IOU about stale Metro not picking up
  new files) — empty state with header "+" action button, and the full Add-account form (4-column type
  grid, all fields, Toggle) confirmed rendering correctly via screenshots, no crashes.

### 2026-07-24 — Track 4 Home module complete

- **Seventh Track 4 module, largest scope so far** — the Home dashboard, plus a full prerequisite survey
  (dependency-survey Tier 1/2/3 split, same method as the Subscriptions pilot) that fed directly into
  the port. Files: `useHome.ts`, `useHomeStats.ts`, `HomePage.tsx`, `GlanceHeader.tsx`, `AccountsStrip.tsx`,
  `MoneyStatsCard.tsx`, `ToolsGrid.tsx`, `MarketTicker.tsx`, `stories/{storyTypes,useHomeStories,
  StoriesRow,StoryViewer,ShareCard,shareStoryImage}.tsx` (new `apps/mobile/src/features/home/`), plus a
  full prerequisite **Health** module (`useHealthScore.ts`, `ScoreGauge.tsx`, `ComponentCard.tsx`,
  `ScoringGuide.tsx`, `HealthDetailModal.tsx`, `FinancialHealthCard.tsx` — new
  `apps/mobile/src/features/health/`) and a standalone `useForecast.ts` hook port
  (`apps/mobile/src/hooks/useForecast.ts`).
- **Scope, matching the IOU precedent:** Home is **personal-only** — web's `useGroupContext`/`activeGroup`
  branch (swaps the whole screen for `GroupDashboard`) and `HomeGroupsCard` are both dropped until Groups
  is ported.
- **First new native dependencies since Track 3:** `react-native-reanimated` (v4.5.0, + its
  `react-native-worklets` peer and a `babel.config.js` plugin entry), `react-native-view-shot`, and
  `expo-sharing` (config plugin auto-registered in `app.json`). `expo-linear-gradient` was also added
  (needed for Stories' gradient card backgrounds/rings, a plain `[string, string]` hex-tuple replacement
  for web's CSS `linear-gradient()` strings).
- **Three genuine "no RN equivalent" gotchas, each solved rather than dropped, per explicit user decisions
  made up front (asked before porting, not discovered mid-port):**
  1. **`conic-gradient`** (`FinancialHealthCard`'s segmented health-score ring) — RN has zero support, worse
     than the already-known `color-mix()` gap. Redesigned as a stack of `react-native-svg` `Circle`s, one
     full circle per score component, each showing only its own arc via `strokeDasharray` + `rotation`,
     the same "one stroked circle per segment" technique `ProgressRing` already used for a single segment.
  2. **CSS keyframe marquee** (`MarketTicker`'s continuous horizontal scroll, `@keyframes penny-marquee` in
     web's `index.css`) — ported to `react-native-reanimated`: render the ticker list twice back-to-back,
     measure one copy's width via `onLayout`, drive `translateX` with
     `withRepeat(withTiming(-copyWidth, {duration: 32000, easing: linear}), -1, false)` — each repetition
     restarts from 0, landing exactly on the second identical copy, so the loop reads as seamless. Confirmed
     animating on-device (ticker text visibly shifted position between two screenshots taken seconds apart).
  3. **Canvas + Web Share API** (Stories' share button — web drew to a `<canvas>`, then
     `navigator.share`) — built now, not dropped (unlike Loans' XLSX export precedent, per explicit user
     choice this time): a new `ShareCard.tsx` renders the exact same visual as a real, mounted (but
     off-screen, `left: -3000`) RN `View` wrapped in a `react-native-view-shot` `ViewShot` ref; a new
     `shareStoryImage.ts`'s `captureAndShareCard()` calls `.capture()` for a temp PNG, then
     `expo-sharing`'s `Sharing.shareAsync()` opens the native share sheet.
- **Two more real `packages/core` bugs found and fixed proactively** (same "grep new core imports for
  `window.`/`import.meta` before first on-device run" discipline established during Accounts):
  - `marketDataClient.ts`'s `loadEnabledTickers`/`saveEnabledTickers` called `localStorage` directly —
    would have thrown uncaught on first ticker toggle. Reimplemented that persistence in `MarketTicker.tsx`
    itself against `~/lib/storage`'s `AsyncStorage` wrapper (same storage key, so data stays compatible)
    rather than importing the two localStorage-based core functions as-is.
  - `marketDataClient.ts` transitively imports `packages/core/src/core/net/apiBase.ts`, which reads
    `import.meta.env` — a Vite-only global Metro/Hermes doesn't define. Both a `tsc` error and a real
    on-device crash risk. Fixed with a new `apiBase.native.ts` (same `.native.ts`/Metro-resolution
    convention as `useTxnRefresh.native.ts`/`useDataRefresh.native.ts`), reproducing each export's existing
    "no backend configured" fallback — mobile's honest current state (no `VITE_API_PROXY` equivalent set).
- Other translations, same established patterns: `STATUS.x` literal CSS-var strings → `useThemeColors()`
  lookups (`GlanceHeader`, `MarketTicker`, `ComponentCard`, `FinancialHealthCard`'s own local
  `STATUS_COLOR` map); CSS Grid → `flex-row flex-wrap` (`ToolsGrid`, `HealthDetailModal`); `localStorage` →
  `~/lib/storage`'s `AsyncStorage` wrapper (Stories' seen-tracking); `StoryViewer`'s
  `window.addEventListener('keydown', ...)` Escape/Arrow-key navigation dropped entirely (tap zones already
  provide the same affordance, matching the dropped-back-button precedent).
- `useHome.ts` (and its `AccountBalance`/`HomeSummary`/`CreditCardAccount`/`AssetGroup` exports) is the
  canonical source of these shared Home types — `GlanceHeader.tsx`/`AccountsStrip.tsx` were briefly
  written with local duplicate type declarations (since they were ported in parallel, before `useHome.ts`
  existed) and then updated to import from `useHome.ts` once it landed, removing the duplication.
- **A real lint bug found in the Health port during the final sweep, fixed post-hoc:** `FinancialHealthCard`
  originally computed its ring-segment offsets with a `let cumulative = 0` mutated inside `.map` during
  render — flagged by `react-hooks`'s immutability rule (mutating a render-scoped variable across renders).
  Fixed by extracting the whole calculation into a plain module-level `ringSegments()` function, so no
  mutable state lives inside the component body at all.
- **Verification:** `tsc -b`, `eslint`, `prettier --check` all clean across the whole `apps/mobile` project.
  Real on-device verification on `penny_pixel`: first build failed with "Unable to locate a Java Runtime"
  (fixed by pointing `JAVA_HOME` at Android Studio's bundled JBR — `/Applications/Android
  Studio.app/Contents/jbr/Contents/Home` — no system JDK was installed); first JS load crashed with
  `TypeError: undefined is not a function` in `NativeWorklets`'s `installUnpackers` (a stale Metro bundle
  cache predating the `babel.config.js` `react-native-worklets/plugin` addition — fixed by killing Metro
  and restarting via `expo start --clear`). After that, Home rendered cleanly: greeting, net worth/safe-to-
  spend glance card, money stats, the new SVG health ring (score 0/Critical — expected, no seeded data),
  live market ticker (with confirmed marquee animation), and the Tools grid. Accounts strip and Stories row
  correctly stayed hidden (both are empty-state-conditional and there's no seeded data in this session).

### 2026-07-24 — Track 4 Portfolio module complete

- **Eighth Track 4 module, by far the largest yet** — ~7,462 web lines across 53 files (`PortfolioPage.tsx`
  + `usePortfolioHoldings.ts` + 51 files across 6 asset-class sub-modules + IPO). The original monolithic
  4,957-line web `PortfolioPage.tsx` (per CLAUDE.md's milestone table) was already split by Pre-Phase 1.5
  into per-asset-class files, which made this port tractable: shared prerequisite infra
  (`holdings/shared/`, `AssetTaxNote`, `usePortfolioHoldings`, a stubbed `PortfolioPage` shell) landed
  first, then all six asset-class sections + the IPO tab were ported **in parallel** (independent
  directories, no shared mutable state), then wired together in a final integration pass.
- **Unlike every group-adjacent module so far (IOU, Home), Portfolio needed no personal-only scoping
  decision** — a full dependency survey found zero `GroupContext`/`EventModeContext`/`OnboardingDraftContext`
  imports anywhere in the module. Ported in full, no dropped branches.
- **No charting library, despite the task brief's concern** — CLAUDE.md's "Expenses... swipe gestures + SVG
  chart are the two hardest UI ports" note was confirmed to apply to Expenses only; Portfolio has no
  pie/allocation/performance chart anywhere (`ScoreGauge`-style hand-rolled SVG only exists in Health).
- **Two more `packages/core` `localStorage` bugs found, same class as `marketDataClient.ts`'s (Home) but
  a harder variant:** `core/ipo/ipoClient.ts`'s IPO-list/historical-IPO caches and `core/nps/npsClient.ts`'s
  scheme-list cache are *synchronous* caches feeding otherwise-async fetch functions — unlike a simple
  listener `Set` (`useTxnRefresh`'s fix) or an isolated persistence call (`marketDataClient`'s fix), a
  mechanical `AsyncStorage` swap doesn't drop in cleanly here. **User decision: drop the persistent
  cross-*session* cache, keep an in-memory-only cache within a session** — `ipoClient.native.ts` and
  `npsClient.native.ts` both re-fetch once per cold app start instead of once per 7 days/1 hour, but still
  avoid refetching on every re-render/navigation within a session (giving `forceRefresh`/`getCachedIpos`
  real meaning again, not just dead parameters). **A real mid-port catch, worth remembering:** the first
  draft of `ipoClient.native.ts` dropped `fetchIpos`'s `forceRefresh` parameter entirely on the assumption
  that "Metro resolves `.native.ts` at runtime, not `tsc`, so signature mismatches don't matter" — this
  was **wrong** for this repo: `apps/mobile/tsconfig.json`'s `moduleSuffixes: [".native", ""]` makes `tsc`
  itself resolve `.native.ts` too, for any file under `packages/core` reached by an `apps/mobile` compile,
  not just Metro. The mismatch surfaced only once the IPO tab's port actually imported `useIpos` (the first
  mobile caller) and `tsc -b` failed on `useIpos.ts`'s existing `fetchIpos(force)` call site. Fixed by
  restoring a real (if session-only) in-memory cache instead of dropping the parameter — worth checking
  going forward: **`.native.ts` siblings must match their web counterpart's exported signatures exactly**,
  since `tsc -b` — not just Metro — resolves them for any mobile-reachable `packages/core` file.
- **Several hand-rolled `fixed inset-0` modal overlays found across three sections, all rebuilt on the
  real ported `Modal` component instead of translated** (same rationale as Track 3's `SelectInput`
  redesign): Real Assets' `VehicleDetailModal` (no `Modal` import at all on web); Retirement's
  `NpsLifecycleDetail`, an inline contribution-breakdown popup inside `RetirementSheets` (never converted
  to `Modal` even on web, despite that file already using `Modal` elsewhere), and a third found only
  during the port, `EpfAllTransactionsSheet`; IPO's `IpoDetailModal`.
- **`STATUS.x` literal CSS-var-string colors** — the highest concentration yet, ~30+ sites across 9 files,
  worst in `RetirementCard.tsx` (10 sites in one file) — all swapped to `useThemeColors()`, same fix
  pattern used 7+ times since IOU. One new variant: `RdCard.tsx` (Fixed Income) hardcoded a literal
  `#10b981` hex directly rather than referencing `STATUS` — same underlying bug, just not caught by a
  `STATUS.x` grep; fixed identically.
- **A real integration-time bug caught by one section's port while reviewing another's:** the
  Precious-Metals agent noticed Equity's `MfModal.tsx`/`StockModal.tsx` were missing the established
  sibling-`fullWidth`-Buttons-in-a-`flex-row` fix (Yoga doesn't split them evenly without each wrapped in
  its own `flex-1` — the exact bug first found in Subscriptions) — flagged for the integration step and
  fixed there (wrapped each Delete/Save `Button` in its own `flex-1` `View` in both files).
- **A second integration-time bug, self-inflicted, found and fixed during integration:** `EquitySection`'s
  floating FAB used `position: absolute` bottom-anchored via `useSafeAreaInsets` — correct in isolation
  (matches Insurance's convention, which renders outside its own `ScrollView`), but wrong here since
  `EquitySection` renders *inside* `PortfolioPage`'s `ScrollView`, so the `absolute` positions relative to
  the section's own auto-sized content box, not the viewport — it would have scrolled with content
  instead of staying fixed. Fixed by replacing the floating FAB with an inline `Button`
  (`EmptyState`'s `action` prop when empty, a trailing full-width `Button` otherwise), matching the
  inline-add convention every other section (Fixed Income, Precious Metals, Real Assets, Retirement)
  already used independently — worth remembering: **a floating FAB anchored via safe-area insets only
  works for a section rendered outside its own scroll container**; sections meant to live inside a shared
  page-level `ScrollView` should use an inline add affordance instead.
- **One real agent-orchestration mishap during this port, worth noting for next time:** the first attempt
  at delegating the Real Assets section to a background agent returned having spawned *another* background
  agent instead of doing the file work itself, and produced zero files. Caught by checking the filesystem
  directly rather than trusting the report; fixed by relaunching with an explicit "do this yourself,
  do NOT spawn sub-agents" instruction, which completed correctly. A second, harmless echo of the same
  confusion appeared moments later (a stray duplicate agent that correctly noticed real work was already
  in progress and deliberately backed off rather than clobbering it) — no files were lost or duplicated,
  but it's a reminder to verify a delegated agent's *actual file output*, not just its prose summary,
  before trusting a "done" report.
- CSS Grid → `flex-row flex-wrap` across every section's forms/detail views, same pattern as every prior
  module, just at a larger total count than any module before it.
- **Verification:** `tsc -b`, `eslint`, `prettier --check` all clean across the whole `apps/mobile` project
  (plus `packages/core`). Real on-device verification on `penny_pixel` — no new native deps needed
  (everything Portfolio uses — `react-native-svg`, `react-native-view-shot`, `expo-sharing`,
  `expo-linear-gradient`, `react-native-reanimated` — was already installed during Home's port), so only a
  Metro JS reload was needed, no native rebuild. Confirmed rendering correctly via screenshots: IPO tab
  (live fetch working, "Updated just now · investorgain.com", sub-tab pills, empty state), Real Assets
  (AssetTaxNote expanded, Vehicles/Property empty states with dashed borders + Add actions), Stocks
  (Equity section's fixed inline Add button, not the old floating FAB), the Add-stock modal (fields +
  single full-width footer button, confirming the `fullWidth` fix), Metals (dashed "Add Gold / Silver"
  trigger), and Retirement (NPS/PPF/EPF untracked cards). No crashes across any of the six asset classes
  or the IPO tab.

### 2026-07-24 — Track 4 Expenses module complete (CLAUDE.md's flagged "hardest port")

- **Ninth Track 4 module, ~7,532 web lines across 33 files** — comparable in size to Portfolio, but
  ported more sequentially than Portfolio's parallel-by-asset-class approach since Expenses' pieces share
  a lot of state through one hook (`useExpenses.ts`) and cut across each other (transactions ↔ categories
  ↔ analytics ↔ budgets). Order: prerequisite infra (`EventModeContext`, `useExpenses.ts`, the two native
  `.native.ts`/helper files) → five independent pieces in parallel (categories, budgets, `SwipeableRow`,
  analytics, events) → `ExpenseForm.tsx` (depends on categories) → the remaining transactions-flow files
  (depend on everything else) → final integration pass (`ExpensesPage.tsx`, `ExpensesHeader.tsx`).
- **Five explicit user decisions made up front, all "build it now" rather than drop/simplify** (matching
  the pattern of asking before porting rather than deciding mid-port, same as Home):
  1. **`EventModeContext` ported as a real prerequisite, not dropped.** Unlike IOU/Home's single droppable
     Groups banner, event/vacation-mode tagging is threaded through filtering, analytics, the header
     banner, and its own management screen — not an optional add-on. Ported to
     `apps/mobile/src/context/EventModeContext.tsx`, same logic as web, `localStorage` → AsyncStorage
     (async hydration in an effect, same pattern as `PrivacyContext`'s default-mode load); web's
     `penny-events-updated` DOM event (fired by `seedDemoData`) is dropped since mobile's demo seeding
     isn't wired up yet.
  2. **CSV/ZIP export built now.** `core/export/exportCsv.ts` (web: Blob + object URL + synthetic `<a
     download>`, plus a password-protected AES-256 ZIP via `@zip.js/zip.js`) got a new
     `core/export/exportCsv.native.ts` sibling using `expo-file-system`'s new `File`/`Paths` API +
     `expo-sharing` (same share-sheet pattern as Home's Stories flow), with `Uint8ArrayWriter` instead of
     `BlobWriter` for the ZIP (RN's `Blob` shim doesn't support everything zip.js needs internally).
     `expo-file-system`/`expo-sharing` were added as `packages/core` dependencies directly (following the
     `expo-sqlite` precedent from Track 2 — `packages/core` already depends on Expo modules for its native
     storage adapter).
  3. **Receipt photo capture built now.** Web's `<input type="file">` + canvas-downscale-to-JPEG flow has
     no RN equivalent input source at all (a picker/camera URI, not a browser `File`) — so rather than a
     `.native.ts` sibling of `lib/image.ts`, a new mobile-only `apps/mobile/src/lib/receiptImage.ts` wraps
     two new native deps (`expo-image-picker` for camera+library, `expo-image-manipulator` for
     resize/compress) into `captureReceiptPhoto()`/`pickReceiptPhoto()`, returning the same downscaled
     JPEG data-URL shape web stores on `expense.receiptDataUrl` (no schema change). `ExpenseForm.tsx`
     wires this into a "Camera / Photo library" choice + a tap-to-view-full-size `Modal` (`window.open`'s
     RN equivalent).
  4. **Both SVG charts ported as plain `react-native-svg`, no new charting library.** `AnnualChart.tsx`'s
     bar+line chart maps `Rect`/`Polyline`/`Text` directly (wrapped in a horizontal `ScrollView` instead of
     `overflow-x-auto`; per-bar tap targets stayed as `Rect onPress`, react-native-svg shapes support touch
     natively). `AnalyticsTab.tsx`'s `IntentDonut` reused **the exact same multi-arc-via-stroked-circles
     technique already proven on-device in Health's `FinancialHealthCard`** — confirms that technique
     generalizes cleanly to a second, unrelated ring visualization.
  5. **Swipe-to-reveal row actions rebuilt on `react-native-gesture-handler`'s `ReanimatedSwipeable`**
     (not a hand-rolled Reanimated-only reimplementation) — a new native dependency
     (`react-native-gesture-handler@~2.32.0`), requiring `App.tsx`'s root wrapped in
     `GestureHandlerRootView` (one-time setup, done here). Web's manual tap-vs-drag threshold logic wasn't
     reimplemented — `Swipeable`'s built-in tap gesture already auto-enables/closes based on open state.
     Props API (`{ actions: SwipeAction[], onTap, children }`) mirrors web's shape so `TransactionsTab.tsx`
     could wire it in without redesigning anything.
- **Groups (Tier 2) dropped everywhere it appears**, matching the IOU/Home/Portfolio precedent:
  `ShareToGroupModal.tsx` skipped entirely (not ported at all); `shareGroups`/`onShareToGroup`/
  `onShareLater`/`sharingExpense`/the Share swipe action removed from `ExpenseForm.tsx`,
  `TransactionsTab.tsx`/`TransactionsSlice.tsx`; `familyGroupIds` removed entirely from
  `useExpenseAnalytics.ts`'s args (not defaulted to an empty set — the whole classification branch was
  dead code without it, so removed outright rather than left half-alive); `EventsModal.tsx`'s
  entitlement-gated vacation→group-link sub-section (`VacationGroupLink`, already returning `null` for
  most users on web) dropped along with its now-unused `createGroup`/`hasEntitlement`/`useGroupContext`
  imports.
- **`IconGridPicker.tsx`'s icon-search index** (`tablerIconIndex.json`, ~620KB, fetched at runtime on web
  via `import.meta.env.BASE_URL`) — copied into `apps/mobile/src/features/expenses/categories/` and
  imported as a static JSON module instead; Metro bundles it directly, so the entire
  fetch/promise-cache/loading-state machinery web needed became unnecessary and was dropped.
- **`STATUS.x` literal CSS-var colors** — high concentration across `transactions/`/`analytics/`/
  `budgets/`, all swapped to `useThemeColors()`; one new variant found (`RdCard`-style, i.e. a raw
  hardcoded hex literal rather than a `STATUS.x` reference — same underlying bug, not caught by a
  `STATUS.x` grep, same fix).
- **CSS Grid → `flex-row flex-wrap`** across `FilterModal`, both `MonthPickerModal`s (the transactions one
  was already `Modal`-based on web; `AnalyticsTab.tsx`'s own local one was hand-rolled `fixed inset-0` —
  **a second hand-rolled-modal find distinct from Portfolio's**, rebuilt on the real `Modal` component,
  same rationale as every other hand-rolled-overlay fix in this migration), `IconGridPicker`,
  `CategoryPickerModal`, `TransactionsSlice`'s bulk-action bar, `EventsModal`.
- **One real cross-file bug caught by a different section's porting agent** (same pattern as Portfolio's
  Precious-Metals-agent catching Equity's missing fix): the categories agent found `CategoryPickerModal`'s
  sticky bulk-action bar (web: `sticky bottom-0` inside a scrolling modal body) has no RN
  sticky-within-`ScrollView` primitive — solved by moving the bulk-move/delete buttons into the ported
  `Modal`'s `footer` prop (which already renders outside the `ScrollView` and stays pinned), rather than
  attempting a fake-sticky translation.
- **A real shared-component bug found during on-device verification, not specific to Expenses:**
  `apps/mobile/src/components/ui/TabStrip.tsx`'s `scrollable` mode wrapped its tab row in a bare
  `<ScrollView horizontal>` with no `flexGrow: 0` — as a flex child in a column layout, an unconstrained
  horizontal `ScrollView` stretches to fill all remaining vertical space (becomes the tallest sibling),
  pushing its own content down to vertically center inside that oversized box instead of hugging its
  content height. This showed up as a large blank gap between `ExpensesPage`'s header and its tab strip.
  Fixed with an explicit `style={{ flexGrow: 0 }}` — benefits any other screen using `TabStrip`'s
  scrollable mode, not just Expenses. Confirmed via `adb shell uiautomator dump` (a stray oversized
  clickable region, `[266,348][475,1421]`, associated with the "Analytics" tab label) rather than guessing
  from a screenshot.
- **One real agent-orchestration correction during verification, worth noting:** a long-running
  `expo run:android` native build (needed for the four new native deps) appeared stalled after ~18 minutes
  with an idle Gradle daemon and near-zero CPU usage on the wrapper process — killed and about to be
  retried, until the killed process's own output file revealed the build had in fact completed
  successfully (`BUILD SUCCESSFUL in 38s`) and Metro had already started serving, moments before the kill
  landed. Recovered by just restarting Metro (`expo start --clear`) rather than re-running the full native
  build. Lesson: check a background command's actual output file before concluding it's hung, even when
  process-table heuristics (idle daemon, low CPU) look convincing — a build can finish and move on to a
  quiet "serving" phase in the same window a status check catches it looking idle.
- **Verification:** `tsc -b`, `eslint`, `prettier --check` all clean across the whole project (`apps/mobile`
  + `packages/core`) throughout — every parallel piece verified independently before integration, then
  swept again after wiring. Real on-device verification on `penny_pixel` required a full native rebuild
  (four new native deps: `react-native-gesture-handler`, `expo-file-system`, `expo-image-picker`,
  `expo-image-manipulator`) — confirmed via screenshots: Transactions tab (empty state, working FAB
  speed-dial with Income/Transfer/Expense), `ExpenseForm` (all fields, payment-mode chips, Tags/Receipt/
  Lent/Repeat toggles), Receipt toggle revealing working Camera/Photo-library buttons, `CategoryPickerModal`
  opening cleanly, Analytics tab (Monthly/Annual toggle, month nav, empty-state donut icon), Subscriptions
  slice (reusing the already-ported module), IOU slice (reusing the already-ported module). No crashes
  across any tab or modal.

### 2026-07-24 — Track C (identity/auth) prerequisite ported and verified — unblocks Groups

- **Not a normal Track 4 module port** — a dedicated prerequisite track, done ahead of Groups after a
  dependency survey found Groups is blocked by something no prior module hit: every previous module
  (IOU, Home, Portfolio, Expenses) only ever needed local Dexie-equivalent data, so the standing "Session
  locked" limitation was cosmetic (screens rendered, saves silently failed, still verifiable). Groups'
  `claimed` gate is a hard boolean computed from a real server-verified identity — `claimAccount()` →
  device keypair registration → `POST /register` against the live `penny-auth` Cloudflare Worker — with
  no local-only stand-in possible. Porting Groups' ~1,573-line UI without this would have produced screens
  that render once and then can't create/join/sync/settle-up anything.
- **User-decided approach**: port the real Track C client prerequisite chain (not the Groups UI itself)
  first — `claimAccount`/`signedFetch`/device keys/`entitlement.native.ts`/real `AUTH_BASE`/`GROUPS_BASE`
  wiring — so Groups, whenever it's ported, has a real backend to verify against instead of another
  render-only pass.
- **Crypto smoke-tested on-device before writing any port code** (a new scratch tool,
  `apps/mobile/src/screens/CryptoSmokeTestScreen.tsx`, temporarily swapped into `RootNavigator`'s
  stand-in slot): confirmed `react-native-quick-crypto`'s P-256 ECDSA/ECDH (generate/sign/verify/JWK
  export-import) and Ed25519 (including the exact manually-constructed-PKCS#8 trick `recovery.ts` uses)
  all work correctly on-device, and — critically — the ECDSA signature is exactly 64 bytes (raw IEEE
  P1363 format), matching the Cloudflare Worker's `crypto.subtle.verify` expectation exactly (a DER-vs-raw
  mismatch would have silently broken every signed request). `btoa`/`atob` are both present and correctly
  round-trip all 256 byte values — an assumed gap from the initial survey that turned out not to exist.
- **Real gaps found and fixed** (all in `packages/core`, following the established `.native.ts`-sibling
  convention):
  1. `core/entitlement/entitlement.ts` read `import.meta.env.VITE_ENABLE_SYNC` with no native counterpart
     — added `entitlement.native.ts` reading `Constants.expoConfig?.extra?.enableSync` via the newly
     added `expo-constants` dependency (added to both `apps/mobile` and `packages/core`, following the
     `expo-sqlite`-in-`packages/core` precedent from Track 2).
  2. `apiBase.native.ts`'s `AUTH_BASE`/`GROUPS_BASE` were hardcoded `null` (confirmed by that file's own
     comment: "no env plumbing exists yet") — now read the real deployed worker URLs
     (`https://penny-auth.hesh.workers.dev`, `https://penny-groups.hesh.workers.dev`) from `app.json`'s
     `extra` field via `expo-constants` — same non-secret, public worker URLs already committed in
     `apps/web-legacy/.env.production`, just read through a different mechanism than Vite's
     `import.meta.env`.
  3. `claim.ts`'s `notifyProfileChanged()` used a bare `window.dispatchEvent(new CustomEvent(...))` — the
     one `window`-based mechanism in the whole identity/auth chain. Rather than duplicate all of
     `claim.ts` (security-critical business logic) into a `.native.ts` sibling just to swap this one
     internal notification primitive, extracted it into its own tiny platform-split module,
     `core/identity/profileChangeBus.ts`/`.native.ts` (web: DOM `CustomEvent`, matching
     `useDataRefresh.native.ts`'s "in-memory listener `Set` instead of `window`" pattern for native) —
     `claim.ts` itself now imports from this and is otherwise byte-for-byte unchanged, so both platforms'
     call sites stay identical and the security-critical logic was never touched.
- **No other gaps** — `signedFetch.ts`, `identityKeys.ts` (device key generation/storage — already fully
  portable via the existing `schema.native.ts`/`expo-sqlite`-backed `EncryptedRepository`, no new storage
  decision needed), and `recovery.ts` all worked completely unmodified on-device.
- **A real mid-investigation false alarm, worth remembering:** the first end-to-end claim attempt failed
  with a cryptic native error (`Cipher.final(...): Cipher final failed`). Rather than assume a fundamental
  `react-native-quick-crypto`/`EncryptedRepository` bug, isolated the exact failing operation by testing
  each layer standalone on-device: raw AES-GCM wrap/unwrap/encrypt/decrypt (including the precise
  base64-round-trip `EncryptedRepository` performs) all passed clean; `ensureIdentityKeys()` (both the
  fresh-generate path and the reload-from-storage path) passed clean too. The actual cause turned out to
  be self-inflicted: an earlier test run's log showed "Vault + profile created OK" logged **twice**,
  meaning the "Setup vault" button had been double-tapped — `securityManager.initialize()` generated a
  *second*, different DMK, silently replacing the first in the in-memory `keystore` singleton, so the
  profile record (encrypted under DMK #1) could no longer be decrypted under DMK #2 now held in memory.
  Not a crypto bug at all — a test-harness artifact from a double-tap. Worth remembering: a cryptic native
  crypto error during manual on-device testing is worth isolating layer-by-layer before concluding
  anything is broken, especially when the app has no real onboarding flow yet to prevent this kind of
  double-init in the first place.
- **Verification — full end-to-end success against the live worker, confirmed via three scratch-tool
  screens** (`CryptoSmokeTestScreen.tsx`, `ClaimSmokeTestScreen.tsx` in `apps/mobile/src/screens/`, kept
  as reference/regression tools, temporarily swapped into `RootNavigator`'s stand-in slot the same way
  every module verification has been, then reverted back to `ExpensesPage`): `checkUsername()` →
  `{"available":true}`; `claimAccount()` → real `userId`/`username` from the live worker;
  `getClaimState()` → `{"claimed":true,"deviceId":"..."}`; `signedFetch('/whoami')` → `200` with the
  server's own view of the claimed identity. Every layer — device keypair generation/storage, DMK-based
  encrypted repository read/write, the challenge→sign→verify request-signing loop, and the server-side
  signature verification itself — is now proven working on a real device against a real deployed backend.
- `tsc -b`, `eslint`, `prettier --check` all clean across `apps/mobile` + `packages/core`; full
  `packages/core` test suite (401 tests, 54 files) still passes unchanged.

### 2026-07-24 — Groups module ported + Home/Expenses integration points restored

- **Standalone module port**: `GroupContext` (`apps/mobile/src/context/GroupContext.tsx`, new) + all 9
  `apps/web-legacy/src/features/groups/*` components ported to `apps/mobile/src/features/groups/`
  (`ContextSwitcher`, `GroupDashboard`, `SharedExpenseComposer`, `SettleUpGroupModal`,
  `GroupMembersModal`, `CreateGroupModal`, `JoinGroupModal`, `useGroupSummaries`, `useServerActionError`
  — ~1,462 web lines, flat layout matching `features/portfolio/`'s convention). `GroupProvider` wired into
  `App.tsx` alongside the other Tier-1 providers.
- **User decision (beyond a standalone module)**: also restore the three Groups integration points
  dropped as personal-only scoping when Home and Expenses were ported (IOU stays personal-only, unchanged
  — not requested): Home's `activeGroup → GroupDashboard` branch + `HomeGroupsCard`
  (`apps/mobile/src/features/home/HomeGroupsCard.tsx`, new); Expenses' `ShareToGroupModal`
  (`apps/mobile/src/features/expenses/transactions/ShareToGroupModal.tsx`, new) +
  `shareGroups`/`onShareToGroup`/`onShareLater`/`sharingExpense`/the Share swipe action restored in
  `ExpensesPage.tsx`/`TransactionsTab.tsx`/`TransactionsSlice.tsx`/`ExpenseForm.tsx`, plus `familyGroupIds`
  restored in `useExpenseAnalytics.ts`/`AnalyticsSlice.tsx`; and `EventsModal.tsx`'s inline
  `VacationGroupLink` sub-section restored (`createGroup`/`hasEntitlement`/`useGroupContext`).
- **Almost no new platform-specific work needed** — the dependency survey's expectation held:
  `packages/core/src/core/groups/*` (`groupsClient.ts`, `groupsService.ts`, `groupSync.ts`, `keys.ts`,
  `split.ts`, `accountBridge.ts`, 943 lines) needed zero `.native.ts` siblings, confirmed by grepping for
  `window\.|localStorage|navigator\.|document\.` across the directory before assuming otherwise.
  `GroupContext`'s two browser-only bits were both already solved by the Track C prerequisite:
  `localStorage` → `~/lib/storage`'s `getItem`/`setItem`/`removeItem` (async AsyncStorage; `selected`
  starts at `'personal'` and hydrates once in a `useEffect`, matching `PrivacyContext`'s established
  pattern), and the raw `window.addEventListener(PROFILE_UPDATED_EVENT, ...)` → `subscribeProfileChanged`,
  imported directly from `@/core/identity/profileChangeBus` (not re-exported through `claim.ts`, which
  only re-exports the constant — a small deviation from the original plan wording, caught by reading
  `claim.ts` before assuming).
- **Two new native-API swaps, both confirmed working on-device** — the only genuinely new platform work
  this module needed: `expo-clipboard` (new dep, `~57.0.1`) for `GroupMembersModal`'s invite-link copy
  (`Clipboard.setStringAsync`), and RN's built-in `Share` API (`Share.share({ message, url })`, no new dep)
  for the invite share sheet, same try/fallback-to-clipboard structure as web.
- **`ContextSwitcher`'s hand-rolled `fixed inset-0` web dropdown** rebuilt on the real ported `Modal`
  component — same "centered modal, never a hand-rolled overlay" fix already applied to every other
  hand-rolled-overlay case in this migration (Portfolio, Retirement, IPO, Expenses' `AnalyticsTab`). Web's
  post-switch `navigate(PATHS.app.home)` and the "Claim a username" menu item's `navigate(PATHS.app.profile)`
  both have no mobile equivalent yet (no real nav stack outside `AuthGuard`'s stand-in) — dropped/no-op,
  same precedent as every other dropped cross-module navigation call in Track 4.
- **Verified end-to-end on a real device against the live `penny-auth`/`penny-groups` Cloudflare Workers**
  — not just a render-only pass, unlike most modules before Track C — via a new scratch tool,
  `apps/mobile/src/screens/GroupsSmokeTestScreen.tsx` (claim setup + `ContextSwitcher` + a Home/Expenses
  toggle, temporarily swapped into `RootNavigator`'s stand-in slot the same way every prior verification
  tool has been, then reverted back to `ExpensesPage`): claim succeeded against the live worker → "Create
  a group" → real worker round-trip (group creation + ECDH key wrap/unwrap via `keys.ts`) succeeded →
  `ContextSwitcher` updated to show the new group, `GroupDashboard` rendered (balance card, Members list
  with the owner, empty Shared Expenses state) confirming the Home restoration branch → `GroupMembersModal`
  (gear icon) rendered Members/Create invite link/Settle & close/Leave group → "Create invite link" hit the
  real worker, copied the link via `expo-clipboard` (toast confirmed), and opened the **real Android share
  sheet** via `Share.share()` → `SharedExpenseComposer` ("Add expense") rendered fully with live
  split-breakdown and validation → switching to the Expenses tab and opening `ExpenseForm` showed the
  restored **"Share with a group" toggle**, appearing only because a group now exists in scope — confirming
  the Expenses restoration end-to-end. No crashes across any screen or modal.
- **One real (non-blocking) bug found on-device, not fixed in this step**: `groupsService.ts`'s
  `buildJoinLink` falls back to an empty origin (`typeof location !== 'undefined' ? location.origin : ''`)
  on RN since `location` is undefined, producing an invite link with no host
  (`/app/groups/join#<secret>` instead of `https://.../app/groups/join#<secret>`). Doesn't crash (already
  guarded) and still copies/shares successfully — flagged as a real gap to fix in a future pass once mobile
  has a real deep-link/URL scheme to build the link against, rather than fixed speculatively now.
- **A real test-harness lesson from manual on-device verification, worth remembering**: `adb shell input
  keyevent 111` (KEYCODE_ESCAPE), used to dismiss the on-screen keyboard after typing into a modal's text
  field, also dismissed the modal itself (the ported `Modal` component treats Escape the same as its
  backdrop/close action) — several early "Create a group" attempts silently no-opped because of this, not
  because of an app bug. Recovered by using `uiautomator dump` to get exact on-screen element bounds and
  tapping precisely, without ever pressing Escape mid-flow.
- **Verification**: `tsc -b`, `eslint` (0 errors; 3 pre-existing-style `react-hooks/exhaustive-deps`
  warnings, no `eslint-disable` added), `prettier --check` all clean across `apps/mobile` + `packages/core`;
  full test suite (401 `packages/core` tests + 39 workers tests) still passes unchanged. Native rebuild
  (`expo run:android`, required for the new `expo-clipboard` dep) succeeded on the `penny_pixel` emulator
  after resolving a missing-`JAVA_HOME` build failure (pointed at Android Studio's bundled JBR:
  `/Applications/Android Studio.app/Contents/jbr/Contents/Home`).

### 2026-07-25 — Onboarding + Settings/Security/Profile/Activity — Track 4 complete

- **Navigation infrastructure, built first**: `apps/mobile/src/navigation/OnboardingNavigator.tsx` (a real
  `native-stack` `Stack.Navigator`, one screen per `PATHS.onboarding.*` route) and `MainNavigator.tsx` (a
  `Stack.Navigator` hosting `MainTabs` as its root screen, plus `Profile`/`Settings`/`SafeModeSettings`/
  `ManageTags`/`ChangePin`/`ChangePassphrase`/`Timeline`/`Backup`(placeholder)/`OnboardingFlow`(re-mounts
  `OnboardingNavigator`, for Exit-Demo-Mode's real nested-navigation case) pushed on top of it). `RootNavigator.tsx`
  now wires `AuthGuard`'s `needs_onboarding` branch to the real `OnboardingNavigator` and `ready` to
  `MainNavigator`, superseding every prior stand-in screen. A new `apps/mobile/src/navigation/
  authRecheckBus.ts` (same in-memory pub/sub shape as `profileChangeBus.native.ts`) lets onboarding
  screens tell `AuthGuard` to re-run its check after a vault is created/restored/wiped — a real gap the
  plan didn't anticipate: unlike web (route change or a full page reload re-runs `AuthGuard`), RN's
  `AuthGuard` only ever checks once, in a mount-time effect. `MainTabs.tsx`'s Home/Portfolio/Expenses/Goals
  tabs now render their real ported pages instead of `PlaceholderScreen`; Chip stays a placeholder (Phase
  2). `OnboardingDraftContext.tsx` ported as a plain in-memory (no persistence) context, matching web's
  "refresh restarts onboarding" behavior.
- **All 13 onboarding screens ported** (`Splash`/`PrivacyPromise`/`PrivacyDemo`/`ChipIntro`/
  `SimulatedDashboard`/`LetUsKnowYou`/`SetupCredentials`/`Start`/`Account`(recovery)/`DemoVault`/
  `LifeHousehold`/`AddAccounts`/`BackupSetup`) plus `OnboardingBack`/`IdentityReconciler`/
  `useRedirectIfOnboarded`. `OnboardingLayout`/`OnboardingPlaceholder` were skipped — the former's one job
  (mounting the draft provider) happens once at `App.tsx` root instead, the latter is dead code with zero
  consumers even on web. `ChooseHandleScreen` (not in the plan's original 13-screen list) was added as a
  hard compile-time dependency of `IdentityReconciler`. **`SetupCredentialsScreen` is the screen that
  finally sets a real Data Master Key on-device via a real UI** — every prior on-device module test hit
  "Session locked" before reaching this point (only `ClaimSmokeTestScreen.tsx`'s hardcoded scratch version
  had ever called `initialize()` before). Real passphrase input + `PassphraseStrengthMeter` (driven by
  `usePassphraseStrength`, already platform-agnostic) + 6-digit PIN + confirm-PIN + `isWeakPin`, calling
  real `initialize()` or `exitDemoMode()` (the re-key path). **`AccountRecoveryScreen`** (the largest
  single screen) needed a real file picker for the restore-from-file path — added `expo-document-picker`
  (new dep) + `expo-file-system`'s `File` class — and its cloud-restore branch transitively imported
  `googleDriveProvider.ts`, which read Vite-only `import.meta.env.VITE_GOOGLE_CLIENT_ID` (same bug class
  as `apiBase.ts`'s original gap) — fixed with a dormant `googleDriveProvider.native.ts` stub
  (`isAvailable()` always `false`, matching `icloudProvider.ts`'s existing precedent) so the module tree
  compiles on native; Drive connect itself is still web-only.
- **`seedDemoData.ts`'s native storage fix**: rather than a ~1,650-line `.native.ts` fork, the plan's own
  "inject a storage adapter" alternative was used — a new `seedDemoStorage.ts`/`.native.ts` pair seams off
  the handful of direct `localStorage`/`window` touches (demo-seeded flag, past-events cache, cleared-data
  markers), and `seedDemoData.ts` calls through it unchanged. `isDemoSeededSync()` stays a synchronous
  boolean guard on native via an in-memory flag (same shape as `ipoClient.native.ts`'s fix), safe because
  every real caller already ORs it with the persisted, encrypted `profile.demoSeeded` field.
  `@react-native-async-storage/async-storage` added as a direct `packages/core` dependency (matching
  `apps/mobile`'s version), following the `expo-sqlite`-in-`packages/core` precedent from Track 2.
- **Settings** (`SettingsPage`/`SafeModeSettingsPage`/`ManageTagsPage`) built on the already-ported
  `SettingsContext.tsx` (Tier 1 — state layer only, this is the screen UI). Theme/font-scale pickers
  dropped entirely (Track 3's `ThemeProvider` already owns theme; font scaling has no mobile consumer);
  "Backup & Restore"/"Contact & Feedback" nav rows dropped (neither module ported yet — `ProfilePage`'s
  "Set up backup" button points at the `Backup` placeholder route in the meantime). Exit Demo Mode hands
  off to onboarding's "Let us know you" step via `MainNavigator`'s `OnboardingFlow` nested-navigate case
  (see above).
- **Security** (`ChangePinPage`/`ChangePassphrasePage`) — pure UI ports, `securityManager`'s
  `changePin`/`changePassphrase`/`resetPinWithPassphrase`/`isWeakPin` were already fully portable, no
  platform work needed. A `'wiped'` result (PIN lockout → passphrase recovery fails too many times →
  `wipeAllData()`) correctly calls `notifyAuthShouldRecheck()` rather than a direct (nonexistent)
  `navigate('Splash')`, since `wipeAllData()` genuinely clears `security`/`profile` and
  `isOnboardingComplete()` goes false again — `AuthGuard`'s own re-check then naturally renders
  `OnboardingNavigator` from `Splash`.
- **Profile** (`ProfilePage.tsx`, 594 web lines, single file) — display name, DOB (`deriveAge`/
  `deriveAgeBand`), employment type (`reseedForEmployment`), username validation + Track C's `claimAccount`
  (already proven working on-device), sync entitlement check, backup target display. Avatar picker reuses
  Expenses' `~/lib/receiptImage.ts` (`pickReceiptPhoto`) since web's version is a real `<input
  type="file">`, not a color-swatch grid. DOB is a plain digit-entry text field — no RN date-picker
  dependency exists anywhere in this migration yet. One real, unanticipated gap: `getBackupTarget`/
  `setBackupTarget` (`core/sync/backupPrefs.ts`) used synchronous `localStorage` with no RN equivalent —
  added `backupPrefs.native.ts`, but since `backupEngine.ts` (the real Backup & Restore read/write flow)
  isn't ported to mobile yet, this sibling drops persistence entirely (in-memory only, defaults to `null`
  every cold start) since `ProfilePage`'s only call site is read-only display; flagged for revisit once
  Backup & Restore itself is ported.
- **Activity** (`TimelinePage` + `ActivityRow`/`DiffChips`/`ItemHistory`/`MilestoneBanner`/`MoneyStory`/
  `OnThisDay`/`PrivacyReceipt`/`TrackingHeatmap`/`WrappedModal`/`Confetti` + `useActivityLog`/
  `activityMeta`) — `logActivity`/`restoreDeletionsSince` were already portable. `activityMeta.ts`'s
  `ACTION_META` was a static object built from `STATUS`'s CSS-var strings — the same bug class first
  caught during IOU — ported as a `getActionMeta(theme)` function called with `useThemeColors()` from
  inside components, not a static export. `WrappedModal.tsx`'s hand-rolled `fixed inset-0 z-[90]`
  full-screen "wrapped"-style story overlay was rebuilt on Home Stories' full-screen pattern (RN's own
  `Modal` + `LinearGradient` + `react-native-view-shot`/`expo-sharing`, with a small self-contained
  offscreen share-card template — not a cross-feature import of Home's own `ShareCard`, respecting the
  no-cross-feature-import rule), not the shared centered `Modal` component (wrong shape for a full-bleed
  story). `TrackingHeatmap.tsx`'s CSS Grid `grid-auto-flow: column` (no Yoga equivalent) rebuilt as
  pre-chunked week-columns in a `flex-row`.
- **Two real, severe bugs found and fixed during on-device Demo Mode verification** — both crashed hard
  enough to take down the whole emulator process, not just the app, and both root-caused via code review
  rather than further blind on-device reproduction (at the user's explicit direction, after the second
  crash):
  1. **`schema.native.ts`'s `expo-sqlite` adapter had no serialization** — every table's `get`/`put`/
     `toArray`/`delete`/`update`/`clear` opened its own independent call against the one shared
     `SQLite.openDatabaseAsync` connection. `seedDemoData.ts` issues ~16 `Promise.all(items.map(repo.put))`
     batches (several hundred concurrent `put`s across a handful of tables, three different call sites
     hitting `expenses` alone), and under that load `expo-sqlite`'s native binding silently dropped writes
     (Expenses showed "No transactions yet" / ₹0 despite Home's stats correctly reflecting real seeded
     data from the same tables) and separately corrupted its internal native statement pool, surfacing
     later as `Cannot use shared object that was already released` / `NativeDatabase.prepareAsync` errors.
     Fixed with a single FIFO queue (`enqueue()`) serializing every operation through the one connection —
     a single choke point in `schema.native.ts`, not a patch to each of the ~16 `Promise.all` call sites
     (which would only protect that one file, not future callers).
  2. **`TransactionsTab.tsx` rendered its entire list unvirtualized** — a plain `View` + `.map()` (nested
     two levels: day-group, then row) inside `TransactionsSlice.tsx`'s wrapping `ScrollView`. Harmless on
     web (a DOM list of any size is cheap), but with demo data's ~1,000 seeded transactions this mounted
     ~1,000 `SwipeableRow`s simultaneously — each a real `react-native-gesture-handler` instance with its
     own worklets — which crashed severely enough on-device to restart the emulator, not just the app.
     Fixed by rebuilding `TransactionsTab` on a virtualized `SectionList` (`sections` from `grouped`,
     `renderSectionHeader`/`renderItem` carrying the exact same row/rail/swipe-action visuals as before)
     and removing the now-redundant wrapping `ScrollView` in `TransactionsSlice.tsx`. Verified on-device
     with the full ~1,000-row demo dataset: Transactions tab renders real data (all-time total
     ₹38,42,982, real category icons/accounts/tags/timeline rail), Analytics tab renders correctly (donut
     chart, monthly recap, anomaly banner) — no crash, no data loss, confirmed across a full fresh-install
     → Demo Mode → Expenses → Analytics cycle.
- **Verification**: `tsc -b`, `eslint`, `prettier --check` all clean across `apps/mobile` + `packages/core`
  after every step; full test suite (401 `packages/core` tests + 39 workers tests) unchanged. On-device,
  end-to-end, on the `penny_pixel` emulator: real onboarding (Splash → 13 screens → `SetupCredentials`)
  sets a real DMK and lands on real `MainTabs`; `SettingsPage` renders fully (Profile hero, Modules,
  Privacy, Security, Data & Activity); `ChangePassphrasePage`'s full round-trip (verify current → re-wrap
  DMK → success → return to app) confirmed working (an earlier "incorrect passphrase" result during
  testing turned out to be a UI-automation typing artifact, not a real bug, isolated by retyping
  carefully and reproducing successfully); `ProfilePage` shows the claimed badge, details, username,
  employment (matching onboarding's choice); Activity's Timeline/Story/Recently-deleted tabs all render;
  Demo Mode seeds and displays real data end-to-end after the two fixes above. **Track 4 is now complete —
  every module in its original scope has been ported and verified on-device.**

### 2026-07-25 — Post-Track-4: full app navigation wiring + back buttons

- **A real gap found while restoring "dropped" Track 4 features**: every module (Insurance, Loans, IOU,
  Accounts, Subscriptions) had been ported and on-device-verified in isolation by swapping it into
  `AuthGuard`'s single stand-in slot, but a real navigation graph connecting them was never built — Home's
  every cross-module entry point (`AccountsStrip`, `GlanceHeader`'s breakdown rows, `ToolsGrid`,
  `MoneyStatsCard`, Stories' CTAs) was a literal `onPress={() => {}}` no-op, and `MainNavigator.tsx`
  didn't register any of those five modules as routes at all. Fixed in one pass:
  1. **Routes registered** in `MainNavigator.tsx`: `Insurance`/`Loans`/`IOU`/`Accounts`/`Subscriptions`
     pushed onto the stack (`headerShown: false`, each screen owns its own `PageHeader`), `MainStackParamList`
     extended to match.
  2. **New shared `BackButton`** (`apps/mobile/src/components/shared/BackButton.tsx`) — an inline
     (non-absolute) `Pressable`+chevron calling `useNavigation().goBack()`, meant for `PageHeader`'s
     `leading` slot (which was already documented as "e.g. a back button" since Track 3 built it, but
     never wired since no real `Stack.Navigator` existed until this pass). Wired into every screen reached
     by a *push* (not a tab root): `Accounts`/`Insurance`/`IOU`/`Loans`/`Subscriptions`/`Profile`/
     `Settings`/`SafeModeSettings`/`ManageTags`/`ChangePassphrase`/`Timeline` unconditionally,
     `ChangePinPage` conditionally (`forced ? undefined : <BackButton />`, respecting the existing
     non-dismissible-lockout intent already enforced at `MainNavigator`'s stack-options level). Home/
     Portfolio/Expenses/Goals (tab roots, no "back" destination) were deliberately left untouched.
  3. **Home's dead entry points wired to their web-equivalent destinations**: `AccountsStrip` → `Accounts`;
     `GlanceHeader`'s breakdown rows → `Accounts`/`Expenses`/`Portfolio`/`Loans` depending on asset class
     (web's `assetSubTab`/`{state:{tab:'iou'}}` initial-tab hints dropped — neither `PortfolioPage` nor
     `ExpensesPage` accepts an initial-tab param yet, flagged not silently dropped); `MoneyStatsCard` →
     `Expenses`/`Insurance`/`Loans`; `useHomeStories.ts`'s `NOOP` replaced with a real `MODULE_ROUTE` map.
     Anything with no real mobile destination (Cashflow, Tax, Calculators, News — all out of this
     migration's scope) was left as a flagged no-op with an explaining comment, not a fake destination.
- Also restored in the same pass: **IOU's Groups informational banner** ("Your personal IOUs. Group
  balances live in each group.") — dropped during Track 4 (before `GroupContext` existed on mobile),
  restored in `IouView.tsx` now that Groups has landed, matching the same restoration Home/Expenses already
  got. IOU's underlying ledger logic is untouched — this only restores the banner.
- **Verification**: `tsc -b`, `eslint`, `prettier --check` all clean across `apps/mobile` + `packages/core`;
  full test suite (401 + 39 tests) unchanged. On-device: fresh Demo Mode setup → SectionList transaction
  rows open the real Edit Expense modal correctly (a second confirmation of the earlier `SectionList` fix,
  this time via direct row taps rather than just scrolling) → Home's stat cards and breakdown rows
  navigate without crashing across several taps (Net Worth breakdown, a Portfolio vehicle detail via the
  Assets breakdown) → no crash across the whole session. Exact per-tap destination correctness for every
  single Home entry point wasn't exhaustively re-verified pixel-by-pixel on-device (screenshot-coordinate
  taps repeatedly landed on the Net Worth breakdown instead of the intended stat card) — the navigation
  code itself was read and confirmed correct, and no destination in this pass is a fabricated route.
  **On-device confirmation of the route wiring itself**: navigating to `Loans` from Home rendered the
  real `LoanScenariosPage` with a working `BackButton` in its `PageHeader` — direct proof `MainNavigator`'s
  new routes + `BackButton` restoration both work end-to-end, not just in code review.

### 2026-07-25 — IOU Groups banner restored; Loans XLSX export attempted, blocked by a real Metro/xlsx gap

- **IOU's Groups informational banner restored** in `IouView.tsx` ("Your personal IOUs. Group balances
  live in each group — kept separate on purpose."), gated on `hasEntitlement('sync') && claimed &&
  groups.length > 0` via the now-ported `useGroupContext()` — matches web exactly. IOU's own ledger
  logic and personal-only scoping are otherwise unchanged; this only restores the one dropped banner.
- **Loans' "Download XLSX" export — restored in code, confirmed NOT working on-device, left flagged
  rather than silently shipped broken.** `PlannerResults.tsx` now has a real `downloadXlsx()` following
  the exact established pattern (`buildLoanPlanExport` for pure data, `xlsx`'s `write()` for workbook
  bytes, `expo-file-system`'s `File.write()` + `expo-sharing` for the share sheet — same shape as
  Expenses' CSV/ZIP export). Added `xlsx` as a direct `apps/mobile` dependency (unlike `@zip.js/zip.js`,
  which only `packages/core` needs directly — this import is in app code, so it needs its own
  resolvable copy). On-device, tapping the button throws `Requiring unknown module "NNNN"` as an
  **uncaught** error — a Metro module-resolution failure inside `await import('xlsx')` itself, confirmed
  to happen below the level a `try/catch` around the call can intercept (added one anyway, for any
  future runtime-level failure; the overlay still appears with it in place). Root cause: `xlsx`'s CJS
  entry has `require('fs')`/`require('stream')` calls Metro's static bundler tries to resolve regardless
  of their runtime guards; stubbing those Node builtins via `metro.config.js`'s `resolver.extraNodeModules`
  was tried and reverted — it did not fix the error, meaning at least one further require in `xlsx`'s
  dependency chain isn't a plain string literal Metro can statically stub. **Not fixed — needs either a
  different, RN-targeted XLSX-writing library or dedicated Metro bundling investigation** before this
  button will actually produce a file. Left wired rather than reverted, since the surrounding
  `buildLoanPlanExport`/`File`/`expo-sharing` plumbing is correct and directly reusable once the `xlsx`
  import itself is fixed.
- **Verification**: `tsc -b`, `eslint`, `prettier --check` clean; full test suite (401 + 39) unchanged.
  On-device: IOU's restored banner not separately screenshotted this pass (small, low-risk change,
  same `useGroupContext` pattern already proven working in Home/Expenses); Loans' export button confirmed
  reachable (real navigation → `LoanScenariosPage` → `Plan this loan` pre-fills the planner from a real
  loan → "Download XLSX" appears once a valid plan exists) but confirmed non-functional per above.

### 2026-07-25 — ContextSwitcher wired; top-of-screen safe-area gap fixed; the 7-module feature-folder gap closed

- **ContextSwitcher wired into real navigation** — the last open item from the prior restoration pass.
  Mounted in `MainTabs.tsx` above the `Tab.Navigator` (persistent across every tab, mirroring web
  `AppShell`'s chrome position), gated by `hasEntitlement('sync')`. Its "switch context" action now
  navigates to the `Home` tab (`navigation.navigate('MainTabs', { screen: 'Home' })`, added a typed
  `TabParamList`/`NavigatorScreenParams` for this); its "Claim a username" row now opens the real
  `Profile` screen instead of a no-op placeholder. `useServerActionError`'s `NotClaimedError` branch was
  restored the same way — routes to `Profile` and returns `true` (previously always `false`, since it
  couldn't navigate anywhere).
- **Top-of-screen gap bug fixed on Home/Portfolio/Expenses/Goals** — all four tab screens wrapped
  themselves in `SafeAreaView edges={['top']}`, double-reserving the top safe-area inset already consumed
  by `MainTabs`' own Stack.Screen header ("Penny" title + settings button). Pushed screens with
  `headerShown: false` (Insurance, Loans, etc.) correctly keep `edges={['top']}` — only the four
  tab-root screens had the bug; fixed by dropping to `edges={[]}` on those four.
- **The real remaining Track 4 gap, found by diffing `apps/web-legacy/src/features/` (24 folders) against
  `apps/mobile/src/features/` (16)**: 7 modules were never ported — **Feedback, Import (expenses CSV
  import), Backup & Restore, Cashflow, News, Calculators, Tax Awareness** (an 8th, Chip, stays out of
  scope — Phase 2). All 7 are now ported, each with its own progress-log detail folded in here rather
  than as separate entries given the pass covered all of them together:
  - **Feedback** (145 web lines) — a `mailto:` draft composer; `window.open` → `Linking.openURL`;
    `__APP_VERSION__` (a Vite `define`) has no mobile equivalent, so this reads `app.json`'s `version` via
    `expo-constants` instead (`Constants.expoConfig?.version`) — first use of that field on mobile.
  - **Import** (401 lines) — `useImport.ts`/`importParsers`/`importPipeline` were already
    platform-agnostic; only the file-picking UI needed a swap (`expo-document-picker` +
    `expo-file-system`'s `File.text()`, same pattern as onboarding's `AccountRecoveryScreen`). Restored
    Expenses' "Import expenses" header button, previously a flagged no-op.
  - **Backup & Restore** (456 lines) — export/import/reset all fully functional (`expo-file-system` +
    `expo-sharing` for export/share, `expo-document-picker` for restore, `notifyAuthShouldRecheck()` in
    place of web's full-page-reload after import/reset). The bigger piece: the **automatic backup engine
    was upgraded to actually run on mobile** — added `packages/core/src/core/sync/SyncProvider.native.tsx`
    (re-runs on `AppState` → `'active'` instead of web's `online`/`visibilitychange` DOM events; RN needed
    `react-native` added as a direct `packages/core` dependency, since that file lives there, not in
    `apps/mobile`) and upgraded `backupPrefs.native.ts` from in-memory-only to AsyncStorage-hydrated.
    Mounted `SyncProvider` in `RootNavigator.tsx` around `MainNavigator` (post-unlock), mirroring web's
    `AppShell` mount point. Google Drive (needs native Sign-In, not built) and the on-device OPFS floor
    (browser-only API) both degrade to their existing "not configured" UI rather than crashing.
  - **Cashflow** (487 lines) — the "Safe to spend" screen Home/Expenses had flagged no-op links to.
    `useForecast` was already shared and complete; the balance sparkline is redrawn with `react-native-svg`
    (`Path`/`Line`/`Circle`); `useIncomeSuggestions`'s dismissed-set cache swaps `localStorage` for
    `~/lib/storage`.
  - **News** (689 lines) — `core/news/newsClient.ts` needed a real `.native.ts` sibling: RN has **no
    `DOMParser`** at all (a first for this migration — every prior "browser API missing" case was
    `localStorage`/`window` events), so RSS parsing became a small regex-based tag extractor (handles
    `CDATA`-wrapped fields); cache drops to in-memory/session-scoped, same precedent as `ipoClient.native.ts`.
    `FilterDropdown`'s hand-rolled dropdown rebuilt on the shared `Modal`, same fix pattern used
    throughout this migration.
  - **Calculators** (1,405 lines, 10 individual calculators + shared `CalcUI.tsx` primitives) — the most
    mechanical of the seven; `AmountRow`/`HeroResult` take a `masked` boolean from `usePrivacy().shouldMask(false)`
    instead of porting web's tap-to-peek `MaskedValue` component (no precedent for that interaction
    anywhere else on mobile). `ResultCard`'s web `divide-y` becomes the same border-top-on-non-first-child
    technique `ListContainer.tsx` already established.
  - **Tax Awareness** (1,848 lines — the largest of the seven) — four-pillar tab structure
    (Footprint/Explore/Optimize/Calculators) ported whole; every hook (`useTaxData`, `useTaxDeductions`,
    `useFootprint`) was already platform-agnostic. Two new pieces: `@react-native-community/slider` (new
    native dependency — Optimize's "what-if" deduction sliders had no existing RN range-input equivalent
    anywhere in the app), and `TaxStoryModal`'s shareable image, which reuses Home Stories' exact
    `ShareCard`/`react-native-view-shot`/`expo-sharing` solution instead of web's procedural `<canvas>` +
    `navigator.share`.
  - **Entry points restored** across Home/Expenses (previously flagged no-ops pending these modules):
    Home's `ToolsGrid` (News, Calculators tiles), Home's `GlanceHeader` ("Safe to spend"), Home's
    `MoneyStatsCard` ("Tax story" row), Expenses' `ExpensesHeader` ("Import expenses" button, "Safe: ₹X"
    pill). `SettingsPage` gained "Backup & Restore" and "Contact & Feedback" rows (both previously
    explicitly called out as dropped in that file's own comment).
- **Verification**: `tsc -b` (both `apps/mobile` and `packages/core` standalone), `eslint` clean across
  every new/touched file; full `apps/web-legacy` production build unaffected (sanity-checked after the
  `packages/core` `package.json`/`SyncProvider.native.tsx` changes, since that's shared code). Render/
  layout only — no on-device pass yet for these 7 modules (matches this migration's standing "Session
  locked" caveat until a real device/emulator session is run against them).

### 2026-07-25 — On-device verification of the 7-module pass begins: RN-web platform gap, onboarding layout bug, native module linking (in progress)

Started the on-device verification pass flagged as outstanding above. Testing happened across three
surfaces at once — the Android emulator (`penny_pixel` AVD), `apps/mobile` running via `expo start --web`
(react-native-web in a browser), and `apps/web-legacy` (the original web app) side by side — to cross-check
new modules against the reference implementation. Found and fixed two real bugs; one more found, fix
recommended but not yet confirmed.

- **RN-web crash: `Cannot read properties of undefined (reading 'VITE_ENABLE_SYNC')`.** Mounting
  `SyncProvider` at the app root (this pass's Backup & Restore work) was the first thing to ever
  unconditionally import `entitlement.ts` at startup — surfacing a latent gap that likely predates this
  session: `apps/mobile` targets iOS/Android/**web** (via react-native-web), but Metro's platform
  resolution only swaps in `.native.ts` for iOS/Android, never for the `web` target, so anything without a
  `.web.ts` sibling falls through to the bare file — which still assumes Vite's `import.meta.env`, a global
  Metro never defines. First fix attempt (adding `entitlement.web.ts`, `apiBase.web.ts`,
  `googleDriveProvider.web.ts` mirroring the existing `.native.ts` siblings) didn't work — the crash
  persisted identically. **Real root cause, found by reading `@expo/metro-config`'s source directly**:
  Expo's default Metro config explicitly sets `resolver.platforms: ['ios', 'android', 'tvos', 'macos']`
  (omitting `'web'` entirely, unlike Metro core's own default which includes it), so Metro's file crawler
  never even recognized `foo.web.ts` as a platform variant of `foo` — not a cache issue, a genuine config
  gap. Fixed by explicitly appending `'web'` to `resolver.platforms` in `apps/mobile/metro.config.js`. This
  requires a full Metro restart to take effect (platform config is read once at server startup, not
  hot-reloadable) — confirmed via `expo start --web --clear`.
- **Onboarding layout bug: back arrow misaligned + unwanted gap at the top, across all 11 onboarding
  screens.** `OnboardingBack` (`position: absolute`, `top-5 left-5`, meant to sit flush at the top-left of
  a "full-bleed" screen) was rendered as the **first child inside a `ScrollView`** that itself has
  `px-6 py-10` padding. In React Native, `<ScrollView>{children}</ScrollView>` renders its children inside
  an *inner* scrollable content view, distinct from the *outer* frame the padding actually attaches to —
  so the inner content view (and everything positioned relative to it, including the absolutely-positioned
  back button) was already offset by the outer frame's padding, pushing the button ~40px further down/right
  than intended. A dedicated Explore-agent survey confirmed **all 11 files using `OnboardingBack`**
  (AccountRecoveryScreen, BackupSetupScreen, AddAccountsScreen, AccountStartScreen, ChipIntroScreen,
  DemoVaultScreen, LetUsKnowYouScreen, PrivacyDemoScreen, LifeHouseholdScreen, SimulatedDashboardScreen,
  SetupCredentialsScreen) have the identical structure — no outliers. Fixed uniformly: moved
  `<OnboardingBack />` out of the `ScrollView`, as a direct sibling inside `SafeAreaView` (no padding),
  across all 11 files. Verified against web-legacy screenshots side-by-side on two of the fixed screens
  (PrivacyDemoScreen, ChipIntroScreen) post-fix — matches web's actual behavior (an independent top-corner
  overlay, not row-aligned with whatever hero icon the screen has). **One follow-up design change beyond
  the structural fix**: `SimulatedDashboardScreen` ("Here's a preview") has no hero icon above its title
  (unique among the 11), so the floating corner arrow left a conspicuous empty gap with nothing to anchor
  it against — per explicit user feedback, this one screen now uses a local inline back arrow + centered
  title in the same row (vertically centered together), rather than the shared absolute-positioned
  `OnboardingBack`. The other 10 screens (which all have a hero icon) keep the shared component/pattern.
- **Native module linking issue found, not yet confirmed fixed**: `[runtime not ready]: Invariant
  Violation: TurboModuleRegistry.getEnforcing(...): 'QuickBase64' could not be found` on a fresh
  (`pm clear`-reset) on-device run. `react-native-quick-base64` is a real native turbo module, nested three
  levels deep (`react-native-quick-crypto` → `@craftzdog/react-native-buffer` → `react-native-quick-
  base64`) — not something touched directly this session, but likely surfaced by the several `pnpm
  install`s run this pass (adding `@react-native-community/slider`, adding `react-native` as a direct
  `packages/core` dependency for `SyncProvider.native.tsx`), which can shift pnpm's dependency resolution
  enough to change what's reachable for Android autolinking without a matching native rebuild. Recommended
  fix: a full `npx expo run:android` (relinks every native module fresh) — **not yet confirmed working**,
  since the user is now driving testing/emulator interaction directly rather than through agent-driven
  screenshots (a request made explicitly this pass — "I will do the testing"). If a rebuild doesn't clear
  it, this needs real autolinking investigation, not another rebuild attempt.
- **Process note**: switched testing approach mid-pass — the user asked to stop having Claude drive the
  emulator/take screenshots directly ("you waste time, I will do the testing") in favor of Claude making
  code fixes and handing back plain terminal commands for the user to run themselves. `docs/RUNNING_MOBILE.md`
  should get a follow-up pass documenting the `JAVA_HOME` requirement for local Gradle builds on this
  machine (no system Java installed, only Android Studio's bundled JBR) and the native-rebuild-vs-Metro-
  restart distinction (JS-only changes → Metro hot reload is enough; new native deps or native config
  changes like `metro.config.js`'s `resolver.platforms` → full `expo run:android` rebuild required).
