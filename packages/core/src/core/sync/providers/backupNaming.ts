// Shared timestamped backup-entry naming scheme for both destinations that keep a rolling history —
// Google Drive's appDataFolder (googleDriveProvider.native.ts / .web.ts) and the on-device snapshot
// floor (localBackup.native.ts / localBackup.ts) — kept in exactly one place per the
// platform-variance-minimization principle (docs/ARCHITECTURE.md), since the literal
// `penny-backup-<epochMs>-<trigger>.penny` shape and the 20-entry retention cap must stay identical
// across all four provider variants. Drive additionally tags each file's own `properties.trigger`
// field (structured metadata, not just a filename convention) as the authoritative source for that one
// value there — the filename's trailing `-auto`/`-manual` segment is a human-inspectable mirror of the
// same thing and this feature's uniform naming/history-parsing story, not the primary source of truth
// on Drive specifically (local has no metadata field at all, so its filename segment IS authoritative).

export type BackupTrigger = 'auto' | 'manual';

/** Keep the newest this many backups per destination — older entries are pruned after every push
 *  (Backup History, decided scope). Supersedes the old, much smaller per-destination caps (Drive kept
 *  exactly 1; local kept the newest 7 *dated* snapshots). */
export const BACKUP_HISTORY_KEEP = 20;

/** Every history-tracked backup file (either destination) starts with this — used to scope a
 *  directory/Drive listing down to just the entries this feature manages, without touching unrelated
 *  files that might share the same folder. */
export const BACKUP_FILE_PREFIX = 'penny-backup-';

const BACKUP_FILE_RE = /^penny-backup-(\d+)-(auto|manual)\.penny$/;

/** Builds this feature's one timestamped filename shape: `penny-backup-<epochMs>-<trigger>.penny`. The
 *  epoch (not a calendar date) is what makes multiple same-day entries distinct and sortable without
 *  reading file metadata. */
export function buildBackupFileName(epochMs: number, trigger: BackupTrigger): string {
  return `${BACKUP_FILE_PREFIX}${epochMs}-${trigger}.penny`;
}

/** Parses a filename built by {@link buildBackupFileName} back into its parts, or null if it doesn't
 *  match — notably including any pre-existing pre-history file (Drive's old single fixed
 *  `penny-backup.penny`, or local's old one-per-day `penny-YYYY-MM-DD.penny`), which callers should
 *  still treat as one valid legacy entry rather than silently ignoring (see each provider's own
 *  backward-compat handling). */
export function parseBackupFileName(name: string): { timestamp: number; trigger: BackupTrigger } | null {
  const m = BACKUP_FILE_RE.exec(name);
  if (!m || !m[1] || !m[2]) return null;
  return { timestamp: Number(m[1]), trigger: m[2] as BackupTrigger };
}
