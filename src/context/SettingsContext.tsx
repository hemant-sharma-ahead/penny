import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type FontScale = 'small' | 'default' | 'large' | 'xl';

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

interface SettingsContextValue {
  modules: ModuleVisibility;
  fontScale: FontScale;
  setModule: (key: keyof ModuleVisibility, visible: boolean) => void;
  setFontScale: (scale: FontScale) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [modules, setModules] = useState<ModuleVisibility>(loadModules);
  const [fontScale, setFontScaleState] = useState<FontScale>(loadFontScale);

  useEffect(() => {
    const scale = FONT_SCALE_MAP[fontScale];
    document.documentElement.style.setProperty('--font-scale', String(scale));
  }, [fontScale]);

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

  return (
    <SettingsContext.Provider value={{ modules, fontScale, setModule, setFontScale }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
