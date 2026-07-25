import { useCallback } from 'react';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useToast } from '~/context/ToastContext';
import { NotClaimedError } from '@/core/identity/signedFetch';

/**
 * RN port of apps/web-legacy/src/features/groups/useServerActionError.ts. Shared handler for
 * group/server action failures. `NotClaimedError` shows one consistent "claim your account" toast and
 * routes to the real `Profile` screen (wired up alongside `ContextSwitcher`'s own claim entry point —
 * see `~/features/groups/ContextSwitcher.tsx`), returning `true` so callers can skip resetting local
 * busy state on an unmounting screen.
 */
export function useServerActionError(): (err: unknown, fallback?: string) => boolean {
  const { showToast } = useToast();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  return useCallback(
    (err: unknown, fallback = 'Something went wrong'): boolean => {
      if (err instanceof NotClaimedError) {
        showToast({ message: 'Claim your account to use groups & sharing.' });
        navigation.navigate('Profile');
        return true;
      }
      showToast({ message: err instanceof Error ? err.message : fallback });
      return false;
    },
    [showToast, navigation]
  );
}
