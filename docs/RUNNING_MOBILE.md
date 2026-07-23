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
   third-party native module. Expo Go only ships with a fixed set of pre-bundled native modules (mostly
   first-party `expo-*` packages) — it cannot load a custom native module like this one at all, on any SDK
   version. `expo-sqlite` (also added in Track 2) is a first-party module and likely *would* work in Expo
   Go, but quick-crypto never will.

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
were plugged in. An Android emulator (AVD, created in Android Studio's Device Manager) is another way to
avoid USB entirely, at the cost of testing on a simulator instead of real hardware.

### Option B — Cloud build via EAS (`eas build`)

Uploads the project to Expo's cloud build service, which compiles it and gives you an installable link
(and a QR code) — no local Android Studio/Xcode toolchain required on this machine. Requires signing up
for a free account at [expo.dev](https://expo.dev) and running `eas login` once; your source code is sent
to Expo's build servers to compile (if that's a concern, use Option A instead — it never leaves your machine).

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

## What's actually running right now (Track 2)

`AuthGuard` calls the real `@penny/core` security manager, backed by the `expo-sqlite` adapter and the
`react-native-quick-crypto` polyfill (see `docs/plans/mobile-migration.md`'s Track 2 entry). No onboarding
UI exists yet (that's Track 4), so you'll land on the onboarding stub screen — but the check itself is
now real, not an in-memory stub.

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
