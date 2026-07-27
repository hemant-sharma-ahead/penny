import { useEffect, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Modal, Button, TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { usePrivacy, type PrivacyMode } from '~/context/PrivacyContext';
import { verifyPin } from '@/core/crypto/securityManager';
import { notifyAuthShouldRecheck } from '~/navigation/authRecheckBus';
import { tint } from '~/lib/color';

const MODE_ORDER: PrivacyMode[] = ['safe', 'privacy', 'open'];

type Step = null | 'pin' | 'warning';

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * RN port of apps/web-react/src/components/privacy/PrivacyModeSwitcher.tsx — same three-mode
 * (Safe/Private/Open) icon button + dropdown, PIN-gated Open mode, and pre-Open warning modal.
 * The mode-picker dropdown renders on the shared `Modal` component (not a hand-rolled
 * absolutely-positioned overlay) — this component lives inside `MainNavigator`'s native-stack
 * *header*, which (like every RN native header) commonly clips overflowing absolutely-positioned
 * children entirely, so a custom overlay silently never appeared/received touches at all (found via
 * on-device testing, 2026-07-25 — not a hypothetical: `ContextSwitcher`'s dropdown hit this identical
 * problem earlier in the migration and was fixed the same way, see its own file/the plan doc). Real
 * `Modal` renders in RN's own top-level layer, immune to any ancestor's clipping.
 */
export function PrivacyModeSwitcher() {
  const theme = useThemeColors();
  const { mode, setMode, openModeExpiresAt } = usePrivacy();
  const [step, setStep] = useState<Step>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [tickNow, setTickNow] = useState(() => Date.now());

  useEffect(() => {
    if (!openModeExpiresAt) return;
    const id = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [openModeExpiresAt]);
  const openCountdown = openModeExpiresAt ? formatCountdown(openModeExpiresAt - tickNow) : null;

  const MODE: Record<PrivacyMode, { label: string; icon: string; color: string }> = {
    safe: { label: 'Safe', icon: 'ti-eye-off', color: theme.warning },
    privacy: { label: 'Private', icon: 'ti-shield-lock', color: theme.privacy },
    open: { label: 'Open', icon: 'ti-eye', color: theme.open }
  };
  const active = MODE[mode];

  const handleSelect = (target: PrivacyMode) => {
    setMenuOpen(false);
    if (target === mode) return;
    if (target === 'open') {
      setPinInput('');
      setPinError('');
      setStep('pin');
    } else {
      setMode(target);
    }
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
          onPress={() => setMenuOpen(true)}
          className="w-8 h-8 rounded-full items-center justify-center"
          style={{ backgroundColor: tint(active.color, 14) }}
          accessibilityLabel={`Privacy mode: ${active.label}${openCountdown ? `, reverts in ${openCountdown}` : ''}. Tap to change.`}
        >
          <Icon name={active.icon} size={17} color={active.color} />
        </Pressable>
        {openCountdown && (
          <View
            className="absolute -bottom-1.5 self-center px-1 rounded-full"
            style={{ backgroundColor: theme.open, left: 4 }}
          >
            <Text className="font-bold text-white" style={{ fontSize: 8 }}>
              {openCountdown}
            </Text>
          </View>
        )}
      </View>

      {menuOpen && (
        <Modal title="Privacy mode" onClose={() => setMenuOpen(false)} size="sm">
          <View>
            {MODE_ORDER.map((m) => {
              const { label, icon, color } = MODE[m];
              const isActive = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => handleSelect(m)}
                  className={`flex-row items-center gap-2.5 px-3 py-3 rounded-xl ${isActive ? 'bg-surface-2' : ''}`}
                >
                  <Icon name={icon} size={16} color={color} />
                  <Text className="flex-1 text-sm font-medium text-primary">{label}</Text>
                  {isActive && <Icon name="ti-check" size={15} color={theme.primary} />}
                </Pressable>
              );
            })}
          </View>
        </Modal>
      )}

      {step === 'pin' && (
        <Modal onClose={handleClose} size="sm">
          <View
            className="w-12 h-12 rounded-full items-center justify-center self-center mb-1"
            style={{ backgroundColor: tint(theme.primary, 13) }}
          >
            <Icon name="ti-lock-open" size={24} color={theme.primary} />
          </View>
          <Text className="text-lg font-semibold text-center text-primary">Switch to Open mode</Text>
          <Text className="text-sm text-center text-secondary">Enter your PIN to reveal all financial values.</Text>

          <TextInput
            value={pinInput}
            onChange={(v) => setPinInput(v.replace(/\D/g, ''))}
            placeholder="6-digit PIN"
            maxLength={6}
            inputClassName="text-center tracking-widest text-2xl"
            keyboardType="number-pad"
            secureTextEntry
            autoFocus
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
