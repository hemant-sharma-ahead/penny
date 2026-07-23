// The user's chosen backup destination, persisted in localStorage (like other device-local settings).
// Source of truth for both the engine (non-React) and the UI. null = not chosen → on-device daily floor.
import type { BackupTarget } from './decide';

const KEY = 'penny_backup_target';

export function getBackupTarget(): BackupTarget {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  return v === 'google-drive' || v === 'icloud' || v === 'local' ? v : null;
}

export function setBackupTarget(target: BackupTarget): void {
  if (typeof localStorage === 'undefined') return;
  if (target) localStorage.setItem(KEY, target);
  else localStorage.removeItem(KEY);
}
