# Backup & Restore

## What it is

A way to export all your Penny data as a single encrypted file you control, and restore it on the same or a new device — plus **automatic backup** to your own cloud (or your device) that keeps a recent copy without you thinking about it. There is no Penny server in the loop — backups live wherever you put them (Model B).

## User-facing capabilities

Three cards, each doing one thing (consolidated from five on 2026-07-27 — see "Consolidation" below):

- **Automatic backup (Track D)** — Penny backs up on its own, on a **1/3/7/14-day frequency you choose** (`getBackupFrequencyDays()`/`setBackupFrequencyDays()`, `backupPrefs.ts`). You choose a **destination** via 3 tabs, each fully self-sufficient (own info text, own "Back up now" action, styled as a primary button since it's always a primary action):
  - **This device** — a private on-device copy kept silently in the background as a daily safety floor, **and** "Back up now" shares/downloads a `.penny` file on demand (this is where "Export backup" now lives).
  - **Google Drive** — uploads the encrypted `.penny` to your own Drive (a private app folder); "Back up now" pushes immediately through the sync engine. A real colored Drive mark (`BackupProviderLogo.tsx`'s `DriveLogo`) identifies the tab instead of a flat monochrome icon, and its "Active" pill/buttons are tinted `DRIVE_BLUE`.
  - **iCloud** — native-app only, still dormant (no Capacitor bridge yet). Identified by `BackupProviderLogo.tsx`'s `AppleLogo`.
    A status line shows the last backup **with date and time** (`formatDateTime`, not just the day), "syncing", "paused (offline)", "storage full", "reconnect", or (2026-08-18) **"this backup needs a manual restore"** — see below. (2026-08-29) A second caption line shows **when the next automatic backup is expected** — `Next backup · {date}`, or a warning-colored `due now — runs the next time you open the app` once the configured frequency window has elapsed with nothing yet run (there's no background task; automatic backup only runs while the app is open — see "How it works"). Shown for both This device (fixed 1-day window) and Drive (your configured frequency); hidden when there's no backup yet or Drive's auto-backup toggle is off. Added after a real report where "not yet due" read as indistinguishable from "stuck" — automatic pushes are gated purely by this rolling window from the last backup's own timestamp, not a calendar-day reset, and deliberately ignore same-session activity so the frequency setting stays meaningful.
- **Restore from backup** — pick a `.penny` file (or, once Drive is configured, restore straight from the latest Drive backup), enter your passphrase, and replace the current data. The session re-locks afterwards — **unlock with the PIN that was active when the backup was created**, not necessarily this device's current one (that's expected: the wrapped key material comes from the backup as-is). Any stale lockout/attempt-counter state from the source device is reset on restore so it can't block that correct PIN — only the counters are reset, never the key-wrapping material itself. If the restore button seems permanently disabled, it's waiting on the passphrase field above it — a helper text under the button now says so.
- **Restore / reclaim without a file** — a lost or reinstalled device can come back through onboarding: **Restore** re-imports a backup (full recovery incl. data), while **Reclaim** recovers just your **identity + group membership** from your username + passphrase (no personal data without a backup). See the Onboarding doc.
- **Reset Penny** — erases everything on the device and returns to onboarding. For a **claimed** account it first **deregisters from the server** (releasing your username) while the keys are still present; if that call fails (offline / server error) it **warns instead of silently wiping** ("Couldn't release your username" — the `orphanWarnUser` dialog) so you can retry online before orphaning the handle. Irreversible unless you have a backup (no key escrow).
- **Backup history (2026-08-24, `apps/mobile` only)** — This device and Google Drive each now keep the **last 20 backups**, not just the latest one. Tapping either panel's "Last backup: <date>" caption (now a real tappable row) opens that destination's own history popup: a reverse-chronological list showing each entry's date/time, size, and whether it was an automatic or manual backup, with Download and Delete actions shown directly on the row (not a hidden swipe gesture — see "How it works" for why). iCloud is untouched (still dormant).

## Consolidation (2026-07-27)

Originally 5 cards: Automatic backup, Export backup, Restore from backup, Back up to Google Drive, Reset Penny. "Export backup" and "Back up to Google Drive" each duplicated a capability the Automatic Backup tabs already had (This device / Drive), just as a separate always-visible card — several small bugs in that area (a disabled-but-unexplained Drive tab, a silent no-op "Backup Now") turned out to be symptoms of that duplication rather than independent issues. Collapsed to 3 cards; see `docs/DESIGN_GUIDELINES.md` §1 "One capability, one control" and `.claude/skills/ui-design-check/SKILL.md` for the general principle this incident is now documented under.

## How it works

The backup bundle is encrypted with the **Data Master Key (DMK)**; the file header (v2 format) carries the DMK **wrapped by your passphrase**, so restore re-derives the passphrase key, unwraps the DMK, and decrypts. Older **v1** files (from the pre-envelope model) still restore. Nothing is decryptable without the passphrase — not by Google, not by us.

Automatic backup (Track D) reuses that same encrypted blob. A **provider abstraction** treats Google Drive, iCloud, and on-device storage interchangeably; a background **engine** re-exports and uploads shortly after changes (debounced) and at least daily, and periodically **pulls + merges** other devices' changes (non-destructive last-write-wins via `mergeBundle`). Multi-device sync works between devices that share the same key (reached via a passphrase restore); a brand-new device still restores via passphrase. iCloud is only reachable in the native app, so it's shown but inactive on the web.

**Restore vs. this device's current PIN.** `importBackup()` restores the `security` store (PIN/passphrase-wrapped key material) wholesale from the backup — by design, since that's what lets the file be restorable on any device with the right passphrase. But the backup's `security` row also carries the _attempt counters and lockout timestamps_ from whatever device/moment it was exported at; restoring those unmodified could re-impose a stale lockout (or even a mid-lockout state) that blocks the otherwise-correct original PIN on the new device. `importBackup()` now resets `pinAttempts`/`lockedUntil`/`passphraseAttempts`/`passphraseLockedUntil` to fresh defaults as part of the restore, while leaving `encryptedMasterKey`/`kekSalt` (the actual wrapped key) untouched — found 2026-07-27 as "no PIN worked after restore" on mobile.

**"This backup belongs to another account" fixed (2026-08-18, real-device-testing pass).** The auto-backup
engine's `runNow()` gained a distinct `BackupStatus` value, `'foreign_blob'` (`backupEngine.ts`), for the
case where this device's vault key doesn't yet match the key an existing Google Drive backup was
encrypted with — normal after a reinstall or a new device, not a real account problem. Previously this
surfaced as a generic, confusing "belongs to another account" error banner with no path forward.
`AutoBackupCard.tsx` now shows a dedicated banner explaining the real cause plus a **"Restore with my
passphrase"** CTA; `BackupPage.tsx` implements the CTA as a same-page scroll-and-focus into the Restore
card's passphrase field (`focusRestorePassphrase`, `measureLayout` against the scroll view — same
pattern `ExpenseForm.tsx`'s `focusPanel` already uses). Separately, `googleDriveProvider.native.ts`'s
`getAccessToken()` used to let `GoogleSignin.getTokens()` reject unguarded — on some devices/states that
surfaced to the user as a toast literally reading "undefined"; it's now wrapped in a try/catch that
throws a real, readable `Error`.

**Two severe restore bugs fixed, found via a real "can't restore any backup" report (real-device-testing pass).**

- **Missing `await` on `File.write()`.** `expo-file-system`'s `File.write()` is async
  (`Promise<void>`); six call sites wrote a file and, without awaiting that write, immediately
  read/shared/deleted the same file — a real race that could hand the next step a still-writing,
  truncated file. Fixed in `AutoBackupCard.tsx` (manual "This device" export), `localBackup.native.ts`
  (the silent daily on-device snapshot), `exportCsv.native.ts` (both plain CSV and the
  password-protected ZIP), `PlannerResults.tsx`/`RetirementCard.tsx` (XLSX export), and
  `UnparsedMessagesPage.tsx` (SMS export).
- **`BACKUP_STORES` had silently drifted behind `schema.ts`.** Eight real encrypted Dexie stores —
  `accounts`, `activity_log`, `merchant_memory`, `transaction_templates`,
  `bank_cash_withdrawal_codes`, and all three SMS-tracking tables (`sms_transactions`,
  `sms_account_mappings`, `sms_excluded_senders`) — were never in the list a backup actually walks, so
  no backup file ever included them. `accounts` was the severe one: every `Expense.accountId`
  references it, so restoring onto a wiped/new device brought back every transaction with zero
  accounts for them to belong to. All 8 added to `backupManager.ts`'s `BACKUP_STORES` — no file-format
  change, older backup files simply have nothing to restore for these (already handled by the existing
  `if (rows?.length)` guard).

**Automatic push now actually honors the configured frequency (real-device-testing pass).** `runNow()`'s
cloud branch previously pushed on every single data change whenever `decision.push` was true and
auto-backup was enabled — the 1/3/7/14-day frequency control only ever governed the *pull* side, so an
active user's device pushed to Drive far more often than the setting implied. Fixed to
`const push = manual ? decision.push : dueDaily && getAutoBackupEnabled();` — an automatic push now
only fires once the configured day boundary (`dueDaily`) has passed; manual "Back up now" is
unaffected and still pushes immediately on demand.

**Settings-initiated restore now also re-claims device identity.** `BackupPage.tsx`'s two restore
success paths (`handleImport()`, `handleCloudRestore()`) previously never set the `RECONCILE_FLAG` that
`IdentityReconciler` (see the Onboarding doc) checks to re-run `claimAccount()` after a restore — the
onboarding restore path already did this, but a device restored through **Settings** (not onboarding)
kept a stale/mismatched device registration, and the Groups worker's `device.revoked` check on
`/register` legitimately rejected it as "unknown or revoked device" the next time it tried a Groups
action. Both `BackupPage.tsx` success paths now call `await setItem(RECONCILE_FLAG, '1')` right before
their existing `notifyAuthShouldRecheck()` call, matching what onboarding already did. A device already
stuck in this state needs one more restore after the fix to actually heal.

**Overriding the `foreign_blob` state without a restore.** The banner above only ever offered
"Restore with my passphrase" — no way to say "keep this device's current data, stop offering me that
old Drive backup." `runNow()`'s cycle always attempts a pull first while `foreign_blob` is active, which
throws before a push ever gets a chance to run, so there was genuinely no path to a fresh push other
than resolving the state via restore. New `overwriteRemoteWithLocal()` (`backupEngine.ts`) skips the
pull entirely and force-pushes this device's current export, exposed through the native `SyncProvider`
and surfaced as a destructive, confirm-gated **"Overwrite Drive with this device's data instead"**
button in `AutoBackupCard.tsx`'s banner (mockup: `docs/mockups/proposals/drive-foreign-blob-override-v1.html`).

**Backup history — from one fixed file to a rolling 20-entry log (2026-08-24, `apps/mobile` only).**
Before this, both This device and Google Drive kept exactly **one** backup — Drive always `PATCH`ed the
same fixed `penny-backup.penny` file, local wrote one file per calendar day and pruned to the newest 7 —
so there was never a real "history" to show, and no way to recover from an accidental delete/overwrite
beyond whatever happened to still be there.

- **Naming/retention.** A new shared `backupNaming.ts` (`packages/core/src/core/sync/providers/`) defines
  one timestamped filename shape both destinations now use — `penny-backup-<epochMs>-<auto|manual>.penny`
  — and a shared `BACKUP_HISTORY_KEEP = 20` cap. Every push now creates a **new** file (Drive: always
  `POST`s, never `PATCH`es an existing one) instead of overwriting; each provider prunes to the newest 20
  right after a successful push. Drive additionally tags each file's own `properties.trigger` field
  (authoritative there); local has no metadata field, so its filename's trailing segment is authoritative
  instead.
- **Backward compatibility.** A pre-existing single legacy file (Drive's old fixed `penny-backup.penny`,
  local's old `penny-YYYY-MM-DD.penny`) is recognized on read as one ordinary history entry — timestamp
  inferred from its modified time/file mtime, trigger defaulted to `'manual'` — and ages out naturally
  through the normal 20-cap prune. No separate migration step; this is a self-healing read path.
  `CloudProvider`'s new `list()`/`delete()`/`downloadEntry()` members are optional on the interface
  specifically so the frozen `apps/web-react`-only `googleDriveProvider.ts` and the still-dormant
  `icloudProvider.ts` compile unchanged — neither was touched.
  `remoteTag()`/`pull()`/`latestLocalSnapshot()` now resolve the newest of many entries instead of
  assuming the one file that used to exist; restore still always means "the latest," unchanged.
- **UI (`BackupHistoryModal.tsx`, `apps/mobile/src/features/backup/`).** One shared modal, opened via a
  `destination: 'local' | 'drive'` prop from either `AutoBackupCard.tsx` panel. Each row originally
  revealed Download/Delete via a hidden swipe gesture (matching `TransactionsTab.tsx`'s `SwipeableRow`
  convention) — changed the same day, after real-device testing, to always-visible small icon buttons
  (the same `variant="ghost"` square-`Button` convention `AccountList.tsx`'s revealed action row already
  uses) instead, a deliberate one-off departure from the swipe convention: this is a rarely-opened
  history list, not the main transaction feed, so favoring discoverability over the swipe convention's
  density win is the right trade here. Delete is confirm-gated (`ConfirmDialog`); Download shares the raw
  `.penny` file via a new shared `shareBackupFile.ts` helper (also now used by `AutoBackupCard.tsx`'s own
  "This device" export, which previously only shared the file without also recording it into its own
  history — fixed alongside this, otherwise a manual local backup would never have shown up in its own
  history popup).
- Mockup: `docs/mockups/proposals/backup-history-v1.html` (the swipe-vs-static-icon row change above was
  implemented directly, without a v2 mockup update, per an explicit small-change call).

**Passphrase-based recovery (no file).** Beyond restoring a backup file, the passphrase is now also a **reclaim credential**. `securityManager.initialize()` derives an Ed25519 keypair from the passphrase + a random salt and stores the salt + public half as a **recovery verifier** in the security record; `claimAccount` uploads it. `reclaimAccount()` (`src/core/identity/`) later re-derives that keypair from the passphrase to prove ownership of the handle and bind a fresh device — recovering **identity + group membership only** (no personal data — the server can't decrypt anything). So: **restore** = full recovery including data; **reclaim** = identity + groups, then a backup restore (or a co-member re-share) fills in the data.

Key files:

- `src/core/backup/backupManager.ts` — `exportBackup()` / `importBackup()` (incl. `resetLockoutState()`) + `mergeBundle()` / `openBundleWithDmk()` (background merge)
- `src/core/sync/` — `backupEngine.ts` (auto-backup engine; `overwriteRemoteWithLocal()` force-pushes past a `foreign_blob` state without a pull), `decide.ts` (pure logic), `SyncProvider.tsx` / `useBackupStatus`, `providers/` (`googleDriveProvider` + `.native.ts`/`.web.ts` + shared `googleDriveProvider.constants.ts`, dormant `icloudProvider`, `localBackup` + `.native.ts`, shared `backupNaming.ts` for the timestamped-filename/20-entry-retention scheme both history-tracked destinations use)
- `src/core/backup/cloudBackup.ts` — thin manual-backup adapter over the Drive provider, `isCloudBackupConfigured()`
- `src/core/identity/` — `claim.ts` (`deregisterAccount` on erase, `reclaimAccount`, `claimAccount`) + `recovery.ts` (passphrase-derived recovery keypair)
- `src/features/backup/BackupPage.tsx` + `AutoBackupCard.tsx` — the UI (3 cards: auto-backup chooser + status/export/backup-now per tab, restore incl. Drive, reset with deregister-first + orphan warning); mobile-only `~/components/shared/BackupProviderLogo.tsx` (`DriveLogo`, `AppleLogo`, `DRIVE_BLUE`) renders the real colored provider marks used in the destination tabs
- `src/core/crypto/securityManager.ts` — `wipeAllData()` (full reset), `getRecoveryVerifier()`

**Mobile (`apps/mobile`):** ported alongside the rest of Track 4's remaining-modules pass, then upgraded 2026-07-27 to real native Google Drive + real on-device backup (previously both were honest no-ops — see below). RN Web (`expo start --web`) needed its own further branch for export/restore, since `expo-file-system`'s web build is a no-op stub (`new File(...)` throws `"this.validatePath is not a function"` there) — export falls back to a plain Blob-URL `<a download>` (same as web-react) on that target, and restore reads the picked file via `expo-document-picker`'s own web build (which hands back a real browser `File` at `asset.file`) instead of touching `expo-file-system` at all.

**Native Google Drive (real, since 2026-07-27):** `googleDriveProvider.native.ts` uses `@react-native-google-signin/google-signin` (chosen over the newer Credential-Manager-based `react-native-nitro-google-signin` for its maturity — Android's legacy Sign-In SDK it wraps is deprecated but still functional) for silent-reauth-capable OAuth, then the same Drive v3 REST calls (`files.list`/`files.get`/`files.create`/`files.update` against `appDataFolder`) as the web provider — validated against how the reference app Cashew (Flutter) implements the identical `drive.appdata` + silent-reauth-and-retry pattern. `isCloudBackupConfigured()` gates on `app.json`'s `extra.googleWebClientId` (a "Web application" OAuth client from the same Google Cloud project — required by the library for offline/refresh-capable access, distinct from the Android client registered against this app's package + SHA-1). See "Enabling Google Drive backup" below — this Google Cloud Console setup is **done for Android as of 2026-08-16**; web/iOS remain unconfigured.

**Native on-device backup (real, since 2026-07-27):** `localBackup.native.ts` writes dated snapshots to `expo-file-system`'s persistent `Paths.document` directory (survives app restarts, unlike the `Paths.cache` the export/share flow deliberately uses) instead of the browser-only OPFS API web/RN-Web use — `isLocalBackupAvailable()` is unconditionally `true` on native now. This also means the daily automatic-backup floor genuinely runs on native for the first time (previously a silent no-op).

The automatic-backup engine itself runs natively via `packages/core/src/core/sync/SyncProvider.native.tsx`, which re-runs the engine on `AppState` returning to `'active'` instead of web's `online`/`visibilitychange` DOM events; `backupPrefs.native.ts` hydrates from/writes through to AsyncStorage so the chosen destination survives cold starts.

## Enabling Google Drive backup (deployment setup)

Drive backup is a **build-time, per-deployment** setting — not something an end user toggles. One Google Cloud project covers every platform; every user then signs into their **own** Google account.

**Status: done for `apps/mobile` (Android), 2026-08-16.** `apps/web-react` and iOS remain unconfigured — see the per-step notes below for what each still needs.

1. **Google Cloud Console** → create (or pick) a project. A personal Google account is fine for this — no dedicated "app" email/inbox needed. The OAuth consent screen's support/developer-contact fields can be any email you control; since the app stays in **Testing** mode (no Play Store/App Store submission planned), none of this is publicly reviewed.
2. **APIs & Services → Enable APIs** → enable the **Google Drive API**.
3. **OAuth consent screen** → External → **Testing** mode (up to 100 test users, no Google review needed) → add the `…/auth/drive.appdata` scope — this app's only scope (the hidden per-app folder, never the user's regular Drive files; see `DRIVE_SCOPE` in `googleDriveProvider.constants.ts`).
4. **Web application OAuth client** — **Credentials → Create credentials → OAuth client ID → Web application**. This is what `@react-native-google-signin/google-signin` needs (its `webClientId` config, required for offline/refresh-capable access even though the client _type_ is "Web") — set as `googleWebClientId` in `apps/mobile/app.json`'s `extra`.
   - _(For `apps/web-react`, if that's ever configured too: same client ID works, but add real **Authorized JavaScript origins**, set it as `VITE_GOOGLE_CLIENT_ID` in `.env.local`, and loosen the CSP in `index.html` — untouched by this pass, since `apps/web-react` is frozen.)_
5. **Android OAuth client** — **Credentials → Create credentials → OAuth client ID → Android**:
   - Package name: `app.json`'s `android.package` — **`com.hesh.penny`** as of 2026-08-16 (renamed from the Expo-scaffolded `com.anonymous.penny`; see "Package rename" below).
   - SHA-1 fingerprint: from the debug keystore — `keytool -list -v -keystore apps/mobile/android/app/debug.keystore -alias androiddebugkey -storepass android -keypass android`. This keystore is now **committed** (see below) specifically so this fingerprint never silently changes across machines/rebuilds.
   - No app-code config needed for this client — Google Play Services matches the app's signature + package to it automatically; only the Web client ID above is read in code.
   - A **release** build needs its own release-keystore SHA-1 registered too, as a separate step before ever shipping a signed release through this path — not done yet (debug-only so far).
6. **iOS** — deliberately **not set up** (2026-08-16 decision: no Mac/Xcode in place yet, focus on Android first). `app.json`'s `ios.bundleIdentifier` is already set (`com.hesh.penny`, same string as Android, ready for whenever this happens), but there's no iOS OAuth client yet, and `googleDriveProvider.native.ts`'s `GoogleSignin.configure()` doesn't pass `iosClientId` yet — both are needed before Drive backup works on a real iOS build.
7. **Rebuild.** Native: a full `expo prebuild` + `expo run:android` is required (the config is baked into the compiled app at build time, same as any other `app.json` `extra`/`android.package` change) — a JS reload is not enough.

### Package rename (`com.anonymous.penny` → `com.hesh.penny`, 2026-08-16)

Done as part of this same setup pass, not a separate change. `com.anonymous.penny` was just Expo's scaffolded placeholder (no real `owner`/EAS project was ever configured) — never a deliberate choice, and worth fixing before it became permanent: this was the last realistic moment to rename it for free, since the app had **not yet been published to Play Store** — a rename after publishing means losing every install/review and re-launching as a brand-new app, since a Play Store package name is permanent once live. Chosen to match the existing `*.hesh.workers.dev` Cloudflare Workers naming.

Two things worth remembering if a rename like this happens again:

- **The debug keystore must survive it.** A package/bundle-id change needs `expo prebuild --clean -p android` to fully regenerate the native project (an incremental, non-`--clean` prebuild can leave stale files from the old package's directory structure behind) — but `--clean` wipes the entire `android/` folder first, including the debug keystore. **Back the keystore file up before running `--clean`, copy it back in afterward, and re-verify its SHA-1 is unchanged** — otherwise the Android OAuth client above ends up registered against a fingerprint that no longer exists, silently breaking sign-in again.
- **Grep for hardcoded references to the old package name** in docs/scripts, not just app code — found and fixed in `CONTRIBUTING.md`'s "reset app state"/"force relaunch" `adb` command examples, which would otherwise silently target a package that no longer exists.

> The Drive code path is fully implemented on web, native (Android), and RN Web — **real end-to-end setup now done for Android** as of 2026-08-16 (Web OAuth client + Android OAuth client + package rename, all above). iOS and `apps/web-react` remain unconfigured. The manual `.penny` export/import works regardless, with no Google Cloud setup needed at all.

## Current limitations

- **iCloud is dormant until the native app** — the provider is built, but iCloud is unreachable from the web PWA, so it's shown-but-disabled until the Capacitor shell lands. No iOS Google Drive setup exists yet either (see above) — deliberately deferred, not blocked.
- **Android Google Drive is configured but not yet confirmed working end-to-end** (2026-08-16) — real Cloud Console setup is in place and a fresh debug build installs/launches cleanly under the renamed `com.hesh.penny` package, but the actual Drive sign-in flow itself still needs a manual on-device confirmation (per this project's own rule against automated UI verification).
- `apps/web-react`'s Google Drive OAuth is unconfigured (`VITE_GOOGLE_CLIENT_ID` unset) — untouched since that app is frozen.
- No **release**-keystore SHA-1 is registered yet — only the debug keystore's, so Drive sign-in would break on a signed release build until that's added as its own Google Cloud Console step.
- Manual **restore** replaces all data; automatic pulls merge (LWW) but can't observe remote deletes (whole-blob).
- Cloud sync still has no server-side compare-and-swap: a rare simultaneous multi-device push now lands
  as two separate history entries (rather than one silently clobbering the other, as the old single-file
  model did) but "restore" still only ever means the newest one — there's no merge-the-two-writes path.
- Backup history is capped at 20 per destination — pruning is automatic and irreversible; there's no way to keep a specific older backup past that cap short of downloading it first.
- The passphrase is still essential — it's the only thing that decrypts a backup **and** the credential that reclaims your handle; there's no escrow or backdoor, so a truly lost passphrase means the data can't be recovered.

## Planned improvements

- **Native bring-up** to activate the iCloud provider (auto-default on Apple devices).
- iOS Google Drive OAuth client + `iosClientId`/URL-scheme config-plugin setup, once Xcode is installed.
- Release-keystore SHA-1 registration before any signed release build ships.
- Encrypted **delta** sync and Drive **etag** conditional writes if multi-device usage grows.

> Cloud backup already runs through a live `cloud_backup` entitlement (`src/core/entitlement/entitlement.ts`) — free in Phase 1, but the single switch to make it a paid feature later, without touching backup code.

## Ideas welcome

- Should we nudge users to back up after they've entered a meaningful amount of data?
- Is Google Drive the right first cloud target for India, or should Drive + a generic "download to file" cover most needs until native?
