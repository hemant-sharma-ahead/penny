import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';
import {
  connect,
  getBackupState,
  runNow,
  setTarget,
  start,
  stop,
  subscribeBackupState,
  type BackupEngineState
} from './backupEngine';
import type { BackupTarget } from './decide';

interface BackupContextValue extends BackupEngineState {
  runNow: () => Promise<void>;
  setTarget: (target: BackupTarget) => Promise<void>;
  connect: () => Promise<void>;
}

const BackupContext = createContext<BackupContextValue | null>(null);

/**
 * RN counterpart to SyncProvider.tsx. Web re-runs the engine on the DOM `online` event and on tab
 * `visibilitychange`; RN has neither, so this re-runs on `AppState` returning to `'active'` (the
 * foreground-return trigger) instead — `backupEngine`'s own `online()` check already treats
 * connectivity as true whenever `navigator.onLine` is unavailable (the case on RN), so there's no
 * separate connectivity listener to port.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribeBackupState, getBackupState, getBackupState);

  useEffect(() => {
    start();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void runNow();
    });
    return () => {
      sub.remove();
      stop();
    };
  }, []);

  return <BackupContext.Provider value={{ ...state, runNow, setTarget, connect }}>{children}</BackupContext.Provider>;
}

export function useBackupStatus(): BackupContextValue {
  const ctx = useContext(BackupContext);
  if (!ctx) throw new Error('useBackupStatus must be used within SyncProvider');
  return ctx;
}
