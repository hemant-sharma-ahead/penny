# Contributing to Penny

Penny is a pnpm workspace with three platform surfaces sharing one business-logic
package. This doc covers running and contributing to all of them. If you only need "how
do I run the app," jump to [Running `apps/web-react`](#running-appsweb-react-the-web-app)
or [Running `apps/mobile`](#running-appsmobile-expo--react-native).

## Repo layout

```
packages/core/    Platform-agnostic business logic — crypto, db, calculators, all core/* domains
apps/web-react/   The web app (React 19 + Vite + Tailwind) — currently the source of truth
                  for functionality/behavior/design that apps/mobile is ported against
apps/mobile/      React Native (Expo) port of apps/web-react — in progress, see
                  docs/plans/mobile-migration.md and docs/MOBILE_PARITY.md
workers/          Independent Cloudflare Workers (api-proxy, auth, groups) — each has its
                  own package.json/lockfile and its own README.md; not part of the pnpm
                  workspace (excluded deliberately, see pnpm-workspace.yaml)
docs/             Deep reference — see docs/README.md for the full index
.claude/          Claude Code skills/agents/commands for working in this repo
```

**Root-level config** (`tsconfig.json`, `eslint.config.js`, `.prettierrc`, `.nvmrc`,
`package.json`) is genuinely shared across `packages/*` and `apps/*` — a single
TypeScript project-references build, one lint config enforcing cross-package architecture
rules, one formatting standard. It is not legacy from before the workspace split; each
app already owns its own complete build config (`apps/web-react/vite.config.ts`,
`apps/mobile/metro.config.js`, etc.) and the root only orchestrates.

## Prerequisites

- Node 20+ (see `.nvmrc`)
- `pnpm` (`npm install -g pnpm` if you don't have it)
- From the repo root: `pnpm install` (sets up the whole workspace at once)

## Quick reference — running the apps

One glance to pick a surface and get moving; each column links to its full section below
for flags, troubleshooting, and prerequisites.

| | [web-react](#running-appsweb-react-the-web-app) | [web-react + Capacitor](#running-appsweb-react-wrapped-in-capacitor-android-emulator-side-by-side-comparison) | [apps/mobile](#running-appsmobile-expo--react-native) | [RN Web](#running-appsmobile-expo--react-native) |
| --- | --- | --- | --- | --- |
| **Dev command** | `pnpm dev` (repo root) | `cd apps/web-react && npx cap open android` (no package-script shortcut yet — Capacitor isn't installed, see below) | `pnpm android` / `pnpm ios` (from `apps/mobile`)<br>— or directly: `npx expo run:android` / `run:ios` | `pnpm web` (from `apps/mobile`)<br>— or with a forced cache clear: `npx expo start --web --clear` |
| **Runs at** | `http://localhost:5173` | Android Studio emulator/device | Emulator/AVD or a paired device, via a dev client | `http://localhost:8081` (or `:8082` if `:8081` is taken) in a browser |
| **Prerequisite** | None — `pnpm install` is enough | `@capacitor/*` packages (not currently installed — see below) + Android Studio | Android Studio (Android) or Xcode (iOS) — **not** Expo Go | Just Expo, no native toolchain |
| **Picks up code changes via** | Vite HMR — instant | `pnpm build && npx cap sync android`, then re-run from Android Studio | Fast Refresh for JS/TS; full native rebuild only for native deps, `metro.config.js`, `app.json`, or `android/`/`ios/` project file changes | `react-native-web` + Fast Refresh, same as web |
| **Status** | Source of truth for functionality/design | Dormant — perf/behavior comparison tool only, not the primary mobile path | In progress — see `docs/MOBILE_PARITY.md` | Same JS as `apps/mobile`, rendered as real DOM — useful for quick browser checks of mobile code |
| **Force a JS-only relaunch** (no rebuild — a stuck screen/state, not a stale Metro server) | Just refresh the browser tab | Re-run from Android Studio, or the same `adb`/simulator commands as `apps/mobile` | Android: `adb shell am force-stop com.anonymous.penny && adb shell monkey -p com.anonymous.penny -c android.intent.category.LAUNCHER 1`.<br>iOS: relaunch from the Simulator (⌘⇧H twice, or Device → Restart) | Just refresh the browser tab |
| **Full native rebuild + reinstall** (native dep changed, or `app.json`/`android/`/`ios/` changed) | N/A — no native step | `pnpm build && npx cap sync android`, then re-run from Android Studio | `npx expo run:android` / `run:ios` again — recompiles, bakes in the current `app.json`, reinstalls onto the emulator/device | N/A — restart Metro (`npx expo start --web --clear`) is enough, no native step |

`--clear` wipes the Metro bundler cache — worth adding any time you've hit a bundle that
seems stuck on old code, or after changing `app.json`'s `extra` config; drop it for a
faster day-to-day start once you know the cache is clean.

`app.json`'s `extra` block (env-style config like `apiProxyUrl`) behaves differently by
target: **RN Web** (`expo start --web`) re-reads it fresh every time Metro (re)starts, so a
Metro restart is enough. A true **native dev-client build** (`expo run:android`/`run:ios`)
bakes it into the compiled app at build time instead — changing `app.json` there needs a
full rebuild (the same command again), not just a reload. See the native-rebuild note in
[Running `apps/mobile`](#running-appsmobile-expo--react-native).

## Resetting app data (start over from onboarding)

Wipes all local data (encrypted DB, session/DMK, onboarding flag, everything) so the app
next opens as if freshly installed. Useful for testing onboarding, or getting unstuck from
a bad local state — this is a data reset, not a code reload; nothing here touches source
files or the dev server.

| | web-react (browser) | apps/mobile (Android, via `adb`) | apps/mobile (iOS Simulator) |
| --- | --- | --- | --- |
| **Command** | In the browser's DevTools console:<br>`localStorage.clear();`<br>`indexedDB.deleteDatabase('penny');`<br>`window.location.reload();` | `adb shell pm clear com.anonymous.penny`<br>then relaunch: `adb shell am force-stop com.anonymous.penny && adb shell monkey -p com.anonymous.penny -c android.intent.category.LAUNCHER 1` | Long-press the app icon → Remove App → Delete App (or `xcrun simctl uninstall booted <bundle-id>`), then reinstall: `npx expo run:ios` |
| **What it clears** | Dexie (IndexedDB) + any `localStorage` (theme pref, plain caches like news/market) | Everything in the app's private storage — `op-sqlite` DB, `AsyncStorage`, session/DMK | Same as Android — a full uninstall is the only guaranteed full wipe (no `pm clear` equivalent on iOS) |
| **Notes** | `indexedDB.deleteDatabase('penny')` must run before/without another tab holding the DB open, or it silently queues instead of deleting — close other tabs of the app first | Package name is `com.anonymous.penny` (from `app.json`'s `android.package`) — reinstalling isn't needed, `pm clear` alone resets state | iOS bundle id isn't set explicitly in `app.json` yet (defaults to one derived from the app slug) — check Xcode/the Simulator once `ios/` is prebuilt |

## Quick reference — running the Workers

All three share one template (Track A) — own `package.json`/lockfile, `wrangler dev` for
local, `wrangler deploy` (+ `:staging`/`:prod`) to ship. See each worker's own README for
full setup (KV/D1 resource creation, migrations, secrets).

| | [api-proxy](workers/api-proxy/README.md) | [auth](workers/auth/README.md) | [groups](workers/groups/README.md) |
| --- | --- | --- | --- |
| **Purpose** | CORS-fixing passthrough + cache for Yahoo/MFAPI/NPS/investorgain/RSS news + vehicle lookup | Phone-less device identity/claim (Track C) | Shared-ledger relay for Groups & Household OS (Track E) |
| **Local dev** | `cd workers/api-proxy && npm run dev` → `http://localhost:8787`<br>— or directly: `npx wrangler dev` | `cd workers/auth && npm run dev -- --port 8788` (a distinct port, since api-proxy's default is 8787)<br>— or directly: `npx wrangler dev --port 8788` | `cd workers/groups && npm run dev -- --port 8789` (a distinct port from the other two)<br>— or directly: `npx wrangler dev --port 8789` |
| **Deploy** | `cd workers/api-proxy && npm run deploy`<br>— or directly: `npx wrangler deploy` | `cd workers/auth && npm run deploy`<br>— or directly: `npx wrangler deploy` | `cd workers/groups && npm run deploy`<br>— or directly: `npx wrangler deploy` |
| **Deploy (staging/prod)** | `npm run deploy:staging` / `npm run deploy:prod`<br>— or directly: `npx wrangler deploy --env staging` / `--env production` | same, either form | same, either form |
| **Point the app at it** | `VITE_API_PROXY` (web) / `app.json`'s `extra.apiProxyUrl` (mobile) | `VITE_AUTH_PROXY`, falls back to `${VITE_API_PROXY}/auth` | `VITE_GROUPS_PROXY`, falls back to `${VITE_API_PROXY}/groups` |
| **Live URL** | `penny-api-proxy.hesh.workers.dev` | `penny-auth.hesh.workers.dev` | `penny-groups.hesh.workers.dev` (deployed, Track E1 not yet live end-to-end) |

`npm run dev`/`npm run deploy` (each worker's own `package.json` scripts) and the direct
`npx wrangler …` commands are equivalent — the table lists both since either is a normal
way to run them. First-time setup per worker (creating KV/D1 resources, running
migrations, `wrangler secret put`, etc.) isn't repeated here — see each worker's own
README, linked in the header row above.

## Running `apps/web-react` (the web app)

```bash
pnpm dev            # from repo root — delegates to apps/web-react's own Vite dev server
```

App runs at `http://localhost:5173`. DevTools → 390px viewport to see the mobile layout.
You usually don't need to set any environment variables — the app runs fully on local/
simulated data by default. See `apps/web-react/.env.example` for what's supported;
`.env.production` (committed, non-secret) points at the deployed API Proxy Worker so
market/NAV/vehicle data works out of the box. **Never put secrets in a `VITE_*` var** —
they're public in the shipped bundle.

**Backend worker (optional):** the API Proxy Worker lives in
[`workers/api-proxy/`](workers/api-proxy/README.md) — run it locally with `wrangler dev`
or deploy it (see its own README). Point `apps/web-react/.env.local` at
`VITE_API_PROXY=http://localhost:8787` to use a local worker instead of the deployed one,
or leave it unset to force direct, no-backend calls.

## Running `apps/mobile` (Expo / React Native)

Full detail (troubleshooting, the hot-reload-vs-native-rebuild rule, run modes) lives in
`docs/plans/mobile-migration.md`'s migration playbook — this is the quick-start.

**Expo Go does not work for this project** — `apps/mobile` uses custom native modules
(`react-native-quick-crypto`, `@op-engineering/op-sqlite`) that Expo Go can't load on any
SDK version. You need a development build instead:

```bash
cd apps/mobile
npx expo run:android   # requires Android Studio + SDK; installs to an emulator/AVD or a connected device
npx expo run:ios       # requires Xcode; iOS Simulator or a paired device
```

The first build compiles the native project from scratch (several minutes); after that,
pure JS/TS changes hot-reload via Fast Refresh — just save the file. A **full native
rebuild** (the commands above, again) is only needed when a native dependency changes, or
`metro.config.js` changes, or native project files under `apps/mobile/android/`/`ios/`
change directly — a JS-only reload will not pick those up and produces a
`TurboModuleRegistry.getEnforcing` crash if you try.

No system Java on this machine? Gradle needs a JDK — point at Android Studio's bundled one:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

Other run modes: `pnpm ios` / `pnpm android` (from `apps/mobile`, auto-builds a dev client
if one doesn't exist) / `pnpm web` (via `react-native-web`, no native modules involved).

## Building a standalone Android APK (`apps/mobile`)

`npx expo run:android` (above) builds and installs onto an emulator/device in one step, but
doesn't leave you a standalone `.apk` file. To produce one, run these in order:

```bash
# 1. From the repo root — installs deps with the pnpm hoisting this build needs (see note below)
pnpm install

# 2. Regenerate the native android/ project from app.json + assets (skip if android/ already exists)
cd apps/mobile
npx expo prebuild --platform android

# 3. Build the debug variant
cd android
./gradlew assembleDebug

# 4. Build the release variant — as its OWN separate command, not combined with step 3 (see note below)
./gradlew assembleRelease
```

Each command produces **four `.apk` files, one per CPU architecture**, not one combined
file:

| Variant | Output location |
| --- | --- |
| Debug | `android/app/build/outputs/apk/debug/app-<abi>-debug.apk` |
| Release | `android/app/build/outputs/apk/release/app-<abi>-release.apk` |

`<abi>` is one of `armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`. **`arm64-v8a` is the one to
install on a real device** — virtually every Android phone from the last several years uses
it. `armeabi-v7a` is for older 32-bit devices; `x86`/`x86_64` are only for Intel-based
emulators (an Apple Silicon Mac's emulator is `arm64-v8a` too).

Notes / gotchas, if something above doesn't behave as expected:

- **Don't combine steps 3 and 4 into one `./gradlew assembleDebug assembleRelease` call** —
  that spawns two concurrent Metro bundler subprocesses that race each other and can fail
  with an obscure `Cannot read properties of undefined (reading 'transformFile')` error. Two
  separate `gradlew` invocations avoids it.
- **The debug APK is not self-contained.** This project's debug build type doesn't embed a
  JS bundle (`bundleInDebug` isn't set), so it loads JS from a Metro dev server (`npx expo
  start`) at runtime instead — installing it alone gets you a red-box connection error. The
  release APK *is* self-contained (JS bundled, minified, resources shrunk) — that's the one
  to hand someone for standalone testing.
- **Release signing** falls back to the same auto-generated debug keystore as the debug
  build (`android/app/build.gradle`'s `release` block) — there's no dedicated release
  keystore configured. Fine for internal testing; **not** fine for actual Play Store
  distribution, which needs a real release keystore set up separately first.
- **Step 1 (`pnpm install`) is load-bearing, not just habit.** This repo's
  `pnpm-workspace.yaml` sets `shamefullyHoist: true` — without it, `assembleRelease`'s
  JS-bundling step fails to resolve certain babel plugins
  (`react-native-worklets/plugin`, `@babel/plugin-transform-react-jsx`) that Metro's
  Hermes-bytecode sourcemap composition step re-resolves from a different internal context
  than the rest of the toolchain uses — under pnpm's default strict, symlinked
  `node_modules` layout, those plugins aren't reachable from that context even though they
  resolve fine everywhere else. If this ever regresses, the symptom is `assembleRelease`
  failing with a `MODULE_NOT_FOUND` buried under `TypeError: Cannot read properties of
  undefined (reading 'transformFile')` — the fix is confirming `shamefullyHoist: true` is
  still in `pnpm-workspace.yaml` and re-running `pnpm install`. `assembleDebug` is unaffected
  (it never bundles JS in this project).

## Running `apps/web-react` wrapped in Capacitor (Android emulator, side-by-side comparison)

A second way to see the web app on Android — useful for direct perf/behavior comparisons
against `apps/mobile` (this is how the two were compared during the mobile migration's
storage-engine investigation), **not** the primary mobile path (that's `apps/mobile`
above). Wraps the built `apps/web-react` bundle in a native Android shell via
[Capacitor](https://capacitorjs.com/).

**Status: dormant, not currently installed.** `apps/web-react/capacitor.config.ts` exists
(moved there from the repo root — it only ever wraps this one app's build, never
`apps/mobile`), but the `@capacitor/*` packages aren't currently in any `package.json` —
they were last used ad hoc and need reinstalling fresh, from **`apps/web-react/`**:

```bash
cd apps/web-react
npm install --save @capacitor/core @capacitor/android   # or pnpm add
npm install --save-dev @capacitor/cli
pnpm build                           # builds this app, output at ./dist
npx cap add android                  # creates the native android/ project, copies dist/ in
npx cap open android                 # opens it in Android Studio — wait for Gradle sync
```

The rebuild loop after a code change (from `apps/web-react/`): `pnpm build && npx cap sync
android`, then re-run from Android Studio or `cd android && ./gradlew assembleDebug`.

The `android/` folder itself is git-ignored (generated, like `dist/`) — regenerate it with
the commands above on a fresh clone. Full step-by-step (AVD creation, terminal-only flow,
keyboard setup, troubleshooting table, the Phase-2 storage-persistence to-do) lives in
[`docs/ANDROID_EMULATOR.md`](docs/ANDROID_EMULATOR.md).

## Running the Workers

Each worker under `workers/` is independent (own `package.json`, own lockfile, own
`README.md` with local-dev/deploy instructions) and deliberately excluded from the pnpm
workspace. Start with [`workers/api-proxy/README.md`](workers/api-proxy/README.md),
[`workers/auth/README.md`](workers/auth/README.md), or
[`workers/groups/README.md`](workers/groups/README.md) depending on which you're touching.
See [`docs/EXTERNAL_APIS.md`](docs/EXTERNAL_APIS.md) for what each worker proxies and why,
and [`docs/BACKEND_STRATEGY.md`](docs/BACKEND_STRATEGY.md) for the architecture behind them.

---

## Architecture rules (enforced by ESLint)

- `@anthropic-ai/sdk` may only be imported from `packages/core/src/core/ai-safety/anthropicClient.ts`
- `dexie` may only be imported from `packages/core/src/core/db/`
- Feature modules (`apps/*/src/features/`) must not cross-import — only from `core/`,
  `components/`, `context/`, `hooks/`, `lib/`
- `no-console` is a warning — never log PII
- Never disable these rules with `eslint-disable` comments

Platform-suffixed files (`.native.ts`/`.web.ts`) must only contain logic that's genuinely
platform-different — any literal (URL, storage key, event name, cache TTL) needed
identically by multiple variants belongs in an unsuffixed sibling `*.constants.ts` file,
imported by all of them, never copy-pasted independently. See `docs/ARCHITECTURE.md`'s
platform-variance-minimization principle.

## The encryption boundary

**Never access Dexie tables directly from feature code.** Always go through
`EncryptedRepository<T>` in `packages/core/src/core/db/repository.ts`:

```ts
// Correct
const repo = new EncryptedRepository(db.expenses, ['amount', 'merchant', 'notes']);
const expenses = await repo.getAll();

// Wrong — bypasses encryption
const expenses = await db.expenses.toArray();
```

The Master Key (DMK) lives in memory only, non-extractable, cleared on session expiry. See
`docs/TSD.md` for the full envelope-encryption model.

## The PII boundary

**`buildUserContext()` is the only path from raw data to the Anthropic API.** It strips
all PII before assembling the payload. See `docs/PRIVACY.md` for the full list of what
gets stripped, banded, or generalised. The CI gate
(`packages/core/tests/pii-gate/piiGate.test.ts`) fails the build if any PII escapes —
never skip or weaken it.

## Scripts (from the repo root)

| Script | What it does |
| --- | --- |
| `pnpm dev` | Start `apps/web-react`'s Vite dev server |
| `pnpm build` | `tsc -b` (repo-wide) + `apps/web-react`'s Vite build |
| `pnpm lint` | ESLint across `packages/*/src apps/*/src` |
| `pnpm lint:fix` | ESLint auto-fix |
| `pnpm format` | Prettier write |
| `pnpm format:check` | Prettier check (used in CI) |
| `pnpm type-check` | `tsc -b` |
| `pnpm test` | `packages/core` tests + `apps/web-react` tests + workers tests |
| `pnpm test:workers` | Just the workers' own test suite |

`apps/mobile` currently has no dedicated test suite of its own — logic it depends on lives
in `packages/core` and is tested there.

## Pre-commit gates — all must pass before every commit

```bash
pnpm format:check
pnpm lint
pnpm test
```

Fix failures before committing. Never use `--no-verify` or suppress lint with
`eslint-disable`.

## Branch rules

- Every milestone or track gets its own branch cut from `main`: `feat/<milestone-slug>`
- Never commit milestone work directly to `main`
- Open a PR when a milestone (or all tracks within it) is complete

## Commit conventions

```
feat(scope): step X — short description
feat(scope): short description
fix(scope): short description
chore: tooling or config change
docs: documentation change
test: test additions
```

## PR rules

- **Title:** `feat(<milestone>): <milestone short name>`
- Every PR must pass CI (lint + tests) before merge
- PR description: what changed, why, and any decisions or trade-offs made

## Key documents

| File | What it covers |
| --- | --- |
| `CLAUDE.md` | Orientation for Claude Code sessions — identity, non-negotiable rules, reference table |
| `CONTRIBUTING.md` | This file — setup, branching, commits, CI, PR rules |
| `docs/README.md` | Documentation index — navigate all docs from here |
| `docs/BRD.md` | Product vision, users, competitive positioning |
| `docs/ARCHITECTURE.md` | Codebase map (dirs, components, hooks) + architectural decision log |
| `docs/SCHEMA.md` | All Dexie stores with field definitions |
| `docs/EXTERNAL_APIS.md` | Registry of every external API Penny calls |
| `docs/PRIVACY.md` | PII definitions, anonymisation rules, privacy architecture |
| `docs/ROADMAP.md` | Shipped history, decided/in-progress phases, future ideas |
| `docs/MOBILE_PARITY.md` | Current per-module `apps/mobile` vs `apps/web-react` parity status |
| `docs/features/` | Per-feature documentation — what's built, data model, planned improvements |
| `.claude/commands/penny-standards.md` | Best-practices rules, loaded at the start of every implementation session |
| `.claude/skills/parity-sweep/` | The methodology for auditing mobile against web for parity gaps |
| `.claude/agents/` | Specialized subagents (mobile-developer, web-developer, parity-auditor, code-reviewer, test-writer) |
