// On-device daily backup fallback (used when the user hasn't chosen a cloud target). Writes dated
// .penny snapshots to the Origin Private File System (OPFS) and keeps the newest few. This guards
// against accidental in-app changes but is same-origin — it's lost if the user clears app data or
// loses the device, so the UI recommends a cloud target for real recovery. No cross-device sync.

const DIR = 'backups';
const KEEP = 7;

export function isLocalBackupAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}

async function backupsDir(): Promise<FileSystemDirectoryHandle | null> {
  if (!isLocalBackupAvailable()) return null;
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR, { create: true });
}

async function snapshotNames(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  for await (const key of dir.keys()) {
    if (key.endsWith('.penny')) names.push(key);
  }
  return names.sort(); // dated `penny-YYYY-MM-DD.penny` names sort chronologically
}

/** Save a dated snapshot (one per day; same-day re-saves overwrite) and prune to the newest KEEP. */
export async function saveLocalSnapshot(blob: Blob): Promise<boolean> {
  const dir = await backupsDir();
  if (!dir) return false;
  const name = `penny-${new Date().toISOString().slice(0, 10)}.penny`;
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();

  const all = await snapshotNames(dir);
  for (const stale of all.slice(0, Math.max(0, all.length - KEEP))) {
    await dir.removeEntry(stale);
  }
  return true;
}

/** The most recent on-device snapshot's text, or null if none / OPFS unavailable. */
export async function latestLocalSnapshot(): Promise<string | null> {
  const dir = await backupsDir();
  if (!dir) return null;
  const all = await snapshotNames(dir);
  const latest = all[all.length - 1];
  if (!latest) return null;
  const handle = await dir.getFileHandle(latest);
  return (await handle.getFile()).text();
}
