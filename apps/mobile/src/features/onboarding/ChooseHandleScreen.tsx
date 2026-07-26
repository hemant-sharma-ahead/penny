import { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { checkUsername, claimAccount, UsernameTakenError } from '@/core/identity/claim';
import { isValidUsername } from '@/core/profile/username';
import { Button, TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';

/**
 * Screen ④ of the account-start flow (Track F). Shown after a restore when the account was deregistered
 * and its old handle is no longer free. Everything is already restored + safe — only the public handle
 * needs changing. Rendered as a full-screen overlay by IdentityReconciler; not a route.
 *
 * Not in the plan's original 13-screen list, but a required compile-time dependency of
 * IdentityReconciler.tsx (which the plan does list) — ported here as a minimal addition so
 * IdentityReconciler actually has something to render for its `needs_handle` phase. Flagged in the
 * final report as a deviation.
 */
export function ChooseHandleScreen({ oldHandle, onDone }: { oldHandle: string; onDone: () => void }) {
  const theme = useThemeColors();
  // Seed with a suggested variant of the old handle (editable, deterministic). The live availability
  // check below tells the user if the suggestion (or their edit) is free.
  const suggestion = `${oldHandle.replace(/_+$/, '').slice(0, 18)}1`;
  const [value, setValue] = useState(suggestion);
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Debounced availability check. State is only set inside the timeout / onChange (never directly in the
  // effect body) to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!isValidUsername(value)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setAvailability('checking');
      void checkUsername(value)
        .then((r) => !cancelled && setAvailability(r.available ? 'available' : 'taken'))
        .catch(() => !cancelled && setAvailability('idle'));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value]);

  function onChangeValue(v: string) {
    setValue(v.toLowerCase());
    setAvailability('idle');
  }

  async function handleClaim() {
    if (availability !== 'available' || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await claimAccount(value);
      onDone();
    } catch (err) {
      setError(err instanceof UsernameTakenError ? 'Just taken — try another.' : 'Could not claim. Try again.');
      setBusy(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
      <ScrollView className="flex-1 px-6 py-10" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 w-full">
          <View className="mb-8 items-center">
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center mb-4"
              style={{ backgroundColor: theme.warning }}
            >
              <Icon name="ti-user-question" size={28} color="#fff" />
            </View>
            <Text className="text-2xl font-semibold text-primary mb-2 text-center">Your handle is taken</Text>
            <Text className="text-sm text-secondary text-center">
              <Text className="font-semibold text-primary">@{oldHandle}</Text> is no longer available. Your data is
              restored and safe — just pick a new handle to finish.
            </Text>
          </View>

          <TextInput
            label="New username"
            value={value}
            onChange={onChangeValue}
            placeholder="e.g. aarav_sharma"
            error={value.length > 0 && !isValidUsername(value) ? '3–20 lowercase letters, numbers, or _' : undefined}
            hint={
              availability === 'checking'
                ? 'Checking…'
                : availability === 'available'
                  ? '✓ Available'
                  : availability === 'taken'
                    ? 'Taken — try another'
                    : undefined
            }
          />

          {error && <Text className="text-danger text-sm mt-3 text-center">{error}</Text>}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="mt-6"
            icon="ti-shield-check"
            disabled={availability !== 'available' || busy}
            loading={busy}
            onPress={() => void handleClaim()}
          >
            Claim & continue
          </Button>

          <View
            className="mt-4 flex-row items-start gap-2 rounded-xl px-3 py-2.5"
            style={{ backgroundColor: tint(theme.info, 12) }}
          >
            <Icon name="ti-info-circle" size={14} color={theme.info} />
            <Text className="text-xs text-secondary flex-1">
              Only your public handle changes. Your data, encryption keys, and account are unchanged. Group members will
              see the new handle.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
