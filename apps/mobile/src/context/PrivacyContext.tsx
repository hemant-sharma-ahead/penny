import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { isDefaultOpenArmed } from '@/lib/defaultOpenMode';
import { useSettings } from './SettingsContext';
import { useToast } from './ToastContext';

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
 *
 * 2026-08-29 (punch-list item 12): a real, opt-in persisted default came back — `SettingsContext`'s
 * `defaultOpenArmedUntil` (armed only via Settings' "Frequent" card, `SettingsPage.tsx`'s
 * `DefaultOpenModeRow`, never here). While armed (`isDefaultOpenArmed()` below is true): (a) the AppState
 * background-revert effect suppresses itself instead of flipping to Safe, and (b) a reconcile effect
 * re-asserts `mode = 'open'` on every foreground/mount so reopening the app needs no PIN — the accepted
 * trade-off spelled out in the item spec (an unattended unlocked phone stays in Open for the rest of the
 * window). Once the armed window lapses — detected lazily on foreground/mount, not a background timer,
 * consistent with 2026-08-18's "no resurrected countdown timer" call above — the same reconcile effect
 * clears the preference, reverts to Safe, and fires a one-time "expired" toast.
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
  // this is just the raw, already-stable `useState` setter passed straight through. Safe is still the
  // only *synchronous* starting default — `mode` starts at it before `SettingsContext` has finished its
  // own async AsyncStorage hydration — but see the reconcile effect below for how an armed "Default to
  // Open mode" window re-asserts Open shortly after mount/foreground once that hydration lands.
  const [mode, setMode] = useState<PrivacyMode>('safe');
  const { defaultOpenArmedUntil, setDefaultOpenArmedUntil } = useSettings();
  const { showToast } = useToast();

  // Reconcile `mode` against the persisted "Default to Open mode" window (punch-list item 12) — runs on
  // mount (once `SettingsContext` has hydrated `defaultOpenArmedUntil`), whenever that preference itself
  // changes (armed/cleared from `SettingsPage.tsx`'s `DefaultOpenModeRow`), and again on every foreground
  // (below) since wall-clock time, not just the preference's identity, is what actually expires it.
  // Deliberately lazy/opportunistic, not a running timer — consistent with 2026-08-18's removal of the
  // old fixed-duration auto-expiry countdown.
  const reconcileDefaultOpen = useCallback(() => {
    if (defaultOpenArmedUntil == null) return;
    if (isDefaultOpenArmed(defaultOpenArmedUntil)) {
      setMode('open');
    } else {
      // Window lapsed since it was armed — clear it (so this only ever fires once), drop back to Safe,
      // and say so: a silent revert was explicitly rejected in favor of this one-time toast.
      setDefaultOpenArmedUntil(null);
      setMode('safe');
      showToast({ message: 'Switched back to Safe Mode — your Open default expired', variant: 'info' });
    }
  }, [defaultOpenArmedUntil, setDefaultOpenArmedUntil, showToast]);

  useEffect(() => {
    // Genuinely a "sync React state to an external, wall-clock-driven fact" effect (is the persisted
    // window still armed right now?), not something derivable via useMemo — deliberate, not an
    // accidental setState-in-effect the linter can't tell apart from one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reconcileDefaultOpen();
    // Only re-run when the persisted value itself changes (mount/hydrate/arm/clear) — `reconcileDefaultOpen`
    // is intentionally excluded even though it's in scope, since it's also recreated by `showToast`
    // identity churn and would otherwise re-fire on every unrelated toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultOpenArmedUntil]);

  // Revert to Safe on backgrounding — independent safety net, not tied to any timer. RN equivalent of
  // web's visibilitychange + document.hidden idiom. Suppressed while a "Default to Open mode" window is
  // still armed (the item's whole point: skip the PIN on the next foreground) — reconciled instead on the
  // next 'active' transition, which also catches the window having lapsed while backgrounded.
  useEffect(() => {
    const handleAppStateChange = (next: AppStateStatus) => {
      if (next === 'background') {
        if (mode === 'open' && !isDefaultOpenArmed(defaultOpenArmedUntil)) setMode('safe');
        return;
      }
      if (next === 'active') reconcileDefaultOpen();
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [mode, defaultOpenArmedUntil, reconcileDefaultOpen]);

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
