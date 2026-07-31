// RN counterpart to localBackup.ts. Web's on-device floor uses OPFS (`navigator.storage.getDirectory`),
// which doesn't exist on RN at all (found 2026-07-27: `isLocalBackupAvailable()` returned `false`
// unconditionally on every native/RN-Web build, making "This device" a silent no-op there). This uses
// expo-file-system's persistent `Paths.document` directory instead — survives app restarts and OS
// cleanup, unlike `Paths.cache` (which the export/share flow uses deliberately, since that file only
// needs to live long enough to be shared). Same on-disk contract as web: dated
// `penny-YYYY-MM-DD.penny` snapshots, newest KEEP kept, one per day (same-day re-saves overwrite).
import { Directory, File, Paths } from 'expo-file-system';

const DIR_NAME = 'backups';
const KEEP = 7;

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

function snapshotFiles(dir: Directory): File[] {
  return dir
    .list()
    .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.penny'))
    .sort((a, b) => a.name.localeCompare(b.name)); // dated names sort chronologically
}

/** Save a dated snapshot (one per day; same-day re-saves overwrite) and prune to the newest KEEP. */
export async function saveLocalSnapshot(blob: Blob): Promise<boolean> {
  try {
    const dir = backupsDir();
    const text = await new Response(blob).text();
    const name = `penny-${new Date().toISOString().slice(0, 10)}.penny`;
    const file = new File(dir, name);
    file.write(text);

    const all = snapshotFiles(dir);
    for (const stale of all.slice(0, Math.max(0, all.length - KEEP))) {
      stale.delete();
    }
    return true;
  } catch {
    return false;
  }
}

/** The most recent on-device snapshot's text, or null if none exist. */
export async function latestLocalSnapshot(): Promise<string | null> {
  try {
    const dir = backupsDir();
    const all = snapshotFiles(dir);
    const latest = all[all.length - 1];
    if (!latest) return null;
    return await latest.text();
  } catch {
    return null;
  }
}
