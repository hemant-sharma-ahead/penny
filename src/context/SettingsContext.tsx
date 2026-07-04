import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { type PrivacyMode } from '@/context/PrivacyContext';

export type FontScale = 'small' | 'default' | 'large' | 'xl';
/** Visual themes: light, Penny Blue (navy brand), true dark, or follow OS. */
export type Theme = 'light' | 'blue' | 'dark' | 'system';
/** What actually gets written to `data-theme` — 'system' resolves to one of these. */
export type ResolvedTheme = 'light' | 'blue' | 'dark';

export interface ModuleVisibility {
  portfolio: boolean;
  goals: boolean;
  subscriptions: boolean;
  iou: boolean;
  backup: boolean;
  news: boolean;
  calc: boolean;
}

const DEFAULT_MODULES: ModuleVisibility = {
  portfolio: true,
  goals: true,
  subscriptions: true,
  iou: true,
  backup: true,
  news: true,
  calc: true
};

const FONT_SCALE_MAP: Record<FontScale, number> = {
  small: 0.875,
  default: 1,
  large: 1.125,
  xl: 1.25
};

const MODULES_KEY = 'penny_settings_modules';
const FONT_SCALE_KEY = 'penny_settings_font_scale';
const THEME_KEY = 'penny_settings_theme';
const THEME_MIGRATED_KEY = 'penny_settings_theme_v2';
export const DEFAULT_PRIVACY_KEY = 'penny_settings_default_privacy';
const LOCK_ON_BACKGROUND_KEY = 'penny_settings_lock_on_background';
const CASHFLOW_BUFFER_KEY = 'penny_settings_cashflow_buffer';
const TAX_GROSS_INCOME_KEY = 'penny_settings_tax_gross_income';
const TAX_DIRECT_KEY = 'penny_settings_tax_direct';
const TAX_EPF_KEY = 'penny_settings_tax_epf';
const TAX_STATUTORY_KEY = 'penny_settings_tax_statutory';

/** Default safety cushion the cash-flow forecast keeps in reserve. */
export const DEFAULT_CASHFLOW_BUFFER = 5000;

function loadCashflowBuffer(): number {
  const raw = Number(localStorage.getItem(CASHFLOW_BUFFER_KEY));
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_CASHFLOW_BUFFER;
}

/** Optional manual tax-footprint overrides (null = derive automatically). */
function loadOptionalAmount(key: string): number | null {
  const raw = localStorage.getItem(key);
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Read directly (no React) — used by the session gate's visibility listener. */
export function loadLockOnBackground(): boolean {
  return localStorage.getItem(LOCK_ON_BACKGROUND_KEY) === '1';
}

function loadTheme(): Theme {
  let raw = localStorage.getItem(THEME_KEY);
  // One-time migration: the legacy 'dark' theme was the navy brand palette,
  // now named 'blue'. Remap it once so existing users keep their look, then
  // 'dark' is free to mean the new true-dark palette. The flag is set on first
  // load regardless, so a fresh 'dark' pick afterwards is never remapped.
  if (!localStorage.getItem(THEME_MIGRATED_KEY)) {
    if (raw === 'dark') {
      raw = 'blue';
      localStorage.setItem(THEME_KEY, 'blue');
    }
    localStorage.setItem(THEME_MIGRATED_KEY, '1');
  }
  if (raw === 'light' || raw === 'blue' || raw === 'dark' || raw === 'system') return raw;
  return 'system';
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function loadModules(): ModuleVisibility {
  try {
    const raw = localStorage.getItem(MODULES_KEY);
    if (!raw) return DEFAULT_MODULES;
    return { ...DEFAULT_MODULES, ...(JSON.parse(raw) as Partial<ModuleVisibility>) };
  } catch {
    return DEFAULT_MODULES;
  }
}

function loadFontScale(): FontScale {
  const raw = localStorage.getItem(FONT_SCALE_KEY);
  if (raw === 'small' || raw === 'default' || raw === 'large' || raw === 'xl') return raw;
  return 'default';
}

export function loadDefaultPrivacyMode(): PrivacyMode {
  const raw = localStorage.getItem(DEFAULT_PRIVACY_KEY);
  if (raw === 'safe' || raw === 'privacy' || raw === 'open') return raw;
  return 'safe';
}

interface SettingsContextValue {
  modules: ModuleVisibility;
  fontScale: FontScale;
  theme: Theme;
  defaultPrivacyMode: PrivacyMode;
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
  setModule: (key: keyof ModuleVisibility, visible: boolean) => void;
  setFontScale: (scale: FontScale) => void;
  setTheme: (theme: Theme) => void;
  setDefaultPrivacyMode: (mode: PrivacyMode) => void;
  setLockOnBackground: (value: boolean) => void;
  setCashflowBuffer: (value: number) => void;
  setTaxGrossIncomeOverride: (value: number | null) => void;
  setTaxDirectOverride: (value: number | null) => void;
  setTaxEpfOverride: (value: number | null) => void;
  setTaxStatutoryOverride: (value: number | null) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [modules, setModules] = useState<ModuleVisibility>(loadModules);
  const [fontScale, setFontScaleState] = useState<FontScale>(loadFontScale);
  const [theme, setThemeState] = useState<Theme>(loadTheme);
  const [defaultPrivacyMode, setDefaultPrivacyModeState] = useState<PrivacyMode>(loadDefaultPrivacyMode);
  const [lockOnBackground, setLockOnBackgroundState] = useState<boolean>(loadLockOnBackground);
  const [cashflowBuffer, setCashflowBufferState] = useState<number>(loadCashflowBuffer);
  const [taxGrossIncomeOverride, setTaxGrossIncomeOverrideState] = useState<number | null>(() =>
    loadOptionalAmount(TAX_GROSS_INCOME_KEY)
  );
  const [taxDirectOverride, setTaxDirectOverrideState] = useState<number | null>(() =>
    loadOptionalAmount(TAX_DIRECT_KEY)
  );
  const [taxEpfOverride, setTaxEpfOverrideState] = useState<number | null>(() => loadOptionalAmount(TAX_EPF_KEY));
  const [taxStatutoryOverride, setTaxStatutoryOverrideState] = useState<number | null>(() =>
    loadOptionalAmount(TAX_STATUTORY_KEY)
  );

  useEffect(() => {
    const scale = FONT_SCALE_MAP[fontScale];
    document.documentElement.style.setProperty('--font-scale', String(scale));
  }, [fontScale]);

  useEffect(() => {
    const apply = () => {
      document.body.setAttribute('data-theme', resolveTheme(theme));
    };
    apply();
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const setModule = useCallback((key: keyof ModuleVisibility, visible: boolean) => {
    setModules((prev) => {
      const next = { ...prev, [key]: visible };
      localStorage.setItem(MODULES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setFontScale = useCallback((scale: FontScale) => {
    localStorage.setItem(FONT_SCALE_KEY, scale);
    setFontScaleState(scale);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(THEME_KEY, t);
    setThemeState(t);
  }, []);

  const setDefaultPrivacyMode = useCallback((m: PrivacyMode) => {
    localStorage.setItem(DEFAULT_PRIVACY_KEY, m);
    setDefaultPrivacyModeState(m);
  }, []);

  const setLockOnBackground = useCallback((value: boolean) => {
    localStorage.setItem(LOCK_ON_BACKGROUND_KEY, value ? '1' : '0');
    setLockOnBackgroundState(value);
  }, []);

  const setCashflowBuffer = useCallback((value: number) => {
    const safe = Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
    localStorage.setItem(CASHFLOW_BUFFER_KEY, String(safe));
    setCashflowBufferState(safe);
  }, []);

  const setTaxGrossIncomeOverride = useCallback((value: number | null) => {
    if (value === null || !Number.isFinite(value) || value < 0) {
      localStorage.removeItem(TAX_GROSS_INCOME_KEY);
      setTaxGrossIncomeOverrideState(null);
    } else {
      const safe = Math.round(value);
      localStorage.setItem(TAX_GROSS_INCOME_KEY, String(safe));
      setTaxGrossIncomeOverrideState(safe);
    }
  }, []);

  const setTaxDirectOverride = useCallback((value: number | null) => {
    if (value === null || !Number.isFinite(value) || value < 0) {
      localStorage.removeItem(TAX_DIRECT_KEY);
      setTaxDirectOverrideState(null);
    } else {
      const safe = Math.round(value);
      localStorage.setItem(TAX_DIRECT_KEY, String(safe));
      setTaxDirectOverrideState(safe);
    }
  }, []);

  const setTaxEpfOverride = useCallback((value: number | null) => {
    if (value === null || !Number.isFinite(value) || value < 0) {
      localStorage.removeItem(TAX_EPF_KEY);
      setTaxEpfOverrideState(null);
    } else {
      const safe = Math.round(value);
      localStorage.setItem(TAX_EPF_KEY, String(safe));
      setTaxEpfOverrideState(safe);
    }
  }, []);

  const setTaxStatutoryOverride = useCallback((value: number | null) => {
    if (value === null || !Number.isFinite(value) || value < 0) {
      localStorage.removeItem(TAX_STATUTORY_KEY);
      setTaxStatutoryOverrideState(null);
    } else {
      const safe = Math.round(value);
      localStorage.setItem(TAX_STATUTORY_KEY, String(safe));
      setTaxStatutoryOverrideState(safe);
    }
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        modules,
        fontScale,
        theme,
        defaultPrivacyMode,
        lockOnBackground,
        cashflowBuffer,
        taxGrossIncomeOverride,
        taxDirectOverride,
        taxEpfOverride,
        taxStatutoryOverride,
        setModule,
        setFontScale,
        setTheme,
        setDefaultPrivacyMode,
        setLockOnBackground,
        setCashflowBuffer,
        setTaxGrossIncomeOverride,
        setTaxDirectOverride,
        setTaxEpfOverride,
        setTaxStatutoryOverride
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
