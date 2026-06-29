# Running Penny on an Android Emulator (from scratch)

This guide takes you from a **fresh checkout of Penny** (no native mobile tooling) to the app running in an Android emulator launched from Android Studio. Penny is a Vite PWA; we wrap it in a native Android shell with [Capacitor](https://capacitorjs.com/), then run that shell on an Android Virtual Device (AVD).

> **Platform note:** written for macOS on Apple Silicon (arm64). Intel Macs and Linux/Windows differ only in the system-image ABI (`x86_64` instead of `arm64-v8a`) and the JDK path.

---

## What you'll end up with

- Android Studio + the Android SDK, emulator, and a virtual device
- Capacitor added to the repo (`@capacitor/*` deps, `capacitor.config.ts`, a native `android/` project)
- A debug APK at `android/app/build/outputs/apk/debug/app-debug.apk`
- Penny running in the emulator

> **Keep this isolated from feature work.** The Capacitor scaffold is infrastructure, not feature code. Do it on its own branch (e.g. `chore/capacitor-android`) and stash/commit any in-progress work first so the wrap is built from a known-good base.

---

## Prerequisites

| Tool          | Check                       | Install                                                        |
| ------------- | --------------------------- | -------------------------------------------------------------- |
| Homebrew      | `brew --version`            | https://brew.sh                                                |
| Node + npm    | `node -v` (project uses 20+)| https://nodejs.org or `brew install node`                      |
| Xcode CLT     | `xcode-select -p`           | `xcode-select --install` (provides git/build basics)           |

You do **not** need a separate JDK — Android Studio bundles one (the JetBrains Runtime, "JBR").

---

## Part 1 — Install Android Studio + SDK

### 1.1 Install Android Studio

```bash
brew install --cask android-studio
```

This drops `Android Studio.app` into `/Applications`.

### 1.2 Run the first-launch Setup Wizard (GUI)

Open Android Studio. On first launch it runs a Setup Wizard:

1. Choose **Standard** install type → **Next**.
2. Accept all license agreements → **Finish**.
3. It downloads the **Android SDK**, **platform-tools**, **build-tools**, and the **emulator** (~2–3 GB). Let it finish.

By default the SDK lands at `~/Library/Android/sdk`.

### 1.3 Set environment variables

Add to your `~/.zshrc` so the CLI tools (and Capacitor/Gradle) can find the SDK:

```bash
# Android SDK
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin"
```

Then `source ~/.zshrc` (or open a new terminal).

> Gradle also needs a JDK. Android Studio's bundled one lives at
> `/Applications/Android Studio.app/Contents/jbr/Contents/Home`.
> If you build from the terminal, export it: `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`.
> Building from inside Android Studio (recommended) handles this automatically.

---

## Part 2 — Add Capacitor to the project

Run these from the repo root (`/Users/hemant.sharma/Projects/penny`).

### 2.1 Install Capacitor

```bash
# runtime packages
npm install --save @capacitor/core @capacitor/android
# CLI (dev-only)
npm install --save-dev @capacitor/cli
```

(Penny was wrapped with Capacitor **8.4.1**.)

### 2.2 Create the Capacitor config

Create `capacitor.config.ts` in the repo root:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.penny.app',
  appName: 'Penny',
  webDir: 'dist',
  android: {
    allowMixedContent: false
  }
};

export default config;
```

- `webDir: 'dist'` points Capacitor at Vite's build output.
- `appId` is the Android package id — change it later if you register a real domain.

### 2.3 Build the web app, then add the native Android project

```bash
npm run build            # produces dist/
npx cap add android      # creates the native android/ project and copies dist/ into it
```

`cap add android` also runs an initial Gradle sync (~1 min the first time).

> **The `android/` folder is git-ignored** (treated as generated build output, like `dist/`). What's committed is the source of truth: `capacitor.config.ts` and the `@capacitor/*` deps in `package.json`. So on a **fresh clone** you must regenerate it — run the two commands above (`npm run build && npx cap add android`) before building. Native customisations (icons, splash, manifest, signing) aren't tracked while `android/` is ignored.

---

## Part 3 — Open in Android Studio

```bash
npx cap open android
```

This opens the `android/` project in Android Studio. Wait for the **Gradle sync** in the status bar to finish (first time pulls Gradle dependencies — a few minutes).

---

## Part 4 — Create a virtual device (AVD)

In Android Studio:

1. Open **Device Manager** (the phone icon in the right toolbar, or **Tools → Device Manager**).
2. Click **➕ Create Virtual Device**.
3. Pick a phone profile — **Pixel 7** is a good match for Penny's `max-w-[430px]` mobile layout → **Next**.
4. Choose a **system image**:
   - On Apple Silicon pick an **arm64-v8a** image (e.g. **API 35**, Google APIs). Click the ⬇ to download it (~1 GB) if it isn't already installed.
   - **Next**.
5. Name it (e.g. `penny_pixel`) → **Finish**.

### CLI equivalent (optional)

If you prefer the terminal, the same can be done headlessly:

```bash
# install command-line tools first if missing, then:
sdkmanager "platforms;android-35" "system-images;android-35;google_apis;arm64-v8a" "emulator"
echo "no" | avdmanager create avd -n penny_pixel \
  -k "system-images;android-35;google_apis;arm64-v8a" -d pixel_7
emulator -avd penny_pixel        # boots the emulator
```

---

## Part 5 — Run Penny

### Option A — from Android Studio (simplest)

1. Select your AVD (`penny_pixel`) in the device dropdown at the top.
2. Click the green **▶ Run** button.

Android Studio builds the APK, boots the emulator, installs the app, and launches it. You should land on Penny's **"Our privacy promise"** onboarding screen.

### Option B — from the terminal

See the next section for the full headless flow.

To sideload onto a **physical phone** instead: enable **Developer Options → USB debugging**, plug in via USB, then `adb install -r …` — or just copy the `.apk` to the phone and tap it (allow "install from unknown sources").

---

## Running entirely from the terminal (no Android Studio)

Once the AVD exists, you never have to open Android Studio again. These are the exact steps to build, boot, install, and launch from a shell.

The CLI tools don't read `~/.zshrc` automatically inside scripts, so set the env up front:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```

**1. Build the APK** (only needed after web-code changes — see the rebuild loop below):

```bash
npm run build && npx cap sync android
( cd android && ./gradlew assembleDebug )
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

**2. Boot the emulator** (leave it running in its own terminal / background):

```bash
emulator -avd penny_pixel -gpu auto -no-snapshot-save &
```

**3. Wait for full boot, then install + launch:**

```bash
APK="android/app/build/outputs/apk/debug/app-debug.apk"

adb wait-for-device
# block until Android has finished booting
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 3; done

adb install -r "$APK"
adb shell am start -n com.penny.app/.MainActivity
```

> Use `am start` (explicit activity) to launch — it's more reliable than `monkey`, which can install fine but bounce back to the launcher.

**Handy one-offs:**

```bash
adb devices                          # is an emulator/device connected?
adb shell am force-stop com.penny.app   # stop the app
adb uninstall com.penny.app          # remove it
adb emu kill                         # shut the emulator down
emulator -list-avds                  # list your AVDs
adb exec-out screencap -p > shot.png # screenshot the screen
```

---

## The rebuild loop (after you change app code)

Capacitor serves a **static copy** of `dist/`, so native rebuilds need a sync:

```bash
npm run build          # rebuild the web bundle
npx cap sync android   # copy dist/ into the native project
# then re-run from Android Studio (▶) or: cd android && ./gradlew assembleDebug && adb install -r …
```

---

## Using your laptop keyboard in the emulator

New AVDs sometimes ship with the hardware keyboard disabled, forcing the on-screen soft keyboard. To type with your Mac keyboard:

1. Quit the emulator.
2. Edit `~/.android/avd/penny_pixel.avd/config.ini` and set:
   ```ini
   hw.keyboard = yes
   ```
3. Reboot the emulator.

Now click any text field and type directly. `⌘V` pastes, `Esc` = Back, `Return` submits. You can also push text from the terminal: `adb shell input text "hello"`.

---

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| **Live market data / prices don't load** | Expected. Prices come from external APIs proxied through a Cloudflare Worker (Phase 1.5 Track A) that isn't deployed yet. All local-first features (onboarding, encryption, portfolio/expense/goal entry) work offline. See [BACKEND_STRATEGY.md](BACKEND_STRATEGY.md). |
| `adb: no devices/emulators found` | Boot the AVD first (Device Manager ▶, or `emulator -avd penny_pixel`), then `adb wait-for-device`. |
| App installs but drops back to the launcher | Launch explicitly: `adb shell am start -n com.penny.app/.MainActivity`. |
| Gradle can't find a JDK (terminal builds) | `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`, or just build from inside Android Studio. |
| `cmdline-tools` / `sdkmanager` missing | In Android Studio: **Settings → Languages & Frameworks → Android SDK → SDK Tools** → check **Android SDK Command-line Tools** → Apply. |
| Emulator boots to a blank/black screen | Give it 1–3 min on first boot; if stuck, cold boot from Device Manager (▾ → **Cold Boot Now**). |

---

## iOS

iOS native builds require **Xcode** (Mac App Store) plus `npx cap add ios`. Until then, iOS users can try Penny as a PWA: open the deployed site in Safari → **Share → Add to Home Screen**.
