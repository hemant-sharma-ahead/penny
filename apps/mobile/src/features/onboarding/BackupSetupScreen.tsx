import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { getProvider } from '@/core/sync/providers';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { useOnboardingDraft, type BackupChoice } from '~/context/OnboardingDraftContext';
import type { OnboardingStackParamList } from '~/navigation/OnboardingNavigator';
import { OnboardingBack } from './OnboardingBack';

interface Option {
  value: BackupChoice;
  icon: string;
  title: string;
  detail: string;
  disabled?: boolean;
}

/**
 * Surfaced during setup (not just as a later nudge) because Model B means a lost device with no
 * backup is unrecoverable, by design — this is the single most consequential thing to get across.
 * Only records the choice here; the live Google Drive connect flow itself runs post-setup on the real
 * Backup page (not ported this pass — out of scope, see `docs/plans/mobile-migration.md`) —
 * `SetupCredentialsScreen` always lands on `MainTabs` regardless of this choice for now.
 */
export function BackupSetupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const theme = useThemeColors();
  const { backupChoice, setDraft } = useOnboardingDraft();

  const driveAvailable = hasEntitlement('cloud_backup') && getProvider('google-drive').isAvailable();
  const icloudAvailable = getProvider('icloud').isAvailable();

  const options: Option[] = [
    {
      value: 'local',
      icon: 'ti-device-mobile',
      title: 'This device only',
      detail: 'No off-device copy — a lost phone means lost data.'
    },
    {
      value: 'google-drive',
      icon: 'ti-brand-google-drive',
      title: 'Google Drive',
      detail: driveAvailable
        ? "Encrypted before it leaves your device — Penny can't read it either."
        : 'Google Drive activates once configured for this build.',
      disabled: !driveAvailable
    },
    {
      value: 'icloud',
      icon: 'ti-brand-apple',
      title: 'iCloud',
      detail: icloudAvailable
        ? 'Encrypted, synced via your iCloud account.'
        : 'Available in the Penny app (native) — coming soon.',
      disabled: !icloudAvailable
    }
  ];

  const selected: BackupChoice = backupChoice ?? 'google-drive';

  function handleContinue() {
    setDraft({ backupChoice: selected });
    navigation.navigate('SetupCredentials');
  }

  function skip() {
    setDraft({ backupChoice: 'skip' });
    navigation.navigate('SetupCredentials');
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
      <OnboardingBack to="AddAccounts" />
      <ScrollView className="flex-1 px-6 py-10" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 w-full">
          <View className="mb-6 items-center">
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center mb-4"
              style={{ backgroundColor: theme.warning }}
            >
              <Icon name="ti-cloud-lock" size={28} color="#fff" />
            </View>
            <Text className="text-2xl font-semibold text-primary mb-2 text-center">Back up your data</Text>
            <Text className="text-secondary text-sm text-center">
              Your data lives only on this device unless you back it up. Takes a minute — you can change this any time
              in Settings.
            </Text>
          </View>

          <View className="gap-2.5 mb-4">
            {options.map((o) => {
              const isSelected = selected === o.value;
              return (
                <Pressable
                  key={o.value}
                  disabled={o.disabled}
                  onPress={() => setDraft({ backupChoice: o.value })}
                  className="flex-row items-center gap-3 rounded-2xl border p-3.5"
                  style={{
                    borderColor: isSelected ? theme.primary : theme.border,
                    backgroundColor: isSelected ? tint(theme.primary, 6) : undefined,
                    opacity: o.disabled ? 0.55 : 1
                  }}
                >
                  <View className="w-9 h-9 rounded-xl bg-surface-2 items-center justify-center shrink-0">
                    <Icon name={o.icon} size={16} color={theme.textSecondary} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-primary">{o.title}</Text>
                    <Text className="text-[11px] text-tertiary leading-relaxed mt-0.5">{o.detail}</Text>
                  </View>
                  <View
                    className="w-4 h-4 rounded-full border-2 shrink-0"
                    style={
                      isSelected
                        ? { borderColor: theme.primary, backgroundColor: theme.primary }
                        : { borderColor: theme.border }
                    }
                  />
                </Pressable>
              );
            })}
          </View>

          <View className="flex-row items-start gap-1 mb-6">
            <Icon name="ti-cloud-lock" size={11} color={theme.info} />
            <Text className="text-[10px] text-tertiary flex-1 leading-relaxed">
              Optional — goes to your own Google Drive or iCloud, still fully encrypted. We never hold a copy ourselves,
              either way.
            </Text>
          </View>

          <View className="mt-auto gap-2.5">
            <Button variant="primary" size="lg" fullWidth onPress={handleContinue}>
              {selected === 'local' ? 'Continue' : `Continue with ${selected === 'google-drive' ? 'Drive' : 'iCloud'}`}
            </Button>
            <Button variant="ghost" size="lg" fullWidth onPress={skip}>
              Skip for now
            </Button>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
