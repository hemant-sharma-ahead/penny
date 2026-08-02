import { useState } from 'react';
import { View, Pressable, ScrollView, Text, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Card, TextInput, Button, ConfirmDialog } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { importBackup } from '@/core/backup/backupManager';
import { googleDriveBackup, isCloudBackupConfigured } from '@/core/backup/cloudBackup';
import { wipeAllData } from '@/core/crypto/securityManager';
import { deregisterAccount, getClaimState } from '@/core/identity/claim';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { notifyAuthShouldRecheck } from '~/navigation/authRecheckBus';
import { AutoBackupCard } from './AutoBackupCard';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { tint } from '~/lib/color';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';

type ImportState = 'idle' | 'importing' | 'done' | 'error';
type CloudRestoreState = 'idle' | 'restoring' | 'error';

/**
 * RN port of apps/web-react/src/features/backup/BackupPage.tsx. Only 3 cards now — Automatic backup,
 * Restore from backup, Reset Penny — after consolidating away the standalone Export backup and Back up
 * to Google Drive cards 2026-07-27 (they duplicated what AutoBackupCard's tabs already did; see
 * docs/DESIGN_GUIDELINES.md §1 "One capability, one control"). Restore keeps two sources: a picked
 * .penny file, or (once Drive is configured) the latest Drive backup directly.
 *
 * Platform notes:
 * - Import: web's `<input type=file>` + `file.text()` → `expo-document-picker` (works on web — its own
 *   `.web.js` build wraps a real `<input type=file>` and returns a genuine web `File` at
 *   `asset.file`, per its own types) read via that `File`'s native `.text()`, no `expo-file-system`
 *   involved (its web build is a no-op stub — `new File(uri)` throws there). True native reads the
 *   picked URI via `expo-file-system`'s `File.text()`, same pattern as `~/features/import/UploadStep.tsx`
 *   and onboarding's `AccountRecoveryScreen`.
 * - Post-import/-reset: web does a full page reload so its router's `AuthGuard` re-evaluates; RN has no
 *   equivalent, so both use `notifyAuthShouldRecheck()` instead (same precedent as `ChangePinPage`'s
 *   `'wiped'` case).
 */
export function BackupPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  useDefaultHeaderBack('Backup');

  // ── Import ──────────────────────────────────────────────────────────────────
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [importState, setImportState] = useState<ImportState>('idle');
  const [importError, setImportError] = useState('');

  async function pickFile() {
    // RN Web: mixing a specific MIME type with the '*/*' wildcard confuses the browser's native file
    // dialog into greying out .penny files (they don't map to any registered MIME type) — found
    // 2026-07-27. web-react avoids this entirely with an extension-based accept (`.penny,application/
    // json`); DocumentPicker's `type` has no extension option, so '*/*' alone (no filter at all) is the
    // reliable fix on that platform specifically. True native's MIME-based filtering is unaffected.
    const result = await DocumentPicker.getDocumentAsync({
      type: Platform.OS === 'web' ? '*/*' : ['application/json', '*/*'],
      copyToCacheDirectory: true
    });
    if (result.canceled || !result.assets?.[0]) return;
    setSelectedFile(result.assets[0]);
    setImportError('');
    setImportState('idle');
  }

  async function handleImport() {
    if (!selectedFile || !passphrase) return;
    setImportState('importing');
    setImportError('');
    try {
      // On RN Web, expo-document-picker's own web build hands back a real browser File at
      // `asset.file` (its `.text()` works natively) — expo-file-system's `File` class doesn't work on
      // web at all (its web build is a no-op stub), so this must not touch it on that platform.
      const text =
        Platform.OS === 'web' && selectedFile.file
          ? await selectedFile.file.text()
          : await new File(selectedFile.uri).text();
      await importBackup(text, passphrase);
      setImportState('done');
      setTimeout(() => notifyAuthShouldRecheck(), 1200);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Restore failed');
      setImportState('error');
    }
  }

  // ── Restore from Google Drive (alongside file-restore above) ─────────────────
  const cloudEnabled = isCloudBackupConfigured() && hasEntitlement('cloud_backup');
  const [cloudRestoreState, setCloudRestoreState] = useState<CloudRestoreState>('idle');
  const [cloudError, setCloudError] = useState('');

  async function handleCloudRestore() {
    if (!passphrase) {
      setCloudError('Enter your passphrase above first.');
      setCloudRestoreState('error');
      return;
    }
    setCloudRestoreState('restoring');
    setCloudError('');
    try {
      const text = await googleDriveBackup.fetchLatest();
      if (!text) {
        setCloudError('No Penny backup found in your Drive.');
        setCloudRestoreState('error');
        return;
      }
      await importBackup(text, passphrase);
      notifyAuthShouldRecheck();
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Restore failed');
      setCloudRestoreState('error');
    }
  }

  // ── Full reset ────────────────────────────────────────────────────────────────
  const [showReset, setShowReset] = useState(false);
  const [orphanWarnUser, setOrphanWarnUser] = useState<string | null>(null);

  async function performWipe() {
    setOrphanWarnUser(null);
    await wipeAllData();
    notifyAuthShouldRecheck();
  }

  async function handleReset() {
    setShowReset(false);
    const claim = await getClaimState();
    if (!claim.claimed) {
      await performWipe();
      return;
    }
    try {
      await deregisterAccount();
      await performWipe();
    } catch {
      setOrphanWarnUser(claim.username ?? '');
    }
  }

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <ScrollView>
        <View className="px-4 pt-4 pb-6 gap-5">
          <AutoBackupCard />

          <Card padding="lg" className="gap-4">
            <View className="flex-row items-start gap-3">
              <View
                className="w-10 h-10 rounded-xl items-center justify-center"
                style={{ backgroundColor: tint(theme.warning, 10) }}
              >
                <Icon name="ti-cloud-upload" size={20} color={theme.warning} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-primary">Restore from backup</Text>
                <Text className="text-xs mt-0.5 leading-relaxed text-tertiary">
                  Select a .penny file{cloudEnabled ? ', or restore straight from Google Drive' : ''} and enter your
                  passphrase. Your current data will be replaced. Afterward, unlock with the PIN that was active when
                  this backup was created — not necessarily this device's current one.
                </Text>
              </View>
            </View>

            <View>
              <Text className="text-xs font-medium text-secondary">Backup file</Text>
              <Pressable
                onPress={() => void pickFile()}
                className="mt-1.5 w-full rounded-xl border border-theme bg-surface-2 px-3 py-2.5 flex-row items-center gap-2"
              >
                <Icon name="ti-file" size={16} color={theme.textTertiary} />
                <Text className="text-sm" style={{ color: selectedFile ? theme.textPrimary : theme.textTertiary }}>
                  {selectedFile?.name ?? 'Choose .penny file…'}
                </Text>
              </Pressable>
            </View>

            <TextInput
              label="Passphrase"
              secureTextEntry
              value={passphrase}
              onChange={setPassphrase}
              placeholder="Your original passphrase"
            />

            {importState === 'done' && (
              <View
                className="flex-row items-center gap-2 rounded-xl px-3 py-2"
                style={{ backgroundColor: tint(theme.success, 10) }}
              >
                <Icon name="ti-circle-check" size={16} color={theme.success} />
                <Text className="text-xs font-medium" style={{ color: theme.success }}>
                  Restored — relocking session…
                </Text>
              </View>
            )}
            {importState === 'error' ? (
              <Text className="text-xs" style={{ color: theme.danger }}>
                {importError}
              </Text>
            ) : null}
            {cloudRestoreState === 'error' ? (
              <Text className="text-xs" style={{ color: theme.danger }}>
                {cloudError}
              </Text>
            ) : null}

            <Button
              variant="primary"
              fullWidth
              onPress={() => setShowConfirm(true)}
              disabled={!selectedFile || !passphrase || importState === 'importing' || importState === 'done'}
              loading={importState === 'importing'}
            >
              {importState === 'importing' ? 'Restoring…' : 'Restore backup'}
            </Button>

            {cloudEnabled && (
              <Button
                variant="secondary"
                fullWidth
                onPress={() => void handleCloudRestore()}
                disabled={!passphrase}
                loading={cloudRestoreState === 'restoring'}
              >
                Restore from Google Drive
              </Button>
            )}
          </Card>

          <Card padding="lg" className="gap-4">
            <View className="flex-row items-start gap-3">
              <View
                className="w-10 h-10 rounded-xl items-center justify-center"
                style={{ backgroundColor: tint(theme.danger, 10) }}
              >
                <Icon name="ti-alert-triangle" size={20} color={theme.danger} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-primary">Reset Penny</Text>
                <Text className="text-xs mt-0.5 leading-relaxed text-tertiary">
                  Erases everything on this device and returns to onboarding. There is no recovery unless you have a
                  backup.
                </Text>
              </View>
            </View>
            <Button variant="danger" fullWidth onPress={() => setShowReset(true)}>
              Erase all data
            </Button>
          </Card>
        </View>
      </ScrollView>

      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => void handleImport()}
        title="Replace all data?"
        message="All current data — expenses, goals, portfolio, and settings — will be permanently replaced with the contents of the backup file. This cannot be undone."
        confirmLabel="Yes, restore"
        confirmVariant="danger"
        loading={importState === 'importing'}
      />

      <ConfirmDialog
        isOpen={showReset}
        onClose={() => setShowReset(false)}
        onConfirm={() => void handleReset()}
        title="Erase everything?"
        message="All data on this device — expenses, goals, portfolio, settings, and your encryption keys — will be permanently deleted and you'll return to onboarding. This cannot be undone."
        confirmLabel="Erase all data"
        confirmVariant="danger"
      />

      <ConfirmDialog
        isOpen={orphanWarnUser !== null}
        onClose={() => setOrphanWarnUser(null)}
        onConfirm={() => void performWipe()}
        title="Couldn't release your username"
        message={`We couldn't reach the server to free ${
          orphanWarnUser ? `@${orphanWarnUser}` : 'your username'
        }. If you erase now, it may stay reserved to this account and can't be reclaimed later without restoring a backup. Try again when you're online, or erase anyway.`}
        confirmLabel="Erase anyway"
        confirmVariant="danger"
      />
    </SafeAreaView>
  );
}
