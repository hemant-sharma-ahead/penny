import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Button } from '~/components/ui';
import { initialize } from '@/core/crypto/securityManager';
import { profileRepo } from '@/core/db/repositories';
import { claimAccount } from '@/core/identity/claim';
import { ContextSwitcher } from '~/features/groups/ContextSwitcher';
import { HomePage } from '~/features/home/HomePage';
import { ExpensesPage } from '~/features/expenses/ExpensesPage';

/**
 * Scratch verification tool for the Groups port — NOT wired into real navigation permanently.
 * Replicates ClaimSmokeTestScreen's minimal vault+profile+claim setup (real onboarding doesn't exist on
 * mobile yet), then renders ContextSwitcher (Personal/group switching, create/join) above either
 * HomePage (which now branches to GroupDashboard when a group is active, restored HomeGroupsCard) or
 * ExpensesPage (restored ShareToGroupModal/VacationGroupLink), toggled with the tab row below.
 */
export function GroupsSmokeTestScreen() {
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'home' | 'expenses'>('home');

  const log = (s: string) => setLines((prev) => [...prev, s]);

  async function setupAndClaim() {
    setBusy(true);
    try {
      await initialize('smoke-test-passphrase-1', '123456');
      const now = Date.now();
      await profileRepo.put({
        id: crypto.randomUUID(),
        displayName: 'Smoke Test',
        currency: 'INR',
        locale: 'en-IN',
        onboardingComplete: true,
        userId: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now
      });
      log('Vault + profile created OK');
      const result = await claimAccount(`groupstest${Date.now() % 100000}`);
      log('claimAccount OK: ' + JSON.stringify(result));
    } catch (e) {
      log('Setup/claim THREW: ' + String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 bg-surface-tertiary">
      <View className="pt-16 px-4 pb-2">
        <Text className="text-lg font-bold text-primary mb-2">Groups Smoke Test</Text>
        <View className="flex-row gap-2 mb-2">
          <Button variant="secondary" onPress={() => void setupAndClaim()} disabled={busy}>
            1. Setup vault + claim
          </Button>
          <Pressable onPress={() => setLines([])}>
            <Text className="text-xs text-tertiary text-center px-2">Clear log</Text>
          </Pressable>
        </View>
        {lines.length > 0 && (
          <ScrollView className="max-h-24 mb-2">
            {lines.map((l, i) => (
              <Text key={i} className="text-xs font-mono text-secondary mb-1">
                {l}
              </Text>
            ))}
          </ScrollView>
        )}
        <View className="flex-row gap-2 mb-1">
          <Pressable onPress={() => setTab('home')} className="px-3 py-1.5 rounded-lg bg-surface-2">
            <Text className="text-xs font-semibold text-primary">Home</Text>
          </Pressable>
          <Pressable onPress={() => setTab('expenses')} className="px-3 py-1.5 rounded-lg bg-surface-2">
            <Text className="text-xs font-semibold text-primary">Expenses</Text>
          </Pressable>
        </View>
      </View>
      <ContextSwitcher />
      <View className="flex-1">{tab === 'home' ? <HomePage /> : <ExpensesPage />}</View>
    </View>
  );
}
