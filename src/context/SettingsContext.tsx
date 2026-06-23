import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { type PrivacyMode } from '@/context/PrivacyContext';

export type FontScale = 'small' | 'default' | 'large' | 'xl';
export type Theme = 'light' | 'dark' | 'system';

export interface ModuleVisibility {
  portfolio: boolean;
  goals: boolean;
  insurance: boolean;
  subscriptions: boolean;
  iou: boolean;
  loans: boolean;
  health: boolean;
  tax: boolean;
  cashflow: boolean;
  backup: boolean;
}

const DEFAULT_MODULES: ModuleVisibility = {
  portfolio: true,
  goals: true,
  insurance: true,
  subscriptions: true,
  iou: true,
  loans: true,
  health: true,
  tax: true,
  cashflow: true,
  backup: true
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
export const DEFAULT_PRIVACY_KEY = 'penny_settings_default_privacy';

function loadTheme(): Theme {
  const raw = localStorage.getItem(THEME_KEY);
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  return 'system';
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
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
  setModule: (key: keyof ModuleVisibility, visible: boolean) => void;
  setFontScale: (scale: FontScale) => void;
  setTheme: (theme: Theme) => void;
  setDefaultPrivacyMode: (mode: PrivacyMode) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [modules, setModules] = useState<ModuleVisibility>(loadModules);
  const [fontScale, setFontScaleState] = useState<FontScale>(loadFontScale);
  const [theme, setThemeState] = useState<Theme>(loadTheme);
  const [defaultPrivacyMode, setDefaultPrivacyModeState] = useState<PrivacyMode>(loadDefaultPrivacyMode);

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

  return (
    <SettingsContext.Provider
      value={{
        modules,
        fontScale,
        theme,
        defaultPrivacyMode,
        setModule,
        setFontScale,
        setTheme,
        setDefaultPrivacyMode
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
