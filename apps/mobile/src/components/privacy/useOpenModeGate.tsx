import { useCallback, useRef, useState } from 'react';
import { View, Text, TextInput as RNTextInput } from 'react-native';
import { Modal, Button, TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { usePrivacy } from '~/context/PrivacyContext';
import { verifyPin } from '@/core/crypto/securityManager';
import { notifyAuthShouldRecheck } from '~/navigation/authRecheckBus';
import { tint } from '~/lib/color';

type Step = null | 'pin' | 'warning';

/**
 * The PIN + pre-Open warning gate for switching into Open mode — extracted 2026-08-29 (punch-list item
 * 12) out of `PrivacyModeSwitcher.tsx` (the header icon button), which was previously the only caller.
 * `SettingsPage.tsx`'s "Default to Open mode" row (`DefaultOpenModeRow`) is the second caller, and per
 * the item spec must drive this exact same gate rather than a parallel PIN check — extracting it here is
 * what makes that "exact same gate" true by construction instead of by convention.
 *
 * Call `requestOpen()` to start the flow; render `modal` alongside whatever trigger UI calls it. An
 * optional `onConfirmed` callback runs immediately after the user completes the flow and `mode` has
 * already been set to `'open'` — `DefaultOpenModeRow` uses it to arm its 3-day persisted default in the
 * same action; `PrivacyModeSwitcher` (a plain, temporary switch) doesn't pass one.
 */
export function useOpenModeGate() {
  const theme = useThemeColors();
  const { setMode } = usePrivacy();
  const [step, setStep] = useState<Step>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const pinInputRef = useRef<RNTextInput>(null);
  const onConfirmedRef = useRef<(() => void) | null>(null);

  const requestOpen = useCallback((onConfirmed?: () => void) => {
    onConfirmedRef.current = onConfirmed ?? null;
    setPinInput('');
    setPinError('');
    setStep('pin');
  }, []);

  const handlePinConfirm = async () => {
    if (pinInput.length !== 6) return;
    setVerifying(true);
    setPinError('');
    const res = await verifyPin(pinInput);
    setVerifying(false);
    if (res.status === 'ok') {
      setPinInput('');
      setStep('warning');
    } else if (res.status === 'wiped') {
      notifyAuthShouldRecheck();
    } else if (res.status === 'locked_out') {
      setPinError('Too many attempts — try again later.');
      setPinInput('');
    } else {
      setPinError(
        res.attemptsRemaining > 0
          ? `Incorrect PIN — ${res.attemptsRemaining} attempt${res.attemptsRemaining === 1 ? '' : 's'} left`
          : 'Incorrect PIN'
      );
      setPinInput('');
    }
  };

  const handleConfirmOpen = () => {
    setMode('open');
    setStep(null);
    const onConfirmed = onConfirmedRef.current;
    onConfirmedRef.current = null;
    onConfirmed?.();
  };

  const handleClose = () => {
    setStep(null);
    setPinInput('');
    setPinError('');
    onConfirmedRef.current = null;
  };

  const modal = (
    <>
      {step === 'pin' && (
        <Modal onClose={handleClose} size="sm" onShow={() => pinInputRef.current?.focus()}>
          <View
            className="w-12 h-12 rounded-full items-center justify-center self-center mb-1"
            style={{ backgroundColor: tint(theme.primary, 13) }}
          >
            <Icon name="ti-lock-open" size={24} color={theme.primary} />
          </View>
          <Text className="text-lg font-semibold text-center text-primary">Switch to Open mode</Text>
          <Text className="text-sm text-center text-secondary">Enter your PIN to reveal all financial values.</Text>

          <TextInput
            ref={pinInputRef}
            value={pinInput}
            onChange={(v) => setPinInput(v.replace(/\D/g, ''))}
            placeholder="6-digit PIN"
            maxLength={6}
            inputClassName="text-center tracking-widest text-2xl"
            keyboardType="number-pad"
            secureTextEntry
            error={pinError || undefined}
          />

          {/* Each button gets its own `flex-1` wrapper, not just `fullWidth` — two `fullWidth` (`w-full`)
           *  siblings in a `flex-row` both try to take 100% width and overflow/overlap instead of
           *  splitting the row evenly. */}
          <View className="flex-row gap-3 mt-1">
            <View className="flex-1">
              <Button variant="secondary" fullWidth onPress={handleClose}>
                Cancel
              </Button>
            </View>
            <View className="flex-1">
              <Button
                fullWidth
                onPress={() => void handlePinConfirm()}
                disabled={pinInput.length !== 6 || verifying}
                loading={verifying}
              >
                Unlock
              </Button>
            </View>
          </View>
        </Modal>
      )}

      {step === 'warning' && (
        <Modal onClose={handleClose} size="sm">
          <View className="w-12 h-12 rounded-full items-center justify-center self-center mb-1 bg-red-500/10">
            <Icon name="ti-alert-triangle" size={24} color={theme.danger} />
          </View>
          <Text className="text-lg font-semibold text-center text-primary mb-2">Before switching to Open mode</Text>

          <View className="rounded-xl px-4 py-3" style={{ backgroundColor: theme.open }}>
            <Text className="text-sm leading-relaxed text-white">
              Make sure no one can see your screen — check that you are not on a screen share, video call, or in a
              public place where someone could be looking over your shoulder. All your financial details including
              amounts, account information, and portfolio holdings will be fully visible to anyone who can see your
              screen.
            </Text>
          </View>

          <Button fullWidth onPress={handleClose}>
            Cancel
          </Button>
          <Button variant="secondary" fullWidth onPress={handleConfirmOpen}>
            I'm sure, switch to Open
          </Button>
        </Modal>
      )}
    </>
  );

  return { requestOpen, modal };
}
