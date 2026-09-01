import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
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
  runNow: (manual?: boolean) => Promise<void>;
  setTarget: (target: BackupTarget) => Promise<void>;
  connect: () => Promise<void>;
}

const BackupContext = createContext<BackupContextValue | null>(null);

/**
 * Runs the automatic backup engine for the lifetime of the unlocked session. Mounted inside AppShell
 * (which renders only post-unlock), so the engine starts on unlock and stops on lock via unmount.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribeBackupState, getBackupState, getBackupState);

  useEffect(() => {
    start();
    const onOnline = () => void runNow();
    const onVisible = () => {
      if (!document.hidden) void runNow();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
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
