import { View, ScrollView, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { OnboardingStackParamList } from '~/navigation/OnboardingNavigator';

const mockNetWorth = '₹15,43,200';
const mockChange = '+₹23,400 this month';

const tiles = [
  { icon: 'ti-chart-pie', label: 'Portfolio', value: '₹9,80,000', sub: '5 holdings' },
  { icon: 'ti-wallet', label: 'Expenses', value: '₹42,300', sub: 'this month' },
  { icon: 'ti-target', label: 'Goals', value: '2 active', sub: '1 on track' },
  { icon: 'ti-shield', label: 'Insurance', value: '₹1.5Cr', sub: 'coverage' }
];

export function SimulatedDashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const theme = useThemeColors();

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-secondary">
      <ScrollView className="flex-1 px-6 py-10" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 w-full">
          {/* This screen has no hero icon above the title (unlike most onboarding screens), so the
              shared `OnboardingBack` (an absolute top-left overlay) left a conspicuous gap above the
              heading with nothing to visually anchor it. Inline back arrow + centered title instead,
              vertically centered together in one row. */}
          <View className="flex-row items-center mb-6">
            <Pressable
              onPress={() => navigation.navigate('ChipIntro')}
              accessibilityLabel="Go back"
              hitSlop={8}
              className="w-9 h-9 items-center justify-center rounded-full -ml-2"
            >
              <Icon name="ti-arrow-left" size={20} color={theme.textSecondary} />
            </Pressable>
            <View className="flex-1 items-center pr-9">
              <Text className="text-2xl font-semibold text-primary mb-1 text-center">Here's a preview</Text>
              <Text className="text-secondary text-sm text-center">
                Sample data — your real numbers will look like this.
              </Text>
            </View>
          </View>

          <View className="rounded-2xl p-5 mb-4" style={{ backgroundColor: theme.primary }}>
            <Text className="text-sm mb-1" style={{ color: '#fff', opacity: 0.8 }}>
              Net worth
            </Text>
            <Text className="text-3xl font-semibold tracking-tight" style={{ color: '#fff' }}>
              {mockNetWorth}
            </Text>
            <View className="flex-row items-center gap-1 mt-1">
              <Icon name="ti-trending-up" size={14} color="#fff" />
              <Text className="text-sm" style={{ color: '#fff', opacity: 0.7 }}>
                {mockChange}
              </Text>
            </View>
          </View>

          <View className="flex-row flex-wrap gap-3 mb-4">
            {tiles.map((tile) => (
              <View
                key={tile.label}
                className="bg-surface border border-theme rounded-xl p-3.5"
                style={{ width: '48%' }}
              >
                <View className="flex-row items-center gap-2 mb-2">
                  <Icon name={tile.icon} size={16} color={theme.primary} />
                  <Text className="text-xs font-medium text-secondary">{tile.label}</Text>
                </View>
                <Text className="text-sm font-semibold text-primary">{tile.value}</Text>
                <Text className="text-xs text-tertiary">{tile.sub}</Text>
              </View>
            ))}
          </View>

          <View className="bg-surface border border-theme rounded-xl p-4 mb-6">
            <View className="flex-row items-center gap-2 mb-2">
              <View
                className="w-6 h-6 rounded-full items-center justify-center"
                style={{ backgroundColor: theme.primary }}
              >
                <Icon name="ti-sparkles" size={12} color="#fff" />
              </View>
              <Text className="text-xs font-medium text-secondary">Chip insight</Text>
            </View>
            <Text className="text-sm text-primary leading-relaxed">
              Your emergency fund covers 2.1 months of expenses. Building it to 6 months would improve your financial
              health score by 18 points.
            </Text>
          </View>

          <View className="gap-2.5">
            {/* Web uses a gradient background here (`linear-gradient(90deg, #7c3aed, #9333ea)`) — flattened
                to a flat color on mobile since `Button`'s `style` prop only sets `backgroundColor`, no
                gradient support. Wrapping the shared `Button` in `expo-linear-gradient` and forcing its
                own background transparent restores the gradient without a one-off custom pressable. */}
            <LinearGradient
              colors={['#7c3aed', '#9333ea']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ borderRadius: 12 }}
            >
              <Button
                variant="primary"
                size="lg"
                fullWidth
                style={{ backgroundColor: 'transparent' }}
                onPress={() => navigation.navigate('DemoVault')}
              >
                Explore with Demo Data
              </Button>
            </LinearGradient>
            <Button variant="primary" size="lg" fullWidth onPress={() => navigation.navigate('Start')}>
              Setup my Account
            </Button>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
