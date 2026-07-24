import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { TextInput, Button } from '~/components/ui';
import { initialize } from '@/core/crypto/securityManager';
import { profileRepo } from '@/core/db/repositories';
import { claimAccount, checkUsername, getClaimState } from '@/core/identity/claim';
import { signedFetch } from '@/core/identity/signedFetch';
import { ensureIdentityKeys, getPublicJwks } from '@/core/crypto/identityKeys';

/**
 * Scratch verification tool (Track C prerequisite) — NOT wired into real navigation permanently.
 * Since claim.ts requires an existing profile.userId + an unlocked DMK session (normally set up by
 * onboarding, which doesn't exist on mobile yet), this screen replicates the minimal subset of
 * SetupCredentialsScreen's web onboarding flow (securityManager.initialize + a bare profile record)
 * so the real claim/signedFetch code can be exercised against the live penny-auth worker.
 */
export function ClaimSmokeTestScreen() {
  const [lines, setLines] = useState<string[]>([]);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);

  const log = (s: string) => setLines((prev) => [...prev, s]);

  async function setupVault() {
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
    } catch (e) {
      log('Vault setup THREW: ' + String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runEnsureIdentityKeys() {
    setBusy(true);
    try {
      await ensureIdentityKeys();
      log('ensureIdentityKeys OK');
      const jwks = await getPublicJwks();
      log('getPublicJwks: ' + (jwks ? 'OK' : 'undefined'));
    } catch (e) {
      log('ensureIdentityKeys THREW: ' + String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runCheckUsername() {
    setBusy(true);
    try {
      const result = await checkUsername(username);
      log(`checkUsername("${username}"): ${JSON.stringify(result)}`);
    } catch (e) {
      log('checkUsername THREW: ' + String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runClaim() {
    setBusy(true);
    try {
      const result = await claimAccount(username || undefined);
      log('claimAccount OK: ' + JSON.stringify(result));
      const state = await getClaimState();
      log('getClaimState: ' + JSON.stringify(state));
    } catch (e) {
      log('claimAccount THREW: ' + String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runWhoami() {
    setBusy(true);
    try {
      const res = await signedFetch('/whoami');
      const body = await res.text();
      log(`signedFetch /whoami: ${res.status} ${body}`);
    } catch (e) {
      log('signedFetch THREW: ' + String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 bg-surface-tertiary pt-16 px-4">
      <Text className="text-lg font-bold text-primary mb-3">Claim Smoke Test</Text>
      <View className="gap-2 mb-3">
        <Button variant="secondary" onPress={setupVault} disabled={busy}>
          1. Setup vault + profile
        </Button>
        <Button variant="secondary" onPress={runEnsureIdentityKeys} disabled={busy}>
          1b. ensureIdentityKeys
        </Button>
        <TextInput label="Username" value={username} onChange={setUsername} placeholder="e.g. testuser123" />
        <Button variant="secondary" onPress={runCheckUsername} disabled={busy}>
          2. Check username
        </Button>
        <Button variant="primary" onPress={runClaim} disabled={busy}>
          3. Claim account
        </Button>
        <Button variant="secondary" onPress={runWhoami} disabled={busy}>
          4. signedFetch /whoami
        </Button>
        <Pressable onPress={() => setLines([])}>
          <Text className="text-xs text-tertiary text-center">Clear log</Text>
        </Pressable>
      </View>
      <ScrollView className="flex-1">
        {lines.map((l, i) => (
          <Text key={i} className="text-xs font-mono text-secondary mb-1">
            {l}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}
