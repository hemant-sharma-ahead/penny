// RN counterpart to localBackup.ts. Web's on-device floor uses OPFS (`navigator.storage.getDirectory`),
// which doesn't exist on RN at all (found 2026-07-27: `isLocalBackupAvailable()` returned `false`
// unconditionally on every native/RN-Web build, making "This device" a silent no-op there). This uses
// expo-file-system's persistent `Paths.document` directory instead — survives app restarts and OS
// cleanup, unlike `Paths.cache` (which the export/share flow uses deliberately, since that file only
// needs to live long enough to be shared).
//
// Backup History: every save now creates its own new timestamped `penny-backup-<epochMs>-<trigger>.penny`
// entry (see `backupNaming.ts`, shared with the Drive providers) instead of one-per-day-overwriting the
// same dated file, and is kept up to BACKUP_HISTORY_KEEP total rather than 7 per-day snapshots.
import { Directory, File, Paths } from 'expo-file-system';
import type { BackupEntry } from './types';
import { BACKUP_HISTORY_KEEP, buildBackupFileName, parseBackupFileName, type BackupTrigger } from './backupNaming';

const DIR_NAME = 'backups';

/** The pre-history one-per-day filename this feature superseded (`penny-YYYY-MM-DD.penny`) — still
 *  recognized on read so a device that already has these isn't left with orphaned files the app no
 *  longer looks at. Its day-precision name has no time-of-day, so its real timestamp is read from the
 *  file's own last-modified time instead (see `fileTimestamp`), and it's treated as `'manual'` since
 *  the pre-history code never distinguished auto from manual saves. */
const LEGACY_NAME_RE = /^penny-\d{4}-\d{2}-\d{2}\.penny$/;

/** Always true on native — expo-file-system's document directory is always available, unlike OPFS on
 *  web (which can be genuinely unsupported in some browsers). */
export function isLocalBackupAvailable(): boolean {
  return true;
}

function backupsDir(): Directory {
  const dir = new Directory(Paths.document, DIR_NAME);
  dir.create({ idempotent: true });
  return dir;
}

/** Every file this feature manages — new-scheme timestamped entries plus (for backward compat) any
 *  pre-existing legacy dated snapshot. */
function backupFiles(dir: Directory): File[] {
  return dir
    .list()
    .filter(
      (entry): entry is File =>
        entry instanceof File && (parseBackupFileName(entry.name) !== null || LEGACY_NAME_RE.test(entry.name))
    );
}

function fileTimestamp(file: File): number {
  return parseBackupFileName(file.name)?.timestamp ?? file.modificationTime ?? 0;
}

function fileTrigger(file: File): BackupTrigger {
  return parseBackupFileName(file.name)?.trigger ?? 'manual';
}

/** Save a new timestamped snapshot — every call creates its own separate entry now (no more
 *  same-day-overwrites) — and prune to the newest BACKUP_HISTORY_KEEP. */
export async function saveLocalSnapshot(blob: Blob, trigger: BackupTrigger): Promise<boolean> {
  try {
    const dir = backupsDir();
    const text = await new Response(blob).text();
    const name = buildBackupFileName(Date.now(), trigger);
    const file = new File(dir, name);
    // `File.write()` is async (`Promise<void>`) — this used to fire-and-forget, racing the `dir.list()`
    // scan (and the KEEP-pruning delete loop) right below against a write that might not have landed
    // yet. Same bug, independently, as `AutoBackupCard.tsx`'s manual export — see its fix note.
    await file.write(text);

    const all = backupFiles(dir).sort((a, b) => fileTimestamp(a) - fileTimestamp(b));
    for (const stale of all.slice(0, Math.max(0, all.length - BACKUP_HISTORY_KEEP))) {
      stale.delete();
    }
    return true;
  } catch {
    return false;
  }
}

/** The most recent on-device snapshot's text (newest of potentially many now), or null if none exist. */
export async function latestLocalSnapshot(): Promise<string | null> {
  try {
    const dir = backupsDir();
    const all = backupFiles(dir).sort((a, b) => fileTimestamp(a) - fileTimestamp(b));
    const latest = all[all.length - 1];
    if (!latest) return null;
    return await latest.text();
  } catch {
    return null;
  }
}

/** Every on-device snapshot (newest first) for the Backup History UI. */
export async function listLocalSnapshots(): Promise<BackupEntry[]> {
  try {
    const dir = backupsDir();
    return backupFiles(dir)
      .map((f) => ({ id: f.name, timestamp: fileTimestamp(f), sizeBytes: f.size, trigger: fileTrigger(f) }))
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

/** Permanently deletes one on-device snapshot by id — its filename, exactly as returned by
 *  `listLocalSnapshots()`; a no-op if it's already gone. */
export async function deleteLocalSnapshot(id: string): Promise<void> {
  const file = new File(backupsDir(), id);
  if (file.exists) file.delete();
}

/** Reads one specific on-device snapshot's raw text by id (Backup History's Download action) — unlike
 *  `latestLocalSnapshot()`, this addresses a specific entry rather than always the newest. Null if it
 *  no longer exists. */
export async function readLocalSnapshot(id: string): Promise<string | null> {
  try {
    const file = new File(backupsDir(), id);
    if (!file.exists) return null;
    return await file.text();
  } catch {
    return null;
  }
}
