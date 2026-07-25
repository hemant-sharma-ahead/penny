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

const KEY = 'penny_backup_target';

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
