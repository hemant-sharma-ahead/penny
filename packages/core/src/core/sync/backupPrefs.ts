// The user's chosen backup destination, persisted in localStorage (like other device-local settings).
// Source of truth for both the engine (non-React) and the UI. null = not chosen → on-device daily floor.
import type { BackupTarget } from './decide';
import {
  AUTO_BACKUP_ENABLED_KEY,
  AUTO_BACKUP_FREQUENCY_DAYS_KEY,
  BACKUP_TARGET_KEY as KEY,
  DEFAULT_BACKUP_FREQUENCY_DAYS,
  clampBackupFrequencyDays
} from './backupPrefs.constants';

export function getBackupTarget(): BackupTarget {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  return v === 'google-drive' || v === 'icloud' || v === 'local' ? v : null;
}

export function setBackupTarget(target: BackupTarget): void {
  if (typeof localStorage === 'undefined') return;
  if (target) localStorage.setItem(KEY, target);
  else localStorage.removeItem(KEY);
}

/** Whether the engine's periodic/debounced automatic push should run at all — independent of which
 *  destination is chosen. Defaults to enabled (today's implicit always-on behavior). Does not affect a
 *  manual "Back up now" press, which always runs regardless of this setting (see backupEngine.ts's
 *  `runNow(manual)`). */
export function getAutoBackupEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const v = localStorage.getItem(AUTO_BACKUP_ENABLED_KEY);
  return v === null ? true : v === '1';
}

export function setAutoBackupEnabled(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(AUTO_BACKUP_ENABLED_KEY, enabled ? '1' : '0');
}

/** How many days may elapse between automatic cloud backups before one is due again (1–14). Defaults
 *  to the same 1-day cadence the engine always used before this was configurable. */
export function getBackupFrequencyDays(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_BACKUP_FREQUENCY_DAYS;
  const v = localStorage.getItem(AUTO_BACKUP_FREQUENCY_DAYS_KEY);
  const n = v ? Number(v) : DEFAULT_BACKUP_FREQUENCY_DAYS;
  return clampBackupFrequencyDays(n);
}

export function setBackupFrequencyDays(days: number): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(AUTO_BACKUP_FREQUENCY_DAYS_KEY, String(clampBackupFrequencyDays(days)));
}
