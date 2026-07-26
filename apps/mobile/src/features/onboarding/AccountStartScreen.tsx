import { useEffect } from 'react';
import { View, ScrollView, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { useOnboardingDraft } from '~/context/OnboardingDraftContext';
import type { OnboardingStackParamList } from '~/navigation/OnboardingNavigator';
import type { AccountTab } from './AccountRecoveryScreen';
import { OnboardingBack } from './OnboardingBack';

/**
 * Screen A of the account-start flow (Track F). Opens on the Preview Dashboard's "Set up my account" —
 * and, since 2026-07-25, also on `SettingsPage`'s "Exit Demo Mode" (`fromDemoMode: true` route param),
 * which previously skipped straight to `LetUsKnowYou`, bypassing this mandatory username+claim entry
 * point entirely (a real bug found via on-device testing, not a deliberate simplification — web-react
 * has the same stale wiring in its own `SettingsPage.tsx`, unfixed there too). Three plain doors — new /
 * restore / reclaim — each honest about what it recovers. Tapping a card opens Screen B
 * (AccountRecoveryScreen) with that tab pre-selected, so the user can still switch between them.
 */
interface Choice {
  tab: AccountTab;
  icon: string;
  tone: 'green' | 'indigo' | 'amber';
  title: string;
  detail: string;
}

const CHOICES: Choice[] = [
  {
    tab: 'new',
    icon: 'ti-sparkles',
    tone: 'green',
    title: 'Start fresh',
    detail: 'New to Penny — or starting over after erasing, with nothing to restore. Sets up a brand-new account.'
  },
  {
    tab: 'restore',
    icon: 'ti-cloud-download',
    tone: 'indigo',
    title: 'Restore from backup',
    detail:
      'Reinstalled or erased but have a backup? Bring back your data, groups & handle from Drive, iCloud, or a file. Needs your passphrase.'
  },
  {
    tab: 'reclaim',
    icon: 'ti-id-badge-2',
    tone: 'amber',
    title: 'Reclaim my handle',
    detail:
      'No backup? Recover your username with your passphrase. Handle & groups return; personal data needs a backup.'
  }
];

export function AccountStartScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const route = useRoute<RouteProp<OnboardingStackParamList, 'Start'>>();
  const theme = useThemeColors();
  const { setDraft } = useOnboardingDraft();

  // "Exit Demo Mode" lands here directly (see file header) — record it in the shared draft once, up
  // front, same as `LetUsKnowYouScreen`'s own `cameFromDemoExit` effect; `SetupCredentialsScreen` reads
  // `draft.fromDemoMode` from context, not a route param, so it doesn't matter that `Account`/
  // `LetUsKnowYou` don't explicitly thread this param onward — the draft persists across the whole flow.
  const cameFromDemoExit = !!route.params?.fromDemoMode;
  useEffect(() => {
    if (cameFromDemoExit) setDraft({ fromDemoMode: true });
  }, [cameFromDemoExit, setDraft]);
  const TONE: Record<Choice['tone'], { bg: string; fg: string }> = {
    green: { bg: tint(theme.primary, 12), fg: theme.primary },
    indigo: { bg: tint('#6366f1', 12), fg: '#6366f1' },
    amber: { bg: tint(theme.warning, 16), fg: theme.warning }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
      <OnboardingBack to="SimulatedDashboard" />
      <ScrollView className="flex-1 px-6 py-10" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 w-full">
          <View className="mb-8 items-center">
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center mb-4"
              style={{ backgroundColor: theme.primary }}
            >
              <Icon name="ti-user-shield" size={28} color="#fff" />
            </View>
            <Text className="text-2xl font-semibold text-primary mb-2 text-center">How would you like to start?</Text>
            <Text className="text-sm text-secondary text-center">
              New to Penny, or coming back after a reinstall, a new device, or erasing your data?
            </Text>
          </View>

          <View className="gap-3">
            {CHOICES.map((c) => (
              <Pressable
                key={c.tab}
                onPress={() => navigation.navigate('Account', { tab: c.tab })}
                className="flex-row items-start gap-3 bg-surface border border-theme rounded-2xl p-4"
              >
                <View
                  className="w-11 h-11 rounded-xl items-center justify-center shrink-0"
                  style={{ backgroundColor: TONE[c.tone].bg }}
                >
                  <Icon name={c.icon} size={22} color={TONE[c.tone].fg} />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-bold text-primary">{c.title}</Text>
                  <Text className="text-xs text-secondary leading-relaxed mt-0.5">{c.detail}</Text>
                </View>
                <Icon name="ti-chevron-right" size={18} color={theme.textTertiary} />
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
