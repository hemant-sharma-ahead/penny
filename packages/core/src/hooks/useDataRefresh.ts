import { useEffect } from 'react';

/** Broadcast when categories/accounts are edited from a separately-mounted screen (e.g. Settings →
 *  Safe Mode), so any other mounted `useRepository(expenseCategoriesRepo | accountsRepo)` consumer
 *  reloads instead of showing stale data until it happens to remount. Same pattern as `useTxnRefresh`. */
const CATEGORIES_CHANGED_EVENT = 'penny:categories-changed';
const ACCOUNTS_CHANGED_EVENT = 'penny:accounts-changed';
const TAGS_CHANGED_EVENT = 'penny:tags-changed';
const GOALS_CHANGED_EVENT = 'penny:goals-changed';
const BANK_IMPORTS_CHANGED_EVENT = 'penny:bank-imports-changed';

export function notifyCategoriesChanged(): void {
  window.dispatchEvent(new Event(CATEGORIES_CHANGED_EVENT));
}

export function notifyAccountsChanged(): void {
  window.dispatchEvent(new Event(ACCOUNTS_CHANGED_EVENT));
}

/** Same pattern, for Manage Tags / Safe Mode → Tags editing a tag's setAside/hideInSafeMode. */
export function notifyTagsChanged(): void {
  window.dispatchEvent(new Event(TAGS_CHANGED_EVENT));
}

/** Same pattern, for a goal created from a suggestion/quick-win outside the Goals screen's own hook
 *  (`SuggestedGoals.tsx`, `FinancialHealthCard.tsx`'s "Set as goal" action). */
export function notifyGoalsChanged(): void {
  window.dispatchEvent(new Event(GOALS_CHANGED_EVENT));
}

/** Same pattern, for `bankStatementImportsRepo` writes (`useBankImport.ts`'s `commitAndImport`) — needed
 *  by `useAccountVerification.ts`'s own separately-mounted `useRepository(bankStatementImportsRepo)`,
 *  which otherwise never learns a commit just wrote new provenance records and keeps sweeping against a
 *  stale (often empty) snapshot. Found via on-device testing 2026-08-09: every transaction an import had
 *  just linked looked unlinked to the standing-gap sweep and got flagged as a false-positive "gap". */
export function notifyBankImportsChanged(): void {
  window.dispatchEvent(new Event(BANK_IMPORTS_CHANGED_EVENT));
}

/** Pass a STABLE callback (useCallback). */
export function useCategoriesRefresh(reload: () => void): void {
  useEffect(() => {
    window.addEventListener(CATEGORIES_CHANGED_EVENT, reload);
    return () => window.removeEventListener(CATEGORIES_CHANGED_EVENT, reload);
  }, [reload]);
}

/** Pass a STABLE callback (useCallback). */
export function useAccountsRefresh(reload: () => void): void {
  useEffect(() => {
    window.addEventListener(ACCOUNTS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(ACCOUNTS_CHANGED_EVENT, reload);
  }, [reload]);
}

/** Pass a STABLE callback (useCallback). */
export function useTagsRefresh(reload: () => void): void {
  useEffect(() => {
    window.addEventListener(TAGS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(TAGS_CHANGED_EVENT, reload);
  }, [reload]);
}

/** Pass a STABLE callback (useCallback). */
export function useGoalsRefresh(reload: () => void): void {
  useEffect(() => {
    window.addEventListener(GOALS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(GOALS_CHANGED_EVENT, reload);
  }, [reload]);
}

/** Pass a STABLE callback (useCallback). */
export function useBankImportsRefresh(reload: () => void): void {
  useEffect(() => {
    window.addEventListener(BANK_IMPORTS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(BANK_IMPORTS_CHANGED_EVENT, reload);
  }, [reload]);
}
