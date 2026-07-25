import { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, TextInput, OptionButton } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { EMPLOYMENT_OPTIONS } from '@/core/profile/employment';
import { isValidUsername } from '@/core/profile/username';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { checkUsername } from '@/core/identity/claim';
import { deriveAge } from '@/lib/date';
import { useOnboardingDraft } from '~/context/OnboardingDraftContext';
import type { OnboardingStackParamList } from '~/navigation/OnboardingNavigator';
import { OnboardingBack } from './OnboardingBack';

/** A short "where this lives" caption, same visual language as the existing "why we ask" captions —
 *  broad promise lives on the Privacy Promise screen; this is the specific, per-field reinforcement. */
function WhereCaption({ icon, color, children }: { icon: string; color: string; children: string }) {
  return (
    <View className="flex-row items-start gap-1 mt-1">
      <Icon name={icon} size={11} color={color} />
      <Text className="text-[10px] text-tertiary flex-1 leading-relaxed">{children}</Text>
    </View>
  );
}

export function LetUsKnowYouScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const route = useRoute<RouteProp<OnboardingStackParamList, 'LetUsKnowYou'>>();
  const theme = useThemeColors();
  // Drive inputs straight from the draft so going back/forward preserves everything.
  const { fullName = '', username = '', dob = '', employmentType, setDraft } = useOnboardingDraft();

  // Reached either fresh (Account Start → "Start fresh") or via "Exit Demo Mode" — in the latter case an
  // unlocked demo vault already exists, so the final step re-keys it instead of calling initialize() fresh.
  const cameFromDemoExit = !!route.params?.fromDemoMode;
  useEffect(() => {
    if (cameFromDemoExit) setDraft({ fromDemoMode: true });
  }, [cameFromDemoExit, setDraft]);

  // On sync builds the username is the account handle (recovery anchor + sharing), so it's mandatory and
  // gets claimed at vault setup — so we check availability here to avoid a taken handle failing the claim.
  // On Phase-1-only builds it's cosmetic and stays optional.
  const usernameRequired = hasEntitlement('sync');
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  const age = dob ? deriveAge(dob) : null;
  const dobValid = age !== null && age >= 13 && age <= 120;
  const usernameFilled = username.trim().length > 0;
  const usernameValid = usernameRequired ? isValidUsername(username) : username === '' || isValidUsername(username);
  // Allow 'idle' (e.g. offline — the claim is best-effort) but block a known-taken or mid-check handle.
  const usernameOk = usernameValid && (!usernameRequired || (availability !== 'taken' && availability !== 'checking'));
  const canContinue = fullName.trim().length > 0 && dobValid && !!employmentType && usernameOk;

  // Debounced availability check (sync builds). State is only set inside the timeout / onChange.
  useEffect(() => {
    if (!usernameRequired || !isValidUsername(username)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setAvailability('checking');
      void checkUsername(username)
        .then((r) => !cancelled && setAvailability(r.available ? 'available' : 'taken'))
        .catch(() => !cancelled && setAvailability('idle'));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [username, usernameRequired]);

  const handleContinue = () => {
    if (canContinue) navigation.navigate('LifeHousehold');
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
      <OnboardingBack to="SimulatedDashboard" />
      <ScrollView className="flex-1 px-6 py-10" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 w-full">
          <View className="mb-6 items-center">
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center mb-4"
              style={{ backgroundColor: theme.primary }}
            >
              <Icon name="ti-user-heart" size={28} color="#fff" />
            </View>
            <Text className="text-2xl font-semibold text-primary mb-2 text-center">Let us know you</Text>
            <Text className="text-secondary text-sm text-center">
              A few details so Penny can personalise your numbers. This stays on your device.
            </Text>
          </View>

          <View className="gap-4">
            <View>
              <TextInput
                label="Full name"
                required
                value={fullName}
                onChange={(v) => setDraft({ fullName: v })}
                placeholder="e.g. Aarav Sharma"
              />
              <WhereCaption icon="ti-device-mobile" color={theme.primary}>
                Stays on this device, encrypted — never sent to our servers.
              </WhereCaption>
            </View>

            <View>
              <TextInput
                label={usernameRequired ? 'Username' : 'Username (optional)'}
                required={usernameRequired}
                value={username}
                onChange={(v) => {
                  setDraft({ username: v.toLowerCase() });
                  setAvailability('idle');
                }}
                placeholder="e.g. aarav_s"
                error={
                  usernameFilled && !usernameValid
                    ? '3–20 lowercase letters, numbers, or _'
                    : usernameRequired && availability === 'taken'
                      ? 'That handle is taken — try another'
                      : undefined
                }
                hint={
                  usernameRequired
                    ? availability === 'checking'
                      ? 'Checking availability…'
                      : availability === 'available'
                        ? '✓ Available'
                        : 'Your unique handle — how others find you for sharing, and how you recover your account.'
                    : "You'll confirm this when you set up household sharing later."
                }
              />
              <WhereCaption icon="ti-world" color={theme.warning}>
                Public — how others find you for sharing, and how you recover your account.
              </WhereCaption>
            </View>

            <View>
              <TextInput
                label="Date of birth"
                required
                value={dob}
                onChange={(v) => setDraft({ dob: v })}
                placeholder="YYYY-MM-DD"
                error={dob && !dobValid ? 'Enter a valid date of birth' : undefined}
              />
              <Text className="text-[11px] text-tertiary mt-1 leading-relaxed">
                Used for your FIRE target, EPF/NPS projections, and the right tax slab. Only a 5-year age band is ever
                shared with Chip.
              </Text>
              <WhereCaption icon="ti-device-mobile" color={theme.primary}>
                Encrypted on-device. Only ever leaves as a 5-year age band.
              </WhereCaption>
            </View>

            <View>
              <Text className="text-sm font-medium text-secondary mb-1.5">
                What do you do? <Text className="text-danger">*</Text>
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {EMPLOYMENT_OPTIONS.map((o) => (
                  <View key={o.value} style={{ width: '48%' }}>
                    <OptionButton
                      label={o.label}
                      icon={o.icon}
                      compact
                      selected={employmentType === o.value}
                      onPress={() => setDraft({ employmentType: o.value })}
                    />
                  </View>
                ))}
              </View>
              <Text className="text-[11px] text-tertiary mt-1.5">
                Tailors EPF visibility, tax deductions, and your health benchmarks.
              </Text>
              <WhereCaption icon="ti-device-mobile" color={theme.primary}>
                Stays on this device, encrypted — never sent to our servers.
              </WhereCaption>
            </View>
          </View>

          <View className="mt-8">
            <Button variant="primary" size="lg" fullWidth disabled={!canContinue} onPress={handleContinue}>
              Continue
            </Button>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
