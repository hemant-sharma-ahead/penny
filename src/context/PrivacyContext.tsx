import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { loadDefaultPrivacyMode, loadOpenModeDurationMinutes } from '@/context/SettingsContext';

export type PrivacyMode = 'safe' | 'privacy' | 'open';

/** Open can never be a persistent starting/default state — only Safe or Privacy can. Open is only ever
 *  reached as a deliberate, temporary elevation (the PIN+warning switcher) and always auto-reverts. */
export type PersistedPrivacyMode = Exclude<PrivacyMode, 'open'>;

interface PrivacyContextValue {
  mode: PrivacyMode;
  setMode: (mode: PrivacyMode) => void;
  maskValue: (value: string | number) => string;
  /** Whether an amount should be masked right now. Open never masks; Privacy always masks;
   *  Safe masks only when `sensitive` is true — pass a category/account's `hideInSafeMode`
   *  (undefined/false = visible, the default) or a module's Safe Mode toggle. Safe's whole
   *  point is that most amounts stay visible and only the sensitive ones hide, so there is
   *  deliberately no "default to sensitive" — always pass the resolved flag explicitly. */
  shouldMask: (sensitive: boolean | undefined) => boolean;
  canUseAI: () => boolean;
  /** Epoch ms when the current Open-mode window auto-reverts, or null when mode isn't 'open'. */
  openModeExpiresAt: number | null;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<PrivacyMode>(loadDefaultPrivacyMode);
  const [openModeExpiresAt, setOpenModeExpiresAt] = useState<number | null>(null);
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRevertTimer = useCallback(() => {
    if (revertTimerRef.current) {
      clearTimeout(revertTimerRef.current);
      revertTimerRef.current = null;
    }
  }, []);

  // Reverting to the default mode is always a plain (non-open) transition, so it's pulled out as its
  // own callback rather than having the timer/visibilitychange handlers call setMode recursively —
  // that self-reference is what the react-hooks/immutability rule flags.
  const revertToDefault = useCallback(() => {
    clearRevertTimer();
    setOpenModeExpiresAt(null);
    const target = loadDefaultPrivacyMode();
    setModeState(target);
    document.body.setAttribute('data-privacy-mode', target);
  }, [clearRevertTimer]);

  // Open mode is always temporary. Arming/disarming the auto-revert timer happens right here in
  // setMode — not in a useEffect watching `mode` — because Open can never be the initial/default
  // state (loadDefaultPrivacyMode only ever returns Safe or Privacy), so the only way mode ever
  // becomes 'open' is through an explicit setMode('open') call (the PIN+warning switcher).
  const setMode = useCallback(
    (newMode: PrivacyMode) => {
      clearRevertTimer();
      if (newMode === 'open') {
        const expiresAt = Date.now() + loadOpenModeDurationMinutes() * 60 * 1000;
        setOpenModeExpiresAt(expiresAt);
        revertTimerRef.current = setTimeout(revertToDefault, expiresAt - Date.now());
      } else {
        setOpenModeExpiresAt(null);
      }
      setModeState(newMode);
      document.body.setAttribute('data-privacy-mode', newMode);
    },
    [clearRevertTimer, revertToDefault]
  );

  useEffect(() => {
    document.body.setAttribute('data-privacy-mode', mode);
  }, [mode]);

  // Only clears the timer on provider unmount (in practice, never — this is a top-level provider).
  // Deliberately NOT keyed on `mode`: that cleanup would fire on every mode change, including right
  // after setMode('open') just armed the timer, which would immediately clear it again.
  useEffect(() => clearRevertTimer, [clearRevertTimer]);

  // Revert immediately on backgrounding/device-lock — don't wait for the timer. Same
  // visibilitychange + document.hidden idiom SessionGate uses for the session background-lock.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && mode === 'open') revertToDefault();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [mode, revertToDefault]);

  const maskValue = (value: string | number): string => {
    if (mode === 'safe') return '••••';
    if (mode === 'privacy') return '••••';
    return String(value);
  };

  const shouldMask = useCallback(
    (sensitive: boolean | undefined) => {
      if (mode === 'open') return false;
      if (mode === 'privacy') return true;
      return !!sensitive;
    },
    [mode]
  );

  const canUseAI = () => mode !== 'privacy';

  return (
    <PrivacyContext.Provider value={{ mode, setMode, maskValue, shouldMask, canUseAI, openModeExpiresAt }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy(): PrivacyContextValue {
  const ctx = useContext(PrivacyContext);
  if (!ctx) throw new Error('usePrivacy must be used within PrivacyProvider');
  return ctx;
}
