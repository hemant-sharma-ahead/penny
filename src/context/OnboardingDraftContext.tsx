import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { EmploymentType } from '@/core/db/types';

// Holds the details collected across onboarding screens in memory only — nothing is
// persisted until encryption is initialized at the final step. A refresh restarts onboarding.
export interface OnboardingDraft {
  fullName?: string;
  username?: string;
  dob?: string; // ISO YYYY-MM-DD
  employmentType?: EmploymentType;
}

interface OnboardingDraftValue extends OnboardingDraft {
  setDraft: (patch: Partial<OnboardingDraft>) => void;
}

const OnboardingDraftContext = createContext<OnboardingDraftValue | null>(null);

export function OnboardingDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraftState] = useState<OnboardingDraft>({});
  const setDraft = useCallback((patch: Partial<OnboardingDraft>) => {
    setDraftState((prev) => ({ ...prev, ...patch }));
  }, []);
  return <OnboardingDraftContext.Provider value={{ ...draft, setDraft }}>{children}</OnboardingDraftContext.Provider>;
}

export function useOnboardingDraft(): OnboardingDraftValue {
  const ctx = useContext(OnboardingDraftContext);
  if (!ctx) throw new Error('useOnboardingDraft must be used within OnboardingDraftProvider');
  return ctx;
}
