import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PennyLogo } from '~/components/ui/PennyLogo';
import { Icon } from '~/components/Icon';
import type { OnboardingStackParamList } from '~/navigation/OnboardingNavigator';

export function SplashScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.navigate('PrivacyPromise');
    }, 2000);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View className="flex-1 items-center justify-center bg-surface-tertiary px-6">
      <View className="mb-6">
        <PennyLogo size={80} />
      </View>
      <Text className="text-4xl font-semibold text-primary mb-2 tracking-tight">Penny</Text>
      <Text className="text-tertiary text-base text-center">Chip in. Watch it grow.</Text>
      <View className="mt-10 flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200">
        <Icon name="ti-shield-check" size={14} color="#b45309" />
        <Text className="text-xs font-medium" style={{ color: '#b45309' }}>
          Safe mode active
        </Text>
      </View>
    </View>
  );
}
