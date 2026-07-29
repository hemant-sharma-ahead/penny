# Backup & Restore

## What it is

A way to export all your Penny data as a single encrypted file you control, and restore it on the same or a new device — plus **automatic backup** to your own cloud (or your device) that keeps a recent copy without you thinking about it. There is no Penny server in the loop — backups live wherever you put them (Model B).

## User-facing capabilities

Three cards, each doing one thing (consolidated from five on 2026-07-27 — see "Consolidation" below):

- **Automatic backup (Track D)** — Penny backs up on its own (shortly after changes, and at least daily). You choose a **destination** via 3 tabs, each fully self-sufficient (own info text, own "Back up now" action):
  - **This device** — a private on-device copy kept silently in the background as a daily safety floor, **and** "Back up now" shares/downloads a `.penny` file on demand (this is where "Export backup" now lives).
  - **Google Drive** — uploads the encrypted `.penny` to your own Drive (a private app folder); "Back up now" pushes immediately through the sync engine.
  - **iCloud** — native-app only, still dormant (no Capacitor bridge yet).
  A status line shows the last backup, "syncing", "paused (offline)", "storage full", or "reconnect".
- **Restore from backup** — pick a `.penny` file (or, once Drive is configured, restore straight from the latest Drive backup), enter your passphrase, and replace the current data. The session re-locks afterwards — **unlock with the PIN that was active when the backup was created**, not necessarily this device's current one (that's expected: the wrapped key material comes from the backup as-is). Any stale lockout/attempt-counter state from the source device is reset on restore so it can't block that correct PIN — only the counters are reset, never the key-wrapping material itself.
- **Restore / reclaim without a file** — a lost or reinstalled device can come back through onboarding: **Restore** re-imports a backup (full recovery incl. data), while **Reclaim** recovers just your **identity + group membership** from your username + passphrase (no personal data without a backup). See the Onboarding doc.
- **Reset Penny** — erases everything on the device and returns to onboarding. For a **claimed** account it first **deregisters from the server** (releasing your username) while the keys are still present; if that call fails (offline / server error) it **warns instead of silently wiping** ("Couldn't release your username" — the `orphanWarnUser` dialog) so you can retry online before orphaning the handle. Irreversible unless you have a backup (no key escrow).

## Consolidation (2026-07-27)

Originally 5 cards: Automatic backup, Export backup, Restore from backup, Back up to Google Drive, Reset Penny. "Export backup" and "Back up to Google Drive" each duplicated a capability the Automatic Backup tabs already had (This device / Drive), just as a separate always-visible card — several small bugs in that area (a disabled-but-unexplained Drive tab, a silent no-op "Backup Now") turned out to be symptoms of that duplication rather than independent issues. Collapsed to 3 cards; see `docs/DESIGN_GUIDELINES.md` §1 "One capability, one control" and `.claude/skills/ui-design-check/SKILL.md` for the general principle this incident is now documented under.

## How it works

The backup bundle is encrypted with the **Data Master Key (DMK)**; the file header (v2 format) carries the DMK **wrapped by your passphrase**, so restore re-derives the passphrase key, unwraps the DMK, and decrypts. Older **v1** files (from the pre-envelope model) still restore. Nothing is decryptable without the passphrase — not by Google, not by us.

Automatic backup (Track D) reuses that same encrypted blob. A **provider abstraction** treats Google Drive, iCloud, and on-device storage interchangeably; a background **engine** re-exports and uploads shortly after changes (debounced) and at least daily, and periodically **pulls + merges** other devices' changes (non-destructive last-write-wins via `mergeBundle`). Multi-device sync works between devices that share the same key (reached via a passphrase restore); a brand-new device still restores via passphrase. iCloud is only reachable in the native app, so it's shown but inactive on the web.

**Restore vs. this device's current PIN.** `importBackup()` restores the `security` store (PIN/passphrase-wrapped key material) wholesale from the backup — by design, since that's what lets the file be restorable on any device with the right passphrase. But the backup's `security` row also carries the *attempt counters and lockout timestamps* from whatever device/moment it was exported at; restoring those unmodified could re-impose a stale lockout (or even a mid-lockout state) that blocks the otherwise-correct original PIN on the new device. `importBackup()` now resets `pinAttempts`/`lockedUntil`/`passphraseAttempts`/`passphraseLockedUntil` to fresh defaults as part of the restore, while leaving `encryptedMasterKey`/`kekSalt` (the actual wrapped key) untouched — found 2026-07-27 as "no PIN worked after restore" on mobile.

**Passphrase-based recovery (no file).** Beyond restoring a backup file, the passphrase is now also a **reclaim credential**. `securityManager.initialize()` derives an Ed25519 keypair from the passphrase + a random salt and stores the salt + public half as a **recovery verifier** in the security record; `claimAccount` uploads it. `reclaimAccount()` (`src/core/identity/`) later re-derives that keypair from the passphrase to prove ownership of the handle and bind a fresh device — recovering **identity + group membership only** (no personal data — the server can't decrypt anything). So: **restore** = full recovery including data; **reclaim** = identity + groups, then a backup restore (or a co-member re-share) fills in the data.

Key files:

- `src/core/backup/backupManager.ts` — `exportBackup()` / `importBackup()` (incl. `resetLockoutState()`) + `mergeBundle()` / `openBundleWithDmk()` (background merge)
- `src/core/sync/` — `backupEngine.ts` (auto-backup engine), `decide.ts` (pure logic), `SyncProvider.tsx` / `useBackupStatus`, `providers/` (`googleDriveProvider` + `.native.ts`/`.web.ts` + shared `googleDriveProvider.constants.ts`, dormant `icloudProvider`, `localBackup` + `.native.ts`)
- `src/core/backup/cloudBackup.ts` — thin manual-backup adapter over the Drive provider, `isCloudBackupConfigured()`
- `src/core/identity/` — `claim.ts` (`deregisterAccount` on erase, `reclaimAccount`, `claimAccount`) + `recovery.ts` (passphrase-derived recovery keypair)
- `src/features/backup/BackupPage.tsx` + `AutoBackupCard.tsx` — the UI (3 cards: auto-backup chooser + status/export/backup-now per tab, restore incl. Drive, reset with deregister-first + orphan warning)
- `src/core/crypto/securityManager.ts` — `wipeAllData()` (full reset), `getRecoveryVerifier()`

**Mobile (`apps/mobile`):** ported alongside the rest of Track 4's remaining-modules pass, then upgraded 2026-07-27 to real native Google Drive + real on-device backup (previously both were honest no-ops — see below). RN Web (`expo start --web`) needed its own further branch for export/restore, since `expo-file-system`'s web build is a no-op stub (`new File(...)` throws `"this.validatePath is not a function"` there) — export falls back to a plain Blob-URL `<a download>` (same as web-react) on that target, and restore reads the picked file via `expo-document-picker`'s own web build (which hands back a real browser `File` at `asset.file`) instead of touching `expo-file-system` at all.

**Native Google Drive (real, since 2026-07-27):** `googleDriveProvider.native.ts` uses `@react-native-google-signin/google-signin` (chosen over the newer Credential-Manager-based `react-native-nitro-google-signin` for its maturity — Android's legacy Sign-In SDK it wraps is deprecated but still functional) for silent-reauth-capable OAuth, then the same Drive v3 REST calls (`files.list`/`files.get`/`files.create`/`files.update` against `appDataFolder`) as the web provider — validated against how the reference app Cashew (Flutter) implements the identical `drive.appdata` + silent-reauth-and-retry pattern. `isCloudBackupConfigured()` gates on `app.json`'s `extra.googleWebClientId` (a "Web application" OAuth client from the same Google Cloud project — required by the library for offline/refresh-capable access, distinct from the Android client registered against this app's package + SHA-1). See "Enabling Google Drive backup" below for the full Google Cloud Console setup, now covering both web and native.

**Native on-device backup (real, since 2026-07-27):** `localBackup.native.ts` writes dated snapshots to `expo-file-system`'s persistent `Paths.document` directory (survives app restarts, unlike the `Paths.cache` the export/share flow deliberately uses) instead of the browser-only OPFS API web/RN-Web use — `isLocalBackupAvailable()` is unconditionally `true` on native now. This also means the daily automatic-backup floor genuinely runs on native for the first time (previously a silent no-op).

The automatic-backup engine itself runs natively via `packages/core/src/core/sync/SyncProvider.native.tsx`, which re-runs the engine on `AppState` returning to `'active'` instead of web's `online`/`visibilitychange` DOM events; `backupPrefs.native.ts` hydrates from/writes through to AsyncStorage so the chosen destination survives cold starts.

## Enabling Google Drive backup (deployment setup)

Drive backup is a **build-time, per-deployment** setting — not something an end user toggles. One Google Cloud project covers both platforms; every user then signs into their **own** Google account.

1. **Google Cloud Console** → create (or pick) a project.
2. **APIs & Services → Enable APIs** → enable the **Google Drive API**.
3. **OAuth consent screen** → configure it (External is fine, testing mode supports up to 100 test users without review); add the `…/auth/drive.appdata` scope.
4. **Web (`apps/web-react` + `apps/mobile`'s offline-access token)** — **Credentials → Create credentials → OAuth client ID → Web application**:
   - For web-react: under **Authorized JavaScript origins**, add your app origin(s) (e.g. `http://localhost:5173` for dev, your production URL).
   - Set `VITE_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com` in `apps/web-react/.env.local` (copy from `.env.example`), and loosen the CSP in `index.html`:
     ```
     script-src  … https://accounts.google.com
     connect-src … https://www.googleapis.com https://accounts.google.com
     ```
   - This same Web client ID is *also* what `@react-native-google-signin/google-signin` needs (its `webClientId` config, required for offline/refresh-capable access) — set it as `googleWebClientId` in `apps/mobile/app.json`'s `extra`.
5. **Android (`apps/mobile` native)** — **Credentials → Create credentials → OAuth client ID → Android**:
   - Package name: `com.anonymous.penny` (from `app.json`'s `android.package`).
   - SHA-1 fingerprint: from your debug keystore for local dev (`keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`, or the project's own `apps/mobile/android/app/debug.keystore` if present); a **release** build needs its own release-keystore SHA-1 registered too, as a separate step before shipping.
   - No app-code config needed for this client — Google Play Services matches the app's signature + package to it automatically; only the Web client ID above is read in code.
6. **iOS** — not set up yet (no `ios/` prebuilt directory exists in this repo currently); would need its own iOS OAuth client + `iosUrlScheme` config plugin entry when iOS support is actually being built.
7. **Rebuild.** Web: `npm run build`. Native: a full `expo run:android` rebuild is required (the config is baked into the compiled app at build time, same as any other `app.json` `extra` change) — a JS reload is not enough.

> The Drive code path is fully implemented on web, native (Android), and RN Web as of 2026-07-27, but untested end-to-end until real client IDs are in place. The manual `.penny` export/import works regardless, with no Google Cloud setup needed at all.

## Current limitations

- **iCloud is dormant until the native app** — the provider is built, but iCloud is unreachable from the web PWA, so it's shown-but-disabled until the Capacitor shell lands. No iOS Google Drive setup exists yet either (see above).
- Manual **restore** replaces all data; automatic pulls merge (LWW) but can't observe remote deletes (whole-blob).
- Cloud sync uses a single overwrite file (no server-side compare-and-swap): a rare simultaneous multi-device write converges on the next sync rather than instantly.
- The passphrase is still essential — it's the only thing that decrypts a backup **and** the credential that reclaims your handle; there's no escrow or backdoor, so a truly lost passphrase means the data can't be recovered.

## Planned improvements

- **Native bring-up** to activate the iCloud provider (auto-default on Apple devices).
- iOS Google Drive OAuth client + config-plugin setup.
- Encrypted **delta** sync and Drive **etag** conditional writes if multi-device usage grows.

> Cloud backup already runs through a live `cloud_backup` entitlement (`src/core/entitlement/entitlement.ts`) — free in Phase 1, but the single switch to make it a paid feature later, without touching backup code.

## Ideas welcome

- Should we nudge users to back up after they've entered a meaningful amount of data?
- Is Google Drive the right first cloud target for India, or should Drive + a generic "download to file" cover most needs until native?
