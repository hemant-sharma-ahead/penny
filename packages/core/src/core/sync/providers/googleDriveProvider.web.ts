// Metro-web counterpart to googleDriveProvider.ts (apps/mobile's react-native-web / `expo start --web`
// target). Metro's platform resolution only picks `.native.ts` for iOS/Android, not the `web` target,
// so without this file Metro falls through to the bare `googleDriveProvider.ts` — whose `clientId()`
// reads Vite's `import.meta.env.VITE_GOOGLE_CLIENT_ID`, a global Metro never defines (crashes as soon
// as `AutoBackupCard` renders and calls `isAvailable()`). Otherwise this uses the same Google Identity
// Services token flow as the base file — RN Web is a real browser DOM (script tags, `window.google`,
// `fetch`, `FormData`, `Blob` all work exactly the same), only the config source differs: `app.json`'s
// `extra.googleWebClientId` (same key `googleDriveProvider.native.ts` reads), not a `VITE_*` env var.
// Backup History (added after the above): this file's Drive REST calls now mirror
// `googleDriveProvider.native.ts`'s timestamped-multi-entry scheme, not the base (frozen,
// web-react-only) file's single-fixed-file PATCH — see `backupNaming.ts` and this file's `push()`/
// `list()`/`delete()`/`downloadEntry()` below.
import Constants from 'expo-constants';
import type { BackupEntry, CloudProvider } from './types';
import { NeedsConsentError, QuotaExceededError } from './types';
import {
  DRIVE_SCOPE as SCOPE,
  DRIVE_BACKUP_FILE_NAME as LEGACY_FILE_NAME,
  describeDriveError
} from './googleDriveProvider.constants';
import { BACKUP_FILE_PREFIX, BACKUP_HISTORY_KEEP, buildBackupFileName, parseBackupFileName } from './backupNaming';
import type { BackupTrigger } from './backupNaming';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

function clientId(): string | undefined {
  return Constants.expoConfig?.extra?.googleWebClientId as string | undefined;
}

export function isCloudBackupConfigured(): boolean {
  const id = clientId();
  return typeof id === 'string' && id.length > 0;
}

/** See googleDriveProvider.ts's identical stub for why RN Web (like plain web) has no persistent
 *  signed-in-user object to read here — only googleDriveProvider.native.ts's real device build does. */
export interface DriveAccountInfo {
  email: string;
  name: string | null;
  photoUrl: string | null;
}

export function getConnectedGoogleAccount(): DriveAccountInfo | null {
  return null;
}

export async function disconnectGoogleAccount(): Promise<void> {
  // No persistent session to sign out of on this platform — see DriveAccountInfo's doc comment above.
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function gis(): any {
  return (globalThis as { google?: any }).google;
}

function loadGis(): Promise<void> {
  if (gis()?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google sign-in')));
      return;
    }
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google sign-in'));
    document.head.appendChild(s);
  });
}

/** Acquire an access token. `interactive:false` attempts a silent grant (prompt:'none') and rejects
 *  with NeedsConsentError if the user must re-consent — so background sync never pops a surprise UI. */
async function getAccessToken(interactive: boolean): Promise<string> {
  const id = clientId();
  if (!id) throw new Error('Google Drive backup is not configured');
  await loadGis();
  return new Promise<string>((resolve, reject) => {
    const tokenClient = gis().accounts.oauth2.initTokenClient({
      client_id: id,
      scope: SCOPE,
      callback: (resp: { access_token?: string; error?: string }) => {
        if (resp.access_token) resolve(resp.access_token);
        else reject(new NeedsConsentError('google-drive'));
      },
      error_callback: () => reject(new NeedsConsentError('google-drive'))
    });
    tokenClient.requestAccessToken({ prompt: interactive ? '' : 'none' });
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
    const token = await getAccessToken(false);
    return (await findNewestBackupFile(token))?.tag ?? null;
  },

  async pull(): Promise<{ text: string; tag: string } | null> {
    const token = await getAccessToken(false);
    const meta = await findNewestBackupFile(token);
    if (!meta) return null;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${meta.id}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Download from Google Drive failed (${await describeDriveError(res)})`);
    return { text: await res.text(), tag: meta.tag };
  },

  async push(blob: Blob, trigger: BackupTrigger = 'manual'): Promise<{ tag: string }> {
    const token = await getAccessToken(false);
    const name = buildBackupFileName(Date.now(), trigger);
    const metadata = { name, parents: ['appDataFolder'], properties: { trigger } };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,headRevisionId,modifiedTime',
      { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
    );
    if (!res.ok) {
      if (await isQuotaError(res)) throw new QuotaExceededError('google-drive');
      throw new Error(`Upload to Google Drive failed (${await describeDriveError(res)})`);
    }
    const saved = (await res.json()) as { id: string; headRevisionId?: string; modifiedTime?: string };
    await pruneOldBackups(token);
    return { tag: saved.headRevisionId ?? saved.modifiedTime ?? saved.id };
  },

  async list(): Promise<BackupEntry[]> {
    const token = await getAccessToken(false);
    return (await listRaw(token)).map(toBackupEntry).sort((a, b) => b.timestamp - a.timestamp);
  },

  async delete(entryId: string): Promise<void> {
    const token = await getAccessToken(false);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${entryId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    // 404 → already gone (e.g. a double-tap raced itself) — not a real failure from the caller's PoV.
    if (!res.ok && res.status !== 404) {
      throw new Error(`Could not delete backup from Google Drive (${await describeDriveError(res)})`);
    }
  },

  async downloadEntry(entryId: string): Promise<string> {
    const token = await getAccessToken(false);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${entryId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Download from Google Drive failed (${await describeDriveError(res)})`);
    return res.text();
  }
};
