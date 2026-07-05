# Backup & Restore

## What it is

A way to export all your Penny data as a single encrypted file you control, and restore it on the same or a new device — plus **automatic backup** to your own cloud (or your device) that keeps a recent copy without you thinking about it. There is no Penny server in the loop — backups live wherever you put them (Model B).

## User-facing capabilities

- **Automatic backup (Track D)** — Penny backs up on its own (shortly after changes, and at least daily). You choose a **destination**: **This device** (a private on-device copy), **Google Drive**, or **iCloud** (in the native app). A status line shows the last backup, "syncing", "paused (offline)", "storage full", or "reconnect", with a manual **Back up now**. Backing up to Drive/iCloud also lets you **restore on a new phone** and **sync across your devices**; the on-device option guards against accidental changes but is lost if you clear app data or lose the device.
- **Export backup** — downloads a `.penny` file containing everything (expenses, goals, portfolio, settings, and the security record), encrypted with your passphrase.
- **Restore from backup** — pick a `.penny` file, enter your passphrase, and replace the current data. The session re-locks afterwards so you re-enter your PIN.
- **Back up to Google Drive** — uploads the same encrypted `.penny` to your own Google Drive (a private app folder). Active only when **both** the deployment has Drive configured (`isCloudBackupConfigured()`, see below) **and** the user holds the `cloud_backup` entitlement — combined into `cloudEnabled` in `BackupPage.tsx`; otherwise the option is disabled with a note to use the file export.
- **Restore / reclaim without a file** — a lost or reinstalled device can come back through onboarding: **Restore** re-imports a backup (full recovery incl. data), while **Reclaim** recovers just your **identity + group membership** from your username + passphrase (no personal data without a backup). See the Onboarding doc.
- **Reset Penny** — erases everything on the device and returns to onboarding. For a **claimed** account it first **deregisters from the server** (releasing your username) while the keys are still present; if that call fails (offline / server error) it **warns instead of silently wiping** ("Couldn't release your username" — the `orphanWarnUser` dialog) so you can retry online before orphaning the handle. Irreversible unless you have a backup (no key escrow).

## How it works

The backup bundle is encrypted with the **Data Master Key (DMK)**; the file header (v2 format) carries the DMK **wrapped by your passphrase**, so restore re-derives the passphrase key, unwraps the DMK, and decrypts. Older **v1** files (from the pre-envelope model) still restore. Nothing is decryptable without the passphrase — not by Google, not by us.

Automatic backup (Track D) reuses that same encrypted blob. A **provider abstraction** treats Google Drive, iCloud, and on-device storage interchangeably; a background **engine** re-exports and uploads shortly after changes (debounced) and at least daily, and periodically **pulls + merges** other devices' changes (non-destructive last-write-wins via `mergeBundle`). Multi-device sync works between devices that share the same key (reached via a passphrase restore); a brand-new device still restores via passphrase. iCloud is only reachable in the native app, so it's shown but inactive on the web.

**Passphrase-based recovery (no file).** Beyond restoring a backup file, the passphrase is now also a **reclaim credential**. `securityManager.initialize()` derives an Ed25519 keypair from the passphrase + a random salt and stores the salt + public half as a **recovery verifier** in the security record; `claimAccount` uploads it. `reclaimAccount()` (`src/core/identity/`) later re-derives that keypair from the passphrase to prove ownership of the handle and bind a fresh device — recovering **identity + group membership only** (no personal data — the server can't decrypt anything). So: **restore** = full recovery including data; **reclaim** = identity + groups, then a backup restore (or a co-member re-share) fills in the data.

Key files:

- `src/core/backup/backupManager.ts` — `exportBackup()` / `importBackup()` + `mergeBundle()` / `openBundleWithDmk()` (background merge)
- `src/core/sync/` — `backupEngine.ts` (auto-backup engine), `decide.ts` (pure logic), `SyncProvider.tsx` / `useBackupStatus`, `providers/` (`googleDriveProvider`, dormant `icloudProvider`, `localBackup` OPFS)
- `src/core/backup/cloudBackup.ts` — thin manual-backup adapter over the Drive provider, `isCloudBackupConfigured()`
- `src/core/identity/` — `claim.ts` (`deregisterAccount` on erase, `reclaimAccount`, `claimAccount`) + `recovery.ts` (passphrase-derived recovery keypair)
- `src/features/backup/BackupPage.tsx` + `AutoBackupCard.tsx` — the UI (auto-backup chooser + status, export, restore, cloud, reset with deregister-first + orphan warning)
- `src/core/crypto/securityManager.ts` — `wipeAllData()` (full reset), `getRecoveryVerifier()`

## Enabling Google Drive backup (deployment setup)

Drive backup is a **build-time, per-deployment** setting — not something an end user toggles. One OAuth client ID is registered for the app's origin; every user then signs into their **own** Google account. The client ID is public by design (origin-restricted), so it's safe to bake into the bundle.

1. **Google Cloud Console** → create (or pick) a project.
2. **APIs & Services → Enable APIs** → enable the **Google Drive API**.
3. **OAuth consent screen** → configure it; add the `…/auth/drive.appdata` scope; add test users (or publish).
4. **Credentials → Create credentials → OAuth client ID → Web application** → under **Authorized JavaScript origins** add your app origin(s) (e.g. `http://localhost:5173` for dev, your production URL). Copy the client ID.
5. **Set the env var** — copy `.env.example` to `.env.local` and set:
   ```
   VITE_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   ```
6. **Loosen the CSP** in `index.html` to allow Google:
   ```
   script-src  … https://accounts.google.com
   connect-src … https://www.googleapis.com https://accounts.google.com
   ```
7. **Rebuild** (`npm run build`). The "Back up to Google Drive" buttons now activate; each user authorizes their own Drive on first use.

> The Drive code path is implemented but untested until a real client ID + CSP are in place. The manual `.penny` export/import works regardless.

## Current limitations

- **iCloud is dormant until the native app** — the provider is built, but iCloud is unreachable from the web PWA, so it's shown-but-disabled until the Capacitor shell lands.
- Manual **restore** replaces all data; automatic pulls merge (LWW) but can't observe remote deletes (whole-blob).
- Cloud sync uses a single overwrite file (no server-side compare-and-swap): a rare simultaneous multi-device write converges on the next sync rather than instantly.
- The passphrase is still essential — it's the only thing that decrypts a backup **and** the credential that reclaims your handle; there's no escrow or backdoor, so a truly lost passphrase means the data can't be recovered.

## Planned improvements

- **Native bring-up** to activate the iCloud provider (auto-default on Apple devices).
- Encrypted **delta** sync and Drive **etag** conditional writes if multi-device usage grows.

> Cloud backup already runs through a live `cloud_backup` entitlement (`src/core/entitlement/entitlement.ts`) — free in Phase 1, but the single switch to make it a paid feature later, without touching backup code.

## Ideas welcome

- Should we nudge users to back up after they've entered a meaningful amount of data?
- Is Google Drive the right first cloud target for India, or should Drive + a generic "download to file" cover most needs until native?
