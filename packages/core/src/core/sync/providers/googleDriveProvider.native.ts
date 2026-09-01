// Native (RN, true device/emulator — not RN Web) Google Drive backup/sync provider. RN port of
// googleDriveProvider.ts: same Model B (the user's own Drive appDataFolder — neither Google nor
// Penny's servers can read the encrypted blob), same Drive v3 REST endpoints, same CloudProvider shape
// the sync engine (backupEngine.ts) already drives generically — only token acquisition differs, since
// there's no browser/GIS script to load here.
//
// ── GATED ── inert until `extra.googleWebClientId` is set in app.json (an OAuth "Web application"
// client ID from the same Google Cloud project as the Android/iOS client — required by
// @react-native-google-signin/google-signin for offline/refresh-capable access, not a bug in reading
// the "wrong" client type). Until then isAvailable() is false and the UI stays disabled, exactly like
// the web gate on VITE_GOOGLE_CLIENT_ID. See docs/EXTERNAL_APIS.md for the full Google Cloud Console
// setup this needs (project, OAuth consent screen, Android OAuth client keyed to this app's package +
// SHA-1, this web client id).
//
// Backup History (added after the above): every push now creates its own new, timestamped,
// separately-addressable file (never PATCHes an existing one) with a `properties.trigger` tag, and this
// provider additionally supports `list()`/`delete()`/`downloadEntry()` for the History UI — a real
// behavioral divergence from the base (frozen, web-react-only) `googleDriveProvider.ts`, which still
// keeps exactly one fixed-name file. See `backupNaming.ts` for the shared naming/parsing scheme this
// and `localBackup.native.ts` both use, and `googleDriveProvider.constants.ts`'s
// `DRIVE_BACKUP_FILE_NAME` doc comment for how a pre-existing single legacy file is treated.
import Constants from 'expo-constants';
import {
  GoogleSignin,
  isNoSavedCredentialFoundResponse,
  type SignInSilentlyResponse
} from '@react-native-google-signin/google-signin';
import type { BackupEntry, CloudProvider } from './types';
import { NeedsConsentError, QuotaExceededError } from './types';
import {
  DRIVE_SCOPE as SCOPE,
  DRIVE_BACKUP_FILE_NAME as LEGACY_FILE_NAME,
  describeDriveError
} from './googleDriveProvider.constants';
import { BACKUP_FILE_PREFIX, BACKUP_HISTORY_KEEP, buildBackupFileName, parseBackupFileName } from './backupNaming';
import type { BackupTrigger } from './backupNaming';

function webClientId(): string | undefined {
  return Constants.expoConfig?.extra?.googleWebClientId as string | undefined;
}

export function isCloudBackupConfigured(): boolean {
  const id = webClientId();
  return typeof id === 'string' && id.length > 0;
}

/** The signed-in Google account's identity, for the Drive row's account-hero display (Backup &
 *  Restore redesign, Option B) — email + display name + profile photo, exactly what
 *  `GoogleSignin.getCurrentUser()`'s cached `User` object already carries (no new native field). */
export interface DriveAccountInfo {
  email: string;
  name: string | null;
  photoUrl: string | null;
}

/** Synchronous — reads the module's own cached signed-in user, no network round-trip. Null if nothing
 *  is signed in (not yet connected, or after `disconnectGoogleAccount`). */
export function getConnectedGoogleAccount(): DriveAccountInfo | null {
  const current = GoogleSignin.getCurrentUser();
  if (!current) return null;
  return { email: current.user.email, name: current.user.name, photoUrl: current.user.photo };
}

/** Signs out of the native Google Sign-In session. Does not touch anything already backed up in
 *  Drive — just this device's connection to the account. The caller (AutoBackupCard's "Disconnect")
 *  is responsible for deciding what backup destination to fall back to afterward. */
export async function disconnectGoogleAccount(): Promise<void> {
  await GoogleSignin.signOut();
}

let configured = false;
function ensureConfigured(id: string): void {
  if (configured) return;
  GoogleSignin.configure({ webClientId: id, scopes: [SCOPE] });
  configured = true;
}

const NO_SAVED_CREDENTIAL: SignInSilentlyResponse = { type: 'noSavedCredentialFound', data: null };

/** Acquire an access token. `interactive:false` only ever attempts a silent reauth (never pops native
 *  Sign-In UI) and throws NeedsConsentError if there's no usable saved credential — so background sync
 *  never surprises the user, matching the web provider's exact contract. */
async function getAccessToken(interactive: boolean): Promise<string> {
  const id = webClientId();
  if (!id) throw new Error('Google Drive backup is not configured');
  ensureConfigured(id);

  let silent: SignInSilentlyResponse;
  try {
    silent = await GoogleSignin.signInSilently();
  } catch {
    silent = NO_SAVED_CREDENTIAL;
  }

  if (isNoSavedCredentialFoundResponse(silent)) {
    if (!interactive) throw new NeedsConsentError('google-drive');
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signIn();
    } catch {
      throw new NeedsConsentError('google-drive');
    }
  }

  // Unguarded, this rejects with whatever the native bridge throws — on some devices/states that's a
  // bare native error with no readable `message` at all, which surfaced to users as a toast literally
  // reading "undefined" (found via real-device testing, 2026-08-18). Translate it into a real message
  // so the caller (backupEngine.ts) always has something legible to show.
  try {
    const { accessToken } = await GoogleSignin.getTokens();
    return accessToken;
  } catch (err) {
    throw new Error('Could not get a Google Drive access token — try signing in again.', { cause: err });
  }
}

/** Raw Drive file metadata for anything this feature might have written — new-scheme timestamped
 *  entries and (for backward compat) the pre-history legacy fixed-name file. */
interface RawBackupFile {
  id: string;
  name: string;
  size?: string;
  modifiedTime?: string;
  headRevisionId?: string;
  properties?: Record<string, string>;
}

/** Every backup-history file (or the one legacy file) in this account's appDataFolder, unsorted. */
async function listRaw(token: string): Promise<RawBackupFile[]> {
  const q = encodeURIComponent(
    `(name contains '${BACKUP_FILE_PREFIX}' or name = '${LEGACY_FILE_NAME}') and trashed = false`
  );
  const fields = encodeURIComponent('files(id,name,size,modifiedTime,headRevisionId,properties)');
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&orderBy=modifiedTime desc&fields=${fields}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 401) throw new NeedsConsentError('google-drive');
  if (!res.ok) throw new Error(`Could not read your Google Drive (${await describeDriveError(res)})`);
  const data = (await res.json()) as { files?: RawBackupFile[] };
  return data.files ?? [];
}

/** The real creation instant for a file this feature wrote (from its own filename) — falls back to
 *  Drive's `modifiedTime` only for the legacy fixed-name file, which predates that convention. */
function entryTimestamp(f: RawBackupFile): number {
  return parseBackupFileName(f.name)?.timestamp ?? (f.modifiedTime ? Date.parse(f.modifiedTime) : 0);
}

/** `properties.trigger` (this feature's own structured Drive metadata) is authoritative when present;
 *  the filename's trailing segment is the fallback for anything written before `properties` existed —
 *  the legacy file has neither, and defaults to `'manual'` (see googleDriveProvider.constants.ts). */
function entryTrigger(f: RawBackupFile): BackupTrigger {
  return (f.properties?.trigger as BackupTrigger | undefined) ?? parseBackupFileName(f.name)?.trigger ?? 'manual';
}

function toBackupEntry(f: RawBackupFile): BackupEntry {
  return { id: f.id, timestamp: entryTimestamp(f), sizeBytes: f.size ? Number(f.size) : 0, trigger: entryTrigger(f) };
}

/** The single most recent entry (by our own derived timestamp, not just Drive's `modifiedTime desc`
 *  ordering) — what `remoteTag()`/`pull()` mean by "the latest backup" now that there can be many. */
async function findNewestBackupFile(token: string): Promise<{ id: string; tag: string } | null> {
  const files = await listRaw(token);
  if (files.length === 0) return null;
  const newest = files.reduce((a, b) => (entryTimestamp(b) > entryTimestamp(a) ? b : a));
  return { id: newest.id, tag: newest.headRevisionId ?? newest.modifiedTime ?? newest.id };
}

/** Deletes every entry beyond the newest BACKUP_HISTORY_KEEP — called after every successful push.
 *  Best-effort: a prune failure shouldn't surface as a failed backup when the push itself just
 *  succeeded, so failures here are swallowed rather than thrown. */
async function pruneOldBackups(token: string): Promise<void> {
  const files = await listRaw(token);
  if (files.length <= BACKUP_HISTORY_KEEP) return;
  const stale = [...files].sort((a, b) => entryTimestamp(b) - entryTimestamp(a)).slice(BACKUP_HISTORY_KEEP);
  for (const f of stale) {
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch {
      // best-effort, see doc comment above
    }
  }
}

async function isQuotaError(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const body = (await res.clone().json()) as { error?: { errors?: { reason?: string }[] } };
    return body.error?.errors?.some((e) => e.reason === 'storageQuotaExceeded') ?? false;
  } catch {
    return false;
  }
}

/** Runs `fn` with a fresh access token; on a NeedsConsentError raised mid-request (an expired/revoked
 *  token, not a genuine missing-credential case) forces one silent reauth and retries once — access
 *  tokens expire routinely (~1h) and a background sync shouldn't fail on that alone. Mirrors the
 *  retry-after-refresh pattern reference apps (e.g. Cashew's `refreshGoogleSignIn()`) use for the same
 *  reason. */
async function withRetry<T>(fn: (token: string) => Promise<T>): Promise<T> {
  const token = await getAccessToken(false);
  try {
    return await fn(token);
  } catch (err) {
    if (!(err instanceof NeedsConsentError)) throw err;
    const retryToken = await getAccessToken(false);
    return await fn(retryToken);
  }
}

export const googleDriveProvider: CloudProvider = {
  id: 'google-drive',
  label: 'Google Drive',

  isAvailable: isCloudBackupConfigured,

  async ensureConnected(interactive: boolean): Promise<'ok' | 'needs_consent' | 'unavailable'> {
    if (!isCloudBackupConfigured()) return 'unavailable';
    try {
      await getAccessToken(interactive);
      return 'ok';
    } catch (err) {
      return err instanceof NeedsConsentError ? 'needs_consent' : 'unavailable';
    }
  },

  async remoteTag(): Promise<string | null> {
    return withRetry(async (token) => (await findNewestBackupFile(token))?.tag ?? null);
  },

  async pull(): Promise<{ text: string; tag: string } | null> {
    return withRetry(async (token) => {
      const meta = await findNewestBackupFile(token);
      if (!meta) return null;
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${meta.id}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) throw new NeedsConsentError('google-drive');
      if (!res.ok) throw new Error(`Download from Google Drive failed (${await describeDriveError(res)})`);
      return { text: await res.text(), tag: meta.tag };
    });
  },

  async push(blob: Blob, trigger: BackupTrigger = 'manual'): Promise<{ tag: string }> {
    return pushImpl(blob, trigger);
  },

  async list(): Promise<BackupEntry[]> {
    return withRetry(async (token) =>
      (await listRaw(token)).map(toBackupEntry).sort((a, b) => b.timestamp - a.timestamp)
    );
  },

  async delete(entryId: string): Promise<void> {
    return withRetry(async (token) => {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${entryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) throw new NeedsConsentError('google-drive');
      // 404 → already gone (e.g. a double-tap raced itself) — not a real failure from the caller's PoV.
      if (!res.ok && res.status !== 404) {
        throw new Error(`Could not delete backup from Google Drive (${await describeDriveError(res)})`);
      }
    });
  },

  async downloadEntry(entryId: string): Promise<string> {
    return withRetry(async (token) => {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${entryId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) throw new NeedsConsentError('google-drive');
      if (!res.ok) throw new Error(`Download from Google Drive failed (${await describeDriveError(res)})`);
      return res.text();
    });
  }
};

/** Always a fresh `POST` into `appDataFolder` — never a `PATCH` of an existing file, per the Backup
 *  History decision that every push becomes its own new, separately-addressable entry (this provider
 *  no longer has any "find the existing file" branch at all, unlike the pre-history version). Tags the
 *  file's `properties.trigger` (Drive's own arbitrary-metadata field on `files.create`, confirmed
 *  supported on `multipart` uploads the same way `metadata` already carries `name`/`parents`) so
 *  `list()` can read back auto/manual without re-deriving it from the filename. Prunes to
 *  BACKUP_HISTORY_KEEP right after a successful upload. */
async function pushImpl(blob: Blob, trigger: BackupTrigger): Promise<{ tag: string }> {
  return withRetry(async (token) => {
    const name = buildBackupFileName(Date.now(), trigger);
    const metadata = { name, parents: ['appDataFolder'], properties: { trigger } };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,headRevisionId,modifiedTime',
      { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
    );
    if (res.status === 401) throw new NeedsConsentError('google-drive');
    if (!res.ok) {
      if (await isQuotaError(res)) throw new QuotaExceededError('google-drive');
      throw new Error(`Upload to Google Drive failed (${await describeDriveError(res)})`);
    }
    const saved = (await res.json()) as { id: string; headRevisionId?: string; modifiedTime?: string };
    await pruneOldBackups(token);
    return { tag: saved.headRevisionId ?? saved.modifiedTime ?? saved.id };
  });
}
