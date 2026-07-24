import { useCallback } from 'react';
import { useToast } from '~/context/ToastContext';
import { NotClaimedError } from '@/core/identity/signedFetch';

/**
 * RN port of apps/web-legacy/src/features/groups/useServerActionError.ts. Shared handler for
 * group/server action failures. Web's `NotClaimedError` branch routes to a Profile screen via
 * `react-router-dom`'s `navigate` — mobile has no such destination yet (no real nav stack exists outside
 * `AuthGuard`'s temporary stand-in, the same "no real nav" limitation noted throughout Track 4), so this
 * just surfaces a clear toast without navigating. Revisit once a real Profile/claim screen is wired up.
 * Returns `false` always here (nothing "handled" the navigation away) — callers only use the return value
 * to skip resetting local busy state on an unmounting screen, which doesn't apply without a navigation.
 */
export function useServerActionError(): (err: unknown, fallback?: string) => boolean {
  const { showToast } = useToast();
  return useCallback(
    (err: unknown, fallback = 'Something went wrong'): boolean => {
      if (err instanceof NotClaimedError) {
        showToast({ message: 'Claim your account to use groups & sharing.' });
        return false;
      }
      showToast({ message: err instanceof Error ? err.message : fallback });
      return false;
    },
    [showToast]
  );
}
