# Penny → React Native Migration Plan (living doc)

> **Status:** 🚧 In progress. **Track 0 ✅** (repo restructuring: pnpm workspace, `packages/core` +
> `apps/web-legacy` split, existing Vitest suite green, `tsc -b`/eslint clean, build+dev smoke-tested).
> **Track 1 (Expo app skeleton) = next.** Full context: [`CLAUDE.md`](../../CLAUDE.md), architecture
> details in [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md).
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

### Track 1 — RN app skeleton — next
`apps/mobile` via `create-expo-app`, NativeWind theme wired to a new single-source-of-truth token object,
React Navigation stack+tabs, `AuthGuard` state machine ported. Runs in plain Expo Go (no native modules yet).
Write `docs/RUNNING_MOBILE.md`.

### Track 2 — Storage + crypto adapter swap (highest risk)
`expo-sqlite` adapter (SQL DDL reimplementing the Dexie v1–v9 migration history) + `react-native-quick-crypto`
polyfill install. Verified via shared crypto test vectors, a cross-engine backup-bundle round-trip, and reused
Vitest assertions against the new adapter. From this track on, device testing needs an EAS development build
(Expo Go doesn't support these native modules).

### Track 3 — Core UI component library port
~30 shared components rebuilt as NativeWind + View/Text/Pressable in `apps/mobile/src/components/`, preserving
prop APIs and the centered-modal-only rule.

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
  UI changed in this track, so lower priority, but still owed before the branch is considered mergeable —
  see the plan's Validation strategy). **Nothing has been committed yet** — awaiting user sign-off per the
  commit gate (guideline 10).
