# Backup & Restore

## What it is

A way to export all your Penny data as a single encrypted file you control, and restore it on the same or a new device. Optionally, the same encrypted file can be synced to your own Google Drive. There is no Penny server in the loop — backups live wherever you put them.

## User-facing capabilities

- **Export backup** — downloads a `.penny` file containing everything (expenses, goals, portfolio, settings, and the security record), encrypted with your passphrase.
- **Restore from backup** — pick a `.penny` file, enter your passphrase, and replace the current data. The session re-locks afterwards so you re-enter your PIN.
- **Back up to Google Drive** — uploads the same encrypted `.penny` to your own Google Drive (a private app folder). Shown only when the deployment has Drive configured (see below); otherwise the option is disabled with a note to use the file export.
- **Reset Penny** — erases everything on the device and returns to onboarding. Irreversible unless you have a backup (no key escrow).

## How it works

The backup bundle is encrypted with the **Data Master Key (DMK)**; the file header (v2 format) carries the DMK **wrapped by your passphrase**, so restore re-derives the passphrase key, unwraps the DMK, and decrypts. Older **v1** files (from the pre-envelope model) still restore. Nothing is decryptable without the passphrase — not by Google, not by us.

Key files:

- `src/core/backup/backupManager.ts` — `exportBackup()` / `importBackup()` (file format, encrypt/decrypt, bulk restore)
- `src/core/backup/cloudBackup.ts` — Google Drive provider (GIS + Drive REST `appDataFolder`), `isCloudBackupConfigured()`
- `src/features/backup/BackupPage.tsx` — the UI (export, restore, cloud, reset)
- `src/core/crypto/securityManager.ts` — `wipeAllData()` (full reset)

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

- No automatic/scheduled backups — export and Drive upload are manual.
- No iCloud (native only — Phase 2).
- Restore replaces all data; there is no selective/merge restore.
- A lost passphrase means a backup cannot be decrypted — by design (no escrow).

## Planned improvements

- Phase 1.5+: behind-the-entitlement-gate option to make cloud backup a paid feature (the gate already exists in `core/entitlement`).
- Phase 2: iCloud backup on native apps; optional scheduled auto-backup.

## Ideas welcome

- Should we nudge users to back up after they've entered a meaningful amount of data?
- Is Google Drive the right first cloud target for India, or should Drive + a generic "download to file" cover most needs until native?
