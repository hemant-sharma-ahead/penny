// Shared across backupPrefs.ts (web) and backupPrefs.native.ts — kept in exactly one place per the
// platform-variance-minimization principle (docs/ARCHITECTURE.md).
export const BACKUP_TARGET_KEY = 'penny_backup_target';

// Backup & Restore redesign (docs/mockups/proposals/backup-restore-redesign-v1.html, Option B) — the
// Drive row's "Automatically back up to Drive" toggle + 1–14 day frequency control. Previously had no
// backing pref at all: dueDaily in backupEngine.ts was a hardcoded 24h with no way to disable automatic
// pushes independent of the chosen destination.
export const AUTO_BACKUP_ENABLED_KEY = 'penny_backup_auto_enabled';
export const AUTO_BACKUP_FREQUENCY_DAYS_KEY = 'penny_backup_frequency_days';

/** Matches today's implicit "daily" hardcode, so an existing install's behavior doesn't change until
 *  the user actually touches the new frequency control. */
export const DEFAULT_BACKUP_FREQUENCY_DAYS = 1;
export const MIN_BACKUP_FREQUENCY_DAYS = 1;
export const MAX_BACKUP_FREQUENCY_DAYS = 14;

export function clampBackupFrequencyDays(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_BACKUP_FREQUENCY_DAYS;
  return Math.min(MAX_BACKUP_FREQUENCY_DAYS, Math.max(MIN_BACKUP_FREQUENCY_DAYS, Math.round(days)));
}
