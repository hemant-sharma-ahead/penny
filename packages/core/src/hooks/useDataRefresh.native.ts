import { useEffect } from 'react';

/**
 * RN variant of `useDataRefresh.ts` — same exports/contract, no DOM. Same reasoning and fix pattern as
 * `useTxnRefresh.native.ts`: web's version uses `window.addEventListener`/`dispatchEvent`, which don't
 * exist in React Native. Metro resolves this `.native.ts` file over the plain `.ts` one for any native
 * build (Vite always resolves the plain file) — same convention as `schema.native.ts`. Replaces each DOM
 * event with a plain in-memory listener set.
 */

const categoriesListeners = new Set<() => void>();
const accountsListeners = new Set<() => void>();
const tagsListeners = new Set<() => void>();
const goalsListeners = new Set<() => void>();
const bankImportsListeners = new Set<() => void>();

export function notifyCategoriesChanged(): void {
  for (const listener of categoriesListeners) listener();
}

export function notifyAccountsChanged(): void {
  for (const listener of accountsListeners) listener();
}

export function notifyTagsChanged(): void {
  for (const listener of tagsListeners) listener();
}

export function notifyGoalsChanged(): void {
  for (const listener of goalsListeners) listener();
}

/** Same pattern, for `bankStatementImportsRepo` writes — see `useDataRefresh.ts`'s identical export for
 *  the full rationale (found via on-device testing 2026-08-09). */
export function notifyBankImportsChanged(): void {
  for (const listener of bankImportsListeners) listener();
}

/** Pass a STABLE callback (useCallback). */
export function useCategoriesRefresh(reload: () => void): void {
  useEffect(() => {
    categoriesListeners.add(reload);
    return () => {
      categoriesListeners.delete(reload);
    };
  }, [reload]);
}

/** Pass a STABLE callback (useCallback). */
export function useAccountsRefresh(reload: () => void): void {
  useEffect(() => {
    accountsListeners.add(reload);
    return () => {
      accountsListeners.delete(reload);
    };
  }, [reload]);
}

/** Pass a STABLE callback (useCallback). */
export function useTagsRefresh(reload: () => void): void {
  useEffect(() => {
    tagsListeners.add(reload);
    return () => {
      tagsListeners.delete(reload);
    };
  }, [reload]);
}

/** Pass a STABLE callback (useCallback). */
export function useGoalsRefresh(reload: () => void): void {
  useEffect(() => {
    goalsListeners.add(reload);
    return () => {
      goalsListeners.delete(reload);
    };
  }, [reload]);
}

/** Pass a STABLE callback (useCallback). */
export function useBankImportsRefresh(reload: () => void): void {
  useEffect(() => {
    bankImportsListeners.add(reload);
    return () => {
      bankImportsListeners.delete(reload);
    };
  }, [reload]);
}
