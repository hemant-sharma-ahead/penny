import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * RN port of apps/web-react/src/context/PrivacyContext.tsx. Same API surface; the only platform swap
 * still live is `document.hidden`/`visibilitychange` → RN `AppState` for the Open-mode
 * auto-revert-on-backgrounding behavior (the `document.body.setAttribute` swap and the async
 * persisted-default hydration both went away in the same 2026-08-18 cleanup below, since neither had
 * anything left to do once Safe became the only persistable value).
 *
 * 2026-08-18: Private mode and Open mode's fixed-duration countdown were both removed (real-device
 * testing found the three-mode picker + timer overkill for what people actually used). Privacy mode is
 * now a plain Safe/Open toggle: Safe is always the default, Open is a deliberate, temporary elevation
 * (still PIN + warning gated) with no visible countdown and no fixed auto-expiry — it persists until the
 * user switches back manually, or until the app backgrounds (the `AppState` safety net below, kept as
 * an independent behavior from the removed timer). The old async "hydrate the persisted default from
 * AsyncStorage" dance (`SettingsContext.tsx`'s `loadDefaultPrivacyMode`) was removed as dead code in the
 * same pass — with only one possible persisted value left, it was a load that always resolved to the
 * exact value `mode` already starts at, doing nothing but spending a promise tick.
 */

export type PrivacyMode = 'safe' | 'open';

/** Open can never be a persistent starting/default state — only Safe can. Open is only ever reached as a
 *  deliberate, temporary elevation (the PIN+warning switcher) and always auto-reverts on backgrounding. */
export type PersistedPrivacyMode = 'safe';

interface PrivacyContextValue {
  mode: PrivacyMode;
  setMode: (mode: PrivacyMode) => void;
  maskValue: (value: string | number) => string;
  /** Whether an amount should be masked right now. Open never masks; Safe masks only when `sensitive` is
   *  true — pass a category/account's `hideInSafeMode` (undefined/false = visible, the default) or a
   *  module's Safe Mode toggle. Safe's whole point is that most amounts stay visible and only the
   *  sensitive ones hide, so there is deliberately no "default to sensitive" — always pass the resolved
   *  flag explicitly. */
  shouldMask: (sensitive: boolean | undefined) => boolean;
  canUseAI: () => boolean;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: ReactNode }) {
  // `setMode` used to be a separate wrapper around this that armed/disarmed the (now-removed) Open-mode
  // auto-revert timer — with no side effect left to run, there's nothing left for a wrapper to do, so
  // this is just the raw, already-stable `useState` setter passed straight through. Safe is the only
  // persistable default now, so there's no async AsyncStorage hydration to do either — `mode` starts at
  // the (only) real default synchronously, full stop.
  const [mode, setMode] = useState<PrivacyMode>('safe');

  // Revert to Safe immediately on backgrounding — independent safety net, not tied to any timer. RN
  // equivalent of web's visibilitychange + document.hidden idiom.
  useEffect(() => {
    const handleAppStateChange = (next: AppStateStatus) => {
      if (next === 'background' && mode === 'open') setMode('safe');
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [mode]);

  const maskValue = useCallback((value: string | number): string => (mode === 'open' ? String(value) : '••••'), [mode]);

  const shouldMask = useCallback(
    (sensitive: boolean | undefined) => {
      if (mode === 'open') return false;
      return !!sensitive;
    },
    [mode]
  );

  const canUseAI = useCallback(() => true, []);

  const value = useMemo(
    () => ({ mode, setMode, maskValue, shouldMask, canUseAI }),
    [mode, setMode, maskValue, shouldMask, canUseAI]
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy(): PrivacyContextValue {
  const ctx = useContext(PrivacyContext);
  if (!ctx) throw new Error('usePrivacy must be used within PrivacyProvider');
  return ctx;
}
