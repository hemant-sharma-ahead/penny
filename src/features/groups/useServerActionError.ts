import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/context/ToastContext';
import { NotClaimedError } from '@/core/identity/signedFetch';
import { PATHS } from '@/router/paths';

/**
 * Shared handler for group/server action failures. When the device isn't fully claimed
 * (`NotClaimedError`), it shows one consistent "claim your account" prompt and routes to Profile —
 * instead of surfacing a cryptic low-level error. Returns `true` when it handled (routed away), so
 * callers can skip resetting local busy state on an unmounting screen.
 */
export function useServerActionError(): (err: unknown, fallback?: string) => boolean {
  const { showToast } = useToast();
  const navigate = useNavigate();
  return useCallback(
    (err: unknown, fallback = 'Something went wrong'): boolean => {
      if (err instanceof NotClaimedError) {
        showToast({ message: 'Claim your account to use groups & sharing.' });
        navigate(PATHS.app.profile);
        return true;
      }
      showToast({ message: err instanceof Error ? err.message : fallback });
      return false;
    },
    [showToast, navigate]
  );
}
