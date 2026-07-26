import { useState } from 'react';
import { View, ScrollView, ActivityIndicator, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Banner } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { DEMO_PASSPHRASE, DEMO_PIN, initialize } from '@/core/crypto/securityManager';
import { EncryptedRepository } from '@/core/db/repository';
import { db } from '@/core/db/schema';
import { seedDemoData } from '@/core/db/seedDemoData';
import type { Profile } from '@/core/db/types';
import { notifyAuthShouldRecheck } from '~/navigation/authRecheckBus';
import { OnboardingBack } from './OnboardingBack';
import { useRedirectIfOnboarded } from './useRedirectIfOnboarded';

/**
 * A known, shown, throwaway vault — lets "Explore with Demo Data" skip straight into a fully-populated
 * app without inventing real credentials. Nothing here is ever validated (isWeakPin, strength meter):
 * it's wiped along with the sample data the moment the user exits Demo Mode (see exitDemoMode()).
 */
export function DemoVaultScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Never legitimate to re-enter this screen once any vault (real or demo) already exists.
  const checking = useRedirectIfOnboarded(false);

  async function handleContinue() {
    setLoading(true);
    setError('');
    try {
      await initialize(DEMO_PASSPHRASE, DEMO_PIN);
      const now = Date.now();
      const repo = new EncryptedRepository<Profile>(db.profile as never);
      await repo.put({
        id: crypto.randomUUID(),
        displayName: '',
        currency: 'INR',
        locale: 'en-IN',
        onboardingComplete: true,
        userId: crypto.randomUUID(),
        plan: 'free',
        createdAt: now,
        updatedAt: now
      });
      await seedDemoData();
      notifyAuthShouldRecheck();
    } catch {
      setError('Something went wrong setting up the demo. Please try again.');
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color="#00a86b" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
      <OnboardingBack to="SimulatedDashboard" />
      <ScrollView className="flex-1 px-6 py-10" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 w-full">
          <View className="mb-6 items-center">
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center mb-4"
              style={{ backgroundColor: '#7c3aed' }}
            >
              <Icon name="ti-flask" size={28} color="#fff" />
            </View>
            <Text className="text-2xl font-semibold text-primary mb-2 text-center">You're exploring in Demo Mode</Text>
            <Text className="text-secondary text-sm text-center">
              We've set a temporary PIN and passphrase just so the sample data can be encrypted like the real thing.
            </Text>
          </View>

          <View className="gap-3 mb-4">
            <View className="bg-surface-2 border border-theme rounded-xl px-4 py-3">
              <Text className="text-xs font-medium text-tertiary uppercase tracking-wide mb-1">Temporary PIN</Text>
              <Text className="text-sm font-mono font-semibold text-primary tracking-widest">{DEMO_PIN}</Text>
            </View>
            <View className="bg-surface-2 border border-theme rounded-xl px-4 py-3">
              <Text className="text-xs font-medium text-tertiary uppercase tracking-wide mb-1">
                Temporary passphrase
              </Text>
              <Text className="text-sm font-mono font-semibold text-primary">{DEMO_PASSPHRASE}</Text>
            </View>
          </View>

          <Banner variant="info" className="mb-6">
            Nothing here is real. You'll choose your own PIN and passphrase when you're ready to use Penny for real —
            this one is cleared along with the sample data.
          </Banner>

          {error && <Text className="text-danger text-sm mb-4 text-center">{error}</Text>}

          <Button variant="primary" size="lg" fullWidth loading={loading} onPress={() => void handleContinue()}>
            Continue exploring
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
