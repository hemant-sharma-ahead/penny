import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { loadDefaultPrivacyMode, loadOpenModeDurationMinutes } from './SettingsContext';

/**
 * RN port of apps/web-legacy/src/context/PrivacyContext.tsx. Same API surface; the only platform swaps
 * are: dropped `document.body.setAttribute` (nothing on mobile reads a DOM attribute — theme already
 * flows through `ThemeProvider`), and `document.hidden`/`visibilitychange` → RN `AppState` for the
 * Open-mode auto-revert-on-backgrounding behavior. `loadDefaultPrivacyMode` is async here (AsyncStorage,
 * not synchronous `localStorage`), so `mode` starts at the safe default and hydrates in a `useEffect` —
 * it never renders a less-private state than 'safe' before that hydration completes.
 */

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
  const [mode, setModeState] = useState<PrivacyMode>('safe');
  const [openModeExpiresAt, setOpenModeExpiresAt] = useState<number | null>(null);
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRevertTimer = useCallback(() => {
    if (revertTimerRef.current) {
      clearTimeout(revertTimerRef.current);
      revertTimerRef.current = null;
    }
  }, []);

  // Reverting to the default mode is always a plain (non-open) transition, so it's pulled out as its
  // own callback rather than having the timer/AppState handlers call setMode recursively.
  const revertToDefault = useCallback(() => {
    clearRevertTimer();
    setOpenModeExpiresAt(null);
    void loadDefaultPrivacyMode().then(setModeState);
  }, [clearRevertTimer]);

  // Open mode is always temporary. Arming/disarming the auto-revert timer happens right here in
  // setMode — the only way mode ever becomes 'open' is an explicit setMode('open') call (the
  // PIN+warning switcher), since the hydrated default is only ever 'safe' or 'privacy'.
  const setMode = useCallback(
    (newMode: PrivacyMode) => {
      clearRevertTimer();
      if (newMode === 'open') {
        void loadOpenModeDurationMinutes().then((minutes) => {
          const expiresAt = Date.now() + minutes * 60 * 1000;
          setOpenModeExpiresAt(expiresAt);
          revertTimerRef.current = setTimeout(revertToDefault, expiresAt - Date.now());
        });
      } else {
        setOpenModeExpiresAt(null);
      }
      setModeState(newMode);
    },
    [clearRevertTimer, revertToDefault]
  );

  // Hydrate the persisted default once on mount.
  useEffect(() => {
    let cancelled = false;
    void loadDefaultPrivacyMode().then((defaultMode) => {
      if (!cancelled) setModeState(defaultMode);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Only clears the timer on provider unmount (in practice, never — this is a top-level provider).
  useEffect(() => clearRevertTimer, [clearRevertTimer]);

  // Revert immediately on backgrounding — don't wait for the timer. RN equivalent of web's
  // visibilitychange + document.hidden idiom.
  useEffect(() => {
    const handleAppStateChange = (next: AppStateStatus) => {
      if (next === 'background' && mode === 'open') revertToDefault();
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
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
