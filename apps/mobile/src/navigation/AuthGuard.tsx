import { useEffect, useState, type ReactNode } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { isOnboardingComplete, isPinRotationDue, isSessionValid } from '@penny/core/crypto/securityManager';
import { subscribeAuthRecheck } from './authRecheckBus';

type CheckState = 'checking' | 'needs_onboarding' | 'ready';

/**
 * Mirrors apps/web-react/src/router/AuthGuard.tsx's 3-state machine (checking → needs_onboarding →
 * ready), now calling the real @penny/core securityManager functions — this only became possible once
 * Track 2 shipped a real native storage adapter (schema.native.ts — originally expo-sqlite, then MMKV,
 * now op-sqlite, see that file for the full history); before that, these calls would have tried to
 * bundle Dexie/IndexedDB into Metro and crashed immediately (see Track 1's stub version in git history).
 *
 * Track 4 (Onboarding) addition: also re-runs this check whenever `notifyAuthShouldRecheck()` fires
 * (see `authRecheckBus.ts`) — the onboarding screens that create/restore a vault call it once they're
 * done, since (unlike web) nothing else here would ever re-run this effect and flip to `ready`.
 */
interface Props {
  children: (rotationDue: boolean) => ReactNode;
  onNeedsOnboarding: () => ReactNode;
}

export function AuthGuard({ children, onNeedsOnboarding }: Props) {
  const [state, setState] = useState<CheckState>('checking');
  const [rotationDue, setRotationDue] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function runCheck() {
      isOnboardingComplete()
        .then((onboarded) => {
          if (cancelled) return;
          if (!onboarded) {
            setState('needs_onboarding');
            return;
          }
          return Promise.all([isSessionValid(), isPinRotationDue()]).then(([, due]) => {
            if (cancelled) return;
            setRotationDue(due);
            setState('ready');
          });
        })
        .catch(() => {
          if (!cancelled) setState('needs_onboarding');
        });
    }

    runCheck();
    const unsubscribe = subscribeAuthRecheck(runCheck);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (state === 'checking') {
    return (
      <View className="flex-1 items-center justify-center bg-surface-tertiary">
        <ActivityIndicator size="large" color="#00a86b" />
      </View>
    );
  }

  if (state === 'needs_onboarding') {
    return <>{onNeedsOnboarding()}</>;
  }

  return <>{children(rotationDue)}</>;
}
