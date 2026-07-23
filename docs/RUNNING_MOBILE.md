# Running `apps/mobile` (Expo)

Created in Track 1 of the [mobile migration](plans/mobile-migration.md). Updated whenever a new run mode
is introduced — currently covers Expo Go + web (Track 1 stage). **From Track 2 onward**, once
`expo-sqlite`/`react-native-quick-crypto` land, Expo Go stops working (it doesn't support these native
modules) and this doc gets an EAS development-build section added.

## Prerequisites

- Node (see `.nvmrc`) + `pnpm` (`npm install -g pnpm` if you don't have it)
- **iOS Simulator:** Xcode (from the Mac App Store), then open it once to accept the license and install
  the simulator runtime.
- **Android Emulator:** Android Studio → SDK Manager (install an SDK platform + Android Emulator package)
  → Device Manager (create an AVD, e.g. Pixel 8 / API 34).
- **Physical device (fastest to start with):** install the **Expo Go** app from the App Store / Play Store.
- From the repo root, run `pnpm install` once (sets up the whole workspace, including `apps/mobile`).

## Run it

All commands run from `apps/mobile/` (or prefix with `pnpm --filter mobile <script>` from the repo root):

```bash
cd apps/mobile
pnpm start        # prints a QR code — scan it with Expo Go on a physical device
pnpm ios          # boots the iOS Simulator (macOS + Xcode required)
pnpm android      # boots the configured Android emulator/AVD
pnpm web          # runs in a browser via react-native-web (fastest inner-loop check, no simulator needed)
```

`pnpm start` (or any of the above) starts the Metro bundler and a dev server; scanning the QR code or
picking a simulator target loads the same running JS bundle — no separate build step in this Track 1
Expo-Go stage.

## What's actually running right now (Track 1)

The AuthGuard/navigation shell only — storage and crypto are in-memory stubs (see the comment in
`src/navigation/AuthGuard.tsx`), not the real `@penny/core` security manager yet. You'll always land on
the onboarding stub screen. Real data/crypto wiring lands in Track 2.

## Troubleshooting

- **Metro can't resolve a module that's a real dependency:** pnpm's strict `node_modules` means every
  package a file imports — even indirectly via a babel transform like NativeWind's `jsxImportSource` — must
  be an explicit dependency of `apps/mobile`, not just a transitive dependency of something else. This bit
  us twice already (`react-native-css-interop`, `@tabler/icons` on the web-legacy side) — `pnpm add <pkg>`
  it explicitly rather than assuming hoisting will find it.
- **Changed `tailwind.config.js` or `global.css` and styles didn't update:** restart Metro (`pnpm start`
  with `r` to reload, or stop/restart) — NativeWind's CSS extraction runs at bundle time.
