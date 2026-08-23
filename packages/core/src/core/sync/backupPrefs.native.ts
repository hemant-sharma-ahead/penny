// RN counterpart to backupPrefs.ts. Web persists the choice synchronously in `localStorage`;
// `backupEngine.ts` calls `getBackupTarget`/`setBackupTarget` synchronously (module-load state init,
// mid-sync-cycle reads), so this keeps that same sync signature backed by an in-memory var — but now
// (Backup & Restore is ported — see `~/features/backup/`) hydrates it from AsyncStorage once at module
// load and writes through in the background on every change, so the choice survives cold starts. The
// same "in-memory var, eventually-consistent hydration" shape as `ipoClient.native.ts`; the one gap is
// the brief window before the initial hydration read resolves, where `getBackupTarget()` returns `null`
// (on-device daily floor) even if a cloud target was previously chosen — acceptable since `backupEngine`
// re-reads it on every sync cycle, not just once.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BackupTarget } from './decide';
import {
  AUTO_BACKUP_ENABLED_KEY,
  AUTO_BACKUP_FREQUENCY_DAYS_KEY,
  BACKUP_TARGET_KEY as KEY,
  DEFAULT_BACKUP_FREQUENCY_DAYS,
  clampBackupFrequencyDays
} from './backupPrefs.constants';

let target: BackupTarget = null;

function isValid(v: string | null): v is Exclude<BackupTarget, null> {
  return v === 'google-drive' || v === 'icloud' || v === 'local';
}

void AsyncStorage.getItem(KEY).then((v) => {
  if (isValid(v)) target = v;
});

export function getBackupTarget(): BackupTarget {
  return target;
}

export function setBackupTarget(t: BackupTarget): void {
  target = t;
  void (t ? AsyncStorage.setItem(KEY, t) : AsyncStorage.removeItem(KEY));
}

// Same "in-memory var, eventually-consistent AsyncStorage hydration" shape as `target` above — see its
// own comment for the brief pre-hydration window this implies (acceptable; the engine re-reads these on
// every sync cycle, not just once).
let autoBackupEnabled = true;
let backupFrequencyDays = DEFAULT_BACKUP_FREQUENCY_DAYS;

void AsyncStorage.getItem(AUTO_BACKUP_ENABLED_KEY).then((v) => {
  if (v !== null) autoBackupEnabled = v === '1';
});
void AsyncStorage.getItem(AUTO_BACKUP_FREQUENCY_DAYS_KEY).then((v) => {
  if (v !== null) backupFrequencyDays = clampBackupFrequencyDays(Number(v));
});

export function getAutoBackupEnabled(): boolean {
  return autoBackupEnabled;
}

export function setAutoBackupEnabled(enabled: boolean): void {
  autoBackupEnabled = enabled;
  void AsyncStorage.setItem(AUTO_BACKUP_ENABLED_KEY, enabled ? '1' : '0');
}

export function getBackupFrequencyDays(): number {
  return backupFrequencyDays;
}

export function setBackupFrequencyDays(days: number): void {
  backupFrequencyDays = clampBackupFrequencyDays(days);
  void AsyncStorage.setItem(AUTO_BACKUP_FREQUENCY_DAYS_KEY, String(backupFrequencyDays));
}
