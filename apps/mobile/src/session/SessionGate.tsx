import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, AppState, type AppStateStatus } from 'react-native';
import { TextInput, Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { keystore } from '@/core/crypto/keystore';
import {
  getLockoutState,
  getPassphraseLockoutState,
  lockSession,
  unlock,
  unlockWithPassphrase
} from '@/core/crypto/securityManager';
import { loadLockOnBackground } from '~/context/SettingsContext';
import { recordActivity, startSessionWatcher, stopSessionWatcher } from '@/core/session/sessionStore';
import { notifyAuthShouldRecheck } from '~/navigation/authRecheckBus';
import { navigationRef } from '~/navigation/navigationRef';

interface Props {
  children: ReactNode;
  showRotationBanner?: boolean;
}

const MAX_ATTEMPTS = 5;

function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * RN port of apps/web-legacy/src/session/SessionGate.tsx — the actual PIN-unlock gate, missing from
 * mobile entirely until now. `AuthGuard.tsx`'s 'ready' state only means onboarding is complete, NOT that
 * the in-memory Data Master Key (`keystore.ts`) is loaded — that key is wiped on every process restart,
 * so without this component every cold app launch skipped straight to the dashboard with no key at all,
 * throwing "Session locked" the moment anything touched an encrypted repo (found via on-device testing,
 * 2026-07-25 — see docs/plans/mobile-migration.md).
 *
 * Platform swaps from web: `document.hidden`/`visibilitychange` → RN `AppState` (same pattern
 * `PrivacyContext.tsx` already established for Open-mode auto-revert); `window`'s `pointerdown`/`keydown`
 * activity listeners → a wrapping `View`'s `onStartShouldSetResponderCapture` returning `false` (observes
 * every descendant touch without ever becoming the responder, so nothing is intercepted — RN's standard
 * non-invasive "observe touches" idiom, since there's no bubbling touch-start event to listen to the way
 * DOM's `pointerdown` works). The forgot-PIN→passphrase
 * recovery flow's post-unlock navigation to `ChangePin` (`forcedPinReset: true`) can't use
 * `useNavigation()`/`useNavigate()` here — this component sits *above* `MainNavigator`'s
 * `Stack.Navigator` entirely (same reason `AuthGuard` renders it as a plain conditional, not a screen),
 * so it uses `navigationRef` (React Navigation's documented pattern for navigating from outside any
 * navigator) instead. `onNeedsOnboarding` (a prop on web, driving `setState('needs_onboarding')`) becomes
 * a direct `notifyAuthShouldRecheck()` call — the same bus `ChangePinPage.tsx`'s own 'wiped' handling
 * already uses to flip `AuthGuard` back to onboarding once the security record is gone.
 */
export function SessionGate({ children, showRotationBanner = false }: Props) {
  const theme = useThemeColors();
  const [locked, setLocked] = useState(!keystore.isUnlocked());
  const [rotationDismissed, setRotationDismissed] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [tickNow, setTickNow] = useState(() => Date.now());

  const [recovering, setRecovering] = useState(false);
  const [passphraseInput, setPassphraseInput] = useState('');
  const [passphraseError, setPassphraseError] = useState('');
  const [passphraseAttemptsUsed, setPassphraseAttemptsUsed] = useState(0);
  const [passphraseLockedUntil, setPassphraseLockedUntil] = useState<number | null>(null);
  const [passphraseVerifying, setPassphraseVerifying] = useState(false);

  const countdownMs = lockedUntil ? Math.max(0, lockedUntil - tickNow) : 0;
  const countdown = countdownMs > 0 ? formatCountdown(countdownMs) : '';
  const passphraseCountdownMs = passphraseLockedUntil ? Math.max(0, passphraseLockedUntil - tickNow) : 0;
  const passphraseCountdown = passphraseCountdownMs > 0 ? formatCountdown(passphraseCountdownMs) : '';

  useEffect(() => {
    if (!locked) return;
    getLockoutState()
      .then((state) => {
        if (!state) return;
        setAttemptsUsed(state.pinAttempts);
        if (state.lockedUntil && state.lockedUntil > Date.now()) {
          setLockedUntil(state.lockedUntil);
        }
      })
      .catch(() => {});
  }, [locked]);

  useEffect(() => {
    if (!lockedUntil) return;
    const target = lockedUntil;
    const id = setInterval(() => {
      const now = Date.now();
      if (now >= target) {
        setLockedUntil(null);
        setAttemptsUsed(0);
      } else {
        setTickNow(now);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  useEffect(() => {
    if (!recovering) return;
    getPassphraseLockoutState()
      .then((state) => {
        if (!state) return;
        setPassphraseAttemptsUsed(state.passphraseAttempts);
        if (state.lockedUntil && state.lockedUntil > Date.now()) {
          setPassphraseLockedUntil(state.lockedUntil);
        }
      })
      .catch(() => {});
  }, [recovering]);

  useEffect(() => {
    if (!passphraseLockedUntil) return;
    const target = passphraseLockedUntil;
    const id = setInterval(() => {
      const now = Date.now();
      if (now >= target) {
        setPassphraseLockedUntil(null);
        setPassphraseAttemptsUsed(0);
      } else {
        setTickNow(now);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [passphraseLockedUntil]);

  useEffect(() => {
    startSessionWatcher(() => setLocked(true));
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'background') return;
      void loadLockOnBackground().then((enabled) => {
        if (!enabled) return;
        lockSession();
        setLocked(true);
      });
    });
    return () => {
      stopSessionWatcher();
      sub.remove();
    };
  }, []);

  const handleUnlock = async () => {
    if (lockedUntil) return;
    setError('');
    const result = await unlock(pinInput);
    setPinInput('');
    if (result === 'ok') {
      setLocked(false);
      setAttemptsUsed(0);
    } else if (result === 'wiped') {
      notifyAuthShouldRecheck();
    } else if (result === 'locked_out') {
      getLockoutState()
        .then((state) => {
          if (state?.lockedUntil) setLockedUntil(state.lockedUntil);
          if (state) setAttemptsUsed(state.pinAttempts);
        })
        .catch(() => {});
    } else {
      getLockoutState()
        .then((state) => {
          if (state) setAttemptsUsed(state.pinAttempts);
        })
        .catch(() => {});
      setError('Incorrect PIN.');
    }
  };

  const handlePassphraseUnlock = async () => {
    if (passphraseLockedUntil || !passphraseInput) return;
    setPassphraseVerifying(true);
    setPassphraseError('');
    const result = await unlockWithPassphrase(passphraseInput);
    setPassphraseVerifying(false);
    setPassphraseInput('');
    if (result === 'ok') {
      setLocked(false);
      if (navigationRef.isReady()) {
        navigationRef.navigate('ChangePin', { forcedPinReset: true });
      }
    } else if (result === 'wiped') {
      notifyAuthShouldRecheck();
    } else if (result === 'locked_out') {
      getPassphraseLockoutState()
        .then((state) => {
          if (state?.lockedUntil) setPassphraseLockedUntil(state.lockedUntil);
          if (state) setPassphraseAttemptsUsed(state.passphraseAttempts);
        })
        .catch(() => {});
    } else {
      getPassphraseLockoutState()
        .then((state) => {
          if (state) setPassphraseAttemptsUsed(state.passphraseAttempts);
        })
        .catch(() => {});
      setPassphraseError('Incorrect passphrase.');
    }
  };

  if (locked) {
    const isLockedOut = !!lockedUntil;
    const remaining = MAX_ATTEMPTS - attemptsUsed;
    const showWarning = !isLockedOut && attemptsUsed >= 1 && remaining > 0;
    const passphraseIsLockedOut = !!passphraseLockedUntil;
    const passphraseRemaining = MAX_ATTEMPTS - passphraseAttemptsUsed;
    const showPassphraseWarning = !passphraseIsLockedOut && passphraseAttemptsUsed >= 1 && passphraseRemaining > 0;

    if (recovering) {
      return (
        <View className="flex-1 items-center justify-center bg-surface-3 px-6">
          <View className="w-full max-w-sm items-center">
            <View
              className="w-16 h-16 rounded-full items-center justify-center mb-6"
              style={{ backgroundColor: passphraseIsLockedOut ? '#fef2f2' : '#fffbeb' }}
            >
              <Icon name="ti-key" size={32} color={passphraseIsLockedOut ? theme.danger : theme.warning} />
            </View>

            <Text className="text-xl font-semibold text-primary mb-2 text-center">
              {passphraseIsLockedOut ? 'Too many attempts' : 'Enter your passphrase'}
            </Text>
            <Text className="text-secondary text-sm mb-8 text-center">
              {passphraseIsLockedOut
                ? `Try again in ${passphraseCountdown}`
                : "This unlocks the app so you can set a new PIN — you'll be asked for your passphrase again to confirm it."}
            </Text>

            {!passphraseIsLockedOut && (
              <View className="w-full">
                <TextInput
                  value={passphraseInput}
                  onChange={setPassphraseInput}
                  placeholder="Your passphrase"
                  secureTextEntry
                  autoFocus
                  error={passphraseError || undefined}
                />

                {showPassphraseWarning && (
                  <View className="flex-row items-center justify-center gap-1.5 mt-3 mb-1">
                    <Icon name="ti-alert-triangle" size={14} color={theme.warning} />
                    <Text className="text-xs" style={{ color: theme.warning }}>
                      {passphraseRemaining === 1
                        ? '1 attempt remaining before lockout'
                        : `${passphraseRemaining} attempts remaining before lockout`}
                    </Text>
                  </View>
                )}

                <Button
                  fullWidth
                  onPress={() => void handlePassphraseUnlock()}
                  disabled={!passphraseInput || passphraseVerifying}
                  loading={passphraseVerifying}
                  className="mt-3"
                >
                  Unlock
                </Button>
              </View>
            )}

            {passphraseIsLockedOut && (
              <View className="rounded-xl px-4 py-3 mb-3" style={{ backgroundColor: '#fef2f2' }}>
                <Text className="text-xs text-center" style={{ color: theme.danger }}>
                  For your security, passphrase entry is disabled temporarily.
                </Text>
              </View>
            )}

            <Button
              variant="ghost"
              className="mt-3"
              onPress={() => {
                setRecovering(false);
                setPassphraseInput('');
                setPassphraseError('');
              }}
            >
              Back to PIN
            </Button>
          </View>
        </View>
      );
    }

    return (
      <View className="flex-1 items-center justify-center bg-surface-3 px-6">
        <View className="w-full max-w-sm items-center">
          <View
            className="w-16 h-16 rounded-full items-center justify-center mb-6"
            style={{ backgroundColor: isLockedOut ? '#fef2f2' : '#fffbeb' }}
          >
            <Icon name="ti-lock" size={32} color={isLockedOut ? theme.danger : theme.warning} />
          </View>

          <Text className="text-xl font-semibold text-primary mb-2 text-center">
            {isLockedOut ? 'Too many attempts' : 'Session locked'}
          </Text>
          <Text className="text-secondary text-sm mb-8 text-center">
            {isLockedOut ? `Try again in ${countdown}` : 'Enter your PIN to continue'}
          </Text>

          {!isLockedOut && (
            <View className="w-full">
              <TextInput
                value={pinInput}
                onChange={(v) => setPinInput(v.replace(/\D/g, ''))}
                placeholder="6-digit PIN"
                maxLength={6}
                inputClassName="text-center tracking-widest text-2xl"
                keyboardType="number-pad"
                secureTextEntry
                autoFocus
                error={error || undefined}
              />

              {showWarning && (
                <View className="flex-row items-center justify-center gap-1.5 mt-3 mb-1">
                  <Icon name="ti-alert-triangle" size={14} color={theme.warning} />
                  <Text className="text-xs" style={{ color: theme.warning }}>
                    {remaining === 1
                      ? '1 attempt remaining before lockout'
                      : `${remaining} attempts remaining before lockout`}
                  </Text>
                </View>
              )}

              <Button fullWidth onPress={() => void handleUnlock()} disabled={pinInput.length !== 6} className="mt-3">
                Unlock
              </Button>
            </View>
          )}

          {isLockedOut && (
            <>
              <View className="rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: '#fef2f2' }}>
                <Text className="text-xs text-center" style={{ color: theme.danger }}>
                  For your security, PIN entry is disabled temporarily.
                </Text>
              </View>
              <Button variant="ghost" onPress={() => setRecovering(true)}>
                Forgot PIN?
              </Button>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => {
        recordActivity();
        return false;
      }}
    >
      {showRotationBanner && !rotationDismissed && (
        <View
          className="flex-row items-center gap-2 px-4 py-2 border-b"
          style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a' }}
        >
          <Icon name="ti-refresh-alert" size={18} color={theme.warning} />
          <Text className="flex-1 text-xs" style={{ color: '#92400e' }}>
            PIN rotation recommended — it has been 21+ days
          </Text>
          <Button variant="ghost" size="sm" onPress={() => setRotationDismissed(true)}>
            Dismiss
          </Button>
        </View>
      )}
      {children}
    </View>
  );
}
