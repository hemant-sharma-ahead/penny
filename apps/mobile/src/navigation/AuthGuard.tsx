import { useEffect, useState, type ReactNode } from 'react';
import { View, ActivityIndicator } from 'react-native';

type CheckState = 'checking' | 'needs_onboarding' | 'ready';

/**
 * Track 1 stub — mirrors apps/web-legacy/src/router/AuthGuard.tsx's 3-state machine
 * (checking → needs_onboarding → ready), but does NOT call the real
 * `isOnboardingComplete`/`isSessionValid`/`isPinRotationDue` from @penny/core's securityManager yet:
 * those currently run against the Dexie/IndexedDB schema, which has no React Native equivalent until
 * Track 2 ships the expo-sqlite adapter. Wiring the real calls here would try to bundle `dexie` into
 * Metro and fail immediately. Replace `checkStub()` with the real calls in Track 2.
 */
function checkStub(): Promise<{ onboarded: boolean; rotationDue: boolean }> {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ onboarded: false, rotationDue: false }), 300);
  });
}

interface Props {
  children: (rotationDue: boolean) => ReactNode;
  onNeedsOnboarding: () => ReactNode;
}

export function AuthGuard({ children, onNeedsOnboarding }: Props) {
  const [state, setState] = useState<CheckState>('checking');
  const [rotationDue, setRotationDue] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkStub().then(({ onboarded, rotationDue: due }) => {
      if (cancelled) return;
      if (!onboarded) {
        setState('needs_onboarding');
        return;
      }
      setRotationDue(due);
      setState('ready');
    });
    return () => {
      cancelled = true;
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
