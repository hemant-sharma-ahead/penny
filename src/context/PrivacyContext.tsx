import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type PrivacyMode = 'safe' | 'privacy' | 'open';

interface PrivacyContextValue {
  mode: PrivacyMode;
  setMode: (mode: PrivacyMode) => void;
  maskValue: (value: string | number) => string;
  canUseAI: () => boolean;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<PrivacyMode>('safe');

  const setMode = (newMode: PrivacyMode) => {
    setModeState(newMode);
    document.body.setAttribute('data-privacy-mode', newMode);
  };

  useEffect(() => {
    document.body.setAttribute('data-privacy-mode', mode);
  }, [mode]);

  const maskValue = (value: string | number): string => {
    if (mode === 'safe') return '••••';
    if (mode === 'privacy') return '••••';
    return String(value);
  };

  const canUseAI = () => mode !== 'privacy';

  return <PrivacyContext.Provider value={{ mode, setMode, maskValue, canUseAI }}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy(): PrivacyContextValue {
  const ctx = useContext(PrivacyContext);
  if (!ctx) throw new Error('usePrivacy must be used within PrivacyProvider');
  return ctx;
}
