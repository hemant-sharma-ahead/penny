// On-device backup fallback (used when the user hasn't chosen a cloud target). Writes timestamped
// .penny snapshots to the Origin Private File System (OPFS) and keeps the newest BACKUP_HISTORY_KEEP.
// This guards against accidental in-app changes but is same-origin — it's lost if the user clears app
// data or loses the device, so the UI recommends a cloud target for real recovery. No cross-device sync.
//
// Backup History: every save now creates its own new timestamped `penny-backup-<epochMs>-<trigger>.penny`
// entry (see `backupNaming.ts`, shared with the Drive providers) instead of one-per-day-overwriting the
// same dated file.
import type { BackupEntry } from './types';
import { BACKUP_HISTORY_KEEP, buildBackupFileName, parseBackupFileName, type BackupTrigger } from './backupNaming';

const DIR = 'backups';

/** The pre-history one-per-day filename this feature superseded (`penny-YYYY-MM-DD.penny`) — still
 *  recognized on read so a browser profile that already has these isn't left with orphaned files the
 *  app no longer looks at. Its day-precision name has no time-of-day, so its real timestamp is read
 *  from the file's own `lastModified` instead, and it's treated as `'manual'` since the pre-history
 *  code never distinguished auto from manual saves. */
const LEGACY_NAME_RE = /^penny-\d{4}-\d{2}-\d{2}\.penny$/;

export function isLocalBackupAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}

async function backupsDir(): Promise<FileSystemDirectoryHandle | null> {
  if (!isLocalBackupAvailable()) return null;
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR, { create: true });
}

/** Every filename this feature manages — new-scheme timestamped entries plus (for backward compat) any
 *  pre-existing legacy dated snapshot. */
async function backupFileNames(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  for await (const key of dir.keys()) {
    if (parseBackupFileName(key) !== null || LEGACY_NAME_RE.test(key)) names.push(key);
  }
  return names;
}

/** Every on-device snapshot as a full {@link BackupEntry}, unsorted — the shared read path behind both
 *  `listLocalSnapshots()` and the save path's own pruning (both need size + a resolved timestamp, which
 *  for a legacy file means actually opening it to read `lastModified`). */
async function readEntries(dir: FileSystemDirectoryHandle): Promise<BackupEntry[]> {
  const entries: BackupEntry[] = [];
  for (const name of await backupFileNames(dir)) {
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    const parsed = parseBackupFileName(name);
    entries.push({
      id: name,
      timestamp: parsed?.timestamp ?? file.lastModified,
      sizeBytes: file.size,
      trigger: parsed?.trigger ?? 'manual'
    });
  }
  return entries;
}

/** Save a new timestamped snapshot — every call creates its own separate entry now (no more
 *  same-day-overwrites) — and prune to the newest BACKUP_HISTORY_KEEP. */
export async function saveLocalSnapshot(blob: Blob, trigger: BackupTrigger): Promise<boolean> {
  const dir = await backupsDir();
  if (!dir) return false;
  const name = buildBackupFileName(Date.now(), trigger);
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();

  const all = (await readEntries(dir)).sort((a, b) => a.timestamp - b.timestamp);
  for (const stale of all.slice(0, Math.max(0, all.length - BACKUP_HISTORY_KEEP))) {
    await dir.removeEntry(stale.id);
  }
  return true;
}

/** The most recent on-device snapshot's text (newest of potentially many now), or null if none / OPFS
 *  unavailable. */
export async function latestLocalSnapshot(): Promise<string | null> {
  const dir = await backupsDir();
  if (!dir) return null;
  const all = (await readEntries(dir)).sort((a, b) => a.timestamp - b.timestamp);
  const latest = all[all.length - 1];
  if (!latest) return null;
  const handle = await dir.getFileHandle(latest.id);
  return (await handle.getFile()).text();
}

/** Every on-device snapshot (newest first) for the Backup History UI. */
export async function listLocalSnapshots(): Promise<BackupEntry[]> {
  const dir = await backupsDir();
  if (!dir) return [];
  return (await readEntries(dir)).sort((a, b) => b.timestamp - a.timestamp);
}

/** Permanently deletes one on-device snapshot by id — its filename, exactly as returned by
 *  `listLocalSnapshots()`; a no-op if it's already gone. */
export async function deleteLocalSnapshot(id: string): Promise<void> {
  const dir = await backupsDir();
  if (!dir) return;
  await dir.removeEntry(id).catch(() => {});
}

/** Reads one specific on-device snapshot's raw text by id (Backup History's Download action) — unlike
 *  `latestLocalSnapshot()`, this addresses a specific entry rather than always the newest. Null if it
 *  no longer exists / OPFS unavailable. */
export async function readLocalSnapshot(id: string): Promise<string | null> {
  const dir = await backupsDir();
  if (!dir) return null;
  try {
    const handle = await dir.getFileHandle(id);
    return await (await handle.getFile()).text();
  } catch {
    return null;
  }
}
