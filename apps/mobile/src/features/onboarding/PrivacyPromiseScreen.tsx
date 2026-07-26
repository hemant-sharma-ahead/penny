import { useState } from 'react';
import { View, ScrollView, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ALLOWED_DOMAINS } from '@/core/ai-safety/piiScanner';
import { Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { OnboardingStackParamList } from '~/navigation/OnboardingNavigator';

const pillars = [
  {
    icon: 'ti-server-off',
    title: '0 bytes readable by us',
    detail: 'Our servers only ever see your handle and scrambled data they can’t unlock — never your real numbers.'
  },
  {
    icon: 'ti-world-check',
    title: `${ALLOWED_DOMAINS.length} permitted domains`,
    detail: ALLOWED_DOMAINS.join(' · ')
  },
  {
    icon: 'ti-eye-off',
    title: '0 trackers',
    detail: 'No analytics SDK, no crash reporter, no ad pixel. Nothing that phones home without your knowledge.'
  },
  {
    icon: 'ti-lock',
    title: 'AES-256-GCM encryption',
    detail: 'Everything sensitive is encrypted on your device using your passphrase before it touches storage.'
  },
  {
    icon: 'ti-cloud-lock',
    title: 'Your backup, your cloud',
    detail:
      'If you choose to back up, it goes to your own Google Drive or iCloud — never ours — and stays encrypted the whole way.'
  }
];

export function PrivacyPromiseScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const theme = useThemeColors();
  const [agreed, setAgreed] = useState(false);

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
      <ScrollView className="flex-1 px-6 py-10" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 w-full">
          <View className="mb-8 items-center">
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center mb-4"
              style={{ backgroundColor: theme.primary }}
            >
              <Icon name="ti-shield-check" size={28} color="#fff" />
            </View>
            <Text className="text-2xl font-semibold text-primary mb-2 text-center">Our privacy promise</Text>
            <Text className="text-secondary text-sm text-center">
              We built Penny for people who want wealth tools without surveillance.
            </Text>
          </View>

          <View className="gap-3 mb-8">
            {pillars.map((p) => (
              <View
                key={p.title}
                className="flex-row items-start gap-3 bg-surface-2 rounded-xl p-4 border border-theme"
              >
                <View
                  className="w-9 h-9 rounded-lg items-center justify-center shrink-0"
                  style={{ backgroundColor: theme.primary }}
                >
                  <Icon name={p.icon} size={18} color="#fff" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-primary">{p.title}</Text>
                  <Text className="text-xs text-secondary mt-0.5 leading-relaxed">{p.detail}</Text>
                </View>
              </View>
            ))}
          </View>

          <Pressable onPress={() => setAgreed((v) => !v)} className="flex-row items-start gap-2.5 mb-4">
            <Icon name={agreed ? 'ti-square-rounded-check' : 'ti-square-rounded'} size={20} color={theme.primary} />
            <Text className="text-xs text-secondary leading-relaxed flex-1">
              I agree to Penny&apos;s <Text className="font-medium text-primary">Terms of Use</Text> and{' '}
              <Text className="font-medium text-primary">Privacy Policy</Text>.
            </Text>
          </Pressable>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!agreed}
            onPress={() => navigation.navigate('PrivacyDemo')}
          >
            I&apos;m in — continue
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
