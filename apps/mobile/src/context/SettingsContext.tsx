import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getItem, setItem, removeItem, getJSON, setJSON } from '~/lib/storage';
import { type PersistedPrivacyMode } from './PrivacyContext';

/**
 * RN port of apps/web-react/src/context/SettingsContext.tsx. Ported in full (not just the
 * subscriptions-relevant slice) since the Track 4 dependency survey showed most near-term modules touch
 * this context. `theme` itself is NOT ported here — mobile's own `ThemeProvider` (Track 3) is already
 * the source of truth for palette selection (light/dark/system); `fontScale` IS ported (see
 * `FONT_SCALE_MAP` below and `~/theme/fontScale.ts`, which applies it globally via a `Text`/`TextInput`
 * render patch since NativeWind's font-size utilities don't reference a runtime-adjustable rem unit the
 * way web's `--font-scale` CSS variable does).
 * `localStorage` (sync) becomes AsyncStorage (async) — every loader is async and state hydrates in a
 * `useEffect`, same pattern `AuthGuard.tsx` already uses for its checking/hydration state.
 */

export type FontScale = 'small' | 'default' | 'large' | 'xl';

export const FONT_SCALE_MAP: Record<FontScale, number> = {
  small: 0.875,
  default: 1,
  large: 1.125,
  xl: 1.25
};

/** Modules without a natural "category" to hang a per-item Safe Mode flag on — one toggle each. */
export interface SafeModeVisibility {
  loans: boolean;
  iou: boolean;
  portfolio: boolean;
  goals: boolean;
  insurance: boolean;
  subscriptions: boolean;
}

const DEFAULT_SAFE_MODE_VISIBILITY: SafeModeVisibility = {
  loans: true,
  iou: true,
  portfolio: true,
  goals: true,
  insurance: true,
  subscriptions: true
};

const SAFE_MODE_VISIBILITY_KEY = 'penny_settings_safe_mode_visibility';
const FONT_SCALE_KEY = 'penny_settings_font_scale';
export const DEFAULT_PRIVACY_KEY = 'penny_settings_default_privacy';
const OPEN_MODE_DURATION_KEY = 'penny_settings_open_mode_duration';
const LOCK_ON_BACKGROUND_KEY = 'penny_settings_lock_on_background';
const CASHFLOW_BUFFER_KEY = 'penny_settings_cashflow_buffer';
const TAX_GROSS_INCOME_KEY = 'penny_settings_tax_gross_income';
const TAX_DIRECT_KEY = 'penny_settings_tax_direct';
const TAX_EPF_KEY = 'penny_settings_tax_epf';
const TAX_STATUTORY_KEY = 'penny_settings_tax_statutory';

/** Default safety cushion the cash-flow forecast keeps in reserve. */
export const DEFAULT_CASHFLOW_BUFFER = 5000;

async function loadCashflowBuffer(): Promise<number> {
  const raw = Number(await getItem(CASHFLOW_BUFFER_KEY));
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_CASHFLOW_BUFFER;
}

/** Optional manual tax-footprint overrides (null = derive automatically). */
async function loadOptionalAmount(key: string): Promise<number | null> {
  const raw = await getItem(key);
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Read directly (no React) — used by the session gate's visibility listener. */
export async function loadLockOnBackground(): Promise<boolean> {
  return (await getItem(LOCK_ON_BACKGROUND_KEY)) === '1';
}

async function loadSafeModeVisibility(): Promise<SafeModeVisibility> {
  const raw = await getJSON<Partial<SafeModeVisibility>>(SAFE_MODE_VISIBILITY_KEY);
  return { ...DEFAULT_SAFE_MODE_VISIBILITY, ...(raw ?? {}) };
}

async function loadFontScale(): Promise<FontScale> {
  const raw = await getItem(FONT_SCALE_KEY);
  if (raw === 'small' || raw === 'default' || raw === 'large' || raw === 'xl') return raw;
  return 'default';
}

/** Open can never be a persisted default — it's only ever a temporary elevation (see PrivacyContext).
 *  A legacy stored value of 'open' (from before this rule existed) silently coerces to 'safe'. */
export async function loadDefaultPrivacyMode(): Promise<PersistedPrivacyMode> {
  const raw = await getItem(DEFAULT_PRIVACY_KEY);
  if (raw === 'safe' || raw === 'privacy') return raw;
  return 'safe';
}

/** Allowed Open-mode auto-revert durations, in minutes. */
export const OPEN_MODE_DURATIONS = [1, 5, 10, 15, 30] as const;
export type OpenModeDuration = (typeof OPEN_MODE_DURATIONS)[number];
const DEFAULT_OPEN_MODE_DURATION: OpenModeDuration = 1;

/** Read directly (no React) — used by PrivacyContext's auto-revert timer. */
export async function loadOpenModeDurationMinutes(): Promise<OpenModeDuration> {
  const raw = Number(await getItem(OPEN_MODE_DURATION_KEY));
  return (OPEN_MODE_DURATIONS as readonly number[]).includes(raw)
    ? (raw as OpenModeDuration)
    : DEFAULT_OPEN_MODE_DURATION;
}

interface SettingsContextValue {
  safeModeVisibility: SafeModeVisibility;
  fontScale: FontScale;
  defaultPrivacyMode: PersistedPrivacyMode;
  openModeDurationMinutes: OpenModeDuration;
  lockOnBackground: boolean;
  cashflowBuffer: number;
  /** Manual annual gross income for the tax footprint; null = derive from income transactions. */
  taxGrossIncomeOverride: number | null;
  /** Manual direct-tax correction for the tax footprint; null = use the computed estimate. */
  taxDirectOverride: number | null;
  /** Manual annual EPF/PF contribution; null = derive (12% of 50%-basic). */
  taxEpfOverride: number | null;
  /** Manual annual statutory levies (professional tax + LWF); null = default (~₹2,400). */
  taxStatutoryOverride: number | null;
  setSafeModeVisibility: (key: keyof SafeModeVisibility, visible: boolean) => void;
  setFontScale: (scale: FontScale) => void;
  setDefaultPrivacyMode: (mode: PersistedPrivacyMode) => void;
  setOpenModeDurationMinutes: (minutes: OpenModeDuration) => void;
  setLockOnBackground: (value: boolean) => void;
  setCashflowBuffer: (value: number) => void;
  setTaxGrossIncomeOverride: (value: number | null) => void;
  setTaxDirectOverride: (value: number | null) => void;
  setTaxEpfOverride: (value: number | null) => void;
  setTaxStatutoryOverride: (value: number | null) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [safeModeVisibility, setSafeModeVisibilityState] = useState<SafeModeVisibility>(DEFAULT_SAFE_MODE_VISIBILITY);
  const [fontScale, setFontScaleState] = useState<FontScale>('default');
  const [defaultPrivacyMode, setDefaultPrivacyModeState] = useState<PersistedPrivacyMode>('safe');
  const [openModeDurationMinutes, setOpenModeDurationMinutesState] =
    useState<OpenModeDuration>(DEFAULT_OPEN_MODE_DURATION);
  const [lockOnBackground, setLockOnBackgroundState] = useState(false);
  const [cashflowBuffer, setCashflowBufferState] = useState(DEFAULT_CASHFLOW_BUFFER);
  const [taxGrossIncomeOverride, setTaxGrossIncomeOverrideState] = useState<number | null>(null);
  const [taxDirectOverride, setTaxDirectOverrideState] = useState<number | null>(null);
  const [taxEpfOverride, setTaxEpfOverrideState] = useState<number | null>(null);
  const [taxStatutoryOverride, setTaxStatutoryOverrideState] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadSafeModeVisibility(),
      loadFontScale(),
      loadDefaultPrivacyMode(),
      loadOpenModeDurationMinutes(),
      loadLockOnBackground(),
      loadCashflowBuffer(),
      loadOptionalAmount(TAX_GROSS_INCOME_KEY),
      loadOptionalAmount(TAX_DIRECT_KEY),
      loadOptionalAmount(TAX_EPF_KEY),
      loadOptionalAmount(TAX_STATUTORY_KEY)
    ]).then(
      ([
        loadedSafeMode,
        loadedFontScale,
        loadedDefaultPrivacy,
        loadedOpenModeDuration,
        loadedLockOnBackground,
        loadedCashflowBuffer,
        loadedTaxGross,
        loadedTaxDirect,
        loadedTaxEpf,
        loadedTaxStatutory
      ]) => {
        if (cancelled) return;
        setSafeModeVisibilityState(loadedSafeMode);
        setFontScaleState(loadedFontScale);
        setDefaultPrivacyModeState(loadedDefaultPrivacy);
        setOpenModeDurationMinutesState(loadedOpenModeDuration);
        setLockOnBackgroundState(loadedLockOnBackground);
        setCashflowBufferState(loadedCashflowBuffer);
        setTaxGrossIncomeOverrideState(loadedTaxGross);
        setTaxDirectOverrideState(loadedTaxDirect);
        setTaxEpfOverrideState(loadedTaxEpf);
        setTaxStatutoryOverrideState(loadedTaxStatutory);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const setSafeModeVisibility = useCallback((key: keyof SafeModeVisibility, visible: boolean) => {
    setSafeModeVisibilityState((prev) => {
      const next = { ...prev, [key]: visible };
      void setJSON(SAFE_MODE_VISIBILITY_KEY, next);
      return next;
    });
  }, []);

  const setFontScale = useCallback((scale: FontScale) => {
    void setItem(FONT_SCALE_KEY, scale);
    setFontScaleState(scale);
  }, []);

  const setDefaultPrivacyMode = useCallback((m: PersistedPrivacyMode) => {
    void setItem(DEFAULT_PRIVACY_KEY, m);
    setDefaultPrivacyModeState(m);
  }, []);

  const setOpenModeDurationMinutes = useCallback((minutes: OpenModeDuration) => {
    void setItem(OPEN_MODE_DURATION_KEY, String(minutes));
    setOpenModeDurationMinutesState(minutes);
  }, []);

  const setLockOnBackground = useCallback((value: boolean) => {
    void setItem(LOCK_ON_BACKGROUND_KEY, value ? '1' : '0');
    setLockOnBackgroundState(value);
  }, []);

  const setCashflowBuffer = useCallback((value: number) => {
    const safe = Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
    void setItem(CASHFLOW_BUFFER_KEY, String(safe));
    setCashflowBufferState(safe);
  }, []);

  const setTaxGrossIncomeOverride = useCallback((value: number | null) => {
    if (value === null || !Number.isFinite(value) || value < 0) {
      void removeItem(TAX_GROSS_INCOME_KEY);
      setTaxGrossIncomeOverrideState(null);
    } else {
      const safe = Math.round(value);
      void setItem(TAX_GROSS_INCOME_KEY, String(safe));
      setTaxGrossIncomeOverrideState(safe);
    }
  }, []);

  const setTaxDirectOverride = useCallback((value: number | null) => {
    if (value === null || !Number.isFinite(value) || value < 0) {
      void removeItem(TAX_DIRECT_KEY);
      setTaxDirectOverrideState(null);
    } else {
      const safe = Math.round(value);
      void setItem(TAX_DIRECT_KEY, String(safe));
      setTaxDirectOverrideState(safe);
    }
  }, []);

  const setTaxEpfOverride = useCallback((value: number | null) => {
    if (value === null || !Number.isFinite(value) || value < 0) {
      void removeItem(TAX_EPF_KEY);
      setTaxEpfOverrideState(null);
    } else {
      const safe = Math.round(value);
      void setItem(TAX_EPF_KEY, String(safe));
      setTaxEpfOverrideState(safe);
    }
  }, []);

  const setTaxStatutoryOverride = useCallback((value: number | null) => {
    if (value === null || !Number.isFinite(value) || value < 0) {
      void removeItem(TAX_STATUTORY_KEY);
      setTaxStatutoryOverrideState(null);
    } else {
      const safe = Math.round(value);
      void setItem(TAX_STATUTORY_KEY, String(safe));
      setTaxStatutoryOverrideState(safe);
    }
  }, []);

  const value = useMemo(
    () => ({
      safeModeVisibility,
      fontScale,
      defaultPrivacyMode,
      openModeDurationMinutes,
      lockOnBackground,
      cashflowBuffer,
      taxGrossIncomeOverride,
      taxDirectOverride,
      taxEpfOverride,
      taxStatutoryOverride,
      setSafeModeVisibility,
      setFontScale,
      setDefaultPrivacyMode,
      setOpenModeDurationMinutes,
      setLockOnBackground,
      setCashflowBuffer,
      setTaxGrossIncomeOverride,
      setTaxDirectOverride,
      setTaxEpfOverride,
      setTaxStatutoryOverride
    }),
    [
      safeModeVisibility,
      fontScale,
      defaultPrivacyMode,
      openModeDurationMinutes,
      lockOnBackground,
      cashflowBuffer,
      taxGrossIncomeOverride,
      taxDirectOverride,
      taxEpfOverride,
      taxStatutoryOverride,
      setSafeModeVisibility,
      setFontScale,
      setDefaultPrivacyMode,
      setOpenModeDurationMinutes,
      setLockOnBackground,
      setCashflowBuffer,
      setTaxGrossIncomeOverride,
      setTaxDirectOverride,
      setTaxEpfOverride,
      setTaxStatutoryOverride
    ]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
