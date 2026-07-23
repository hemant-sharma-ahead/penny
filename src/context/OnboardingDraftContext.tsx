import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { AccountType, EmploymentType, GoalRisk } from '@/core/db/types';

/** One account to create once the real vault exists — mirrors the fields AccountFormModal collects. */
export interface DraftAccount {
  name: string;
  type: AccountType;
  openingBalance: number;
}

export type BackupChoice = 'local' | 'google-drive' | 'icloud' | 'skip';

// Holds the details collected across onboarding screens in memory only — nothing is
// persisted until encryption is initialized at the final step. A refresh restarts onboarding.
export interface OnboardingDraft {
  fullName?: string;
  username?: string;
  dob?: string; // ISO YYYY-MM-DD
  employmentType?: EmploymentType;
  // ── Life & household (Screen 9 — optional; clearable, so explicit `undefined` must be assignable) ──
  maritalStatus?: 'single' | 'married' | undefined;
  children?: number[]; // dependents' birth years
  homeOwner?: boolean | undefined;
  riskAppetite?: GoalRisk | undefined;
  // ── Accounts (Screen 10 — optional) ──
  accountsToCreate?: DraftAccount[];
  // ── Backup (Screen 11 — optional) ──
  backupChoice?: BackupChoice;
  /** True only when this draft was started by "Exit Demo Mode" — an unlocked demo vault already
   *  exists, so the final step re-keys it (exitDemoMode) instead of calling initialize() fresh. */
  fromDemoMode?: boolean;
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
