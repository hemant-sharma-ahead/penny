import { useState } from 'react';
import { View, ScrollView, TextInput as RNTextInput, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, LifeRow, OptionalSeg } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { GoalRisk } from '@/core/db/types';
import { useOnboardingDraft } from '~/context/OnboardingDraftContext';
import type { OnboardingStackParamList } from '~/navigation/OnboardingNavigator';
import { OnboardingBack } from './OnboardingBack';

/**
 * "A bit more about you" — the same optional Life & household fields as Edit Profile, pulled forward
 * into setup so they actually get filled in (they already power the Home advisor's life-stage goal
 * suggestions, which otherwise silently degrade to just a generic Retirement goal).
 */
export function LifeHouseholdScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const theme = useThemeColors();
  const { maritalStatus, homeOwner, riskAppetite, children: kids = [], setDraft } = useOnboardingDraft();
  const [childYear, setChildYear] = useState('');

  function addChild() {
    const yr = parseInt(childYear, 10);
    const thisYear = new Date().getFullYear();
    if (yr >= 1950 && yr <= thisYear && !kids.includes(yr)) {
      setDraft({ children: [...kids, yr].sort((a, b) => a - b) });
      setChildYear('');
    }
  }

  function skip() {
    navigation.navigate('AddAccounts');
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
      <OnboardingBack to="LetUsKnowYou" />
      <ScrollView className="flex-1 px-6 py-10" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 w-full">
          <View className="mb-6 items-center">
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center mb-4"
              style={{ backgroundColor: '#6366f1' }}
            >
              <Icon name="ti-home-heart" size={28} color="#fff" />
            </View>
            <Text className="text-2xl font-semibold text-primary mb-2 text-center">A bit more about you</Text>
            <Text className="text-secondary text-sm text-center">
              Optional — unlocks personalised goals (a child's education corpus, a home fund, the right cover). Skip and
              add it later in Edit Profile any time.
            </Text>
          </View>

          <View className="rounded-2xl bg-surface border border-theme px-4 mb-2">
            <LifeRow icon="ti-heart" label="Relationship">
              <OptionalSeg
                options={[
                  { value: 'single', label: 'Single' },
                  { value: 'married', label: 'Married' }
                ]}
                value={maritalStatus}
                onChange={(v) => setDraft({ maritalStatus: v as 'single' | 'married' | undefined })}
              />
            </LifeRow>
            <LifeRow icon="ti-home" label="Home">
              <OptionalSeg
                options={[
                  { value: 'own', label: 'Own' },
                  { value: 'rent', label: 'Rent' }
                ]}
                value={homeOwner === undefined ? undefined : homeOwner ? 'own' : 'rent'}
                onChange={(v) => setDraft({ homeOwner: v === undefined ? undefined : v === 'own' })}
              />
            </LifeRow>
            <LifeRow icon="ti-chart-line" label="Risk appetite">
              <OptionalSeg
                options={[
                  { value: 'conservative', label: 'Low' },
                  { value: 'moderate', label: 'Med' },
                  { value: 'aggressive', label: 'High' }
                ]}
                value={riskAppetite}
                onChange={(v) => setDraft({ riskAppetite: v as GoalRisk | undefined })}
              />
            </LifeRow>
            <LifeRow icon="ti-baby-carriage" label="Children" alignTop>
              <View className="flex-row flex-wrap items-center justify-end gap-1.5" style={{ maxWidth: 220 }}>
                {kids.map((yr, i) => (
                  <View
                    key={`${yr}-${i}`}
                    className="flex-row items-center gap-1 rounded-full pl-2.5 pr-1.5 py-1 bg-surface-2"
                  >
                    <Text className="text-xs font-semibold text-secondary">{yr}</Text>
                    <Pressable
                      accessibilityLabel={`Remove ${yr}`}
                      onPress={() => setDraft({ children: kids.filter((_, idx) => idx !== i) })}
                    >
                      <Icon name="ti-x" size={13} color={theme.textTertiary} />
                    </Pressable>
                  </View>
                ))}
                <RNTextInput
                  keyboardType="numeric"
                  value={childYear}
                  onChangeText={setChildYear}
                  onSubmitEditing={addChild}
                  onBlur={addChild}
                  placeholder="Birth year"
                  placeholderTextColor={theme.textTertiary}
                  className="text-xs bg-surface-2 rounded-full px-2.5 py-1"
                  style={{ width: 80, color: theme.textPrimary }}
                />
              </View>
            </LifeRow>
          </View>

          <View className="flex-row items-start gap-1 mt-1 mb-6">
            <Icon name="ti-device-mobile" size={11} color={theme.textTertiary} />
            <Text className="text-[10px] text-tertiary flex-1 leading-relaxed">
              Stored encrypted on your device, same as everything else here. Only ever leaves as a 5-year age band.
            </Text>
          </View>

          <View className="mt-auto">
            <Button variant="primary" size="lg" fullWidth onPress={() => navigation.navigate('AddAccounts')}>
              Continue
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
