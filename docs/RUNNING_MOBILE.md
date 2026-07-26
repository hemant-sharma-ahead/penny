# Running `apps/mobile` (Expo)

Created in Track 1 of the [mobile migration](plans/mobile-migration.md), updated in Track 2. **Expo Go no
longer works for this project** (see below) — you need a development build.

## Prerequisites

- Node (see `.nvmrc`) + `pnpm` (`npm install -g pnpm` if you don't have it)
- **iOS Simulator:** Xcode (from the Mac App Store), then open it once to accept the license and install
  the simulator runtime.
- **Android Emulator:** Android Studio → SDK Manager (install an SDK platform + Android Emulator package)
  → Device Manager (create an AVD, e.g. Pixel 8 / API 34).
- From the repo root, run `pnpm install` once (sets up the whole workspace, including `apps/mobile`).
- A free [expo.dev](https://expo.dev) account, **only if** you pick the EAS cloud build path below.

## Why Expo Go stopped working (Track 2)

Two separate reasons, both permanent — there's no Expo Go version that will fix this:

1. **SDK version drift.** This project is on Expo SDK 57; the publicly released Expo Go app trails the
   newest SDK by a bit (currently supports up to SDK 54), so you'll see `Project is incompatible with this
   version of Expo Go` even on the latest Expo Go.
2. **The real reason, independent of SDK version:** Track 2 added `react-native-quick-crypto`, a
   third-party native module, and the storage layer now uses `@op-engineering/op-sqlite` (see below) —
   Expo Go only ships with a fixed set of pre-bundled native modules (mostly first-party `expo-*`
   packages) — it cannot load a custom native module like either of these at all, on any SDK version.

**The fix is always the same from here on: build a development build** (your own custom Expo Go
equivalent, with this project's native modules baked in) instead of using the generic Expo Go app.

## Building and running a development build

Two ways to get one — pick based on your setup:

### Option A — Local build (`npx expo run:android` / `run:ios`)

Builds natively on this machine and installs straight onto a connected device or a running
emulator/simulator. Free, no Expo account needed, keeps everything on your machine.

```bash
cd apps/mobile
npx expo run:android   # requires Android Studio + Android SDK installed locally; device via USB debugging
                        # (or a network-connected device — see "wireless debugging" below) or an AVD
npx expo run:ios        # requires Xcode; iOS Simulator or a USB/Wi-Fi-paired device
```

The first build compiles the native project from scratch and can take several minutes; subsequent runs
are much faster (JS-only changes just reload). Requires the native Android/iOS toolchain to actually work
on your machine — this is the thing most likely to need troubleshooting.

**No USB cable available?** Android supports wireless debugging without a cable (Android 11+): on the
device, enable Developer Options → Wireless debugging, then pair it (`adb pair <ip>:<port>`) and connect
(`adb connect <ip>:<port>`) before running `npx expo run:android` — the device shows up the same as if it
were plugged in. In practice this needs mDNS/Bonjour discovery to work between the two devices over Wi-Fi,
which some corporate/managed networks block at the router or via endpoint firewall software — if `adb pair`
fails with a `protocol fault` and retrying with a fresh pairing code doesn't help, that's usually a network
policy issue outside your control, not something wrong with the setup steps.

**Android-only fallback that needs neither USB nor wireless pairing:** `npx expo run:android` targeting the
*emulator* still produces a real installable `.apk` file locally (in
`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` once the native Android project has been
generated). That file can be copied to a physical phone by any means — email, a cloud drive, AirDrop-
equivalent, USB mass storage without debugging mode — and installed directly by opening it (the device just
needs "install unknown apps" allowed for whichever app you used to transfer it). This sidesteps `adb`
entirely. There's no iOS equivalent: a Simulator build is compiled for the simulator's architecture only and
isn't signed for real hardware, so it can never be installed on a physical iPhone — a real-device iOS build
needs either a USB/Wi-Fi-connected device via Xcode, or EAS with proper Apple Developer provisioning.

### Option B — Cloud build via EAS (`eas build`)

Uploads the project to Expo's cloud build service, which compiles it and gives you an installable link
(and a QR code) — no local Android Studio/Xcode toolchain required on this machine, and no adb/network
pairing with your own device at all (you download and install the finished build directly on the phone's
browser). Requires signing up for a free account at [expo.dev](https://expo.dev) and running `eas login`
once.

**What actually gets uploaded, mechanically:** `eas build` tars up the project's working tree (source code,
`package.json`, `app.json`, assets — roughly the scope of what's git-tracked, respecting `.gitignore`/an
optional `.easignore`) and sends it to Expo's build servers. It does **not** upload `node_modules`
(reinstalled fresh on their build machine) or git history. A build machine (Linux for Android, macOS for
iOS) in Expo's infrastructure runs the native compile (Gradle/Xcode) and produces the APK/IPA; Expo retains
the source snapshot, build logs, and output binary for some limited retention window as part of running the
service — comparable to any CI provider (GitHub Actions, Vercel, etc.) seeing your source during a build.

**Cost:** free tier exists (free expo.dev account, no payment info needed), with free builds queued behind
paid customers (slower) and capped at some number of builds/month. Exact current limits change over time —
check [expo.dev/pricing](https://expo.dev/pricing) rather than relying on a number here.

**Does this affect Penny's privacy model? No.** This is worth being precise about, since Penny's whole
identity is "we never see your data": EAS Build only ever sees the **app's source code** (this repo's
TypeScript) — never any **end user's actual data**. Penny's privacy promise (client-side-only encryption,
zero personal data reaching a backend, Model B) describes what happens when a real user runs the *finished*
app on *their* phone — their expenses, their DMK, their encrypted records. EAS Build happens entirely
before any of that exists: it's compiling an empty app shell with zero user accounts and zero data on it.
Nothing about the crypto architecture changes based on how the binary was compiled. The one adjacent
consideration — unrelated to EAS specifically — is to never let real secrets (API keys, signing
certificates) sit in source that gets bundled into a client app, since anything in a compiled client bundle
is technically extractable by anyone with the APK/IPA regardless of build method; nothing like that exists
in `apps/mobile` yet (no real backend integration has landed for mobile — that's Track 5).

**If you want zero cloud upload no matter what:** self-host the equivalent build instead of using Expo's
service. Expo's tooling is built on open-source steps (`expo prebuild` + Gradle/Xcode/Fastlane) you can run
in your own CI (e.g. a GitHub Actions macOS runner for iOS) — more setup work, but keeps everything on
infrastructure you control.

```bash
cd apps/mobile
npx eas login                                    # one-time
npx eas build --profile development --platform android   # or --platform ios
```

This takes several minutes (queued on Expo's infrastructure). When it finishes, the CLI prints a URL/QR
code — open it on the device to download and install the build directly (Android: installs like any APK;
iOS: needs the device registered with your Apple Developer account first, via `eas device:create`).

### After either option

Once the development build is installed on the device/emulator, start Metro as usual:

```bash
cd apps/mobile
pnpm start
```

The dev build's app icon (not Expo Go) opens and connects to this Metro server automatically, or scan the
QR code it prints from within the dev build's own scanner.

## Other run modes (still work as before)

```bash
pnpm ios          # boots the iOS Simulator — Xcode auto-builds a dev client if one doesn't exist yet
pnpm android      # boots the configured Android emulator/AVD — same auto-build behavior
pnpm web          # runs in a browser via react-native-web — no native modules involved, no dev build needed
```

## What's actually running right now

Track 4 (all modules, including real onboarding) is complete — `AuthGuard` calls the real `@penny/core`
security manager (backed by `@op-engineering/op-sqlite` + `react-native-quick-crypto` — the storage
adapter went `expo-sqlite` → `react-native-mmkv` → `@op-engineering/op-sqlite`, all on 2026-07-26, see
`docs/plans/mobile-migration.md` for the full history and why each swap happened), and a real 13-screen
onboarding flow sets the Data Master Key on-device via a real UI, not a stub. See
`docs/plans/mobile-migration.md` for full track-by-track status and the current "▶ Resume here" open
items.

## No system Java on this machine — `JAVA_HOME` for local Gradle builds

`npx expo run:android` (and any other command that invokes Gradle directly) fails with
`Unable to locate a Java Runtime` if run bare on a machine with no system-wide JDK install — only Android
Studio's own bundled JBR exists. Point `JAVA_HOME` at it for any command that runs a native build:

```bash
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" npx expo run:android
```

Same for `npx expo start` if you want the terminal to also be able to build/reinstall on demand.

## Hot reload vs. a full native rebuild — know which one you need

Once a development build is installed and Metro is running (`npx expo start`, from `apps/mobile`), **JS/TS
changes hot-reload automatically** via Fast Refresh — no rebuild needed, just save the file. A **full
native rebuild** (`npx expo run:android` / `run:ios` again) is required instead whenever:

- A new native dependency is added (anything needing `pnpm install` + native autolinking — e.g.
  `@react-native-community/slider`, `expo-document-picker`, `react-native-view-shot`, etc.).
- `metro.config.js` changes — Metro reads its config once at server startup; even a JS-only config edit
  (e.g. the `resolver.platforms` fix in the 2026-07-25 progress-log entry) needs the Metro process
  restarted, not just a Fast Refresh.
- Android/iOS native project files under `apps/mobile/android/`/`apps/mobile/ios/` change directly.

If you save a JS/TS file and nothing happens in the running app, check the terminal running Metro first —
it prints a line for every bundle rebuild; if it's silent, the app has likely lost its dev-server
connection (`Cannot connect to Expo CLI` in `adb logcat`) and needs a manual reload (shake menu → Reload,
or press `r` twice in the Metro terminal).

## Troubleshooting

- **`Project is incompatible with this version of Expo Go`, or Expo Go can't find the native module:**
  see "Why Expo Go stopped working" above — build a development build instead, you're not missing a step.
- **Metro can't resolve a module that's a real dependency:** pnpm's strict `node_modules` means every
  package a file imports — even indirectly via a babel transform like NativeWind's `jsxImportSource` — must
  be an explicit dependency of `apps/mobile`, not just a transitive dependency of something else. This bit
  us a few times already (`react-native-css-interop`, `@tabler/icons` on the web-legacy side) — `pnpm add
  <pkg>` it explicitly rather than assuming hoisting will find it.
- **Changed `tailwind.config.js` or `global.css` and styles didn't update:** restart Metro (`pnpm start`
  with `r` to reload, or stop/restart) — NativeWind's CSS extraction runs at bundle time.
- **`Unable to locate a Java Runtime` running `expo run:android`/`run:ios`:** see "No system Java on this
  machine" above.
- **`[runtime not ready]: Invariant Violation: TurboModuleRegistry.getEnforcing(...): '<Module>' could not
  be found`:** the JS bundle expects a native module that isn't linked into the currently-installed APK —
  always a rebuild issue (see "Hot reload vs. a full native rebuild" above), never something Fast Refresh
  can fix. Usually caused by a `pnpm install` that added/shifted a native dependency after the last native
  build. Fix: `npx expo run:android` (or `run:ios`) again. If the same module is still missing after a
  rebuild, the dependency likely isn't being autolinked at all (check it's a direct — not just nested
  transitive — dependency of `apps/mobile`, same as the plain Metro-resolution issue above) and needs
  real investigation, not another rebuild attempt.
- **RN-web (`pnpm web`/`expo start --web`) crashes on something reading `import.meta.env`:** a
  `packages/core` file is missing its `.web.ts` platform-specific sibling (see the 2026-07-25 "RN-web
  platform gap" progress-log entry in `docs/plans/mobile-migration.md`) — check `apps/mobile/metro.config.js`
  actually includes `'web'` in `resolver.platforms` (Expo's default config omits it) before assuming a new
  `.web.ts` file is the fix; either gap produces the identical crash.
