import { useEffect, useState } from 'react';
import { View, Pressable, ScrollView, BackHandler, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type ParamListBase, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, PageHeader, TextInput, Banner } from '~/components/ui';
import { BackButton } from '~/components/shared';
import { changePin, isWeakPin, resetPinWithPassphrase } from '@/core/crypto/securityManager';
import { notifyAuthShouldRecheck } from '~/navigation/authRecheckBus';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';

type ChangePinRouteParams = { forcedPinReset?: boolean } | undefined;

const isSixDigits = (v: string) => /^\d{6}$/.test(v);

/**
 * RN port of apps/web-react/src/features/security/ChangePinPage.tsx. Envelope-crypto re-wrap only —
 * `securityManager.changePin`/`resetPinWithPassphrase` never re-encrypt the underlying data, per
 * CLAUDE.md's encryption rules — this is a pure UI port, no crypto work needed.
 *
 * Web traps the browser back button (history.pushState/popstate) while `forced` (reached via a PIN
 * lockout recovery) so the screen can't be dismissed until the PIN is reset. `MainNavigator.tsx`'s
 * `ChangePin` screen options set `gestureEnabled: !route.params?.forcedPinReset` /
 * `headerBackVisible: !route.params?.forcedPinReset` as the native-stack analog for swipe-back/header-back
 * — but neither intercepts Android's hardware back button, a separate OS-level event (found via the
 * 2026-07-25 rendering-model parity re-sweep: a locked-out user could press back and exit the forced-reset
 * screen entirely, bypassing recovery). Fixed with a `BackHandler` listener that swallows the event
 * whenever `forced` is true. The `leading` back button (this screen's own in-content header, not
 * native-stack's chrome) is still conditionally hidden below to match web's intent.
 *
 * `handleSubmitViaPassphrase`/`handleSubmitViaPin` wrap their `securityManager` call in try/catch
 * (2026-07-25, found via audit): previously a thrown error (as opposed to a resolved failure `status`)
 * left `saving` stuck at `true` forever — the submit button permanently disabled with no error shown and
 * no way to retry, the same bug class already fixed in `SettingsPage.tsx`'s Exit Demo Mode.
 */
export function ChangePinPage() {
  const modeBg = useModeBackgroundColor();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const route = useRoute<RouteProp<Record<string, ChangePinRouteParams>, string>>();
  // Reached via SessionGate's "Forgot PIN?" recovery — only possible once PIN attempts were exhausted,
  // so this is always a genuine recovery and the screen is made non-dismissible below.
  const forced = !!route.params?.forcedPinReset;

  useEffect(() => {
    if (!forced) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [forced]);

  const [viaPassphrase, setViaPassphrase] = useState(forced);
  const [current, setCurrent] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const onlyDigits = (v: string) => v.replace(/\D/g, '');
  const mismatch = confirm.length === 6 && next !== confirm;
  const sameAsCurrent = !viaPassphrase && isSixDigits(next) && next === current;
  const weakNew = isSixDigits(next) && isWeakPin(next);
  const newPinError = sameAsCurrent
    ? 'New PIN must be different from the current one'
    : weakNew
      ? 'Choose a less predictable PIN'
      : undefined;
  const canSubmit = viaPassphrase
    ? passphrase.length > 0 && isSixDigits(next) && next === confirm && !weakNew && !saving && !done
    : isSixDigits(current) && isSixDigits(next) && next === confirm && !sameAsCurrent && !weakNew && !saving && !done;

  async function handleSubmitViaPassphrase() {
    let result;
    try {
      result = await resetPinWithPassphrase(passphrase, next);
    } catch {
      setError('Something went wrong. Please try again.');
      setSaving(false);
      return;
    }
    switch (result.status) {
      case 'ok':
        setDone(true);
        setTimeout(() => navigation.navigate('MainTabs'), 1200);
        return;
      case 'wrong_passphrase': {
        const n = result.attemptsRemaining ?? 0;
        setError(`Your passphrase is incorrect${n > 0 ? ` — ${n} attempt${n === 1 ? '' : 's'} left` : ''}.`);
        break;
      }
      case 'locked_out':
        setError('Too many incorrect attempts. Try again later.');
        break;
      case 'weak_pin':
        setError('Choose a less predictable PIN.');
        break;
      case 'wiped':
        // 'wiped' means wipeAllData() ran — security/profile are gone and onboardingComplete is false
        // again, so this re-runs AuthGuard's check (rather than navigate('Splash') directly, which isn't
        // a route in this stack) and lets it naturally render OnboardingNavigator from Splash.
        notifyAuthShouldRecheck();
        return;
      default:
        setError('Something went wrong. Please try again.');
    }
    setSaving(false);
  }

  async function handleSubmitViaPin() {
    let result;
    try {
      result = await changePin(current, next);
    } catch {
      setError('Something went wrong. Please try again.');
      setSaving(false);
      return;
    }
    switch (result.status) {
      case 'ok':
        setDone(true);
        setTimeout(() => navigation.navigate('MainTabs'), 1200);
        return;
      case 'wrong_pin': {
        const n = result.attemptsRemaining ?? 0;
        setError(`Your current PIN is incorrect${n > 0 ? ` — ${n} attempt${n === 1 ? '' : 's'} left` : ''}.`);
        break;
      }
      case 'locked_out':
        setError('Too many incorrect attempts. Try again later.');
        break;
      case 'too_soon':
        setError('You can only change your PIN once a day. Please try again later.');
        break;
      case 'weak_pin':
        setError('Choose a less predictable PIN.');
        break;
      case 'wiped':
        // 'wiped' means wipeAllData() ran — security/profile are gone and onboardingComplete is false
        // again, so this re-runs AuthGuard's check (rather than navigate('Splash') directly, which isn't
        // a route in this stack) and lets it naturally render OnboardingNavigator from Splash.
        notifyAuthShouldRecheck();
        return;
      default:
        setError('Something went wrong. Please try again.');
    }
    setSaving(false);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    if (viaPassphrase) await handleSubmitViaPassphrase();
    else await handleSubmitViaPin();
  }

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader leading={forced ? undefined : <BackButton />} title="Change PIN" />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-4 py-4 gap-4">
          {forced ? (
            <Banner variant="warning">
              Your PIN was locked after too many incorrect attempts. Set a new one to continue — enter your passphrase
              once more to confirm it.
            </Banner>
          ) : (
            <Text className="text-sm text-secondary">
              Your PIN unlocks the app quickly. Changing it re-wraps your encryption key — your data is never
              re-encrypted.
            </Text>
          )}

          {done ? (
            <Banner variant="success">PIN changed. Use your new PIN next time you unlock.</Banner>
          ) : (
            <>
              {viaPassphrase ? (
                <TextInput
                  label="Current passphrase"
                  secureTextEntry
                  value={passphrase}
                  onChange={setPassphrase}
                  placeholder="Enter your passphrase"
                />
              ) : (
                <TextInput
                  label="Current PIN"
                  secureTextEntry
                  keyboardType="numeric"
                  maxLength={6}
                  inputClassName="text-center tracking-widest text-lg"
                  value={current}
                  onChange={(v) => setCurrent(onlyDigits(v))}
                  placeholder="Enter current 6-digit PIN"
                />
              )}

              {!forced && (
                <Pressable
                  onPress={() => {
                    setViaPassphrase((v) => !v);
                    setCurrent('');
                    setPassphrase('');
                    setError('');
                  }}
                  className="self-start -mt-2"
                >
                  <Text className="text-secondary text-xs font-medium underline">
                    {viaPassphrase ? 'Use current PIN instead' : 'Forgot your PIN? Use your passphrase instead'}
                  </Text>
                </Pressable>
              )}

              <TextInput
                label="New PIN"
                secureTextEntry
                keyboardType="numeric"
                maxLength={6}
                inputClassName="text-center tracking-widest text-lg"
                value={next}
                onChange={(v) => setNext(onlyDigits(v))}
                placeholder="Choose a new 6-digit PIN"
                error={newPinError}
              />
              <TextInput
                label="Confirm PIN"
                secureTextEntry
                keyboardType="numeric"
                maxLength={6}
                inputClassName="text-center tracking-widest text-lg"
                value={confirm}
                onChange={(v) => setConfirm(onlyDigits(v))}
                placeholder="Re-enter your new PIN"
                error={mismatch ? "PINs don't match" : undefined}
              />

              {error ? <Text className="text-danger text-sm text-center">{error}</Text> : null}

              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={!canSubmit}
                loading={saving}
                onPress={() => void handleSubmit()}
              >
                {saving ? 'Updating…' : 'Change PIN'}
              </Button>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
