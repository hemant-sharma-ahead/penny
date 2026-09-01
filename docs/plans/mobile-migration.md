# Penny → React Native Migration — Technical Reference

**Current status: complete.** `apps/web-react` was retired and deleted 2026-08-29 (frozen
since 2026-07-31, fully superseded) — `apps/mobile` is the one app; there's no longer a
parity target to track against. This doc is deliberately **not** a dated progress log
anymore — it was one for a long time (2,500+ lines of session-by-session narrative), and
that made "what's actually true right now" something you had to excavate rather than look
up. What follows is the durable reference instead: why this migration existed, the tech
stack actually chosen and why, the technical requirements, and a distilled playbook of the
concrete lessons already learned the hard way — kept for whoever needs the history or hits
a similar cross-platform-porting problem again.

## Why this migration exists

Penny is moving to a first-class iOS/Android app (the primary target going forward) while
keeping `apps/web-react` (the former sole codebase) alive as the source of truth for
functionality/behavior/design until `apps/mobile` reaches documented parity with it
(see Track 7, below).

## Tech stack chosen, and why

| Concern                      | Chosen                                                     | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App framework                | **Expo (managed workflow)**                                | Not bare RN CLI (would mean owning native project files directly for no real benefit here) and not Capacitor (a WebView wrapper, not a real native UI — see `docs/ROADMAP.md`'s long-term react-native-web vision for why a _real_ single codebase is the actual goal, which Capacitor doesn't provide). One codebase targets iOS, Android, and eventually web via `react-native-web`.                                                                                                                                                                                                                                                                                                                        |
| Styling                      | **NativeWind**                                             | Reuses the exact semantic token names already established in `docs/DESIGN_GUIDELINES.md`, so there's no second design-token vocabulary to keep in sync, and no hand-written RN `StyleSheet` reimplementing what Tailwind already expresses.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Business logic               | **`packages/core/`**                                       | Platform-agnostic by construction (Track 0 extracted it from the pre-split `src/core/`+`src/lib/`) — ports with near-zero changes; only the genuinely platform-different seams (`.native.ts`/`.web.ts` files) need porting attention.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Local storage                | **`@op-engineering/op-sqlite`**                            | Went through two prior engines first, each swap driven by a real, measured performance bug, not a hypothetical: `expo-sqlite` → serialization/concurrency bugs under bulk writes (fixed with a FIFO queue, then replaced outright) → `react-native-mmkv` → fully synchronous calls block the JS thread for an entire bulk-read loop, unlike Dexie/IndexedDB's off-thread model → `@op-engineering/op-sqlite` — real async dispatch to a native thread (matching Dexie's own off-thread shape), WAL journal mode, one connection per app session (per its own guidance, no manual reader pool). Sits entirely behind `EncryptedRepository<T>`'s existing `RowStore<T>` interface — zero changes to any caller. |
| Crypto                       | **`react-native-quick-crypto`**                            | Polyfills `crypto.subtle`, so `engine.ts`/`securityManager.ts`/`identityKeys.ts`/`recovery.ts` need no logic changes at all — confirmed via the same cross-engine test vectors used to verify the web implementation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Large/growing lists          | **`@shopify/flash-list`**                                  | `FlatList`/`SectionList` (RN's `VirtualizedList`) destroy and remount a row's whole component tree every time it scrolls out of and back into view — for rows mounting a real gesture-recognizer (`SwipeableRow`) or lists with unbounded growth, that's a severe, measured lag/ANR source, not a style preference. FlashList recycles row components instead. See the playbook below for the full diagnosis.                                                                                                                                                                                                                                                                                                 |
| Swipe gestures               | **`react-native-gesture-handler`** (`ReanimatedSwipeable`) | RN's replacement for web's pointer-based swipe-to-reveal rows; needs `GestureHandlerRootView` at the app root.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Continuous/looping animation | **`react-native-reanimated`**                              | No CSS `@keyframes` equivalent exists in RN — needed for `MarketTicker`'s continuous-scroll marquee.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Share-a-rendered-view        | **`react-native-view-shot` + `expo-sharing`**              | RN's replacement for `<canvas>` + Web Share API — snapshot a real off-screen RN `View` to an image, then open the native share sheet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Gradients                    | **`expo-linear-gradient`**                                 | RN has no CSS gradient syntax.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Receipt photo capture        | **`expo-image-picker` + `expo-image-manipulator`**         | RN's replacement for `<input type="file">` + `<canvas>` (pick → downscale/compress).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| File export                  | **`expo-file-system` + `expo-sharing`**                    | Write a file to disk, then hand it to the native share sheet — CSV/ZIP export, XLSX export.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Non-secret config            | **`expo-constants`**                                       | Reads build-time config (deployed worker URLs, feature flags) from `app.json`'s `extra` field — RN's equivalent of Vite's `import.meta.env`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Clipboard                    | **`expo-clipboard`**                                       | Invite-link copy (Groups).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Range slider                 | **`@react-native-community/slider`**                       | No RN range-input equivalent existed anywhere else in the app (Tax's Optimize "what-if" deduction sliders).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Technical requirements / constraints

- **Expo Go does not work for this project**, on any SDK version — `react-native-quick-crypto`
  and `@op-engineering/op-sqlite` are custom native modules Expo Go can't load. A real
  development build is required from Track 2 onward (see `CONTRIBUTING.md`).
- **Security-critical files** (`engine.ts`, `securityManager.ts`, `identityKeys.ts`,
  `recovery.ts`, `db/repository.ts`) get the most scrutiny of anything ported — verified
  with cross-engine test vectors before anything is built on top of them.
- **No behavior change without a flagged reason** — every track defaults to functionally
  identical behavior versus `apps/web-react`; any intentional platform difference must be
  explicit, not silent.
- Architecture rules (Anthropic/Dexie import restrictions, no cross-feature imports,
  no-console-PII) hold at every new package boundary, same as web.
- `docs/DESIGN_GUIDELINES.md` non-negotiables (centered modals, fixed chrome, back button,
  semantic tokens only) hold in every new screen.

## Migration playbook — lessons already learned the hard way

Concrete, reusable gotchas found during porting so far. Read this before porting or
auditing a new module — several of these are easy to reintroduce if you don't know to
watch for them.

**Lists.** Any list that's large (hundreds+ rows) or has gesture-heavy rows (swipe
actions) must be `FlashList`, never `FlatList`/`SectionList` — the latter remounts rows on
every scroll pass in and out of view, which is fine for a handful of cheap rows but causes
real lag and can ANR at scale. Flatten sectioned data into one array with `getItemType` for
header/row recycling pools. Tune `drawDistance` (default 250dp) up if a fast fling produces
a visible blank-cell flash.

**Memoization is only as good as the props feeding it.** Wrapping a row in `React.memo` and
its `renderItem` in `useCallback` does nothing if the _props_ passed into them (arrays,
objects, callbacks) get a new identity on every parent render. Trace the _whole_ prop chain
back to its source before trusting a memoization fix — a parent component with many
`useState` hooks will very easily produce fresh callback/array identities every render
without `useCallback`/`useMemo` at each step.

**Theming reactivity, not just static color-matching.** Any chrome-level or screen-level
background must use `useModeBackgroundColor()`/`useModeAccentColor()` from `~/theme/` —
these mirror web's CSS-var cascade for privacy mode and dark mode. A flat `theme.surface`
or a hardcoded Tailwind class _looks_ right at first glance but silently stops reacting to
mode changes. Found twice independently (a bottom tab bar, a screen background) — treat
this as a standing audit item, not a one-off fix.

**Android `TextInput` needs explicit sizing.** RN's `TextInput` on Android carries built-in
font-metric padding (`includeFontPadding`, on by default) that web's `<input>` never had —
every unstyled text input renders visibly taller than its siblings unless you set
`includeFontPadding={false}` plus explicit vertical centering.

**Platform-suffixed files must not duplicate literals.** A `.native.ts`/`.web.ts` pair
should only ever differ in genuinely platform-different logic. Any literal (URL, storage
key, event name, cache TTL) needed identically by both belongs in an unsuffixed sibling
`*.constants.ts` file, imported by all variants — never copy-pasted independently. This is
exactly how an IPO API URL fix once had to be applied in two places instead of one, and
silently diverged when only one side got the initial fix.

**A single shared native DB connection needs either serialization or a truly async engine
— not neither.** The original `expo-sqlite` adapter had no call serialization at all, and
concurrent bulk writes (demo-data seeding, ~16 call sites hitting the same tables) silently
corrupted the native statement pool. A FIFO queue fixed the crash but reintroduced Dexie's
own off-thread-call-shape problem in miniature; the actual fix was switching to an engine
whose calls are natively async and dispatch off the JS thread (`@op-engineering/op-sqlite`),
matching how Dexie/IndexedDB already behaved on web.

**Metro's platform-suffix resolution is fixed and short**: `ios`/`android`/`native`/`web`
(plus whatever's explicitly added to `resolver.platforms`, e.g. `'web'` for
`react-native-web` builds — Expo's default config omits it, which produces a confusing
`import.meta.env`-related crash on `pnpm web` until fixed). An arbitrarily-named file like
`apiBase.constants.ts` is never mistaken for needing its own platform variant, which is
what makes the constants-sharing pattern above safe.

**Hot reload vs. native rebuild.** Pure JS/TS changes hot-reload via Fast Refresh. A new
native dependency, or any `metro.config.js` change, or a change to native project files
under `android/`/`ios/`, needs a full `npx expo prebuild --clean` + `npx expo run:android`/
`run:ios` — a JS-only reload will not pick it up and produces a
`TurboModuleRegistry.getEnforcing(...)` crash if you try anyway.

**Browser-only APIs with no direct RN equivalent, found so far:**

- `window` events (`useTxnRefresh`, `useDataRefresh`) — `.native.ts` sibling using RN's
  event-emitter patterns instead.
- `localStorage`, synchronous — swapped for `AsyncStorage` where the calling code is
  already async, or an in-memory-only cache where the original code assumed synchronous
  reads feeding an otherwise-async fetch (`ipoClient.ts`, `npsClient.ts`, `marketDataClient.ts`)
  — session-scoped only, not persisted across cold starts, since a mechanical
  `AsyncStorage` swap isn't possible for a synchronous-cache-feeding-async-fetch shape.
- `DOMParser` — doesn't exist in RN at all (unlike the other gaps above, no swap library
  exists); `newsClient.native.ts` reimplements RSS parsing as a small regex-based tag
  extractor instead.
- CSS `conic-gradient`/gradients generally — no RN equivalent; redraw as `react-native-svg`
  (a multi-arc ring for the health-score gauge) or `expo-linear-gradient`.
- CSS Grid — no Yoga (RN's layout engine) equivalent; redesign as `flex-wrap` layouts.

**Layout gotchas found on-device:**

- A screen reached before a `Stack.Navigator` exists (e.g. a temporary auth stand-in)
  doesn't get a safe-area top inset automatically — apply it explicitly.
- Sibling `fullWidth` buttons inside a `flex-row` overflow instead of splitting evenly
  unless each is wrapped in its own `flex-1` container.
- `TabStrip`'s `scrollable` mode needs `flexGrow: 0` on its `ScrollView`, or it stretches to
  fill remaining vertical space and pushes labels down.
- The Android hardware back button can bypass a modal/lockout screen that a header back
  button can't — handle `BackHandler` explicitly on any screen that must not be dismissible.
- Toasts need an explicit z-index/elevation above open modals, or they render behind them.

## Locked-in architectural decisions

- **Single Expo codebase** (not two permanently separate UI folders) targets iOS, Android,
  and eventually web via `react-native-web`.
- **`apps/web-react`** stays running exactly as-is until `apps/mobile`'s RN-Web build
  reaches documented parity with it (Track 7 gate) — see `docs/ROADMAP.md`'s long-term
  vision for retiring the separate web codebase entirely once that happens.
- **Explicitly deferred but architecturally anticipated** (see `docs/ARCHITECTURE.md`'s
  decision log and "Designed for, not built yet" below): device pairing/QR (Track F4,
  unsettled design), real Anthropic/Chip integration (still mock-only), push notifications,
  biometrics, camera/QR scanning, receipt uploads beyond what's built, Android SMS-based
  expense capture, low-storage handling.

## Tracks

### Track 0 — Repo restructuring + shared core extraction — ✅ done

Moved `src/core/*`, `src/lib/*`, and 5 framework-agnostic hooks into `packages/core/src/`,
verbatim. Everything else moved into `apps/web-react/` (renamed from `web-legacy` — see
`docs/ROADMAP.md`). Stood up `pnpm-workspace.yaml`, per-package `package.json`/
`tsconfig.json`, re-scoped `eslint.config.js`'s `no-restricted-imports` rules.

### Track 1 — RN app skeleton — ✅ done

`apps/mobile` via `create-expo-app`, NativeWind theme wired to
`packages/core/src/theme/tokens.ts` (single source of truth, 3 palettes + runtime dark-mode
switching via NativeWind's `vars()`), React Navigation stack+tabs.

### Track 2 — Storage + crypto adapter swap (highest risk) — ✅ done

See "Tech stack chosen" above for the full storage-engine journey. `react-native-quick-crypto`
polyfill verified via cross-engine test vectors. From this track on, device testing needs a
real development build (see `CONTRIBUTING.md`).

### Track 3 — Core UI component library port — ✅ done

All ~28 `components/ui/` rebuilt as NativeWind + View/Text/Pressable in
`apps/mobile/src/components/ui/`, preserving prop APIs and the centered-modal-only rule.

### Track 4 — Feature-by-feature migration — ✅ done (all modules)

Every feature folder in `apps/web-react/src/features/` had a corresponding, ported
counterpart in `apps/mobile/src/features/` (24/24) well before `apps/web-react` was
retired. Real onboarding (13 screens) sets a real Data Master Key on-device. IOU stays
**personal-only** by design (its one `GroupContext` dependency is an informational banner,
dropped rather than pulling in Groups' sync machinery early) — every other module either
has no Groups dependency or has it fully ported.

**Shared-infra dependency tiers** (surveyed once up front, not rediscovered per module):
Tier 1 (ported early, needed almost everywhere): `PrivacyContext`, `SettingsContext`,
`ToastContext`, `useLoggedRepository`, `useForecast`, `EventModeContext`. Tier 2
(Phase-1.5 sync/multi-device machinery, real weight): `GroupContext` — now ported (Groups
module), pulled in only where a module actually needs group-scoped behavior. Tier 3:
`OnboardingDraftContext` — ported alongside Onboarding.

### Track 5 — Sync/backup — ✅ done

Google Drive OAuth swap (`expo-auth-session`), local backup via `expo-file-system`,
connectivity/lifecycle via `AppState` (RN has no DOM `online`/`visibilitychange` events).

### Track 6 — Polish, E2E, store submission readiness — not started

EAS Build/Submit, an E2E testing approach (Maestro is the current lean, chosen over Detox
to avoid native test-runner wiring against Expo's managed workflow — not yet built),
minimal CI for `packages/core`/`apps/mobile` tests.

### Track 7 — Web cutover — ✅ resolved 2026-08-29, differently than originally planned

Originally scoped as "once `apps/mobile`'s `react-native-web` build reaches documented
parity with `apps/web-react` (every `docs/features/*.md` capability, the `max-w-[430px]`
layout, cross-platform Drive backup, no functional regressions), retire `apps/web-react`."
That formal parity-then-cutover process never ran — instead, `apps/web-react` (frozen
since 2026-07-31 with zero further changes) was simply retired and deleted outright once a
DB-structure review made clear it had no remaining active users or purpose, without first
building out full `react-native-web` parity. Same end state either way (exactly one
codebase remains) — see `docs/ARCHITECTURE.md`'s matching decision-log entry for the actual
sequencing used. `apps/mobile`'s existing `expo start --web`/`.web.ts` support already
covers what limited "does this work in a browser" need remains, independent of this Track.

## Designed for, not built yet

Real future features, each with a cheap architectural accommodation already in place or
noted, but not built ahead of schedule: native Google Drive OAuth (the `CloudProvider`
interface is the seam), biometric unlock (a third KEK type alongside PIN/passphrase),
camera/QR scanning (Track F4 + receipt capture — an Expo config-plugin addition later),
Android SMS-based expense capture (its own `.android.ts` seam later), low-storage handling
(the storage adapter should surface write errors as a typed error so a future UX can hook
in one place).

## Explicitly out of scope

Track F4 device pairing/QR, real Anthropic/Chip client, push notifications, biometrics,
camera/QR scanning, receipt uploads beyond what's built, Android SMS capture, low-storage
handling, CAS/EPFO PDF import, PDF/HTML export, watchlist — none are implemented or
accelerated by Tracks 0-7. Pixel-identical web/mobile parity is not a goal; Track 7 defines
the actual parity bar for retiring `apps/web-react`.
