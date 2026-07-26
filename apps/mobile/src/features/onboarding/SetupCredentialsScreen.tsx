import { useState } from 'react';
import { View, ScrollView, TextInput as RNTextInput, Pressable, ActivityIndicator, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { exitDemoMode, initialize, isWeakPin } from '@/core/crypto/securityManager';
import { EncryptedRepository } from '@/core/db/repository';
import { db } from '@/core/db/schema';
import { accountsRepo } from '@/core/db/repositories';
import { ACCOUNT_TYPE_META } from '@/core/accounts/meta';
import { claimAccount } from '@/core/identity/claim';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import type { Account, Profile } from '@/core/db/types';
import { usePassphraseStrength } from '@/hooks/usePassphraseStrength';
import { Button, TextInput, FormField, PassphraseStrengthMeter } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useOnboardingDraft } from '~/context/OnboardingDraftContext';
import { notifyAuthShouldRecheck } from '~/navigation/authRecheckBus';
import { navigationRef } from '~/navigation/navigationRef';
import { OnboardingBack } from './OnboardingBack';
import { useRedirectIfOnboarded } from './useRedirectIfOnboarded';

/**
 * The final "real vault" step — reached either fresh (Account Start → "Start fresh" → Let us know you →
 * …) or via Exit Demo Mode. Same fields/flow either way, per design: a brand-new user never sees a
 * "current credential" prompt. Under the hood the two paths diverge — fresh calls initialize(); exiting
 * Demo Mode re-keys the already-unlocked demo vault via exitDemoMode(), which also makes the demo
 * PIN/passphrase stop working immediately (old wrapping deleted, same as any other re-wrap).
 *
 * This is the screen that finally sets a real Data Master Key on a real device via a real UI — every
 * prior on-device module test hit "Session locked" before reaching this point (see
 * `~/screens/ClaimSmokeTestScreen.tsx`'s scratch version, which this supersedes for everyday use).
 *
 * Platform note: web navigates to `PATHS.app.backup` when Google Drive was chosen as the backup
 * destination, else `PATHS.app.home` — mirrored below via `navigationRef` once `MainNavigator` remounts
 * post-`notifyAuthShouldRecheck()` (found stale via the 2026-07-25 parity sweep: `BackupPage` has
 * existed since Track 4's feature-folder gap closure, this just never routed to it). Actually
 * *connecting* Drive is still a real gap on native (`googleDriveProvider.native.ts` is dormant, same
 * "no config yet" shape as `icloudProvider.ts`) — landing on `BackupPage` at least shows that honestly,
 * same as `BackupSetupScreen` already does, rather than silently dropping the choice on the floor.
 */
export function SetupCredentialsScreen() {
  const draft = useOnboardingDraft();
  const [passphrase, setPassphrase] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const theme = useThemeColors();
  // Legitimate to reach this screen with onboarding already "complete" only via Exit Demo Mode
  // (the demo vault counts as complete) — any other stray arrival with an existing vault bounces away.
  const checking = useRedirectIfOnboarded(!!draft.fromDemoMode);

  const { score } = usePassphraseStrength(passphrase);

  const pinMismatch = confirmPin.length === 6 && pin !== confirmPin;
  const pinTooWeak = pin.length === 6 && isWeakPin(pin);
  const canProceed = score >= 3 && pin.length === 6 && !pinTooWeak && pin === confirmPin && !loading;

  async function writeProfileAndAccounts() {
    const now = Date.now();
    const repo = new EncryptedRepository<Profile>(db.profile as never);

    // Exiting Demo Mode: the profile record already exists (written blank by DemoVaultScreen) — update
    // it in place rather than creating a second one. Fresh setup: create it now, same as always.
    const existing = draft.fromDemoMode ? (await repo.getAll())[0] : undefined;
    await repo.put({
      id: existing?.id ?? crypto.randomUUID(),
      displayName: draft.fullName?.trim() ?? '',
      currency: 'INR',
      locale: 'en-IN',
      onboardingComplete: true,
      userId: existing?.userId ?? crypto.randomUUID(),
      username: draft.username || undefined,
      dob: draft.dob || undefined,
      employmentType: draft.employmentType,
      maritalStatus: draft.maritalStatus,
      children: draft.children?.length ? draft.children : undefined,
      homeOwner: draft.homeOwner,
      riskAppetite: draft.riskAppetite,
      plan: 'free',
      demoSeeded: false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });

    for (const acc of draft.accountsToCreate ?? []) {
      const meta = ACCOUNT_TYPE_META[acc.type];
      const account: Account = {
        id: crypto.randomUUID(),
        name: acc.name,
        type: acc.type,
        openingBalance: acc.openingBalance,
        color: meta.color,
        icon: meta.icon,
        includeInNetWorth: acc.type !== 'credit_card',
        isArchived: false,
        createdAt: now,
        updatedAt: now
      };
      await accountsRepo.put(account);
    }

    // Claim the chosen handle on the server so the account is real from the start (sync builds) — sets
    // deviceId + uploads the recovery verifier, so Groups work immediately. Best-effort: offline just
    // defers it (Profile shows a Claim button). Availability was checked on the Let us know you screen.
    if (hasEntitlement('sync') && draft.username) {
      await claimAccount(draft.username).catch(() => undefined);
    }
  }

  const handleCreate = async () => {
    if (!canProceed) return;
    setLoading(true);
    setError('');
    try {
      if (draft.fromDemoMode) {
        const result = await exitDemoMode(passphrase, pin);
        if (result !== 'ok') {
          setError('Setup failed. Please try again.');
          setLoading(false);
          return;
        }
      } else {
        await initialize(passphrase, pin);
      }
      await writeProfileAndAccounts();
      notifyAuthShouldRecheck();
      if (draft.backupChoice === 'google-drive') {
        // `MainNavigator` remounts fresh once `AuthGuard` re-checks and transitions to 'ready' — poll
        // briefly for `navigationRef` to attach rather than assuming it's ready synchronously.
        let attempts = 0;
        const tryNavigate = () => {
          if (navigationRef.isReady()) {
            navigationRef.navigate('Backup');
          } else if (attempts++ < 20) {
            setTimeout(tryNavigate, 100);
          }
        };
        setTimeout(tryNavigate, 100);
      }
    } catch {
      setError('Setup failed. Please try again.');
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color="#00a86b" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
      <OnboardingBack to="BackupSetup" />
      <ScrollView className="flex-1 px-6 py-10" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 w-full">
          <View className="mb-8 items-center">
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center mb-4"
              style={{ backgroundColor: theme.primary }}
            >
              <Icon name="ti-lock-square" size={28} color="#fff" />
            </View>
            <Text className="text-2xl font-semibold text-primary mb-2 text-center">Set up your vault</Text>
            <Text className="text-sm text-secondary text-center">
              This is the one that matters — a random key encrypts everything, and your passphrase is the only way to
              recover it.
            </Text>
          </View>

          {/* Passphrase */}
          <View className="mb-5">
            <FormField
              label="Passphrase"
              hint="Your master key — it locks everything and is the only way to recover your data. Make it strong and memorable."
            >
              <View className="relative flex-row items-center">
                <RNTextInput
                  value={passphrase}
                  onChangeText={setPassphrase}
                  secureTextEntry={!showPassphrase}
                  placeholder="Use a phrase you'll remember"
                  placeholderTextColor={theme.textTertiary}
                  className="bg-surface-2 text-primary border w-full rounded-xl px-4 py-3 pr-10 text-sm"
                  style={{ borderColor: theme.border }}
                />
                <Pressable
                  onPress={() => setShowPassphrase((v) => !v)}
                  accessibilityLabel={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
                  className="absolute right-3"
                >
                  <Icon name={showPassphrase ? 'ti-eye-off' : 'ti-eye'} size={18} color={theme.textTertiary} />
                </Pressable>
              </View>
            </FormField>

            {passphrase.length > 0 && <PassphraseStrengthMeter score={score} />}

            <View className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mt-3">
              <Text className="text-xs leading-relaxed" style={{ color: '#d97706' }}>
                <Text className="font-semibold">Important:</Text> If you forget your passphrase, your data can't be
                recovered — there's no backdoor or key escrow, by design. Write it down somewhere safe.
              </Text>
            </View>
          </View>

          {/* PIN */}
          <View className="mb-1">
            <TextInput
              label="6-digit PIN"
              secureTextEntry
              keyboardType="numeric"
              maxLength={6}
              inputClassName="text-center tracking-widest text-lg"
              value={pin}
              onChange={(v) => setPin(v.replace(/\D/g, ''))}
              placeholder="For quick unlock"
              error={pinTooWeak ? 'Choose a less predictable PIN' : undefined}
            />
          </View>
          <Text className="text-xs text-tertiary mb-4">
            A quick shortcut to unlock on this device — your passphrase stays your real protection.
          </Text>

          {/* Confirm PIN */}
          <View className="mb-6">
            <TextInput
              label="Confirm PIN"
              secureTextEntry
              keyboardType="numeric"
              maxLength={6}
              inputClassName="text-center tracking-widest text-lg"
              value={confirmPin}
              onChange={(v) => setConfirmPin(v.replace(/\D/g, ''))}
              placeholder="Repeat your PIN"
              error={pinMismatch ? "PINs don't match" : undefined}
            />
          </View>

          {error && <Text className="text-danger text-sm mb-4 text-center">{error}</Text>}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canProceed}
            loading={loading}
            onPress={() => void handleCreate()}
          >
            {loading ? 'Encrypting your vault…' : 'Create my vault'}
          </Button>

          <Text className="text-xs text-tertiary text-center mt-3">
            Setup runs 600,000 rounds of key derivation on your passphrase — that's why it takes a moment.
          </Text>
          <Text className="text-xs text-tertiary text-center mt-2">
            You can change your passphrase or PIN anytime in Settings — it re-locks your data instantly, without
            re-encrypting it.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
