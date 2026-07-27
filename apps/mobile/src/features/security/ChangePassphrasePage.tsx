import { useState } from 'react';
import { View, Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, PageHeader, TextInput, Banner, PassphraseStrengthMeter } from '~/components/ui';
import { BackButton } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { changePassphrase } from '@/core/crypto/securityManager';
import { claimAccount, getClaimState } from '@/core/identity/claim';
import { usePassphraseStrength } from '@/hooks/usePassphraseStrength';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';

/**
 * RN port of apps/web-react/src/features/security/ChangePassphrasePage.tsx. Pure UI port —
 * `securityManager.changePassphrase` only re-wraps the DMK, data is never re-encrypted (CLAUDE.md's
 * encryption rules). `usePassphraseStrength` is already platform-agnostic (packages/core/src/hooks).
 */
export function ChangePassphrasePage() {
  const modeBg = useModeBackgroundColor();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const theme = useThemeColors();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const { score } = usePassphraseStrength(next);
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = current.length > 0 && score >= 3 && next === confirm && current !== next && !saving && !done;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      const result = await changePassphrase(current, next);
      if (result === 'ok') {
        // The passphrase-recovery verifier is passphrase-derived, so a change re-derives it. Re-upload it
        // for a claimed account so future reclaims match the new passphrase (best-effort — Track F, F3).
        const claim = await getClaimState();
        if (claim.claimed && claim.username) await claimAccount(claim.username).catch(() => undefined);
        setDone(true);
        setTimeout(() => navigation.navigate('MainTabs'), 1200);
        return;
      } else if (result === 'wrong_passphrase') {
        setError('Your current passphrase is incorrect.');
      } else if (result === 'too_soon') {
        setError('You can only change your passphrase once a day. Please try again later.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      // Found via the 2026-07-25 audit — a thrown error (not just a resolved failure result) used to
      // leave `saving` stuck at `true` forever, same bug class as SettingsPage's Exit Demo Mode.
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader leading={<BackButton />} title="Change Passphrase" />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-4 py-4 gap-4">
          <Text className="text-sm text-secondary">
            Your passphrase protects your encryption key. Changing it re-wraps the key instantly — your data is never
            re-encrypted, and your old passphrase stops working.
          </Text>

          {done ? (
            <Banner variant="success">Passphrase changed. Keep it safe — there is no way to recover it if lost.</Banner>
          ) : (
            <>
              <TextInput
                label="Current passphrase"
                secureTextEntry
                value={current}
                onChange={setCurrent}
                placeholder="Enter current passphrase"
              />

              <View>
                <View className="relative">
                  <TextInput
                    label="New passphrase"
                    secureTextEntry={!showNew}
                    value={next}
                    onChange={setNext}
                    placeholder="Use a phrase you'll remember"
                    error={current.length > 0 && current === next ? 'New passphrase must be different' : undefined}
                  />
                  <Pressable
                    onPress={() => setShowNew((v) => !v)}
                    className="absolute right-3 top-9"
                    accessibilityLabel={showNew ? 'Hide passphrase' : 'Show passphrase'}
                  >
                    <Icon name={showNew ? 'ti-eye-off' : 'ti-eye'} size={18} color={theme.textTertiary} />
                  </Pressable>
                </View>
                {next.length > 0 && <PassphraseStrengthMeter score={score} />}
              </View>

              <TextInput
                label="Confirm new passphrase"
                secureTextEntry
                value={confirm}
                onChange={setConfirm}
                placeholder="Re-enter your new passphrase"
                error={mismatch ? "Passphrases don't match" : undefined}
              />

              {error && <Text className="text-danger text-sm text-center">{error}</Text>}

              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={!canSubmit}
                loading={saving}
                onPress={() => void handleSubmit()}
              >
                {saving ? 'Updating…' : 'Change Passphrase'}
              </Button>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
