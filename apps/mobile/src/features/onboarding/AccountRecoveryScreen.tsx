import { useState } from 'react';
import { View, ScrollView, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { importBackup } from '@/core/backup/backupManager';
import { googleDriveBackup, isCloudBackupConfigured } from '@/core/backup/cloudBackup';
import { initialize, isWeakPin, wipeAllData } from '@/core/crypto/securityManager';
import { EncryptedRepository } from '@/core/db/repository';
import { db } from '@/core/db/schema';
import type { Profile } from '@/core/db/types';
import { reclaimAccount, ReclaimError } from '@/core/identity/claim';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { isValidUsername } from '@/core/profile/username';
import { Button, TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { setItem } from '~/lib/storage';
import { notifyAuthShouldRecheck } from '~/navigation/authRecheckBus';
import type { OnboardingStackParamList } from '~/navigation/OnboardingNavigator';
import { OnboardingBack } from './OnboardingBack';

export type AccountTab = 'new' | 'restore' | 'reclaim';

// Set before a restore so the post-unlock reconciler re-verifies the identity against the server and,
// if the account was deregistered and the handle got taken, prompts for a new one. See IdentityReconciler.
export const RECONCILE_FLAG = 'penny_reconcile_identity';

const TABS: { id: AccountTab; label: string }[] = [
  { id: 'new', label: 'Start fresh' },
  { id: 'restore', label: 'Restore' },
  { id: 'reclaim', label: 'Reclaim' }
];

/**
 * Screen B of the account-start flow (Track F). One screen, three tabs — new / restore / reclaim — with
 * the tab chosen on Screen A pre-selected. Restore brings everything back (no re-claim, no seed); reclaim
 * recovers the handle via passphrase (F3); "start fresh" continues into the new-user setup.
 *
 * Platform notes vs. web:
 * - `<input type=file>` + `file.text()` → `expo-document-picker`'s `getDocumentAsync` + `expo-file-
 *   system`'s `new File(uri).text()` (new native dep for this pass — not previously used anywhere in
 *   the mobile app).
 * - `localStorage.setItem(RECONCILE_FLAG, '1')` → `~/lib/storage`'s async `setItem` (AsyncStorage).
 * - `window.location.href = PATHS.app.home` (a full reload, so web's own AuthGuard equivalent re-runs)
 *   → `notifyAuthShouldRecheck()` (see `authRecheckBus.ts`) — the RN-native way to make `AuthGuard`
 *   re-check and swap in `MainTabs` once a restore/reclaim finishes.
 */
export function AccountRecoveryScreen() {
  const theme = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const route = useRoute<RouteProp<OnboardingStackParamList, 'Account'>>();
  const initialTab = route.params?.tab ?? 'new';
  const [tab, setTab] = useState<AccountTab>(initialTab);

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
      <OnboardingBack to="Start" />
      <ScrollView className="flex-1 px-6 py-10" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 w-full">
          <View className="mb-6 items-center">
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center mb-4"
              style={{ backgroundColor: theme.primary }}
            >
              <Icon name={tab === 'new' ? 'ti-sparkles' : 'ti-user-shield'} size={28} color="#fff" />
            </View>
            <Text className="text-2xl font-semibold text-primary mb-1 text-center">
              {tab === 'new' ? 'Set up your account' : 'Welcome back'}
            </Text>
            <Text className="text-sm text-secondary text-center">
              {tab === 'new'
                ? 'Create a new account in a couple of steps.'
                : 'Restore everything, or reclaim your handle.'}
            </Text>
          </View>

          {/* Segmented tabs */}
          <View className="flex-row bg-surface-2 border border-theme rounded-xl p-1 gap-1 mb-5">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTab(t.id)}
                  className={`flex-1 items-center py-2 rounded-lg ${active ? 'bg-surface' : ''}`}
                >
                  <Text
                    className="text-[13px] font-semibold"
                    style={{ color: active ? theme.primary : theme.textSecondary }}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {tab === 'new' && <NewTab onContinue={() => navigation.navigate('LetUsKnowYou')} />}
          {tab === 'restore' && <RestoreTab />}
          {tab === 'reclaim' && <ReclaimTab />}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function NewTab({ onContinue }: { onContinue: () => void }) {
  return (
    <View>
      <Text className="text-sm text-secondary leading-relaxed mb-6">
        We'll ask for a few basics, then set your passphrase and PIN to create your encrypted vault. Nothing leaves your
        device.
      </Text>
      <Button variant="primary" size="lg" fullWidth onPress={onContinue}>
        Continue
      </Button>
    </View>
  );
}

function RestoreTab() {
  const theme = useThemeColors();
  const cloudEnabled = isCloudBackupConfigured() && hasEntitlement('cloud_backup');
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState<null | 'file' | 'cloud'>(null);
  const [error, setError] = useState('');

  async function goToApp() {
    // Flag a post-unlock identity reconcile (handle may have been taken if the account was deregistered).
    await setItem(RECONCILE_FLAG, '1');
    notifyAuthShouldRecheck();
  }

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', '*/*'],
      copyToCacheDirectory: true
    });
    if (result.canceled || !result.assets?.[0]) return;
    setFileUri(result.assets[0].uri);
    setFileName(result.assets[0].name);
  }

  async function restoreFromFile() {
    if (!fileUri || !passphrase || busy) return;
    setBusy('file');
    setError('');
    try {
      const text = await new File(fileUri).text();
      await importBackup(text, passphrase);
      await goToApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
      setBusy(null);
    }
  }

  async function restoreFromCloud() {
    if (!passphrase || busy) return;
    setBusy('cloud');
    setError('');
    try {
      const text = await googleDriveBackup.fetchLatest();
      if (!text) {
        setError('No Penny backup found in your Drive.');
        setBusy(null);
        return;
      }
      await importBackup(text, passphrase);
      await goToApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
      setBusy(null);
    }
  }

  return (
    <View>
      <TextInput
        label="Passphrase"
        secureTextEntry
        value={passphrase}
        onChange={setPassphrase}
        placeholder="Your backup passphrase"
      />

      <View className="mt-4 gap-3">
        {cloudEnabled && (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            icon="ti-brand-google-drive"
            disabled={!passphrase || busy !== null}
            loading={busy === 'cloud'}
            onPress={() => void restoreFromCloud()}
          >
            Restore from Google Drive
          </Button>
        )}
        <Button
          variant={cloudEnabled ? 'secondary' : 'primary'}
          size="lg"
          fullWidth
          icon="ti-file-upload"
          onPress={() => void pickFile()}
        >
          {fileName ?? 'Choose a backup file'}
        </Button>
        {fileUri && (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!passphrase || busy !== null}
            loading={busy === 'file'}
            onPress={() => void restoreFromFile()}
          >
            Restore from file
          </Button>
        )}
      </View>

      {error && <Text className="text-danger text-sm mt-4 text-center">{error}</Text>}
      <View
        className="mt-4 flex-row items-start gap-2 rounded-xl px-3 py-2.5"
        style={{ backgroundColor: tint(theme.info, 12) }}
      >
        <Icon name="ti-info-circle" size={14} color={theme.info} />
        <Text className="text-xs text-secondary flex-1">
          Restores your profile, data, groups &amp; handle. If your handle was taken while you were away, we'll ask you
          to pick a new one — your data stays safe.
        </Text>
      </View>
    </View>
  );
}

function ReclaimTab() {
  const theme = useThemeColors();
  const [username, setUsername] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pinTooWeak = pin.length === 6 && isWeakPin(pin);
  const canSubmit =
    isValidUsername(username) &&
    passphrase.length > 0 &&
    pin.length === 6 &&
    !pinTooWeak &&
    pin === confirmPin &&
    !busy;

  async function handleReclaim() {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    let vaultCreated = false;
    try {
      await initialize(passphrase, pin);
      vaultCreated = true;
      const now = Date.now();
      const repo = new EncryptedRepository<Profile>(db.profile as never);
      await repo.put({
        id: crypto.randomUUID(),
        displayName: '',
        currency: 'INR',
        locale: 'en-IN',
        onboardingComplete: true,
        userId: crypto.randomUUID(), // placeholder — reclaimAccount swaps in the recovered userId
        username,
        plan: 'free',
        createdAt: now,
        updatedAt: now
      });
      await reclaimAccount(username, passphrase);
      notifyAuthShouldRecheck();
    } catch (err) {
      if (vaultCreated) await wipeAllData().catch(() => undefined);
      setError(
        err instanceof ReclaimError ? err.message : 'Reclaim failed. Check your handle and passphrase, then retry.'
      );
      setBusy(false);
    }
  }

  return (
    <View className="gap-3">
      <TextInput
        label="Username"
        value={username}
        onChange={(v) => setUsername(v.toLowerCase())}
        placeholder="e.g. aarav_s"
        error={username.length > 0 && !isValidUsername(username) ? '3–20 lowercase letters, numbers, or _' : undefined}
      />
      <TextInput
        label="Passphrase"
        secureTextEntry
        value={passphrase}
        onChange={setPassphrase}
        placeholder="Your original passphrase"
      />
      <TextInput
        label="New 6-digit PIN"
        secureTextEntry
        keyboardType="numeric"
        maxLength={6}
        inputClassName="text-center tracking-widest text-lg"
        value={pin}
        onChange={(v) => setPin(v.replace(/\D/g, ''))}
        placeholder="Quick unlock on this device"
        error={pinTooWeak ? 'Choose a less predictable PIN' : undefined}
      />
      <TextInput
        label="Confirm PIN"
        secureTextEntry
        keyboardType="numeric"
        maxLength={6}
        inputClassName="text-center tracking-widest text-lg"
        value={confirmPin}
        onChange={(v) => setConfirmPin(v.replace(/\D/g, ''))}
        placeholder="Repeat your PIN"
        error={confirmPin.length === 6 && pin !== confirmPin ? "PINs don't match" : undefined}
      />

      {error && <Text className="text-danger text-sm text-center">{error}</Text>}
      <Button
        variant="primary"
        size="lg"
        fullWidth
        className="mt-1"
        disabled={!canSubmit}
        loading={busy}
        onPress={() => void handleReclaim()}
      >
        {busy ? 'Reclaiming…' : 'Reclaim account'}
      </Button>
      <View
        className="flex-row items-start gap-2 rounded-xl px-3 py-2.5"
        style={{ backgroundColor: tint(theme.warning, 12) }}
      >
        <Icon name="ti-alert-triangle" size={14} color={theme.warning} />
        <Text className="text-xs text-secondary flex-1">
          Handle &amp; groups come back. Personal data &amp; group history need a backup or a re-share from a member.
        </Text>
      </View>
    </View>
  );
}
