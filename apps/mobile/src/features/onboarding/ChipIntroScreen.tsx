import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChipAvatar } from '~/components/ui/ChipAvatar';
import { Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { OnboardingStackParamList } from '~/navigation/OnboardingNavigator';
import { OnboardingBack } from './OnboardingBack';

const mockInsights = [
  {
    icon: 'ti-trending-up',
    tag: 'Portfolio',
    text: 'Your SIP in Parag Parikh Flexi Cap has underperformed its benchmark by 2.3% over 12 months. Consider a review.'
  },
  {
    icon: 'ti-calendar-due',
    tag: 'Tax',
    text: '₹32,000 of your ₹1.5L 80C limit is still unused. You have 6 weeks before the deadline.'
  },
  {
    icon: 'ti-repeat',
    tag: 'Subscriptions',
    text: "You haven't used Hotstar in 47 days but ₹299 was charged last week. Cancel to save ₹3,588/year."
  }
];

export function ChipIntroScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const theme = useThemeColors();

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
      <OnboardingBack to="PrivacyDemo" />
      <ScrollView className="flex-1 px-6 py-10" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 w-full">
          <View className="mb-8 items-center">
            <View className="mb-4">
              <ChipAvatar size={56} />
            </View>
            <Text className="text-2xl font-semibold text-primary mb-2 text-center">Meet Chip</Text>
            <Text className="text-secondary text-sm text-center">
              Your AI money coach. Context-aware, always shows its reasoning, and never shares your data.
            </Text>
          </View>

          <Text className="text-xs font-medium text-tertiary uppercase tracking-wide mb-3">Sample insights</Text>
          <View className="gap-3 mb-8">
            {mockInsights.map((insight) => (
              <View key={insight.tag} className="bg-surface-2 border border-theme rounded-xl p-4">
                <View className="flex-row items-center gap-2 mb-2">
                  <View
                    className="w-6 h-6 rounded-md items-center justify-center"
                    style={{ backgroundColor: theme.primary }}
                  >
                    <Icon name={insight.icon} size={12} color="#fff" />
                  </View>
                  <Text className="text-xs font-medium text-secondary">{insight.tag}</Text>
                </View>
                <Text className="text-sm text-primary leading-relaxed">{insight.text}</Text>
              </View>
            ))}
          </View>

          <View className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
            <Text className="text-xs leading-relaxed" style={{ color: '#92400e' }}>
              Chip anonymises your data before any AI call. Amounts are banded, names are removed, and every call is
              logged in your Privacy Centre.
            </Text>
          </View>

          <Button variant="primary" size="lg" fullWidth onPress={() => navigation.navigate('SimulatedDashboard')}>
            See my dashboard
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
