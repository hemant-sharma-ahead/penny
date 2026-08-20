import { useRef, useState } from 'react';
import { View, Pressable, Text, TextInput as RNTextInput } from 'react-native';
import { Modal, Button, TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { usePrivacy, type PrivacyMode } from '~/context/PrivacyContext';
import { verifyPin } from '@/core/crypto/securityManager';
import { notifyAuthShouldRecheck } from '~/navigation/authRecheckBus';
import { tint } from '~/lib/color';

type Step = null | 'pin' | 'warning';

/**
 * RN port of apps/web-react/src/components/privacy/PrivacyModeSwitcher.tsx — a header icon button,
 * PIN-gated Open mode, and pre-Open warning modal. The PIN/warning steps render on the shared `Modal`
 * component (not a hand-rolled absolutely-positioned overlay) — this component lives inside
 * `MainNavigator`'s native-stack *header*, which (like every RN native header) commonly clips
 * overflowing absolutely-positioned children entirely, so a custom overlay silently never
 * appeared/received touches at all (found via on-device testing, 2026-07-25 — not a hypothetical:
 * `ContextSwitcher`'s dropdown hit this identical problem earlier in the migration and was fixed the
 * same way, see its own file/the plan doc). Real `Modal` renders in RN's own top-level layer, immune
 * to any ancestor's clipping.
 *
 * 2026-08-18: Private mode and Open mode's fixed-duration countdown badge were both removed (real-
 * device testing found the three-mode picker + timer overkill) — this is now a plain Safe/Open toggle.
 * Open still has no persisted default and always auto-reverts to Safe on backgrounding
 * (`PrivacyContext.tsx`'s `AppState` handler) — it just no longer has a visible countdown or a
 * fixed-duration auto-expiry on top of that.
 *
 * 2026-08-20: with only two modes left, a dropdown to pick "the other one" is a needless extra tap —
 * tapping the header icon now directly toggles Safe↔Open (still gated by the same PIN + warning step
 * on the Safe→Open direction; Open→Safe reverts immediately, unchanged, since reverting to the safer
 * mode has never needed a PIN). The mode-picker `Modal` this used to open is gone entirely.
 */
export function PrivacyModeSwitcher() {
  const theme = useThemeColors();
  const { mode, setMode } = usePrivacy();
  const [step, setStep] = useState<Step>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const pinInputRef = useRef<RNTextInput>(null);

  const MODE: Record<PrivacyMode, { label: string; icon: string; color: string }> = {
    safe: { label: 'Safe', icon: 'ti-eye-off', color: theme.warning },
    open: { label: 'Open', icon: 'ti-eye', color: theme.open }
  };
  const active = MODE[mode];

  const handleToggle = () => {
    if (mode === 'open') {
      setMode('safe');
      return;
    }
    setPinInput('');
    setPinError('');
    setStep('pin');
  };

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
  };

  const handleClose = () => {
    setStep(null);
    setPinInput('');
    setPinError('');
  };

  return (
    <>
      <View className="relative">
        <Pressable
          onPress={handleToggle}
          className="w-8 h-8 rounded-full items-center justify-center"
          style={{ backgroundColor: tint(active.color, 14) }}
          accessibilityLabel={`Privacy mode: ${active.label}. Tap to switch to ${MODE[mode === 'open' ? 'safe' : 'open'].label}.`}
        >
          <Icon name={active.icon} size={17} color={active.color} />
        </Pressable>
      </View>

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
           *  splitting the row evenly (the same bug class already fixed in CashFlowPage's buffer modal
           *  and income-suggestion row — this component fell outside every module-scoped sweep since it
           *  lives in `components/privacy/`, not a `features/` module, and was missed until an on-device
           *  screenshot caught it). */}
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
}
