import { useEffect } from 'react';

/** Broadcast when categories/accounts are edited from a separately-mounted screen (e.g. Settings →
 *  Safe Mode), so any other mounted `useRepository(expenseCategoriesRepo | accountsRepo)` consumer
 *  reloads instead of showing stale data until it happens to remount. Same pattern as `useTxnRefresh`. */
const CATEGORIES_CHANGED_EVENT = 'penny:categories-changed';
const ACCOUNTS_CHANGED_EVENT = 'penny:accounts-changed';
const TAGS_CHANGED_EVENT = 'penny:tags-changed';

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
